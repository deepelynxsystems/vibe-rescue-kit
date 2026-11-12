#!/usr/bin/env bash
# Pack the kit, install that tarball in a clean directory, and run scan and fix.
# npm pack runs prepack, which builds dist. This script does not publish.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -x node_modules/.bin/tsc ]]; then
  echo "Install dependencies with npm ci before the pack smoke test." >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pack_dir="$work/pack"
install_dir="$work/install"
fixture_dir="$work/fixture"
rule_dir="$work/rule"
mkdir -p "$pack_dir" "$install_dir" "$rule_dir"

echo "Packing (prepack builds dist)..."
npm pack --json --pack-destination "$pack_dir" >"$work/pack.json"

tarball="$(find "$pack_dir" -name '*.tgz' -print -quit)"
if [[ -z "$tarball" ]]; then
  echo "npm pack did not write a tarball" >&2
  exit 1
fi

bytes="$(wc -c <"$tarball" | tr -d ' ')"
echo "Tarball: $(basename "$tarball")"
echo "Size: ${bytes} bytes"
ls -lh "$tarball"
echo "Contents:"
tar -tzf "$tarball" | sort | tee "$work/contents.txt"

require() {
  if ! grep -qx "$1" "$work/contents.txt"; then
    echo "missing from tarball: $1" >&2
    exit 1
  fi
}

require package/package.json
require package/README.md
require package/LICENSE
require package/dist/cli.js
require package/dist/index.js
require package/dist/index.d.ts
require package/rules/hardcoded-localhost.yaml
require package/rules/leaked-secrets.yaml
require package/rules/missing-env.yaml
require package/rules/spa-rewrites.yaml
require package/rules/supabase-rls.yaml
require package/rules/import-paths.yaml
require package/rules/webhook-signature.yaml
require package/templates/pre-commit.sh
require package/templates/workflow.yml
require package/templates/rule.yaml
require package/templates/rule.mjs

if grep -E '^package/(action\.yml$|src/|tests/|fixtures/|examples/|docs/|scripts/|\.github/|node_modules/)' "$work/contents.txt"; then
  echo "tarball contains files that are not part of the published package" >&2
  exit 1
fi

if grep -E '\.map$' "$work/contents.txt"; then
  echo "tarball contains source maps" >&2
  exit 1
fi

if ! tar -tvzf "$tarball" package/dist/cli.js | grep -q '^-r.x'; then
  echo "dist/cli.js is not executable in the tarball" >&2
  exit 1
fi

shebang="$(tar -xOf "$tarball" package/dist/cli.js | head -n 1)"
if [[ "$shebang" != "#!/usr/bin/env node" ]]; then
  echo "dist/cli.js shebang is '$shebang'" >&2
  exit 1
fi

if [[ "$bytes" -gt 1000000 ]]; then
  echo "tarball is larger than 1MB (${bytes} bytes)" >&2
  exit 1
fi

echo "Installing tarball into a clean directory..."
(
  cd "$install_dir"
  npm init -y >/dev/null
  npm install --no-fund --no-audit "$tarball"
)

bin="$install_dir/node_modules/.bin/vibe-rescue"
pkg="$install_dir/node_modules/vibe-rescue-kit"
test -x "$bin"
test -f "$pkg/dist/cli.js"
test -f "$pkg/rules/hardcoded-localhost.yaml"
test -f "$pkg/templates/rule.yaml"
test ! -e "$pkg/action.yml"
test ! -d "$pkg/src"

echo "Installed CLI:"
"$bin" --version
"$bin" rules

cp -a "$ROOT/fixtures/hardcoded-localhost" "$fixture_dir"

echo "Scan (expect findings)..."
scan_status=0
scan_out="$("$bin" scan "$fixture_dir" --json 2>"$work/scan.err")" || scan_status=$?
if [[ "$scan_status" -ne 1 ]]; then
  echo "expected scan to exit 1, got $scan_status" >&2
  echo "$scan_out" >&2
  cat "$work/scan.err" >&2
  exit 1
fi
if ! grep -q 'hardcoded-localhost' <<<"$scan_out"; then
  echo "scan JSON did not mention hardcoded-localhost" >&2
  echo "$scan_out" >&2
  exit 1
fi
echo "scan exit 1, hardcoded-localhost present"

echo "Fix..."
"$bin" fix "$fixture_dir" --yes

echo "Scan again (expect clean)..."
"$bin" scan "$fixture_dir" --json >"$work/rescan.json"
if grep -q 'http://localhost' "$fixture_dir/src/api.ts"; then
  echo "fix left a localhost URL in src/api.ts" >&2
  exit 1
fi
if ! grep -q 'VITE_API_BASE_URL' "$fixture_dir/src/api.ts"; then
  echo "fix did not write VITE_API_BASE_URL" >&2
  exit 1
fi
if ! grep -q 'http://localhost:4000' "$fixture_dir/src/server/internal.ts"; then
  echo "fix rewrote the server file" >&2
  exit 1
fi

echo "new-rule from the installed templates..."
(cd "$rule_dir" && "$bin" new-rule smoke-check --title "Smoke")
test -f "$rule_dir/.vibe-rescue/rules/smoke-check.yaml"
if ! grep -q 'id: smoke-check' "$rule_dir/.vibe-rescue/rules/smoke-check.yaml"; then
  echo "scaffolded rule did not come from the template" >&2
  exit 1
fi

echo "Pack smoke passed (${bytes} bytes)."
