# Changelog

## 1.0.1

- `import-paths` checks the nearest `package.json`, honors `tsconfig` and `jsconfig` path aliases, and only reads real `import` / `export` / `require` statements. Strings, comments, and JSDoc types are ignored. `npm:` and `jsr:` specifiers are not npm dependencies.
- `missing-env` treats a name listed in `.env.example`, `.env.sample`, or `.env.template` as satisfied when no local env file is present. It ignores platform variables (`VERCEL_*`, `NETLIFY_*`, proxy variables, `REPL_ID`, `PLAYWRIGHT_BROWSERS_PATH`) and scans nested app and workspace source trees.
- `spa-rewrites` stays quiet when any one supported host already rewrites to `index.html`. A Vite SPA in a subdirectory is checked on its own.
- `supabase-rls` reads `.sql` files anywhere in the repo and flags `public` tables created without row level security. RLS that is already enabled is not a finding. Discarded and backup SQL folders are skipped.
- `leaked-secrets` treats Next.js `app/` files without `"use client"`, and route handlers, as server code. A `.gitignore` that does not cover `.env` is a warning.
- `webhook-signature` requires a Stripe import or client, and treats `timingSafeEqual` / `createHmac` as verification.
- `hardcoded-localhost` ignores dev configs, development-only branches, and placeholders, and flags a bare `localhost:port`.
- `missing-env` does not fail a read that already has `||`, `??`, or a default parameter.
