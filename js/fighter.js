// ============================================================
//  fighter.js — Simple state-machine fighter
//  States: idle, walk, jump, light, heavy, hit, ko, victory,
//          block, crouch, dash, special_charge
//  Every click → attack. No stuck states.
// ============================================================

export class Fighter {
  constructor(def, side) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.color = def.colors.core;
    this.glow = def.colors.glow;

    this.side = side;                       // -1 = left (P1), +1 = right (P2)
    this.facing = side === -1 ? 1 : -1;    // P1 faces right (1=flip), P2 faces left (-1=no flip)

    this.maxHp = def.health;
    this.hp = this.maxHp;
    this.momentum = 0;

    this.x = side === -1 ? 180 : 420;
    this.y = 380;                           // arena.floorY
    this.w = 90;
    this.h = 200;

    this.vx = 0;
    this.vy = 0;
    this.onGround = true;

    this.state = 'idle';
    this.stateT = 0;

    // Combat state
    this.hitstunF = 0;
    this.blocking = 'none';     // 'none' | 'stand' | 'crouch'
    this.crouching = false;
    this.crouchT = 0;

    this.attack = null;         // null | { kind, startupF, activeF, recoveryF, dmg, range, type, hitstunF, ... }
    this.attackF = 0;
    this.attackHasHit = false;

    // Combo route tracking (for scoring/combat.js compat)
    this.comboRoute = [];
    this.maxComboLength = 3;

    // Guard break (combat.js compat)
    this.consecutiveBlocks = 0;
    this.guardBroken = false;
    this.guardBrokenT = 0;

    // Charge (renderer compat)
    this.charging = false;
    this.chargeT = 0;
    this.chargePct = 0;

    // Dash (renderer compat)
    this.dashIframesF = 0;
    this.dashArmorHits = 0;

    // Shield (combat.js compat)
    this.shieldT = 0;
    this.shieldHits = 0;

    // Parry
    this.parryWindowF = 0;    // frames remaining in parry window (active parry detection)
    this.parryCooldownF = 0;  // frames until next parry allowed
    this.parrySuccess = false; // true when parry lands (for renderer glow)
    this.parrySuccessT = 0;   // timer (seconds) for parry glow visual
    this.parryWhiffF = 0;     // vulnerability frames after failed parry (can't block)
    this.parryStunF = 0;      // frames attacker is stunned after being parried

    // Push block
    this.pushBlockIframesF = 0;  // invincibility frames after push block
    this.pushBlockCooldownF = 0; // cooldown after push block

    // Internal timers
    this._parryBlockFallbackT = 0; // block fallback after failed parry
    this._recentHitstunF = 0; // frames since hitstun ended (for push block buffer)

    // Visual
    this.lastStand = false;
    this._renderScale = def.spriteScale || 1.0;
    this.scaleMul = 1.0;
    this.gravMul = 1.0;
    this._blockDisabled = false;
    this._invisT = 0;

    // Walk speed (px/s from fighter definition)
    this.walkSpeed = def.walkSpeed || 200;

    // Stats
    this.stats = {
      antiAirHeavies: 0, whiffPunishes: 0, grabDamage: 0,
      lightDamage: 0, heavyDamage: 0, specials: 0, sigs: 0,
      blocks: 0, perfectDodges: 0,
    };

    this._recentActions = [];
  }

  // ── Properties (renderer reads these) ──

  get hpPct() { return Math.max(0, this.hp / this.maxHp); }

  // ── Action tracking (combat.js compat) ──

  pushAction(a) {
    this._recentActions.push({ t: performance.now(), a });
    if (this._recentActions.length > 20) this._recentActions.shift();
  }

  recentActions() { return this._recentActions.map(x => x.a); }

  // ── Facing ──

  setFacingTo(opp) {
    // Don't change facing during attack or hitstun
    if (this.attack || this.hitstunF > 0) return;
    // Sprites face LEFT. facing=1 → flip to face right. facing=-1 → no flip, face left.
    this.facing = (opp.x > this.x) ? 1 : -1;
  }

  // ── State queries ──

  isVulnerable() {
    return this.hitstunF <= 0 && this.state !== 'ko';
  }

  canAct() {
    return this.hitstunF <= 0
      && !this.attack
      && !this.charging
      && this.parryStunF <= 0
      && this.state !== 'ko'
      && this.state !== 'victory'
      && !this.guardBroken;
  }

  // ── Movement ──

  walk(dir) {
    if (this.state === 'ko' || this.state === 'victory') return;
    if (this.charging) return;
    // Allow walk ALWAYS (even during hitstun/attack) but at reduced speed
    let speed = this.walkSpeed;
    if (this.hitstunF > 0) speed *= 0.4; // sluggish during hitstun
    if (this.attack) speed *= 0.3; // slow during attack
    this.x += dir * speed * (1 / 60);
    if (!this.attack && this.hitstunF <= 0) {
      if (this.state === 'idle' || this.state === 'walk') this.state = 'walk';
    }
  }

  startDash(dir, iframesF) {
    if (!this.canAct()) return;
    this.state = 'dash';
    this.stateT = 0;
    this.vx = dir * (this.def.dashPx || 90) * 10;
    this.dashIframesF = iframesF || 6;
    this.dashArmorHits = this.def.armorDash?.hits || 0;
  }

  startJump() {
    if (!this.onGround) return;
    if (this.state === 'ko' || this.state === 'victory') return;
    this.state = 'jump';
    this.stateT = 0;
    this.onGround = false;
    this.vy = -520;
  }

  startCrouch() {
    this.crouching = true;
    this.crouchT = 0.25;
    this.state = 'crouch';
    this.stateT = 0;
  }

  // ── Blocking ──

  startBlock(mode) {
    if (this._blockDisabled) return;
    this.blocking = mode;
    this.state = 'block';
  }

  stopBlock() {
    this.blocking = 'none';
    if (this.state === 'block') this.state = 'idle';
  }

  // ── Parry ──

  startParry() {
    // Can't parry during cooldown, KO, victory, or while attacking
    if (this.parryCooldownF > 0) return false;
    if (this.state === 'ko' || this.state === 'victory') return false;
    if (this.attack) return false;

    // Start parry window: 12 frames (~200ms, generous for armband latency)
    this.parryWindowF = 12;
    this.parryCooldownF = 30; // 0.5s cooldown at 60fps
    this.parrySuccess = false;
    this.blocking = 'none'; // Not blocking during parry attempt
    this.state = 'parry';
    this.stateT = 0;
    return true;
  }

  onParrySuccess() {
    // Called when a parry lands
    this.parrySuccess = true;
    this.parrySuccessT = 0.4; // golden glow duration
    this.parryWindowF = 0;
    this.hitstunF = 0;
    this.state = 'idle';
  }

  // ── Push Block ──

  startPushBlock() {
    // Costs 15 momentum
    if (this.momentum < 15) return false;
    if (this.pushBlockCooldownF > 0) return false;

    this.momentum -= 15;
    this.pushBlockIframesF = 6;  // brief invincibility
    this.pushBlockCooldownF = 30; // 0.5s cooldown
    this.hitstunF = 0;           // end hitstun immediately
    this.blocking = 'none';
    this.state = 'idle';
    return true;
  }

  // ── Charging (special charge for compatibility) ──

  startCharge() {
    if (this.charging || this.attack || this.hitstunF > 0) return;
    this.charging = true;
    this.chargeT = 0;
    this.chargePct = 0;
    this.state = 'special_charge';
  }

  releaseCharge() {
    const t = this.chargeT;
    this.charging = false;
    this.chargeT = 0;
    this.chargePct = 0;
    if (this.state === 'special_charge') this.state = 'idle';
    return t;
  }

  // ── Attack ──

  startAttack(kind, variant = {}) {
    // Force stop blocking/crouching when attacking
    this.blocking = 'none';
    this.crouching = false;

    // Can't attack if already attacking, in hitstun, KO, or victory
    if (this.attack) return false;
    if (this.hitstunF > 0 || this.state === 'ko' || this.state === 'victory') return false;

    let m;
    if (kind === 'light') m = this.def.moves.light;
    if (kind === 'heavy') m = this.def.moves.heavy;
    if (kind === 'low')   m = this.def.moves.low;
    if (kind === 'air')   m = this.def.moves.air;
    if (kind === 'grab')  m = this.def.moves.grab;
    if (!m) return false;

    this.attack = {
      kind,
      startupF: m.startup,
      activeF: m.active,
      recoveryF: m.recovery,
      dmg: m.dmg,
      type: m.type,
      range: kind === 'grab' ? 40
        : kind === 'heavy' ? this.def.range.heavy
        : kind === 'light' ? this.def.range.light
        : this.def.range.low,
      hitstunF: m.hitstunF || (kind === 'heavy' ? 12 : kind === 'light' ? 6 : kind === 'low' ? 6 : kind === 'air' ? 8 : 9),
      ...m,
      ...variant,
    };
    this.attackF = 0;
    this.attackHasHit = false;
    this.comboRoute.push(kind);

    this.state = kind === 'grab' ? 'grab' : (kind === 'heavy' ? 'heavy' : 'light');
    this.stateT = 0;
    return true;
  }

  // ── Take hit ──

  takeHit({ dmg, type, from, isChip = false }) {
    if (this.state === 'ko') return { hit: false };

    // Push block i-frames
    if (this.pushBlockIframesF > 0) {
      return { hit: false, dodged: true, pushBlockIframes: true };
    }

    // Dash i-frames
    if (this.dashIframesF > 0) {
      this.stats.perfectDodges++;
      return { hit: false, dodged: true, perfect: true };
    }

    // PARRY CHECK — if in parry window, parry succeeds!
    if (this.parryWindowF > 0 && this.state === 'parry') {
      this.onParrySuccess();
      return { hit: false, parried: true, from };
    }

    // Parry whiff vulnerability — can't block during whiff frames
    if (this.parryWhiffF > 0) {
      return this._applyHit(dmg, type, from);
    }

    // Dash armor
    if (this.state === 'dash' && this.dashArmorHits > 0) {
      this.dashArmorHits--;
      const applied = Math.ceil(dmg * 0.5);
      this.hp = Math.max(1, this.hp - applied);
      return { hit: true, armored: true, dmg: applied };
    }

    // Shield armor
    if (this.shieldT > 0 && this.shieldHits > 0) {
      this.shieldHits--;
      const applied = Math.ceil(dmg * 0.5);
      this.hp = Math.max(1, this.hp - applied);
      return { hit: true, armored: true, dmg: applied };
    }

    // Guard broken = can't block
    if (this.guardBroken) {
      return this._applyHit(dmg, type, from);
    }

    // Blocking
    if (this.blocking !== 'none') {
      let blocks = false;
      if (this.blocking === 'stand' && (type === 'mid' || type === 'high' || type === 'overhead')) blocks = true;
      if (this.blocking === 'crouch' && type === 'low') blocks = true;
      if (blocks) {
        this.stats.blocks++;
        this.consecutiveBlocks++;
        // Guard break after 3 consecutive blocks
        if (this.consecutiveBlocks >= 3) {
          this.guardBroken = true;
          this.guardBrokenT = 0.5;
          this.blocking = 'none';
          this.state = 'hit';
          this.consecutiveBlocks = 0;
          return { hit: false, guardBroken: true };
        }
        const chip = Math.ceil(dmg * 0.25);
        const canChipKill = this.hpPct <= 0.05;
        const applied = canChipKill ? chip : Math.min(chip, Math.max(0, this.hp - 1));
        this.hp -= applied;
        return { hit: false, blocked: true, chip: applied };
      }
    }

    return this._applyHit(dmg, type, from);
  }

  _applyHit(dmg, type, from) {
    this.hp = Math.max(0, this.hp - dmg);
    this.hitstunF = 9; // default, combat.js overrides per-move
    this.state = 'hit';
    this.attack = null;
    this.charging = false;
    this.chargePct = 0;
    this.comboRoute = [];
    this.consecutiveBlocks = 0;
    return { hit: true, dmg };
  }

  // ── Per-frame update ──

  update(dt, arena, gravMul) {
    // Last stand visual
    this.lastStand = this.hpPct > 0 && this.hpPct < 0.2;

    // Guard broken timer
    if (this.guardBroken) {
      this.guardBrokenT -= dt;
      if (this.guardBrokenT <= 0) {
        this.guardBroken = false;
        this.guardBrokenT = 0;
        if (this.state === 'hit') this.state = 'idle';
      }
    }

    // Hitstun countdown
    if (this.hitstunF > 0) {
      this.hitstunF--;
      if (this.hitstunF <= 0 && this.state === 'hit') this.state = 'idle';
    }

    // Parry window countdown
    if (this.parryWindowF > 0) {
      this.parryWindowF--;
      if (this.parryWindowF <= 0 && this.state === 'parry') {
        // Parry window expired without hit — vulnerability gap then block fallback
        this.parryWhiffF = 5; // 5 frames (~83ms) of vulnerability (can't block)
        this.state = 'idle';
      }
    }

    // Parry whiff vulnerability
    if (this.parryWhiffF > 0) {
      this.parryWhiffF--;
      if (this.parryWhiffF <= 0) {
        // After whiff gap, fall back to block for 300ms
        if (!this._blockDisabled && this.hitstunF <= 0 && this.state !== 'ko') {
          this.blocking = 'stand';
          this.state = 'block';
          this._parryBlockFallbackT = 0.3;
        }
      }
    }

    // Parry block fallback timer
    if (this._parryBlockFallbackT > 0) {
      this._parryBlockFallbackT -= dt;
      if (this._parryBlockFallbackT <= 0) {
        this._parryBlockFallbackT = 0;
        this.blocking = 'none';
        if (this.state === 'block') this.state = 'idle';
      }
    }

    // Parry cooldown
    if (this.parryCooldownF > 0) this.parryCooldownF--;

    // Parry success glow timer
    if (this.parrySuccessT > 0) {
      this.parrySuccessT -= dt;
      if (this.parrySuccessT <= 0) {
        this.parrySuccessT = 0;
        this.parrySuccess = false;
      }
    }

    // Parry stun (attacker stunned after being parried)
    if (this.parryStunF > 0) {
      this.parryStunF--;
    }

    // Push block i-frames
    if (this.pushBlockIframesF > 0) this.pushBlockIframesF--;

    // Push block cooldown
    if (this.pushBlockCooldownF > 0) this.pushBlockCooldownF--;

    // Dash i-frames countdown
    if (this.dashIframesF > 0) this.dashIframesF--;

    // Crouch timer
    if (this.crouchT > 0) {
      this.crouchT -= dt;
      if (this.crouchT <= 0) {
        this.crouching = false;
        if (this.state === 'crouch') this.state = 'idle';
      }
    }

    // Shield timer
    if (this.shieldT > 0) {
      this.shieldT -= dt;
      if (this.shieldT <= 0) { this.shieldT = 0; this.shieldHits = 0; }
    }

    // Charge timer
    if (this.charging) {
      this.chargeT += dt;
      this.chargePct = Math.min(1, this.chargeT / 1.0);
    }

    // Attack frame progression
    if (this.attack) {
      this.attackF++;
      const totalF = this.attack.startupF + this.attack.activeF + this.attack.recoveryF;
      if (this.attackF >= totalF) {
        this.attack = null;
        this.comboRoute = [];
        this.state = 'idle';
      }
    }

    // Reset walk to idle (walk() will set it back next frame if still held)
    if (this.state === 'walk' && !this.attack && this.hitstunF <= 0) {
      this.state = 'idle';
    }

    // Gravity
    const g = 1500 * (gravMul || 1);
    if (!this.onGround) {
      this.vy += g * dt;
      this.y += this.vy * dt;
      if (this.y >= arena.floorY) {
        this.y = arena.floorY;
        this.vy = 0;
        this.onGround = true;
        if (this.state === 'jump') this.state = 'idle';
      }
    }

    // Velocity movement + decay
    this.x += this.vx * dt;
    this.vx *= 0.85;
    if (Math.abs(this.vx) < 10) this.vx = 0;
    if (this.state === 'dash' && this.vx === 0) this.state = 'idle';

    // Arena walls
    this.x = Math.max(arena.leftWall, Math.min(arena.rightWall, this.x));

    this.stateT += dt;

    // KO check
    if (this.hp <= 0 && this.state !== 'ko') {
      this.state = 'ko';
      this.vx = 0;
      this.vy = 0;
    }
  }

  // ── Attack window (used by combat.js) ──

  attackWindow() {
    if (!this.attack) return { active: false };
    const a = this.attack;
    const f = this.attackF;
    const activeStart = a.startupF;
    const activeEnd = a.startupF + a.activeF;
    return {
      active: f >= activeStart && f < activeEnd,
      startup: f < activeStart,
      recovery: f >= activeEnd,
      kind: a.kind,
      a,
    };
  }
}
