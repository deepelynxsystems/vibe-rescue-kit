#!/usr/bin/env bash
# Real watch session used by the demo recording.
# Usage: demo-watch.sh /path/to/project
set -u
cd "$1"
export CHOKIDAR_USEPOLLING=1
node "$(cd "$(dirname "$0")/.." && pwd)/dist/cli.js" watch . --yes &
pid=$!
for _ in 1 2 3 4 5 6 7 8 9 10 12; do
  sleep 0.25
done
cat > src/leaked.ts << 'EOF'
export const key = "sk_test_1234567890abcdefghij";
EOF
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 20; do
  if ! grep -q sk_test_ src/leaked.ts; then
    break
  fi
  sleep 0.25
done
sleep 0.8
kill -INT "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
printf '\n----- src/leaked.ts -----\n'
cat src/leaked.ts
