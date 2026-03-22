// ============================================================
//  fight.js — v2: Auto-approach, auto-jab, combo attacks,
//  momentum ultimates. Designed for 5-input armband.
// ============================================================

import { Fighter } from './fighter.js';
import { Combat, clamp, makeHitParticles } from './combat.js';
import { AI } from './ai.js';
import { Scoring } from './scoring.js';
import { FIGHTERS } from './data/fighters.js';
import { SpriteAnimationManager } from './sprites.js';

export class Fight {
  constructor({ renderer, input, audio, progression, sprites, p1Id, p2Id, difficulty, dailyMod = null, streakBonus = 0, dailyMode = false, streak = 0, isDaily = false }) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.progression = progression;

    this.p1Def = FIGHTERS[p1Id];
    this.p2Def = FIGHTERS[p2Id];
    this.difficulty = difficulty;
    this.dailyMode = dailyMode || isDaily;
    this.isDaily = isDaily || dailyMode;
    this.streak = streak;
    this.sprites = sprites;

    this.mods = dailyMod?.mod || {};

    this.spriteAnimations = new SpriteAnimationManager();
    this.spriteAnimations.init([p1Id, p2Id]);

    this.arena = {
      leftWall: 20,
      rightWall: 580,
      floorY: 380,
      width: 560,
    };

    this.p1 = new Fighter(this.p1Def, -1);
    this.p2 = new Fighter(this.p2Def, +1);

    // Apply daily mods
    if (this.mods.hpMul) {
      this.p1.maxHp = Math.round(this.p1.maxHp * this.mods.hpMul);
      this.p2.maxHp = Math.round(this.p2.maxHp * this.mods.hpMul);
      this.p1.hp = this.p1.maxHp;
      this.p2.hp = this.p2.maxHp;
    }

    // ── Round state ──
    this.round = { p1: 0, p2: 0 };
    this.timer = 30;
    this.phase = 'intro';
    this.phaseT = 0;
    this.phaseDur = 0.8;

    // ── Systems ──
    this.scoring = new Scoring();
    this.combat = new Combat({ arena: this.arena, renderer, audio, scoring: this.scoring, mods: this.mods });
    this.ai = new AI({ difficulty, fighterId: p2Id, streakBonus });

    // ── Auto-approach ──
    this.autoApproachSpeed = 40; // px/s drift toward each other

    // ── Auto-jab ──
    this.autoJabRange = 80;     // distance at which auto-jabs start
    this.autoJabCooldown = 0.8; // seconds between auto-jabs
    this.p1AutoJabT = 0;
    this.p2AutoJabT = 0;
    this.autoJabDmg = 3;        // chip damage per auto-jab

    // ── Chip timer (punishment for inaction) ──
    this._inactionT = 0;
    this._chipInterval = 2.0;   // seconds without player input before chip

    // ── Tracking ──
    this.events = [];
    this.matchTotals = { strikes: 0, heavies: 0, specials: 0, parries: 0, dashes: 0, ultimates: 0 };
    this._roundStartTime = 0;
    this._t = 0;
    this._cameback = false;
    this._frameActs = [];

    // KO cinematic
    this._koPhase = false;
    this._koT = 0;
    this._koDuration = 1.2;
    this._koWinner = null;

    this._bannerT = 0;
    this._speedMul = this.mods.speedMul || 1;
    this._gravMul = this.mods.gravMul || 1;
  }

  start() {
    this.audio.playMusic('music_' + this.p1.id);
    this.audio.play('sfx_round');
    this.audio.play(this.p1Def.voice.start);
    this.phase = 'intro';
    this.phaseT = 0;
    this._roundStartTime = this._t;
    this._bannerT = 0;
    this.renderer.spriteAnimations = this.spriteAnimations;

    const bgMap = { blaze: 2, volt: 1, shade: 3, granite: 0, marina: 4 };
    if (this.renderer.setArenaBg) this.renderer.setArenaBg(bgMap[this.p1.id] ?? 0);
  }

  _resetRoundPositions() {
    this.p1.x = 180; this.p2.x = 420;
    this.p1.y = this.arena.floorY; this.p2.y = this.arena.floorY;
    this.p1.onGround = true; this.p2.onGround = true;
    this.p1.vx = this.p2.vx = 0;
    this.p1.vy = this.p2.vy = 0;
    this.p1.attack = this.p2.attack = null;
    this.p1.attackF = this.p2.attackF = 0;
    this.p1.hitstunF = this.p2.hitstunF = 0;
    this.p1.blocking = this.p2.blocking = 'none';
    this.p1.hp = this.p1.maxHp;
    this.p2.hp = this.p2.maxHp;
    this.p1.state = 'idle';
    this.p2.state = 'idle';
    this.p1.stateT = this.p2.stateT = 0;
    this.p1.momentum = 0;
    this.p2.momentum = 0;
    this.p1.parryWindowF = this.p2.parryWindowF = 0;
    this.p1.parryCooldownF = this.p2.parryCooldownF = 0;
    this.p1.parryWhiffF = this.p2.parryWhiffF = 0;
    this.p1.parryStunF = this.p2.parryStunF = 0;
    this.p1.parrySuccess = this.p2.parrySuccess = false;
    this.p1.parrySuccessT = this.p2.parrySuccessT = 0;
    this.p1.dashIframesF = this.p2.dashIframesF = 0;
    this.p1AutoJabT = 0;
    this.p2AutoJabT = 0;
    this._inactionT = 0;
    this._koPhase = false;
    this._koWinner = null;
    this.timer = 30;
    this.phase = 'intro';
    this.phaseT = 0;
    this._bannerT = 0;
    this.audio.play('sfx_round');
    this.audio.play(this.p1Def.voice.start);
    this._roundStartTime = this._t;
  }

  // ──────────────────────────────────────────────
  //  MAIN UPDATE
  // ──────────────────────────────────────────────

  update(dt) {
    dt *= this._speedMul;
    this._t += dt;
    this.spriteAnimations.tick(dt * 1000);

    // KO slowmo
    let effectiveDt = dt;
    if (this._koPhase) {
      this._koT += dt;
      effectiveDt = dt * 0.3;
      if (this._koT >= this._koDuration) {
        this._koPhase = false;
        this.renderer.zoomTarget = 1.0;
        this.audio.clearMusicFilter();
      }
    }

    // Last-stand music
    const anyLastStand = (this.p1.hpPct > 0 && this.p1.hpPct < 0.2) || (this.p2.hpPct > 0 && this.p2.hpPct < 0.2);
    if (anyLastStand && this.audio.musicKey !== 'music_laststand') this.audio.playMusic('music_laststand');

    // Phase management
    if (this.phase === 'intro') {
      this.phaseT += effectiveDt;
      this._bannerT += effectiveDt;
      if (this.phaseT >= this.phaseDur) this.phase = 'play';
    }

    if (this.phase === 'between') {
      this.phaseT += effectiveDt;
      this._bannerT += effectiveDt;
      if (this.phaseT >= 2.5) {
        if (this.round.p1 >= 2 || this.round.p2 >= 2) {
          return this._endMatch();
        }
        this._resetRoundPositions();
      }
    }

    // Timer
    if (this.phase === 'play') {
      this.timer -= effectiveDt;
      if (this.timer <= 0) {
        this.timer = 0;
        this._roundByTimeout();
      }
    }

    // ── Update player facing for input.js combo detection ──
    this.input.playerFacing = this.p1.facing;

    // ── PROCESS PLAYER INPUT ──
    const acts = this.input.consume().map(e => e.action);
    this._frameActs = acts;
    const hadPlayerAction = acts.length > 0 && acts.some(a =>
      ['strike','heavy_strike','counter_strike','dive_slam','uppercut','parry','dash_left','dash_right','jump','ultimate'].includes(a)
    );
    this._processPlayerInput(acts);

    // ── INACTION CHIP TIMER ──
    if (this.phase === 'play') {
      if (hadPlayerAction) {
        this._inactionT = 0;
      } else {
        this._inactionT += effectiveDt;
        if (this._inactionT >= this._chipInterval) {
          this._inactionT = 0;
          // Both take chip damage for inaction
          this.p1.hp = Math.max(1, this.p1.hp - 5);
          this.p2.hp = Math.max(1, this.p2.hp - 5);
          this.renderer.doShake(3, 0.1);
        }
      }
    }

    // ── PROCESS AI INPUT ──
    if (this.phase === 'play') {
      const aiActs = this.ai.update(effectiveDt, this.p2, this.p1, {});
      this._processAiInput(aiActs);
    }

    // ── AUTO-APPROACH ──
    if (this.phase === 'play') {
      this._doAutoApproach(effectiveDt);
    }

    // ── AUTO-JAB at close range ──
    if (this.phase === 'play') {
      this._doAutoJab(effectiveDt);
    }

    // ── Update facing ──
    this.p1.setFacingTo(this.p2);
    this.p2.setFacingTo(this.p1);

    // ── Update fighters ──
    this.p1.update(effectiveDt, this.arena, this._gravMul);
    this.p2.update(effectiveDt, this.arena, this._gravMul);

    // ── Push apart (MIN_SEPARATION = 50px) ──
    const MIN_SEP = 50;
    const dx = this.p2.x - this.p1.x;
    const dist = Math.abs(dx);
    if (dist < MIN_SEP) {
      const overlap = MIN_SEP - dist;
      const pushDir = dx >= 0 ? 1 : -1;
      const half = overlap / 2;
      this.p1.x -= pushDir * half;
      this.p2.x += pushDir * half;
      this.p1.x = clamp(this.p1.x, this.arena.leftWall, this.arena.rightWall);
      this.p2.x = clamp(this.p2.x, this.arena.leftWall, this.arena.rightWall);
    }

    // ── Resolve combat ──
    const r1 = this.combat.resolveMelee(this.p1, this.p2, { isPlayer: true });
    const r2 = this.combat.resolveMelee(this.p2, this.p1, { isPlayer: false });
    if (r1) this._onCombatEvent(r1, this.p1, this.p2, true);
    if (r2) this._onCombatEvent(r2, this.p2, this.p1, false);

    this.combat.update(effectiveDt, this.p1, this.p2);
    this.renderer.updateParticles(effectiveDt);

    // KO check
    if (this.phase === 'play') {
      if (this.p1.state === 'ko' || this.p2.state === 'ko') {
        this._ko();
      }
    }

    return null;
  }

  // ──────────────────────────────────────────────
  //  AUTO-APPROACH: fighters drift toward each other
  // ──────────────────────────────────────────────

  _doAutoApproach(dt) {
    const dist = Math.abs(this.p2.x - this.p1.x);
    const minDist = 70; // stop approaching at this distance

    if (dist <= minDist) return;

    // Only approach when idle/not dashing/not attacking
    const p1CanApproach = this.p1.state === 'idle' || this.p1.state === 'walk';
    const p2CanApproach = this.p2.state === 'idle' || this.p2.state === 'walk';

    const dir = this.p2.x > this.p1.x ? 1 : -1;
    const speed = this.autoApproachSpeed * dt;

    if (p1CanApproach && this.p1.hitstunF <= 0 && !this.p1.attack) {
      this.p1.x += dir * speed;
    }
    if (p2CanApproach && this.p2.hitstunF <= 0 && !this.p2.attack) {
      this.p2.x -= dir * speed;
    }

    // Clamp to arena
    this.p1.x = clamp(this.p1.x, this.arena.leftWall, this.arena.rightWall);
    this.p2.x = clamp(this.p2.x, this.arena.leftWall, this.arena.rightWall);
  }

  // ──────────────────────────────────────────────
  //  AUTO-JAB: fighters trade blows at close range
  // ──────────────────────────────────────────────

  _doAutoJab(dt) {
    const dist = Math.abs(this.p2.x - this.p1.x);
    if (dist > this.autoJabRange) return;

    // P1 auto-jab
    this.p1AutoJabT += dt;
    if (this.p1AutoJabT >= this.autoJabCooldown && this.p1.canAct() && this.p1.onGround) {
      this.p1AutoJabT = 0;
      this._doAutoJabHit(this.p1, this.p2, true);
    }

    // P2 auto-jab
    this.p2AutoJabT += dt;
    if (this.p2AutoJabT >= this.autoJabCooldown && this.p2.canAct() && this.p2.onGround) {
      this.p2AutoJabT = 0;
      this._doAutoJabHit(this.p2, this.p1, false);
    }
  }

  _doAutoJabHit(attacker, defender, isPlayer) {
    // Auto-jab: small damage, small visual, builds a little momentum
    const dmg = this.autoJabDmg;
    const res = defender.takeHit({ dmg, type: 'mid', from: attacker, isChip: true });

    if (res.hit && !res.blocked) {
      // Small hit effect
      const hitX = (attacker.x + defender.x) / 2;
      const hitY = defender.y - 60;
      this.renderer.addParticles(makeHitParticles(attacker.color, hitX, hitY, 4));
      this.renderer.doShake(1.5, 0.06);
      this.audio.play('sfx_light', { vol: 0.3, rate: 1.3 });

      // Brief visual hitstun (3 frames) — doesn't interrupt actions
      if (defender.hitstunF < 3) defender.hitstunF = 3;

      // Small momentum gain
      this._momentumGain(attacker, 2);

      // Damage number
      this.combat._spawnDamageNumber(defender.x, defender.y - 80, dmg, false);

      // Brief flash on attacker's sprite (shows the jab happening)
      attacker.state = 'light';
      attacker.stateT = 0;
      // Auto-reset after 0.15s
      setTimeout(() => {
        if (attacker.state === 'light' && !attacker.attack) attacker.state = 'idle';
      }, 150);
    } else if (res.parried) {
      // Parried an auto-jab — stun the auto-jabber
      attacker.parryStunF = 12;
      attacker.hitstunF = 12;
      attacker.state = 'hit';
      this.audio.play('sfx_block', { vol: 0.8, rate: 1.5 });
      this.renderer.doShake(4, 0.1);
      this.renderer.addParryEffect(defender.x, defender.y - 60);
      this._momentumGain(defender, 15);
    }
  }

  // ──────────────────────────────────────────────
  //  PLAYER INPUT — combo-based
  // ──────────────────────────────────────────────

  _processPlayerInput(acts) {
    for (const a of acts) {
      this.p1.pushAction(a);

      // Dash (always works, even between rounds for feel)
      if (a === 'dash_left') {
        if (this.phase === 'play') this._dash(this.p1, -1);
        continue;
      }
      if (a === 'dash_right') {
        if (this.phase === 'play') this._dash(this.p1, 1);
        continue;
      }

      // Jump
      if (a === 'jump') {
        if (this.phase === 'play') this.p1.startJump();
        continue;
      }

      // Parry
      if (a === 'parry') {
        if (this.phase === 'play') this.p1.startParry();
        continue;
      }

      if (this.phase !== 'play') continue;

      // ── COMBO ATTACKS ──

      // Ultimate (fwd+fwd+tap when momentum full)
      if (a === 'ultimate') {
        if (this.p1.momentum >= 100) {
          this._fireUltimate(this.p1, this.p2, true);
        } else {
          // Not enough momentum — do heavy strike instead
          this._doComboAttack(this.p1, 'heavy');
        }
        continue;
      }

      // Quick strike (plain tap)
      if (a === 'strike') {
        this._doComboAttack(this.p1, this.p1.onGround ? 'light' : 'air');
        continue;
      }

      // Heavy strike (forward + tap)
      if (a === 'heavy_strike') {
        this._doComboAttack(this.p1, 'heavy');
        continue;
      }

      // Counter strike (back + tap) — has armor
      if (a === 'counter_strike') {
        this._doComboAttack(this.p1, 'counter');
        continue;
      }

      // Dive slam (up + tap) — overhead
      if (a === 'dive_slam') {
        this._doComboAttack(this.p1, 'overhead');
        continue;
      }

      // Uppercut (down + tap) — anti-air
      if (a === 'uppercut') {
        this._doComboAttack(this.p1, 'uppercut');
        continue;
      }

      // UI
      if (a === 'ui_confirm' || a === 'ui_back') continue;

      // Legacy compat
      if (a === 'light') {
        this._doComboAttack(this.p1, 'light');
        continue;
      }
      if (a === 'heavy') {
        this._doComboAttack(this.p1, 'heavy');
        continue;
      }
    }
  }

  // ──────────────────────────────────────────────
  //  COMBO ATTACK EXECUTION
  // ──────────────────────────────────────────────

  _doComboAttack(f, kind) {
    if (!f.canAct()) return;

    // Counter strike gives brief armor
    if (kind === 'counter') {
      f.dashArmorHits = 1; // absorb one hit
      kind = 'light'; // uses light attack frames but with armor
    }

    // Overhead — small leap forward + attack
    if (kind === 'overhead') {
      if (f.onGround) {
        f.vy = -250;
        f.onGround = false;
      }
      f.vx += f.facing * 150;
      kind = 'air'; // uses air attack
    }

    // Uppercut — pops up if on ground
    if (kind === 'uppercut') {
      if (f.onGround) {
        f.vy = -200;
        f.onGround = false;
      }
      kind = 'heavy'; // uses heavy frames, hits high
    }

    f.startAttack(kind);
  }

  // ──────────────────────────────────────────────
  //  ULTIMATE SYSTEM — earned through momentum
  // ──────────────────────────────────────────────

  _fireUltimate(f, opp, isPlayer) {
    f.momentum = 0;
    this.matchTotals.ultimates++;

    // ── SCREEN EFFECTS ──
    this.renderer.doShake(20, 0.6);
    this.renderer.doFreeze(8);
    this.renderer.doFlash(f.color, 0.4);
    const midX = (f.x + opp.x) / 2;
    const midY = (f.y + opp.y) / 2;
    this.renderer.doZoom(1.2, 0.8, midX, midY);

    this.audio.play('sfx_signature');
    this.audio.play(f.def.voice.special);

    // ── PER-FIGHTER ULTIMATES ──
    const dmg = Math.round(50 * (this.mods.dmgMul || 1));
    const id = f.id;

    if (id === 'blaze') {
      // DRAGON BREATH — beam across the screen
      const oppInFront = (f.facing === 1 && opp.x > f.x) || (f.facing === -1 && opp.x < f.x);
      if (oppInFront) {
        opp.blocking = 'none'; // unblockable
        const res = opp.takeHit({ dmg, type: 'mid', from: f });
        if (res.hit) { opp.hitstunF = 20; opp.vx += f.facing * 500; }
      }
      for (let i = 0; i < 5; i++) {
        this.combat.projectiles.push({
          x: f.x + f.facing * (50 + i * 60), y: f.y - 50 + (Math.random() - 0.5) * 30,
          vx: f.facing * 600, r: 8, dmg: 0, from: f, type: 'mid', high: false,
          color: '#ffcc00', sfx: 'sfx_fire', dead: false
        });
      }
      this.audio.play('sfx_fire');
      this.renderer.addParticles(makeHitParticles('#ffcc00', f.x + f.facing * 80, f.y - 50, 30));
      this.renderer.addParticles(makeHitParticles('#ff4a2f', f.x + f.facing * 120, f.y - 40, 20));
    }

    if (id === 'granite') {
      // METEOR DROP — leap up, crash down
      f.x = opp.x;
      f.y = this.arena.floorY - 100;
      f.vy = 800;
      f.onGround = false;
      opp.blocking = 'none';
      const res = opp.takeHit({ dmg, type: 'overhead', from: f });
      if (res.hit) { opp.hitstunF = 22; opp.vy = 50; }
      this.audio.play('sfx_rock');
      this.renderer.addParticles(makeHitParticles('#9aa2ad', opp.x, opp.y - 40, 30));
      this.renderer.addParticles(makeHitParticles('#e2e6ea', opp.x, opp.y, 20));
    }

    if (id === 'shade') {
      // DIMENSIONAL RIFT — teleport behind, unblockable slash
      opp.blocking = 'none';
      f.x = clamp(opp.x - opp.facing * 50, this.arena.leftWall, this.arena.rightWall);
      f.facing *= -1;
      const res = opp.takeHit({ dmg, type: 'mid', from: f });
      if (res.hit) { opp.hitstunF = 22; opp.vx += f.facing * 400; }
      this.audio.play('sfx_shadow');
      this.renderer.addParticles(makeHitParticles('#7a3cff', opp.x, opp.y - 50, 30));
      this.renderer.addParticles(makeHitParticles('#c9a5ff', (f.x + opp.x) / 2, f.y - 80, 20));
    }

    if (id === 'volt') {
      // GIGAVOLT CANNON — fills the screen with lightning
      const oppInFront = (f.facing === 1 && opp.x > f.x) || (f.facing === -1 && opp.x < f.x);
      if (oppInFront) {
        opp.blocking = 'none';
        const res = opp.takeHit({ dmg, type: 'mid', from: f });
        if (res.hit) { opp.hitstunF = 20; opp.vx += f.facing * 500; }
      }
      for (let i = 0; i < 6; i++) {
        this.combat.projectiles.push({
          x: f.x + f.facing * (40 + i * 50), y: f.y - 55 + (Math.random() - 0.5) * 40,
          vx: f.facing * 700, r: 8, dmg: 0, from: f, type: 'mid', high: false,
          color: '#80e0ff', sfx: 'sfx_lightning', dead: false
        });
      }
      this.audio.play('sfx_lightning');
      this.renderer.addParticles(makeHitParticles('#31d0ff', f.x + f.facing * 80, f.y - 55, 30));
      this.renderer.addParticles(makeHitParticles('#c0f4ff', f.x + f.facing * 140, f.y - 50, 20));
    }

    if (id === 'marina') {
      // TIDAL CRUSH — summons a massive wave that crashes across the screen
      const oppInFront = (f.facing === 1 && opp.x > f.x) || (f.facing === -1 && opp.x < f.x);
      if (oppInFront) {
        opp.blocking = 'none';
        const res = opp.takeHit({ dmg, type: 'mid', from: f });
        if (res.hit) { opp.hitstunF = 20; opp.vx += f.facing * 450; }
      }
      // Hook projectiles (water splashes)
      for (let i = 0; i < 5; i++) {
        this.combat.projectiles.push({
          x: f.x + f.facing * (50 + i * 60), y: f.y - 50 + (Math.random() - 0.5) * 30,
          vx: f.facing * 550, r: 8, dmg: 0, from: f, type: 'mid', high: false,
          color: '#1e90ff', sfx: 'sfx_water', dead: false
        });
      }
      this.audio.play('sfx_whoosh');
      this.renderer.addParticles(makeHitParticles('#1e90ff', f.x + f.facing * 80, f.y - 50, 30));
      this.renderer.addParticles(makeHitParticles('#87ceeb', f.x + f.facing * 120, f.y - 40, 20));
    }

    // Banner
    if (this.renderer.addChargedSpecialBanner) {
      this.renderer.addChargedSpecialBanner(id, 3);
    }

    // Scoring
    if (isPlayer) {
      this.scoring.onHit({ kind: 'ultimate', points: 1500, dmg });
      this.events.push({ type: 'ultimate', fighter: id });
    }
  }

  // ──────────────────────────────────────────────
  //  DASH
  // ──────────────────────────────────────────────

  _dash(f, dir) {
    if (!f.canAct()) return;
    const dashDist = 100;
    f.vx = dir * dashDist * 12;
    f.dashIframesF = 6;
    f.state = 'dash';
    f.stateT = 0;
    this.audio.play('sfx_whoosh', { variations: true });

    // Small visual trail
    this.renderer.addParticles(makeHitParticles(f.color, f.x, f.y - 50, 4));
  }

  // ──────────────────────────────────────────────
  //  AI INPUT
  // ──────────────────────────────────────────────

  _processAiInput(actions) {
    for (const step of actions) {
      const a = step.action;
      if (a === 'parry') { this.p2.startParry(); continue; }
      if (a === 'walk_left')  { this.p2.x -= 200 * (1/60); continue; }
      if (a === 'walk_right') { this.p2.x += 200 * (1/60); continue; }

      if (this.phase !== 'play') continue;

      if (a === 'dash_left')  this._dash(this.p2, -1);
      if (a === 'dash_right') this._dash(this.p2, 1);
      if (a === 'jump')       this.p2.startJump();
      if (a === 'light')      this.p2.startAttack(this.p2.onGround ? 'light' : 'air');
      if (a === 'heavy')      this.p2.startAttack('heavy');
      if (a === 'strike')     this.p2.startAttack('light');
      if (a === 'ultimate')   { if (this.p2.momentum >= 100) this._fireUltimate(this.p2, this.p1, false); }
    }
  }

  // ──────────────────────────────────────────────
  //  MOMENTUM
  // ──────────────────────────────────────────────

  _momentumGain(f, amt) {
    const mul = (f.lastStand ? 1.5 : 1) * (this.mods.momentumMul || 1);
    f.momentum = clamp(f.momentum + Math.round(amt * mul), 0, 100);
  }

  // ──────────────────────────────────────────────
  //  COMBAT EVENTS
  // ──────────────────────────────────────────────

  _onCombatEvent(ev, attacker, defender, isPlayer) {
    if (ev.type === 'parried') {
      this._momentumGain(ev.defender, 20);
      return;
    }

    if (ev.type === 'hit') {
      this._momentumGain(attacker, 10);

      if (isPlayer) {
        if (ev.kind === 'light') this.matchTotals.strikes++;
        if (ev.kind === 'heavy') this.matchTotals.heavies++;
        this.renderer.updateCombo(ev.streak, defender.x, defender.y, attacker.color);
      }
    }

    if (ev.type === 'blocked') {
      // blocked hits still give small momentum
      this._momentumGain(attacker, 2);
    }

    if (ev.type === 'dodged' && ev.perfect) {
      this._momentumGain(defender, 10);
    }
  }

  // ──────────────────────────────────────────────
  //  KO / ROUND END / MATCH END
  // ──────────────────────────────────────────────

  _ko() {
    this.phase = 'between';
    this.phaseT = 0;
    this._bannerT = 0;
    this.audio.play('sfx_ko');

    this._koPhase = true;
    this._koT = 0;
    this.renderer.startKOSequence();
    this.renderer.doShake(16, 0.50);
    this.renderer.doFreeze(8);
    this.renderer.doFlash('#ffffff', 0.2);

    const midX = (this.p1.x + this.p2.x) / 2;
    const midY = (this.p1.y + this.p2.y) / 2;
    this.renderer.doZoom(1.15, 1.0, midX, midY);
    this.audio.setMusicFilter(800);

    const p1Dead = this.p1.hp <= 0;
    const p2Dead = this.p2.hp <= 0;

    if (p2Dead && !p1Dead) {
      this.round.p1++;
      this.scoring.onRoundWin({
        byTimeout: false,
        perfect: this.scoring.roundDamageTaken === 0,
        under20: (this._t - this._roundStartTime) < 20,
      });
      this._koWinner = this.p1;
    } else if (p1Dead && !p2Dead) {
      this.round.p2++;
      this._koWinner = this.p2;
    }

    this.events.push({
      type: 'ko',
      by: p2Dead ? 'player' : 'ai',
    });
  }

  _roundByTimeout() {
    this.phase = 'between';
    this.phaseT = 0;
    this._bannerT = 0;
    const p1Hp = this.p1.hp;
    const p2Hp = this.p2.hp;

    if (p1Hp > p2Hp) {
      this.round.p1++;
      this.scoring.onRoundWin({ byTimeout: true, perfect: false, under20: false });
    } else if (p2Hp > p1Hp) {
      this.round.p2++;
    } else {
      this.round.p1++; // tie goes to player
    }
  }

  _endMatch() {
    const win = this.round.p1 > this.round.p2;

    const mod = { easy: 1, normal: 1.5, hard: 2, nightmare: 3 }[this.difficulty] || 1.5;
    let xp = win ? 200 : 50;
    xp = Math.round(xp * mod);

    const flawless = win && this.scoring.roundDamageTaken === 0;
    const cameback = win && (this.p1.hpPct < 0.2);
    if (cameback) this._cameback = true;
    if (win) this.scoring.onMatchWin({ flawless, comeback: cameback });

    this.progression.addTotals({
      lights: this.matchTotals.strikes,
      heavies: this.matchTotals.heavies,
      specials: this.matchTotals.ultimates,
      sigs: 0,
      blocks: 0,
      perfectDodges: this.matchTotals.dashes,
      timeoutWins: 0,
      grabs: 0,
    });

    const events = this.events.slice();
    events.push({
      type: 'match_end', win, flawless, cameback,
      difficulty: this.difficulty, winHpPct: Math.round(this.p1.hpPct * 100),
    });

    this.progression.awardMatch({
      fighterId: this.p1.id, win, difficulty: this.difficulty,
      xp, score: this.scoring.score, events,
    });

    if (win) this.progression.addWin();
    else this.progression.resetStreak();

    if (this.dailyMode) this.progression.setDailyCompleted();

    if (win) {
      this.audio.play(this.p1Def.voice.win);
      this.audio.playMusic('music_victory', { loop: false });
    } else {
      this.audio.playMusic('music_defeat', { loop: false });
    }

    return {
      type: 'match_end',
      payload: {
        win,
        rounds: { ...this.round },
        score: this.scoring.score,
        xp,
        fighterId: this.p1.id,
        overallBest: this.progression.save.overallBest,
        fighterBest: this.progression.save.fighters[this.p1.id].best,
        playerLevel: this.progression.playerLevel,
        unlocks: this.progression.unlocks(),
        daily: this.progression.save.daily,
        achievements: this.progression.save.achievements,
        difficulty: this.difficulty,
        dailyMode: this.dailyMode,
        streak: this.streak,
        stats: {
          hitsLanded: this.scoring.totalHitsLanded,
          hitsTaken: this.scoring.totalHitsTaken,
          maxStreak: this.scoring.maxStreak,
          damageDealt: this.scoring.roundDamageDealt,
          damageTaken: this.scoring.roundDamageTaken,
          specials: this.matchTotals.ultimates,
          signatures: 0,
        },
      },
    };
  }

  // ──────────────────────────────────────────────
  //  RENDER
  // ──────────────────────────────────────────────

  render() {
    this.renderer.beginScene();

    const c = this.renderer.ctx;
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(this.arena.leftWall, this.arena.floorY + 110, this.arena.width, 4);

    this.renderer.drawTrails();

    // Fighters
    this.renderer.drawFighter(this.p1);
    this.renderer.drawFighter(this.p2);

    // Projectiles
    for (const pr of this.combat.projectiles) {
      c.save();
      c.fillStyle = pr.color;
      c.globalAlpha = 0.9;
      c.shadowColor = pr.color;
      c.shadowBlur = 12;
      c.beginPath();
      c.arc(pr.x, pr.y, 10, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 0.3;
      c.beginPath();
      c.arc(pr.x, pr.y, 16, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    // Effects
    this.renderer.drawHitSparks();
    this.renderer.drawParticles();
    this.renderer.drawParryEffects(1/60);
    if (this.renderer.drawPushBlockEffects) this.renderer.drawPushBlockEffects(1/60);
    this.renderer.drawComboCounter();
    this.renderer.drawDamageNumbers(this.combat.damageNumbers);

    // Momentum glow when at 100%
    if (this.p1.momentum >= 100) {
      this._drawMomentumGlow(this.p1);
    }
    if (this.p2.momentum >= 100) {
      this._drawMomentumGlow(this.p2);
    }

    // Charged special banner
    if (this.renderer.drawChargedSpecialBanner) this.renderer.drawChargedSpecialBanner(1/60);

    // Win streak
    if (this.streak > 0) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.textAlign = 'left';
      c.font = '700 11px Impact, system-ui, sans-serif';
      c.fillStyle = 'rgba(255,215,64,0.65)';
      c.fillText(`🔥 ${this.streak} STREAK`, 16, this.renderer.h - 48);
      c.restore();
    }

    // Banner
    let banner = '';
    if (this.phase === 'intro') banner = 'FIGHT!';
    else if (this.phase === 'between') {
      if (this._koPhase) {
        banner = 'K.O.';
      } else {
        banner = 'ROUND END';
      }
      if (this._bannerT > 0.8 && this._koWinner) {
        const p1Won = this._koWinner === this.p1;
        if (this.round.p1 >= 2 || this.round.p2 >= 2) {
          banner = p1Won ? 'YOU WIN!' : 'DEFEATED';
        } else {
          banner = p1Won ? 'ROUND WON' : 'ROUND LOST';
        }
      }
    }

    this.renderer.drawHud({
      p1: { name: this.p1.name, hpPct: this.p1.hpPct, momentum: this.p1.momentum, color: this.p1.color },
      p2: { name: this.p2.name, hpPct: this.p2.hpPct, momentum: this.p2.momentum, color: this.p2.color },
      rounds: this.round,
      timer: this.timer,
      matchScore: this.scoring.score,
      banner,
      bannerT: this._bannerT,
      guardBreakWarning: false,
      winStreak: {
        current: this.progression.winStreak,
        title: this.progression.streakTitle(),
        multiplier: this.progression.streakMultiplier(),
      },
      dailyMod: this.isDaily ? (this.progression.dailyChallenge()?.name || '') : null,
    });

    this.renderer.endScene();
    this.renderer.drawDebug(this.p1);
  }

  // ── Momentum glow effect ──
  _drawMomentumGlow(f) {
    const c = this.renderer.ctx;
    c.save();
    const pulse = 0.5 + 0.5 * Math.sin(this._t * 6);
    c.globalAlpha = 0.15 + pulse * 0.15;
    c.shadowColor = f.color;
    c.shadowBlur = 30 + pulse * 20;
    c.fillStyle = f.color;
    c.beginPath();
    c.arc(f.x, f.y - 50, 40, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}
