# Contributing to vibe-rescue-kit

Thanks for working on this. The bar is the same as a release: a rule that detects a real failure, fixes it, proves the fix, and restores the project when the proof fails.

## Setup

```bash
git clone https://github.com/deepelynxsystems/vibe-rescue-kit.git
cd vibe-rescue-kit
npm ci
npm test
npm run build
```

Node.js 20 or newer. `npm test` runs Vitest. `npm run build` emits `dist/` and is what `node dist/cli.js` runs.

## Add a built-in rule

1. Add a strategy in `src/rules/<id>.ts` and register it in `src/rules/index.ts`. `missing-env` stays last so it sees env names other rules introduce.
2. Give the rule `detect`, `fix`, and `verify`. Verification should call `verifyFixed` or an equivalent check that the fingerprints you tried to fix are gone.
3. Write only through `ctx.write`. The engine snapshots those files and rolls them back when verification fails.
4. Add `rules/<id>.yaml` with `id`, `title`, `description`, `severity`, `scopeNote`, and `strategy`. Leave `detect` out of that file unless you intend to override the TypeScript defaults.
5. Add `fixtures/<id>/` as a tiny project that shows the bug, including the cases the rule must ignore.
6. Add a test that copies the fixture, asserts the findings, runs `fix`, asserts the files, and runs `scan` again expecting a clean result. Also assert a second `fix` changes nothing.
7. Add a before/after card in `scripts/render-assets.py`, run `python3 scripts/render-assets.py`, and document the rule in `README.md`.

Project rules do not need a built-in slot. `vibe-rescue new-rule` and the templates in `templates/` are the path for those.

## Safety rules for changes

- Do not open a database connection, send email, deploy, or publish to npm.
- Do not print raw secrets. Reports go through `redactSecrets`.
- A fix that cannot be verified must roll back.
- `--dry-run` must leave the tree byte-for-byte as it found it.
- Prefer a fixture over a description. If the behavior is not in a test, it is not done.

## Commit messages

Short, imperative subject. The body says what the rule now detects and how you checked it.

Example: `Add a fixture for quoted SQL table names in supabase-rls`.

## Demo recordings

`scripts/demo.sh` is the copy-paste demo. Terminal transcripts for each fixture are regenerated with `scripts/capture-terminals.sh`. GIF recordings are real CLI runs paced so each line can be read; do not draw a mock terminal.

## Code of conduct

Be direct, credit deepelynx, and keep the tool honest about what it will not do.
