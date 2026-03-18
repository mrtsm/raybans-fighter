import { FIGHTERS } from './data/fighters.js';
import {
  clamp01,
  fighterPalette,
  withAlpha,
  fillRoundRect,
  strokeRoundRect,
  neonText,
  lerp,
} from './sprites.js';

const LS_HIGHSCORE_KEY = 'raybans_fighter_highscores_v1';

export class UI {
  constructor({ renderer, input, audio, progression, sprites }){
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.progression = progression;
    this.sprites = sprites;

    this.navigate = null;

    this.screen='splash';
    this.sel = { fighter:'blaze', opponent:'granite', difficulty:'normal', daily:false };
    this.results = null;

    this._blink=0;

    // Fade transitions
    this._prevScreen = null;
    this._prevResults = null;
    this._fadeT = 1;
    this._fadeDur = 0.22;

    // Intro splash animation
    this._splashT = 0;
    this._splashDuration = 2.5;
    this._splashDone = false;

    // High score system
    this.highScores = this._loadHighScores();

    // High score entry
    this._hsEntry = null; // { active, initials:['A','A','A'], pos:0, rank:-1 }

    // Results screen animation
    this._resultsAnimT = 0;
  }

  _loadHighScores(){
    try {
      const raw = localStorage.getItem(LS_HIGHSCORE_KEY);
      if(raw) return JSON.parse(raw);
    } catch {}
    // Default high scores
    return [
      { initials: 'AAA', score: 10000, fighter: 'blaze' },
      { initials: 'BBB', score: 7500, fighter: 'granite' },
      { initials: 'CCC', score: 5000, fighter: 'shade' },
      { initials: 'DDD', score: 2500, fighter: 'volt' },
      { initials: 'EEE', score: 1000, fighter: 'blaze' },
    ];
  }

  _saveHighScores(){
    localStorage.setItem(LS_HIGHSCORE_KEY, JSON.stringify(this.highScores));
  }

  _checkHighScore(score){
    if(this.highScores.length < 5 || score > this.highScores[this.highScores.length-1].score){
      // Find rank
      let rank = this.highScores.findIndex(h => score > h.score);
      if(rank === -1) rank = this.highScores.length;
      return rank;
    }
    return -1;
  }

  _insertHighScore(initials, score, fighter){
    const entry = { initials: initials.join(''), score, fighter };
    let rank = this.highScores.findIndex(h => score > h.score);
    if(rank === -1) rank = this.highScores.length;
    this.highScores.splice(rank, 0, entry);
    if(this.highScores.length > 5) this.highScores.length = 5;
    this._saveHighScores();
    return rank;
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
    this._resultsAnimT = 0;

    // Check high score
    const rank = this._checkHighScore(payload.score);
    if(rank >= 0 && rank < 5){
      this._hsEntry = {
        active: true,
        initials: ['A','A','A'],
        pos: 0,
        rank,
        score: payload.score,
        fighter: payload.fighterId,
      };
    } else {
      this._hsEntry = null;
    }
  }

  update(dt){
    this._blink = (this._blink+dt)%1;
    this._fadeT = Math.min(this._fadeDur, this._fadeT+dt);

    const acts = this.input.consume().map(e=>e.action);

    // Splash screen
    if(this.screen==='splash'){
      this._splashT += dt;
      // Any input skips splash after 1s
      if(this._splashT > 1.0 && acts.length > 0){
        this._splashDone = true;
      }
      if(this._splashT >= this._splashDuration){
        this._splashDone = true;
      }
      if(this._splashDone){
        this.navigate?.('menu');
      }
      return;
    }

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
        if(a==='dash_left' || a==='walk_left_hold') { this._cycleFighter(-1); }
        if(a==='dash_right' || a==='walk_right_hold') { this._cycleFighter(+1); }
        if(a==='jump') { this._cycleDifficulty(+1); }
        if(a==='crouch' || a==='down_hold') { this._cycleDifficulty(-1); }
        if(a==='heavy') { this.sel.daily=!this.sel.daily; this.audio.play('sfx_nav'); }
        if(a==='ui_confirm' || a==='light') { this.audio.play('sfx_select'); this._startFight(); }
      }
    }

    if(this.screen==='results'){
      this._resultsAnimT += dt;

      if(this._hsEntry?.active){
        // High score entry mode
        for(const a of acts){
          if(a==='jump'){
            // Letter up
            const c = this._hsEntry.initials[this._hsEntry.pos];
            this._hsEntry.initials[this._hsEntry.pos] = String.fromCharCode(((c.charCodeAt(0) - 65 + 1) % 26) + 65);
            this.audio.play('sfx_nav');
          }
          if(a==='down_hold' || a==='crouch'){
            // Letter down
            const c = this._hsEntry.initials[this._hsEntry.pos];
            this._hsEntry.initials[this._hsEntry.pos] = String.fromCharCode(((c.charCodeAt(0) - 65 + 25) % 26) + 65);
            this.audio.play('sfx_nav');
          }
          if(a==='dash_right' || a==='walk_right_hold'){
            if(this._hsEntry.pos < 2) {
              this._hsEntry.pos++;
              this.audio.play('sfx_nav');
            }
          }
          if(a==='dash_left' || a==='walk_left_hold'){
            if(this._hsEntry.pos > 0) {
              this._hsEntry.pos--;
              this.audio.play('sfx_nav');
            }
          }
          if(a==='ui_confirm' || a==='light'){
            // Submit high score
            this._insertHighScore(this._hsEntry.initials, this._hsEntry.score, this._hsEntry.fighter);
            this._hsEntry.active = false;
            this.audio.play('sfx_select');
          }
        }
      } else {
        for(const a of acts){
          if(a==='ui_confirm' || a==='light') { this.audio.play('sfx_select'); this.navigate?.('select'); }
          if(a==='ui_back') { this.audio.play('sfx_nav'); this.navigate?.('menu'); }
        }
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
    if(this.screen === 'splash'){
      this._renderSplash();
      return;
    }

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

  _renderSplash(){
    const c = this.renderer.ctx;
    c.setTransform(1,0,0,1,0,0);
    const t = this._splashT;

    // Black background
    c.fillStyle = '#000';
    c.fillRect(0,0,600,600);

    // Phase 1: Logo slam (0-1s)
    if(t < 1.2){
      const progress = Math.min(t / 0.3, 1);
      const scale = 1 + (1-progress) * 2; // starts big, slams in
      const alpha = progress;

      c.save();
      c.globalAlpha = alpha;
      c.translate(300, 200);
      c.scale(scale, scale);

      // Impact flash at landing
      if(t > 0.25 && t < 0.5){
        c.save();
        c.globalAlpha = (0.5 - t) * 4;
        c.fillStyle = '#fff';
        c.fillRect(-300,-200,600,400);
        c.restore();
      }

      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 52px Orbitron, system-ui';
      c.fillStyle = '#fff';
      c.shadowColor = 'rgba(120,240,255,0.9)';
      c.shadowBlur = 30;
      c.fillText('RAY-BANS', 0, -30);

      c.font = '900 68px Orbitron, system-ui';
      c.shadowColor = 'rgba(210,150,255,0.9)';
      c.fillText('FIGHTER', 0, 45);
      c.restore();
    }

    // Phase 2: Character silhouettes (0.8-2s)
    if(t > 0.8 && t < 2.2){
      const charT = (t - 0.8);
      const fighters = ['blaze','granite','shade','volt'];
      const positions = [120, 240, 360, 480];

      for(let i = 0; i < 4; i++){
        const delay = i * 0.15;
        const charProgress = clamp01((charT - delay) / 0.3);
        if(charProgress <= 0) continue;

        const fid = fighters[i];
        const im = this.sprites?.sprites?.[fid]?.idle;
        const x = positions[i];

        c.save();
        c.globalAlpha = charProgress * 0.8;
        c.translate(x, 480);

        // Silhouette effect - draw dark with colored glow
        const pal = fighterPalette(fid);
        c.shadowColor = withAlpha(pal.glow, 0.9);
        c.shadowBlur = 20;

        if(im){
          // Tinted silhouette
          c.filter = `brightness(0.3) saturate(2)`;
          c.drawImage(im, -80, -200, 160, 200);
          c.filter = 'none';
        }

        // Fighter icon
        c.textAlign = 'center';
        c.font = '600 24px Orbitron, system-ui';
        c.fillStyle = withAlpha(pal.glow, charProgress);
        c.fillText(FIGHTERS[fid].icon, 0, -210);

        c.restore();
      }
    }

    // Phase 3: Fade to white/out (2-2.5s)
    if(t > 2.0){
      const fadeProgress = clamp01((t - 2.0) / 0.5);
      c.save();
      c.globalAlpha = fadeProgress;
      c.fillStyle = '#000';
      c.fillRect(0,0,600,600);
      c.restore();
    }

    // Scanlines over everything
    c.save();
    c.globalAlpha = 0.06;
    c.fillStyle = '#000';
    for(let y=0; y<600; y+=3) c.fillRect(0,y,600,1);
    c.restore();
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
    neonText(c, 'TAP OR CLICK TO START', 300, 382, { size:20, glow:'rgba(255,215,64,0.95)', color:'rgba(255,245,190,0.95)', blur:18, weight:800, stroke:false });
    c.restore();

    // Controls hint (simplified for armband)
    this._panel(50, 430, 500, 85, 'rgba(120,240,255,0.9)');
    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.fillStyle='rgba(255,255,255,0.82)';
    c.font='700 13px Orbitron, system-ui';
    c.fillText('← → Move   ↑ Jump   ↓ Block', 300, 448);
    c.fillText('Left Click = Attack   Right Click = Heavy', 300, 470);
    c.fillStyle='rgba(255,255,255,0.55)';
    c.font='600 11px Orbitron, system-ui';
    c.fillText('Hold Left Click for Special  •  Double-tap to Dash', 300, 494);
    c.restore();

    // High scores
    this._renderHighScoreTable(50, 525, 500, 60);
  }

  _renderHighScoreTable(x, y, w, h){
    const c = this.renderer.ctx;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.font = '800 11px Orbitron, system-ui';
    c.fillStyle = 'rgba(255,215,64,0.85)';
    c.fillText('HIGH SCORES', x + w/2, y);

    c.font = '700 10px Orbitron, system-ui';
    const scores = this.highScores.slice(0, 5);
    for(let i = 0; i < scores.length; i++){
      const hs = scores[i];
      const sy = y + 16 + i * 14;
      c.fillStyle = i === 0 ? 'rgba(255,215,64,0.95)' : 'rgba(255,255,255,0.65)';
      c.textAlign = 'left';
      c.fillText(`${i+1}. ${hs.initials}`, x + 120, sy);
      c.textAlign = 'right';
      c.fillText(hs.score.toLocaleString(), x + w - 120, sy);
    }
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

    this._panel(110, 86, 380, 270, pal.glow);

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

    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.font='900 46px Orbitron, system-ui';
    c.fillStyle = withAlpha(pal.top || pal.primary, 0.95);
    c.shadowColor = withAlpha(pal.glow, 0.8);
    c.shadowBlur = 20;
    c.fillText(f.icon, 300, 102);
    c.restore();

    neonText(c, f.name, 300, 148, { size:36, glow:withAlpha(pal.glow,0.9), blur:24, weight:900 });

    const maxHP = Math.max(...Object.values(FIGHTERS).map(x=>x.health));
    const maxDash = Math.max(...Object.values(FIGHTERS).map(x=>x.dashPx));
    const maxRange = Math.max(...Object.values(FIGHTERS).map(x=>x.range.heavy));

    this._statBar(120, 370, 'HP', f.health, maxHP, pal.glow);
    this._statBar(120, 392, 'SPEED', f.dashPx, maxDash, pal.glow);
    this._statBar(120, 414, 'RANGE', f.range.heavy, maxRange, pal.glow);

    // difficulty
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
    this._panel(60, 505, 480, 58, 'rgba(255,215,64,0.85)');

    c.save();
    c.textAlign='left';
    c.textBaseline='top';
    c.font='900 12px Orbitron, system-ui';
    c.fillStyle='rgba(255,255,255,0.90)';
    c.fillText('DAILY CHALLENGE', 78, 515);

    const tog = this.sel.daily?'ON':'OFF';
    c.textAlign='right';
    c.fillStyle = this.sel.daily ? 'rgba(255,245,190,0.95)' : 'rgba(255,255,255,0.65)';
    c.fillText(`${tog}  (Right Click)`, 522, 515);

    c.textAlign='left';
    c.font='650 11px Orbitron, system-ui';
    c.fillStyle='rgba(255,255,255,0.78)';
    c.fillText(`${daily.name}: ${daily.desc}`, 78, 534);
    c.restore();

    // footer
    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.font='650 11px Orbitron, system-ui';
    c.fillStyle='rgba(255,255,255,0.60)';
    c.fillText(`Level ${lvl}  •  Volt@10  Hard@15  Nightmare@25`, 300, 570);
    c.restore();

    const blink = (this._blink<0.5);
    c.save();
    c.globalAlpha = blink?0.95:0.55;
    neonText(c, 'CLICK TO FIGHT', 300, 428, { size:16, glow:withAlpha(pal.glow,0.95), blur:18, weight:900, stroke:false });
    c.restore();
  }

  _renderResults(r){
    const c=this.renderer.ctx;
    if(!r) return;
    c.setTransform(1,0,0,1,0,0);

    this._drawBg('arena');

    const win = !!r.win;
    const glow = win ? 'rgba(120,255,160,0.95)' : 'rgba(255,90,90,0.95)';
    const t = this._resultsAnimT;

    // Animated title
    const titleScale = Math.min(1.0, t * 5);
    c.save();
    c.translate(300, 60);
    c.scale(titleScale, titleScale);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 64px Orbitron, system-ui';
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.shadowColor = glow;
    c.shadowBlur = 30;
    c.fillText(win?'VICTORY':'DEFEAT', 0, 0);
    c.restore();

    // High score entry
    if(this._hsEntry?.active){
      this._renderHighScoreEntry(r);
      return;
    }

    // Stats panel
    this._panel(50, 120, 500, 300, glow);

    const stats = r.stats || {};

    // Animated stat reveal
    const statLines = [
      { label: 'SCORE', value: r.score?.toLocaleString() || '0', delay: 0.2 },
      { label: 'XP EARNED', value: `+${r.xp || 0}`, delay: 0.4 },
      { label: 'ROUNDS', value: `${r.rounds.p1}-${r.rounds.p2}`, delay: 0.6 },
      { label: 'HITS LANDED', value: `${stats.hitsLanded || 0}`, delay: 0.8 },
      { label: 'MAX COMBO', value: `${stats.maxStreak || 0}`, delay: 1.0 },
      { label: 'DAMAGE DEALT', value: `${stats.damageDealt || 0}`, delay: 1.2 },
      { label: 'DAMAGE TAKEN', value: `${stats.damageTaken || 0}`, delay: 1.4 },
      { label: 'DIFFICULTY', value: (r.difficulty||'normal').toUpperCase(), delay: 1.6 },
    ];

    c.save();
    c.textBaseline = 'top';
    for(let i = 0; i < statLines.length; i++){
      const sl = statLines[i];
      const alpha = clamp01((t - sl.delay) * 4);
      if(alpha <= 0) continue;

      c.globalAlpha = alpha;
      const y = 140 + i * 30;

      c.textAlign = 'left';
      c.font = '700 14px Orbitron, system-ui';
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fillText(sl.label, 80, y);

      c.textAlign = 'right';
      c.font = '800 14px Orbitron, system-ui';
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.fillText(sl.value, 520, y);
    }
    c.restore();

    // Best scores
    if(t > 1.8){
      const alpha = clamp01((t - 1.8) * 3);
      c.save();
      c.globalAlpha = alpha;
      c.textAlign = 'center';
      c.font = '700 12px Orbitron, system-ui';
      c.fillStyle = 'rgba(255,215,64,0.85)';
      c.fillText(`Fighter Best: ${(r.fighterBest||0).toLocaleString()}   Overall Best: ${(r.overallBest||0).toLocaleString()}`, 300, 395);
      c.restore();
    }

    // Fighter sprite
    const fid = r.fighterId;
    const fdef = FIGHTERS[fid];
    if(fdef){
      const pal = fighterPalette({ id:fid, color:fdef.colors.core, glow:fdef.colors.glow });
      const im = this.sprites?.sprites?.[fid]?.[win?'victory':'ko'];
      if(im){
        c.save();
        c.translate(300, 510);
        c.imageSmoothingEnabled = true;
        c.shadowColor = withAlpha(pal.glow, 0.9);
        c.shadowBlur = 16;
        c.drawImage(im, -80, -160, 160, 160);
        c.shadowBlur = 0;
        c.restore();
      }
    }

    // Continue prompt
    if(t > 2.0){
      const blink = (this._blink<0.5);
      c.save();
      c.globalAlpha = blink?0.95:0.55;
      neonText(c, 'CLICK TO CONTINUE', 300, 540, { size:16, glow, blur:18, weight:900, stroke:false });
      c.restore();
    }

    // High score table
    this._renderHighScoreTable(50, 555, 500, 40);
  }

  _renderHighScoreEntry(r){
    const c = this.renderer.ctx;
    const hs = this._hsEntry;

    // "NEW HIGH SCORE!" banner
    neonText(c, 'NEW HIGH SCORE!', 300, 160, {
      size:32, glow:'rgba(255,215,64,0.95)', color:'rgba(255,245,190,0.95)', blur:24, weight:900
    });

    c.save();
    c.textAlign = 'center';
    c.font = '900 28px Orbitron, system-ui';
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillText(r.score?.toLocaleString() || '0', 300, 210);
    c.restore();

    // Initial entry
    neonText(c, 'ENTER YOUR INITIALS', 300, 270, {
      size:16, glow:'rgba(120,240,255,0.8)', blur:14, weight:700
    });

    // 3 letter boxes
    for(let i = 0; i < 3; i++){
      const x = 220 + i * 60;
      const y = 310;
      const selected = (i === hs.pos);

      fillRoundRect(c, x, y, 48, 60, 10, selected ? 'rgba(255,215,64,0.2)' : 'rgba(255,255,255,0.08)');
      strokeRoundRect(c, x, y, 48, 60, 10, selected ? 'rgba(255,215,64,0.8)' : 'rgba(255,255,255,0.2)', selected ? 2 : 1);

      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 32px Orbitron, system-ui';
      c.fillStyle = selected ? 'rgba(255,215,64,0.95)' : 'rgba(255,255,255,0.85)';
      if(selected){
        c.shadowColor = 'rgba(255,215,64,0.8)';
        c.shadowBlur = 14;
      }
      c.fillText(hs.initials[i], x + 24, y + 32);
      c.restore();

      // Arrow indicators
      if(selected){
        c.save();
        c.textAlign = 'center';
        c.font = '600 14px Orbitron, system-ui';
        c.fillStyle = 'rgba(255,215,64,0.7)';
        c.fillText('▲', x + 24, y - 12);
        c.fillText('▼', x + 24, y + 75);
        c.restore();
      }
    }

    // Instructions
    c.save();
    c.textAlign = 'center';
    c.font = '600 12px Orbitron, system-ui';
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText('↑↓ Change Letter  ←→ Move  Click to Confirm', 300, 420);
    c.restore();

    // Current high score table
    this._panel(100, 460, 400, 120, 'rgba(255,215,64,0.5)');
    c.save();
    c.textAlign = 'center';
    c.font = '800 11px Orbitron, system-ui';
    c.fillStyle = 'rgba(255,215,64,0.85)';
    c.fillText('HIGH SCORES', 300, 472);

    const scores = this.highScores.slice(0, 5);
    for(let i = 0; i < scores.length; i++){
      const s = scores[i];
      const sy = 490 + i * 16;
      const isNew = (i === hs.rank);
      c.fillStyle = isNew ? 'rgba(255,215,64,0.95)' : 'rgba(255,255,255,0.65)';
      c.textAlign = 'left';
      c.font = `${isNew?'800':'700'} 11px Orbitron, system-ui`;
      c.fillText(`${i+1}. ${s.initials}`, 160, sy);
      c.textAlign = 'right';
      c.fillText(s.score.toLocaleString(), 440, sy);
    }
    c.restore();
  }
}
