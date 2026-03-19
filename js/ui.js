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

const LS_HIGHSCORE_KEY = 'pixel_brawl_highscores_v1';
const LS_DAILY_HIGHSCORE_KEY = 'pixel_brawl_daily_highscores_v1';
const LS_STREAK_KEY = 'pixel_brawl_streak_v1';

// ===== DAILY CHALLENGE SYSTEM =====
const DAILY_MODIFIERS = [
  { id:'double_speed', name:'DOUBLE SPEED',   desc:'Everything moves at 2× speed!',         mod:{ speedMul:2 },    icon:'⚡' },
  { id:'one_hit_ko',   name:'ONE-HIT KO',     desc:'One hit and you\'re done.',              mod:{ dmgMul:999 },    icon:'💀' },
  { id:'low_gravity',  name:'LOW GRAVITY',     desc:'Float like a butterfly...',              mod:{ gravMul:0.4 },   icon:'🌙' },
  { id:'mirror',       name:'MIRROR MODE',     desc:'Both fighters are the same!',            mod:{ mirror:true },   icon:'🪞' },
  { id:'giant',        name:'GIANT MODE',      desc:'Everyone is huge!',                      mod:{ scaleMul:1.6 },  icon:'🦖' },
  { id:'tiny',         name:'TINY MODE',       desc:'Tiny fighters, big arena.',              mod:{ scaleMul:0.6 },  icon:'🐜' },
  { id:'no_block',     name:'NO BLOCK',        desc:'Blocking is disabled. All offense!',     mod:{ noBlock:true },  icon:'🔓' },
  { id:'inf_specials', name:'INFINITE SPECIALS',desc:'Specials cost nothing!',                mod:{ freeSpecials:true }, icon:'♾️' },
  { id:'glass',        name:'GLASS CANNON',    desc:'2× damage, half health.',                mod:{ dmgMul:2, hpMul:0.5 }, icon:'💎' },
  { id:'rush',         name:'MOMENTUM RUSH',   desc:'Momentum builds 3× faster!',            mod:{ momentumMul:3 }, icon:'🚀' },
  { id:'quake',        name:'EARTHQUAKE',      desc:'Periodic shakes stun both fighters.',    mod:{ quake:true },    icon:'🌋' },
  { id:'iron',         name:'IRON FIST',       desc:'Heavies hit for 30 but recover slow.',   mod:{ heavyDmg:30, heavyRecoveryAdd:4 }, icon:'🥊' },
];

function todayKey(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDailyChallenge(){
  const t = todayKey();
  let seed = 0;
  for(const ch of t) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return { ...DAILY_MODIFIERS[seed % DAILY_MODIFIERS.length], date: t, seed };
}

export class UI {
  constructor({ renderer, input, audio, progression, sprites }){
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.progression = progression;
    this.sprites = sprites;

    this.navigate = null;

    this.screen='splash';
    this.sel = { fighter:'blaze', opponent:'granite', difficulty:'easy' };
    this.results = null;

    this._blink=0;

    // Fade transitions
    this._prevScreen = null;
    this._prevResults = null;
    this._fadeT = 1;
    this._fadeDur = 0.22;

    // Intro splash animation
    this._splashT = 0;
    this._splashDuration = 3.2;
    this._splashDone = false;
    this._splashSlamPlayed = false;

    // High score system
    this.highScores = this._loadHighScores(LS_HIGHSCORE_KEY);
    this.dailyHighScores = this._loadHighScores(LS_DAILY_HIGHSCORE_KEY);

    // High score entry
    this._hsEntry = null;

    // Results screen animation
    this._resultsAnimT = 0;

    // ===== MENU SYSTEM =====
    this._menuItems = ['ARCADE', 'DAILY CHALLENGE', 'HIGH SCORES'];
    this._menuSel = 0;

    // ===== WIN STREAK =====
    this._streak = this._loadStreak();

    // ===== DAILY CHALLENGE =====
    this._dailyChallenge = getDailyChallenge();
    this._dailyMode = false;

    // High score view state
    this._hsView = false; // true when viewing high scores from menu
  }

  // ===== STREAK SYSTEM =====
  _loadStreak(){
    try {
      const raw = localStorage.getItem(LS_STREAK_KEY);
      if(raw) return JSON.parse(raw);
    } catch {}
    return { current: 0, best: 0 };
  }

  _saveStreak(){
    localStorage.setItem(LS_STREAK_KEY, JSON.stringify(this._streak));
  }

  onWin(){
    this._streak.current++;
    if(this._streak.current > this._streak.best) this._streak.best = this._streak.current;
    this._saveStreak();
  }

  onLose(){
    this._streak.current = 0;
    this._saveStreak();
  }

  getStreakDifficultyBonus(){
    // AI gets harder as streak increases
    const s = this._streak.current;
    if(s >= 10) return 0.35;
    if(s >= 7) return 0.25;
    if(s >= 5) return 0.18;
    if(s >= 3) return 0.10;
    return 0;
  }

  // ===== HIGH SCORES =====
  _loadHighScores(key){
    try {
      const raw = localStorage.getItem(key);
      if(raw) return JSON.parse(raw);
    } catch {}
    return [
      { initials: 'AAA', score: 10000, fighter: 'blaze' },
      { initials: 'BBB', score: 7500, fighter: 'granite' },
      { initials: 'CCC', score: 5000, fighter: 'shade' },
      { initials: 'DDD', score: 2500, fighter: 'volt' },
      { initials: 'EEE', score: 1000, fighter: 'blaze' },
    ];
  }

  _saveHighScores(key, scores){
    localStorage.setItem(key, JSON.stringify(scores));
  }

  _checkHighScore(score, daily=false){
    const list = daily ? this.dailyHighScores : this.highScores;
    if(list.length < 5 || score > list[list.length-1].score){
      let rank = list.findIndex(h => score > h.score);
      if(rank === -1) rank = list.length;
      return rank;
    }
    return -1;
  }

  _insertHighScore(initials, score, fighter, daily=false){
    const list = daily ? this.dailyHighScores : this.highScores;
    const key = daily ? LS_DAILY_HIGHSCORE_KEY : LS_HIGHSCORE_KEY;
    const entry = { initials: initials.join(''), score, fighter };
    let rank = list.findIndex(h => score > h.score);
    if(rank === -1) rank = list.length;
    list.splice(rank, 0, entry);
    if(list.length > 5) list.length = 5;
    this._saveHighScores(key, list);
    return rank;
  }

  _startTransition(next){
    this._prevScreen = this.screen;
    this._prevResults = this.results;
    this._fadeT = 0;
    this.screen = next;
  }

  enterSplash(){
    this.screen = 'splash';
    this._splashT = 0;
    this._splashDone = false;
    this._splashSlamPlayed = false;
  }

  enterMenu(){
    this._startTransition('menu');
    this._hsView = false;
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

    // Track streak
    if(payload.win) this.onWin();
    else this.onLose();

    // Check high score
    const daily = !!payload.dailyMode;
    const rank = this._checkHighScore(payload.score, daily);
    if(rank >= 0 && rank < 5){
      this._hsEntry = {
        active: true,
        initials: ['A','A','A'],
        pos: 0,
        rank,
        score: payload.score,
        fighter: payload.fighterId,
        daily,
      };
    } else {
      this._hsEntry = null;
    }
  }

  update(dt){
    this._blink = (this._blink+dt)%1;
    this._fadeT = Math.min(this._fadeDur, this._fadeT+dt);

    const acts = this.input.consume().map(e=>e.action);

    // ===== SPLASH SCREEN =====
    if(this.screen==='splash'){
      this._splashT += dt;

      // Play intro slam SFX at the right moment
      if(this._splashT >= 0.25 && !this._splashSlamPlayed){
        this._splashSlamPlayed = true;
        this.audio.play('sfx_intro_slam', { vol: 0.9 });
      }

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

    // ===== MENU =====
    if(this.screen==='menu'){
      if(this._hsView){
        // High score view — any input goes back
        for(const a of acts){
          if(a==='ui_back' || a==='ui_confirm' || a==='light' || a==='heavy' || a==='special'){
            this.audio.play('sfx_nav');
            this._hsView = false;
          }
        }
        return;
      }

      // Debounce held inputs for menu navigation (prevent rapid-fire)
      if(!this._menuNavCooldown) this._menuNavCooldown = 0;
      this._menuNavCooldown = Math.max(0, this._menuNavCooldown - (1/60));

      for(const a of acts){
        // Up navigation: up arrow (jump) or up key tap
        if(a==='jump' || a==='dash_left'){
          if(this._menuNavCooldown <= 0){
            this._menuSel = (this._menuSel - 1 + this._menuItems.length) % this._menuItems.length;
            this.audio.play('sfx_nav');
            this._menuNavCooldown = 0.18;
          }
        }
        // Down navigation: down arrow (down_hold) or down key tap
        if(a==='crouch' || a==='dash_right'){
          if(this._menuNavCooldown <= 0){
            this._menuSel = (this._menuSel + 1) % this._menuItems.length;
            this.audio.play('sfx_nav');
            this._menuNavCooldown = 0.18;
          }
        }
        // Allow held arrows for navigation but with cooldown
        if(a==='walk_left_hold' || (a==='down_hold' && false)){
          // Ignore continuous walk_left_hold in menu to prevent rapid-fire
        }
        if(a==='walk_right_hold'){
          // Ignore continuous walk_right_hold in menu to prevent rapid-fire
        }
        if(a==='ui_confirm' || a==='light'){
          this.audio.play('sfx_select');
          if(this._menuSel === 0){
            // ARCADE
            this._dailyMode = false;
            this.navigate?.('select');
          } else if(this._menuSel === 1){
            // DAILY CHALLENGE
            this._dailyMode = true;
            this.navigate?.('select');
          } else if(this._menuSel === 2){
            // HIGH SCORES
            this._hsView = true;
          }
        }
      }
    }

    // ===== SELECT SCREEN =====
    if(this.screen==='select'){
      // Debounce held inputs for select navigation
      if(!this._selectNavCooldown) this._selectNavCooldown = 0;
      this._selectNavCooldown = Math.max(0, this._selectNavCooldown - (1/60));

      for(const a of acts){
        if(a==='ui_back' || a==='heavy' || a==='special') { this.audio.play('sfx_nav'); this.navigate?.('menu'); }
        if(a==='dash_left') { this._cycleFighter(-1); }
        if(a==='dash_right') { this._cycleFighter(+1); }
        if(a==='walk_left_hold') {
          if(this._selectNavCooldown <= 0) { this._cycleFighter(-1); this._selectNavCooldown = 0.22; }
        }
        if(a==='walk_right_hold') {
          if(this._selectNavCooldown <= 0) { this._cycleFighter(+1); this._selectNavCooldown = 0.22; }
        }
        if(a==='jump') { this._cycleDifficulty(+1); }
        if(a==='crouch' || a==='down_hold') { this._cycleDifficulty(-1); }
        if(a==='ui_confirm' || a==='light') { this.audio.play('sfx_select'); this._startFight(); }
      }
    }

    // ===== RESULTS SCREEN =====
    if(this.screen==='results'){
      this._resultsAnimT += dt;

      if(this._hsEntry?.active){
        // Debounce for high score entry
        if(!this._hsNavCooldown) this._hsNavCooldown = 0;
        this._hsNavCooldown = Math.max(0, this._hsNavCooldown - (1/60));

        for(const a of acts){
          if(a==='jump'){
            if(this._hsNavCooldown <= 0){
              const c = this._hsEntry.initials[this._hsEntry.pos];
              this._hsEntry.initials[this._hsEntry.pos] = String.fromCharCode(((c.charCodeAt(0) - 65 + 1) % 26) + 65);
              this.audio.play('sfx_nav');
              this._hsNavCooldown = 0.12;
            }
          }
          if(a==='down_hold' || a==='crouch'){
            if(this._hsNavCooldown <= 0){
              const c = this._hsEntry.initials[this._hsEntry.pos];
              this._hsEntry.initials[this._hsEntry.pos] = String.fromCharCode(((c.charCodeAt(0) - 65 + 25) % 26) + 65);
              this.audio.play('sfx_nav');
              this._hsNavCooldown = 0.12;
            }
          }
          if(a==='dash_right'){
            if(this._hsEntry.pos < 2) { this._hsEntry.pos++; this.audio.play('sfx_nav'); }
          }
          if(a==='walk_right_hold'){
            if(this._hsEntry.pos < 2 && this._hsNavCooldown <= 0) { this._hsEntry.pos++; this.audio.play('sfx_nav'); this._hsNavCooldown = 0.22; }
          }
          if(a==='dash_left'){
            if(this._hsEntry.pos > 0) { this._hsEntry.pos--; this.audio.play('sfx_nav'); }
          }
          if(a==='walk_left_hold'){
            if(this._hsEntry.pos > 0 && this._hsNavCooldown <= 0) { this._hsEntry.pos--; this.audio.play('sfx_nav'); this._hsNavCooldown = 0.22; }
          }
          if(a==='ui_confirm' || a==='light'){
            this._insertHighScore(this._hsEntry.initials, this._hsEntry.score, this._hsEntry.fighter, this._hsEntry.daily);
            this._hsEntry.active = false;
            this.audio.play('sfx_select');
          }
        }
      } else {
        for(const a of acts){
          if(a==='ui_confirm' || a==='light') { this.audio.play('sfx_select'); this.navigate?.('select'); }
          if(a==='ui_back' || a==='heavy' || a==='special') { this.audio.play('sfx_nav'); this.navigate?.('menu'); }
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
    const daily = this._dailyMode ? this._dailyChallenge : null;
    const mod = daily;

    let p2=this.sel.opponent;
    if(daily?.mod?.mirror) p2=this.sel.fighter;

    // Pass streak difficulty bonus
    const streakBonus = this.getStreakDifficultyBonus();

    this.navigate?.('fight', {
      p1Id:this.sel.fighter,
      p2Id:p2,
      difficulty:this.sel.difficulty,
      dailyMod:daily,
      streakBonus,
      dailyMode: this._dailyMode,
      streak: this._streak.current,
    });
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

  // ===== SPLASH / INTRO SEQUENCE =====
  _renderSplash(){
    const c = this.renderer.ctx;
    c.setTransform(1,0,0,1,0,0);
    const t = this._splashT;

    // Black background
    c.fillStyle = '#000';
    c.fillRect(0,0,600,600);

    // Phase 1: Logo slam (0-1.2s)
    if(t < 1.4){
      const progress = Math.min(t / 0.3, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      const scale = 1 + (1 - easeOut) * 3;
      const alpha = easeOut;

      c.save();
      c.globalAlpha = alpha;
      c.translate(300, 180);
      c.scale(scale, scale);

      // Impact flash at landing
      if(t > 0.25 && t < 0.55){
        c.save();
        const flashA = Math.max(0, (0.55 - t) / 0.3);
        c.globalAlpha = flashA * 0.85;
        c.fillStyle = '#fff';
        c.fillRect(-300,-200,600,400);
        c.restore();
      }

      // Shockwave ring
      if(t > 0.28 && t < 0.8){
        const ringT = (t - 0.28) / 0.52;
        c.save();
        c.globalAlpha = (1 - ringT) * 0.6;
        c.strokeStyle = 'rgba(120,240,255,0.8)';
        c.lineWidth = 3 * (1 - ringT);
        c.beginPath();
        c.arc(0, 0, ringT * 200, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }

      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 52px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle = '#fff';
      c.shadowColor = 'rgba(120,240,255,0.9)';
      c.shadowBlur = 30 + Math.sin(t * 8) * 5;
      c.fillText('PIXEL', 0, -30);

      c.font = '900 68px Impact, 'Arial Black', system-ui, sans-serif';
      c.shadowColor = 'rgba(210,150,255,0.9)';
      c.shadowBlur = 34 + Math.sin(t * 6) * 5;
      c.fillText('BRAWL', 0, 45);
      c.restore();
    }

    // Phase 2: Character silhouettes with dramatic reveal (0.9-2.4s)
    if(t > 0.9 && t < 2.6){
      const charT = (t - 0.9);
      const fighters = ['blaze','granite','shade','volt'];
      const positions = [110, 230, 370, 490];

      for(let i = 0; i < 4; i++){
        const delay = i * 0.18;
        const charProgress = clamp01((charT - delay) / 0.25);
        if(charProgress <= 0) continue;

        const fid = fighters[i];
        const im = this.sprites?.sprites?.[fid]?.idle;
        const x = positions[i];

        c.save();
        // Slide up from bottom
        const slideY = 500 - charProgress * 60;
        c.globalAlpha = charProgress * 0.85;
        c.translate(x, slideY);

        const pal = fighterPalette(fid);
        c.shadowColor = withAlpha(pal.glow, 0.9);
        c.shadowBlur = 24;

        if(im){
          c.filter = `brightness(0.25) saturate(1.8)`;
          c.drawImage(im, -80, -200, 160, 200);
          c.filter = 'none';

          // Glow outline
          c.globalCompositeOperation = 'screen';
          c.globalAlpha = charProgress * 0.3;
          c.shadowBlur = 30;
          c.drawImage(im, -80, -200, 160, 200);
          c.globalCompositeOperation = 'source-over';
        }

        // Fighter icon
        c.textAlign = 'center';
        c.font = '600 28px Impact, 'Arial Black', system-ui, sans-serif';
        c.fillStyle = withAlpha(pal.glow, charProgress);
        c.shadowColor = withAlpha(pal.glow, 0.8);
        c.shadowBlur = 16;
        c.fillText(FIGHTERS[fid].icon, 0, -220);

        c.restore();
      }
    }

    // Phase 3: Fade to black (2.6-3.2s)
    if(t > 2.6){
      const fadeProgress = clamp01((t - 2.6) / 0.6);
      c.save();
      c.globalAlpha = fadeProgress;
      c.fillStyle = '#000';
      c.fillRect(0,0,600,600);
      c.restore();
    }

    // "Press any key" after 1.5s
    if(t > 1.5 && t < 2.8){
      const blink = Math.sin(t * 4) > 0;
      c.save();
      c.globalAlpha = blink ? 0.7 : 0.35;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '700 14px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillText('CLICK TO SKIP', 300, 560);
      c.restore();
    }

    // Scanlines over everything
    c.save();
    c.globalAlpha = 0.05;
    c.fillStyle = '#000';
    for(let y=0; y<600; y+=3) c.fillRect(0,y,600,1);
    c.restore();

    // Film grain
    c.save();
    c.globalAlpha = 0.03;
    c.globalCompositeOperation = 'overlay';
    for(let i = 0; i < 40; i++){
      const gx = Math.random() * 600;
      const gy = Math.random() * 600;
      c.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
      c.fillRect(gx, gy, 2, 2);
    }
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
    c.globalAlpha = 0.55;
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


  // ===== MAIN MENU =====
  _renderMenu(){
    const c=this.renderer.ctx;
    c.setTransform(1,0,0,1,0,0);

    this._drawBg('title');

    // Title
    neonText(c, 'PIXEL', 300, 88, { size:56, glow:'rgba(120,240,255,0.9)', blur:30, weight:900 });
    neonText(c, 'BRAWL', 300, 152, { size:70, glow:'rgba(210,150,255,0.85)', blur:34, weight:900 });

    // High scores view
    if(this._hsView){
      this._renderHighScoreView();
      return;
    }

    // Menu items
    const itemY = 240;
    const itemH = 54;
    const itemGap = 10;

    for(let i = 0; i < this._menuItems.length; i++){
      const y = itemY + i * (itemH + itemGap);
      const selected = (i === this._menuSel);
      const item = this._menuItems[i];

      // Panel
      const panelAlpha = selected ? 0.18 : 0.06;
      const borderColor = selected ? 'rgba(120,240,255,0.7)' : 'rgba(255,255,255,0.12)';
      const bgFill = selected ? `rgba(120,240,255,${panelAlpha})` : `rgba(255,255,255,${panelAlpha})`;

      fillRoundRect(c, 100, y, 400, itemH, 12, bgFill);
      strokeRoundRect(c, 100, y, 400, itemH, 12, borderColor, selected ? 2 : 1);

      // Arrow indicator
      if(selected){
        c.save();
        c.textAlign = 'left';
        c.font = '900 20px Impact, 'Arial Black', system-ui, sans-serif';
        c.fillStyle = 'rgba(120,240,255,0.9)';
        c.shadowColor = 'rgba(120,240,255,0.7)';
        c.shadowBlur = 10;
        const pulse = 0.7 + 0.3 * Math.sin(this._blink * Math.PI * 2);
        c.globalAlpha = pulse;
        c.fillText('▶', 115, y + itemH/2 + 2);
        c.restore();
      }

      // Label
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `${selected ? '900' : '700'} ${selected ? 20 : 18}px Impact, 'Arial Black', system-ui, sans-serif`;
      c.fillStyle = selected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)';
      if(selected){
        c.shadowColor = 'rgba(120,240,255,0.6)';
        c.shadowBlur = 12;
      }
      c.fillText(item, 300, y + itemH/2 + 1);
      c.restore();

      // Daily challenge: show today's modifier
      if(i === 1){
        const daily = this._dailyChallenge;
        c.save();
        c.textAlign = 'center';
        c.font = '600 11px Impact, 'Arial Black', system-ui, sans-serif';
        c.fillStyle = 'rgba(255,215,64,0.75)';
        c.fillText(`${daily.icon} ${daily.name}`, 300, y + itemH - 6);
        c.restore();
      }
    }

    // Win streak display
    if(this._streak.current > 0 || this._streak.best > 0){
      const streakY = 448;
      this._panel(120, streakY, 360, 48, 'rgba(255,215,64,0.7)');
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '800 13px Impact, 'Arial Black', system-ui, sans-serif';

      if(this._streak.current > 0){
        c.fillStyle = 'rgba(255,215,64,0.95)';
        c.shadowColor = 'rgba(255,215,64,0.7)';
        c.shadowBlur = 12;
        c.fillText(`🔥 ${this._streak.current} WIN STREAK`, 300, streakY + 16);
      }

      c.shadowBlur = 0;
      c.font = '600 11px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.fillText(`BEST STREAK: ${this._streak.best}`, 300, streakY + 36);
      c.restore();
    }

    // Controls hint
    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.fillStyle='rgba(255,255,255,0.45)';
    c.font='600 11px Impact, 'Arial Black', system-ui, sans-serif';
    c.fillText('↑↓ Navigate   Click to Select', 300, 510);
    c.fillText('← → Move   ↑ Jump   ↓ Block   L-Click Attack   R-Click Special', 300, 530);
    c.restore();

    // Mini high scores
    this._renderHighScoreTable(100, 555, 400, 40);
  }

  _renderHighScoreView(){
    const c = this.renderer.ctx;

    // Full-screen high scores panel
    this._panel(40, 200, 520, 340, 'rgba(255,215,64,0.7)');

    neonText(c, '🏆 HIGH SCORES', 300, 228, {
      size:26, glow:'rgba(255,215,64,0.9)', color:'rgba(255,245,190,0.95)', blur:20, weight:900
    });

    // Arcade scores
    c.save();
    c.textAlign = 'center';
    c.font = '800 14px Impact, 'Arial Black', system-ui, sans-serif';
    c.fillStyle = 'rgba(120,240,255,0.9)';
    c.fillText('ARCADE', 190, 268);

    c.fillStyle = 'rgba(255,215,64,0.9)';
    c.fillText('DAILY', 420, 268);
    c.restore();

    // Arcade column
    this._drawScoreColumn(60, 288, 230, this.highScores);

    // Daily column
    this._drawScoreColumn(320, 288, 230, this.dailyHighScores);

    // Separator
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.15)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(300, 260);
    c.lineTo(300, 510);
    c.stroke();
    c.restore();

    // Back hint
    const blink = (this._blink<0.5);
    c.save();
    c.globalAlpha = blink?0.85:0.45;
    neonText(c, 'CLICK TO GO BACK', 300, 520, { size:14, glow:'rgba(120,240,255,0.8)', blur:14, weight:700, stroke:false });
    c.restore();
  }

  _drawScoreColumn(x, y, w, scores){
    const c = this.renderer.ctx;
    c.save();
    c.font = '700 12px Impact, 'Arial Black', system-ui, sans-serif';
    for(let i = 0; i < Math.min(5, scores.length); i++){
      const s = scores[i];
      const sy = y + i * 28;
      const isGold = i === 0;

      c.fillStyle = isGold ? 'rgba(255,215,64,0.95)' : 'rgba(255,255,255,0.75)';
      c.textAlign = 'left';
      const icon = FIGHTERS[s.fighter]?.icon || '🎮';
      c.fillText(`${i+1}. ${icon} ${s.initials}`, x, sy);
      c.textAlign = 'right';
      c.fillText(s.score.toLocaleString(), x + w, sy);
    }
    c.restore();
  }

  _renderHighScoreTable(x, y, w, h){
    const c = this.renderer.ctx;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.font = '800 11px Impact, 'Arial Black', system-ui, sans-serif';
    c.fillStyle = 'rgba(255,215,64,0.85)';
    c.fillText('HIGH SCORES', x + w/2, y);

    c.font = '700 10px Impact, 'Arial Black', system-ui, sans-serif';
    const scores = this.highScores.slice(0, 3);
    for(let i = 0; i < scores.length; i++){
      const hs = scores[i];
      const sy = y + 16 + i * 14;
      c.fillStyle = i === 0 ? 'rgba(255,215,64,0.95)' : 'rgba(255,255,255,0.65)';
      c.textAlign = 'left';
      c.fillText(`${i+1}. ${hs.initials}`, x + 80, sy);
      c.textAlign = 'right';
      c.fillText(hs.score.toLocaleString(), x + w - 80, sy);
    }
    c.restore();
  }

  _statBar(x,y,label,val,max, accent){
    const c=this.renderer.ctx;
    c.save();
    c.textBaseline='top';
    c.font='800 11px Impact, 'Arial Black', system-ui, sans-serif';
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


  // ===== SELECT SCREEN =====
  _renderSelect(){
    const c=this.renderer.ctx;
    c.setTransform(1,0,0,1,0,0);

    this._drawBg('arena');

    const unlocks=this.progression.unlocks();
    const lvl=this.progression.playerLevel;

    const f=FIGHTERS[this.sel.fighter];
    const pal = fighterPalette({ id:f.id, color:f.colors.core, glow:f.colors.glow });

    // Mode banner
    if(this._dailyMode){
      const daily = this._dailyChallenge;
      this._panel(80, 8, 440, 42, 'rgba(255,215,64,0.85)');
      c.save();
      c.textAlign='center';
      c.textBaseline='middle';
      c.font='900 14px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle='rgba(255,245,190,0.95)';
      c.shadowColor='rgba(255,215,64,0.7)';
      c.shadowBlur=10;
      c.fillText(`${daily.icon} DAILY: ${daily.name}`, 300, 22);
      c.shadowBlur=0;
      c.font='600 10px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle='rgba(255,255,255,0.75)';
      c.fillText(daily.desc, 300, 38);
      c.restore();

      neonText(c, 'SELECT FIGHTER', 300, 72, { size:26, glow:withAlpha(pal.glow,0.9), blur:22, weight:900 });
    } else {
      neonText(c, 'SELECT FIGHTER', 300, 38, { size:32, glow:withAlpha(pal.glow,0.9), blur:22, weight:900 });
    }

    const panelTop = this._dailyMode ? 96 : 86;

    // arrows
    c.save();
    c.globalCompositeOperation='screen';
    c.shadowColor = withAlpha(pal.glow,0.8);
    c.shadowBlur = 18;
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font='900 28px Impact, 'Arial Black', system-ui, sans-serif';
    c.textAlign='center';
    c.fillText('◀', 92, panelTop + 84);
    c.fillText('▶', 508, panelTop + 84);
    c.restore();

    this._panel(110, panelTop, 380, 260, pal.glow);

    const im = this.sprites?.sprites?.[f.id]?.idle;
    if(im){
      c.save();
      c.translate(300, panelTop + 240);
      c.imageSmoothingEnabled = true;
      c.shadowColor = withAlpha(pal.glow, 0.95);
      c.shadowBlur = 18;
      const w = 240, h = 240;
      c.drawImage(im, -w/2, -h, w, h);
      c.shadowBlur = 0;
      c.restore();
    }

    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.font='900 40px Impact, 'Arial Black', system-ui, sans-serif';
    c.fillStyle = withAlpha(pal.top || pal.primary, 0.95);
    c.shadowColor = withAlpha(pal.glow, 0.8);
    c.shadowBlur = 20;
    c.fillText(f.icon, 300, panelTop + 12);
    c.restore();

    neonText(c, f.name, 300, panelTop + 60, { size:34, glow:withAlpha(pal.glow,0.9), blur:24, weight:900 });

    const maxHP = Math.max(...Object.values(FIGHTERS).map(x=>x.health));
    const maxDash = Math.max(...Object.values(FIGHTERS).map(x=>x.dashPx));
    const maxRange = Math.max(...Object.values(FIGHTERS).map(x=>x.range.heavy));

    const statY = panelTop + 275;
    this._statBar(120, statY, 'HP', f.health, maxHP, pal.glow);
    this._statBar(120, statY+22, 'SPEED', f.dashPx, maxDash, pal.glow);
    this._statBar(120, statY+44, 'RANGE', f.range.heavy, maxRange, pal.glow);

    // difficulty (only in arcade mode)
    if(!this._dailyMode){
      const diffs=['easy','normal','hard','nightmare'];
      const allowed = new Set(['easy','normal'].concat(unlocks.hard?['hard']:[]).concat(unlocks.nightmare?['nightmare']:[]));

      c.save();
      c.textAlign='center';
      c.textBaseline='top';
      c.font='800 12px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle='rgba(255,255,255,0.82)';
      c.fillText('DIFFICULTY  (UP / DOWN)', 300, statY + 70);
      c.restore();

      const bx=110, by=statY+88, bw=95, bh=30, gap=10;
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
        c.font='800 11px Impact, 'Arial Black', system-ui, sans-serif';
        c.fillStyle = ok ? (on?'rgba(255,255,255,0.95)':'rgba(255,255,255,0.80)') : 'rgba(255,255,255,0.30)';
        c.fillText(d.toUpperCase(), x+bw/2, by+bh/2+1);
        c.restore();
      }
    }

    // Win streak display during select
    if(this._streak.current > 0){
      const streakY = this._dailyMode ? statY + 72 : statY + 126;
      c.save();
      c.textAlign='center';
      c.font='800 14px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle='rgba(255,215,64,0.95)';
      c.shadowColor='rgba(255,215,64,0.7)';
      c.shadowBlur=12;
      c.fillText(`🔥 ${this._streak.current} WIN STREAK`, 300, streakY);
      c.restore();
    }

    // footer
    c.save();
    c.textAlign='center';
    c.textBaseline='top';
    c.font='650 10px Impact, 'Arial Black', system-ui, sans-serif';
    c.fillStyle='rgba(255,255,255,0.50)';
    c.fillText(`Level ${lvl}  •  Volt@10  Hard@15  Nightmare@25`, 300, 565);
    c.restore();

    const blink = (this._blink<0.5);
    c.save();
    c.globalAlpha = blink?0.95:0.55;
    neonText(c, 'CLICK TO FIGHT', 300, 548, { size:16, glow:withAlpha(pal.glow,0.95), blur:18, weight:900, stroke:false });
    c.restore();
  }


  // ===== RESULTS SCREEN =====
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
    c.translate(300, 52);
    c.scale(titleScale, titleScale);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 56px Impact, 'Arial Black', system-ui, sans-serif';
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
    this._panel(40, 100, 520, 280, glow);

    const stats = r.stats || {};

    const statLines = [
      { label: 'SCORE', value: r.score?.toLocaleString() || '0', delay: 0.2 },
      { label: 'XP EARNED', value: `+${r.xp || 0}`, delay: 0.35 },
      { label: 'ROUNDS', value: `${r.rounds.p1}-${r.rounds.p2}`, delay: 0.5 },
      { label: 'HITS LANDED', value: `${stats.hitsLanded || 0}`, delay: 0.65 },
      { label: 'MAX COMBO', value: `${stats.maxStreak || 0}`, delay: 0.8 },
      { label: 'DAMAGE DEALT', value: `${stats.damageDealt || 0}`, delay: 0.95 },
      { label: 'DAMAGE TAKEN', value: `${stats.damageTaken || 0}`, delay: 1.1 },
      { label: 'DIFFICULTY', value: (r.difficulty||'normal').toUpperCase(), delay: 1.25 },
    ];

    c.save();
    c.textBaseline = 'top';
    for(let i = 0; i < statLines.length; i++){
      const sl = statLines[i];
      const alpha = clamp01((t - sl.delay) * 4);
      if(alpha <= 0) continue;

      c.globalAlpha = alpha;
      const y = 116 + i * 28;

      c.textAlign = 'left';
      c.font = '700 13px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.fillText(sl.label, 70, y);

      c.textAlign = 'right';
      c.font = '800 13px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.fillText(sl.value, 530, y);
    }
    c.restore();

    // Win streak badge
    if(t > 1.4 && this._streak.current > 0){
      const alpha = clamp01((t - 1.4) * 3);
      c.save();
      c.globalAlpha = alpha;
      c.textAlign = 'center';
      c.font = '900 16px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle = 'rgba(255,215,64,0.95)';
      c.shadowColor = 'rgba(255,215,64,0.8)';
      c.shadowBlur = 14;
      c.fillText(`🔥 ${this._streak.current} WIN STREAK`, 300, 352);
      c.restore();
    }

    // Best scores
    if(t > 1.6){
      const alpha = clamp01((t - 1.6) * 3);
      c.save();
      c.globalAlpha = alpha;
      c.textAlign = 'center';
      c.font = '700 11px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle = 'rgba(255,215,64,0.85)';
      c.fillText(`Fighter Best: ${(r.fighterBest||0).toLocaleString()}   Overall Best: ${(r.overallBest||0).toLocaleString()}`, 300, 385);
      c.restore();
    }

    // Fighter sprite
    const fid = r.fighterId;
    const fdef = FIGHTERS[fid];
    if(fdef){
      const fpal = fighterPalette({ id:fid, color:fdef.colors.core, glow:fdef.colors.glow });
      const im = this.sprites?.sprites?.[fid]?.[win?'victory':'ko'];
      if(im){
        c.save();
        c.translate(300, 500);
        c.imageSmoothingEnabled = true;
        c.shadowColor = withAlpha(fpal.glow, 0.9);
        c.shadowBlur = 16;
        c.drawImage(im, -75, -150, 150, 150);
        c.shadowBlur = 0;
        c.restore();
      }
    }

    // Continue prompt
    if(t > 2.0){
      const blink = (this._blink<0.5);
      c.save();
      c.globalAlpha = blink?0.95:0.55;
      neonText(c, 'CLICK TO CONTINUE', 300, 530, { size:14, glow, blur:18, weight:900, stroke:false });
      c.restore();
    }

    // High score table
    this._renderHighScoreTable(100, 555, 400, 40);
  }

  _renderHighScoreEntry(r){
    const c = this.renderer.ctx;
    const hs = this._hsEntry;

    // "NEW HIGH SCORE!" banner
    neonText(c, 'NEW HIGH SCORE!', 300, 140, {
      size:30, glow:'rgba(255,215,64,0.95)', color:'rgba(255,245,190,0.95)', blur:24, weight:900
    });

    c.save();
    c.textAlign = 'center';
    c.font = '900 26px Impact, 'Arial Black', system-ui, sans-serif';
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillText(r.score?.toLocaleString() || '0', 300, 190);
    c.restore();

    // Daily badge if applicable
    if(hs.daily){
      c.save();
      c.textAlign = 'center';
      c.font = '700 12px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle = 'rgba(255,215,64,0.8)';
      c.fillText(`${this._dailyChallenge.icon} DAILY CHALLENGE`, 300, 218);
      c.restore();
    }

    // Initial entry
    neonText(c, 'ENTER YOUR INITIALS', 300, 252, {
      size:15, glow:'rgba(120,240,255,0.8)', blur:14, weight:700
    });

    // 3 letter boxes with CRT glow
    for(let i = 0; i < 3; i++){
      const x = 210 + i * 65;
      const y = 280;
      const selected = (i === hs.pos);

      // CRT glow effect on selected
      if(selected){
        c.save();
        c.shadowColor = 'rgba(255,215,64,0.5)';
        c.shadowBlur = 20;
        fillRoundRect(c, x-2, y-2, 56, 66, 12, 'rgba(255,215,64,0.08)');
        c.restore();
      }

      fillRoundRect(c, x, y, 52, 62, 10, selected ? 'rgba(255,215,64,0.2)' : 'rgba(255,255,255,0.08)');
      strokeRoundRect(c, x, y, 52, 62, 10, selected ? 'rgba(255,215,64,0.8)' : 'rgba(255,255,255,0.2)', selected ? 2.5 : 1);

      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 34px Impact, 'Arial Black', system-ui, sans-serif';
      c.fillStyle = selected ? 'rgba(255,215,64,0.95)' : 'rgba(255,255,255,0.85)';
      if(selected){
        c.shadowColor = 'rgba(255,215,64,0.8)';
        c.shadowBlur = 16;
      }
      c.fillText(hs.initials[i], x + 26, y + 33);
      c.restore();

      // Arrow indicators
      if(selected){
        c.save();
        c.textAlign = 'center';
        c.font = '600 16px Impact, 'Arial Black', system-ui, sans-serif';
        c.fillStyle = 'rgba(255,215,64,0.7)';
        c.fillText('▲', x + 26, y - 14);
        c.fillText('▼', x + 26, y + 78);
        c.restore();
      }
    }

    // Instructions
    c.save();
    c.textAlign = 'center';
    c.font = '600 11px Impact, 'Arial Black', system-ui, sans-serif';
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillText('↑↓ Change Letter  ←→ Move  Click to Confirm', 300, 378);
    c.restore();

    // Current high score table
    const scoreList = hs.daily ? this.dailyHighScores : this.highScores;
    this._panel(90, 405, 420, 140, 'rgba(255,215,64,0.5)');
    c.save();
    c.textAlign = 'center';
    c.font = '800 12px Impact, 'Arial Black', system-ui, sans-serif';
    c.fillStyle = 'rgba(255,215,64,0.85)';
    c.fillText(hs.daily ? 'DAILY HIGH SCORES' : 'HIGH SCORES', 300, 418);

    const scores = scoreList.slice(0, 5);
    for(let i = 0; i < scores.length; i++){
      const s = scores[i];
      const sy = 440 + i * 18;
      const isNew = (i === hs.rank);
      const icon = FIGHTERS[s.fighter]?.icon || '🎮';
      c.fillStyle = isNew ? 'rgba(255,215,64,0.95)' : 'rgba(255,255,255,0.65)';
      c.textAlign = 'left';
      c.font = `${isNew?'800':'700'} 11px Impact, 'Arial Black', system-ui, sans-serif`;
      c.fillText(`${i+1}. ${icon} ${s.initials}`, 140, sy);
      c.textAlign = 'right';
      c.fillText(s.score.toLocaleString(), 460, sy);
    }
    c.restore();
  }
}
