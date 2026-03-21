// ============================================================
//  ai.js — v2: AI for auto-approach + combo combat system
//  AI chooses: strike, heavy, parry, dash, jump, ultimate
//  No more walking — auto-approach handles positioning
// ============================================================

export class AI {
  constructor({ difficulty = 'normal', fighterId = 'granite', streakBonus = 0 }) {
    this.difficulty = difficulty;
    this.fighterId = fighterId;

    const diffSettings = {
      easy:      { reactionMs: 700, aggression: 0.3, parryChance: 0.05, dashChance: 0.10, heavyChance: 0.15, ultThreshold: 100 },
      normal:    { reactionMs: 350, aggression: 0.5, parryChance: 0.15, dashChance: 0.15, heavyChance: 0.25, ultThreshold: 100 },
      hard:      { reactionMs: 200, aggression: 0.7, parryChance: 0.30, dashChance: 0.20, heavyChance: 0.35, ultThreshold: 100 },
      nightmare: { reactionMs: 100, aggression: 0.9, parryChance: 0.45, dashChance: 0.25, heavyChance: 0.40, ultThreshold: 80  },
    };
    const s = diffSettings[difficulty] || diffSettings.normal;

    this.reactionMs = s.reactionMs;
    this.aggression = Math.min(1.0, s.aggression + streakBonus);
    this.parryChance = s.parryChance;
    this.dashChance = s.dashChance;
    this.heavyChance = s.heavyChance;
    this.ultThreshold = s.ultThreshold;

    this._cooldown = 0;
    this._t = 0;
    this._lastActionT = 0;
  }

  update(dt, self, player, opts = {}) {
    this._t += dt;
    const actions = [];

    if (self.state === 'ko' || self.state === 'victory') return actions;
    if (player.state === 'ko') return actions;

    this._cooldown -= dt;
    if (this._cooldown > 0) return actions;

    if (!self.canAct()) return actions;

    const dist = Math.abs(self.x - player.x);
    const playerToRight = player.x > self.x;

    // ── ULTIMATE: fire when momentum is high enough ──
    if (self.momentum >= this.ultThreshold && Math.random() < 0.3) {
      actions.push({ action: 'ultimate' });
      this._cooldown = 1.0;
      this._lastActionT = this._t;
      return actions;
    }

    // ── IN RANGE: react and attack ──
    if (dist < 90) {
      // React to player attacks with parry
      if (player.attack && Math.random() < this.parryChance) {
        actions.push({ action: 'parry' });
        this._cooldown = 0.4;
        this._lastActionT = this._t;
        return actions;
      }

      // Dash away sometimes (create space, dodge pressure)
      if (Math.random() < this.dashChance * 0.5) {
        actions.push({ action: playerToRight ? 'dash_left' : 'dash_right' });
        this._cooldown = 0.5;
        this._lastActionT = this._t;
        return actions;
      }

      // Attack! Choose between strike and heavy
      if (Math.random() < this.heavyChance) {
        actions.push({ action: 'heavy' });
      } else {
        actions.push({ action: 'strike' });
      }

      // Occasionally jump attack
      if (Math.random() < 0.1 && self.onGround) {
        actions.push({ action: 'jump' });
      }

      this._cooldown = (this.reactionMs / 1000) * (0.8 + Math.random() * 0.6);
      this._lastActionT = this._t;
      return actions;
    }

    // ── MID RANGE: dash in or wait for auto-approach ──
    if (dist > 150 && Math.random() < this.aggression * 0.4) {
      actions.push({ action: playerToRight ? 'dash_right' : 'dash_left' });
      this._cooldown = 0.3;
      this._lastActionT = this._t;
      return actions;
    }

    // Let auto-approach handle positioning, just wait
    this._cooldown = this.reactionMs / 1000 * 0.5;
    return actions;
  }
}
