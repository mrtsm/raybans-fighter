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
    // 1..50
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

    // highscores
    f.best = Math.max(f.best, score);
    s.overallBest = Math.max(s.overallBest, score);

    // daily
    const t=todayKey();
    if(s.daily.date!==t){ s.daily={ date:t, best:0, completed:false }; }
    s.daily.best = Math.max(s.daily.best, score);

    // first win of day
    if(win){
      if(s.meta.firstWinDate!==t){
        s.meta.firstWinDate=t;
        events.push({type:'first_win_day'});
      }
    }

    // won with
    if(win) s.wonWith[fighterId]=true;

    const newRank=this.masteryRank(fighterId);
    if(newRank!==prevRank){
      events.push({type:'mastery', fighterId, rank:newRank});
    }

    // meta achievements
    if(['blaze','granite','shade','volt'].every(id=>this.masteryRank(id)!=='bronze')){
      // (not used)
    }
    if(['blaze','granite','shade','volt'].every(id=>this.masteryRank(id)>='silver')){
      events.push({type:'meta', kind:'silver_all'});
    }
    if(Object.values(s.wonWith).every(Boolean)){
      events.push({type:'meta', kind:'won_all_fighters'});
    }

    // player level events
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

  dailyChallenge(){
    // deterministic pick from list
    const list=[
      { id:'glass', name:'Glass Cannon', desc:'Both deal 2× damage, half health.', mod:{ dmgMul:2, hpMul:0.5 } },
      { id:'rush', name:'Momentum Rush', desc:'Momentum builds 3× faster.', mod:{ momentumMul:3 } },
      { id:'quake', name:'Earthquake', desc:'Periodic shakes cause brief stumbles.', mod:{ quake:true } },
      { id:'mirror', name:'Mirror Match', desc:'Both fighters are the same.', mod:{ mirror:true } },
      { id:'speed', name:'Speed Demon', desc:'Everything moves 1.5× speed.', mod:{ speedMul:1.5 } },
      { id:'iron', name:'Iron Fist', desc:'Heavies do 30% and recover slower.', mod:{ heavyDmg:30, heavyRecoveryAdd:4 } },
    ];
    const t=todayKey();
    let seed=0; for(const ch of t) seed=(seed*31 + ch.charCodeAt(0))>>>0;
    const pick=list[seed%list.length];
    return pick;
  }
}
