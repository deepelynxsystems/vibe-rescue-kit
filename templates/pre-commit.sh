#!/bin/sh
# vibe-rescue-kit by deepelynx — pre-commit
# Fixes staged files, verifies each fix, and stages kept edits.
cd "$(git rev-parse --show-toplevel)" || exit 1
if [ -x node_modules/.bin/vibe-rescue ]; then
  exec node_modules/.bin/vibe-rescue fix --yes --hook --staged
fi
if command -v vibe-rescue >/dev/null 2>&1; then
  exec vibe-rescue fix --yes --hook --staged
fi
echo "vibe-rescue was not found. Build this repository so node_modules/.bin/vibe-rescue exists." >&2
exit 1
