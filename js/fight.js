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
    this.p1.hitstunF = this.p2.hitstunF = 0;
    this.p1.blocking = this.p2.blocking = 'none';
    this.p1.crouching = this.p2.crouching = false;
    this.p1.comboRoute = [];
    this.p2.comboRoute = [];
    this.p1.consecutiveBlocks = 0;
    this.p2.consecutiveBlocks = 0;
    this.p1.guardBroken = false;
    this.p2.guardBroken = false;
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
      if (this.phaseT >= 1.8) {
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

      // Block (down hold)
      if (a === 'down_hold') {
        if (this.mods.noBlock) continue;
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

      // Left click → light attack (ALWAYS, no exceptions)
      if (a === 'light') {
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

      // Right click → special (instant, armband)
      if (a === 'special') {
        this._trySpecialOrSig(this.p1, this.p2, true, 0.6);
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

  _momentumGain(f, amt) {
    const mul = (f.lastStand ? 1.5 : 1) * (this.mods.momentumMul || 1);
    f.momentum = clamp(f.momentum + Math.round(amt * mul), 0, 100);
    if (f.momentum >= 100) this.events.push({ type: 'momentum', value: 100 });
  }

  _momentumDrain(f, amt) {
    f.momentum = clamp(f.momentum - amt, 0, 100);
  }

  _onCombatEvent(ev, attacker, defender, isPlayer) {
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
    this.renderer.drawComboCounter();
    this.renderer.drawDamageNumbers(this.combat.damageNumbers);

    // Win streak
    if (this.streak > 0) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.textAlign = 'left';
      c.font = '700 11px Orbitron, system-ui';
      c.fillStyle = 'rgba(255,215,64,0.65)';
      c.fillText(`🔥 ${this.streak} STREAK`, 16, this.renderer.h - 48);
      c.restore();
    }

    // Banner
    let banner = '';
    if (this.phase === 'intro') banner = 'FIGHT!';
    else if (this.phase === 'between') {
      banner = this._koPhase ? 'K.O.' : 'ROUND END';
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
