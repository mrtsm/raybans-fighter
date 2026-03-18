#!/usr/bin/env node
/**
 * validate.js — Structural validation for Ray-Bans Fighter
 * Checks: JS syntax, module graph, sprites, audio, canvas size, localStorage keys, duplicates
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');
const ASSETS = path.join(ROOT, 'assets');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✅ PASS: ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ FAIL: ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️  WARN: ${msg}`); warnings++; }
function section(msg) { console.log(`\n━━━ ${msg} ━━━`); }

// ─── 1. JS Syntax Check ──────────────────────────────────────────────────────
section('JS Syntax Validation');

function findJsFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(findJsFiles(full));
    else if (entry.name.endsWith('.js')) results.push(full);
  }
  return results;
}

const jsFiles = findJsFiles(JS_DIR);

for (const file of jsFiles) {
  const rel = path.relative(ROOT, file);
  try {
    // node --check doesn't work with ES modules directly, so we parse with acorn-like approach
    // Instead, check for basic syntax by trying to parse with --input-type=module
    execSync(`node --input-type=module --check < "${file}"`, { stdio: 'pipe' });
    pass(`${rel} — syntax OK`);
  } catch (e) {
    // Try as script
    try {
      execSync(`node --check "${file}"`, { stdio: 'pipe' });
      pass(`${rel} — syntax OK (script mode)`);
    } catch (e2) {
      fail(`${rel} — syntax error: ${e2.stderr?.toString().trim().split('\n')[0] || 'unknown'}`);
    }
  }
}

// ─── 2. Module Graph Resolution ──────────────────────────────────────────────
section('Module Graph');

function extractImports(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const imports = [];
  // Match: import ... from '...'; and import '...';
  const regex = /import\s+(?:.*?\s+from\s+)?['"](.*?)['"]/g;
  let m;
  while ((m = regex.exec(src)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

const visited = new Set();
const importErrors = [];

function traceModuleGraph(filePath) {
  const resolved = path.resolve(filePath);
  if (visited.has(resolved)) return;
  visited.add(resolved);

  if (!fs.existsSync(resolved)) {
    importErrors.push(`Missing file: ${path.relative(ROOT, resolved)}`);
    return;
  }

  const imports = extractImports(resolved);
  for (const imp of imports) {
    const importedPath = path.resolve(path.dirname(resolved), imp);
    traceModuleGraph(importedPath);
  }
}

// Start from engine.js (entry point from index.html)
traceModuleGraph(path.join(JS_DIR, 'engine.js'));

if (importErrors.length === 0) {
  pass(`Module graph OK — ${visited.size} files traced from engine.js`);
} else {
  for (const err of importErrors) {
    fail(err);
  }
}

// Check all JS files are reachable
for (const file of jsFiles) {
  const resolved = path.resolve(file);
  if (!visited.has(resolved)) {
    warn(`${path.relative(ROOT, file)} — not imported by any module (orphan)`);
  }
}

// ─── 3. Sprite Validation ────────────────────────────────────────────────────
section('Sprite Validation');

const FIGHTERS = ['blaze', 'granite', 'shade', 'volt'];
const POSES = ['idle', 'light', 'heavy', 'block', 'crouch', 'jump', 'hitstun', 'ko', 'special', 'victory'];

// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
// JPEG magic bytes: FF D8 FF
const JPEG_MAGIC = Buffer.from([0xFF, 0xD8, 0xFF]);
// WebP magic: RIFF....WEBP
const WEBP_SIG = Buffer.from('WEBP');

function isValidImage(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 8) return { valid: false, format: 'unknown' };
    if (buf.subarray(0, 8).equals(PNG_MAGIC)) return { valid: true, format: 'PNG' };
    if (buf.subarray(0, 3).equals(JPEG_MAGIC)) return { valid: true, format: 'JPEG' };
    if (buf.length >= 12 && buf.subarray(8, 12).equals(WEBP_SIG)) return { valid: true, format: 'WebP' };
    return { valid: false, format: 'unknown' };
  } catch {
    return { valid: false, format: 'error' };
  }
}

// Legacy alias
function isValidPng(filePath) {
  return isValidImage(filePath).valid;
}

let totalSprites = 0;
let validSprites = 0;

for (const fighter of FIGHTERS) {
  for (const pose of POSES) {
    totalSprites++;
    const spritePath = path.join(ASSETS, 'sprites', fighter, `${pose}.png`);
    const rel = path.relative(ROOT, spritePath);
    if (!fs.existsSync(spritePath)) {
      fail(`Missing sprite: ${rel}`);
      continue;
    }
    const stat = fs.statSync(spritePath);
    if (stat.size === 0) {
      fail(`Empty sprite: ${rel} (0 bytes)`);
      continue;
    }
    const imgCheck = isValidImage(spritePath);
    if (!imgCheck.valid) {
      fail(`Invalid image header: ${rel}`);
      continue;
    }
    if (stat.size < 500) {
      warn(`Suspiciously small sprite: ${rel} (${stat.size} bytes)`);
    }
    if (imgCheck.format !== 'PNG') {
      warn(`${rel} — ${imgCheck.format} saved as .png (browser OK, not ideal) (${(stat.size / 1024).toFixed(1)}KB)`);
    }
    validSprites++;
    pass(`${rel} — valid ${imgCheck.format} (${(stat.size / 1024).toFixed(1)}KB)`);
  }
}

// Check extra sprites (arena_bg, title_bg)
for (const extra of ['arena_bg.png', 'title_bg.png']) {
  const p = path.join(ASSETS, 'sprites', extra);
  if (fs.existsSync(p)) {
    const imgCheck = isValidImage(p);
    if (imgCheck.valid) pass(`sprites/${extra} — valid ${imgCheck.format}`);
    else fail(`sprites/${extra} — invalid image`);
  } else {
    warn(`sprites/${extra} — not found (may be optional)`);
  }
}

console.log(`  Sprites: ${validSprites}/${totalSprites} valid`);

// ─── 4. Audio Validation ─────────────────────────────────────────────────────
section('Audio Validation');

// Extract audio references from audio.js
const audioSrc = fs.readFileSync(path.join(JS_DIR, 'audio.js'), 'utf8');
const audioRefs = [];
const audioRegex = /['"]([^'"]*\.mp3)['"]/g;
let am;
while ((am = audioRegex.exec(audioSrc)) !== null) {
  audioRefs.push(am[1]);
}

// Also check for voice refs from fighters.js data
const fighterSrc = fs.readFileSync(path.join(JS_DIR, 'data', 'fighters.js'), 'utf8');
const voiceRegex = /['"]([^'"]*\.mp3)['"]/g;
while ((am = voiceRegex.exec(fighterSrc)) !== null) {
  audioRefs.push(am[1]);
}

const uniqueAudioRefs = [...new Set(audioRefs)];

for (const ref of uniqueAudioRefs) {
  const audioPath = path.join(ROOT, ref);
  if (fs.existsSync(audioPath)) {
    const stat = fs.statSync(audioPath);
    if (stat.size > 0) pass(`${ref} — exists (${(stat.size / 1024).toFixed(1)}KB)`);
    else fail(`${ref} — empty file`);
  } else {
    fail(`${ref} — referenced in code but file missing`);
  }
}

// ─── 5. Canvas Size ──────────────────────────────────────────────────────────
section('Canvas Configuration');

const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const widthMatch = indexHtml.match(/width=["']?(\d+)/);
const heightMatch = indexHtml.match(/height=["']?(\d+)/);

if (widthMatch && widthMatch[1] === '600') pass('Canvas width = 600');
else fail(`Canvas width = ${widthMatch?.[1] || 'NOT FOUND'} (expected 600)`);

if (heightMatch && heightMatch[1] === '600') pass('Canvas height = 600');
else fail(`Canvas height = ${heightMatch?.[1] || 'NOT FOUND'} (expected 600)`);

// Check for meta viewport
if (indexHtml.includes('user-scalable=no')) pass('Viewport: user-scalable=no');
else warn('Missing user-scalable=no in viewport meta');

// ─── 6. localStorage Keys ────────────────────────────────────────────────────
section('localStorage Usage');

const lsKeys = new Set();
for (const file of jsFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const lsRegex = /localStorage\.(getItem|setItem|removeItem)\(['"]([^'"]+)['"]\)/g;
  let lm;
  while ((lm = lsRegex.exec(src)) !== null) {
    lsKeys.add(lm[2]);
  }
  // Also check for direct key access patterns
  const directRegex = /const\s+\w+\s*=\s*['"](\w+_\w+)['"]/g;
  while ((lm = directRegex.exec(src)) !== null) {
    if (src.includes(`localStorage`) && src.includes(lm[1])) {
      lsKeys.add(lm[1]);
    }
  }
}

if (lsKeys.size > 0) {
  pass(`Found ${lsKeys.size} localStorage key(s): ${[...lsKeys].join(', ')}`);
} else {
  warn('No localStorage keys detected');
}

// ─── 7. Duplicate Function/Class Names ───────────────────────────────────────
section('Duplicate Detection');

const exportNames = new Map(); // name -> [file, ...]

for (const file of jsFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  
  // export class/function/const
  const exportRegex = /export\s+(?:class|function|const|let|var)\s+(\w+)/g;
  let dm;
  while ((dm = exportRegex.exec(src)) !== null) {
    const name = dm[1];
    if (!exportNames.has(name)) exportNames.set(name, []);
    exportNames.get(name).push(rel);
  }
}

let dupes = 0;
for (const [name, files] of exportNames) {
  if (files.length > 1) {
    // clamp is intentionally duplicated (utility), skip if both are small helpers
    if (name === 'clamp' || name === 'clamp01') continue;
    fail(`Duplicate export "${name}" in: ${files.join(', ')}`);
    dupes++;
  }
}
if (dupes === 0) pass('No duplicate exported names');

// Check for duplicate function names within single files
for (const file of jsFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const funcRegex = /(?:^|\n)\s*(?:export\s+)?(?:function|class)\s+(\w+)/g;
  const names = [];
  let fm;
  while ((fm = funcRegex.exec(src)) !== null) {
    names.push(fm[1]);
  }
  const seen = new Set();
  for (const n of names) {
    if (seen.has(n)) {
      fail(`Duplicate function/class "${n}" in ${rel}`);
    }
    seen.add(n);
  }
}

// ─── 8. index.html Boot Check ────────────────────────────────────────────────
section('Boot Sequence');

if (indexHtml.includes("import { boot } from './js/engine.js'")) {
  pass('index.html imports boot from engine.js');
} else if (indexHtml.includes('import') && indexHtml.includes('engine')) {
  pass('index.html imports from engine.js (alternate pattern)');
} else {
  fail('index.html does not import boot from engine.js');
}

if (indexHtml.includes("boot(")) {
  pass('index.html calls boot()');
} else {
  fail('index.html does not call boot()');
}

// ─── Summary ─────────────────────────────────────────────────────────────────
section('SUMMARY');
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
console.log(`  ⚠️  Warnings: ${warnings}`);
console.log();

if (failed > 0) {
  console.log('  🔴 VALIDATION FAILED');
  process.exit(1);
} else if (warnings > 0) {
  console.log('  🟡 VALIDATION PASSED (with warnings)');
  process.exit(0);
} else {
  console.log('  🟢 VALIDATION PASSED');
  process.exit(0);
}
