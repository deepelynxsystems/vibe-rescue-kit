#!/usr/bin/env bash
# Run scan and fix on every fixture and save the terminal transcript.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI=(node "$ROOT/dist/cli.js")
OUT="${1:-$ROOT/docs/assets/terminal}"
mkdir -p "$OUT"
export NO_COLOR=1
export FORCE_COLOR=0

run_one() {
  local name="$1"
  local src="$2"
  local dir
  dir="$(mktemp -d)"
  cp -a "$src/." "$dir/"
  {
    echo "\$ vibe-rescue scan $name"
    "${CLI[@]}" scan "$dir" || true
    echo
    echo "\$ vibe-rescue fix --yes $name"
    "${CLI[@]}" fix "$dir" --yes || true
    echo
    echo "\$ vibe-rescue scan $name"
    "${CLI[@]}" scan "$dir" || true
  } > "$OUT/${name}.txt"
  rm -rf "$dir"
  echo "wrote $OUT/${name}.txt"
}

run_one leaked-secrets "$ROOT/fixtures/leaked-secrets"
run_one supabase-rls "$ROOT/fixtures/supabase-rls"
run_one missing-env "$ROOT/fixtures/missing-env"
run_one spa-rewrites "$ROOT/fixtures/spa-rewrites"
run_one hardcoded-localhost "$ROOT/fixtures/hardcoded-localhost"
run_one import-paths "$ROOT/fixtures/import-paths"
run_one webhook-signature "$ROOT/fixtures/webhook-signature"
run_one broken-spa "$ROOT/examples/broken-spa"
