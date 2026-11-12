import type { Finding, Rule, RuleDefinition } from "../types.js";
import { defineRule, verifyFixed } from "../engine/define.js";
import { detectConfig, stringArray } from "./config.js";
import type { Strategy } from "./types.js";

interface Ident {
  key: string;
  sql: string;
}

interface TableState {
  sql: string;
  rls: "unknown" | "enabled" | "disabled";
  policies: number;
  file: string;
  created: boolean;
}

const MIGRATION_GLOBS = ["**/*.sql"];

export const supabaseRls: Strategy = {
  id: "supabase-rls",
  defaults() {
    return {
      id: "supabase-rls",
      title: "Supabase tables without row level security",
      description: "Public tables created in SQL anywhere in the repo need row level security before a client can safely touch them.",
      severity: "error",
      scopeNote: "Writes a SQL migration only. It never connects to Postgres or Supabase.",
      strategy: "supabase-rls",
      watchGlobs: MIGRATION_GLOBS,
      detect: { migrationGlobs: MIGRATION_GLOBS },
    };
  },
  create(def) {
    return createRule(def);
  },
};

function createRule(def: RuleDefinition): Rule {
  const severity = def.severity ?? "error";
  const globs = stringArray(detectConfig(def).migrationGlobs, MIGRATION_GLOBS);
  const rule = defineRule({
    id: def.id,
    title: def.title,
    description: def.description,
    severity,
    scopeNote: def.scopeNote,
    watchGlobs: def.watchGlobs ?? globs,
    async detect(ctx) {
      const files = (await ctx.glob(globs)).sort();
      const tables = new Map<string, TableState>();
      for (const file of files) {
        const sql = await ctx.read(file);
        for (const hit of scanSql(stripSqlComments(sql))) {
          const state = tables.get(hit.ident.key) ?? {
            sql: hit.ident.sql,
            rls: "unknown" as const,
            policies: 0,
            file,
            created: false,
          };
          if (hit.kind === "create") state.created = true;
          else if (hit.kind === "enable") state.rls = "enabled";
          else if (hit.kind === "disable") state.rls = "disabled";
          else state.policies += 1;
          state.sql = hit.ident.sql;
          if (!state.file) state.file = file;
          tables.set(hit.ident.key, state);
        }
      }
      const findings: Finding[] = [];
      for (const [key, state] of tables) {
        if (!key.startsWith("public.")) continue;
        const problem = problemFor(state);
        if (!problem) continue;
        findings.push({
          fingerprint: `supabase-rls:${key}:${problem}`,
          ruleId: def.id,
          severity,
          message: messageFor(state.sql, problem),
          file: state.file,
          hint: "A new migration will enable RLS and add a deny-all policy for anon and authenticated. No database is contacted.",
          meta: { sql: state.sql, problem },
        });
      }
      return findings;
    },
    async fix(ctx, findings) {
      const groups = new Map<string, Finding[]>();
      for (const finding of findings) {
        const dir = finding.file?.includes("/") ? finding.file.slice(0, finding.file.lastIndexOf("/")) : "supabase/migrations";
        const list = groups.get(dir) ?? [];
        list.push(finding);
        groups.set(dir, list);
      }
      for (const [dir, group] of groups) {
        const tables = group
          .map((finding) => String(finding.meta?.sql ?? ""))
          .filter(Boolean)
          .sort();
        const uniqueTables = [...new Set(tables)];
        let name = `${stamp()}_vibe_rescue_enable_rls.sql`;
        let path = `${dir}/${name}`;
        let suffix = 2;
        while (await ctx.exists(path)) {
          name = `${stamp()}_vibe_rescue_enable_rls_${suffix}.sql`;
          path = `${dir}/${name}`;
          suffix += 1;
        }
        await ctx.write(path, migrationSql(uniqueTables));
      }
      return {
        notes: [
          "Review the new migration before you apply it. vibe-rescue does not connect to a database.",
          "The deny-all policy blocks anon and authenticated until you replace it with a real policy. The service role bypasses RLS.",
        ],
      };
    },
    verify(ctx, findings) {
      return verifyFixed(rule, ctx, findings);
    },
  });
  return rule;
}

function problemFor(state: TableState): string | null {
  if (state.rls === "disabled") return "disabled";
  if (state.created && state.rls !== "enabled") return "missing-rls";
  if ((state.created || state.rls === "enabled") && state.policies === 0 && state.rls === "enabled") return "no-policy";
  if (state.created && state.rls === "enabled" && state.policies === 0) return "no-policy";
  return null;
}

function messageFor(sql: string, problem: string): string {
  if (problem === "disabled") return `Table ${sql} disables row level security.`;
  if (problem === "no-policy") return `Table ${sql} has row level security enabled and no policy.`;
  return `Table ${sql} is created without ENABLE ROW LEVEL SECURITY.`;
}

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function scanSql(sql: string): Array<{ kind: "create" | "enable" | "disable" | "policy"; ident: Ident }> {
  const hits: Array<{ index: number; kind: "create" | "enable" | "disable" | "policy"; ident: Ident }> = [];
  const specs: Array<{ kind: "create" | "enable" | "disable" | "policy"; re: RegExp }> = [
    {
      kind: "create",
      re: /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*)?("[^"]+"|[A-Za-z_][\w$]*)/gi,
    },
    {
      kind: "enable",
      re: /\balter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?((?:"[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*)?("[^"]+"|[A-Za-z_][\w$]*)\s+enable\s+row\s+level\s+security/gi,
    },
    {
      kind: "disable",
      re: /\balter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?((?:"[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*)?("[^"]+"|[A-Za-z_][\w$]*)\s+disable\s+row\s+level\s+security/gi,
    },
    {
      kind: "policy",
      re: /\bcreate\s+policy\s+(?:"[^"]+"|[A-Za-z_][\w$]*)\s+on\s+((?:"[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*)?("[^"]+"|[A-Za-z_][\w$]*)/gi,
    },
  ];
  for (const spec of specs) {
    let match: RegExpExecArray | null;
    while ((match = spec.re.exec(sql))) {
      hits.push({ index: match.index, kind: spec.kind, ident: parseIdent(match[1], match[2]) });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits;
}

function parseIdent(schemaPart: string | undefined, namePart: string): Ident {
  const quotedName = namePart.startsWith('"');
  const table = quotedName ? namePart.slice(1, -1) : namePart.toLowerCase();
  let schema = "public";
  let quotedSchema = false;
  if (schemaPart) {
    const raw = schemaPart.replace(/\s+/g, "").replace(/\.$/, "");
    quotedSchema = raw.startsWith('"');
    schema = quotedSchema ? raw.slice(1, -1) : raw.toLowerCase();
  }
  const sqlSchema = quotedSchema ? `"${schema}"` : schema;
  const sqlTable = quotedName ? `"${table}"` : table;
  const key = `${schema}.${quotedName ? `"${table}"` : table}`;
  return { key, sql: `${sqlSchema}.${sqlTable}` };
}

function migrationSql(tables: string[]): string {
  const body = tables
    .map(
      (table) => `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vibe_rescue_deny_all" ON ${table};
CREATE POLICY "vibe_rescue_deny_all"
  ON ${table}
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);`,
    )
    .join("\n\n");
  return `-- Generated by vibe-rescue-kit (deepelynx)
-- Enables row level security and adds an explicit deny-all policy for anon and authenticated.
-- This file does not connect to a database. Review it before you apply migrations.
-- The service role bypasses RLS. Replace vibe_rescue_deny_all with a real policy
-- when a client should read or write the table.

${body}
`;
}

function stamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}
