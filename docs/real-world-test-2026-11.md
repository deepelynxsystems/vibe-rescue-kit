# Real-world scan of vibe-rescue-kit 1.0.0

Scan-only evaluation of the published package `vibe-rescue-kit@1.0.0` against 15 public apps built with Lovable, Bolt, v0, Replit, or Cursor. No `fix` run, no pushes, issues, pull requests, or comments on those repositories. This pull request adds this report only.

Date: 12 November 2026. Scanner: `npx vibe-rescue-kit@1.0.0 scan --json <clone>` (npm version `1.0.0`, Node.js v22.23.4). Each repo was a `--depth 1` clone. The npm package was cached before timing, so the durations below include CLI startup and the scan, not the first download.

## Headline

| | |
| --- | --- |
| Repos | 15 |
| Findings | 245 |
| True positives | 80 |
| False positives | 121 |
| Unclear | 44 |
| Crashes / rule errors | 0 |
| Slowest scan | 0.97s (`thebarlev/app.ux`, 662 code files) |

Every process exited 1 because findings remained. None exited 2. Stderr was only the package credit line. No rule reported an `error` action.

The useful hits are real: unignored committed `.env` files, a handful of undeclared imports, Vite SPAs with no host fallback, and app-owned env names that are not in `.env.example`. Most of the volume is noise. `import-paths` produced 85 false positives out of 90 findings, almost all because it reads only the root `package.json`. `missing-env` fails a correct public clone whenever `.env` is gitignored. `supabase-rls` reported nothing, including on a v0 app whose schema lives in `scripts/*.sql` and has tables with row level security never enabled.

## How a finding was classified

- **True positive.** The code matches the problem the rule claims to catch, and a maintainer should do something about it.
- **False positive.** The finding is wrong, or it fires on a condition the project has already handled (documented env name with a gitignored `.env`, a Netlify rewrite that already exists, a dependency declared in the workspace package that owns the file, a string the import parser misread).
- **Unclear.** The detector matched, but the reference is optional, has a working default, or is an intentional local-only default. Acting on it is not obviously a fix.

Secret values are not copied. Where a scan or a manual look found a credential-shaped string, the notes record the repo, path, rule, and type only.

## Summary

Counts in each rule column are true positive / false positive / unclear. `rls` is `supabase-rls`. `hook` is `webhook-signature`. `localhost` is `hardcoded-localhost`.

| Repo | Builder | Stack | Files | Scan | Findings | leaked | import | localhost | spa | rls | hook | missing-env | Crash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [gptme/gptme-webui](https://github.com/gptme/gptme-webui) `703e928` | Lovable | Vite, React, react-router | 173 | 0.61s | 11 | 0 | 0/1/0 | 1/2/1 | 3/0/0 | 0 | 0 | 0/0/3 | 0 |
| [mudassiralladatkhan/learnhub-unlocked-academy](https://github.com/mudassiralladatkhan/learnhub-unlocked-academy) `d9a3ed1` | Lovable | Vite, React, react-router, Supabase | 138 | 0.59s | 3 | 0 | 0 | 0 | 3/0/0 | 0 | 0 | 0 | 0 |
| [honeyym/classnoteco](https://github.com/honeyym/classnoteco) `2534ce3` | Lovable | Vite, React, react-router, Supabase | 175 | 0.59s | 5 | 1/0/0 | 0 | 0 | 3/0/0 | 0 | 0 | 0/0/1 | 0 |
| [afllewellyn/act-solo-ai](https://github.com/afllewellyn/act-solo-ai) `f4c6a62` | Lovable | Vite, React, react-router, Supabase | 243 | 0.67s | 11 | 0 | 2/1/0 | 0/1/0 | 3/0/0 | 0 | 0 | 0/4/0 | 0 |
| [AndreyKornyusko/quick-chat-react](https://github.com/AndreyKornyusko/quick-chat-react) `eb2dff7` | Lovable | Vite library + React demo, Supabase; nested Next demo | 258 | 0.61s | 10 | 0 | 0/5/0 | 0 | 1/2/0 | 0 | 0 | 2/0/0 | 0 |
| [patelpratyush/ResumeSharp](https://github.com/patelpratyush/ResumeSharp) `221ac61` | Lovable | Vite, React, react-router, Supabase | 163 | 0.59s | 6 | 0 | 0 | 0/1/0 | 0/2/0 | 0 | 0 | 3/0/0 | 0 |
| [AniketAslaliya/weekend-builder](https://github.com/AniketAslaliya/weekend-builder) `b4a5115` | Bolt | Vite, React, react-router, Supabase | 76 | 0.57s | 7 | 0 | 1/0/0 | 0 | 3/0/0 | 0 | 0 | 0/3/0 | 0 |
| [Lanthoiba2022/AcademiComeback](https://github.com/Lanthoiba2022/AcademiComeback) `844b723` | Bolt | Vite, React, react-router, Supabase | 183 | 0.67s | 6 | 0 | 0 | 0 | 0/2/0 | 0 | 0 | 0/4/0 | 0 |
| [a-yoshinaga/taskquest](https://github.com/a-yoshinaga/taskquest) `5e3e11f` | Bolt | Vite, React, Supabase, no client router | 53 | 0.55s | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2/0/0 | 0 |
| [bennor/multi-tenant-example](https://github.com/bennor/multi-tenant-example) `5093bf6` | v0 | Next.js 15 App Router | 86 | 0.55s | 2 | 0 | 0/1/0 | 0 | 0 | 0 | 0 | 1/0/0 | 0 |
| [thebarlev/app.ux](https://github.com/thebarlev/app.ux) `6eaaef8` | v0 | Next.js 14, Supabase, billing webhooks | 1068 | 0.97s | 96 | 0/1/0 | 1/2/0 | 0 | 0 | 0 | 0/1/0 | 41/11/39 | 0 |
| [Bekimoon0043/howlow-auction](https://github.com/Bekimoon0043/howlow-auction) `7aefb4d` | Replit | pnpm workspace; nested Vite SPA + Express + Drizzle | 245 | 0.53s | 71 | 0 | 0/70/0 | 0 | 0 | 0 | 0 | 1/0/0 | 0 |
| [dobeutech/ripplesocial](https://github.com/dobeutech/ripplesocial) `36c1791` | Replit | Vite, React, Supabase, no client router | 60 | 0.53s | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0/2/0 | 0 |
| [barisyild/airpsx-frontend](https://github.com/barisyild/airpsx-frontend) `e3f5d94` | Cursor | Vite, Preact | 64 | 0.56s | 7 | 2/0/0 | 0/4/0 | 0 | 0 | 0 | 0 | 1/0/0 | 0 |
| [emarco177/dandi](https://github.com/emarco177/dandi) `5b090b5` | Cursor + v0 | Next.js 14, Supabase, NextAuth | 52 | 0.50s | 6 | 0 | 1/1/0 | 0 | 0 | 0 | 0 | 4/0/0 | 0 |
| **Total** | | | | | **245** | **3/1/0** | **5/85/0** | **1/4/1** | **16/6/0** | **0** | **0/1/0** | **55/24/43** | **0** |

Per-repo true positive / false positive / unclear, same order as the table: 4/3/4, 3/0/0, 4/0/1, 5/6/0, 3/7/0, 3/3/0, 4/3/0, 0/6/0, 2/0/0, 1/1/0, 42/15/39, 1/70/0, 0/2/0, 3/4/0, 5/1/0.

## Per-repo notes

### gptme/gptme-webui (Lovable)

Vite + React Router web UI for a local gptme server. No `.env`, no `.env.example`, and `.gitignore` does not mention `.env`.

- `import-paths` (FP). `src/utils/highlightUtils.ts` is flagged for importing the text `) || firstLine.startsWith(`. The word `import` appears inside `firstLine.startsWith('import ')`. The specifier regex treats the closing quote as the start of a module name.
- `hardcoded-localhost` `src/components/RightSidebarContent.tsx:11` (TP). `VNC_URL` is the `src` of an iframe, fixed at `http://localhost:6080/vnc.html`, with no env override.
- `hardcoded-localhost` `BrowserPreview.tsx:19` (FP). Default prop for an editable preview address, not the app's API origin.
- `hardcoded-localhost` `ConnectionButton.tsx:126` (FP). Placeholder text on an input the user fills in.
- `hardcoded-localhost` `src/utils/connectionConfig.ts:1` (unclear). `DEFAULT_API_URL` is the last fallback after the hash, localStorage, and `VITE_API_URL`. That is the local product, and it is also what a hosted build calls before the user types a URL.
- `spa-rewrites` (3 TP). `BrowserRouter` in `src/App.tsx`. No `vercel.json`, `netlify.toml`, or `_redirects`.
- `missing-env` (3 unclear). `VITE_EMBEDDED_MODE` is a flag compared to `'true'`. `VITE_FLEET_OPERATOR_URL` falls back to the public fleet host. `VITE_API_URL` is one optional override in the chain above. None are documented, and none are required to boot the local UI.

### learnhub-unlocked-academy (Lovable)

EdTech app. `BrowserRouter` in `src/App.tsx`. No host fallback. The three `spa-rewrites` findings are true positives.

`missing-env` and `leaked-secrets` were silent because the Supabase URL and anon key are string literals in `src/integrations/supabase/client.ts` and `src/lib/supabase.ts`, not env reads. Both JWTs decode as `role=anon`. The rule documents that anon keys are left alone, so this is not a missed `leaked-secrets` hit. It does mean a Lovable app can ship with the project URL baked in and produce a clean env scan. `remove-courses.js` at the repo root repeats the same anon-key fallback; that file is outside the env and secret globs.

`.gitignore` does not ignore `.env` (only `*.local`). No `.env` is in the tree, so `leaked-secrets` does not mention the hole.

Supabase SQL is a single root `supabase-schema.sql` (RLS enabled there), outside the migration globs. Nothing to flag in that file.

### classnoteco (Lovable)

- `leaked-secrets` `.env` (TP). The file is tracked. `.gitignore` contains `!.env.example` and never ignores `.env`. The committed values are a Supabase URL, an anon-role JWT, and short Sentry fields. There is no service-role key. The finding is the ignore hole and the tracked file, not a private-key leak.
- `spa-rewrites` (3 TP). `BrowserRouter` in `src/App.tsx`. No host fallback in the repo.
- `missing-env` `VITE_TURNSTILE_SITE_KEY` (unclear). `ForgotPassword.tsx` uses it only when set; password reset still runs through Supabase without it. It is absent from `.env.example`. The Supabase and Sentry names are in both `.env` and `.env.example`, so those were correctly skipped.

Migrations under `supabase/migrations` create tables with RLS enabled. Zero `supabase-rls` findings is consistent with that tree.

### act-solo-ai (Lovable)

- `import-paths` `@tiptap/core` and `lodash` (TP). `InlineScriptEditor.tsx` imports `@tiptap/core` directly; `package.json` has `@tiptap/react` and `@tiptap/pm` but not `@tiptap/core`. `src/lib/logger.ts` imports `lodash`, which is not declared.
- `import-paths` `npm:resend@2.0.0` (FP). `supabase/functions/send-contact-email/index.ts` is a Deno edge function. `npm:resend@2.0.0` is a Deno specifier, not a missing npm dependency. The suggested fix would write that string into `package.json` as a package name.
- `hardcoded-localhost` `previewAuthStorage.ts:69` (FP). `http://localhost:3000` is one origin in an allowlist used when the host is a Lovable dev domain. It is not the app's API base. Rewriting it to `import.meta.env.VITE_API_BASE_URL` would change the editor postMessage check.
- `spa-rewrites` (3 TP). No host fallback.
- `missing-env` (4 FP). `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_POSTHOG_KEY`, and `VITE_POSTHOG_HOST` are all in `.env.example`. The message is only "missing from `.env`", because the real `.env` is gitignored and not in the clone. `.env.example` also contains a real anon-role JWT rather than a placeholder. `leaked-secrets` does not flag anon JWTs, which matches the documented scope.

### quick-chat-react (Lovable)

The root is a publishable chat component (`workspaces`: `nextjs-demo` only) plus a `demo/` app and a `nextjs-demo/` app, each with its own `package.json`.

- `import-paths` (5 FP). `quick-chat-react` and `@vitejs/plugin-react` are in `demo/package.json`. `next`, `eslint-config-next`, and `@supabase/ssr` are in `nextjs-demo/package.json`. The root manifest does not list them, and the rule never opens the nested manifests.
- `spa-rewrites` `vercel.json` (TP). The file exists and sets `outputDirectory` to `dist`, and it has no SPA rewrite. Root `src/App.tsx` uses `BrowserRouter`.
- `spa-rewrites` Netlify and `public/_redirects` (FP). The repo ships a Vercel config and no Netlify deploy. The rule still requires all three host files.
- `missing-env` `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (TP). Referenced from root `src/App.tsx` and absent from any root example file. `vite.config.ts` `define` also injects string fallbacks, including an anon-role JWT. That JWT is outside the client secret globs and would be ignored by the anon check anyway.

### ResumeSharp (Lovable)

- `hardcoded-localhost` `src/lib/api.ts:65` (FP). The literal is `import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:8000" : "")`. Production builds do not use the localhost origin.
- `spa-rewrites` (2 FP). `netlify.toml` already has `from = "/*"`, `to = "/index.html"`, `status = 200`. The scan still reports a missing `vercel.json` and a missing `public/_redirects`.
- `missing-env` (3 TP). `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` are referenced from `src/lib/api.ts`. There is no `.env.example`. `netlify.toml` has placeholder `VITE_API_URL` values under `[context.*.environment]`; the rule does not read that file, and the Supabase names are undocumented either way.

`vite.config.ts` proxies to `http://localhost:8000`. The localhost rule does not scan Vite config. That proxy is a dev-server setting, so it is not counted as a miss of the client rule.

### weekend-builder (Bolt)

- `import-paths` `axe-playwright` (TP). `tests/e2e/user-flow.spec.ts` imports it. It is not in `package.json`.
- `spa-rewrites` (3 TP). `BrowserRouter` in `src/App.tsx`. README says the app is Vercel/Netlify ready. Neither host file exists.
- `missing-env` (3 FP). `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_SENTRY_DSN` are in `.env.example`. Only the local `.env` is absent, and `.gitignore` ignores `.env`. The example's anon key is a real JWT (`role=anon`), which `leaked-secrets` is documented to skip.

### AcademiComeback (Bolt)

Deployed with Netlify (`netlify.toml` build command and a `/*` → `/index.html` 200 redirect).

- `spa-rewrites` (2 FP). Vercel and `public/_redirects` are absent. The host this repo actually uses already rewrites.
- `missing-env` (4 FP). RevenueCat and Supabase names are in `.env.example` with placeholders. `.env` is gitignored.

`supabase/migrations` has RLS enabled and policies. `.bolt/supabase_discarded_migrations/goal.sql` creates a table without RLS. That directory is Bolt's discard pile, not an applied migration, so it is not counted as a miss.

### taskquest (Bolt)

Small habit app. Tabs are component state, not a client router, so `spa-rewrites` staying quiet is correct.

- `missing-env` (2 TP). `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `src/lib/supabase.ts`. No `.env.example`. `.gitignore` does ignore `.env`.

Applied migrations enable RLS. Discarded Bolt migrations are outside the globs and already enable RLS.

### multi-tenant-example (v0)

Next.js, so `spa-rewrites` correctly returns nothing.

- `import-paths` `postcss-load-config` (FP). The only match is the JSDoc type in `postcss.config.mjs`: `/** @type {import('postcss-load-config').Config} */`. The same false positive appears in `dandi` and `app.ux`.
- `missing-env` `NEXT_PUBLIC_ROOT_DOMAIN` (TP). It is the tenant parent domain, referenced from pages, components, and `middleware.ts`, and it is not documented. The fallback is the string `"localhost:3000"`.

`hardcoded-localhost` missed that fallback. The classifier requires a full `http://localhost` or `http://127.0.0.1` URL. A bare `localhost:3000` host does not match. `middleware.ts` is also classified as server code.

### app.ux (v0)

Largest tree in the set (about 16MB, 662 code files, 207 SQL files). Next.js admin product with Supabase and a billing webhook. No `.env.example`. `.gitignore` has `.env.local` and `.env.*`, which does not ignore a file named `.env`.

- `leaked-secrets` `app/debug/env/page.tsx:62` (FP). The page is an async server component: `await requireSystemAdmin()`, `notFound()` when `NODE_ENV` is production, no `"use client"`. It reads `process.env.SUPABASE_SERVICE_ROLE_KEY` and renders `maskKey(service)`, not the raw key. The rule treats every file under `app/` as client code except `app/api/`, `server/`, and `*.server.*`. Next.js server components are server code.
- `import-paths` `server-only` (TP). `app/api/regulatory/bkmv/download/route.ts` has `import "server-only"` and `package.json` does not depend on it.
- `import-paths` Hebrew phrase (FP). The regex matches the prefix of the word `imported` in a comment in `lib/regulatory/bkmv/spec.ts`, then the next `from "..."` string, which is Hebrew prose from a spec title.
- `import-paths` `postcss-load-config` (FP). Same JSDoc pattern as the other Next apps.
- `webhook-signature` `app/api/billing/webhook/route.ts` (FP). This is a Vow billing webhook. It reads the raw body, computes HMAC-SHA256, and compares with `timingSafeEqual`. The word `stripe` appears only as one accepted header name (`stripe-signature`) next to `x-vow-signature` and `x-webhook-signature`. There is no Stripe client and no `constructEvent` because it is not a Stripe endpoint. The rule's own fix would still try to splice in `constructEvent`.
- `missing-env` (41 TP, 11 FP, 39 unclear). There is no example file anywhere, so required integration names are real gaps. Platform variables and optional flags with defaults are not.

True positives (required or secret, no example entry): `AUDITOR_REPAIR_SECRET`, `AUDITOR_CRON_SECRET`, `AUDITOR_WORKER_SECRET`, `AUDITOR_BILLING_CRON_SECRET`, `CRON_SECRET`, `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_USERNAME`, `CARDCOM_API_PASSWORD`, `VOW_BILLING_COMPANY_ID`, `PUBLIC_BASE_URL`, `UXELLENT_BILLING_API_KEY`, `BILLING_CRON_SECRET`, `VOW_BILLING_WEBHOOK_SECRET`, `SHAAM_TOKEN_URL`, `DEBUG_PDF_SECRET`, `SHAAM_CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CUSTOM_SEARCH_API_KEY`, `GOOGLE_CUSTOM_SEARCH_CX`, `AUDITOR_SERPER_API_KEY`, `ADMIN_AUDITOR_COMPANY_ID`, `GOOGLE_PSI_API_KEY`, `UPGRADE_STATE_SECRET`, `PDF_RENDER_URL`, `PDF_RENDER_TOKEN`, `SECURE_SIGNATURE_BASE_URL`, `SECURE_SIGNATURE_API_KEY`, `SHAAM_CLIENT_SOFTWARE_KEY`, `SHAAM_APPROVAL_USER_ID`, `SHAAM_APPROVAL_AUTHORIZED_COMPANY`, `BREVO_API_KEY`, `AUDITOR_LEAD_EMAIL_TO`, `SIGNING_P12_BASE64`, `SIGNING_P12_PASSWORD`, `SHAAM_HTTPS_PROXY`, `SHAAM_SOFTWARE_REGISTRATION_NUMBER`, `SHAAM_OAUTH_STATE_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

False positives (injected by the platform or the tool, not app config): `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, `VERCEL`, `VERCEL_URL`, `VERCEL_ENV`, `VERCEL_REGION`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_BRANCH_URL`, `PLAYWRIGHT_BROWSERS_PATH`.

Unclear (boolean or numeric flags, or a code default, so an empty `.env` is not what blocks boot): `SHAAM_DEBUG`, `INDEX_EXTRACTOR_MAX_TOTAL_PAGES`, `INDEX_EXTRACTOR_MAX_SEEDS`, `INDEX_EXTRACTOR_MAX_RUNTIME_MS`, `AUDITOR_ENABLED`, `CARDCOM_MODE`, `MARKETING_UPGRADE_URL_BASE`, `DEBUG_TEMPLATES`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_AUDITOR_REPORT_EMAIL_ENABLED`, `NEXT_PUBLIC_AUDITOR_WHATSAPP_PHONE`, `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`, `GOOGLE_CUSTOM_SEARCH_TIMEOUT_MS`, `AUDITOR_SERPER_ENDPOINT`, `AUDITOR_SERPER_TIMEOUT_MS`, `INDEX_EXTRACTOR_DOMAIN_ALLOWLIST`, `INDEX_EXTRACTOR_DOMAIN_BLOCKLIST`, `SEO_AUDIT_ALLOW_LOCALHOST`, `NEXT_PUBLIC_META_PIXEL_ID`, `ENCRYPTION_KEY` (dev-only fallback), `AUDITOR_WHATSAPP_PHONE`, `AUDITOR_SCREENSHOT_ENABLED`, `AUDITOR_STRICT_REPORT`, `AUDITOR_REPORT_EMAIL_ENABLED`, `VOW_BILLING_PROVIDER`, `SECURE_SIGNATURE_BYPASS`, `DIGITAL_SIGNATURES_ENABLED`, `SHAAM_APPROVAL_BRANCH_ID`, `SHAAM_APPROVAL_ACTION`, `SHAAM_APPROVAL_DEFAULT_ITEM_CATEGORY`, `SHAAM_APPROVAL_DEFAULT_MEASURE_UNIT_DESCRIPTION`, `NEXT_PUBLIC_DIGITAL_SIGNATURES_ENABLED`, `SECURE_SIGNATURE_BASE64_FIELD`, `PDF_LOG_LEVEL`, `PDF_RENDER_TIMEOUT_MS`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `SHAAM_ENV`, `SHAAM_REFRESH_COOLDOWN_SECONDS`.

`supabase-rls` reported zero findings. This repo has no `supabase/migrations`, `migrations`, or `db/migrations`. Schema lives in `scripts/*.sql`. Across those files, three created tables never get `ENABLE ROW LEVEL SECURITY`: `public.fx_rates` (`scripts/048-fx-rates-cache.sql`, comment says server-side cache), `public.auditor_plans` (`scripts/081-auditor-billing-v1.sql`; that file enables RLS on the sibling billing tables and not on plans), and `public.auditor_marketing_links` (`scripts/083-auditor-marketing-links-v1.sql`). Several other tables enable RLS and add no policy on purpose (`scripts/046-subscriptions-rls-v1.sql` says "No policies: client roles cannot access this table" for `billing_webhook_events`). If the glob is widened without a change in the "RLS on, zero policies" check, those intentional deny-all tables become false positives. Postgres already denies non-owner roles when RLS is on and no policy exists.

`hardcoded-localhost` reported nothing. `lib/template-engine.ts` (imports `node:fs/promises`, so it is server code) and several `app/api/**` routes POST to `http://127.0.0.1:7242/ingest/...` on the template and billing paths. The rule's client globs are `src`, `app`, `pages`, and `components`, and `app/api` is treated as server. Those calls are outside the stated client scope. They are still leftover debug beacons in code that runs on the server in production.

No Stripe SDK anywhere in the 15 clones. The webhook rule had only the Vow false positive to judge.

### howlow-auction (Replit)

pnpm workspace. Root `package.json` depends on `@replit/connectors-sdk` only. The Vite SPA is `artifacts/howlow` (`BrowserRouter`, Supabase). API server, Drizzle package, and generated clients are siblings. There is no `.gitignore` at all.

- `import-paths` (70 FP). Every flagged package is declared in the nearest package manifest (`artifacts/howlow/package.json`, `artifacts/api-server/package.json`, `lib/db/package.json`, and the other workspace packages). `react`, `vite`, `express`, `drizzle-orm`, and the Radix packages are all in those files. A fix run would add them to the root manifest at version `*`.
- `missing-env` `DATABASE_URL` (TP). `lib/db/drizzle.config.ts` throws if it is unset. No env example exists in the repo.

Missed, because globs are rooted at `src/`, `app/`, `lib/`, and the root `package.json`:

- `artifacts/howlow/src/lib/supabase.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and warns if they are empty. `missing-env` did not report them.
- `artifacts/howlow` is a client-routed Vite app with `index.html` and no `vercel.json`, `netlify.toml`, or `_redirects`. `spa-rewrites` looks at the root package, which does not depend on Vite or a router, and returns nothing.
- `artifacts/api-server/src/lib/logger.ts` reads `LOG_LEVEL`. Outside the env globs.
- With no `.gitignore`, a future `.env` would be committable. `leaked-secrets` only flags env files that already exist.

### ripplesocial (Replit)

Single-page feed, no react-router, so no SPA finding is correct. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are in `.env.example` as placeholders, and `.gitignore` ignores `.env`. Both `missing-env` findings are false positives of the "local `.env` must exist" check. `supabase/combined_setup.sql` enables RLS but sits next to `supabase/migrations`; the migrations themselves also enable RLS, so the zero RLS count is fair.

### airpsx-frontend (Cursor)

Vite + Preact desktop UI, no client router. `spa-rewrites` correctly stayed quiet.

- `leaked-secrets` `.env` and `.env.production` (TP). Both are tracked. `.gitignore` lists `.env.development` and `*.local` only. `.env` holds an API URL (not a key). `.env.production` holds a one-character `VITE_API_URL`. Neither is a private key. The files are still unignored and committed, which is the condition the rule describes.
- `import-paths` (4 FP). All four come from `src/index.tsx`, a CodeMirror Haxe mode whose source contains the word `import` inside quotes. Reported "package" names include fragments such as `),` and `: kw(`.
- `missing-env` `VITE_API_URL` (TP). Used in `src/services/ApiService.ts`. The value lives in the committed `.env`. There is no `.env.example`.

### dandi (Cursor and v0)

Next.js micro-SaaS boilerplate with Supabase and NextAuth. `.gitignore` ignores `.env*.local` and not `.env`. No `.env` is committed, so the hole is invisible to `leaked-secrets`.

- `import-paths` `zod` (TP). `src/app/api/github-summarizer/chain.js` imports `zod`. `package.json` has LangChain packages and not `zod`.
- `import-paths` `postcss-load-config` (FP). JSDoc type in `postcss.config.mjs`.
- `missing-env` (4 TP). `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. No example file. Google client id falls back to `''`, which disables the provider rather than documenting it.

## Misses inside the seven rules

These are problems the rules describe that this scan did not report. Playground localhost in Playwright configs and Vite `server.proxy` targets were not counted; the localhost rule is about client source.

| Rule | Where | What was missed |
| --- | --- | --- |
| `supabase-rls` | `thebarlev/app.ux` `scripts/048-fx-rates-cache.sql`, `scripts/081-auditor-billing-v1.sql`, `scripts/083-auditor-marketing-links-v1.sql` | `public.fx_rates`, `public.auditor_plans`, and `public.auditor_marketing_links` are created and never enabled for RLS anywhere under `scripts/`. The rule only reads `supabase/migrations/**`, `migrations/**`, and `db/migrations/**`. This repo has none of those directories. v0 output in this sample uses `scripts/*.sql`. |
| `spa-rewrites` | `Bekimoon0043/howlow-auction` `artifacts/howlow` | Nested Vite + `BrowserRouter` app, `index.html` present, no host fallback. Root `package.json` has neither Vite nor a router dependency, so the rule returns no findings. |
| `missing-env` | `artifacts/howlow/src/lib/supabase.ts`, `artifacts/howlow/src/lib/format.ts`, `artifacts/howlow/src/pages/admin/Auctions.tsx` | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required by the client. Globs do not match `artifacts/**/src/**`. |
| `missing-env` | same repo, `artifacts/api-server/src/lib/logger.ts` | `LOG_LEVEL` is unread by the rule. `PORT`, `BASE_PATH`, and `REPL_ID` in the nested Vite configs are Replit/platform values; those are less important. |
| `hardcoded-localhost` | `bennor/multi-tenant-example` | `"localhost:3000"` is the fallback for `NEXT_PUBLIC_ROOT_DOMAIN` in `app/`, `components/`, and `middleware.ts`. The matcher requires an `http://localhost` or `http://127.0.0.1` URL. |
| `leaked-secrets` | `dandi`, `gptme-webui`, `learnhub-unlocked-academy`, `howlow-auction`, `app.ux` | `.gitignore` does not cover a file named `.env` (`app.ux` ignores `.env.*` only; `dandi` ignores `.env*.local` only; `howlow-auction` has no `.gitignore`). The rule only reports an env file that already exists and is not ignored. `classnoteco` and `airpsx-frontend` were caught only because the files were already tracked. |
| `webhook-signature` | none observed beyond the false positive | No second Stripe handler in these trees. The miss is the inverse: a non-Stripe webhook that mentions `stripe-signature` was reported. |
| `import-paths` | none as a missed broken import | A separate case-insensitive walk of relative imports found no casing mismatches on this Linux checkout, matching the zero case findings. The gap on this rule is false positives, not missed case bugs. |

`learnhub-unlocked-academy` hardcodes the Supabase project URL and an anon JWT in client source. That is outside `leaked-secrets` as documented. It is why the env rule also stays quiet there.

## Prioritized weaknesses

### 1. `import-paths` does not understand workspaces or source text

85 of 90 findings are false positives. On `howlow-auction`, 70 of 70 flagged packages are declared in the package that owns the file. On `quick-chat-react`, all 5 are declared in `demo/package.json` or `nextjs-demo/package.json`. A `fix` would write those names into the root manifest at `"*"`.

The specifier regex is `/\bimport\s*(?:type\s+)?[\s\S]*?\sfrom\s*(['"]).../`. `\bimport` matches the start of `imported`, and `[\s\S]*?` crosses comments and strings until some later `from "..."`. That produced the Hebrew prose "package" in `app.ux`, the Haxe tokenizer junk in `airpsx-frontend` (four findings in one file), and the Python-detection string in `gptme-webui`. A second pattern treats `import('postcss-load-config')` inside a JSDoc comment as a runtime import. Three Next.js apps, including both v0 projects, hit that. Deno `npm:resend@2.0.0` is parsed as an npm package name, slash and version included.

Suggested fix: extract specifiers from comment-free, string-free spans (the engine already has `codeSpans`). Resolve dependencies from the nearest `package.json`, and from npm/pnpm `workspaces`, instead of the root manifest only. Ignore `npm:` and `jsr:` specifiers, and ignore `import()` that appears only in a JSDoc type.

### 2. `missing-env` fails a documented clone, and it misses nested apps

The detector reports a name when it is absent from `.env.example` **or** from a local env file. On a public clone the local file is supposed to be absent. That single condition produced 13 false positives on projects that already list the names in `.env.example`: AcademiComeback (4), act-solo-ai (4), weekend-builder (3), ripplesocial (2). CI on those repos would fail `vibe-rescue scan` forever unless someone commits `.env`.

The same pass flags variables the app does not own. `app.ux` contributed 11 platform false positives (`VERCEL_*`, `HTTP(S)_PROXY`, `ALL_PROXY`, `NO_PROXY`, `PLAYWRIGHT_BROWSERS_PATH`) and 39 optional flags that already default in code. `NODE_ENV` and Vite's `MODE`/`DEV`/`PROD` are skipped; `VERCEL` and the proxy variables are not.

The globs are `src/**`, `app/**`, `pages/**`, `server/**`, `lib/**`, `components/**`, and `api/**` from the scan root. `artifacts/howlow/src/**` does not match, so the Replit app's Supabase env reads were invisible while `lib/db/drizzle.config.ts` was visible.

Suggested fix: if the name is in `.env.example` (or `.env.sample` / `.env.template`), do not require a local `.env` during `scan`. Keep the local-file check for `fix` on a developer machine, or only when `.env` exists. Skip a built-in platform list (`VERCEL`, `VERCEL_URL`, `VERCEL_ENV`, `VERCEL_REGION`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_BRANCH_URL`, `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, `PLAYWRIGHT_BROWSERS_PATH`, and the lowercase proxy twins). Walk every workspace package, or anchor globs with `**/`, instead of assuming a single root `src/`.

### 3. Host and SQL checks are tied to a handful of paths

`spa-rewrites` emits up to three errors for one missing fallback, and it does that even when one of the three files is already correct. AcademiComeback and ResumeSharp both have a working Netlify `/*` → `/index.html` 200 redirect and still fail on Vercel and `_redirects` (4 false positives). Projects with no fallback at all are correctly flagged, and then counted three times.

The same rule never looks past the root `package.json`. `howlow-auction`'s real SPA is a workspace package and was not scanned.

`supabase-rls` has the same shape of bug for SQL. It is the right check for `supabase/migrations`, and the Lovable and Bolt repos that keep migrations there came back clean (RLS enabled, policies present). `app.ux`, the large v0 app, keeps the schema in `scripts/*.sql`. The scan reported zero RLS findings while `fx_rates`, `auditor_plans`, and `auditor_marketing_links` are created with RLS left off. Widening the glob without changing the "enabled but no policy" state will also flag tables that enable RLS and add no policy as a deliberate deny-all (`billing_webhook_events` in `scripts/046-subscriptions-rls-v1.sql`).

Suggested fix: for SPA rewrites, report one finding when a client-routed Vite app has no fallback anywhere, and do not require the other host files when one host file already rewrites to `index.html`. Discover Vite apps in workspace packages, not only at the root. For RLS, include `scripts/**/*.sql` (v0) and keep `supabase/migrations`. Treat "RLS enabled and zero policies" as already denying anon and authenticated, unless the project has no `ENABLE ROW LEVEL SECURITY` at all.

### Further, smaller than the three above

- **`leaked-secrets` treats `app/**` as the client bundle.** `app/debug/env/page.tsx` is a server component that masks the service-role key and returns 404 in production. Suggested fix: treat App Router files as server code unless they start with `"use client"` or are imported by a client module. Keep flagging `NEXT_PUBLIC_*` and `VITE_*` reads of `SERVICE_ROLE` / `SECRET`.
- **`leaked-secrets` does not read `.gitignore` until an env file exists.** Five repos in this set can commit `.env` today (`dandi`, `gptme-webui`, `learnhub-unlocked-academy`, `howlow-auction`, and a bare `.env` in `app.ux`). Suggested fix: a finding when `.gitignore` does not match `.env`, even if the file is not in the tree yet. `classnoteco`'s `!.env.example` with no preceding `.env` pattern is the bug the rule should catch before the file is added.
- **`webhook-signature` keys off the substring `stripe`.** One header name was enough to call a verified HMAC webhook an unverified Stripe webhook. Suggested fix: require a Stripe SDK import or `new Stripe`, and accept `timingSafeEqual` / a documented HMAC helper as verification for non-Stripe routes. Do not rewrite those routes to `constructEvent`.
- **`hardcoded-localhost` misses host strings that are not absolute URLs, and it never sees `lib/`.** `localhost:3000` without a scheme is the production fallback in the v0 multi-tenant example. Debug `fetch` calls to `127.0.0.1` in `app.ux` server modules were not reported; the rule text says server files are left alone, so this is a scope gap rather than a broken client match. Suggested fix: also match `localhost` and `127.0.0.1` host literals, and add a separate, non-rewriting warning for server files that call loopback from a request path.

## What this sample cannot say

Shallow clones hide secrets that were committed and later deleted. `npm install` was not run, so undeclared imports were not executed. Anon Supabase JWTs showed up in client source and in `.env.example` files; reporting them would disagree with the rule as written. Fifteen repos is enough to see the same false-positive patterns repeat across Lovable, Bolt, v0, and Replit layouts. It is not a measure of how often a private production app would fail.
