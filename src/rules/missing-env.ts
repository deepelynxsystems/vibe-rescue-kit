import type { Finding, Rule, RuleDefinition } from "../types.js";
import { defineRule, verifyFixed } from "../engine/define.js";
import { LOCAL_ENV_NAMES, parseEnv, upsertEnv } from "../engine/env.js";
import { readPackage, stringifyPackage } from "../engine/package-file.js";
import { codeSpans, lineAt } from "../engine/text.js";
import { detectConfig, stringArray } from "./config.js";
import type { Strategy } from "./types.js";

const GLOBS = [
  "src/**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte}",
  "app/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "pages/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "server/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "lib/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "components/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "api/**/*.{ts,tsx,js,jsx,mjs,cjs}",
];

const SKIP = new Set([
  "NODE_ENV",
  "CI",
  "VITEST",
  "MODE",
  "DEV",
  "PROD",
  "SSR",
  "BASE_URL",
  "TEST",
  "JEST_WORKER_ID",
  "NEXT_RUNTIME",
  "NEXT_PHASE",
]);

const EXAMPLE_FILES = [".env.example", ".env.sample", ".env.template"];

export const missingEnv: Strategy = {
  id: "missing-env",
  defaults() {
    return {
      id: "missing-env",
      title: "Missing environment variables",
      description: "Env vars referenced in code need a documented name and a startup check that fails clearly when they are unset.",
      severity: "error",
      scopeNote: "Does not invent secret values. Empty keys are written so the startup check keeps failing until you fill them in.",
      strategy: "missing-env",
      watchGlobs: GLOBS,
      detect: { globs: GLOBS, skip: [...SKIP] },
    };
  },
  create(def) {
    return createRule(def);
  },
};

function createRule(def: RuleDefinition): Rule {
  const severity = def.severity ?? "error";
  const config = detectConfig(def);
  const globs = stringArray(config.globs, GLOBS);
  const skip = new Set(stringArray(config.skip, [...SKIP]));

  const rule = defineRule({
    id: def.id,
    title: def.title,
    description: def.description,
    severity,
    scopeNote: def.scopeNote,
    watchGlobs: def.watchGlobs ?? globs,
    async detect(ctx) {
      const refs = new Map<string, { file: string; line: number }>();
      for (const file of await ctx.glob(globs)) {
        const text = await ctx.read(file);
        for (const ref of referencedEnv(text)) {
          if (skip.has(ref.name) || refs.has(ref.name)) continue;
          refs.set(ref.name, { file, line: lineAt(text, ref.index) });
        }
      }
      const exampleKeys = new Set<string>();
      for (const file of EXAMPLE_FILES) {
        const text = await ctx.readMaybe(file);
        if (text) for (const key of parseEnv(text).keys()) exampleKeys.add(key);
      }
      const localKeys = new Set<string>();
      for (const file of LOCAL_ENV_NAMES) {
        const text = await ctx.readMaybe(file);
        if (text) for (const key of parseEnv(text).keys()) localKeys.add(key);
      }
      const findings: Finding[] = [];
      for (const [name, where] of refs) {
        const missingExample = !exampleKeys.has(name);
        const missingLocal = !localKeys.has(name);
        if (!missingExample && !missingLocal) continue;
        const whereText = [
          missingExample ? ".env.example" : "",
          missingLocal ? ".env" : "",
        ]
          .filter(Boolean)
          .join(" and ");
        findings.push({
          fingerprint: `missing-env:${name}`,
          ruleId: def.id,
          severity,
          message: `${name} is referenced in ${where.file} but missing from ${whereText}.`,
          file: where.file,
          line: where.line,
          hint: "An .env.example entry and .vibe-rescue/check-env.mjs will be generated. Fill in the real value locally.",
          meta: { name },
        });
      }
      return findings;
    },
    async fix(ctx, findings) {
      const names = findings.map((finding) => String(finding.meta?.name ?? "")).filter(Boolean);
      const allRefs = await collectNames(ctx, globs, skip);
      if (names.length === 0) return { notes: [] };
      const example = await ctx.readMaybe(".env.example");
      await ctx.write(
        ".env.example",
        upsertEnv(
          example,
          names.map((name) => ({ key: name, value: null })),
        ),
      );
      const env = await ctx.readMaybe(".env");
      await ctx.write(
        ".env",
        upsertEnv(
          env,
          names.map((name) => ({ key: name, value: null })),
        ),
      );
      await ctx.write(".vibe-rescue/check-env.mjs", checkScript([...allRefs].sort()));
      const pkg = await readPackage(ctx);
      if (pkg) {
        const scripts = (pkg.json.scripts && typeof pkg.json.scripts === "object" ? { ...(pkg.json.scripts as Record<string, string>) } : {}) as Record<string, string>;
        scripts["check-env"] = "node .vibe-rescue/check-env.mjs";
        if (scripts.dev) scripts.predev = chain(scripts.predev, "node .vibe-rescue/check-env.mjs");
        if (scripts.start) scripts.prestart = chain(scripts.prestart, "node .vibe-rescue/check-env.mjs");
        pkg.json.scripts = scripts;
        const next = stringifyPackage(pkg.json, pkg.indent);
        if (next !== pkg.raw) await ctx.write("package.json", next);
      }
      return {
        notes: [
          "Empty values were added. The startup check exits until those variables are set.",
          "npm run dev runs the check first via predev when a dev script exists.",
        ],
      };
    },
    async verify(ctx, findings) {
      const base = await verifyFixed(rule, ctx, findings);
      if (!base.ok) return base;
      const script = await ctx.readMaybe(".vibe-rescue/check-env.mjs");
      if (!script) return { ok: false, message: "Startup check script was not written." };
      for (const finding of findings) {
        const name = String(finding.meta?.name ?? "");
        if (name && !script.includes(`"${name}"`)) {
          return { ok: false, message: `Startup check is missing ${name}.` };
        }
      }
      const pkg = await ctx.readMaybe("package.json");
      if (pkg && /"dev"\s*:/.test(pkg) && !pkg.includes("check-env.mjs")) {
        return { ok: false, message: "package.json does not run the startup check." };
      }
      return { ok: true, message: "Verification passed." };
    },
  });
  return rule;
}

async function collectNames(ctx: { glob(patterns: string[]): Promise<string[]>; read(file: string): Promise<string> }, globs: string[], skip: Set<string>): Promise<Set<string>> {
  const names = new Set<string>();
  for (const file of await ctx.glob(globs)) {
    const text = await ctx.read(file);
    for (const ref of referencedEnv(text)) {
      if (!skip.has(ref.name)) names.add(ref.name);
    }
  }
  return names;
}

function referencedEnv(source: string): Array<{ name: string; index: number }> {
  const found: Array<{ name: string; index: number }> = [];
  const re = /(?:process\.env|import\.meta\.env)(?:\.([A-Z_][A-Z0-9_]*)|\[\s*['"]([A-Z_][A-Z0-9_]*)['"]\s*\])/g;
  for (const span of codeSpans(source)) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(span.text))) {
      const name = match[1] || match[2];
      if (!name) continue;
      found.push({ name, index: span.start + match.index });
    }
  }
  return found;
}

function chain(existing: string | undefined, command: string): string {
  if (!existing) return command;
  if (existing.includes("check-env.mjs")) return existing;
  return `${command} && ${existing}`;
}

function checkScript(names: string[]): string {
  const list = names.map((name) => `  "${name}",`).join("\n");
  return `// Generated by vibe-rescue-kit (deepelynx).
// Re-run \`vibe-rescue fix\` after adding new env references.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const required = [
${list}
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvFile(text) {
  const values = {};
  for (const line of text.split(/\\r?\\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

const fileEnv = {};
for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  Object.assign(fileEnv, parseEnvFile(readFileSync(path, "utf8")));
}

const missing = required.filter((key) => {
  const value = process.env[key] ?? fileEnv[key];
  return value == null || value === "";
});

if (missing.length > 0) {
  console.error("Missing environment variables:");
  for (const key of missing) console.error("  - " + key);
  console.error("Copy .env.example to .env and set each value.");
  console.error("vibe-rescue-kit by deepelynx");
  process.exit(1);
}
`;
}
