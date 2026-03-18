#!/usr/bin/env node
/**
 * gameplay-check.js — Static analysis for gameplay features
 * Verifies that key gameplay mechanics exist in the codebase via regex/string matching
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✅ PASS: ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ FAIL: ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️  WARN: ${msg}`); warnings++; }
function section(msg) { console.log(`\n━━━ ${msg} ━━━`); }

// Load all JS source files
function loadAll() {
  const files = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        files[path.relative(ROOT, full)] = fs.readFileSync(full, 'utf8');
      }
    }
  }
  walk(JS_DIR);
  return files;
}

const sources = loadAll();
const allCode = Object.values(sources).join('\n');

// Also load index.html
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Helper: check if pattern exists in any source file, return which file(s)
function findInCode(pattern, flags = 'i') {
  const regex = new RegExp(pattern, flags);
  const found = [];
  for (const [file, src] of Object.entries(sources)) {
    if (regex.test(src)) found.push(file);
  }
  return found;
}

function checkInCode(pattern, description, flags = 'i') {
  const found = findInCode(pattern, flags);
  if (found.length > 0) {
    pass(`${description} — found in ${found.join(', ')}`);
    return true;
  } else {
    fail(`${description} — NOT FOUND in any source file`);
    return false;
  }
}

function checkInFile(filename, pattern, description, flags = 'i') {
  const src = sources[filename];
  if (!src) {
    fail(`${description} — file ${filename} not found`);
    return false;
  }
  const regex = new RegExp(pattern, flags);
  if (regex.test(src)) {
    pass(`${description} — found in ${filename}`);
    return true;
  } else {
    fail(`${description} — NOT FOUND in ${filename}`);
    return false;
  }
}

// ─── 1. Input: Mouse Click Handlers (Armband) ──────────────────────────────
section('INPUT: Armband/Mouse Controls');

// Check for mousedown/click/pointerdown handlers that map to attack actions
const hasMouseDown = findInCode('addEventListener.*mousedown|addEventListener.*click(?!\\w)|onmousedown|addEventListener.*pointerdown');
const hasMouseAttack = findInCode("(mousedown|click|pointerdown).*(?:light|heavy|attack)|(?:light|heavy|attack).*(?:mousedown|click|pointerdown)|button\\s*===?\\s*0.*(?:light|attack)|button\\s*===?\\s*2.*(?:heavy|special)", 'gis');

if (hasMouseDown.length > 0) {
  pass(`Mouse/pointer event listeners found in: ${hasMouseDown.join(', ')}`);
} else {
  fail('No mouse/pointer event listeners for attacks');
}

// Check for left click → light attack mapping
checkInCode("button\\s*===?\\s*0|e\\.button\\s*===?\\s*0|mouseButton.*0|left.*click.*light|left.*attack", 'Left click → light attack mapping');

// Check for right click → heavy/special mapping
checkInCode("button\\s*===?\\s*2|e\\.button\\s*===?\\s*2|mouseButton.*2|right.*click.*(?:heavy|special)|right.*(?:heavy|special)", 'Right click → heavy/special mapping');

// Check contextmenu prevention (critical for right-click on armband)
checkInCode("contextmenu.*prevent|preventDefault.*contextmenu|addEventListener.*contextmenu", 'contextmenu prevention (right-click)');

// ─── 2. Hit Freeze / Hitstun ────────────────────────────────────────────────
section('GAMEPLAY: Hit Freeze & Hitstun');

checkInCode('hitfreeze|hit_freeze|hitFreeze|freezeFrames|hitStop|hitstop', 'Hit freeze/hitstop system');
checkInCode('hitstun|hitStun|hit_stun|stunFrames', 'Hitstun system');
checkInCode('hitstunF|hitstun_frames|stunDuration', 'Hitstun frame tracking');

// ─── 3. Screen Shake ────────────────────────────────────────────────────────
section('GAMEPLAY: Screen Shake');

checkInCode('shake|screenShake|screen_shake', 'Screen shake system');
checkInCode('shake.*=|addShake|triggerShake|doShake|this\\.shake', 'Shake trigger mechanism');

// ─── 4. Particle/Spark System ───────────────────────────────────────────────
section('GAMEPLAY: Particles & Effects');

checkInCode('particle|spark|hitParticle|makeHitParticles|emitter', 'Particle/spark system');
checkInCode('particle.*push|particles.*push|addParticle|spawnParticle|makeHitParticles', 'Particle spawning');
checkInCode('particle.*render|drawParticle|particle.*fill|particle.*draw', 'Particle rendering');

// ─── 5. Combo Counter ──────────────────────────────────────────────────────
section('UI: Combo Counter');

checkInCode('combo|hitStreak|hit_streak', 'Combo/hit streak tracking');
checkInCode('combo.*display|drawCombo|renderCombo|COMBO|streak.*text|streak.*draw', 'Combo counter display');

// ─── 6. High Score System ───────────────────────────────────────────────────
section('UI: High Score System');

checkInCode('highScore|high_score|highscore|leaderboard|topScore', 'High score tracking');
checkInCode('initial|initials|AAA|nameEntry|letterEntry|three.*letter', 'Three-letter initials entry');
checkInCode('localStorage.*(?:high|score|leader|best)', 'High score persistence (localStorage)');

// ─── 7. Intro/Splash Screen ────────────────────────────────────────────────
section('UI: Intro/Splash Screen');

checkInCode("splash|intro|boot.*screen|title.*screen|mode.*['\"]boot['\"]|mode.*['\"]intro['\"]|mode.*['\"]splash['\"]", 'Intro/splash screen state');
checkInCode('logo.*slam|logo.*anim|title.*anim|splash.*anim|intro.*anim', 'Intro animation');
checkInCode("setMode.*['\"]menu['\"]|navigate.*['\"]menu['\"]|transition.*menu", 'Transition from intro to menu');

// ─── 8. Score System ───────────────────────────────────────────────────────
section('GAMEPLAY: Score System');

checkInCode('class\\s+Scoring|new\\s+Scoring|scoring\\.', 'Score system class');
checkInCode('score.*\\+=|addScore|onHit|onCombo', 'Score accumulation logic');
checkInCode('multiplier|mult|streak.*mult|combo.*mult', 'Score multiplier');

// ─── 9. Walk vs Dash ───────────────────────────────────────────────────────
section('GAMEPLAY: Movement');

checkInCode('walk|walking|walkSpeed|walk_speed', 'Walk state (vs only dash)');
checkInCode('dash|dashing|dashSpeed|dash_speed', 'Dash mechanic');

// ─── 10. Combat Cancel / Chains ─────────────────────────────────────────────
section('GAMEPLAY: Combo System');

checkInCode('cancel|chain|cancelWindow|cancel_window|comboChain|hitCancel', 'Attack cancel/chain system');
checkInCode('light.*heavy|light.*cancel.*heavy|chain.*heavy', 'Light → heavy cancel chain');

// ─── 11. Guard Break ───────────────────────────────────────────────────────
section('GAMEPLAY: Guard System');

checkInCode('guardBreak|guard_break|blockBreak|block_break|chipDamage|chip_damage', 'Guard break / chip damage');
checkInCode('blocking|block.*state|block.*stand|block.*crouch', 'Block states');

// ─── 12. AI Sophistication ──────────────────────────────────────────────────
section('AI: Intelligence');

checkInCode('class\\s+AI|new\\s+AI', 'AI class exists');
checkInCode('combo.*ai|ai.*combo|ai.*chain|sequence.*attack', 'AI combo execution');
checkInCode('react|adaptation|adapt|blockRate|attackRate', 'AI adaptation/reaction');

// ─── 13. Damage Numbers ────────────────────────────────────────────────────
section('UI: Damage Numbers');

checkInCode('damageNumber|damage_number|floatingText|floatingDmg|dmgPopup', 'Floating damage numbers');

// ─── 14. KO Cinematic ──────────────────────────────────────────────────────
section('UI: KO Cinematic');

checkInCode("ko.*cinematic|ko.*anim|ko.*sequence|ko.*slow|ko.*zoom|state.*['\"]ko['\"]", 'KO cinematic sequence');
checkInCode('slowmo|slow.*motion|timeScale|time_scale', 'Slow motion effect');

// ─── 15. 60 FPS ────────────────────────────────────────────────────────────
section('PERFORMANCE: Frame Rate');

const fpsRefs = findInCode('FPS\\s*=\\s*(\\d+)|fps\\s*=\\s*(\\d+)', 'gi');
// Read the actual FPS value
const fpsMatch = allCode.match(/(?:const|let|var)\s+FPS\s*=\s*(\d+)/);
if (fpsMatch) {
  const fps = parseInt(fpsMatch[1]);
  if (fps >= 60) pass(`Target FPS = ${fps}`);
  else warn(`Target FPS = ${fps} (should be 60 for AAA feel)`);
} else {
  // Check for requestAnimationFrame usage (native 60fps)
  if (findInCode('requestAnimationFrame').length > 0) {
    pass('Uses requestAnimationFrame (browser-native frame rate)');
  } else {
    warn('No explicit FPS target found');
  }
}

// ─── 16. Motion Trails ─────────────────────────────────────────────────────
section('VISUAL: Effects');

checkInCode('trail|motionTrail|afterimage|ghostTrail', 'Motion trails / afterimages');
checkInCode('parallax|background.*scroll|bg.*scroll', 'Background parallax');

// ─── 17. Audio Polish ──────────────────────────────────────────────────────
section('AUDIO: Polish');

checkInCode('announcer|announce|voiceLine', 'Announcer / voice lines');
checkInCode('pitch.*variation|pitch.*random|playbackRate.*random|randomPitch', 'SFX pitch variation');
checkInCode('lowpass|low_pass|lowPass|musicFilter', 'Music filter effects (lowpass during slowmo)');

// ─── Summary ─────────────────────────────────────────────────────────────────
section('SUMMARY');
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
console.log(`  ⚠️  Warnings: ${warnings}`);
console.log();

const total = passed + failed;
const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
console.log(`  Feature coverage: ${pct}% (${passed}/${total})`);
console.log();

if (failed > 0) {
  console.log('  🔴 GAMEPLAY CHECK: FEATURES MISSING');
  process.exit(1);
} else {
  console.log('  🟢 GAMEPLAY CHECK: ALL FEATURES PRESENT');
  process.exit(0);
}
