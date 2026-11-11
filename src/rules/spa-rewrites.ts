import type { Finding, Rule, RuleDefinition } from "../types.js";
import { defineRule, verifyFixed } from "../engine/define.js";
import { depNames, readPackage } from "../engine/package-file.js";
import type { Strategy } from "./types.js";

const ROUTER_DEPS = [
  "react-router-dom",
  "react-router",
  "wouter",
  "@tanstack/react-router",
  "vue-router",
  "@solidjs/router",
];

export const spaRewrites: Strategy = {
  id: "spa-rewrites",
  defaults() {
    return {
      id: "spa-rewrites",
      title: "SPA refresh and deep-link 404s",
      description: "Vite single-page apps need a host rewrite to index.html or refreshing a client route returns 404.",
      severity: "error",
      scopeNote: "Writes Vercel, Netlify, and static redirect files. It does not deploy, and it skips Next.js.",
      strategy: "spa-rewrites",
      watchGlobs: ["index.html", "vercel.json", "netlify.toml", "public/_redirects", "_redirects", "package.json"],
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
    watchGlobs: def.watchGlobs,
    async detect(ctx) {
      const pkg = await readPackage(ctx);
      if (!pkg) return [];
      const deps = depNames(pkg.json);
      if (deps.has("next")) return [];
      const files = await ctx.glob(["index.html", "public/index.html", "vite.config.*", "vercel.json", "netlify.toml", "public/_redirects", "_redirects", "src/**/*.{ts,tsx,js,jsx}", "app/**/*.{ts,tsx,js,jsx}"]);
      const names = new Set(files);
      const vite = deps.has("vite") || files.some((file) => /^vite\.config\./.test(file));
      const html = names.has("index.html") || names.has("public/index.html");
      if (!vite || !html) return [];
      const routerDep = ROUTER_DEPS.some((name) => deps.has(name));
      let routerCode = false;
      if (!routerDep) {
        for (const file of files) {
          if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
          const text = await ctx.read(file);
          if (/BrowserRouter|createBrowserRouter|createRouter|RouterProvider/.test(text)) {
            routerCode = true;
            break;
          }
        }
      }
      if (!routerDep && !routerCode) return [];

      const findings: Finding[] = [];
      const vercel = await ctx.readMaybe("vercel.json");
      if (vercel == null) {
        findings.push(finding(def.id, severity, "vercel", "vercel.json", "Vercel rewrite to /index.html is missing."));
      } else {
        try {
          const json = JSON.parse(vercel) as { rewrites?: unknown };
          if (!hasSpaRewrite(json)) {
            findings.push(finding(def.id, severity, "vercel", "vercel.json", "vercel.json has no SPA rewrite to /index.html."));
          }
        } catch {
          findings.push({
            ...finding(def.id, severity, "vercel", "vercel.json", "vercel.json is not valid JSON, so the SPA rewrite could not be added."),
            fixable: false,
          });
        }
      }

      const netlify = await ctx.readMaybe("netlify.toml");
      if (netlify == null || !hasNetlifySpa(netlify)) {
        findings.push(finding(def.id, severity, "netlify", "netlify.toml", "Netlify redirect from /* to /index.html (200) is missing."));
      }

      const redirects = (await ctx.readMaybe("public/_redirects")) ?? (await ctx.readMaybe("_redirects"));
      const redirectFile = (await ctx.exists("public/_redirects")) || !(await ctx.exists("_redirects")) ? "public/_redirects" : "_redirects";
      if (!redirects || !hasRedirectsSpa(redirects)) {
        findings.push(finding(def.id, severity, "redirects", redirectFile, "Static host _redirects rule /* /index.html 200 is missing."));
      }
      return findings;
    },
    async fix(ctx, findings) {
      const hasApi = (await ctx.glob(["api/**/*", "pages/api/**/*", "app/api/**/*"])).length > 0;
      for (const item of findings) {
        if (item.meta?.host === "vercel") {
          const current = await ctx.readMaybe("vercel.json");
          const json = current ? (JSON.parse(current) as Record<string, unknown>) : {};
          const rewrites = Array.isArray(json.rewrites) ? [...json.rewrites] : [];
          rewrites.push({
            source: hasApi ? "/((?!api/).*)" : "/(.*)",
            destination: "/index.html",
          });
          json.rewrites = rewrites;
          await ctx.write("vercel.json", `${JSON.stringify(json, null, 2)}\n`);
        }
        if (item.meta?.host === "netlify") {
          const current = (await ctx.readMaybe("netlify.toml")) ?? "";
          const block = `[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`;
          const sep = current.length === 0 ? "" : current.endsWith("\n") ? "\n" : "\n\n";
          await ctx.write("netlify.toml", `${current}${sep}${block}`);
        }
        if (item.meta?.host === "redirects") {
          const file = String(item.file ?? "public/_redirects");
          const current = (await ctx.readMaybe(file)) ?? "";
          const line = "/*    /index.html   200\n";
          const sep = current.length === 0 ? "" : current.endsWith("\n") ? "" : "\n";
          await ctx.write(file, `${current}${sep}${line}`);
        }
      }
      return { notes: ["Host rewrites send unknown paths to index.html with status 200. API routes are left alone when an api/ directory exists."] };
    },
    verify(ctx, findings) {
      return verifyFixed(rule, ctx, findings);
    },
  });
  return rule;
}

function finding(ruleId: string, severity: "error" | "warning", host: string, file: string, message: string): Finding {
  return {
    fingerprint: `spa-rewrites:${host}`,
    ruleId,
    severity,
    message,
    file,
    hint: "A rewrite to /index.html will be added. Nothing is deployed.",
    meta: { host },
  };
}

function hasSpaRewrite(json: { rewrites?: unknown }): boolean {
  if (!Array.isArray(json.rewrites)) return false;
  return json.rewrites.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const row = entry as { source?: string; destination?: string };
    const destination = String(row.destination ?? "").replace(/\/$/, "");
    const source = String(row.source ?? "");
    return destination === "/index.html" && (source.includes("(") || source.includes(":path") || source.includes("*"));
  });
}

function hasNetlifySpa(toml: string): boolean {
  const blocks = toml.split(/\[\[redirects\]\]/).slice(1);
  return blocks.some((block) => /to\s*=\s*["']\/index\.html["']/.test(block) && /status\s*=\s*200/.test(block) && /from\s*=\s*["']\/\*["']/.test(block));
}

function hasRedirectsSpa(text: string): boolean {
  return /^\s*\/\*\s+\/index\.html\s+200\s*$/m.test(text);
}
