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
    this.y = 380; // must match arena.floorY
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

    this.attack = null;
    this.attackF = 0;
    this.attackHasHit = false;

    // Combo system: cancel chains
    this.comboRoute = []; // track chain: ['light','light','heavy']
    this.maxComboLength = 3;

    // Guard break system
    this.consecutiveBlocks = 0;
    this.guardBroken = false;
    this.guardBrokenT = 0;

    this.chargeT = 0;
    this.chargePct = 0;
    this.charging = false;

    this.lastStand = false;

    // Walk speed (px/s)
    this.walkSpeed = def.walkSpeed || 100;

    // Daily mod flags
    this._blockDisabled = false;
    this._renderScale = 1.0;

    // Scale modifier (for giant/tiny daily challenge)
    this.scaleMul = 1.0;

    // Gravity modifier (for low gravity daily challenge)
    this.gravMul = 1.0;

    // stats
    this.stats = { antiAirHeavies:0, whiffPunishes:0, grabDamage:0, lightDamage:0, heavyDamage:0, specials:0, sigs:0, blocks:0, perfectDodges:0 };

    this._recentActions = [];
    this._invisT = 0;
  }

  get hpPct(){ return Math.max(0, this.hp/this.maxHp); }

  pushAction(a){
    this._recentActions.push({t:performance.now(), a});
    if(this._recentActions.length>20) this._recentActions.shift();
  }

  recentActions(){ return this._recentActions.map(x=>x.a); }

  setFacingTo(opp){
    if(this.attack || this.hitstunF>0 || this.charging || this.state==='dash') return;
    this.facing = (opp.x>=this.x) ? 1 : -1;
  }

  isVulnerable(){
    return this.hitstunF<=0 && this.state !== 'ko';
  }

  canAct(){
    return this.hitstunF<=0 && !this.attack && !this.charging && this.state!=='ko' && this.state!=='victory' && !this.guardBroken;
  }

  // Walk: smooth continuous movement
  walk(dir){
    if(!this.canAct() && this.state !== 'idle') return;
    if(this.hitstunF > 0 || this.state === 'ko' || this.state === 'victory') return;
    // Don't walk during attacks or charging
    if(this.attack || this.charging) return;
    this.x += dir * this.walkSpeed * (1/60);
    if(this.state === 'idle' || this.state === 'walk') this.state = 'walk';
  }

  startDash(dir, iframesF){
    this.state='dash';
    this.stateT=0;
    this.vx = dir * this.def.dashPx * 60/6; // cover distance in ~6 frames at 60fps
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
    this.vy = -520;
  }

  startCrouch(){
    this.crouching = true;
    this.crouchT = 0.25;
    this.state='crouch';
    this.stateT=0;
  }

  startBlock(mode){
    if(this._blockDisabled) return;
    this.blocking = mode;
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

  // Enhanced startAttack with combo cancel system
  startAttack(kind, variant={}){
    // Allow cancel: light → heavy, light → light (2-hit), light → special
    if(this.attack){
      const curKind = this.attack.kind;
      const aw = this.attackWindow();

      // Cancel window: during active or early recovery frames of current attack
      const canCancel = aw.active || (aw.recovery && this.attackF <= this.attack.startupF + this.attack.activeF + 3);

      if(canCancel && this.attackHasHit) {
        // Allowed cancel routes
        const allowed =
          (curKind === 'light' && (kind === 'heavy' || kind === 'light' || kind === 'low')) ||
          (curKind === 'light' && kind === 'special') ||
          (curKind === 'low' && kind === 'heavy');

        if(allowed && this.comboRoute.length < this.maxComboLength) {
          // Cancel into next move
          this.attack = null;
          this.attackF = 0;
          this.attackHasHit = false;
          // Fall through to start new attack below
        } else {
          return false;
        }
      } else {
        return false;
      }
    }

    if(this.hitstunF>0 || this.state==='ko' || this.state==='victory' || this.guardBroken) return false;

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
      hitstunF: m.hitstunF || (kind === 'heavy' ? 12 : kind === 'light' ? 6 : kind === 'low' ? 6 : kind === 'air' ? 8 : 9),
      ...m,
      ...variant,
    };
    this.attackF = 0;
    this.attackHasHit = false;
    this.comboRoute.push(kind);

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
      this.hp = Math.max(1, this.hp - applied);
      return { hit:true, armored:true, dmg:applied };
    }

    // shield armor
    if(this.shieldT>0 && this.shieldHits>0){
      this.shieldHits--;
      const applied = Math.ceil(dmg*0.5);
      this.hp = Math.max(1, this.hp - applied);
      return { hit:true, armored:true, dmg:applied };
    }

    // Guard broken = can't block
    if(this.guardBroken){
      return this._applyHit(dmg, type, from);
    }

    // blocking
    if(this.blocking!=='none'){
      let blocks = false;
      if(this.blocking==='stand' && (type==='mid' || type==='high' || type==='overhead')) blocks=true;
      if(this.blocking==='crouch' && type==='low') blocks=true;
      if(blocks){
        this.stats.blocks++;
        this.consecutiveBlocks++;

        // Guard break after 3 consecutive blocks
        if(this.consecutiveBlocks >= 3){
          this.guardBroken = true;
          this.guardBrokenT = 0.5; // 0.5s stun
          this.blocking = 'none';
          this.state = 'hit';
          this.consecutiveBlocks = 0;
          return { hit:false, guardBroken:true };
        }

        const chip = Math.ceil(dmg*0.25);
        // Chip can kill at ≤5% HP
        const canChipKill = this.hpPct <= 0.05;
        const applied = canChipKill ? chip : Math.min(chip, Math.max(0, this.hp-1));
        this.hp -= applied;
        return { hit:false, blocked:true, chip:applied };
      }
    }

    return this._applyHit(dmg, type, from);
  }

  _applyHit(dmg, type, from){
    this.hp = Math.max(0, this.hp - dmg);
    // Hitstun is set by combat.js based on the attacking move
    this.hitstunF = 9; // default, overridden by combat
    this.state='hit';
    this.attack=null;
    this.charging=false;
    this.chargePct=0;
    this.comboRoute = []; // reset combo chain
    this.consecutiveBlocks = 0; // reset guard break counter on hit
    return { hit:true, dmg };
  }

  update(dt, arena, gravMul){
    // last stand state
    this.lastStand = this.hpPct>0 && this.hpPct<0.2;

    // Guard broken timer
    if(this.guardBroken){
      this.guardBrokenT -= dt;
      if(this.guardBrokenT <= 0){
        this.guardBroken = false;
        this.guardBrokenT = 0;
        if(this.state === 'hit') this.state = 'idle';
      }
    }

    // timers
    if(this.hitstunF>0){
      this.hitstunF--;
      if(this.hitstunF<=0 && this.state==='hit') this.state='idle';
    }

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
        this.comboRoute = []; // reset combo chain on attack end
        this.state='idle';
      }
    }

    // Reset walk state
    if(this.state === 'walk' && !this.attack && this.hitstunF <= 0) {
      // Will be set back to 'walk' by walk() if still moving
      this.state = 'idle';
    }

    // movement physics
    const g = 1500 * (gravMul || 1);
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

    // velocity-based movement with smoother decay
    this.x += this.vx*dt;
    this.vx *= 0.85; // smoother at 60fps
    if(Math.abs(this.vx)<10) this.vx=0;
    if(this.state==='dash' && this.vx===0) this.state='idle';

    // walls
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
