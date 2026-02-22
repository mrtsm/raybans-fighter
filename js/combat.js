export function clamp(n,a,b){return Math.max(a,Math.min(b,n));}

export function makeHitParticles(color, x,y, n=8){
  const out=[];
  for(let i=0;i<n;i++){
    out.push({
      x,y,
      vx:(Math.random()*2-1)*220,
      vy:(Math.random()*-1)*260,
      g:900,
      s:2 + (Math.random()*2|0),
      t0:0.22 + Math.random()*0.15,
      t:0.22 + Math.random()*0.15,
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

    this.projectiles = []; // {x,y,vx,r,dmg,from,type,key,high:true}
    this.slowmoT = 0;
  }

  update(dt, p1, p2){
    // projectiles
    for(const pr of this.projectiles){
      pr.x += pr.vx*dt;
      // hit check
      const target = pr.from===p1? p2 : p1;
      const dist = Math.abs(pr.x - target.x);
      const isHigh = pr.high;
      const avoided = (target.crouching && isHigh) || (!target.onGround && isHigh);
      if(dist < 28 && !avoided && target.state!=='ko'){
        const res = target.takeHit({ dmg: pr.dmg, type: pr.type, from: pr.from });
        if(res.hit && !res.blocked){
          this.renderer.addParticles(makeHitParticles(pr.color, target.x, target.y-60, 10));
          this.audio.play(pr.sfx);
          if(pr.from===p1){
            this.scoring.onHit({ kind:'special', points:400, dmg:pr.dmg });
          }
        } else if(res.blocked){
          this.audio.play('sfx_block');
        }
        pr.dead=true;
      }
      if(pr.x < this.arena.leftWall-40 || pr.x>this.arena.rightWall+40) pr.dead=true;
    }
    this.projectiles = this.projectiles.filter(p=>!p.dead);

    if(this.slowmoT>0) this.slowmoT-=dt;
  }

  resolveMelee(attacker, defender, { isPlayer=false, lastMove }={}){
    const aw = attacker.attackWindow();
    if(!aw.active) return null;
    if(attacker.attackHasHit) return null;

    const a = aw.a;

    // special cases
    if(a.teleportPreHitPx){
      attacker.x = clamp(attacker.x + attacker.facing*a.teleportPreHitPx, this.arena.leftWall, this.arena.rightWall);
    }

    const dist = Math.abs(attacker.x - defender.x);
    const inRange = dist <= a.range;

    if(!inRange) return null;

    // anti-air heavy tracking
    const antiAirHeavy = (a.kind==='heavy' && a.antiAir && !defender.onGround);

    // grab is unblockable, with break window
    if(a.kind==='grab'){
      if(defender.hitstunF>0 || defender.state==='ko') return null;
      attacker.attackHasHit=true;
      // give defender 8 frames to break (handled in fight)
      return { type:'grabbed', attacker, defender, dmg:a.dmg, throwPx:a.throwPx, toCorner:!!a.toCorner };
    }

    // normal hit
    attacker.attackHasHit = true;

    const dmgBase = a.dmg;
    const dmg = Math.round(dmgBase*(this.mods.dmgMul||1));
    const res = defender.takeHit({ dmg, type:a.type, from: attacker });

    const whiffPunish = !!(defender.attack && defender.attackWindow().recovery);

    if(res.hit && !res.blocked){
      // on-hit effects
      this.renderer.addParticles(makeHitParticles(attacker.color, defender.x, defender.y-60, a.kind==='heavy'?14:8));
      this.audio.play(a.kind==='heavy'?'sfx_heavy':'sfx_light');
      if(a.kind==='heavy') this.renderer.doShake(8,0.20);

      // spacing effects
      if(a.pushPx){
        defender.x = clamp(defender.x + attacker.facing*a.pushPx, this.arena.leftWall, this.arena.rightWall);
      }
      if(a.pullPx){
        defender.x = clamp(defender.x - attacker.facing*a.pullPx, this.arena.leftWall, this.arena.rightWall);
      }

      // scoring (player only)
      if(isPlayer){
        const kind=a.kind;
        const pts = kind==='heavy'?250 : 100;
        const info=this.scoring.onHit({ kind, points:pts, dmg, whiffPunish, antiAirHeavy, mixBonus:lastMove?.wasJumpToLow });
        return { type:'hit', kind:a.kind, res, whiffPunish, antiAirHeavy, streak:info.streak };
      }
      return { type:'hit', kind:a.kind, res, whiffPunish, antiAirHeavy };
    }

    if(res.blocked){
      this.audio.play('sfx_block');
      defender.stats.blocks++;
      // blocking drains momentum handled by fight
      // after blocking a heavy: 4 frame advantage (handled by fight as blockAdvF)
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
        // high and low
        this.projectiles.push({ x:fighter.x + fighter.facing*40, y:fighter.y-70, vx:fighter.facing*320, r:10, dmg:Math.round(base*0.6), from:fighter, type:'high', high:true, color:fighter.color, sfx:'sfx_fire' });
        this.projectiles.push({ x:fighter.x + fighter.facing*40, y:fighter.y+40, vx:fighter.facing*320, r:10, dmg:Math.round(base*0.6), from:fighter, type:'low', high:false, color:fighter.color, sfx:'sfx_fire' });
      } else {
        const speed = (masteryRank==='silver') ? 420 : 320;
        this.projectiles.push({ x:fighter.x + fighter.facing*40, y:fighter.y-50, vx:fighter.facing*speed, r:10, dmg:Math.round(base), from:fighter, type:'high', high:true, color:fighter.color, sfx:'sfx_fire' });
      }
      this.audio.play('sfx_fire');
      return { kind:'projectile' };
    }

    if(id==='volt'){
      const base=8*(this.mods.dmgMul||1);
      const speed=520;
      const bounces = (masteryRank==='gold'||masteryRank==='diamond'||masteryRank==='master') ? 1 : 0;
      this.projectiles.push({ x:fighter.x + fighter.facing*40, y:fighter.y-55, vx:fighter.facing*speed, r:10, dmg:Math.round(base), from:fighter, type:'high', high:true, color:fighter.color, sfx:'sfx_lightning', stunF:3, bounces });
      this.audio.play('sfx_lightning');
      return { kind:'projectile' };
    }

    if(id==='shade'){
      // teleport behind
      fighter.x = clamp(opp.x - opp.facing*60, this.arena.leftWall, this.arena.rightWall);
      fighter.facing *= -1;
      if(masteryRank==='silver' || masteryRank==='gold'||masteryRank==='diamond'||masteryRank==='master'){
        fighter._invisT = (masteryRank!=='silver')?0.0:0.3;
      }
      if(masteryRank==='gold'||masteryRank==='diamond'||masteryRank==='master'){
        const dmg=Math.round(5*(this.mods.dmgMul||1));
        opp.takeHit({ dmg, type:'mid', from:fighter });
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
    this.renderer.doFlash(fighter.color,0.25);
    this.renderer.doShake(12,0.45);

    // per-fighter signature behavior
    const dmg = Math.round(25*(this.mods.dmgMul||1));

    if(fighter.id==='granite'){
      // Avalanche: must jump to avoid
      if(opp.onGround){
        opp.takeHit({ dmg, type:'mid', from:fighter });
        return { hit:true, avoidable:'jump' };
      }
      return { hit:false, avoidable:'jump' };
    }

    if(fighter.id==='shade'){
      // Eclipse: can't see or block
      opp.blocking='none';
      opp.takeHit({ dmg, type:'mid', from:fighter });
      return { hit:true, unavoidable:true };
    }

    // Blaze/Volt: rush / cage — blockable as mid
    const res = opp.takeHit({ dmg, type:'mid', from:fighter });
    return { hit:res.hit && !res.blocked };
  }
}
