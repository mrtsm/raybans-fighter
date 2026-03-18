// ============================================================
//  ai.js — Aggressive AI that always fights
//  Simple decision tree: approach → attack when in range
//  No stuck states — force reset after 2s of inaction
// ============================================================

export class AI {
  constructor({ difficulty = 'normal', fighterId = 'granite', streakBonus = 0 }) {
    this.difficulty = difficulty;
    this.fighterId = fighterId;
    this.streakBonus = streakBonus;

    // Difficulty settings
    const diffSettings = {
      easy:      { reactionMs: 400, aggression: 0.4, blockChance: 0.15, specialChance: 0.10 },
      normal:    { reactionMs: 250, aggression: 0.6, blockChance: 0.25, specialChance: 0.20 },
      hard:      { reactionMs: 150, aggression: 0.8, blockChance: 0.35, specialChance: 0.30 },
      nightmare: { reactionMs: 80,  aggression: 0.95, blockChance: 0.50, specialChance: 0.40 },
    };
    const s = diffSettings[difficulty] || diffSettings.normal;

    this.reactionMs = s.reactionMs;
    this.aggression = Math.min(1.0, s.aggression + streakBonus);
    this.blockChance = s.blockChance;
    this.specialChance = s.specialChance;

    // State
    this._cooldown = 0;        // seconds until next decision
    this._idleTime = 0;        // seconds of total idle (for anti-stuck)
    this._lastActionT = 0;     // time of last action taken
    this._backoffFrames = 0;   // frames to walk away
    this._t = 0;
  }

  /**
   * Called every frame. Returns array of { action } objects.
   * @param {number} dt - delta time in seconds
   * @param {Fighter} self - AI fighter (P2)
   * @param {Fighter} player - human fighter (P1)
   * @param {object} opts - { aiCanSpecial }
   */
  update(dt, self, player, opts = {}) {
    this._t += dt;
    const actions = [];

    // Can't do anything if KO or victory
    if (self.state === 'ko' || self.state === 'victory') return actions;
    if (player.state === 'ko') return actions;

    // Cooldown between decisions
    this._cooldown -= dt;
    if (this._cooldown > 0) return actions;

    // Anti-stuck: if no action in 2 seconds, force approach
    if (this._t - this._lastActionT > 2.0) {
      this._backoffFrames = 0;
      this._cooldown = 0;
    }

    // Can't act while in hitstun or mid-attack
    if (!self.canAct()) {
      // But track idle time for anti-stuck even during hitstun
      // If stuck in canAct()===false for too long, force reset
      if (self.hitstunF <= 0 && self.attack) {
        // Attack might be stuck — it should auto-complete via fighter.update()
      }
      return actions;
    }

    const dist = Math.abs(self.x - player.x);
    const playerToRight = player.x > self.x;

    // ── BACKOFF: walk away for a few frames ──
    if (this._backoffFrames > 0) {
      this._backoffFrames--;
      actions.push({ action: playerToRight ? 'walk_left' : 'walk_right' });
      this._lastActionT = this._t;
      return actions;
    }

    // ── BLOCK: react to player attacks ──
    if (player.attack && dist < 120 && Math.random() < this.blockChance) {
      actions.push({ action: 'down_hold' });
      this._cooldown = 0.3;
      this._lastActionT = this._t;
      return actions;
    }

    // ── IN RANGE: attack! ──
    const attackRange = 90;
    if (dist < attackRange) {
      // Decide attack type
      if (opts.aiCanSpecial && Math.random() < this.specialChance) {
        actions.push({ action: 'special' });
      } else if (Math.random() < 0.7) {
        actions.push({ action: 'light' });
      } else {
        actions.push({ action: 'heavy' });
      }

      // Random cooldown after attacking
      this._cooldown = (this.reactionMs / 1000) * (0.8 + Math.random() * 0.6);
      this._lastActionT = this._t;

      // Occasionally back off after attacking (20% chance)
      if (Math.random() < 0.2) {
        this._backoffFrames = 30 + Math.floor(Math.random() * 30);
      }

      return actions;
    }

    // ── FAR AWAY: approach ──
    if (dist > 120) {
      actions.push({ action: playerToRight ? 'walk_right' : 'walk_left' });
      this._lastActionT = this._t;

      // Occasionally jump while approaching (10% chance per decision)
      if (Math.random() < 0.10 && self.onGround) {
        actions.push({ action: 'jump' });
      }

      this._cooldown = this.reactionMs / 1000 * 0.5;
      return actions;
    }

    // ── MID RANGE: close the gap ──
    actions.push({ action: playerToRight ? 'walk_right' : 'walk_left' });
    this._lastActionT = this._t;

    // Sometimes dash in for aggression
    if (Math.random() < this.aggression * 0.3) {
      actions.push({ action: playerToRight ? 'dash_right' : 'dash_left' });
    }

    this._cooldown = this.reactionMs / 1000 * 0.4;
    return actions;
  }
}
