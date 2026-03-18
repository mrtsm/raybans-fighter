// AI personalities per fighter
const AI_PERSONALITIES = {
  blaze:   { aggression: 0.7, comboStyle: ['light','light','heavy'], specialUse: 0.2 },
  granite: { aggression: 0.4, comboStyle: ['light','heavy'], specialUse: 0.15 },
  shade:   { aggression: 0.6, comboStyle: ['light','low','heavy'], specialUse: 0.25 },
  volt:    { aggression: 0.5, comboStyle: ['light','light','low'], specialUse: 0.2 },
};

export class AI {
  constructor({ difficulty='normal', fighterId='blaze', streakBonus=0 }){
    this.difficulty = difficulty;
    this.fighterId = fighterId;
    this.personality = AI_PERSONALITIES[fighterId] || AI_PERSONALITIES.blaze;

    // Streak bonus makes AI harder as win streak increases
    const sb = streakBonus || 0;

    this.t = 0;
    this.cooldown = 0;
    this.reactionMs = Math.max(40, ({ easy:250, normal:150, hard:100, nightmare:60 }[difficulty] ?? 150) - sb * 200);
    this.specialChance = Math.min(0.5, ({ easy:0.10, normal:0.20, hard:0.32, nightmare:0.42 }[difficulty] ?? 0.20) + sb * 0.3);
    this.aggression = Math.min(1.2, this.personality.aggression * ({ easy:0.7, normal:1.0, hard:1.1, nightmare:1.2 }[difficulty] ?? 1.0) + sb * 0.3);

    // State machine
    this.state = 'neutral';
    this.plan = [];
    this.planIndex = 0;
    this.planDelay = 0;

    // Combo execution — streak makes AI combo more
    this.comboChance = Math.min(0.9, ({ easy:0.2, normal:0.45, hard:0.65, nightmare:0.80 }[difficulty] ?? 0.45) + sb * 0.4);
    this.blockChance = Math.min(0.9, ({ easy:0.25, normal:0.45, hard:0.65, nightmare:0.85 }[difficulty] ?? 0.45) + sb * 0.3);

    // Pattern tracking
    this._opponentPatterns = { attack: 0, block: 0, dodge: 0, grab: 0 };
    this._patternWindow = [];
  }

  update(dt, self, opp, context){
    this.t += dt;

    // Execute queued plan
    if(this.plan.length > 0){
      this.planDelay -= dt;
      if(this.planDelay <= 0 && this.planIndex < this.plan.length){
        const step = this.plan[this.planIndex];
        this.planIndex++;
        this.planDelay = step.delay || 0.08;
        if(this.planIndex >= this.plan.length) this.plan = [];
        return [step];
      }
      return [];
    }

    if(this.cooldown>0){ this.cooldown-=dt; return []; }
    if(!self.canAct()){
      // Force reset if stuck for too long
      this._stuckFrames = (this._stuckFrames || 0) + 1;
      if(this._stuckFrames > 120){ // 2 seconds at 60fps
        self.attack = null;
        self.hitstunF = 0;
        self.guardBroken = false;
        self.charging = false;
        self.state = 'idle';
        this._stuckFrames = 0;
      }
      return [];
    }
    this._stuckFrames = 0;

    this._trackPatterns(opp);
    this._assessState(self, opp);

    const dist = Math.abs(self.x - opp.x);

    switch(this.state){
      case 'pressure': return this._pressurePlan(self, opp, dist, context);
      case 'defense': return this._defensePlan(self, opp, dist);
      case 'punish': return this._punishPlan(self, opp, dist);
      case 'retreat': return this._retreatPlan(self, opp, dist);
      default: return this._neutralPlan(self, opp, dist, context);
    }
  }

  _trackPatterns(opp){
    const hist = opp.recentActions();
    this._opponentPatterns.attack = hist.filter(a=>a==='light'||a==='heavy').length / Math.max(1,hist.length);
    this._opponentPatterns.block = hist.filter(a=>a==='down_hold').length / Math.max(1,hist.length);
    this._opponentPatterns.dodge = hist.filter(a=>a==='dash_left'||a==='dash_right').length / Math.max(1,hist.length);
    this._opponentPatterns.grab = hist.filter(a=>a==='grab').length / Math.max(1,hist.length);
  }

  _assessState(self, opp){
    const dist = Math.abs(self.x - opp.x);

    if(opp.attack && dist < 100 && Math.random() < this.blockChance){
      this.state = 'defense';
      return;
    }

    if(opp.attack && opp.attackWindow().recovery && dist < 120){
      this.state = 'punish';
      return;
    }

    if(self.hpPct < 0.25 && Math.random() < 0.3){
      this.state = 'retreat';
      return;
    }

    if(dist < 100 && Math.random() < this.aggression){
      this.state = 'pressure';
      return;
    }

    this.state = 'neutral';
  }

  _neutralPlan(self, opp, dist, context){
    const out = [];

    if(!opp.onGround && dist < 120 && Math.random() < 0.4){
      out.push({ action:'heavy' });
      return this._delay(out);
    }

    if(context.aiCanSpecial && dist > 120 && Math.random() < this.specialChance){
      out.push({ action:'special' });
      return this._delay(out);
    }

    if(dist > 150){
      out.push({ action:(self.x<opp.x?'walk_right':'walk_left') });
      if(dist > 200 && Math.random() < 0.4){
        out.push({ action:(self.x<opp.x?'dash_right':'dash_left') });
      }
      return this._delay(out);
    }

    if(dist > 80){
      if(Math.random() < this.aggression){
        out.push({ action:(self.x<opp.x?'walk_right':'walk_left') });
        out.push({ action: Math.random() < 0.5 ? 'light' : 'heavy' });
      } else {
        out.push({ action: 'light' });
      }
      return this._delay(out);
    }

    const r = Math.random();
    if(r < 0.15 && this._opponentPatterns.block > 0.4){
      out.push({ action:'grab' });
    } else if(r < 0.35){
      out.push({ action:'light' });
    } else if(r < 0.55){
      out.push({ action:'heavy' });
    } else if(r < 0.7){
      out.push({ action:'low' });
    } else {
      out.push({ action:'down_hold' });
    }

    return this._delay(out);
  }

  _pressurePlan(self, opp, dist, context){
    if(Math.random() < this.comboChance && dist < 100){
      const combo = this.personality.comboStyle;
      this.plan = combo.map((action, i) => ({
        action,
        delay: i === 0 ? 0 : 0.08 + Math.random() * 0.04,
      }));
      this.planIndex = 0;
      this.planDelay = 0;
      this.cooldown = 0;
      const first = this.plan[0];
      this.planIndex = 1;
      this.planDelay = this.plan[1]?.delay || 0.08;
      return [first];
    }

    const out = [];
    const r = Math.random();
    if(r < 0.3) out.push({ action:'light' });
    else if(r < 0.5) out.push({ action:'heavy' });
    else if(r < 0.65) out.push({ action:'low' });
    else if(r < 0.8) out.push({ action:'grab' });
    else out.push({ action: self.x<opp.x?'walk_right':'walk_left' });

    return this._delay(out, 0.6);
  }

  _defensePlan(self, opp, dist){
    const out = [];
    out.push({ action:'down_hold' });

    if(Math.random() < 0.5){
      this.plan = [
        { action: 'down_hold', delay: 0.2 },
        { action: Math.random() < 0.6 ? 'light' : 'heavy', delay: 0.05 },
      ];
      this.planIndex = 0;
      this.planDelay = 0;
    }

    return this._delay(out, 0.8);
  }

  _punishPlan(self, opp, dist){
    const out = [];

    if(dist < 80){
      if(Math.random() < this.comboChance){
        this.plan = [
          { action: 'light', delay: 0 },
          { action: 'heavy', delay: 0.1 },
        ];
        this.planIndex = 0;
        this.planDelay = 0;
        return [this.plan[0]];
      }
      out.push({ action:'heavy' });
    } else {
      out.push({ action: self.x<opp.x?'dash_right':'dash_left' });
    }

    return this._delay(out, 0.5);
  }

  _retreatPlan(self, opp, dist){
    const out = [];
    const awayDir = self.x < opp.x ? 'dash_left' : 'dash_right';
    out.push({ action: awayDir });

    if(Math.random() < 0.3){
      out.push({ action:'special' });
    }

    return this._delay(out, 1.0);
  }

  _delay(actions, mult=1){
    const base = (this.reactionMs/1000) * mult;
    const jitter = (Math.random()*0.06)-0.03;
    this.cooldown = base + jitter;
    return actions;
  }
}
