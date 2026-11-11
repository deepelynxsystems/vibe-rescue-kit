#!/bin/sh
# vibe-rescue-kit by deepelynx — pre-commit
# Fixes staged files, verifies each fix, and stages kept edits.
cd "$(git rev-parse --show-toplevel)" || exit 1
if [ -x node_modules/.bin/vibe-rescue ]; then
  node_modules/.bin/vibe-rescue fix --yes --hook --staged
else
  npx --yes vibe-rescue fix --yes --hook --staged
fi
