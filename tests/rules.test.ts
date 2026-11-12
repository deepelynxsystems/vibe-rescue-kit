import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { reportJson, reportText } from "../src/engine/report.js";
import { run } from "../src/engine/runner.js";
import { extractSpecifiers } from "../src/engine/text.js";
import { fixProject, rule, text, withFixture, withTemp } from "./helpers.js";

const SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ.signature1";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.signature1";
const STRIPE = "sk_test_1234567890abcdefghij";
const PK = "pk_test_1234567890abcdefghij";

describe("leaked-secrets", () => {
  it("flags client secrets and keeps anon keys and server files", async () => {
    await withFixture("leaked-secrets", async (dir) => {
      const report = await run({ root: dir, mode: "scan", ruleId: "leaked-secrets" });
      const found = rule(report, "leaked-secrets");
      expect(found?.findings.map((item) => item.file).sort()).toEqual([
        ".env",
        ".env.example",
        ".gitignore",
        "src/App.tsx",
        "src/lib/supabase.ts",
        "src/lib/supabase.ts",
      ].sort());
      expect(reportText(report)).not.toContain(STRIPE);
      expect(reportText(report)).not.toContain(SERVICE);
      expect(reportJson(report)).not.toContain(STRIPE);
      expect(reportJson(report)).not.toContain(SERVICE);
      const fixed = await fixProject(dir);
      expect(fixed.ok).toBe(true);
      const source = await text(dir, "src/lib/supabase.ts");
      expect(source).not.toContain(SERVICE);
      expect(source).not.toContain(STRIPE);
      expect(source).toContain(ANON);
      expect(source).toContain(PK);
      expect(source).toContain("serverOnlyEnv");
      expect(await text(dir, "server/billing.ts")).toContain(STRIPE);
      expect(await text(dir, "pages/api/charge.ts")).toContain(STRIPE);
      expect(await text(dir, "src/App.tsx")).toContain('serverOnlyEnv("SUPABASE_SERVICE_ROLE_KEY")');
      expect(await text(dir, ".gitignore")).toContain(".env");
      expect(await text(dir, ".env")).toContain(SERVICE);
      expect(await text(dir, ".env.example")).not.toContain(STRIPE);
      const again = await run({ root: dir, mode: "fix" });
      expect(again.ok).toBe(true);
      expect(again.totals.filesChanged).toBe(0);
    });
  });

  it("treats Next.js server modules as server code and warns when .gitignore misses .env", async () => {
    await withTemp(async (dir) => {
      await writeProject(dir, {
        "package.json": JSON.stringify({ dependencies: { next: "14.2.0" } }),
        "app/debug/page.tsx": "export default function Page() { return process.env.SUPABASE_SERVICE_ROLE_KEY; }\n",
        "app/shop/route.ts": "export function GET() { return process.env.SUPABASE_SERVICE_ROLE_KEY; }\n",
        "app/widget/page.tsx": "\"use client\";\nexport default function Page() { return process.env.SUPABASE_SERVICE_ROLE_KEY; }\n",
      });
      const report = await run({ root: dir, mode: "scan", ruleId: "leaked-secrets" });
      const files = rule(report, "leaked-secrets")?.findings.map((item) => item.file).sort();
      expect(files).toEqual([".gitignore", "app/widget/page.tsx"]);
      const warning = rule(report, "leaked-secrets")?.findings.find((item) => item.file === ".gitignore");
      expect(warning?.severity).toBe("warning");
    });
  });
});

describe("supabase-rls", () => {
  it("adds a deny-all migration and does not touch a database", async () => {
    await withFixture("supabase-rls", async (dir) => {
      const report = await run({ root: dir, mode: "scan", ruleId: "supabase-rls" });
      const messages = rule(report, "supabase-rls")?.findings.map((item) => item.message).join("\n") ?? "";
      expect(messages).toContain("public.notes");
      expect(messages).toContain("public.legacy_flags");
      expect(messages).toContain('public."Notes"');
      expect(messages).toContain("public.widgets");
      expect(messages).not.toContain("public.audit_log");
      expect(messages).not.toContain("public.profiles");
      expect(messages).not.toContain("internal.secrets");
      expect(messages).not.toContain("discarded_goals");
      const fixed = await fixProject(dir);
      expect(fixed.ok).toBe(true);
      const files = await readdir(join(dir, "supabase/migrations"));
      const created = files.find((file) => file.endsWith("_vibe_rescue_enable_rls.sql"));
      expect(created).toBeTruthy();
      const sql = await text(dir, `supabase/migrations/${created}`);
      expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
      expect(sql).toContain('POLICY "vibe_rescue_deny_all"');
      expect(sql).toContain("USING (false)");
      expect(sql).toContain("does not connect to a database");
      expect(sql).toContain("public.notes");
      expect(sql).not.toContain("public.profiles ENABLE");
      expect(sql).not.toContain("audit_log");
      const again = await run({ root: dir, mode: "scan" });
      expect(again.ok).toBe(true);
    });
  });
});

describe("missing-env", () => {
  it("writes .env.example and a startup check that fails while values are empty", async () => {
    await withFixture("missing-env", async (dir) => {
      const report = await run({ root: dir, mode: "scan", ruleId: "missing-env" });
      const names = rule(report, "missing-env")?.findings.map((item) => item.meta?.name).sort();
      expect(names).toEqual(["API_TOKEN", "VITE_SUPABASE_URL"]);
      const fixed = await fixProject(dir);
      expect(fixed.ok).toBe(true);
      const example = await text(dir, ".env.example");
      expect(example).toContain("API_TOKEN=");
      expect(example).toContain("VITE_SUPABASE_URL=");
      const check = await text(dir, ".vibe-rescue/check-env.mjs");
      expect(check).toContain('"API_TOKEN"');
      expect(check).toContain('"VITE_SUPABASE_URL"');
      expect(await text(dir, "package.json")).toContain("check-env.mjs");
      const ran = spawnSync(process.execPath, [".vibe-rescue/check-env.mjs"], { cwd: dir, encoding: "utf8" });
      expect(ran.status).toBe(1);
      expect(ran.stderr).toContain("API_TOKEN");
      const again = await run({ root: dir, mode: "scan" });
      expect(again.ok).toBe(true);
    });
  });

  it("accepts a documented name when .env is absent and ignores platform variables", async () => {
    await withTemp(async (dir) => {
      await writeProject(dir, {
        "package.json": JSON.stringify({ scripts: { dev: "vite" } }),
        ".env.example": "VITE_SUPABASE_URL=\n",
        "src/app.ts": [
          "export const url = import.meta.env.VITE_SUPABASE_URL;",
          "export const region = process.env.VERCEL_REGION;",
          "export const proxy = process.env.HTTPS_PROXY;",
          "export const repl = process.env.REPL_ID;",
        ].join("\n"),
        "apps/web/src/main.ts": "export const key = process.env.WIDGET_KEY;\n",
      });
      const report = await run({ root: dir, mode: "scan", ruleId: "missing-env" });
      const names = rule(report, "missing-env")?.findings.map((item) => item.meta?.name);
      expect(names).toEqual(["WIDGET_KEY"]);
    });
  });

  it("does not fail on ||, ??, or a default parameter", async () => {
    await withTemp(async (dir) => {
      await writeProject(dir, {
        "package.json": JSON.stringify({ scripts: { dev: "vite" } }),
        "src/config.ts": [
          "export const required = process.env.REQUIRED_TOKEN;",
          "export const fallback = process.env.OPTIONAL_TOKEN || \"local\";",
          "export const nil = import.meta.env.VITE_OPTIONAL ?? \"\";",
          "export const site = process.env.SITE_URL?.trim() || \"https://example.com\";",
          "export function run(port = process.env.PORT_DEFAULT) { return port; }",
        ].join("\n"),
      });
      const report = await run({ root: dir, mode: "scan", ruleId: "missing-env" });
      const names = rule(report, "missing-env")?.findings.map((item) => item.meta?.name);
      expect(names).toEqual(["REQUIRED_TOKEN"]);
    });
  });
});

describe("spa-rewrites", () => {
  it("adds host rewrites and preserves existing vercel config", async () => {
    await withFixture("spa-rewrites", async (dir) => {
      const before = await run({ root: dir, mode: "scan", ruleId: "spa-rewrites" });
      expect(rule(before, "spa-rewrites")?.findings).toHaveLength(1);
      const fixed = await fixProject(dir);
      expect(fixed.ok).toBe(true);
      const vercel = JSON.parse(await text(dir, "vercel.json")) as { buildCommand: string; rewrites: Array<{ source: string; destination: string }> };
      expect(vercel.buildCommand).toBe("npm run build");
      expect(vercel.rewrites[0].destination).toBe("/index.html");
      expect(vercel.rewrites[0].source).toBe("/((?!api/).*)");
      expect(await text(dir, "netlify.toml")).toContain('to = "/index.html"');
      expect(await text(dir, "public/_redirects")).toContain("/index.html");
      expect((await run({ root: dir, mode: "scan" })).ok).toBe(true);
    });
  });

  it("skips Next.js projects", async () => {
    await withTemp(async (dir) => {
      await writeProject(dir, {
        "package.json": JSON.stringify({ dependencies: { next: "^15.0.0", react: "^18.3.1" } }),
        "index.html": "<div id=\"root\"></div>\n",
        "src/main.tsx": "export const route = 'BrowserRouter';\n",
      });
      const report = await run({ root: dir, mode: "scan", ruleId: "spa-rewrites" });
      expect(rule(report, "spa-rewrites")?.findings ?? []).toHaveLength(0);
    });
  });

  it("accepts any one host fallback and still flags a nested SPA with none", async () => {
    await withTemp(async (dir) => {
      await writeProject(dir, {
        "package.json": JSON.stringify({ dependencies: { vite: "^6.0.0", "react-router-dom": "^6.0.0" } }),
        "index.html": "<div id=\"root\"></div>\n",
        "src/main.tsx": "export const route = 'BrowserRouter';\n",
        "netlify.toml": "[[redirects]]\n  from = \"/*\"\n  to = \"/index.html\"\n  status = 200\n",
        "apps/web/package.json": JSON.stringify({ dependencies: { vite: "^6.0.0", "react-router-dom": "^6.0.0" } }),
        "apps/web/index.html": "<div id=\"root\"></div>\n",
        "apps/web/src/main.tsx": "export const route = 'BrowserRouter';\n",
      });
      const report = await run({ root: dir, mode: "scan", ruleId: "spa-rewrites" });
      const files = rule(report, "spa-rewrites")?.findings.map((item) => item.file);
      expect(files).toEqual(["apps/web/vercel.json"]);
    });
  });
});

describe("hardcoded-localhost", () => {
  it("replaces client localhost URLs and leaves server files", async () => {
    await withFixture("hardcoded-localhost", async (dir) => {
      const report = await run({ root: dir, mode: "scan", ruleId: "hardcoded-localhost" });
      expect(rule(report, "hardcoded-localhost")?.findings).toHaveLength(3);
      const fixed = await fixProject(dir);
      expect(fixed.ok).toBe(true);
      const source = await text(dir, "src/api.ts");
      expect(source).not.toContain("http://localhost");
      expect(source).not.toContain("127.0.0.1");
      expect(source).toContain("import.meta.env.VITE_API_BASE_URL");
      expect(source).toContain("import.meta.env.VITE_SUPABASE_URL");
      expect(source).toContain("/api/items");
      expect(await text(dir, "src/server/internal.ts")).toContain("http://localhost:4000");
      expect(await text(dir, ".env.example")).toContain("VITE_API_BASE_URL=http://localhost:3000");
      expect(await text(dir, ".env.example")).toContain("VITE_SUPABASE_URL=http://localhost:54321");
      expect((await run({ root: dir, mode: "scan" })).ok).toBe(true);
    });
  });

  it("ignores dev-only and placeholder URLs and flags a bare host", async () => {
    await withTemp(async (dir) => {
      await writeProject(dir, {
        "package.json": JSON.stringify({ dependencies: { vite: "^6.0.0" } }),
        "src/api.ts": [
          "export const live = \"http://localhost:4000\";",
          "const preview = import.meta.env.DEV ? \"http://localhost:3000\" : \"\";",
          "export const field = { placeholder: \"http://127.0.0.1:8080\" };",
          "export const host = \"localhost:5173\";",
          "const origins = dev ? ['https://example.com', 'http://localhost:9'] : ['https://example.com'];",
          "void preview; void field; void origins;",
        ].join("\n"),
        "src/vite.config.ts": "export const target = \"http://localhost:3000\";\n",
      });
      const report = await run({ root: dir, mode: "scan", ruleId: "hardcoded-localhost" });
      const values = rule(report, "hardcoded-localhost")?.findings.map((item) => item.message);
      expect(values).toEqual([
        "Hardcoded http://localhost:4000 in src/api.ts.",
        "Hardcoded localhost:5173 in src/api.ts.",
      ]);
    });
  });
});

describe("import-paths", () => {
  it("reads real import specifiers and skips strings, comments, and JSDoc", () => {
    const source = [
      "import.meta.env.VITE_X;",
      "const sample = \"import \";",
      "// imported from \"not-a-pkg\"",
      "/** @type {import('postcss-load-config').Config} */",
      "export const marker = sample.startsWith('import ');",
      "import { format } from \"date-fns\";",
      "export { format }",
      "import { pad } from \"left-pad\"",
      "const req = require(\"left-pad\");",
      "void marker; void req; void format;",
    ].join("\n");
    expect(extractSpecifiers(source).map((hit) => hit.spec).sort()).toEqual(["date-fns", "left-pad", "left-pad"]);
  });

  it("fixes casing and adds a missing dependency", async () => {
    await withFixture("import-paths", async (dir) => {
      const report = await run({ root: dir, mode: "scan", ruleId: "import-paths" });
      const findings = rule(report, "import-paths")?.findings ?? [];
      const messages = findings.map((item) => item.message).join("\n");
      expect(messages).toContain("./components/button");
      expect(messages).toContain("date-fns");
      expect(messages).toContain("untagged-dep");
      expect(messages).not.toContain("react");
      expect(messages).not.toContain("left-pad");
      expect(messages).not.toContain("postcss-load-config");
      expect(messages).not.toContain("npm:resend");
      expect(messages).not.toContain('"fs"');
      expect(findings.filter((item) => item.meta?.kind === "case")).toHaveLength(1);
      const fixed = await fixProject(dir);
      expect(fixed.ok).toBe(true);
      const source = await text(dir, "src/App.tsx");
      expect(source).toContain('from "./components/Button"');
      expect(source).toContain('from "@/lib/safe"');
      const pkg = JSON.parse(await text(dir, "package.json")) as { dependencies: Record<string, string> };
      expect(pkg.dependencies["date-fns"]).toBe("*");
      expect(pkg.dependencies.react).toBe("^18.3.1");
      expect(pkg.dependencies["untagged-dep"]).toBeUndefined();
      const web = JSON.parse(await text(dir, "apps/web/package.json")) as { dependencies: Record<string, string> };
      expect(web.dependencies["untagged-dep"]).toBe("*");
      expect(web.dependencies["left-pad"]).toBe("^1.3.0");
      expect((await run({ root: dir, mode: "scan" })).ok).toBe(true);
    });
  });
});

describe("webhook-signature", () => {
  it("adds constructEvent to App Router and Pages handlers", async () => {
    await withFixture("webhook-signature", async (dir) => {
      const report = await run({ root: dir, mode: "scan", ruleId: "webhook-signature" });
      const files = rule(report, "webhook-signature")?.findings.map((item) => item.file).sort();
      expect(files).toEqual(["pages/api/stripe-webhook.ts", "server/stripe-webhook.ts"]);
      const fixed = await fixProject(dir);
      expect(fixed.ok).toBe(true);
      const app = await text(dir, "server/stripe-webhook.ts");
      const pages = await text(dir, "pages/api/stripe-webhook.ts");
      expect(app).toContain("constructEvent");
      expect(app).toContain("STRIPE_WEBHOOK_SECRET");
      expect(app).not.toContain("await req.json()");
      expect(pages).toContain("constructEvent");
      expect(pages).toContain("bodyParser: false");
      expect(await text(dir, "src/billing-ok.ts")).not.toContain("constructEvent");
      expect(await text(dir, ".env.example")).toContain("STRIPE_WEBHOOK_SECRET=");
      expect((await run({ root: dir, mode: "scan" })).ok).toBe(true);
    });
  });
});

describe("broken-spa example", () => {
  it("fixes every built-in rule and stays fixed", async () => {
    await withFixture("examples/broken-spa", async (dir) => {
      const before = await run({ root: dir, mode: "scan" });
      expect(before.ok).toBe(false);
      const ids = new Set(before.results.filter((item) => item.findings.length > 0).map((item) => item.ruleId));
      for (const id of [
        "leaked-secrets",
        "import-paths",
        "hardcoded-localhost",
        "spa-rewrites",
        "supabase-rls",
        "webhook-signature",
        "missing-env",
      ]) {
        expect(ids.has(id)).toBe(true);
      }
      const fixed = await fixProject(dir);
      expect(fixed.ok).toBe(true);
      const main = await text(dir, "src/main.tsx");
      expect(main).not.toContain(SERVICE);
      expect(main).not.toContain("http://localhost:3000");
      expect(main).toContain("./components/Button");
      expect(await text(dir, "src/lib/public.ts")).toContain(ANON);
      expect(await text(dir, "src/lib/public.ts")).toContain(PK);
      expect(await text(dir, "server/billing.ts")).toContain(STRIPE);
      const after = await run({ root: dir, mode: "scan" });
      expect(after.ok).toBe(true);
      const second = await run({ root: dir, mode: "fix" });
      expect(second.totals.filesChanged).toBe(0);
    });
  });
});

async function writeProject(dir: string, files: Record<string, string>): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  for (const [file, contents] of Object.entries(files)) {
    await mkdir(join(dir, dirname(file)), { recursive: true });
    await writeFile(join(dir, file), contents.endsWith("\n") ? contents : `${contents}\n`);
  }
}
