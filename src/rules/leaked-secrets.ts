import { createHash } from "node:crypto";
import type { Finding, Rule, RuleDefinition } from "../types.js";
import { defineRule, verifyFixed } from "../engine/define.js";
import { SECRET_GITIGNORE_BLOCK, blankEnvValue, upsertEnv, type EnvEntry } from "../engine/env.js";
import { gitignoreMatcher } from "../engine/git.js";
import { depNames, readPackage } from "../engine/package-file.js";
import { codeSpans, insertImport, lineAt, relativeImport, stringLiterals, usesSemicolons } from "../engine/text.js";
import { appendStrings, detectConfig, stringArray } from "./config.js";
import { DEFAULT_CLIENT_ROOTS, isClientSource, isNextServerModule, isTypeScript } from "./client.js";
import type { Strategy } from "./types.js";

interface SecretPattern {
  name: string;
  regex: string;
  env: string;
  kind?: string;
}

const PATTERNS: SecretPattern[] = [
  { name: "stripe_secret", regex: "sk_(?:live|test)_[0-9A-Za-z]{16,}", env: "STRIPE_SECRET_KEY" },
  { name: "stripe_restricted", regex: "rk_(?:live|test)_[0-9A-Za-z]{16,}", env: "STRIPE_RESTRICTED_KEY" },
  { name: "supabase_secret", regex: "sb_secret_[A-Za-z0-9_\\-]{10,}", env: "SUPABASE_SECRET_KEY" },
  { name: "aws_access_key", regex: "AKIA[0-9A-Z]{16}", env: "AWS_ACCESS_KEY_ID" },
  { name: "github_pat", regex: "ghp_[A-Za-z0-9]{20,}", env: "GITHUB_TOKEN" },
  {
    name: "private_key",
    regex: "-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    env: "PRIVATE_KEY",
    kind: "pem",
  },
  {
    name: "service_role_jwt",
    regex: "eyJ[A-Za-z0-9_\\-]{10,}\\.[A-Za-z0-9_\\-]{10,}\\.[A-Za-z0-9_\\-]{10,}",
    env: "SUPABASE_SERVICE_ROLE_KEY",
    kind: "jwt_service_role",
  },
];

const ENV_IGNORE_TARGETS = [".env", ".env.local", ".env.development", ".env.production"];

const TRACKED_ENV = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.development.local",
  ".env.production.local",
  ".env.test",
  ".env.test.local",
];

const EXAMPLE_ENV = [".env.example", ".env.sample", ".env.template"];

const CODE_GLOBS = [
  "src/**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte}",
  "app/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "pages/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "components/**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "public/**/*.{js,mjs,cjs}",
];

export const leakedSecrets: Strategy = {
  id: "leaked-secrets",
  defaults,
  create(def) {
    return createRule(def);
  },
};

function defaults(): RuleDefinition {
  return {
    id: "leaked-secrets",
    title: "Leaked secrets in client code",
      description:
      "Service-role keys, secret API keys, and unignored .env files do not belong in a client bundle or in git. Next.js server components are not client code.",
    severity: "error",
    scopeNote: "Does not rotate keys or rewrite git history. You do that at the provider and with git rm --cached.",
    strategy: "leaked-secrets",
    watchGlobs: CODE_GLOBS,
    detect: {
      clientRoots: DEFAULT_CLIENT_ROOTS,
      secretPatterns: PATTERNS,
    },
  };
}

function createRule(def: RuleDefinition): Rule {
  const severity = def.severity ?? "error";
  const config = detectConfig(def);
  const roots = stringArray(config.clientRoots, DEFAULT_CLIENT_ROOTS);
  const patterns = parsePatterns(config.secretPatterns).concat(parsePatterns(config.appendSecretPatterns));
  const extraGlobs = appendStrings(CODE_GLOBS, config.extraGlobs);

  const rule = defineRule({
    id: def.id,
    title: def.title,
    description: def.description,
    severity,
    scopeNote: def.scopeNote,
    watchGlobs: def.watchGlobs ?? extraGlobs,
    async detect(ctx) {
      const findings: Finding[] = [];
      const claimed = new Map<string, string>();
      const pkg = await readPackage(ctx);
      const nextApp = pkg ? depNames(pkg.json).has("next") : false;
      const files = await ctx.glob(extraGlobs);
      for (const file of files) {
        if (!isClientSource(file, roots)) continue;
        const text = await ctx.read(file);
        if (nextApp && isNextServerModule(file, text)) continue;
        if (text.includes("\0")) continue;
        for (const literal of stringLiterals(text)) {
          if (literal.hasExpr) continue;
          const match = matchSecret(literal.value, patterns);
          if (!match) continue;
          const envName = claimEnv(claimed, match.env, match.value);
          findings.push({
            fingerprint: fingerprint(file, "literal", envName, match.value),
            ruleId: def.id,
            severity,
            message: `Hardcoded ${match.name.replaceAll("_", " ")} in client file ${file}.`,
            file,
            line: lineAt(text, literal.start),
            hint: `Move it to ${envName} in a gitignored .env file and rotate it.`,
            meta: { kind: "literal", envName, secretValue: match.value },
          });
        }
        for (const span of codeSpans(text)) {
          const re = /(?:import\.meta\.env|process\.env)\.([A-Z0-9_]+)/g;
          let match: RegExpExecArray | null;
          while ((match = re.exec(span.text))) {
            const name = match[1];
            if (!dangerousClientEnv(name)) continue;
            const full = match[0];
            const envName = serverEnvName(name);
            findings.push({
              fingerprint: fingerprint(file, "env-ref", envName, full),
              ruleId: def.id,
              severity,
              message: `Client code reads secret-shaped env ${name}.`,
              file,
              line: lineAt(text, span.start + match.index),
              hint: `Read ${envName} on the server. A public prefix still bundles the value.`,
              meta: { kind: "env-ref", envName, member: full },
            });
          }
        }
      }

      const gitignore = await ctx.readMaybe(".gitignore");
      const matcher = gitignoreMatcher(gitignore);
      const uncovered = ENV_IGNORE_TARGETS.filter((file) => !matcher.ignores(file));
      if (uncovered.length > 0) {
        findings.push({
          fingerprint: "leaked-secrets:gitignore",
          ruleId: def.id,
          severity: "warning",
          message: `.gitignore does not ignore ${uncovered.join(", ")}.`,
          file: ".gitignore",
          hint: "Ignore .env and .env.* (keep !.env.example). A later commit can otherwise add the real file.",
          meta: { kind: "gitignore" },
        });
      }
      for (const file of TRACKED_ENV) {
        if (!(await ctx.exists(file))) continue;
        if (matcher.ignores(file)) continue;
        findings.push({
          fingerprint: `leaked-secrets:${file}:env-file`,
          ruleId: def.id,
          severity,
          message: `${file} is not gitignored and can be committed with secrets.`,
          file,
          hint: "Add it to .gitignore. If git already tracks it, run git rm --cached .env and rotate the keys.",
          meta: { kind: "env-file" },
        });
      }

      for (const file of EXAMPLE_ENV) {
        const text = await ctx.readMaybe(file);
        if (!text) continue;
        for (const [key, value] of envEntries(text)) {
          const match = matchSecret(value, patterns);
          if (!match) continue;
          const envName = claimEnv(claimed, key || match.env, match.value);
          findings.push({
            fingerprint: fingerprint(file, "example", envName, match.value),
            ruleId: def.id,
            severity,
            message: `${file} contains a real ${match.name.replaceAll("_", " ")} for ${key}. Example files are committed.`,
            file,
            hint: "The example value will be cleared. Rotate the key.",
            meta: { kind: "example", envName, secretValue: match.value, envKey: key },
          });
        }
      }
      return dedupe(findings);
    },
    async fix(ctx, findings) {
      const notes: string[] = [];
      const valueToEnv = new Map<string, string>();
      const memberToEnv = new Map<string, string>();
      const exampleEdits = new Map<string, Map<string, string>>();
      let needsGitignore = findings.some((finding) => finding.meta?.kind === "env-file" || finding.meta?.kind === "gitignore");

      for (const finding of findings) {
        const kind = finding.meta?.kind;
        const envName = String(finding.meta?.envName ?? "");
        const secret = typeof finding.meta?.secretValue === "string" ? finding.meta.secretValue : "";
        if ((kind === "literal" || kind === "example") && secret && envName) {
          valueToEnv.set(secret, envName);
          needsGitignore = true;
          notes.push(`Rotate ${envName}. It was exposed in ${finding.file}.`);
        }
        if (kind === "env-ref" && envName && typeof finding.meta?.member === "string") {
          memberToEnv.set(finding.meta.member, envName);
          notes.push(`Rotate ${envName} if ${finding.meta.member} was ever built into a client bundle.`);
        }
        if (kind === "example" && finding.file && typeof finding.meta?.envKey === "string") {
          const keys = exampleEdits.get(finding.file) ?? new Map<string, string>();
          keys.set(finding.meta.envKey, envName);
          exampleEdits.set(finding.file, keys);
        }
        if (kind === "env-file") {
          notes.push(`${finding.file} is now gitignored. If git still tracks it, run: git rm --cached ${finding.file}`);
        }
      }

      const byFile = new Map<string, Finding[]>();
      for (const finding of findings) {
        if (!finding.file) continue;
        if (finding.meta?.kind !== "literal" && finding.meta?.kind !== "env-ref") continue;
        const list = byFile.get(finding.file) ?? [];
        list.push(finding);
        byFile.set(finding.file, list);
      }

      const rewritten: string[] = [];
      for (const [file, group] of byFile) {
        const text = await ctx.read(file);
        const fileValues = new Map<string, string>();
        const fileMembers = new Map<string, string>();
        for (const finding of group) {
          if (typeof finding.meta?.secretValue === "string" && typeof finding.meta.envName === "string") {
            fileValues.set(finding.meta.secretValue, finding.meta.envName);
          }
          if (typeof finding.meta?.member === "string" && typeof finding.meta.envName === "string") {
            fileMembers.set(finding.meta.member, finding.meta.envName);
          }
        }
        let next = rewriteSource(text, fileValues, fileMembers);
        if (next === text) continue;
        if (next.includes("serverOnlyEnv(")) {
          rewritten.push(file);
        }
        if (next !== text) {
          // import is added after we know the helper path
          await ctx.write(file, next);
        }
      }

      if (rewritten.length > 0) {
        const useTs = rewritten.some((file) => isTypeScript(file));
        const helper = rewritten.some((file) => file.startsWith("src/"))
          ? `src/vibe-rescue/server-only-env.${useTs ? "ts" : "js"}`
          : `vibe-rescue/server-only-env.${useTs ? "ts" : "js"}`;
        await ctx.write(helper, helperSource(useTs));
        for (const file of rewritten) {
          const text = await ctx.read(file);
          const spec = relativeImport(file, helper);
          const semi = usesSemicolons(text);
          const statement = `import { serverOnlyEnv } from "${spec}"${semi ? ";" : ""}`;
          const next = text.includes(statement) ? text : insertImport(text, statement);
          if (next !== text) await ctx.write(file, next);
        }
      }

      if (needsGitignore || valueToEnv.size > 0 || memberToEnv.size > 0) {
        const current = await ctx.readMaybe(".gitignore");
        const next = ensureSecretGitignore(current);
        if (next !== current) await ctx.write(".gitignore", next ?? SECRET_GITIGNORE_BLOCK);
      }

      const envEntriesToWrite: EnvEntry[] = [...valueToEnv.entries()].map(([value, key]) => ({
        key,
        value,
        comment: "Rotate this key. vibe-rescue moved it out of client code.",
      }));
      for (const envName of new Set([...memberToEnv.values()])) {
        if (!envEntriesToWrite.some((entry) => entry.key === envName)) {
          envEntriesToWrite.push({ key: envName, value: null, comment: "Rotate if this was ever bundled." });
        }
      }
      if (envEntriesToWrite.length > 0) {
        const envText = await ctx.readMaybe(".env");
        await ctx.write(".env", upsertEnv(envText, envEntriesToWrite));
        const exampleText = await ctx.readMaybe(".env.example");
        await ctx.write(
          ".env.example",
          upsertEnv(
            exampleText,
            envEntriesToWrite.map((entry) => ({ ...entry, value: null })),
          ),
        );
      }

      for (const [file, keys] of exampleEdits) {
        let text = await ctx.read(file);
        for (const key of keys.keys()) text = blankEnvValue(text, key);
        await ctx.write(file, text);
      }

      return { notes: unique(notes) };
    },
    verify(ctx, findings) {
      return verifyFixed(rule, ctx, findings);
    },
  });
  return rule;
}

function parsePatterns(value: unknown): SecretPattern[] {
  if (!Array.isArray(value)) return [];
  const out: SecretPattern[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.regex !== "string" || typeof row.env !== "string" || typeof row.name !== "string") continue;
    out.push({ name: row.name, regex: row.regex, env: row.env, kind: typeof row.kind === "string" ? row.kind : undefined });
  }
  return out;
}

function matchSecret(value: string, patterns: SecretPattern[]): { name: string; env: string; value: string } | null {
  if (!value || value.length < 8) return null;
  for (const pattern of patterns) {
    let re: RegExp;
    try {
      re = new RegExp(pattern.regex, "g");
    } catch {
      continue;
    }
    const match = re.exec(value);
    if (!match) continue;
    const found = match[0];
    if (pattern.kind === "jwt_service_role" && !isServiceRoleJwt(found)) continue;
    return { name: pattern.name, env: pattern.env, value: found };
  }
  return null;
}

function isServiceRoleJwt(token: string): boolean {
  const parts = token.split(".");
  if (parts.length < 2) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

function dangerousClientEnv(name: string): boolean {
  if (/ANON|PUBLISHABLE/.test(name)) return false;
  return /SERVICE_ROLE|SECRET|PRIVATE_KEY|WEBHOOK_SECRET/.test(name);
}

function serverEnvName(name: string): string {
  return name.replace(/^(?:VITE_|NEXT_PUBLIC_)/, "");
}

function claimEnv(claimed: Map<string, string>, base: string, value: string): string {
  const existing = claimed.get(base);
  if (!existing || existing === value) {
    claimed.set(base, value);
    return base;
  }
  let index = 2;
  while (claimed.has(`${base}_${index}`) && claimed.get(`${base}_${index}`) !== value) index += 1;
  const name = `${base}_${index}`;
  claimed.set(name, value);
  return name;
}

function fingerprint(file: string, kind: string, envName: string, value: string): string {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 10);
  return `leaked-secrets:${file}:${kind}:${envName}:${hash}`;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.fingerprint)) return false;
    seen.add(finding.fingerprint);
    return true;
  });
}

function envEntries(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    map.set(match[1], match[2].trim().replace(/^['"]|['"]$/g, ""));
  }
  return map;
}

function rewriteSource(source: string, valueToEnv: Map<string, string>, memberToEnv: Map<string, string>): string {
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  if (valueToEnv.size > 0) {
    for (const literal of stringLiterals(source)) {
      if (literal.hasExpr) continue;
      if (![...valueToEnv.keys()].some((secret) => secret.length > 0 && literal.value.includes(secret))) continue;
      replacements.push({ start: literal.start, end: literal.end, text: renderSecretExpr(literal.value, valueToEnv) });
    }
  }
  if (memberToEnv.size > 0) {
    for (const span of codeSpans(source)) {
      const re = /(?:import\.meta\.env|process\.env)\.[A-Z0-9_]+/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(span.text))) {
        const envName = memberToEnv.get(match[0]);
        if (!envName) continue;
        const start = span.start + match.index;
        replacements.push({
          start,
          end: start + match[0].length,
          text: `serverOnlyEnv(${JSON.stringify(envName)})`,
        });
      }
    }
  }
  replacements.sort((a, b) => b.start - a.start);
  let out = source;
  let cursor = source.length;
  for (const replacement of replacements) {
    if (replacement.end > cursor) continue;
    out = out.slice(0, replacement.start) + replacement.text + out.slice(replacement.end);
    cursor = replacement.start;
  }
  return out;
}

function renderSecretExpr(value: string, valueToEnv: Map<string, string>): string {
  const entries = [...valueToEnv.entries()].filter(([secret]) => secret.length > 0).sort((a, b) => b[0].length - a[0].length);
  let pieces: Array<{ type: "text" | "env"; value: string }> = [{ type: "text", value }];
  for (const [secret, env] of entries) {
    const next: typeof pieces = [];
    for (const piece of pieces) {
      if (piece.type !== "text" || !piece.value.includes(secret)) {
        next.push(piece);
        continue;
      }
      const parts = piece.value.split(secret);
      parts.forEach((part, index) => {
        if (part) next.push({ type: "text", value: part });
        if (index < parts.length - 1) next.push({ type: "env", value: env });
      });
    }
    pieces = next;
  }
  if (pieces.length === 1 && pieces[0].type === "env") return `serverOnlyEnv(${JSON.stringify(pieces[0].value)})`;
  return pieces
    .map((piece) => (piece.type === "env" ? `serverOnlyEnv(${JSON.stringify(piece.value)})` : JSON.stringify(piece.value)))
    .join(" + ");
}

function helperSource(ts: boolean): string {
  const signature = ts ? "(name: string): string" : "(name)";
  return `/**
 * Generated by vibe-rescue-kit (deepelynx).
 * Reads a value on the server. Throws in the browser so the value cannot ship in a client bundle.
 * Rotate any key that was previously hardcoded.
 */
export function serverOnlyEnv${signature} {
  if (typeof window !== "undefined") {
    throw new Error(
      "[vibe-rescue] " + name + " was moved out of client code. Read it on the server and rotate the key."
    );
  }
  const value = process.env[name];
  if (!value) {
    throw new Error("[vibe-rescue] Missing environment variable " + name);
  }
  return value;
}
`;
}

function ensureSecretGitignore(content: string | null): string {
  const current = content ?? "";
  const matcher = gitignoreMatcher(current);
  if (matcher.ignores(".env") && matcher.ignores(".env.local") && !matcher.ignores(".env.example")) {
    return current.endsWith("\n") || current.length === 0 ? current : `${current}\n`;
  }
  const sep = current.length === 0 ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  return `${current}${sep}${SECRET_GITIGNORE_BLOCK}`;
}

function unique(notes: string[]): string[] {
  return [...new Set(notes)];
}
