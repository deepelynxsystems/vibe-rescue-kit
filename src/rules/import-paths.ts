import { builtinModules } from "node:module";
import { readdirSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import type { Finding, Rule, RuleDefinition } from "../types.js";
import { defineRule, verifyFixed } from "../engine/define.js";
import { addDependency, stringifyPackage } from "../engine/package-file.js";
import { extractSpecifiers } from "../engine/text.js";
import type { Strategy } from "./types.js";

const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".vue", ".svelte"];
const BUILTINS = new Set(builtinModules.flatMap((name) => [name, name.replace(/^node:/, "")]));
const GLOBS = ["**/*.{ts,tsx,js,jsx,mjs,cjs}"];

export const importPaths: Strategy = {
  id: "import-paths",
  defaults() {
    return {
      id: "import-paths",
      title: "Broken imports and missing dependencies",
      description: "Fix import specifiers whose path casing does not match the file, and add imported packages that are missing from the nearest package.json.",
      severity: "error",
      scopeNote: "Does not run npm install. Added dependencies use * so the package manager can resolve a version.",
      strategy: "import-paths",
      watchGlobs: GLOBS,
    };
  },
  create(def) {
    return createRule(def);
  },
};

function createRule(def: RuleDefinition): Rule {
  const severity = def.severity ?? "error";
  const rule = defineRule({
    id: def.id,
    title: def.title,
    description: def.description,
    severity,
    scopeNote: def.scopeNote,
    watchGlobs: def.watchGlobs ?? GLOBS,
    async detect(ctx) {
      const packages = await ctx.glob(["**/package.json"]);
      const aliasMap = await aliasMapFor(ctx);
      const depCache = new Map<string, Set<string>>();
      const findings: Finding[] = [];
      const seenPackages = new Set<string>();
      for (const file of await ctx.glob(GLOBS)) {
        if (file.endsWith(".d.ts")) continue;
        const text = await ctx.read(file);
        const aliases = aliasesFor(file, aliasMap);
        const pkgFile = owningPackage(file, packages);
        for (const hit of extractSpecifiers(text)) {
          if (hit.spec.startsWith(".")) {
            const resolved = correctRelative(ctx.root, file, hit.spec);
            if (resolved.status === "fixed" && resolved.specifier) {
              findings.push({
                fingerprint: `import-paths:${file}:${hit.spec}:${resolved.specifier}`,
                ruleId: def.id,
                severity,
                message: `${file} imports ${hit.spec}, but the path on disk is ${resolved.specifier}.`,
                file,
                hint: "The specifier will be rewritten to the casing that exists on disk.",
                meta: { kind: "case", specifier: hit.spec, corrected: resolved.specifier },
              });
            } else if (resolved.status === "ambiguous") {
              findings.push({
                fingerprint: `import-paths:${file}:${hit.spec}:ambiguous`,
                ruleId: def.id,
                severity,
                message: `${file} imports ${hit.spec}, and more than one casing exists on disk.`,
                file,
                fixable: false,
                hint: "Rename one of the files so the import is unambiguous.",
                meta: { kind: "case", specifier: hit.spec },
              });
            }
            continue;
          }
          if (aliases.some((prefix) => hit.spec === prefix || hit.spec.startsWith(prefix))) continue;
          const name = packageName(hit.spec);
          if (!name) continue;
          const seenKey = `${pkgFile}:${name}`;
          if (seenPackages.has(seenKey)) continue;
          const have = await dependencySet(ctx, pkgFile, depCache);
          if (have.has(name)) continue;
          seenPackages.add(seenKey);
          findings.push({
            fingerprint: `import-paths:package:${pkgFile}:${name}`,
            ruleId: def.id,
            severity,
            message: `${file} imports ${name}, which is not in ${pkgFile}.`,
            file,
            hint: `${name} will be added to ${pkgFile} with version *. Run npm install afterwards.`,
            meta: { kind: "package", packageName: name, packageFile: pkgFile, dev: name.startsWith("@types/") },
          });
        }
      }
      return findings;
    },
    async fix(ctx, findings) {
      const notes: string[] = [];
      const byFile = new Map<string, Finding[]>();
      for (const finding of findings) {
        if (finding.meta?.kind !== "case" || !finding.file || typeof finding.meta.corrected !== "string") continue;
        const list = byFile.get(finding.file) ?? [];
        list.push(finding);
        byFile.set(finding.file, list);
      }
      for (const [file, group] of byFile) {
        let text = await ctx.read(file);
        const replacements = extractSpecifiers(text)
          .map((hit) => {
            const match = group.find((finding) => finding.meta?.specifier === hit.spec);
            if (!match || typeof match.meta?.corrected !== "string") return null;
            return { index: hit.specIndex, from: hit.spec, to: match.meta.corrected };
          })
          .filter((item): item is { index: number; from: string; to: string } => Boolean(item))
          .sort((a, b) => b.index - a.index);
        for (const replacement of replacements) {
          text = text.slice(0, replacement.index) + replacement.to + text.slice(replacement.index + replacement.from.length);
        }
        await ctx.write(file, text);
      }

      const packages = findings.filter((finding) => finding.meta?.kind === "package");
      const byManifest = new Map<string, Finding[]>();
      for (const finding of packages) {
        const manifest = String(finding.meta?.packageFile ?? "package.json");
        const list = byManifest.get(manifest) ?? [];
        list.push(finding);
        byManifest.set(manifest, list);
      }
      for (const [manifest, group] of byManifest) {
        const pkg = await readJsonPackage(ctx, manifest);
        const json = pkg?.json ?? {};
        let changed = false;
        for (const finding of group) {
          const name = String(finding.meta?.packageName ?? "");
          if (!name) continue;
          if (addDependency(json, name, Boolean(finding.meta?.dev))) {
            changed = true;
            notes.push(`Added ${name}@* to ${manifest}. Run npm install to fetch it.`);
          }
        }
        if (!changed) continue;
        const next = stringifyPackage(json, pkg?.indent ?? "  ");
        if (next !== pkg?.raw) await ctx.write(manifest, next);
      }
      return { notes };
    },
    verify(ctx, findings) {
      return verifyFixed(rule, ctx, findings);
    },
  });
  return rule;
}

function dependencyNames(json: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const block = json[field];
    if (!block || typeof block !== "object") continue;
    for (const name of Object.keys(block as Record<string, unknown>)) names.add(name);
  }
  return names;
}

interface JsonPackage {
  raw: string;
  json: Record<string, unknown>;
  indent: string;
}

async function readJsonPackage(
  ctx: { readMaybe(file: string): Promise<string | null> },
  rel: string,
): Promise<JsonPackage | null> {
  const raw = await ctx.readMaybe(rel);
  if (raw == null) return null;
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const indentMatch = raw.match(/\n([ \t]+)"/);
    return { raw, json, indent: indentMatch?.[1] ?? "  " };
  } catch {
    return null;
  }
}

async function dependencySet(
  ctx: { readMaybe(file: string): Promise<string | null> },
  rel: string,
  cache: Map<string, Set<string>>,
): Promise<Set<string>> {
  const cached = cache.get(rel);
  if (cached) return cached;
  const pkg = await readJsonPackage(ctx, rel);
  const names = pkg ? dependencyNames(pkg.json) : new Set<string>();
  cache.set(rel, names);
  return names;
}

function owningPackage(file: string, packages: string[]): string {
  const dir = posixDir(file);
  let best = "package.json";
  let bestLen = -1;
  for (const pkg of packages) {
    const pkgDir = posixDir(pkg);
    const inside = pkgDir === "" || dir === pkgDir || dir.startsWith(`${pkgDir}/`);
    if (!inside || pkgDir.length <= bestLen) continue;
    best = pkg;
    bestLen = pkgDir.length;
  }
  return best;
}

async function aliasMapFor(ctx: { glob(patterns: string[]): Promise<string[]>; read(file: string): Promise<string> }): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const files = await ctx.glob(["**/tsconfig.json", "**/tsconfig.app.json", "**/jsconfig.json"]);
  for (const file of files) {
    let raw: string;
    try {
      raw = await ctx.read(file);
    } catch {
      continue;
    }
    const prefixes: string[] = [];
    try {
      const json = JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")) as {
        compilerOptions?: { paths?: Record<string, unknown> };
      };
      for (const key of Object.keys(json.compilerOptions?.paths ?? {})) {
        const prefix = key.replace(/\*$/, "");
        if (prefix && prefix !== "@") prefixes.push(prefix);
      }
    } catch {
      // A broken tsconfig should not hide real missing packages.
    }
    const dir = posixDir(file);
    const existing = map.get(dir) ?? [];
    map.set(dir, existing.concat(prefixes));
  }
  return map;
}

function aliasesFor(file: string, map: Map<string, string[]>): string[] {
  const prefixes = new Set<string>(["@/"]);
  const dir = posixDir(file);
  for (const [configDir, list] of map) {
    if (configDir !== "" && dir !== configDir && !dir.startsWith(`${configDir}/`)) continue;
    for (const prefix of list) prefixes.add(prefix);
  }
  return [...prefixes];
}

function packageName(spec: string): string | null {
  if (!spec || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:") || spec.startsWith("#")) return null;
  if (/^(virtual:|bun:|astro:|file:|data:|https?:|npm:|jsr:|deno:)/.test(spec)) return null;
  if (spec.includes("*") || spec.includes("?")) return null;
  if (BUILTINS.has(spec)) return null;
  if (spec.startsWith("@")) {
    const [scope, name] = spec.split("/");
    if (!scope || !name) return null;
    return `${scope}/${name}`;
  }
  const name = spec.split("/")[0];
  if (!name || BUILTINS.has(name)) return null;
  return name;
}

function correctRelative(root: string, fromFile: string, spec: string): { status: "exact" | "fixed" | "missing" | "ambiguous"; specifier?: string } {
  const parts = spec.split("/");
  let cursor = posixDir(fromFile);
  const out: string[] = [];
  let changed = false;
  for (let index = 0; index < parts.length; index += 1) {
    const segment = parts[index];
    const last = index === parts.length - 1;
    if (segment === "." || segment === "..") {
      out.push(segment);
      cursor = posixJoin(cursor, segment);
      continue;
    }
    const entries = listDir(root, cursor);
    if (!entries) return { status: "missing" };
    if (!last) {
      const exact = entries.find((entry) => entry.isDir && entry.name === segment);
      if (exact) {
        out.push(segment);
        cursor = posixJoin(cursor, segment);
        continue;
      }
      const matches = entries.filter((entry) => entry.isDir && entry.name.toLowerCase() === segment.toLowerCase());
      if (matches.length === 1) {
        out.push(matches[0].name);
        cursor = posixJoin(cursor, matches[0].name);
        changed = true;
        continue;
      }
      return { status: matches.length > 1 ? "ambiguous" : "missing" };
    }
    const resolved = resolveLast(root, cursor, entries, segment);
    if (resolved.status === "missing" || resolved.status === "ambiguous") return resolved;
    if (!resolved.name) return { status: "missing" };
    if (resolved.name !== segment) changed = true;
    out.push(resolved.name);
  }
  const specifier = out.join("/");
  if (!changed) return { status: "exact" };
  return { status: "fixed", specifier };
}

function resolveLast(
  root: string,
  cursor: string,
  entries: DirEntry[],
  segment: string,
): { status: "exact" | "fixed" | "missing" | "ambiguous"; name?: string } {
  const hasExt = /\.[A-Za-z0-9]+$/.test(segment);
  if (hasExt) {
    if (entries.some((entry) => !entry.isDir && entry.name === segment)) return { status: "exact", name: segment };
    const matches = entries.filter((entry) => !entry.isDir && entry.name.toLowerCase() === segment.toLowerCase());
    if (matches.length === 1) return { status: "fixed", name: matches[0].name };
    return { status: matches.length > 1 ? "ambiguous" : "missing" };
  }
  if (EXTS.some((ext) => entries.some((entry) => !entry.isDir && entry.name === segment + ext)) || directoryHasIndex(root, cursor, segment)) {
    return { status: "exact", name: segment };
  }
  const fileMatches = entries.filter((entry) => !entry.isDir && EXTS.some((ext) => entry.name.toLowerCase() === (segment + ext).toLowerCase()));
  const dirMatches = entries.filter((entry) => entry.isDir && entry.name.toLowerCase() === segment.toLowerCase());
  if (fileMatches.length === 1 && dirMatches.length === 0) {
    const base = fileMatches[0].name.slice(0, fileMatches[0].name.length - extname(fileMatches[0].name).length);
    return { status: base === segment ? "exact" : "fixed", name: base };
  }
  if (fileMatches.length === 0 && dirMatches.length === 1 && directoryHasIndex(root, cursor, dirMatches[0].name)) {
    return { status: dirMatches[0].name === segment ? "exact" : "fixed", name: dirMatches[0].name };
  }
  if (fileMatches.length + dirMatches.length > 1) return { status: "ambiguous" };
  return { status: "missing" };
}

function directoryHasIndex(root: string, cursor: string, dirName: string): boolean {
  const entries = listDir(root, posixJoin(cursor, dirName));
  if (!entries) return false;
  return entries.some((entry) => !entry.isDir && /^index\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name));
}

interface DirEntry {
  name: string;
  isDir: boolean;
}

function listDir(root: string, relDir: string): DirEntry[] | null {
  const abs = normalize(join(root, relDir));
  const base = normalize(root);
  if (abs !== base && !abs.startsWith(base + sep)) return null;
  try {
    return readdirSync(abs, { withFileTypes: true }).map((entry) => ({ name: entry.name, isDir: entry.isDirectory() }));
  } catch {
    return null;
  }
}

function posixDir(file: string): string {
  const index = file.lastIndexOf("/");
  return index === -1 ? "" : file.slice(0, index);
}

function posixJoin(dir: string, segment: string): string {
  const parts = dir === "" || dir === "." ? [] : dir.split("/");
  if (segment === "..") {
    if (parts.length === 0 || parts[parts.length - 1] === "..") parts.push("..");
    else parts.pop();
  } else if (segment !== ".") parts.push(segment);
  return parts.join("/");
}
