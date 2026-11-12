import type { Finding, Rule, RuleDefinition } from "../types.js";
import { defineRule, verifyFixed } from "../engine/define.js";
import { depNames } from "../engine/package-file.js";
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
      description: "Vite single-page apps need one host rewrite to index.html or refreshing a client route returns 404.",
      severity: "error",
      scopeNote: "One existing Vercel, Netlify, or _redirects fallback is enough. It does not deploy, and it skips Next.js.",
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
      const packages = await ctx.glob(["**/package.json"]);
      const findings: Finding[] = [];
      for (const pkgFile of packages) {
        const dir = pkgFile === "package.json" ? "" : pkgFile.slice(0, -"/package.json".length);
        if (!(await isViteSpa(ctx, dir))) continue;
        if (await hasFallback(ctx, dir)) continue;
        const vercelPath = joinRel(dir, "vercel.json");
        const vercel = await ctx.readMaybe(vercelPath);
        let fixable = true;
        if (vercel != null) {
          try {
            JSON.parse(vercel);
          } catch {
            fixable = false;
          }
        }
        const item = finding(
          def.id,
          severity,
          dir || ".",
          vercelPath,
          dir
            ? `${dir} is a Vite SPA with client routes and no host fallback to /index.html.`
            : "Vite SPA has client routes and no host fallback to /index.html.",
        );
        item.meta = { ...item.meta, dir };
        if (!fixable) item.fixable = false;
        findings.push(item);
      }
      return findings;
    },
    async fix(ctx, findings) {
      for (const item of findings) {
        const dir = String(item.meta?.dir ?? "");
        const hasApi = (await ctx.glob([joinRel(dir, "api/**/*"), joinRel(dir, "pages/api/**/*"), joinRel(dir, "app/api/**/*")])).length > 0;
        const vercelPath = joinRel(dir, "vercel.json");
        const current = await ctx.readMaybe(vercelPath);
        const json = current ? (JSON.parse(current) as Record<string, unknown>) : {};
        const rewrites = Array.isArray(json.rewrites) ? [...json.rewrites] : [];
        rewrites.push({
          source: hasApi ? "/((?!api/).*)" : "/(.*)",
          destination: "/index.html",
        });
        json.rewrites = rewrites;
        await ctx.write(vercelPath, `${JSON.stringify(json, null, 2)}\n`);

        const netlifyPath = joinRel(dir, "netlify.toml");
        const netlify = (await ctx.readMaybe(netlifyPath)) ?? "";
        if (!hasNetlifySpa(netlify)) {
          const block = `[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`;
          const sep = netlify.length === 0 ? "" : netlify.endsWith("\n") ? "\n" : "\n\n";
          await ctx.write(netlifyPath, `${netlify}${sep}${block}`);
        }

        const redirectPath = (await ctx.exists(joinRel(dir, "_redirects"))) && !(await ctx.exists(joinRel(dir, "public/_redirects")))
          ? joinRel(dir, "_redirects")
          : joinRel(dir, "public/_redirects");
        const redirects = (await ctx.readMaybe(redirectPath)) ?? "";
        if (!hasRedirectsSpa(redirects)) {
          const line = "/*    /index.html   200\n";
          const sep = redirects.length === 0 ? "" : redirects.endsWith("\n") ? "" : "\n";
          await ctx.write(redirectPath, `${redirects}${sep}${line}`);
        }
      }
      return { notes: ["One host fallback is enough. The fix still writes Vercel, Netlify, and _redirects so a static host can refresh a client route. API routes are left alone when an api/ directory exists."] };
    },
    verify(ctx, findings) {
      return verifyFixed(rule, ctx, findings);
    },
  });
  return rule;
}

async function isViteSpa(ctx: SpaCtx, dir: string): Promise<boolean> {
  const pkgRaw = await ctx.readMaybe(joinRel(dir, "package.json"));
  if (!pkgRaw) return false;
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(pkgRaw) as Record<string, unknown>;
  } catch {
    return false;
  }
  const deps = depNames(json);
  if (deps.has("next")) return false;
  const configs = ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs", "vite.config.cjs"];
  let vite = deps.has("vite");
  if (!vite) {
    for (const name of configs) {
      if (await ctx.exists(joinRel(dir, name))) {
        vite = true;
        break;
      }
    }
  }
  if (!vite) return false;
  const html = (await ctx.exists(joinRel(dir, "index.html"))) || (await ctx.exists(joinRel(dir, "public/index.html")));
  if (!html) return false;
  if (ROUTER_DEPS.some((name) => deps.has(name))) return true;
  const files = await ctx.glob([joinRel(dir, "src/**/*.{ts,tsx,js,jsx}"), joinRel(dir, "app/**/*.{ts,tsx,js,jsx}")]);
  for (const file of files) {
    const text = await ctx.read(file);
    if (/BrowserRouter|createBrowserRouter|createRouter|RouterProvider/.test(text)) return true;
  }
  return false;
}

async function hasFallback(ctx: SpaCtx, dir: string): Promise<boolean> {
  return fallbackIn(ctx, dir);
}

async function fallbackIn(ctx: SpaCtx, dir: string): Promise<boolean> {
  const vercel = await ctx.readMaybe(joinRel(dir, "vercel.json"));
  if (vercel != null) {
    try {
      if (hasSpaRewrite(JSON.parse(vercel) as { rewrites?: unknown })) return true;
    } catch {
      // Invalid JSON is not a fallback. Another host file still counts.
    }
  }
  const netlify = await ctx.readMaybe(joinRel(dir, "netlify.toml"));
  if (netlify && hasNetlifySpa(netlify)) return true;
  const publicRedirects = await ctx.readMaybe(joinRel(dir, "public/_redirects"));
  if (publicRedirects && hasRedirectsSpa(publicRedirects)) return true;
  const rootRedirects = await ctx.readMaybe(joinRel(dir, "_redirects"));
  return Boolean(rootRedirects && hasRedirectsSpa(rootRedirects));
}

function joinRel(dir: string, file: string): string {
  return dir ? `${dir}/${file}` : file;
}

interface SpaCtx {
  read(file: string): Promise<string>;
  readMaybe(file: string): Promise<string | null>;
  exists(file: string): Promise<boolean>;
  glob(patterns: string[]): Promise<string[]>;
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
