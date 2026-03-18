# POLISH_PLAN.md — Pixel Brawl AAA Polish Roadmap

> **Goal:** Make this feel like a showcase title for Meta display glasses. Every hit should be visceral, every move satisfying, every interaction responsive. Think Street Fighter 6 level of juice on a 600×600 canvas.

---

## 1. Current State Assessment

### What Works
- **Solid architecture**: Clean separation — engine, fight, fighter, combat, AI, input, renderer, UI, audio, scoring, progression. ~3K lines across 14 well-organized files.
- **Full game loop**: Menu → Select → Fight → Results with progression, XP, mastery ranks, achievements, daily challenges. This is surprisingly complete.
- **4 distinct fighters**: Blaze (rushdown/fireball), Granite (grappler/armor), Shade (teleport/trickster), Volt (zoner/stun). Each has unique specials and signatures.
- **Combat fundamentals**: Light/heavy/grab/low/air attacks, blocking (stand/crouch), dashing with i-frames, momentum meter, specials, signatures. The rock-paper-scissors of attack > grab > block > attack exists.
- **Visual foundation**: AI-generated sprites per state (10 poses × 4 fighters), particle system, screen shake, HUD with smooth HP bars, neon aesthetic, vignette, scanlines.
- **Audio pipeline**: Full music per fighter + menu/select/victory/defeat/laststand, SFX for every action, voice lines per fighter.
- **Progression**: XP, mastery ranks (bronze→master), player levels, unlockable fighter (Volt) and difficulties, 30 achievements, daily challenges with modifiers.

### What Doesn't Work / Feels Off
- **Hits don't feel impactful enough.** There's screen shake on heavies and a 2-frame freeze on big hits, but the overall "juice" is thin. No slowdown on KO, no dynamic zoom, no hit sparks beyond simple particles.
- **No real combo system.** The "streak" counter tracks consecutive hits but there's no cancel system, no hitstun advantage, no link timing. You just mash buttons and hope they connect. This is the #1 gameplay gap.
- **AI is simplistic.** It picks one action per cooldown cycle with random rolls. No combo execution, no mixup sequences, no spacing awareness beyond close/mid/far. Easy difficulty is boring; hard just means faster reactions.
- **Movement feels floaty.** `vx *= 0.70` decay every frame makes dashing feel sluggish. Jump arc is fine but landing has no impact. No walk speed — you can only dash or stand still.
- **Input is incomplete for armband.** No mouse click → attack mapping. Touch handling is basic (pointer events on canvas only). No Web Gamepad API at all.
- **Single static sprite per state.** No animation frames — each state is one PNG. This makes everything feel like a slideshow rather than a fighting game.
- **No combo counter display.** The scoring system tracks streaks but the player never sees "3 HIT COMBO" on screen.
- **Grab system is confusing.** Break window is 8 frames (~267ms at 30fps) — too long, and pressing light to break isn't communicated.
- **No walk.** Holding left/right does nothing — you can only dash. This removes the ability to space carefully.
- **Timer at 45s is too long.** Rounds drag. 30s would force more aggression.
- **No round transition animation.** It just snaps to "ROUND END" banner for 2 seconds.
- **Results screen is sparse.** No breakdown of hits landed, damage dealt, etc.

### Bugs & Code Quality Issues

| Issue | File | Line(s) | Severity |
|-------|------|---------|----------|
| `scoring.onGotHit()` is defined but **never called** — streak never resets on getting hit | `scoring.js` | L47-50 | **High** — streaks are inflated |
| `_invisT` decremented in `fight.js render()` (render-side mutation) instead of `update()` | `fight.js` | L216-217 | Medium — timing depends on render rate |
| `blockPunishAdvF` is set to 4 on heavy block but **never consumed** | `fight.js` | L170 | Medium — dead code, block punish doesn't work |
| `f.def.voice.lose` referenced but voice map keys don't include `lose` entries | `fighters.js` / `audio.js` | — | Low — silent fail, no crash |
| `armorDash` only defined for Granite but checked on every fighter via `this.def.armorDash` | `fighter.js` | L68 | Low — works due to falsy check |
| `speedMul` daily mod defined but never applied to game speed | `progression.js` | L95 | Medium — "Speed Demon" challenge does nothing |
| Touch multi-finger detection is unreliable — only increments counter, doesn't track multiple pointer IDs | `input.js` | L115-120 | Medium — two-finger tap rarely works |
| `combat.fireSpecial()` for Shade at gold+ rank deals damage but has no hitlag/particles | `combat.js` | L128 | Low — no visual feedback |
| `antiAir` property on moves defined but `heavy.antiAir` only tracked for scoring, doesn't affect damage | `combat.js` / `fighter.js` | — | Low — expected anti-air bonus is cosmetic only |
| No `contextmenu` prevention — right-click will open browser menu instead of being usable as input | `input.js` | — | **High** for armband — blocks right-click input |
| FPS locked to 30 (`const FPS = 30`) — feels choppy on 60Hz+ displays | `engine.js` | L8 | Medium — noticeable jank |

---

## 2. Input Improvements — Meta Armband + Mouse Support

### Current Input Scheme (`input.js`)
```
Keyboard:
  Arrow Left/Right  → dash (one-shot on keydown)
  Arrow Up          → jump
  Arrow Down (hold) → block (stand if not crouching, crouch if crouching)
  Z                 → light attack (tap) / grab (double-tap) / special charge (hold 0.4s+)
  X                 → heavy attack
  C                 → grab
  Enter/Space       → UI confirm
  Escape            → UI back

Touch (pointer events on canvas):
  Tap               → light
  Two-finger tap    → heavy
  Three-finger tap  → grab
  Horizontal swipe  → dash
  Vertical swipe    → jump (up) / crouch (down)
  Long press (0.4s) → special charge
```

### Target Armband Mapping
The Meta display glasses armband sends standard browser events:
- **Arrow keys** (left/right/up/down) via `keydown`/`keyup`
- **Mouse left click** via `mousedown`/`mouseup` (button 0)
- **Mouse right click** via `mousedown`/`mouseup` (button 2)

#### Proposed Armband/Mouse Controls
```
Left/Right arrows   → walk (hold) / dash (double-tap, <200ms)
Up arrow            → jump
Down arrow (hold)   → block
Left click (tap)    → light attack
Left click (hold 0.4s+) → special charge → release = fire special
Right click (tap)   → heavy attack
Right click (hold 0.4s+) → grab (gives time to aim)
```

### Implementation Plan — `input.js`

#### A. Add Mouse Click Handlers (Priority: P0)
```js
// In constructor:
this._mouseDownAt = new Map(); // button → timestamp
this._mouseChargeStarted = new Map(); // button → bool

// Prevent context menu globally
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Mouse button mapping
canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  this._mouseDownAt.set(e.button, this.now);
  this._mouseChargeStarted.set(e.button, false);
  
  if (e.button === 0) { // Left click
    this._push('light');
  }
  if (e.button === 2) { // Right click
    this._push('heavy');
  }
});

canvas.addEventListener('mouseup', (e) => {
  e.preventDefault();
  const downT = this._mouseDownAt.get(e.button) ?? this.now;
  const held = this.now - downT;
  
  if (e.button === 0 && held >= 0.4) { // Left held = special release
    this._push('special_release');
  }
  if (e.button === 2 && held >= 0.3) { // Right held = grab
    this._push('grab');
  }
  
  this._mouseDownAt.delete(e.button);
  this._mouseChargeStarted.delete(e.button, false);
});
```

#### B. Add Walk (Hold Arrow) vs Dash (Double-Tap) — `input.js`
Currently arrow left/right only fire `dash_left`/`dash_right` on keydown. Need:
```js
// Track last tap time per direction
this._lastDirTap = { left: -999, right: -999 };

// In _handleKeyDown:
if (c === 'ArrowLeft') {
  const dt = this.now - this._lastDirTap.left;
  this._lastDirTap.left = this.now;
  if (dt < 0.2) this._push('dash_left');
  else this._push('walk_left');
}
// Same for ArrowRight

// In update():
if (this.keys.has('ArrowLeft')) this._push('walk_left_hold');
if (this.keys.has('ArrowRight')) this._push('walk_right_hold');
```

Add walk to `fighter.js`:
```js
// In fight.js _applyPlayerInputs:
if (a === 'walk_left_hold') this.p1.walk(-1);
if (a === 'walk_right_hold') this.p1.walk(1);

// In Fighter class:
walk(dir) {
  if (!this.canAct()) return;
  this.x += dir * this.def.walkSpeed * (1/30); // per-frame walk
}
```

Add `walkSpeed` to each fighter definition in `fighters.js` (e.g., Blaze: 120, Granite: 80, Shade: 130, Volt: 100 px/s).

#### C. Add Left-Click Charge Detection in `update()` — `input.js`
```js
// In update(), alongside Z key charge detection:
if (this._mouseDownAt.has(0)) { // left mouse held
  const held = this.now - this._mouseDownAt.get(0);
  if (held >= 0.4 && !this._mouseChargeStarted.get(0)) {
    this._mouseChargeStarted.set(0, true);
    this._push('special_charge_start');
  }
}
```

#### D. Web Gamepad API (Fallback/Extra Support)
Add gamepad polling in `update()` for any standard gamepad:
```js
// In update():
const gamepads = navigator.getGamepads?.() || [];
for (const gp of gamepads) {
  if (!gp) continue;
  // D-pad or left stick
  const lx = gp.axes[0] || 0;
  const ly = gp.axes[1] || 0;
  if (lx < -0.5) this._push('walk_left_hold');
  if (lx > 0.5) this._push('walk_right_hold');
  if (ly < -0.5 && !this._gpJumped) { this._push('jump'); this._gpJumped = true; }
  if (ly >= -0.3) this._gpJumped = false;
  if (ly > 0.5) this._push('down_hold');
  
  // Buttons: A=light, B/X=heavy, Y=grab, triggers=special
  if (gp.buttons[0]?.pressed && !this._gpA) { this._push('light'); this._gpA = true; }
  if (!gp.buttons[0]?.pressed) this._gpA = false;
  // etc.
}
```

---

## 3. Juice & Feel — Making Hits Visceral

### A. Hit Freeze Frames (Priority: P0)
**Current:** `renderer._freezeFrames = 2` only on shakes ≥ 8 intensity. Applied render-side only.
**Problem:** Not enough freeze, and it only triggers on heavies.

**Fix in `combat.js` `resolveMelee()` and `fight.js`:**
```
Light hit:  1 frame freeze
Heavy hit:  3 frame freeze
Grab land:  2 frame freeze  
Special:    3 frame freeze
Signature:  5 frame freeze
KO blow:    8 frame freeze + 0.5s slowmo (already have slowmo, increase to 0.8s)
```

**Implementation:** Add `this.renderer.doFreeze(n)` method that sets `_freezeFrames`. Call from combat resolution.

### B. Screen Shake Tuning
**Current values are decent but inconsistent:**
```
Heavy hit:  shake(8, 0.20)  → good
KO:         shake(14, 0.45) → good
Signature:  shake(12, 0.45) → good
```

**Add:**
```
Light hit:    shake(3, 0.10)   — subtle but present
Grab land:    shake(6, 0.25)
Block heavy:  shake(4, 0.15)   — feedback for defender too
Special proj: shake(5, 0.18)   — on projectile hit
Landing:      shake(2, 0.08)   — subtle on jump landing
```

### C. Dynamic Camera Zoom (Priority: P1)
Add a subtle zoom-in during big moments:
```js
// In renderer:
this.zoom = 1.0;
this.zoomTarget = 1.0;

// During KO sequence:
this.zoomTarget = 1.15; // 15% zoom toward action

// In beginScene():
this.zoom = lerp(this.zoom, this.zoomTarget, 0.08);
ctx.setTransform(this.zoom, 0, 0, this.zoom,
  (1-this.zoom) * this.w/2 + sx,
  (1-this.zoom) * this.h/2 + sy);
```

Trigger zoom on: KO (1.15×), signature land (1.12×), last-stand activation (1.05×).

### D. Hit Spark Effects (Priority: P0)
**Current:** `makeHitParticles()` creates small colored dots. Fine as secondary particles but needs a primary hit spark.

**Add a radial burst sprite/procedural effect:**
```js
// New: HitSpark in renderer
drawHitSpark(x, y, size, color) {
  const c = this.ctx;
  c.save();
  c.globalCompositeOperation = 'screen';
  // Radial gradient flash
  const g = c.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.3, withAlpha(color, 0.8));
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(x - size, y - size, size * 2, size * 2);
  
  // Slash lines (4-8 random lines radiating out)
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 / 6) * i + Math.random() * 0.5;
    const len = size * (0.5 + Math.random() * 0.5);
    c.beginPath();
    c.moveTo(x + Math.cos(angle) * size * 0.15, y + Math.sin(angle) * size * 0.15);
    c.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    c.stroke();
  }
  c.restore();
}
```

Call on hit: light → size 30, heavy → size 55, special → size 70, signature → size 100.

### E. Knockback Improvement
**Current:** `pushPx` moves defender instantly. No visual selling.
**Fix:** Apply knockback as velocity, not teleport:
```js
// Instead of:
defender.x = clamp(defender.x + attacker.facing * a.pushPx, ...)
// Do:
defender.vx += attacker.facing * a.pushPx * 8; // velocity-based knockback
// The existing vx *= 0.70 decay will handle the deceleration
```

For heavies and specials, add **launch** (small upward velocity):
```js
if (a.kind === 'heavy' && a.launch) {
  defender.vy = -180; // small pop-up
  defender.onGround = false;
}
```

### F. Combo Counter Display (Priority: P0)
Add a floating combo counter that appears during streaks:
```js
// In renderer — new method:
drawComboCounter(streak, x, y, color) {
  if (streak < 2) return;
  const c = this.ctx;
  c.save();
  const scale = 1 + Math.min(streak * 0.05, 0.4); // grows with combo
  c.translate(x, y);
  c.scale(scale, scale);
  
  c.textAlign = 'center';
  c.font = '900 32px Orbitron';
  c.fillStyle = 'rgba(255,215,64,0.95)';
  c.shadowColor = 'rgba(255,215,64,0.8)';
  c.shadowBlur = 20;
  c.fillText(`${streak}`, 0, 0);
  
  c.font = '800 14px Orbitron';
  c.fillText('HIT COMBO', 0, 22);
  c.restore();
}
```

Display near the attacker when streak ≥ 2. Fade out after 1.5s of no hits.

### G. FPS Upgrade to 60 (Priority: P1)
**Current:** `const FPS = 30` in `engine.js` line 8.
Change to 60 and adjust all frame-count based values:
- All attack `startupF`, `activeF`, `recoveryF` → multiply by 2
- `hitstunF` → multiply by 2
- `dashIframesF` → multiply by 2
- `_aiBlockTimer` → already in seconds, OK
- Particle system already time-based → OK
- `vx *= 0.70` → change to `vx *= 0.85` (equivalent decay at 60fps)

This is a medium-effort change but massively improves perceived smoothness, especially on the Meta glasses display.

---

## 4. Gameplay Improvements

### A. Combo System — Cancel Windows (Priority: P0)
**The most impactful gameplay change.** Currently attacks can't chain — each attack must fully complete before the next starts.

**Add cancel system in `fighter.js`:**
```js
// During active or late-active frames of a light attack,
// allow canceling into heavy or special:
startAttack(kind, variant={}) {
  // Allow cancel from light → heavy (gatling chain)
  if (this.attack && this.attack.kind === 'light') {
    const aw = this.attackWindow();
    if (aw.active || (aw.recovery && this.attackF <= this.attack.startupF + this.attack.activeF + 2)) {
      if (kind === 'heavy' || kind === 'special') {
        // Cancel: clear current attack and start new one
        this.attack = null;
        // Fall through to start new attack
      }
    }
  }
  // ... rest of existing startAttack logic
}
```

**Chain routes per fighter (add to `fighters.js`):**
```
Universal chains:
  light → light (2-hit string)
  light → heavy (gatling)
  light → low (mix-up)
  heavy → special (on hit confirm)
  
Fighter-specific:
  Blaze:  light → light → heavy (3-hit combo)
  Granite: light → grab (tick throw)
  Shade:  light → low → teleport (mix chain)
  Volt:   light → light → low (3-hit low string)
```

**Implementation:**
- Add `cancelWindow` object to each move definition
- Track `comboRoute` array on Fighter to limit chain length (max 3-4 hits)
- Reset chain on whiff, block, or recovery end

### B. Hitstun Advantage & Frame Data (Priority: P0)
**Current:** Fixed 9 frames of hitstun regardless of move.
**Fix:** Scale hitstun to the move:
```
Light:     6 frames hitstun  (slight + on hit)
Heavy:     12 frames hitstun (big + on hit, combo into special)
Low:       6 frames hitstun
Air:       8 frames hitstun
Grab:      N/A (unblockable)
Special:   10 frames hitstun + unique effects
```

This creates real frame advantage: light is +3 on hit (6 hitstun - 3 recovery), allowing light → light links. Heavy is massively + on hit but too slow to combo from light without a cancel window.

### C. Move Variety & Fighter Identity
Each fighter needs 1-2 more unique mechanics:

**Blaze — Rushdown:**
- Add: `rekka` (sequential light inputs = 3-part rush combo, each followup is optional)
- Add: `ex_fireball` (costs 50 momentum, faster + two-hit fireball)

**Granite — Grappler:**
- Add: `command_grab` (forward + grab = slow but does 25 damage, unblockable)
- Add: `ground_pound` (down + heavy while jumping = splash damage on landing, must be blocked low)

**Shade — Trickster:**
- Add: `shadow_clone` (special leaves a decoy at current position, Shade teleports)
- Add: `cross_up_slash` (air heavy goes through opponent and attacks from behind)

**Volt — Zoner:**
- Add: `chain_lightning` (if lightning projectile hits, arcs to hit again for half damage)
- Add: `overcharge` (hold special longer for bigger/slower projectile that stuns 6 frames)

### D. AI Overhaul (Priority: P1)
**Current AI (`ai.js`) issues:**
- Only picks one action per cooldown cycle
- No combo execution — never chains attacks
- No spacing game — just reacts to distance thresholds
- Adaptation is too simple (just checks ratios of opponent's last 20 actions)

**Rewrite plan:**
```js
class AI {
  constructor({ difficulty, fighterId }) {
    // Behavior tree / state machine
    this.state = 'neutral'; // neutral | pressure | defense | punish | wakeup
    this.plan = [];  // queued action sequence
    this.planCooldown = 0;
    
    // Per-fighter AI personality
    this.personality = AI_PERSONALITIES[fighterId];
  }
  
  update(dt, self, opp, context) {
    // Execute current plan
    if (this.plan.length > 0 && this.planCooldown <= 0) {
      return this._executePlan(dt);
    }
    
    // Decide new plan based on state
    this._assessState(self, opp);
    
    switch (this.state) {
      case 'neutral': return this._neutralPlan(self, opp);
      case 'pressure': return this._pressurePlan(self, opp);  // combos!
      case 'defense': return this._defensePlan(self, opp);
      case 'punish': return this._punishPlan(self, opp);
    }
  }
  
  _pressurePlan(self, opp) {
    // AI executes actual combos:
    this.plan = [
      { action: 'light', delay: 0 },
      { action: 'light', delay: 0.12 },
      { action: 'heavy', delay: 0.15 },
    ];
    return this._executePlan(0);
  }
}
```

**Difficulty scaling via plan quality:**
- Easy: single-move plans, slow reaction, often picks suboptimal moves
- Normal: 2-move plans, moderate reaction, basic mixups
- Hard: 3-move combos, fast reaction, reads player habits
- Nightmare: optimal combos, punishes every whiff, varies timing

### E. Pacing Improvements
- **Round timer:** 45s → 30s (more urgency)
- **Between-round pause:** 2.0s → 1.5s (less dead time)
- **Intro phase:** 1.0s → 0.7s
- **Last Stand mechanic:** When either fighter is below 20% HP, add a subtle speed boost (1.1× to attack frame counts) to make endings more dramatic
- **Momentum gain on whiff:** Currently 0 — add small gain (3) to encourage aggression

### F. Risk/Reward Balance
```
Current problems:
- Blocking is too safe (only 20% chip, can't be chip-killed)
- Grabs are easily breakable (8 frame window = 267ms)
- Special charge is interruptible but there's no reward for the risk
- Light attacks have no reason not to spam (safe, fast, build momentum)

Fixes:
- Chip damage: 20% → 30%, and chip CAN kill at ≤5% HP
- Grab break window: 8 frames → 4 frames (133ms) — demanding but fair
- Charged special: if fully charged (1.0s), deals 1.5× damage
- Light attacks: add 1 frame to recovery (4 → 5) so they're not totally free
- Heavy on block: increase block advantage to 6 frames (currently 4, unused)
- Add guard break: 3 consecutive blocked attacks → guard breaks for 0.5s stun
```

---

## 5. Visual Polish

### A. Sprite Animation (Priority: P1)
**Current:** One static sprite per state. This is the biggest visual weakness.

**Option 1 — Sprite Sheet Animation (ideal):**
Generate 3-4 frames per action per fighter using AI art tools:
```
idle:     3 frames (breathing cycle, 0.4s each)
light:    3 frames (startup-swing-recovery)
heavy:    4 frames (windup-windup-swing-recovery)
walk:     4 frames (step cycle)
hitstun:  2 frames (recoil-settle)
block:    2 frames (impact-hold)
```

That's ~20 frames × 4 fighters = 80 images. Significant asset work but huge payoff.

**Option 2 — Procedural Animation (faster to implement):**
Apply transforms to existing single sprites:
```js
// In renderer.drawFighter():
// Idle: gentle bob
const bobY = Math.sin(performance.now() / 400) * 3;

// Attack: scale squash/stretch
if (state === 'attacking') {
  const progress = f.attackF / totalFrames;
  if (progress < 0.3) ctx.scale(0.92, 1.08); // wind up (stretch tall)
  else if (progress < 0.5) ctx.scale(1.15, 0.88); // swing (squash wide)
  else ctx.scale(1.0, 1.0); // recovery
}

// Hitstun: shake + tilt
if (f.hitstunF > 0) {
  const shake = (Math.random() - 0.5) * 6;
  ctx.translate(shake, 0);
  ctx.rotate(0.05 * Math.sin(f.hitstunF * 3));
}

// Dash: lean forward + motion blur (stretch horizontally)
if (f.state === 'dash') {
  ctx.scale(1.2, 0.9);
  ctx.globalAlpha = 0.85;
}
```

**Recommendation:** Do Option 2 first (a few hours of work, immediate impact), then Option 1 as a follow-up milestone.

### B. Background Parallax & Stage Life
Add subtle parallax layers to the arena:
```js
// In renderer.beginScene(), after drawing arena_bg:
// Draw 2-3 overlay layers at different scroll rates based on camera/shake
const parallaxOffset = sx * 0.3; // slower than shake
ctx.drawImage(this.sprites.arena_fg, parallaxOffset, 0, this.w, this.h);
```

Add animated elements: flickering neon signs, floating dust particles, crowd silhouettes at bottom.

### C. UI Transitions & Polish

**Round Start:**
- "ROUND 1" text slams in from both sides, meets in middle with impact particles
- Fighter names slide in from respective sides
- 0.5s dramatic pause → "FIGHT!" with screen flash

**KO Sequence:**
- Time slows to 0.3×
- Camera zooms 1.15× toward the action
- "K.O." text appears with shatter effect
- Winner does victory pose, loser ragdolls

**Between Rounds:**
- Score tally animates (numbers counting up)
- Round indicators fill in with fighter color

**Results Screen:**
- Stats fly in one by one with typewriter SFX
- Bar graphs for damage dealt/taken
- "NEW BEST!" callout if applicable
- Achievement unlocks pop up as badges

### D. Trail Effects
Add motion trails to fast moves:
```js
// Store last 3-5 positions of the fighter during attacks/dashes
// Draw semi-transparent copies at previous positions
if (f.attack || f.state === 'dash') {
  for (let i = 0; i < this._trails.length; i++) {
    const trail = this._trails[i];
    ctx.globalAlpha = 0.15 * (1 - i / this._trails.length);
    ctx.drawImage(im, trail.x - drawW/2, trail.y - drawH, drawW, drawH);
  }
}
```

### E. Damage Numbers (Priority: P1)
Floating damage numbers on hit:
```js
// Add to particle system or separate overlay:
this._damageNumbers.push({
  x: defender.x,
  y: defender.y - 80,
  value: dmg,
  color: isCrit ? '#ffdd44' : '#ffffff',
  t: 0.8,
  vy: -80,
});
```

---

## 6. Audio Polish

### A. Layered Hit Sounds
**Current:** Single `sfx_light` or `sfx_heavy` per hit.
**Add layers:**
```
Light hit: sfx_light + random impact variation (3 variants, pitch-shifted)
Heavy hit: sfx_heavy + bass thump + slight reverb tail
Grab:      sfx_grab + body slam + grunt
Special:   unique per fighter (already exists) + whoosh
Signature: unique + explosion + crowd gasp
Block:     sfx_block + metallic clang variant
KO:        sfx_ko + impact + crowd roar + slow-mo whoosh
```

**Implementation in `audio.js`:**
```js
play(key, { vol=1, rate=1, variations=0 } = {}) {
  // If variations > 0, add random pitch shift for variety
  const actualRate = rate + (variations ? (Math.random() - 0.5) * 0.15 : 0);
  // ... existing code with actualRate
}
```

Call with `this.audio.play('sfx_light', { variations: 3 })` for natural variation.

### B. Combo Announcer
Add voice announcements for combos:
```
2 hits: (silent)
3 hits: "COMBO!"
5 hits: "INCREDIBLE!"
7 hits: "UNSTOPPABLE!"
10+:    "LEGENDARY!"
```

Generate these as separate audio files or use TTS. Play from scoring system.

### C. Music Reactivity
**Current:** Static background music with crossfade to `music_laststand` at <20% HP.
**Add:**
- Low-pass filter on music during slow-mo sequences
- Music intensity increase (gain bump) during combo streaks
- Victory/defeat music stingers that layer over the fight music fade

```js
// In AudioManager:
setMusicFilter(freq) {
  if (!this._filter) {
    this._filter = this.ctx.createBiquadFilter();
    this._filter.type = 'lowpass';
    // Reconnect: musicGain → filter → destination
  }
  this._filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
}
```

### D. Environmental Audio
Add ambient SFX layer:
- Crowd murmur (looping, low volume)
- Crowd reacts to big hits (short burst)
- Neon hum / electrical atmosphere (very subtle)

---

## 7. Prioritized Implementation Order

### Phase 1 — "Make It Feel Good" (1-2 days)
*Maximum fun impact per hour of work.*

| # | Task | File(s) | Impact | Effort |
|---|------|---------|--------|--------|
| 1 | **Mouse click → attack mapping** (left=light, right=heavy, right-hold=grab) + contextmenu prevention | `input.js` | 🔴 Critical for armband | 30min |
| 2 | **Fix `onGotHit` never called** — streaks actually reset when hit | `fight.js`, `scoring.js` | 🔴 Bug fix | 15min |
| 3 | **Hit freeze frames** on every hit type (not just heavy) | `renderer.js`, `combat.js` | 🟠 Huge feel improvement | 30min |
| 4 | **Combo counter display** — "3 HIT COMBO" on screen | `renderer.js`, `fight.js` | 🟠 Immediate feedback | 45min |
| 5 | **Hit sparks** — radial burst effect on contact | `renderer.js` | 🟠 Visual juice | 30min |
| 6 | **Screen shake on all hits** (tuned per type) | `combat.js` | 🟢 Polish | 15min |
| 7 | **Knockback as velocity** instead of teleport | `combat.js` | 🟢 Feels more physical | 20min |
| 8 | **Procedural sprite animation** (bob, squash/stretch, hitstun shake) | `renderer.js` | 🟢 Huge visual upgrade | 1hr |
| 9 | **Walk (hold arrow)** vs dash (double-tap) | `input.js`, `fighter.js`, `fight.js` | 🟢 Better spacing game | 45min |
| 10 | **Round timer 45→30s** + shorter intro/between phases | `fight.js` | 🟢 Better pacing | 10min |

### Phase 2 — "Make It Deep" (2-3 days)
*Gameplay depth that rewards skill.*

| # | Task | File(s) | Impact | Effort |
|---|------|---------|--------|--------|
| 11 | **Cancel system** (light→heavy, light→special chains) | `fighter.js`, `fight.js` | 🔴 Core combo gameplay | 2hr |
| 12 | **Hitstun scaling** per move type | `fighter.js`, `fighters.js` | 🔴 Combo viability | 30min |
| 13 | **Grab rebalance** (4 frame break window) + visual indicator | `fight.js` | 🟠 Risk/reward | 30min |
| 14 | **Guard break** after 3 consecutive blocks | `fighter.js`, `combat.js` | 🟠 Prevents turtle meta | 45min |
| 15 | **Chip kill at ≤5% HP** | `fighter.js` | 🟢 Tension at low HP | 10min |
| 16 | **AI combo execution** — AI chains attacks | `ai.js` | 🟠 Challenge | 2hr |
| 17 | **AI state machine** (neutral/pressure/defense/punish) | `ai.js` | 🟢 Smarter opponent | 2hr |
| 18 | **Fighter-specific new moves** (rekka, command grab, etc.) | `fighters.js`, `combat.js`, `fight.js` | 🟢 Depth | 3hr |
| 19 | **Damage numbers** floating on hit | `renderer.js` | 🟢 Feedback | 30min |
| 20 | **Fix `speedMul` daily mod** — actually applies to game | `fight.js`, `engine.js` | 🟢 Bug fix | 20min |

### Phase 3 — "Make It Shine" (3-5 days)
*AAA polish for the Meta glasses showcase.*

| # | Task | File(s) | Impact | Effort |
|---|------|---------|--------|--------|
| 21 | **60 FPS upgrade** | all files | 🟠 Smoothness | 2hr |
| 22 | **Dynamic camera zoom** on KO/signature/last-stand | `renderer.js` | 🟠 Cinematic | 1hr |
| 23 | **KO sequence** (slowmo, zoom, text effect) | `fight.js`, `renderer.js` | 🟠 Dramatic finish | 1.5hr |
| 24 | **Round start animation** (text slam, impact particles) | `renderer.js`, `fight.js` | 🟢 Polish | 1hr |
| 25 | **Motion trails** on attacks and dashes | `renderer.js` | 🟢 Visual juice | 1hr |
| 26 | **Sprite sheet animation** (generate multi-frame sprites) | `sprites.js`, `renderer.js`, assets | 🟠 Major visual upgrade | 1 day |
| 27 | **Layered hit SFX** with pitch variation | `audio.js` | 🟢 Audio depth | 45min |
| 28 | **Combo announcer** voice lines | `audio.js`, `fight.js`, assets | 🟢 Hype factor | 1hr |
| 29 | **Music reactivity** (filter during slowmo, intensity on combos) | `audio.js` | 🟢 Immersion | 1hr |
| 30 | **Results screen stats breakdown** | `ui.js` | 🟢 Satisfaction | 1.5hr |
| 31 | **Web Gamepad API** fallback for other input devices | `input.js` | 🟢 Compatibility | 1hr |
| 32 | **Background parallax + environmental particles** | `renderer.js` | 🟢 Stage life | 1.5hr |

### Phase 4 — "Ship It" (1-2 days)
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 33 | **Meta glasses viewport optimization** (resolution, aspect ratio, font sizes) | 🔴 Platform fit | 2hr |
| 34 | **Input latency testing** on armband hardware | 🔴 Playability | varies |
| 35 | **Performance profiling** on glasses hardware | 🟠 Smooth 60fps | 1hr |
| 36 | **Touch-up all fighters for balance** after combo system | 🟠 Fair gameplay | 2hr |
| 37 | **Final audio mix** (music vs SFX vs voice levels) | 🟢 Polish | 30min |
| 38 | **README / demo page** for showcase | 🟢 Presentation | 1hr |

---

## Summary

**Total estimated effort:** ~10-14 days of focused work across all phases.

**If you only have 1 day**, do Phase 1 items 1-8. That alone will transform the feel of the game.

**If you have a weekend**, do Phase 1 + Phase 2 items 11-13. That gives you satisfying hits AND real combos.

**The single highest-impact change:** Adding the cancel/combo system (#11) + hit freeze frames (#3) + combo counter (#4). Those three changes together will make the game go from "neat prototype" to "I can't stop playing this."
