import { MASTERIES } from './data/fighters.js';
import { ACHIEVEMENTS } from './data/achievements.js';

const LS_KEY='raybans_fighter_save_v1';

function todayKey(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function clamp(n,a,b){return Math.max(a,Math.min(b,n));}

export class Progression{
  constructor(){
    this.save = this._load();
  }

  _load(){
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      try{ return JSON.parse(raw); }catch{}
    }
    return {
      fighters:{ blaze:{xp:0, best:0}, granite:{xp:0, best:0}, shade:{xp:0, best:0}, volt:{xp:0, best:0} },
      overallBest:0,
      totals:{ lights:0, heavies:0, grabs:0, specials:0, perfectDodges:0, blocks:0, timeoutWins:0, sigs:0 },
      wonWith:{ blaze:false, granite:false, shade:false, volt:false },
      achievements:{},
      daily:{ date: todayKey(), best:0, completed:false },
      meta:{ firstWinDate:null }
    };
  }

  _persist(){
    localStorage.setItem(LS_KEY, JSON.stringify(this.save));
  }

  get totalXp(){
    return Object.values(this.save.fighters).reduce((a,f)=>a+f.xp,0);
  }

  get playerLevel(){
    return clamp(1 + Math.floor(this.totalXp/2000), 1, 50);
  }

  unlocks(){
    const lvl=this.playerLevel;
    return {
      volt: lvl>=10,
      hard: lvl>=15,
      nightmare: lvl>=25,
    };
  }

  masteryRank(fighterId){
    const xp=this.save.fighters[fighterId]?.xp ?? 0;
    const ranks = Object.entries(MASTERIES).sort((a,b)=>a[1].xp-b[1].xp);
    let rank='bronze';
    for(const [k,v] of ranks){ if(xp>=v.xp) rank=k; }
    return rank;
  }

  awardMatch({ fighterId, win, difficulty, xp, score, events }){
    const s=this.save;
    const f=s.fighters[fighterId];
    const prevRank = this.masteryRank(fighterId);
    f.xp += xp;

    f.best = Math.max(f.best, score);
    s.overallBest = Math.max(s.overallBest, score);

    const t=todayKey();
    if(s.daily.date!==t){ s.daily={ date:t, best:0, completed:false }; }
    s.daily.best = Math.max(s.daily.best, score);

    if(win){
      if(s.meta.firstWinDate!==t){
        s.meta.firstWinDate=t;
        events.push({type:'first_win_day'});
      }
    }

    if(win) s.wonWith[fighterId]=true;

    const newRank=this.masteryRank(fighterId);
    if(newRank!==prevRank){
      events.push({type:'mastery', fighterId, rank:newRank});
    }

    if(['blaze','granite','shade','volt'].every(id=>this.masteryRank(id)>='silver')){
      events.push({type:'meta', kind:'silver_all'});
    }
    if(Object.values(s.wonWith).every(Boolean)){
      events.push({type:'meta', kind:'won_all_fighters'});
    }

    events.push({type:'player_level', level:this.playerLevel});

    this._checkAchievements(events);
    this._persist();
  }

  setDailyCompleted(){
    const s=this.save;
    const t=todayKey();
    if(s.daily.date!==t) s.daily={date:t,best:0,completed:false};
    if(!s.daily.completed){
      s.daily.completed=true;
      this._checkAchievements([{type:'daily_complete'}]);
      this._persist();
    }
  }

  addTotals(delta){
    const t=this.save.totals;
    for(const [k,v] of Object.entries(delta)) t[k]=(t[k]||0)+v;
    this._checkAchievements([{type:'totals', ...this.save.totals}]);
    this._persist();
  }

  _checkAchievements(events){
    const s=this.save;
    for(const e of events){
      for(const a of ACHIEVEMENTS){
        if(s.achievements[a.id]) continue;
        try{
          if(a.check(s,e)) s.achievements[a.id] = { unlockedAt: Date.now() };
        }catch{}
      }
    }
  }

  // Legacy dailyChallenge() for backward compatibility
  dailyChallenge(){
    const dow = new Date().getDay(); // 0=Sun
    const challenges = [
      { id:'boss', name:'Boss Rush Sunday', desc:'AI is at maximum difficulty.', mod:{ bossRush:true } },
      { id:'speed', name:'Double Speed Monday', desc:'Everything moves 2× speed!', mod:{ speedMul:2 } },
      { id:'oneshot', name:'One-Hit KO Tuesday', desc:'One clean hit ends it.', mod:{ dmgMul:100, hpMul:0.01 } },
      { id:'mirror', name:'Mirror Match Wednesday', desc:'Both fighters are the same.', mod:{ mirror:true } },
      { id:'giant', name:'Giant Mode Thursday', desc:'Fighters are 1.5× size!', mod:{ scaleMul:1.5 } },
      { id:'tiny', name:'Tiny Fighters Friday', desc:'Fighters shrunk to 0.6× size!', mod:{ scaleMul:0.6, speedMul:1.3 } },
      { id:'chaos', name:'Random Chaos Saturday', desc:'Low gravity + double speed + no block!', mod:{ gravMul:0.4, speedMul:1.5, noBlock:true } },
    ];
    return challenges[dow];
  }

  // Win streak tracking
  get winStreak(){
    return this.save._winStreak || 0;
  }

  get bestStreak(){
    return this.save._bestStreak || 0;
  }

  addWin(){
    if(!this.save._winStreak) this.save._winStreak = 0;
    if(!this.save._bestStreak) this.save._bestStreak = 0;
    this.save._winStreak++;
    if(this.save._winStreak > this.save._bestStreak){
      this.save._bestStreak = this.save._winStreak;
    }
    this._persist();
  }

  resetStreak(){
    this.save._winStreak = 0;
    this._persist();
  }

  streakDifficulty(){
    const s = this.winStreak;
    if(s >= 10) return 0.95; // brutal
    if(s >= 5)  return 0.75; // hard
    if(s >= 3)  return 0.55; // medium-hard
    return 0.35;             // normal
  }

  streakTitle(){
    const s = this.winStreak;
    if(s >= 10) return 'LEGENDARY';
    if(s >= 5)  return 'Unstoppable';
    if(s >= 3)  return 'On Fire';
    if(s >= 1)  return 'Warming Up';
    return '';
  }

  streakMultiplier(){
    const s = this.winStreak;
    if(s >= 10) return 3.0;
    if(s >= 5)  return 2.0;
    if(s >= 3)  return 1.5;
    return 1.0;
  }
}
