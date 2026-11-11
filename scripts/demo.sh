#!/usr/bin/env bash
# GIF-ready demo. Copies the intentionally broken example, then scans and fixes it.
# Requires a built CLI: npm run build
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI=(node "$ROOT/dist/cli.js")
DEMO="$(mktemp -d)"
cp -a "$ROOT/examples/broken-spa/." "$DEMO/"
echo "demo project: $DEMO"
echo
echo "$ vibe-rescue scan"
"${CLI[@]}" scan "$DEMO" || true
echo
echo "$ vibe-rescue fix --dry-run"
"${CLI[@]}" fix "$DEMO" --dry-run || true
echo
echo "$ vibe-rescue fix --yes"
"${CLI[@]}" fix "$DEMO" --yes
echo
echo "$ vibe-rescue scan"
"${CLI[@]}" scan "$DEMO"
echo
echo "demo left at $DEMO"
