import { FIGHTERS } from './data/fighters.js';
import {
  clamp01,
  fighterPalette,
  withAlpha,
  fillRoundRect,
  strokeRoundRect,
  neonText,
} from './sprites.js';

export class UI {
  constructor({ renderer, input, audio, progression, sprites }){
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.progression = progression;
    this.sprites = sprites;

    this.navigate = null; // injected by engine

    this.screen='menu';
    this.sel = { fighter:'blaze', opponent:'granite', difficulty:'normal', daily:false };
    this.results = null;

    this._blink=0;

    // simple fade between screens
    this._prevScreen = null;
    this._prevResults = null;
    this._fadeT = 1;
    this._fadeDur = 0.22;
  }

  _startTransition(next){
    this._prevScreen = this.screen;
    this._prevResults = this.results;
    this._fadeT = 0;
    this.screen = next;
  }

  enterMenu(){
    this._startTransition('menu');
    this.audio.playMusic('music_menu');
  }

  enterSelect(){
    this._startTransition('select');
    this.audio.playMusic('music_select');

    const unlocks=this.progression.unlocks();
    if(!unlocks.volt && this.sel.fighter==='volt') this.sel.fighter='blaze';
    if(!unlocks.hard && this.sel.difficulty==='hard') this.sel.difficulty='normal';
    if(!unlocks.nightmare && this.sel.difficulty==='nightmare') this.sel.difficulty='hard';
  }

  enterResults(payload){
    this._startTransition('results');
    this.results = payload;
  }

  update(dt){
    this._blink = (this._blink+dt)%1;
    this._fadeT = Math.min(this._fadeDur, this._fadeT+dt);

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

    let p2=this.sel.opponent;
    if(mod?.mod?.mirror) p2=this.sel.fighter;

    this.navigate?.('fight', { p1Id:this.sel.fighter, p2Id:p2, difficulty:this.sel.difficulty, dailyMod:mod });
  }

  render(){
    // UI draws its own background images (menu uses title_bg, others arena_bg)
    this.renderer.beginScene();

    const c=this.renderer.ctx;

    const a = clamp01(this._fadeT / this._fadeDur);
    if(this._prevScreen && a<1){
      c.save();
      c.globalAlpha = 1-a;
      this._renderScreen(this._prevScreen, this._prevResults);
      c.restore();
    }

    c.save();
    c.globalAlpha = a;
    this._renderScreen(this.screen, this.results);
    c.restore();

    this.renderer.endScene();
  }

  _renderScreen(screen, resultsOverride=null){
    if(screen==='menu') return this._renderMenu();
    if(screen==='select') return this._renderSelect();
    if(screen==='results') return this._renderResults(resultsOverride ?? this.results);
  }

  _drawBg(which){
    const c=this.renderer.ctx;
    const im = (which==='title') ? this.sprites?.sprites?.title_bg : this.sprites?.sprites?.arena_bg;
    if(!im) return;
    c.save();
    c.setTransform(1,0,0,1,0,0);
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 1;
    c.drawImage(im, 0,0, this.renderer.w, this.renderer.h);
    // UI readability overlay
    c.globalAlpha = 0.65;
    c.fillStyle = '#000';
    c.fillRect(0,0,this.renderer.w,this.renderer.h);
    c.restore();
  }

  _panel(x,y,w,h, accent='rgba(120,240,255,0.9)'){
    const c=this.renderer.ctx;
    const bg = c.createLinearGradient(x,y,x,y+h);
    bg.addColorStop(0,'rgba(255,255,255,0.10)');
    bg.addColorStop(1,'rgba(255,255,255,0.04)');
    fillRoundRect(c,x,y,w,h,16,bg);
    c.save();
    c.globalCompositeOperation='screen';
    c.globalAlpha=0.28;
    const g=c.createLinearGradient(x,y,x+w,y);
    g.addColorStop(0, withAlpha(accent,0.9));
    g.addColorStop(1,'rgba(255,255,255,0.0)');
    fillRoundRect(c,x,y,w,h,16,g);
    c.restore();
    strokeRoundRect(c,x,y,w,h,16,'rgba(255,255,255,0.16)',1.5);
  }

  _renderMenu(){
    const c=this.renderer.ctx;
    c.setTransform(1,0,0,1,0,0);

    this._drawBg('title');

    neonText(c, 'RAY-BANS', 300, 110, { size:58, glow:'rgba(120,240,255,0.9)', blur:30, weight:900 });
    neonText(c, 'FIGHTER', 300, 176, { size:72, glow:'rgba(210,150,255,0.85)', blur:34, weight:900 });


    const blink = (this._blink<0.5);
    c.save();
    c.globalAlpha = blink?1:0.55;
    neonText(c, 'PRESS ENTER / SPACE / Z', 300, 382, { size:20, glow:'rgba(255,215,64,0.95)', color:'rgba(255,245,190,0.95)', blur:18, weight:800, stroke:false });
    neonText(c, 'TO START', 300, 408, { size:18, glow:'rgba(255,215,64,0.75)', color:'rgba(255,245,190,0.88)', blur:14, weight:700, stroke:false });
    c.restore();

    // bottom hint panel
    this._panel(50, 470, 500, 104, 'rgba(120,240,255,0.9)');
    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.fillStyle='rgba(255,255,255,0.78)';
    c.font='600 12px Orbitron, system-ui';
    c.fillText('Controls: Arrows move/jump/crouch-block', 300, 490);
    c.fillText('Z = Light (hold for special)   X = Heavy   C = Grab', 300, 510);
    c.fillText('Signature: hold Z ~1s when Momentum = 100', 300, 532);
    c.fillStyle='rgba(255,255,255,0.52)';
    c.font='500 11px Orbitron, system-ui';
    c.fillText('Sprites: cel-shaded 2D fighters', 300, 555);
    c.restore();
  }

  _statBar(x,y,label,val,max, accent){
    const c=this.renderer.ctx;
    c.save();
    c.textBaseline='top';
    c.font='800 11px Orbitron, system-ui';
    c.fillStyle='rgba(255,255,255,0.75)';
    c.fillText(label, x, y);

    const w=220, h=10;
    const bx = x+70;
    fillRoundRect(c, bx, y+1, w, h, 6, 'rgba(255,255,255,0.10)');
    const p = clamp01(val/max);
    const g=c.createLinearGradient(bx,y,bx+w,y);
    g.addColorStop(0, withAlpha(accent,0.85));
    g.addColorStop(1, 'rgba(255,255,255,0.35)');
    fillRoundRect(c, bx, y+1, w*p, h, 6, g);
    strokeRoundRect(c, bx, y+1, w, h, 6, 'rgba(255,255,255,0.12)', 1);
    c.restore();
  }

  _renderSelect(){
    const c=this.renderer.ctx;
    c.setTransform(1,0,0,1,0,0);

    this._drawBg('arena');

    const unlocks=this.progression.unlocks();
    const lvl=this.progression.playerLevel;

    const f=FIGHTERS[this.sel.fighter];
    const pal = fighterPalette({ id:f.id, color:f.colors.core, glow:f.colors.glow });

    neonText(c, 'SELECT FIGHTER', 300, 38, { size:32, glow:withAlpha(pal.glow,0.9), blur:22, weight:900 });

    // arrows
    c.save();
    c.globalCompositeOperation='screen';
    c.shadowColor = withAlpha(pal.glow,0.8);
    c.shadowBlur = 18;
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font='900 28px Orbitron, system-ui';
    c.textAlign='center';
    c.fillText('◀', 92, 170);
    c.fillText('▶', 508, 170);
    c.restore();

    // Fighter preview panel
    this._panel(110, 86, 380, 270, pal.glow);

    // sprite preview
    // sprite preview
    const im = this.sprites?.sprites?.[f.id]?.idle;
    if(im){
      c.save();
      c.translate(300, 330);
      c.imageSmoothingEnabled = true;
      c.shadowColor = withAlpha(pal.glow, 0.95);
      c.shadowBlur = 18;
      const w = 260, h = 260;
      c.drawImage(im, -w/2, -h, w, h);
      c.shadowBlur = 0;
      c.restore();
    }

    // icon + name
    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.font='900 46px Orbitron, system-ui';
    c.fillStyle = withAlpha(pal.top, 0.95);
    c.shadowColor = withAlpha(pal.glow, 0.8);
    c.shadowBlur = 20;
    c.fillText(f.icon, 300, 102);
    c.restore();

    neonText(c, f.name, 300, 148, { size:36, glow:withAlpha(pal.glow,0.9), blur:24, weight:900 });

    // stats
    const maxHP = Math.max(...Object.values(FIGHTERS).map(x=>x.health));
    const maxDash = Math.max(...Object.values(FIGHTERS).map(x=>x.dashPx));
    const maxRange = Math.max(...Object.values(FIGHTERS).map(x=>x.range.heavy));

    this._statBar(120, 370, 'HP', f.health, maxHP, pal.glow);
    this._statBar(120, 392, 'SPEED', f.dashPx, maxDash, pal.glow);
    this._statBar(120, 414, 'RANGE', f.range.heavy, maxRange, pal.glow);

    // difficulty selector
    const diffs=['easy','normal','hard','nightmare'];
    const allowed = new Set(['easy','normal'].concat(unlocks.hard?['hard']:[]).concat(unlocks.nightmare?['nightmare']:[]));

    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.font='800 13px Orbitron, system-ui';
    c.fillStyle='rgba(255,255,255,0.82)';
    c.fillText('DIFFICULTY  (UP / DOWN)', 300, 438);
    c.restore();

    const bx=110, by=460, bw=95, bh=32, gap=10;
    for(let i=0;i<diffs.length;i++){
      const d=diffs[i];
      const x=bx + i*(bw+gap);
      const on = (d===this.sel.difficulty);
      const ok = allowed.has(d);
      const bg = on ? withAlpha(pal.glow,0.22) : 'rgba(255,255,255,0.06)';
      fillRoundRect(c, x, by, bw, bh, 10, bg);
      strokeRoundRect(c, x, by, bw, bh, 10, on?withAlpha(pal.glow,0.75):'rgba(255,255,255,0.12)', on?2:1.25);
      c.save();
      c.textAlign='center';
      c.textBaseline='middle';
      c.font='800 12px Orbitron, system-ui';
      c.fillStyle = ok ? (on?'rgba(255,255,255,0.95)':'rgba(255,255,255,0.80)') : 'rgba(255,255,255,0.30)';
      c.fillText(d.toUpperCase(), x+bw/2, by+bh/2+1);
      c.restore();
    }

    // daily challenge
    const daily=this.progression.dailyChallenge();
    this._panel(60, 505, 480, 78, 'rgba(255,215,64,0.85)');

    c.save();
    c.textAlign='left';
    c.textBaseline='top';
    c.font='900 13px Orbitron, system-ui';
    c.fillStyle='rgba(255,255,255,0.90)';
    c.fillText('DAILY CHALLENGE', 78, 518);

    const tog = this.sel.daily?'ON':'OFF';
    c.textAlign='right';
    c.fillStyle = this.sel.daily ? 'rgba(255,245,190,0.95)' : 'rgba(255,255,255,0.65)';
    c.fillText(`${tog}  (toggle with X)`, 522, 518);

    c.textAlign='left';
    c.font='650 12px Orbitron, system-ui';
    c.fillStyle='rgba(255,255,255,0.78)';
    c.fillText(`${daily.name}: ${daily.desc}`, 78, 542);
    c.restore();

    // footer + start hint
    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.font='650 12px Orbitron, system-ui';
    c.fillStyle='rgba(255,255,255,0.70)';
    c.fillText(`Player Level ${lvl}  •  Unlocks: Volt@10, Hard@15, Nightmare@25`, 300, 586);
    c.restore();

    const blink = (this._blink<0.5);
    c.save();
    c.globalAlpha = blink?0.95:0.55;
    neonText(c, 'PRESS Z / ENTER TO FIGHT', 300, 428, { size:16, glow:withAlpha(pal.glow,0.95), blur:18, weight:900, stroke:false });
    c.restore();

    if(!unlocks.volt){
      c.save();
      c.textAlign='center';
      c.textBaseline='top';
      c.font='700 11px Orbitron, system-ui';
      c.fillStyle='rgba(255,255,255,0.55)';
      c.fillText('VOLT is locked (reach Player Level 10).', 300, 566);
      c.restore();
    }
  }

  _renderResults(r){
    const c=this.renderer.ctx;
    if(!r) return;
    c.setTransform(1,0,0,1,0,0);

    this._drawBg('arena');

    const win = !!r.win;
    const glow = win ? 'rgba(120,255,160,0.95)' : 'rgba(255,90,90,0.95)';

    neonText(c, win?'VICTORY':'DEFEAT', 300, 80, { size:78, glow, blur:34, weight:900 });

    this._panel(70, 176, 460, 300, glow);

    const xp = r.xp ?? 0;
    const score = r.score ?? 0;

    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.font='900 26px Orbitron, system-ui';
    c.fillStyle='rgba(255,255,255,0.92)';
    c.shadowColor=withAlpha(glow,0.55);
    c.shadowBlur=18;
    c.fillText(`SCORE  ${score.toLocaleString()}`, 300, 200);

    c.font='800 16px Orbitron, system-ui';
    c.shadowBlur=12;
    c.fillStyle='rgba(255,255,255,0.82)';
    c.fillText(`XP  +${xp}`, 300, 236);

    c.font='700 13px Orbitron, system-ui';
    c.shadowBlur=0;
    c.fillStyle='rgba(255,255,255,0.72)';
    c.fillText(`Rounds: ${r.rounds.p1}-${r.rounds.p2}    Difficulty: ${String(r.difficulty||'').toUpperCase()}`, 300, 274);
    c.fillText(`Fighter Best: ${r.fighterBest.toLocaleString()}    Overall Best: ${r.overallBest.toLocaleString()}`, 300, 300);
    c.restore();

    // fighter sprite badge
    const fid = r.fighterId;
    const fdef = FIGHTERS[fid];
    if(fdef){
      const pal = fighterPalette({ id:fid, color:fdef.colors.core, glow:fdef.colors.glow });
      const im = this.sprites?.sprites?.[fid]?.[win?'victory':'ko'];
      if(im){
        c.save();
        c.translate(300, 468);
        c.imageSmoothingEnabled = true;
        c.shadowColor = withAlpha(pal.glow, 0.9);
        c.shadowBlur = 16;
        const w = 190, h = 190;
        c.drawImage(im, -w/2, -h, w, h);
        c.shadowBlur = 0;
        c.restore();
      }
    }

    const blink = (this._blink<0.5);
    c.save();
    c.globalAlpha = blink?0.95:0.55;
    neonText(c, 'PRESS Z / ENTER TO CONTINUE', 300, 496, { size:18, glow, blur:22, weight:900, stroke:false });
    c.restore();

    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.font='650 12px Orbitron, system-ui';
    c.fillStyle='rgba(255,255,255,0.60)';
    c.fillText('Esc: main menu', 300, 538);
    c.restore();
  }
}
