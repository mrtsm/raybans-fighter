export class Fighter {
  constructor(def, side){
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.color = def.colors.core;
    this.glow = def.colors.glow;

    this.side = side; // -1 left, +1 right
    this.facing = side===-1 ? 1 : -1; // towards opponent

    this.maxHp = def.health;
    this.hp = this.maxHp;
    this.momentum = 0;

    this.x = side===-1 ? 160 : 440;
    this.y = 330;
    this.w = 90;
    this.h = 200;

    this.vx = 0;
    this.vy = 0;
    this.onGround = true;

    this.state = 'idle';
    this.stateT = 0;
    this.hitstunF = 0;
    this.blocking = 'none'; // none|stand|crouch
    this.crouching = false;
    this.crouchT = 0;

    this.dashIframesF = 0;
    this.dashArmorHits = 0;
    this.shieldT = 0;
    this.shieldHits = 0;

    this.attack = null; // {kind, startupF, activeF, recoveryF, range, dmg, type, ...}
    this.attackF = 0;
    this.attackHasHit = false;

    this.chargeT = 0;
    this.chargePct = 0;
    this.charging = false;

    this.lastStand = false;

    // stats
    this.stats = { antiAirHeavies:0, whiffPunishes:0, grabDamage:0, lightDamage:0, heavyDamage:0, specials:0, sigs:0, blocks:0, perfectDodges:0 };

    this._recentActions = []; // for AI pattern tracking
  }

  get hpPct(){ return Math.max(0, this.hp/this.maxHp); }

  pushAction(a){
    this._recentActions.push({t:performance.now(), a});
    if(this._recentActions.length>20) this._recentActions.shift();
  }

  recentActions(){ return this._recentActions.map(x=>x.a); }

  setFacingTo(opp){
    this.facing = (opp.x>=this.x) ? 1 : -1;
  }

  isVulnerable(){
    return this.hitstunF<=0 && this.state !== 'ko';
  }

  canAct(){
    return this.hitstunF<=0 && !this.attack && !this.charging && this.state!=='ko' && this.state!=='victory';
  }

  startDash(dir, iframesF){
    this.state='dash';
    this.stateT=0;
    this.vx = dir * this.def.dashPx * 30/4; // cover distance in ~4 frames
    this.dashIframesF = iframesF;
    if(this.def.armorDash){
      this.dashArmorHits = this.def.armorDash.hits;
    } else this.dashArmorHits = 0;
  }

  startJump(){
    if(!this.onGround) return;
    this.state='jump';
    this.stateT=0;
    this.onGround=false;
    this.vy = -520; // tuned for ~0.5s airtime
  }

  startCrouch(){
    this.crouching = true;
    this.crouchT = 0.25;
    this.state='crouch';
    this.stateT=0;
  }

  startBlock(mode){
    this.blocking = mode; // stand|crouch
    this.state = 'block';
  }

  stopBlock(){
    this.blocking = 'none';
    if(this.state==='block') this.state='idle';
  }

  startCharge(){
    if(this.charging || this.attack || this.hitstunF>0) return;
    this.charging = true;
    this.chargeT = 0;
    this.chargePct = 0;
    this.state='special_charge';
  }

  releaseCharge(){
    const t=this.chargeT;
    this.charging=false;
    this.chargeT=0;
    this.chargePct=0;
    if(this.state==='special_charge') this.state='idle';
    return t;
  }

  startAttack(kind, variant={}){
    if(this.attack || this.hitstunF>0 || this.state==='ko' || this.state==='victory') return false;
    let m;
    if(kind==='light') m=this.def.moves.light;
    if(kind==='heavy') m=this.def.moves.heavy;
    if(kind==='low') m=this.def.moves.low;
    if(kind==='air') m=this.def.moves.air;
    if(kind==='grab') m=this.def.moves.grab;

    if(!m) return false;

    this.attack = {
      kind,
      startupF: m.startup,
      activeF: m.active,
      recoveryF: m.recovery,
      dmg: m.dmg,
      type: m.type,
      range: (kind==='grab'?40 : (kind==='heavy'?this.def.range.heavy : (kind==='light'?this.def.range.light : this.def.range.low))),
      ...m,
      ...variant,
    };
    this.attackF = 0;
    this.attackHasHit = false;
    this.state = kind==='grab'?'grab':(kind==='heavy'?'heavy':'light');
    this.stateT = 0;
    return true;
  }

  takeHit({ dmg, type, from, isChip=false }){
    if(this.state==='ko') return { hit:false };

    // dash i-frames
    if(this.dashIframesF>0){
      this.stats.perfectDodges++;
      return { hit:false, dodged:true, perfect:true };
    }

    // dash armor
    if(this.state==='dash' && this.dashArmorHits>0){
      this.dashArmorHits--;
      const applied = Math.ceil(dmg*0.5);
      this.hp = Math.max(1, this.hp - applied); // armor never kills
      return { hit:true, armored:true, dmg:applied };
    }

    // shield armor
    if(this.shieldT>0 && this.shieldHits>0){
      this.shieldHits--;
      const applied = Math.ceil(dmg*0.5);
      this.hp = Math.max(1, this.hp - applied);
      return { hit:true, armored:true, dmg:applied };
    }

    // blocking
    if(this.blocking!=='none'){
      let blocks = false;
      if(this.blocking==='stand' && (type==='mid' || type==='high' || type==='overhead')) blocks=true;
      if(this.blocking==='crouch' && type==='low') blocks=true;
      if(blocks){
        this.stats.blocks++;
        const chip = isChip ? Math.ceil(dmg*0.2) : Math.ceil(dmg*0.2);
        const canChipKill = false;
        const applied = (canChipKill?chip:Math.min(chip, Math.max(0,this.hp-1)));
        this.hp -= applied;
        return { hit:false, blocked:true, chip:applied };
      }
    }

    // real hit
    this.hp = Math.max(0, this.hp - dmg);
    this.hitstunF = 9;
    this.state='hit';
    this.attack=null;
    this.charging=false;
    this.chargePct=0;
    return { hit:true, dmg };
  }

  update(dt, arena){
    // last stand state
    this.lastStand = this.hpPct>0 && this.hpPct<0.2;

    // timers
    if(this.hitstunF>0) this.hitstunF--;

    if(this.dashIframesF>0) this.dashIframesF--;

    if(this.crouchT>0){
      this.crouchT-=dt;
      if(this.crouchT<=0){
        this.crouching=false;
        if(this.state==='crouch') this.state='idle';
      }
    }

    if(this.shieldT>0){
      this.shieldT-=dt;
      if(this.shieldT<=0){ this.shieldT=0; this.shieldHits=0; }
    }

    // charge
    if(this.charging){
      this.chargeT += dt;
      this.chargePct = Math.min(1, this.chargeT/1.0);
    }

    // attack frame count
    if(this.attack){
      this.attackF++;
      const totalF = this.attack.startupF + this.attack.activeF + this.attack.recoveryF;
      if(this.attackF >= totalF){
        this.attack = null;
        this.state='idle';
      }
    }

    // movement physics
    const g = 1500;
    if(!this.onGround){
      this.vy += g*dt;
      this.y += this.vy*dt;
      if(this.y >= arena.floorY){
        this.y = arena.floorY;
        this.vy = 0;
        this.onGround = true;
        if(this.state==='jump') this.state='idle';
      }
    }

    // dash decay
    this.x += this.vx*dt;
    this.vx *= 0.70;
    if(Math.abs(this.vx)<15) this.vx=0;
    if(this.state==='dash' && this.vx===0) this.state='idle';

    // walls (560px wide within 600)
    const minX = arena.leftWall;
    const maxX = arena.rightWall;
    this.x = Math.max(minX, Math.min(maxX, this.x));

    this.stateT += dt;

    if(this.hp<=0 && this.state!=='ko'){
      this.state='ko';
      this.vx=0; this.vy=0;
    }
  }

  attackWindow(){
    if(!this.attack) return { active:false };
    const a=this.attack;
    const f=this.attackF;
    const activeStart=a.startupF;
    const activeEnd=a.startupF + a.activeF;
    return {
      active: f>=activeStart && f<activeEnd,
      startup: f<activeStart,
      recovery: f>=activeEnd,
      kind:a.kind,
      a
    };
  }
}
