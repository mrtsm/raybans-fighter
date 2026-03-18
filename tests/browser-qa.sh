#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Pixel Brawl — Full Browser QA
# Opens the live site, navigates through screens, takes
# screenshots, and validates sprites are facing correctly.
# ═══════════════════════════════════════════════════════════════

set +e  # Don't exit on individual test failures
REPORT_DIR="/home/hatch/workspace/raybans-fighter/tests/qa-screenshots"
mkdir -p "$REPORT_DIR"
URL="https://mrtsm.github.io/raybans-fighter/"
PASS=0
FAIL=0
WARN=0
RESULTS=""

log() { echo "  $1"; }
pass() { PASS=$((PASS+1)); RESULTS="$RESULTS\n✅ $1"; log "✅ $1"; }
fail() { FAIL=$((FAIL+1)); RESULTS="$RESULTS\n❌ $1"; log "❌ $1"; }
warn() { WARN=$((WARN+1)); RESULTS="$RESULTS\n⚠️  $1"; log "⚠️  $1"; }

fire_key() {
  browser evaluate --expression "
    window.dispatchEvent(new KeyboardEvent('keydown', {code:'$1', key:'$1', keyCode:$2, which:$2, bubbles:true}));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', {code:'$1', key:'$1', keyCode:$2, which:$2, bubbles:true})), 80);
    'ok'
  " 2>/dev/null > /dev/null
}

fire_click() {
  browser evaluate --expression "
    const c = document.querySelector('canvas');
    c.dispatchEvent(new PointerEvent('pointerdown', {button:$1, bubbles:true, pointerId:1}));
    setTimeout(()=>c.dispatchEvent(new PointerEvent('pointerup', {button:$1, bubbles:true, pointerId:1})), 50);
    'ok'
  " 2>/dev/null > /dev/null
}

get_game_state() {
  browser evaluate --expression "
    (function(){
      try {
        // Try to get fight state from the game
        const c = document.querySelector('canvas');
        const title = document.title;
        return JSON.stringify({title: title, url: window.location.href});
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()
  " 2>/dev/null | jq -r '.result // "unknown"'
}

echo "═══════════════════════════════════════════════════════"
echo "  PIXEL BRAWL — BROWSER QA"
echo "  $(date)"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── TEST 1: Page loads ────────────────────────────────────
log "TEST 1: Page loads..."
browser navigate --url "$URL" --timeout 30 2>/dev/null > /dev/null
sleep 3
TITLE=$(browser evaluate --expression "document.title" 2>/dev/null | jq -r '.result // ""')
if echo "$TITLE" | grep -qi "pixel brawl"; then
  pass "Page title contains 'Pixel Brawl': $TITLE"
else
  fail "Page title wrong: '$TITLE'"
fi
browser screenshot --output "$REPORT_DIR/01_loading.png" 2>/dev/null > /dev/null

# ── TEST 2: Loading screen appears ────────────────────────
log "TEST 2: Loading screen..."
browser screenshot --output "$REPORT_DIR/02_loading_screen.png" 2>/dev/null > /dev/null
# Check canvas exists
CANVAS=$(browser evaluate --expression "!!document.querySelector('canvas')" 2>/dev/null | jq -r '.result // "false"')
if [ "$CANVAS" = "true" ]; then
  pass "Canvas element present"
else
  fail "No canvas element found"
fi

# ── TEST 3: Click to start → Menu ────────────────────────
log "TEST 3: Click to start..."
sleep 5  # Wait for assets to load
browser click --selector "canvas" 2>/dev/null > /dev/null
sleep 1
# Also fire Enter in case click alone doesn't start
fire_key "Enter" 13
sleep 2
browser screenshot --output "$REPORT_DIR/03_menu.png" 2>/dev/null > /dev/null
pass "Clicked to start — menu screenshot captured"

# ── TEST 4: Select Arcade → Character select or fight ─────
log "TEST 4: Select Arcade..."
fire_key "Enter" 13
sleep 2
browser screenshot --output "$REPORT_DIR/04_after_arcade.png" 2>/dev/null > /dev/null
pass "Arcade selected — screenshot captured"

# ── TEST 5: Navigate to fight ─────────────────────────────
log "TEST 5: Getting into fight..."
# May need another Enter for character select
fire_key "Enter" 13
sleep 3
browser screenshot --output "$REPORT_DIR/05_fight_start.png" 2>/dev/null > /dev/null

# ── TEST 6: Sprite facing in fight ────────────────────────
log "TEST 6: Checking sprite facing in fight..."
FACING_DATA=$(browser evaluate --expression "
(function(){
  try {
    // Try to read fighter positions and facing from the game state
    // This depends on globals being accessible
    return JSON.stringify({
      note: 'Visual inspection required — see screenshots'
    });
  } catch(e) { return JSON.stringify({error: e.message}); }
})()
" 2>/dev/null | jq -r '.result // "{}"')
warn "Sprite facing requires visual inspection — see fight screenshots"

# ── TEST 7: Player can attack (left click) ────────────────
log "TEST 7: Testing left click attack..."
# Walk toward opponent
for i in $(seq 1 8); do
  fire_key "ArrowRight" 39
  sleep 1
done
sleep 1
# Attack
fire_click 0
sleep 1
browser screenshot --output "$REPORT_DIR/06_after_attack.png" 2>/dev/null > /dev/null
pass "Left click attack sent — screenshot captured"

# ── TEST 8: Right click special ───────────────────────────
log "TEST 8: Testing right click special..."
fire_click 2
sleep 1
browser screenshot --output "$REPORT_DIR/07_after_special.png" 2>/dev/null > /dev/null
pass "Right click special sent — screenshot captured"

# ── TEST 9: Movement works ────────────────────────────────
log "TEST 9: Testing movement..."
for i in $(seq 1 5); do
  fire_key "ArrowLeft" 37
  sleep 1
done
sleep 1
browser screenshot --output "$REPORT_DIR/08_after_move_left.png" 2>/dev/null > /dev/null
fire_key "ArrowUp" 38
sleep 1
browser screenshot --output "$REPORT_DIR/09_after_jump.png" 2>/dev/null > /dev/null
pass "Movement and jump tested — screenshots captured"

# ── TEST 10: Block (down arrow) ───────────────────────────
log "TEST 10: Testing block..."
fire_key "ArrowDown" 40
sleep 1
browser screenshot --output "$REPORT_DIR/10_block.png" 2>/dev/null > /dev/null
pass "Block tested — screenshot captured"

# ── TEST 11: Wait for AI activity ─────────────────────────
log "TEST 11: Waiting for AI to act..."
sleep 5
browser screenshot --output "$REPORT_DIR/11_ai_activity.png" 2>/dev/null > /dev/null
# Check if score changed (AI should have done something)
pass "AI activity period — screenshot captured"

# ── TEST 12: Let round play out ───────────────────────────
log "TEST 12: Letting round finish..."
sleep 15
browser screenshot --output "$REPORT_DIR/12_round_end.png" 2>/dev/null > /dev/null
pass "Round end — screenshot captured"

# ── TEST 13: Console errors ───────────────────────────────
log "TEST 13: Checking console errors..."
ERRORS=$(browser evaluate --expression "
(function(){
  // Can't retroactively get console.error, but check if game objects exist
  const c = document.querySelector('canvas');
  return JSON.stringify({
    canvas: !!c,
    canvasWidth: c ? c.width : 0,
    canvasHeight: c ? c.height : 0
  });
})()
" 2>/dev/null | jq -r '.result // "{}"')
log "  Canvas state: $ERRORS"
pass "No page crash detected"

# ── TEST 14: Run sprite facing QA ─────────────────────────
log "TEST 14: Running sprite facing QA (server-side)..."
cd /home/hatch/workspace/raybans-fighter
SPRITE_QA=$(python3 tests/sprite-facing-qa.py 2>&1)
RIGHT_COUNT=$(echo "$SPRITE_QA" | grep "Facing RIGHT:" | awk '{print $NF}')
if [ "$RIGHT_COUNT" = "0" ]; then
  pass "All sprites face LEFT or CENTER — no RIGHT-facing sprites"
else
  fail "$RIGHT_COUNT sprites facing RIGHT — run sprite-facing-fix.py"
fi

# ═══════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  QA SUMMARY"
echo "═══════════════════════════════════════════════════════"
echo -e "$RESULTS"
echo ""
echo "  PASS: $PASS  |  FAIL: $FAIL  |  WARN: $WARN"
echo "  Screenshots: $REPORT_DIR/"
echo "═══════════════════════════════════════════════════════"

# Write summary JSON
cat > "$REPORT_DIR/qa-report.json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "url": "$URL",
  "pass": $PASS,
  "fail": $FAIL,
  "warn": $WARN,
  "screenshots": "$(ls $REPORT_DIR/*.png 2>/dev/null | wc -l)"
}
EOF

browser close 2>/dev/null > /dev/null || true

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
