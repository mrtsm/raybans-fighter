import { Fighter } from './fighter.js';
import { Combat, clamp, makeHitParticles } from './combat.js';
import { AI } from './ai.js';
import { Scoring } from './scoring.js';
import { FIGHTERS } from './data/fighters.js';

export class Fight {
  constructor({ renderer, input, audio, progression, p1Id, p2Id, difficulty, dailyMod=null }){
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.progression = progression;

    this.p1Def = FIGHTERS[p1Id];
    this.p2Def = FIGHTERS[p2Id];
    this.difficulty = difficulty;

    this.mods = dailyMod?.mod || {};

    this.arena = {
      leftWall: 20,
      rightWall: 580,
      floorY: 380,
      width: 560,
    };

    this.p1 = new Fighter(this.p1Def, -1);
    this.p2 = new Fighter(this.p2Def, +1);

    // daily modifiers
    if(this.mods.hpMul){
      this.p1.maxHp = Math.round(this.p1.maxHp*this.mods.hpMul);
      this.p2.maxHp = Math.round(this.p2.maxHp*this.mods.hpMul);
      this.p1.hp=this.p1.maxHp;
      this.p2.hp=this.p2.maxHp;
    }

    this.round = { p1:0, p2:0 };
    this.timer = 45;
    this.phase = 'intro';
    this.phaseT = 1.0;

    this.scoring = new Scoring();
    this.combat = new Combat({ arena:this.arena, renderer, audio, scoring:this.scoring, mods:this.mods });

    this.ai = new AI({ difficulty });

    this.events = [];
    this.matchTotals = { lights:0, heavies:0, grabs:0, specials:0, sigs:0, perfectDodges:0, blocks:0, timeoutWins:0, whiffPunishes:0, antiAirHeavies:0 };

    this.blockPunishAdvF = 0; // after blocking heavy
    this.lastMove = { wasJumpToLow:false, lastWasJumpAtk:false };

    this._roundStartTime = 0;
    this._t = 0;
    this._cameback = false;
  }

  start(){
    this.audio.playMusic('music_'+(this.p1.id==='blaze'?'blaze':this.p1.id==='granite'?'granite':this.p1.id==='shade'?'shade':this.p1.id==='volt'?'volt':'menu'));
    this.audio.play('sfx_round');
    this.audio.play(this.p1Def.voice.start);
    this.phase='intro';
    this.phaseT=1.0;
    this._roundStartTime=this._t;
  }

  _resetRoundPositions(){
    this.p1.x=160; this.p2.x=440;
    this.p1.y=this.arena.floorY; this.p2.y=this.arena.floorY;
    this.p1.onGround=true; this.p2.onGround=true;
    this.p1.vx=this.p2.vx=0;
    this.p1.vy=this.p2.vy=0;
    this.p1.attack=this.p2.attack=null;
    this.p1.hitstunF=this.p2.hitstunF=0;
    this.p1.blocking=this.p2.blocking='none';
    this.p1.crouching=this.p2.crouching=false;
    this.timer=45;
    this.phase='intro';
    this.phaseT=1.0;
    this.audio.play('sfx_round');
    this.audio.play(this.p1Def.voice.start);
    this._roundStartTime=this._t;
    this.lastMove = { wasJumpToLow:false, lastWasJumpAtk:false };
  }

  update(dt){
    this._t += dt;

    // last-stand music crossfade
    const anyLastStand = (this.p1.hpPct>0 && this.p1.hpPct<0.2) || (this.p2.hpPct>0 && this.p2.hpPct<0.2);
    if(anyLastStand && this.audio.musicKey!=='music_laststand') this.audio.playMusic('music_laststand');

    // daily quake
    if(this.mods.quake){
      if(Math.floor(this._t)%7===0 && (this._t%7)<dt){
        this.renderer.doShake(10,0.25);
        // stumble
        this.p1.hitstunF = Math.max(this.p1.hitstunF, 4);
        this.p2.hitstunF = Math.max(this.p2.hitstunF, 4);
      }
    }

    // phase
    if(this.phase==='intro'){
      this.phaseT -= dt;
      if(this.phaseT<=0){ this.phase='play'; }
    }

    if(this.phase==='between'){
      this.phaseT -= dt;
      if(this.phaseT<=0){
        if(this.round.p1>=2 || this.round.p2>=2){
          return this._endMatch();
        }
        this._resetRoundPositions();
      }
    }

    // timer
    if(this.phase==='play'){
      this.timer -= dt;
      if(this.timer<=0){
        this.timer=0;
        this._roundByTimeout();
      }
    }

    // input (player)
    const acts = this.input.consume().map(e=>e.action);
    this._frameActs = acts;
    this._applyPlayerInputs(acts);

    // AI inputs (opponent)
    if(this.phase==='play'){
      const aiActs = this.ai.update(dt, this.p2, this.p1, { aiCanSpecial: this.p2.momentum>=30 || this.p2.momentum>=100 });
      this._applyAiInputs(aiActs);
    }

    // resolve grab break window (player only)
    this._resolveGrabBreak();

    // update fighters
    this.p1.setFacingTo(this.p2);
    this.p2.setFacingTo(this.p1);

    this.p1.update(dt, this.arena);
    this.p2.update(dt, this.arena);

    // resolve melee
    const r1 = this.combat.resolveMelee(this.p1, this.p2, { isPlayer:true, lastMove:this.lastMove });
    const r2 = this.combat.resolveMelee(this.p2, this.p1, { isPlayer:false });

    if(r1){ console.log('[Combat] P1→P2:', r1.type, r1.kind||'', 'dist:', Math.abs(this.p1.x-this.p2.x).toFixed(0)); this._onCombatEvent(r1, this.p1, this.p2, true); }
    if(r2){ console.log('[Combat] P2→P1:', r2.type, r2.kind||'', 'dist:', Math.abs(this.p1.x-this.p2.x).toFixed(0)); this._onCombatEvent(r2, this.p2, this.p1, false); }

    this.combat.update(dt, this.p1, this.p2);
    this.renderer.updateParticles(dt);

    // check KO
    if(this.phase==='play'){
      if(this.p1.state==='ko' || this.p2.state==='ko'){
        this._ko();
      }
    }

    return null;
  }

  _applyPlayerInputs(acts){
    for(const a of acts){
      this.p1.pushAction(a);

      if(a==='down_hold'){
        if(this.p1.crouching) this.p1.startBlock('crouch');
        else this.p1.startBlock('stand');
        continue;
      }
      if(a==='down_release'){
        this.p1.stopBlock();
        continue;
      }
      if(this.phase!=='play') continue;

      if(a==='dash_left') this._dash(this.p1,-1);
      if(a==='dash_right') this._dash(this.p1,1);
      if(a==='jump') this.p1.startJump();
      if(a==='crouch') this.p1.startCrouch();

      // attacks
      if(a==='light'){
        if(!this.p1.onGround) { this.p1.startAttack('air'); this.lastMove.lastWasJumpAtk=true; }
        else if(this.p1.crouching) { this.p1.startAttack('low'); this.lastMove.wasJumpToLow=this.lastMove.lastWasJumpAtk; this.lastMove.lastWasJumpAtk=false; }
        else { this.p1.startAttack('light'); this.lastMove.lastWasJumpAtk=false; }
      }
      if(a==='heavy'){
        this.p1.startAttack('heavy');
        this.lastMove.lastWasJumpAtk=false;
      }
      if(a==='grab'){
        this.p1.startAttack('grab');
        this.lastMove.lastWasJumpAtk=false;
      }

      if(a==='special_charge_start'){
        this.p1.startCharge();
        this.audio.play('sfx_charge');
      }
      if(a==='special_release'){
        const held = this.p1.releaseCharge();
        if(held>=0.4) this._trySpecialOrSig(this.p1,this.p2,true,held);
      }
    }
  }

  _applyAiInputs(actions){
    for(const step of actions){
      const a=step.action;
      if(a==='down_hold'){ this.p2.startBlock('stand'); continue; }
      if(this.phase!=='play') continue;
      if(a==='dash_left') this._dash(this.p2,-1);
      if(a==='dash_right') this._dash(this.p2,1);
      if(a==='jump') this.p2.startJump();
      if(a==='crouch') this.p2.startCrouch();
      if(a==='light') this.p2.startAttack(this.p2.onGround?(this.p2.crouching?'low':'light'):'air');
      if(a==='low') this.p2.startAttack('low');
      if(a==='heavy') this.p2.startAttack('heavy');
      if(a==='grab') this.p2.startAttack('grab');
      if(a==='special'){
        // AI: instant charge+release
        this._trySpecialOrSig(this.p2,this.p1,false,0.6);
      }
    }
  }

  _dash(f, dir){
    // corner: cannot dash backward into wall
    const towardWall = (dir<0 && f.x<=this.arena.leftWall+1) || (dir>0 && f.x>=this.arena.rightWall-1);
    if(towardWall) return;
    const ifr = 4 + (f.lastStand?2:0);
    f.startDash(dir, ifr);
    this.audio.play('sfx_dodge');
  }

  _trySpecialOrSig(f, opp, isPlayer, held){
    const rank = this.progression.masteryRank(f.id);

    const canSig = f.momentum>=100 && held>=1.0;
    if(canSig){
      f.momentum = 0;
      f.stats.sigs++;
      const res=this.combat.signature(f, opp);
      if(isPlayer){
        this.matchTotals.sigs++;
        this.scoring.onHit({ kind:'signature', points:1000, dmg:25 });
        this.events.push({type:'signature_landed'});
      }
      this.renderer.doFlash(f.color,0.35);
      return;
    }

    if(f.momentum < 30) return;
    f.momentum -= 30;
    f.stats.specials++;
    const out = this.combat.fireSpecial(f, opp, rank);
    if(isPlayer){
      this.matchTotals.specials++;
      this.events.push({type:'momentum', value:f.momentum});
      this.audio.play(f.def.voice.special);
    }
  }

  _momentumGain(f, amt){
    const mul = (f.lastStand?1.5:1) * (this.mods.momentumMul||1);
    f.momentum = clamp(f.momentum + Math.round(amt*mul), 0, 100);
    if(f.momentum>=100) this.events.push({type:'momentum', value:100});
  }

  _momentumDrain(f, amt){
    f.momentum = clamp(f.momentum - amt, 0, 100);
  }

  _onCombatEvent(ev, attacker, defender, isPlayer){
    if(ev.type==='hit'){
      this._momentumGain(attacker, 8);
      if(ev.whiffPunish){
        attacker.stats.whiffPunishes++;
        this._momentumGain(attacker, 12);
      }
      if(ev.antiAirHeavy) attacker.stats.antiAirHeavies++;

      this._momentumDrain(defender, 10);
      if(isPlayer){
        this.events.push({type:'streak', value:ev.streak});
        if(ev.kind==='light') this.matchTotals.lights++;
        if(ev.kind==='heavy') this.matchTotals.heavies++;
        if(ev.kind==='grab') this.matchTotals.grabs++;
        if(ev.whiffPunish) this.matchTotals.whiffPunishes++;
        if(ev.antiAirHeavy) this.matchTotals.antiAirHeavies++;
      }
    }

    if(ev.type==='blocked'){
      this._momentumDrain(defender, 2);
      this._momentumDrain(attacker, 1);
      if(defender===this.p1) this.matchTotals.blocks++;
      if(ev.heavy){
        this.blockPunishAdvF = 4;
        this.events.push({type:'block_counter'});
      }
    }

    if(ev.type==='dodged' && ev.perfect){
      this._momentumGain(defender, 10);
      if(defender===this.p1) this.matchTotals.perfectDodges++;
    }

    if(ev.type==='grabbed'){
      // break window
      defender._grabbed = { by: attacker, f:8, dmg:ev.dmg, throwPx:ev.throwPx, toCorner:ev.toCorner };
    }
  }

  _resolveGrabBreak(){
    // player can break if grabbed
    const g=this.p1._grabbed;
    if(!g) return;
    const pressedLight = (this._frameActs||[]).includes('light');
    if(pressedLight){
      this.p1._grabbed=null;
      this.audio.play('sfx_block');
      return;
    }
    g.f--;
    if(g.f<=0){
      // apply grab
      this.p1._grabbed=null;
      const dmg = Math.round(g.dmg*(this.mods.dmgMul||1));
      this.p1.takeHit({ dmg, type:'mid', from:g.by });
      this.p1.x = clamp(this.p1.x + g.by.facing*g.throwPx, this.arena.leftWall, this.arena.rightWall);
      this.audio.play('sfx_grab');
      this.renderer.addParticles(makeHitParticles(g.by.color, this.p1.x, this.p1.y-70, 10));
    }
  }

  _ko(){
    this.phase='between';
    this.phaseT=2.0;
    this.audio.play('sfx_ko');
    this.renderer.doShake(14,0.45);
    // slow-mo
    this.combat.slowmoT = 0.5;

    // decide winner
    const p1Dead=this.p1.hp<=0;
    const p2Dead=this.p2.hp<=0;

    if(p2Dead && !p1Dead){
      this.round.p1++;
      this.scoring.onRoundWin({ byTimeout:false, perfect:this.scoring.roundDamageTaken===0, under20:(this._t-this._roundStartTime)<20 });
    } else if(p1Dead && !p2Dead){
      this.round.p2++;
    }

    this.events.push({ type:'ko', opponentCornered: (this.p2.x<=this.arena.leftWall+1||this.p2.x>=this.arena.rightWall-1), by:(p2Dead?'player':'ai') });
  }

  _roundByTimeout(){
    this.phase='between';
    this.phaseT=2.0;
    const p1Hp=this.p1.hp;
    const p2Hp=this.p2.hp;

    if(p1Hp>p2Hp){
      this.round.p1++;
      this.scoring.onRoundWin({ byTimeout:true, perfect:this.scoring.roundDamageTaken===0, under20:(this._t-this._roundStartTime)<20 });
      this.scoring.timeoutWin=true;
      this.matchTotals.timeoutWins++;
    } else if(p2Hp>p1Hp){
      this.round.p2++;
    } else {
      // attacker wins: who dealt more damage this round
      if(this.scoring.roundDamageDealt >= this.scoring.roundDamageTaken) this.round.p1++;
      else this.round.p2++;
    }
  }

  _endMatch(){
    const win = this.round.p1>this.round.p2;

    // xp
    const mod = { easy:1, normal:1.5, hard:2, nightmare:3 }[this.difficulty] || 1.5;
    let xp = win ? 200 : 50;
    xp = Math.round(xp*mod);
    if(this.scoring.roundDamageTaken===0 && win) xp += 100;

    // bonuses
    const flawless = win && this.scoring.roundDamageTaken===0;
    const cameback = win && (this.p1.hpPct<0.2);
    if(cameback) this._cameback=true;

    if(win) this.scoring.onMatchWin({ flawless, comeback:cameback });

    // totals
    this.progression.addTotals({
      lights:this.matchTotals.lights,
      heavies:this.matchTotals.heavies,
      grabs:this.matchTotals.grabs,
      specials:this.matchTotals.specials,
      sigs:this.matchTotals.sigs,
      blocks:this.matchTotals.blocks,
      perfectDodges:this.matchTotals.perfectDodges,
      timeoutWins:this.matchTotals.timeoutWins,
    });
    this.events.push({type:'match_stat', whiffPunishes:this.matchTotals.whiffPunishes});
    this.events.push({type:'round_stat', antiAirHeavies:this.matchTotals.antiAirHeavies});

    const events = this.events.slice();
    events.push({type:'match_end', win, flawless, cameback, difficulty:this.difficulty, winHpPct:Math.round(this.p1.hpPct*100) });

    this.progression.awardMatch({ fighterId:this.p1.id, win, difficulty:this.difficulty, xp, score:this.scoring.score, events });

    if(this.mods && Object.keys(this.mods).length) this.progression.setDailyCompleted();

    if(win){ this.audio.play(this.p1Def.voice.win); this.audio.play('music_victory'); }
    else { this.audio.play(this.p1Def.voice.lose); this.audio.play('music_defeat'); }

    return {
      type:'match_end',
      payload:{
        win,
        rounds:{...this.round},
        score:this.scoring.score,
        xp,
        fighterId:this.p1.id,
        overallBest:this.progression.save.overallBest,
        fighterBest:this.progression.save.fighters[this.p1.id].best,
        playerLevel:this.progression.playerLevel,
        unlocks:this.progression.unlocks(),
        daily:this.progression.save.daily,
        achievements:this.progression.save.achievements,
        difficulty:this.difficulty,
      }
    };
  }

  render(){
    this.renderer.beginScene();

    // arena floor
    const c=this.renderer.ctx;
    c.fillStyle='rgba(255,255,255,0.08)';
    c.fillRect(this.arena.leftWall, this.arena.floorY+110, this.arena.width, 4);

    // fighters
    // invis effect (shade variant)
    const p2a=this.p2._invisT>0; if(p2a){ this.p2._invisT-=1/30; }
    const p1a=this.p1._invisT>0; if(p1a){ this.p1._invisT-=1/30; }

    if(!p1a) this.renderer.drawFighter(this.p1);
    if(!p2a) this.renderer.drawFighter(this.p2);

    // projectiles
    for(const pr of this.combat.projectiles){
      c.fillStyle=pr.color;
      c.globalAlpha=0.9;
      c.beginPath();
      c.arc(pr.x, pr.y, 8, 0, Math.PI*2);
      c.fill();
      c.globalAlpha=1;
    }

    this.renderer.drawParticles();

    const banner = this.phase==='intro'?'FIGHT!':(this.phase==='between'?'ROUND END':'');

    this.renderer.drawHud({
      p1:{ name:this.p1.name, hpPct:this.p1.hpPct, momentum:this.p1.momentum, color:this.p1.color },
      p2:{ name:this.p2.name, hpPct:this.p2.hpPct, momentum:this.p2.momentum, color:this.p2.color },
      rounds:this.round,
      timer:this.timer,
      matchScore:this.scoring.score,
      banner,
    });

    this.renderer.endScene();
  }
}
