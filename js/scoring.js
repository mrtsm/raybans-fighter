export class Scoring {
  constructor(){
    this.score = 0;
    this.streak = 0;
    this.mult = 1;
    this.roundDamageDealt = 0;
    this.roundDamageTaken = 0;
    this.roundWhiffPunishes = 0;
    this.roundAntiAirHeavies = 0;
    this.roundGrabDamage = 0;
    this.roundLightDamage = 0;
    this.roundHeavyDamage = 0;
    this.roundSpecials = 0;
    this.roundSignatures = 0;
    this.timeoutWin = false;
  }

  _updateMult(){
    if(this.streak>=7) this.mult=3;
    else if(this.streak>=5) this.mult=2;
    else if(this.streak>=3) this.mult=1.5;
    else this.mult=1;
  }

  onHit({ kind, points, dmg, whiffPunish=false, antiAirHeavy=false, mixBonus=false }){
    this.streak++;
    this._updateMult();
    const add = Math.round(points * this.mult);
    this.score += add;
    this.roundDamageDealt += dmg;
    if(whiffPunish) { this.roundWhiffPunishes++; this.score += Math.round(350*this.mult); }
    if(antiAirHeavy) this.roundAntiAirHeavies++;
    if(mixBonus) this.score += Math.round(200*this.mult);

    if(kind==='light'){ this.score += Math.round(100*this.mult); this.roundLightDamage+=dmg; }
    if(kind==='heavy'){ this.score += Math.round(250*this.mult); this.roundHeavyDamage+=dmg; }
    if(kind==='grab'){ this.score += Math.round(200*this.mult); this.roundGrabDamage+=dmg; }
    if(kind==='special'){ this.score += Math.round(400*this.mult); this.roundSpecials++; }
    if(kind==='signature'){ this.score += Math.round(1000*this.mult); this.roundSignatures++; }

    return { streak:this.streak, mult:this.mult, score:this.score };
  }

  onGotHit(dmg){
    this.roundDamageTaken += dmg;
    this.streak = 0;
    this._updateMult();
  }

  onRoundWin({ byTimeout=false, perfect=false, under20=false }){
    this.score += 1000;
    if(byTimeout) this.score += 500;
    if(perfect) this.score += 2000;
    if(under20) this.score += 500;
  }

  onMatchWin({ flawless=false, comeback=false }){
    if(flawless) this.score += 5000;
    if(comeback) this.score += 1500;
  }
}
