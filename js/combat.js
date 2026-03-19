export function clamp(n,a,b){return Math.max(a,Math.min(b,n));}

export function makeHitParticles(color, x,y, n=8){
  const out=[];
  for(let i=0;i<n;i++){
    out.push({
      x,y,
      vx:(Math.random()*2-1)*280,
      vy:(Math.random()*-1)*320,
      g:900,
      s:2 + (Math.random()*3|0),
      t0:0.25 + Math.random()*0.18,
      t:0.25 + Math.random()*0.18,
      color,
    });
  }
  return out;
}

export class Combat {
  constructor({ arena, renderer, audio, scoring, mods }){
    this.arena = arena;
    this.renderer = renderer;
    this.audio = audio;
    this.scoring = scoring;
    this.mods = mods || {};

    this.projectiles = [];
    this.slowmoT = 0;
    this.slowmoScale = 1;

    // Damage numbers
    this.damageNumbers = [];
  }

  update(dt, p1, p2){
    // projectiles
    for(const pr of this.projectiles){
      pr.x += pr.vx*dt;
      const target = pr.from===p1? p2 : p1;
      const dist = Math.abs(pr.x - target.x);
      const isHigh = pr.high;
      const avoided = (target.crouching && isHigh) || (!target.onGround && isHigh);
      if(dist < 28 && !avoided && target.state!=='ko'){
        const res = target.takeHit({ dmg: pr.dmg, type: pr.type, from: pr.from });
        if(res.hit && !res.blocked){
          this.renderer.addParticles(makeHitParticles(pr.color, target.x, target.y-60, 12));
          this._spawnHitSpark(target.x, target.y-60, 50, pr.color);
          this.audio.play(pr.sfx, { variations: true });
          this.renderer.doShake(5, 0.18);
          this.renderer.doFreeze(3);
          this._spawnDamageNumber(target.x, target.y-80, pr.dmg, false);
          if(pr.from===p1){
            this.scoring.onHit({ kind:'special', points:400, dmg:pr.dmg });
          }
        } else if(res.blocked){
          this.audio.play('sfx_block', { variations: true });
          this.renderer.doShake(3, 0.10);
        }
        pr.dead=true;
      }
      if(pr.x < this.arena.leftWall-40 || pr.x>this.arena.rightWall+40) pr.dead=true;
    }
    this.projectiles = this.projectiles.filter(p=>!p.dead);

    if(this.slowmoT>0) this.slowmoT-=dt;

    // Update damage numbers
    for(const dn of this.damageNumbers){
      dn.t -= dt;
      dn.y += dn.vy * dt;
      dn.vy -= 80 * dt; // decelerate upward
      dn.scale = Math.min(1.2, dn.scale + dt * 3);
    }
    this.damageNumbers = this.damageNumbers.filter(d => d.t > 0);
  }

  _spawnHitSpark(x, y, size, color){
    this.renderer.addHitSpark({ x, y, size, color, t: 0.15 });
  }

  _spawnDamageNumber(x, y, value, isCrit){
    this.damageNumbers.push({
      x: x + (Math.random()-0.5)*20,
      y,
      value,
      color: isCrit ? '#ffdd44' : '#ffffff',
      t: 0.8,
      vy: -100,
      scale: 0.5,
      isCrit,
    });
  }

  resolveMelee(attacker, defender, { isPlayer=false, lastMove }={}){
    const aw = attacker.attackWindow();
    if(!aw.active) return null;
    if(attacker.attackHasHit) return null;

    const a = aw.a;

    if(a.teleportPreHitPx){
      attacker.x = clamp(attacker.x + attacker.facing*a.teleportPreHitPx, this.arena.leftWall, this.arena.rightWall);
    }

    const dist = Math.abs(attacker.x - defender.x);
    const inRange = dist <= a.range;

    if(!inRange) return null;

    const antiAirHeavy = (a.kind==='heavy' && a.antiAir && !defender.onGround);

    // grab is unblockable, with break window
    if(a.kind==='grab'){
      if(defender.hitstunF>0 || defender.state==='ko') return null;
      attacker.attackHasHit=true;
      return { type:'grabbed', attacker, defender, dmg:a.dmg, throwPx:a.throwPx, toCorner:!!a.toCorner };
    }

    attacker.attackHasHit = true;

    const dmgBase = a.dmg;
    const dmg = Math.round(dmgBase*(this.mods.dmgMul||1));
    const res = defender.takeHit({ dmg, type:a.type, from: attacker });

    // PARRY: defender successfully parried — stun the attacker
    if (res.parried) {
      attacker.parryStunF = 18; // attacker stunned for 18 frames (~300ms)
      attacker.attack = null;   // cancel attacker's attack
      attacker.hitstunF = 18;   // put attacker in hitstun
      attacker.state = 'hit';
      attacker.comboRoute = [];

      // Parry visual + audio
      this.audio.play('sfx_block', { vol: 1.0, rate: 1.5 }); // high-pitched clang
      this.renderer.doFreeze(4);
      this.renderer.doShake(5, 0.12);
      this.renderer.addParryEffect(defender.x, defender.y - 60);
      this._spawnDamageNumber(defender.x, defender.y - 80, 0, false); // "PARRY" would be nice but 0 dmg for now

      if (defender === (this._isPlayerCombat ? this._playerRef : null)) {
        // momentum gain for player parry
      }

      return { type: 'parried', attacker, defender };
    }

    const whiffPunish = !!(defender.attack && defender.attackWindow().recovery);

    if(res.hit && !res.blocked){
      // Set hitstun based on the attacking move
      const moveHitstun = a.hitstunF || 9;
      defender.hitstunF = moveHitstun;

      // Velocity-based knockback (not teleport)
      const knockbackVel = a.kind === 'heavy' ? 350 : a.kind === 'light' ? 150 : a.kind === 'low' ? 120 : 200;
      defender.vx += attacker.facing * knockbackVel;

      // Heavy/special launches (small upward pop)
      if(a.kind === 'heavy' && a.pushPx){
        defender.vy = -100;
        if(defender.onGround) {
          defender.onGround = false;
        }
      }

      // Hit particles scaled to attack type
      const particleCount = a.kind==='heavy' ? 16 : a.kind==='light' ? 8 : 10;
      const hitX = (attacker.x + defender.x) / 2;
      const hitY = defender.y - 60;
      this.renderer.addParticles(makeHitParticles(attacker.color, hitX, hitY, particleCount));

      // Hit spark
      const sparkSize = a.kind==='heavy' ? 60 : a.kind==='light' ? 30 : 40;
      this._spawnHitSpark(hitX, hitY, sparkSize, attacker.color);

      // Hit freeze frames
      const freezeFrames = a.kind==='heavy' ? 4 : a.kind==='light' ? 2 : 3;
      this.renderer.doFreeze(freezeFrames);

      // Screen shake scaled to hit power
      const shakeIntensity = a.kind==='heavy' ? 8 : a.kind==='light' ? 3 : 5;
      const shakeTime = a.kind==='heavy' ? 0.20 : 0.12;
      this.renderer.doShake(shakeIntensity, shakeTime);

      // Hit sound with pitch variation
      this.audio.play(a.kind==='heavy'?'sfx_heavy':'sfx_light', { variations: true });

      // Damage number
      this._spawnDamageNumber(defender.x, defender.y - 80, dmg, a.kind === 'heavy');

      // scoring (player only)
      if(isPlayer){
        const kind=a.kind;
        const pts = kind==='heavy'?250 : 100;
        const info=this.scoring.onHit({ kind, points:pts, dmg, whiffPunish, antiAirHeavy, mixBonus:lastMove?.wasJumpToLow });
        return { type:'hit', kind:a.kind, res, whiffPunish, antiAirHeavy, streak:info.streak, dmg };
      }
      return { type:'hit', kind:a.kind, res, whiffPunish, antiAirHeavy, dmg };
    }

    if(res.guardBroken){
      // Guard break!
      this.audio.play('sfx_heavy');
      this.renderer.doShake(10, 0.25);
      this.renderer.doFlash('#ff4444', 0.15);
      this.renderer.doFreeze(6);
      this._spawnHitSpark(defender.x, defender.y - 60, 70, '#ff4444');
      if(isPlayer) this.scoring.onGuardBreak();
      return { type:'guard_break' };
    }

    if(res.blocked){
      this.audio.play('sfx_block', { variations: true });
      this.renderer.doShake(4, 0.12);
      this.renderer.doFreeze(1);
      defender.stats.blocks++;
      return { type:'blocked', chip:res.chip, heavy:(a.kind==='heavy') };
    }

    if(res.dodged){
      this.audio.play(res.perfect?'sfx_perfectdodge':'sfx_dodge');
      return { type:'dodged', perfect:res.perfect };
    }

    return null;
  }

  fireSpecial(fighter, opp, masteryRank){
    const id=fighter.id;
    if(id==='blaze'){
      const base=10*(this.mods.dmgMul||1);
      if(masteryRank==='gold' || masteryRank==='diamond' || masteryRank==='master'){
        this.projectiles.push({ x:fighter.x + fighter.facing*40, y:fighter.y-70, vx:fighter.facing*320, r:10, dmg:Math.round(base*0.6), from:fighter, type:'high', high:true, color:fighter.color, sfx:'sfx_fire' });
        this.projectiles.push({ x:fighter.x + fighter.facing*40, y:fighter.y+40, vx:fighter.facing*320, r:10, dmg:Math.round(base*0.6), from:fighter, type:'low', high:false, color:fighter.color, sfx:'sfx_fire' });
      } else {
        const speed = (masteryRank==='silver') ? 420 : 320;
        this.projectiles.push({ x:fighter.x + fighter.facing*40, y:fighter.y-50, vx:fighter.facing*speed, r:10, dmg:Math.round(base), from:fighter, type:'high', high:true, color:fighter.color, sfx:'sfx_fire' });
      }
      this.audio.play('sfx_fire');
      this.renderer.doShake(4, 0.15);
      return { kind:'projectile' };
    }

    if(id==='volt'){
      const base=8*(this.mods.dmgMul||1);
      const speed=520;
      const bounces = (masteryRank==='gold'||masteryRank==='diamond'||masteryRank==='master') ? 1 : 0;
      this.projectiles.push({ x:fighter.x + fighter.facing*40, y:fighter.y-55, vx:fighter.facing*speed, r:10, dmg:Math.round(base), from:fighter, type:'high', high:true, color:fighter.color, sfx:'sfx_lightning', stunF:3, bounces });
      this.audio.play('sfx_lightning');
      this.renderer.doShake(4, 0.15);
      return { kind:'projectile' };
    }

    if(id==='shade'){
      fighter.x = clamp(opp.x - opp.facing*60, this.arena.leftWall, this.arena.rightWall);
      fighter.facing *= -1;
      if(masteryRank==='silver' || masteryRank==='gold'||masteryRank==='diamond'||masteryRank==='master'){
        fighter._invisT = (masteryRank!=='silver')?0.0:0.3;
      }
      if(masteryRank==='gold'||masteryRank==='diamond'||masteryRank==='master'){
        const dmg=Math.round(5*(this.mods.dmgMul||1));
        opp.takeHit({ dmg, type:'mid', from:fighter });
        this._spawnHitSpark(opp.x, opp.y-60, 40, fighter.color);
        this._spawnDamageNumber(opp.x, opp.y-80, dmg, false);
      }
      this.audio.play('sfx_shadow');
      return { kind:'teleport' };
    }

    if(id==='granite'){
      fighter.shieldT=1.0;
      fighter.shieldHits = (masteryRank==='gold'||masteryRank==='diamond'||masteryRank==='master')?3:2;
      this.audio.play('sfx_rock');
      return { kind:'shield', reflect:(masteryRank==='silver'||masteryRank==='gold'||masteryRank==='diamond'||masteryRank==='master') };
    }

    return { kind:'none' };
  }

  signature(fighter, opp){
    this.audio.play('sfx_signature');
    this.renderer.doFlash(fighter.color,0.35);
    this.renderer.doShake(14,0.50);
    this.renderer.doFreeze(6);

    const dmg = Math.round(25*(this.mods.dmgMul||1));

    if(fighter.id==='granite'){
      if(opp.onGround){
        opp.takeHit({ dmg, type:'mid', from:fighter });
        this._spawnHitSpark(opp.x, opp.y-60, 100, fighter.color);
        this._spawnDamageNumber(opp.x, opp.y-80, dmg, true);
        opp.vx += fighter.facing * 400;
        return { hit:true, avoidable:'jump' };
      }
      return { hit:false, avoidable:'jump' };
    }

    if(fighter.id==='shade'){
      opp.blocking='none';
      opp.takeHit({ dmg, type:'mid', from:fighter });
      this._spawnHitSpark(opp.x, opp.y-60, 100, fighter.color);
      this._spawnDamageNumber(opp.x, opp.y-80, dmg, true);
      opp.vx += fighter.facing * 350;
      return { hit:true, unavoidable:true };
    }

    const res = opp.takeHit({ dmg, type:'mid', from:fighter });
    if(res.hit && !res.blocked){
      this._spawnHitSpark(opp.x, opp.y-60, 100, fighter.color);
      this._spawnDamageNumber(opp.x, opp.y-80, dmg, true);
      opp.vx += fighter.facing * 400;
    }
    return { hit:res.hit && !res.blocked };
  }
}
