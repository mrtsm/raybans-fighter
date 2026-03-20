// ============================================================
//  fight.js — Clean fight controller
//  Processes input, updates fighters, resolves combat.
//  Simple: click = attack, arrows = move, that's it.
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

    // Sprite animation system
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

    // ── Apply daily mods ──
    if (this.mods.hpMul) {
      this.p1.maxHp = Math.round(this.p1.maxHp * this.mods.hpMul);
      this.p2.maxHp = Math.round(this.p2.maxHp * this.mods.hpMul);
      this.p1.hp = this.p1.maxHp;
      this.p2.hp = this.p2.maxHp;
    }
    if (this.mods.noBlock) {
      this.p1._blockDisabled = true;
      this.p2._blockDisabled = true;
    }
    if (this.mods.scaleMul) {
      this.p1._renderScale = this.mods.scaleMul;
      this.p2._renderScale = this.mods.scaleMul;
    }
    if (this.mods.gravMul) {
      this.p1.gravMul = this.mods.gravMul;
      this.p2.gravMul = this.mods.gravMul;
    }
    if (this.mods.heavyDmg) {
      for (const f of [this.p1, this.p2]) {
        if (f.def.moves.heavy) {
          f.def = { ...f.def, moves: { ...f.def.moves, heavy: { ...f.def.moves.heavy, dmg: this.mods.heavyDmg } } };
        }
      }
    }
    if (this.mods.heavyRecoveryAdd) {
      for (const f of [this.p1, this.p2]) {
        if (f.def.moves.heavy) {
          const m = f.def.moves.heavy;
          f.def = { ...f.def, moves: { ...f.def.moves, heavy: { ...m, recovery: m.recovery + this.mods.heavyRecoveryAdd } } };
        }
      }
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

    // ── Tracking ──
    this.events = [];
    this.matchTotals = { lights: 0, heavies: 0, grabs: 0, specials: 0, sigs: 0, perfectDodges: 0, blocks: 0, timeoutWins: 0, whiffPunishes: 0, antiAirHeavies: 0 };
    this.lastMove = { wasJumpToLow: false, lastWasJumpAtk: false };

    this._roundStartTime = 0;
    this._t = 0;
    this._cameback = false;
    this._aiBlockTimer = 0;
    this._frameActs = [];

    // KO cinematic
    this._koPhase = false;
    this._koT = 0;
    this._koDuration = 1.2;
    this._koWinner = null;

    // Announcer
    this._lastAnnouncedCombo = 0;

    // Banner
    this._bannerT = 0;

    // Guard break display
    this._guardBreakDisplayT = 0;

    // Speed/gravity multipliers
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

    const bgMap = { blaze: 2, volt: 1, shade: 3, granite: 0 };
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
    this.p1.crouching = this.p2.crouching = false;
    this.p1.comboRoute = [];
    this.p2.comboRoute = [];
    this.p1.consecutiveBlocks = 0;
    this.p2.consecutiveBlocks = 0;
    this.p1.guardBroken = false;
    this.p2.guardBroken = false;
    // Reset HP, state, and momentum for new round
    this.p1.hp = this.p1.maxHp;
    this.p2.hp = this.p2.maxHp;
    this.p1.state = 'idle';
    this.p2.state = 'idle';
    this.p1.stateT = this.p2.stateT = 0;
    this.p1.momentum = 0;
    this.p2.momentum = 0;
    this.p1.charging = false;
    this.p2.charging = false;
    this.p1.chargeT = this.p2.chargeT = 0;
    this.p1.chargePct = this.p2.chargePct = 0;
    this.p1.chargeTier = this.p2.chargeTier = 0;
    this.p1._autoFire = this.p2._autoFire = false;
    // Reset parry/push block state
    this.p1.parryWindowF = this.p2.parryWindowF = 0;
    this.p1.parryCooldownF = this.p2.parryCooldownF = 0;
    this.p1.parryWhiffF = this.p2.parryWhiffF = 0;
    this.p1.parryStunF = this.p2.parryStunF = 0;
    this.p1.parrySuccess = this.p2.parrySuccess = false;
    this.p1.parrySuccessT = this.p2.parrySuccessT = 0;
    this.p1.pushBlockIframesF = this.p2.pushBlockIframesF = 0;
    this.p1.pushBlockCooldownF = this.p2.pushBlockCooldownF = 0;
    this.p1._parryBlockFallbackT = this.p2._parryBlockFallbackT = 0;
    this._koPhase = false;
    this._koWinner = null;
    this.timer = 30;
    this.phase = 'intro';
    this.phaseT = 0;
    this._bannerT = 0;
    this.audio.play('sfx_round');
    this.audio.play(this.p1Def.voice.start);
    this._roundStartTime = this._t;
    this.lastMove = { wasJumpToLow: false, lastWasJumpAtk: false };
  }

  // ──────────────────────────────────────────────
  //  MAIN UPDATE — called every frame by engine.js
  // ──────────────────────────────────────────────

  update(dt) {
    dt *= this._speedMul;
    this._t += dt;
    this.spriteAnimations.tick(dt * 1000);

    // Slowmo during KO
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

    // Daily quake
    if (this.mods.quake) {
      if (Math.floor(this._t) % 7 === 0 && (this._t % 7) < dt) {
        this.renderer.doShake(10, 0.25);
        this.p1.hitstunF = Math.max(this.p1.hitstunF || 0, 4);
        this.p2.hitstunF = Math.max(this.p2.hitstunF || 0, 4);
      }
    }

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

    if (this._guardBreakDisplayT > 0) this._guardBreakDisplayT -= dt;

    // Timer
    if (this.phase === 'play') {
      this.timer -= effectiveDt;
      if (this.timer <= 0) {
        this.timer = 0;
        this._roundByTimeout();
      }
    }

    // ── PROCESS PLAYER INPUT ──
    // Track recent hitstun for push block buffer (10 frames after hitstun ends)
    if (this.p1.hitstunF > 0) {
      this.p1._recentHitstunF = 10;
    } else if (this.p1._recentHitstunF > 0) {
      this.p1._recentHitstunF--;
    }
    const acts = this.input.consume().map(e => e.action);
    this._frameActs = acts;
    this._processPlayerInput(acts);

    // ── PROCESS AI INPUT ──
    if (this.phase === 'play') {
      const aiActs = this.ai.update(effectiveDt, this.p2, this.p1, {
        aiCanSpecial: this.mods.freeSpecials || this.p2.momentum >= 30,
      });
      this._processAiInput(aiActs);
    }

    // ── Grab break ──
    this._resolveGrabBreak();

    // ── Update facing ──
    this.p1.setFacingTo(this.p2);
    this.p2.setFacingTo(this.p1);

    // ── Update fighters ──
    this.p1.update(effectiveDt, this.arena, this._gravMul);
    this.p2.update(effectiveDt, this.arena, this._gravMul);

    // ── Auto-fire charged specials at max charge ──
    if (this.p1._autoFire) {
      this.p1._autoFire = false;
      this._releaseChargedSpecial(this.p1, this.p2, true);
    }
    if (this.p2._autoFire) {
      this.p2._autoFire = false;
      this._releaseChargedSpecial(this.p2, this.p1, false);
    }

    // ── Charge VFX particles ──
    this._updateChargeParticles(this.p1);
    this._updateChargeParticles(this.p2);

    // ── Push apart (MIN_SEPARATION = 60px) ──
    const MIN_SEPARATION = 60;
    const dx = this.p2.x - this.p1.x;
    const dist = Math.abs(dx);
    if (dist < MIN_SEPARATION) {
      const overlap = MIN_SEPARATION - dist;
      const pushDir = dx >= 0 ? 1 : -1;
      const half = overlap / 2;
      this.p1.x -= pushDir * half;
      this.p2.x += pushDir * half;
      this.p1.x = Math.max(this.arena.leftWall, Math.min(this.arena.rightWall, this.p1.x));
      this.p2.x = Math.max(this.arena.leftWall, Math.min(this.arena.rightWall, this.p2.x));
    }

    // ── Resolve combat ──
    const r1 = this.combat.resolveMelee(this.p1, this.p2, { isPlayer: true, lastMove: this.lastMove });
    const r2 = this.combat.resolveMelee(this.p2, this.p1, { isPlayer: false });
    if (r1) this._onCombatEvent(r1, this.p1, this.p2, true);
    if (r2) this._onCombatEvent(r2, this.p2, this.p1, false);

    // AI auto-release block
    if (this._aiBlockTimer > 0) {
      this._aiBlockTimer -= effectiveDt;
      if (this._aiBlockTimer <= 0) this.p2.stopBlock();
    }

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

  // ──────────────────────────────────────────
  //  PLAYER INPUT — dead simple mapping
  // ──────────────────────────────────────────

  _processPlayerInput(acts) {
    for (const a of acts) {
      this.p1.pushAction(a);

      // Movement (continuous, works during all phases for responsiveness)
      if (a === 'walk_left_hold') {
        if (this.phase === 'play') this.p1.walk(-1);
        continue;
      }
      if (a === 'walk_right_hold') {
        if (this.phase === 'play') this.p1.walk(1);
        continue;
      }

      // Block / Parry (down hold)
      if (a === 'down_hold') {
        if (this.mods.noBlock) continue;
        // Try parry first (only during play phase)
        if (this.phase === 'play' && this.p1.startParry()) {
          // Parry started — don't block
          continue;
        }
        // Fallback to block if parry on cooldown or can't parry
        this.p1.startBlock('stand');
        continue;
      }
      if (a === 'down_release') {
        this.p1.stopBlock();
        continue;
      }

      // Everything below requires play phase
      if (this.phase !== 'play') continue;

      // Jump
      if (a === 'jump') {
        this.p1.startJump();
      }

      // Left click → RELEASE CHARGE if charging, otherwise light attack
      if (a === 'light') {
        if (this.p1.charging) {
          this._releaseChargedSpecial(this.p1, this.p2, true);
          continue;
        }
        if (!this.p1.onGround) {
          this.p1.startAttack('air');
          this.lastMove.lastWasJumpAtk = true;
        } else {
          this.p1.startAttack('light');
          this.lastMove.lastWasJumpAtk = false;
        }
      }

      // Heavy (keyboard only — KeyX)
      if (a === 'heavy') {
        this.p1.startAttack('heavy');
        this.lastMove.lastWasJumpAtk = false;
      }

      // Right click → context-sensitive: push block if pressured, START CHARGE if idle
      if (a === 'special') {
        // Check if in hitstun or blocking — push block!
        const recentHitstun = this.p1.hitstunF > 0 || this.p1.state === 'hit';
        const isBlocking = this.p1.blocking !== 'none' || this.p1.state === 'block';
        const justExitedHitstun = this.p1._recentHitstunF > 0; // buffer window

        if (recentHitstun || isBlocking || justExitedHitstun) {
          // Push block attempt
          if (this.p1.startPushBlock()) {
            const pushDir = this.p1.facing;
            this.p2.vx += pushDir * 500;
            this.p2.x += pushDir * 80;
            this.p2.x = Math.max(this.arena.leftWall, Math.min(this.arena.rightWall, this.p2.x));
            this.audio.play('sfx_block', { vol: 1.0, rate: 0.7 });
            this.renderer.doShake(6, 0.15);
            this.renderer.doFreeze(2);
            this.renderer.addPushBlockEffect(this.p1.x, this.p1.y - 50, pushDir);
          }
        } else if (!this.p1.charging) {
          // Start charging special
          if (this.p1.startCharge()) {
            this.audio.play('sfx_charge');
          }
        }
      }


      // UI
      if (a === 'ui_confirm') { /* handled by engine/ui */ }
      if (a === 'ui_back') { /* handled by engine/ui */ }
    }
  }

  // ──────────────────────────────────────────
  //  AI INPUT
  // ──────────────────────────────────────────

  _processAiInput(actions) {
    for (const step of actions) {
      const a = step.action;

      if (a === 'down_hold') {
        if (this.mods.noBlock) continue;
        this.p2.startBlock('stand');
        this._aiBlockTimer = 0.3;
        continue;
      }
      if (a === 'parry') {
        this.p2.startParry();
        continue;
      }
      if (a === 'push_block') {
        if (this.p2.startPushBlock()) {
          const pushDir = this.p2.facing;
          this.p1.vx += pushDir * 500;
          this.p1.x += pushDir * 80;
          this.p1.x = Math.max(this.arena.leftWall, Math.min(this.arena.rightWall, this.p1.x));
          this.audio.play('sfx_block', { vol: 1.0, rate: 0.7 });
          this.renderer.doShake(6, 0.15);
          this.renderer.addPushBlockEffect(this.p2.x, this.p2.y - 50, pushDir);
        }
        continue;
      }
      if (a === 'walk_left')  { this.p2.walk(-1); continue; }
      if (a === 'walk_right') { this.p2.walk(1); continue; }

      if (this.phase !== 'play') continue;

      if (a === 'dash_left')  this._dash(this.p2, -1);
      if (a === 'dash_right') this._dash(this.p2, 1);
      if (a === 'jump')       this.p2.startJump();
      if (a === 'crouch')     this.p2.startCrouch();
      if (a === 'light')      this.p2.startAttack(this.p2.onGround ? (this.p2.crouching ? 'low' : 'light') : 'air');
      if (a === 'low')        this.p2.startAttack('low');
      if (a === 'heavy')      this.p2.startAttack('heavy');
      if (a === 'grab')       this.p2.startAttack('grab');
      if (a === 'special')    this._trySpecialOrSig(this.p2, this.p1, false, 0.6);
      if (a === 'start_charge') this.p2.startCharge();
      if (a === 'release_charge') this._releaseChargedSpecial(this.p2, this.p1, false);
    }
  }

  // ──────────────────────────────────────────
  //  HELPERS
  // ──────────────────────────────────────────

  _dash(f, dir) {
    const towardWall = (dir < 0 && f.x <= this.arena.leftWall + 1) || (dir > 0 && f.x >= this.arena.rightWall - 1);
    if (towardWall) return;
    f.startDash(dir, 6 + (f.lastStand ? 3 : 0));
    this.audio.play('sfx_whoosh', { variations: true });
  }

  _trySpecialOrSig(f, opp, isPlayer, held) {
    const rank = this.progression.masteryRank(f.id);
    const freeSpecials = this.mods.freeSpecials;

    // Signature (hold 1s + 100 momentum)
    const canSig = (freeSpecials || f.momentum >= 100) && held >= 1.0;
    if (canSig) {
      if (!freeSpecials) f.momentum = 0;
      f.stats.sigs++;
      this.combat.signature(f, opp);
      if (isPlayer) {
        this.matchTotals.sigs++;
        this.scoring.onHit({ kind: 'signature', points: 1000, dmg: 25 });
        this.events.push({ type: 'signature_landed' });
      }
      this.renderer.doFlash(f.color, 0.35);
      this.renderer.doZoom(1.12, 0.5, (f.x + opp.x) / 2, (f.y + opp.y) / 2);
      return;
    }

    // Special (30 momentum)
    if (!freeSpecials && f.momentum < 30) return;
    if (!freeSpecials) f.momentum -= 30;
    f.stats.specials++;
    this.combat.fireSpecial(f, opp, rank);
    if (isPlayer) {
      this.matchTotals.specials++;
      this.events.push({ type: 'momentum', value: f.momentum });
      this.audio.play(f.def.voice.special);
    }
  }

  // ──────────────────────────────────────────
  //  CHARGED SPECIAL SYSTEM
  // ──────────────────────────────────────────

  _releaseChargedSpecial(f, opp, isPlayer) {
    const { tier, time } = f.releaseCharge();
    if (tier <= 0) return;

    // Damage scales with tier
    const dmgTable = { 1: 15, 2: 30, 3: 50 };
    const baseDmg = dmgTable[tier] || 15;
    const dmg = Math.round(baseDmg * (this.mods.dmgMul || 1));

    // Fire the per-fighter charged special
    this._fireChargedSpecial(f, opp, tier, dmg, isPlayer);

    // Tracking
    if (isPlayer) {
      this.matchTotals.specials++;
      f.stats.specials++;
      this.events.push({ type: 'charged_special', tier, fighter: f.id });
    }
  }

  _fireChargedSpecial(f, opp, tier, dmg, isPlayer) {
    const id = f.id;

    // ── SCREEN EFFECTS (scale with tier) ──
    const shakeIntensity = [0, 6, 12, 20][tier];
    const shakeDur = [0, 0.2, 0.35, 0.6][tier];
    const freezeFrames = [0, 3, 5, 8][tier];
    this.renderer.doShake(shakeIntensity, shakeDur);
    this.renderer.doFreeze(freezeFrames);

    if (tier >= 2) {
      this.renderer.doFlash(f.color, tier === 3 ? 0.4 : 0.2);
    }
    if (tier === 3) {
      // Epic zoom for tier 3
      const midX = (f.x + opp.x) / 2;
      const midY = (f.y + opp.y) / 2;
      this.renderer.doZoom(1.2, 0.8, midX, midY);
    }

    // Audio
    this.audio.play(tier === 3 ? 'sfx_signature' : tier === 2 ? 'sfx_heavy' : 'sfx_light', { vol: 0.7 + tier * 0.1 });

    // ── PER-FIGHTER SPECIALS ──
    if (id === 'blaze') {
      // INFERNO BLAST: T1=fire wave, T2=flamethrower, T3=DRAGON BREATH
      if (tier === 1) {
        // Fire wave projectile
        this.combat.projectiles.push({
          x: f.x + f.facing * 40, y: f.y - 50,
          vx: f.facing * 380, r: 12, dmg,
          from: f, type: 'mid', high: false,
          color: '#ff6a2f', sfx: 'sfx_fire'
        });
        this.audio.play('sfx_fire');
      } else if (tier === 2) {
        // Flamethrower cone — 3 projectiles spread
        for (let i = -1; i <= 1; i++) {
          this.combat.projectiles.push({
            x: f.x + f.facing * 40, y: f.y - 50 + i * 25,
            vx: f.facing * 350, r: 10, dmg: Math.round(dmg * 0.5),
            from: f, type: 'mid', high: i < 0,
            color: i === 0 ? '#ffaa00' : '#ff4a2f', sfx: 'sfx_fire'
          });
        }
        this.audio.play('sfx_fire');
        // Fire particles
        this.renderer.addParticles(makeHitParticles('#ff6a2f', f.x + f.facing * 60, f.y - 50, 20));
      } else {
        // DRAGON BREATH — massive beam across the screen
        // Direct hit on opponent if in front
        const oppInFront = (f.facing === 1 && opp.x > f.x) || (f.facing === -1 && opp.x < f.x);
        if (oppInFront) {
          const res = opp.takeHit({ dmg, type: 'mid', from: f });
          if (res.hit) {
            opp.hitstunF = 20;
            opp.vx += f.facing * 500;
          }
        }
        // Beam projectiles for visual
        for (let i = 0; i < 5; i++) {
          this.combat.projectiles.push({
            x: f.x + f.facing * (50 + i * 60), y: f.y - 50 + (Math.random() - 0.5) * 30,
            vx: f.facing * 600, r: 8, dmg: 0, // visual only, already applied direct hit
            from: f, type: 'mid', high: false,
            color: '#ffcc00', sfx: 'sfx_fire', dead: false
          });
        }
        this.audio.play('sfx_fire');
        this.renderer.addParticles(makeHitParticles('#ffcc00', f.x + f.facing * 80, f.y - 50, 30));
        this.renderer.addParticles(makeHitParticles('#ff4a2f', f.x + f.facing * 120, f.y - 40, 20));
        // Tier 3 banner
        this.renderer.addChargedSpecialBanner(f.id, tier);
      }
    }

    if (id === 'granite') {
      // METEOR FIST: T1=boulder throw, T2=ground slam, T3=METEOR DROP
      if (tier === 1) {
        // Boulder projectile
        this.combat.projectiles.push({
          x: f.x + f.facing * 40, y: f.y - 60,
          vx: f.facing * 300, r: 14, dmg,
          from: f, type: 'mid', high: false,
          color: '#9aa2ad', sfx: 'sfx_rock'
        });
        this.audio.play('sfx_rock');
      } else if (tier === 2) {
        // Ground slam shockwave — hits if opponent is on the ground
        if (opp.onGround) {
          const res = opp.takeHit({ dmg, type: 'low', from: f });
          if (res.hit) {
            opp.vy = -200; // pop up
            opp.onGround = false;
            opp.hitstunF = 14;
          }
        }
        this.audio.play('sfx_rock');
        // Shockwave particles along ground
        for (let i = 0; i < 15; i++) {
          const px = f.x + f.facing * (20 + i * 30);
          this.renderer.addParticles(makeHitParticles('#9aa2ad', px, this.arena.floorY + 100, 3));
        }
        this.renderer.addParticles(makeHitParticles('#e2e6ea', f.x, f.y, 16));
      } else {
        // METEOR DROP — leap up, crash down on enemy
        // Teleport above opponent and slam
        f.x = opp.x;
        f.y = this.arena.floorY - 100;
        f.vy = 800; // slam down fast
        f.onGround = false;
        // Direct hit
        const res = opp.takeHit({ dmg, type: 'overhead', from: f });
        if (res.hit) {
          opp.hitstunF = 22;
          opp.vy = 50; // ground bounce
        }
        this.audio.play('sfx_rock');
        this.renderer.addParticles(makeHitParticles('#9aa2ad', opp.x, opp.y - 40, 30));
        this.renderer.addParticles(makeHitParticles('#e2e6ea', opp.x, opp.y, 20));
        this.renderer.addChargedSpecialBanner(f.id, tier);
      }
    }

    if (id === 'shade') {
      // VOID STRIKE: T1=shadow clone dash, T2=teleport behind + slash, T3=DIMENSIONAL RIFT
      if (tier === 1) {
        // Shadow clone dash — dash forward dealing damage
        const dashDist = 120;
        const oldX = f.x;
        f.x = clamp(f.x + f.facing * dashDist, this.arena.leftWall, this.arena.rightWall);
        const dist = Math.abs(f.x - opp.x);
        if (dist < 60) {
          opp.takeHit({ dmg, type: 'mid', from: f });
          opp.hitstunF = 8;
          this.renderer.addParticles(makeHitParticles('#7a3cff', opp.x, opp.y - 50, 10));
        }
        this.audio.play('sfx_shadow');
        // Trail from old position
        this.renderer.addParticles(makeHitParticles('#c9a5ff', oldX, f.y - 50, 8));
      } else if (tier === 2) {
        // Teleport behind + slash
        f.x = clamp(opp.x - opp.facing * 60, this.arena.leftWall, this.arena.rightWall);
        f.facing *= -1;
        const res = opp.takeHit({ dmg, type: 'mid', from: f });
        if (res.hit) {
          opp.hitstunF = 14;
          opp.vx += f.facing * 300;
        }
        this.audio.play('sfx_shadow');
        this.renderer.addParticles(makeHitParticles('#7a3cff', opp.x, opp.y - 50, 16));
        this.renderer.addParticles(makeHitParticles('#c9a5ff', f.x, f.y - 50, 12));
      } else {
        // DIMENSIONAL RIFT — opens portal, slashes through, unblockable
        opp.blocking = 'none'; // unblockable
        // Teleport behind
        f.x = clamp(opp.x - opp.facing * 50, this.arena.leftWall, this.arena.rightWall);
        f.facing *= -1;
        const res = opp.takeHit({ dmg, type: 'mid', from: f });
        if (res.hit) {
          opp.hitstunF = 22;
          opp.vx += f.facing * 400;
        }
        this.audio.play('sfx_shadow');
        this.audio.play('sfx_signature');
        // Massive void particles
        this.renderer.addParticles(makeHitParticles('#7a3cff', opp.x, opp.y - 50, 30));
        this.renderer.addParticles(makeHitParticles('#c9a5ff', (f.x + opp.x) / 2, f.y - 80, 20));
        this.renderer.addParticles(makeHitParticles('#3a0a6e', opp.x, opp.y, 15));
        this.renderer.addChargedSpecialBanner(f.id, tier);
      }
    }

    if (id === 'volt') {
      // GIGAVOLT CANNON: T1=lightning bolt, T2=thunder beam, T3=GIGAVOLT fills screen
      if (tier === 1) {
        // Lightning bolt projectile
        this.combat.projectiles.push({
          x: f.x + f.facing * 40, y: f.y - 55,
          vx: f.facing * 550, r: 10, dmg,
          from: f, type: 'high', high: true,
          color: '#31d0ff', sfx: 'sfx_lightning'
        });
        this.audio.play('sfx_lightning');
      } else if (tier === 2) {
        // Thunder beam — 2 bolts
        for (let i = -1; i <= 1; i += 2) {
          this.combat.projectiles.push({
            x: f.x + f.facing * 40, y: f.y - 55 + i * 20,
            vx: f.facing * 480, r: 10, dmg: Math.round(dmg * 0.6),
            from: f, type: 'mid', high: i < 0,
            color: '#31d0ff', sfx: 'sfx_lightning'
          });
        }
        this.audio.play('sfx_lightning');
        this.renderer.addParticles(makeHitParticles('#31d0ff', f.x + f.facing * 60, f.y - 55, 16));
      } else {
        // GIGAVOLT — massive beam that fills the screen
        const oppInFront = (f.facing === 1 && opp.x > f.x) || (f.facing === -1 && opp.x < f.x);
        if (oppInFront) {
          opp.blocking = 'none'; // unblockable
          const res = opp.takeHit({ dmg, type: 'mid', from: f });
          if (res.hit) {
            opp.hitstunF = 20;
            opp.vx += f.facing * 500;
          }
        }
        // Visual beam projectiles
        for (let i = 0; i < 6; i++) {
          this.combat.projectiles.push({
            x: f.x + f.facing * (40 + i * 50), y: f.y - 55 + (Math.random() - 0.5) * 40,
            vx: f.facing * 700, r: 8, dmg: 0,
            from: f, type: 'mid', high: false,
            color: '#80e0ff', sfx: 'sfx_lightning', dead: false
          });
        }
        this.audio.play('sfx_lightning');
        this.renderer.addParticles(makeHitParticles('#31d0ff', f.x + f.facing * 80, f.y - 55, 30));
        this.renderer.addParticles(makeHitParticles('#c0f4ff', f.x + f.facing * 140, f.y - 50, 20));
        this.renderer.addChargedSpecialBanner(f.id, tier);
      }
    }

    // Scoring for player
    if (isPlayer) {
      const pts = tier === 3 ? 1000 : tier === 2 ? 500 : 200;
      this.scoring.onHit({ kind: 'charged_special', points: pts, dmg: dmg });
    }
  }

  _updateChargeParticles(f) {
    if (!f.charging) return;
    // Spawn particles based on charge tier
    const interval = f.chargeTier >= 3 ? 0.03 : f.chargeTier >= 2 ? 0.06 : 0.1;
    if (f._chargeParticleT >= interval) {
      f._chargeParticleT = 0;
      const count = f.chargeTier >= 3 ? 5 : f.chargeTier >= 2 ? 3 : 1;
      const color = f.color;
      const glow = f.glow;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 40;
        const px = f.x + Math.cos(angle) * dist;
        const py = (f.y - 50) + Math.sin(angle) * dist;
        this.renderer.addParticles([{
          x: px, y: py,
          vx: (f.x - px) * 3, // particles converge toward fighter
          vy: ((f.y - 50) - py) * 3,
          g: 0,
          s: 2 + f.chargeTier,
          t0: 0.3,
          t: 0.3,
          color: Math.random() > 0.5 ? color : glow,
        }]);
      }
    }
  }

  _momentumGain(f, amt) {
    const mul = (f.lastStand ? 1.5 : 1) * (this.mods.momentumMul || 1);
    f.momentum = clamp(f.momentum + Math.round(amt * mul), 0, 100);
    if (f.momentum >= 100) this.events.push({ type: 'momentum', value: 100 });
  }

  _momentumDrain(f, amt) {
    f.momentum = clamp(f.momentum - amt, 0, 100);
  }

  _onCombatEvent(ev, attacker, defender, isPlayer) {
    if (ev.type === 'parried') {
      // Defender parried the attacker
      this._momentumGain(ev.defender, 20); // reward for parrying
      this._momentumDrain(ev.attacker, 10);
      return;
    }

    if (ev.type === 'hit') {
      this._momentumGain(attacker, 8);
      if (ev.whiffPunish) {
        attacker.stats.whiffPunishes++;
        this._momentumGain(attacker, 12);
      }
      if (ev.antiAirHeavy) attacker.stats.antiAirHeavies++;
      this._momentumDrain(defender, 10);
      defender.consecutiveBlocks = 0;

      if (isPlayer) {
        this.events.push({ type: 'streak', value: ev.streak });
        if (ev.kind === 'light') this.matchTotals.lights++;
        if (ev.kind === 'heavy') this.matchTotals.heavies++;
        if (ev.kind === 'grab') this.matchTotals.grabs++;
        if (ev.whiffPunish) this.matchTotals.whiffPunishes++;
        if (ev.antiAirHeavy) this.matchTotals.antiAirHeavies++;
        this.renderer.updateCombo(ev.streak, defender.x, defender.y, attacker.color);

        if (ev.streak >= 7 && this._lastAnnouncedCombo < 7) {
          this.audio.play('sfx_combo7', { vol: 0.9, rate: 1.3 });
          this._lastAnnouncedCombo = 7;
        } else if (ev.streak >= 5 && this._lastAnnouncedCombo < 5) {
          this.audio.play('sfx_combo5', { vol: 0.8, rate: 1.15 });
          this._lastAnnouncedCombo = 5;
        } else if (ev.streak >= 3 && this._lastAnnouncedCombo < 3) {
          this.audio.play('sfx_combo3', { vol: 0.7 });
          this._lastAnnouncedCombo = 3;
        }
      } else {
        this.scoring.onGotHit(ev.dmg || 0);
        this._lastAnnouncedCombo = 0;
      }
    }

    if (ev.type === 'blocked') {
      this._momentumDrain(defender, 2);
      this._momentumDrain(attacker, 1);
      if (defender === this.p1) this.matchTotals.blocks++;
    }

    if (ev.type === 'guard_break') {
      this._guardBreakDisplayT = 0.8;
      this.audio.play('sfx_guardbreak');
    }

    if (ev.type === 'dodged' && ev.perfect) {
      this._momentumGain(defender, 10);
      if (defender === this.p1) this.matchTotals.perfectDodges++;
    }

    if (ev.type === 'grabbed') {
      defender._grabbed = { by: attacker, f: 4, dmg: ev.dmg, throwPx: ev.throwPx, toCorner: ev.toCorner };
    }
  }

  _resolveGrabBreak() {
    const g = this.p1._grabbed;
    if (!g) return;
    const pressedLight = (this._frameActs || []).includes('light');
    if (pressedLight) {
      this.p1._grabbed = null;
      this.audio.play('sfx_block');
      return;
    }
    g.f--;
    if (g.f <= 0) {
      this.p1._grabbed = null;
      const dmg = Math.round(g.dmg * (this.mods.dmgMul || 1));
      this.p1.takeHit({ dmg, type: 'mid', from: g.by });
      this.p1.vx += g.by.facing * 300;
      this.audio.play('sfx_grab');
      this.renderer.addParticles(makeHitParticles(g.by.color, this.p1.x, this.p1.y - 70, 12));
      this.renderer.doShake(6, 0.20);
      this.renderer.doFreeze(3);
      this.scoring.onGotHit(dmg);
    }
  }

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
      opponentCornered: (this.p2.x <= this.arena.leftWall + 1 || this.p2.x >= this.arena.rightWall - 1),
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
      this.scoring.onRoundWin({
        byTimeout: true,
        perfect: this.scoring.roundDamageTaken === 0,
        under20: (this._t - this._roundStartTime) < 20,
      });
      this.scoring.timeoutWin = true;
      this.matchTotals.timeoutWins++;
    } else if (p2Hp > p1Hp) {
      this.round.p2++;
    } else {
      if (this.scoring.roundDamageDealt >= this.scoring.roundDamageTaken) this.round.p1++;
      else this.round.p2++;
    }
  }

  _endMatch() {
    const win = this.round.p1 > this.round.p2;

    const mod = { easy: 1, normal: 1.5, hard: 2, nightmare: 3 }[this.difficulty] || 1.5;
    let xp = win ? 200 : 50;
    xp = Math.round(xp * mod);
    if (this.scoring.roundDamageTaken === 0 && win) xp += 100;

    const flawless = win && this.scoring.roundDamageTaken === 0;
    const cameback = win && (this.p1.hpPct < 0.2);
    if (cameback) this._cameback = true;

    if (win) this.scoring.onMatchWin({ flawless, comeback: cameback });

    this.progression.addTotals({
      lights: this.matchTotals.lights,
      heavies: this.matchTotals.heavies,
      grabs: this.matchTotals.grabs,
      specials: this.matchTotals.specials,
      sigs: this.matchTotals.sigs,
      blocks: this.matchTotals.blocks,
      perfectDodges: this.matchTotals.perfectDodges,
      timeoutWins: this.matchTotals.timeoutWins,
    });

    this.events.push({ type: 'match_stat', whiffPunishes: this.matchTotals.whiffPunishes });
    this.events.push({ type: 'round_stat', antiAirHeavies: this.matchTotals.antiAirHeavies });

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
          perfectBlocks: this.scoring.roundPerfectBlocks,
          guardBreaks: this.scoring.roundGuardBreaks,
          specials: this.matchTotals.specials,
          signatures: this.matchTotals.sigs,
        },
      },
    };
  }

  // ──────────────────────────────────────────
  //  RENDER — called every frame by engine.js
  // ──────────────────────────────────────────

  render() {
    this.renderer.beginScene();

    const c = this.renderer.ctx;
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(this.arena.leftWall, this.arena.floorY + 110, this.arena.width, 4);

    // Motion trails
    this.renderer.drawTrails();

    // Fighters
    const p2invis = this.p2._invisT > 0;
    if (p2invis) this.p2._invisT -= 1 / 60;
    const p1invis = this.p1._invisT > 0;
    if (p1invis) this.p1._invisT -= 1 / 60;

    if (!p1invis) this.renderer.drawFighter(this.p1);
    if (!p2invis) this.renderer.drawFighter(this.p2);

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
    this.renderer.drawPushBlockEffects(1/60);
    this.renderer.drawComboCounter();
    this.renderer.drawDamageNumbers(this.combat.damageNumbers);

    // Charge glow (drawn around charging fighters)
    this.renderer.drawChargeGlow(this.p1, 1/60);
    this.renderer.drawChargeGlow(this.p2, 1/60);

    // Charged special banner (DRAGON BREATH, etc.)
    this.renderer.drawChargedSpecialBanner(1/60);

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
      // Show winner after KO text fades
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
      guardBreakWarning: this._guardBreakDisplayT > 0,
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
}
