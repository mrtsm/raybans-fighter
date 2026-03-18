#!/bin/bash
# run-all.sh — Run all Ray-Bans Fighter validation tests
# Usage: ./tests/run-all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     RAY-BANS FIGHTER — QA VALIDATION SUITE              ║"
echo "║     $(date -u '+%Y-%m-%d %H:%M:%S UTC')                          ║"
echo "╚══════════════════════════════════════════════════════════╝"

OVERALL_EXIT=0

echo ""
echo "┌──────────────────────────────────────────────────────────┐"
echo "│  TEST 1: Structural Validation (validate.js)             │"
echo "└──────────────────────────────────────────────────────────┘"
echo ""

if node "$SCRIPT_DIR/validate.js"; then
  VALIDATE_STATUS="✅ PASS"
else
  VALIDATE_STATUS="❌ FAIL"
  OVERALL_EXIT=1
fi

echo ""
echo "┌──────────────────────────────────────────────────────────┐"
echo "│  TEST 2: Gameplay Feature Check (gameplay-check.js)      │"
echo "└──────────────────────────────────────────────────────────┘"
echo ""

if node "$SCRIPT_DIR/gameplay-check.js"; then
  GAMEPLAY_STATUS="✅ PASS"
else
  GAMEPLAY_STATUS="❌ FAIL"
  OVERALL_EXIT=1
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                    FINAL RESULTS                        ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Structural Validation:  $VALIDATE_STATUS                      ║"
echo "║  Gameplay Features:      $GAMEPLAY_STATUS                      ║"
echo "╠══════════════════════════════════════════════════════════╣"

if [ $OVERALL_EXIT -eq 0 ]; then
  echo "║  🟢 ALL TESTS PASSED                                    ║"
else
  echo "║  🔴 SOME TESTS FAILED                                   ║"
fi

echo "╚══════════════════════════════════════════════════════════╝"

exit $OVERALL_EXIT
