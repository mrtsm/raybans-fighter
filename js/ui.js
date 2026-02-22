import { FIGHTERS } from './data/fighters.js';

export class UI {
  constructor({ renderer, input, audio, progression }){
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.progression = progression;

    this.navigate = null; // injected by engine

    this.screen='menu';
    this.sel = { fighter:'blaze', opponent:'granite', difficulty:'normal', daily:false };
    this.results = null;

    this._blink=0;
  }

  enterMenu(){
    this.screen='menu';
    this.audio.playMusic('music_menu');
  }

  enterSelect(){
    this.screen='select';
    this.audio.playMusic('music_select');

    const unlocks=this.progression.unlocks();
    if(!unlocks.volt && this.sel.fighter==='volt') this.sel.fighter='blaze';
    if(!unlocks.hard && this.sel.difficulty==='hard') this.sel.difficulty='normal';
    if(!unlocks.nightmare && this.sel.difficulty==='nightmare') this.sel.difficulty='hard';
  }

  enterResults(payload){
    this.screen='results';
    this.results = payload;
  }

  update(dt){
    this._blink = (this._blink+dt)%1;
    const acts = this.input.consume().map(e=>e.action);

    if(this.screen==='menu'){
      for(const a of acts){
        if(a==='ui_confirm' || a==='light' || a==='heavy'){
          this.audio.play('sfx_select');
          this.navigate?.('select');
        }
      }
    }

    if(this.screen==='select'){
      for(const a of acts){
        if(a==='ui_back') { this.audio.play('sfx_nav'); this.navigate?.('menu'); }
        if(a==='dash_left') { this._cycleFighter(-1); }
        if(a==='dash_right') { this._cycleFighter(+1); }
        if(a==='jump') { this._cycleDifficulty(+1); }
        if(a==='crouch') { this._cycleDifficulty(-1); }
        if(a==='heavy') { this.sel.daily=!this.sel.daily; this.audio.play('sfx_nav'); }
        if(a==='ui_confirm' || a==='light') { this.audio.play('sfx_select'); this._startFight(); }
      }
    }

    if(this.screen==='results'){
      for(const a of acts){
        if(a==='ui_confirm' || a==='light') { this.audio.play('sfx_select'); this.navigate?.('select'); }
        if(a==='ui_back') { this.audio.play('sfx_nav'); this.navigate?.('menu'); }
      }
    }
  }

  _cycleFighter(dir){
    const unlocks=this.progression.unlocks();
    const list = ['blaze','granite','shade'].concat(unlocks.volt?['volt']:[]);
    const i=list.indexOf(this.sel.fighter);
    const ni=(i+dir+list.length)%list.length;
    this.sel.fighter=list[ni];
    // opponent cycles to next
    this.sel.opponent=list[(ni+1)%list.length];
    this.audio.play('sfx_nav');
  }

  _cycleDifficulty(dir){
    const unlocks=this.progression.unlocks();
    const list=['easy','normal'].concat(unlocks.hard?['hard']:[]).concat(unlocks.nightmare?['nightmare']:[]);
    const i=list.indexOf(this.sel.difficulty);
    const ni=(i+dir+list.length)%list.length;
    this.sel.difficulty=list[ni];
    this.audio.play('sfx_nav');
  }

  _startFight(){
    const daily = this.progression.dailyChallenge();
    const mod = this.sel.daily ? daily : null;

    // mirror match daily
    let p2=this.sel.opponent;
    if(mod?.mod?.mirror) p2=this.sel.fighter;

    this.navigate?.('fight', { p1Id:this.sel.fighter, p2Id:p2, difficulty:this.sel.difficulty, dailyMod:mod });
  }

  render(){
    this.renderer.beginScene();
    const c=this.renderer.ctx;

    c.setTransform(1,0,0,1,0,0);
    c.fillStyle='rgba(255,255,255,0.92)';
    c.textBaseline='top';

    if(this.screen==='menu'){
      c.font='bold 34px system-ui';
      c.textAlign='center';
      c.fillText('RAY-BANS FIGHTER', 300, 170);
      c.font='16px system-ui';
      c.fillStyle='rgba(255,255,255,0.8)';
      c.fillText('Mortal Kombat-inspired 1v1 for 600×600 HUD', 300, 214);

      c.font='bold 18px system-ui';
      c.fillStyle='rgba(255,255,255,'+(this._blink<0.5?0.95:0.55)+')';
      c.fillText('Press ENTER / SPACE / Z to Start', 300, 310);

      c.font='14px system-ui';
      c.fillStyle='rgba(255,255,255,0.75)';
      c.fillText('Controls: Arrows move/jump/crouch-block, Z=Light (hold for special), X=Heavy, C=Grab', 300, 520);
      c.fillText('Signature: hold Z ~1s when Momentum=100', 300, 540);
    }

    if(this.screen==='select'){
      const unlocks=this.progression.unlocks();
      const lvl=this.progression.playerLevel;

      c.font='bold 26px system-ui';
      c.textAlign='center';
      c.fillText('SELECT FIGHTER', 300, 70);

      const f=FIGHTERS[this.sel.fighter];
      c.font='bold 46px system-ui';
      c.fillStyle=f.colors.core;
      c.fillText(f.icon, 300, 140);
      c.fillStyle='rgba(255,255,255,0.92)';
      c.font='bold 28px system-ui';
      c.fillText(f.name, 300, 200);

      c.font='15px system-ui';
      c.fillStyle='rgba(255,255,255,0.85)';
      c.fillText(`Difficulty: ${this.sel.difficulty.toUpperCase()}   (Up/Down)`, 300, 260);

      const daily=this.progression.dailyChallenge();
      c.fillText(`Daily Challenge: ${this.sel.daily?'ON':'OFF'}  (toggle with X)`, 300, 290);
      c.font='13px system-ui';
      c.fillStyle='rgba(255,255,255,0.7)';
      c.fillText(`${daily.name}: ${daily.desc}`, 300, 312);

      c.font='14px system-ui';
      c.fillStyle='rgba(255,255,255,0.8)';
      c.fillText(`Player Level ${lvl}  •  Unlocks: Volt@10, Hard@15, Nightmare@25`, 300, 360);
      c.fillText(`Overall Best: ${this.progression.save.overallBest.toLocaleString()}`, 300, 382);
      c.fillText(`Fighter Best (${f.name}): ${this.progression.save.fighters[f.id].best.toLocaleString()}`, 300, 404);

      c.font='bold 18px system-ui';
      c.fillStyle='rgba(255,255,255,'+(this._blink<0.5?0.95:0.55)+')';
      c.fillText('Press Z / ENTER to Fight', 300, 470);

      c.font='12px system-ui';
      c.fillStyle='rgba(255,255,255,0.65)';
      c.fillText('Left/Right: change fighter   Esc: back', 300, 540);
      if(!unlocks.volt) c.fillText('VOLT is locked (reach Player Level 10).', 300, 560);
    }

    if(this.screen==='results' && this.results){
      const r=this.results;
      c.textAlign='center';
      c.font='bold 34px system-ui';
      c.fillStyle=r.win?'rgba(120,255,160,0.95)':'rgba(255,120,120,0.95)';
      c.fillText(r.win?'VICTORY':'DEFEAT', 300, 120);

      c.fillStyle='rgba(255,255,255,0.9)';
      c.font='bold 18px system-ui';
      c.fillText(`Score: ${r.score.toLocaleString()}`, 300, 190);
      c.fillText(`XP: +${r.xp}`, 300, 220);
      c.font='14px system-ui';
      c.fillText(`Rounds: ${r.rounds.p1}-${r.rounds.p2}   Difficulty: ${r.difficulty.toUpperCase()}`, 300, 255);

      c.fillStyle='rgba(255,255,255,0.75)';
      c.fillText(`Fighter Best: ${r.fighterBest.toLocaleString()}   Overall Best: ${r.overallBest.toLocaleString()}`, 300, 290);
      c.fillText(`Player Level: ${r.playerLevel}   (Volt:${r.unlocks.volt?'UNLOCKED':'LOCKED'})`, 300, 312);

      c.font='bold 18px system-ui';
      c.fillStyle='rgba(255,255,255,'+(this._blink<0.5?0.95:0.55)+')';
      c.fillText('Press Z / ENTER to Continue', 300, 430);

      c.font='12px system-ui';
      c.fillStyle='rgba(255,255,255,0.65)';
      c.fillText('Esc: main menu', 300, 520);
    }

    this.renderer.endScene();
  }
}
