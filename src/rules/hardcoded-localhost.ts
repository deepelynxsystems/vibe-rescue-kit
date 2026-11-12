import type { Finding, Rule, RuleDefinition } from "../types.js";
import { defineRule, verifyFixed } from "../engine/define.js";
import { upsertEnv } from "../engine/env.js";
import { depNames, readPackage } from "../engine/package-file.js";
import { lineAt, stringLiterals } from "../engine/text.js";
import { stringArray } from "./config.js";
import { DEFAULT_CLIENT_ROOTS, isClientSource, isNextServerModule } from "./client.js";
import type { Strategy } from "./types.js";

const GLOBS = [
  "src/**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte}",
  "app/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "pages/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "components/**/*.{ts,tsx,js,jsx,mjs,cjs}",
];

export const hardcodedLocalhost: Strategy = {
  id: "hardcoded-localhost",
  defaults() {
    return {
      id: "hardcoded-localhost",
      title: "Hardcoded localhost URLs",
      description: "Client code should read its API origin from the environment so preview, staging, and production do not keep calling localhost. Dev-only branches, placeholders, and dev configs are ignored. A bare localhost:port counts.",
      severity: "error",
      scopeNote: "Rewrites client source only. Server files may keep a local URL. Port 54321 is treated as the local Supabase URL.",
      strategy: "hardcoded-localhost",
      watchGlobs: GLOBS,
      detect: { clientRoots: DEFAULT_CLIENT_ROOTS },
    };
  },
  create(def) {
    return createRule(def);
  },
};

function createRule(def: RuleDefinition): Rule {
  const severity = def.severity ?? "error";
  const roots = stringArray((def.detect ?? {}).clientRoots, DEFAULT_CLIENT_ROOTS);
  const rule = defineRule({
    id: def.id,
    title: def.title,
    description: def.description,
    severity,
    scopeNote: def.scopeNote,
    watchGlobs: def.watchGlobs ?? GLOBS,
    async detect(ctx) {
      const pkg = await readPackage(ctx);
      const files = await ctx.glob(GLOBS);
      const nextApp = pkg ? depNames(pkg.json).has("next") : false;
      const style = styleOf(pkg?.json ?? null, files);
      const findings: Finding[] = [];
      for (const file of files) {
        if (!isClientSource(file, roots) || isDevConfig(file)) continue;
        const text = await ctx.read(file);
        if (nextApp && isNextServerModule(file, text)) continue;
        for (const literal of stringLiterals(text)) {
          if (literal.hasExpr) continue;
          const url = classify(literal.value);
          if (!url) continue;
          if (isPlaceholder(text, literal.start) || isDevGuarded(text, literal.start)) continue;
          if (url.path.includes("`") || url.path.includes("${")) continue;
          const env = namesFor(style, url.kind);
          findings.push({
            fingerprint: `hardcoded-localhost:${file}:${literal.start}:${url.origin}`,
            ruleId: def.id,
            severity,
            message: `Hardcoded ${url.origin} in ${file}.`,
            file,
            line: lineAt(text, literal.start),
            hint: `Use ${env.access}. ${env.name} will be added to .env.example.`,
            meta: { origin: url.origin, path: url.path, envName: env.name, access: env.access },
          });
        }
      }
      return findings;
    },
    async fix(ctx, findings) {
      const byFile = new Map<string, Finding[]>();
      const samples = new Map<string, string>();
      for (const finding of findings) {
        if (!finding.file) continue;
        const list = byFile.get(finding.file) ?? [];
        list.push(finding);
        byFile.set(finding.file, list);
        const envName = String(finding.meta?.envName ?? "");
        const origin = String(finding.meta?.origin ?? "");
        if (envName && origin && !samples.has(envName)) samples.set(envName, origin);
      }
      for (const [file, group] of byFile) {
        let text = await ctx.read(file);
        const literals = stringLiterals(text).filter((literal) => !literal.hasExpr);
        const replacements: Array<{ start: number; end: number; text: string }> = [];
        for (const literal of literals) {
          const hit = group.find((finding) => literal.value === `${finding.meta?.origin ?? ""}${finding.meta?.path ?? ""}` || literal.value.startsWith(String(finding.meta?.origin ?? "")));
          if (!hit) continue;
          const access = String(hit.meta?.access ?? "");
          const path = String(hit.meta?.path ?? "");
          const origin = String(hit.meta?.origin ?? "");
          if (!literal.value.startsWith(origin)) continue;
          replacements.push({
            start: literal.start,
            end: literal.end,
            text: path ? `\`\${${access}}${path}\`` : access,
          });
        }
        replacements.sort((a, b) => b.start - a.start);
        let cursor = text.length;
        for (const replacement of replacements) {
          if (replacement.end > cursor) continue;
          text = text.slice(0, replacement.start) + replacement.text + text.slice(replacement.end);
          cursor = replacement.start;
        }
        await ctx.write(file, text);
      }
      if (samples.size > 0) {
        const entries = [...samples.entries()].map(([key, value]) => ({ key, value }));
        await ctx.write(".env.example", upsertEnv(await ctx.readMaybe(".env.example"), entries));
        await ctx.write(".env", upsertEnv(await ctx.readMaybe(".env"), entries));
      }
      return { notes: ["Localhost origins were copied into .env as the local default. Change them per environment."] };
    },
    verify(ctx, findings) {
      return verifyFixed(rule, ctx, findings);
    },
  });
  return rule;
}

function styleOf(json: Record<string, unknown> | null, files: string[]): "vite" | "next" | "node" {
  const deps = json ? depNames(json) : new Set<string>();
  if (deps.has("next")) return "next";
  if (deps.has("vite") || files.some((file) => /^vite\.config\./.test(file))) return "vite";
  return "node";
}

function namesFor(style: "vite" | "next" | "node", kind: "api" | "supabase"): { name: string; access: string } {
  const base = kind === "supabase" ? "SUPABASE_URL" : "API_BASE_URL";
  if (style === "vite") {
    const name = `VITE_${base}`;
    return { name, access: `import.meta.env.${name}` };
  }
  if (style === "next") {
    const name = `NEXT_PUBLIC_${base}`;
    return { name, access: `process.env.${name}` };
  }
  return { name: base, access: `process.env.${base}` };
}

function classify(value: string): { origin: string; path: string; kind: "api" | "supabase" } | null {
  const match = value.match(/^(https?:\/\/(?:localhost|127\.0\.0\.1)(?::(\d+))?)(\/.*)?$/);
  if (match) {
    const port = match[2];
    const path = match[3] && match[3] !== "/" ? match[3] : "";
    const kind = port === "54321" || port === "54322" ? "supabase" : "api";
    return { origin: match[1], path, kind };
  }
  const bare = value.match(/^((?:localhost|127\.0\.0\.1):\d+)(\/.*)?$/);
  if (!bare) return null;
  const port = bare[1].slice(bare[1].lastIndexOf(":") + 1);
  const path = bare[2] && bare[2] !== "/" ? bare[2] : "";
  const kind = port === "54321" || port === "54322" ? "supabase" : "api";
  return { origin: bare[1], path, kind };
}

function isDevConfig(file: string): boolean {
  return /(^|\/)(?:vite|vitest|playwright|eslint|postcss|tailwind)\.config\.[cm]?[jt]s$/.test(file) || /(^|\/)[^/]+\.config\.[cm]?[jt]s$/.test(file);
}

function isPlaceholder(source: string, start: number): boolean {
  const before = source.slice(Math.max(0, start - 48), start);
  return /placeholder\s*[:=]\s*$/.test(before);
}

function isDevGuarded(source: string, start: number): boolean {
  const from = Math.max(0, source.lastIndexOf(";", start), source.lastIndexOf("\n", start));
  const window = source.slice(from, start);
  if (/import\.meta\.env\.DEV\b/.test(window)) return true;
  if (/NODE_ENV\s*={2,3}\s*['"]development['"]/.test(window)) return true;
  if (/NODE_ENV\s*!={1,2}\s*['"]production['"]/.test(window)) return true;
  const devBranch = window.match(/\bdev\s*\?([\s\S]*)$/);
  if (devBranch && !hasUnquotedColon(devBranch[1])) return true;
  return false;
}

function hasUnquotedColon(text: string): boolean {
  let quote = "";
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (c === quote) quote = "";
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      continue;
    }
    if (c === ":") return true;
  }
  return false;
}
