export class AI {
  constructor({ difficulty='normal' }){
    this.difficulty = difficulty;
    this.t = 0;
    this.cooldown = 0;
    this.reactionMs = { easy:400, normal:250, hard:150, nightmare:100 }[difficulty] ?? 250;
    this.specialChance = { easy:0.08, normal:0.16, hard:0.24, nightmare:0.32 }[difficulty] ?? 0.16;
    this.aggression = { easy:0.35, normal:0.5, hard:0.62, nightmare:0.72 }[difficulty] ?? 0.5;
    this._pending = [];
  }

  update(dt, self, opp, context){
    this.t += dt;
    if(this.cooldown>0){ this.cooldown-=dt; return []; }

    // Don't pick actions if we can't act (wait without burning cooldown)
    if(!self.canAct()) return [];

    // adaptation based on opponent last 20 actions
    const hist = opp.recentActions();
    const blockRate = hist.filter(a=>a==='down_hold').length / Math.max(1,hist.length);
    const attackRate = hist.filter(a=>a==='light'||a==='heavy').length / Math.max(1,hist.length);
    const dodgeRate = hist.filter(a=>a==='dash_left'||a==='dash_right').length / Math.max(1,hist.length);

    const dist = Math.abs(self.x-opp.x);
    const close = dist<80;
    const mid = dist>=80 && dist<170;

    const out=[];

    const roll = Math.random();

    // if opponent blocks a lot -> grab more
    if(close && blockRate>0.5 && roll<0.35){
      out.push({ action:'grab' });
      return this._delay(out);
    }

    // if opponent attack spams -> block then punish
    if(attackRate>0.55 && roll<0.25){
      out.push({ action:'down_hold' });
      // punish with heavy sometimes
      if(Math.random()<0.55) out.push({ action:'heavy', after:0.18 });
      else out.push({ action:'light', after:0.12 });
      return this._delay(out);
    }

    // if opponent dodges -> delay attacks / chase
    if(dodgeRate>0.45 && roll<0.22){
      if(dist>90) out.push({ action:(self.x<opp.x?'dash_right':'dash_left') });
      out.push({ action:'heavy', after:0.22 });
      return this._delay(out);
    }

    // anti-air
    if(!opp.onGround && Math.random()<0.35){
      out.push({ action:'heavy' });
      return this._delay(out);
    }

    // use special
    if(context.aiCanSpecial && Math.random()<this.specialChance){
      out.push({ action:'special' });
      return this._delay(out);
    }

    // neutral logic
    if(dist>170){
      out.push({ action:(self.x<opp.x?'dash_right':'dash_left') });
    } else if(mid){
      if(Math.random()<this.aggression) out.push({ action:'heavy' });
      else out.push({ action:'light' });
    } else if(close){
      const r=Math.random();
      if(r<0.15) out.push({ action:'crouch' });
      else if(r<0.35) out.push({ action:'light' });
      else if(r<0.55) out.push({ action:'low' });
      else if(r<0.70) out.push({ action:'heavy' });
      else out.push({ action:'grab' });
    }

    return this._delay(out);
  }

  _delay(actions){
    const base = this.reactionMs/1000;
    const jitter = (Math.random()*0.06)-0.03;
    this.cooldown = base + jitter;
    return actions;
  }
}
