#!/bin/bash
# watch-and-test.sh — Monitor for file changes and re-run tests
# Saves results to /tmp/qa-latest.txt

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAST_HASH=""
CHECK_INTERVAL=30

echo "🔍 QA Watch started at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "   Checking every ${CHECK_INTERVAL}s for file changes..."

get_state_hash() {
  find "$ROOT/js" "$ROOT/assets" "$ROOT/index.html" -type f 2>/dev/null | \
    xargs md5sum 2>/dev/null | md5sum | cut -d' ' -f1
}

LAST_HASH=$(get_state_hash)

while true; do
  sleep $CHECK_INTERVAL
  CURRENT_HASH=$(get_state_hash)
  
  if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📝 Changes detected at $(date -u '+%H:%M:%S UTC')"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Run tests
    bash "$ROOT/tests/run-all.sh" 2>&1 | tee /tmp/qa-latest.txt
    
    LAST_HASH="$CURRENT_HASH"
    echo ""
    echo "🔍 Watching for more changes..."
  fi
done
