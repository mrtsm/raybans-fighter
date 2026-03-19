import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { AudioManager } from './audio.js';
import { UI } from './ui.js';
import { Fight } from './fight.js';
import { Progression } from './progression.js';
import { SpriteManager } from './sprites.js';

const FPS = 60;
const DT = 1 / FPS;

export function boot(canvas){
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  ctx.imageSmoothingEnabled = false;

  const sprites = new SpriteManager();
  const renderer = new Renderer(canvas, ctx, sprites);
  const input = new Input(canvas);
  const audio = new AudioManager();
  const progression = new Progression();
  const ui = new UI({ renderer, input, audio, progression, sprites });

  const game = {
    canvas, ctx, renderer, input, audio, progression, ui,
    mode: 'boot',
    fight: null,
    t: 0,
    setMode(mode, payload={}){
      this.mode = mode;
      if(mode === 'splash') ui.enterSplash();
      if(mode === 'menu') ui.enterMenu();
      if(mode === 'select') ui.enterSelect(payload);
      if(mode === 'fight'){
        this.fight = new Fight({ renderer, input, audio, progression, sprites, ...payload });
        this.fight.start();
      }
      if(mode === 'results') ui.enterResults(payload);
    }
  };
  ui.navigate = (mode, payload={}) => game.setMode(mode, payload);

  let loadProgress = 0;
  let assetsReady = false;
  let gameStarted = false;

  // Click/tap to start — this also unlocks audio
  const startGame = () => {
    if(!assetsReady || gameStarted) return;
    gameStarted = true;
    // Force audio unlock — this click IS the user gesture
    audio._unlocked = true;
    if(audio.ctx && audio.ctx.state !== 'running'){
      audio.ctx.resume().catch(()=>{});
    }
    audio.playMusic('music_menu');
    // Clear any queued input so this click doesn't carry through to menus
    input.consume();
    game.setMode('splash');
    canvas.removeEventListener('click', startGame);
    canvas.removeEventListener('pointerdown', startGame);
    canvas.removeEventListener('mousedown', startGame);
    window.removeEventListener('keydown', startGame);
  };
  canvas.addEventListener('click', startGame);
  canvas.addEventListener('pointerdown', startGame);
  canvas.addEventListener('mousedown', startGame);
  window.addEventListener('keydown', startGame);

  (async () => {
    // Start audio pre-fetch + gesture listener setup (non-blocking)
    // AudioContext is created lazily on first user interaction
    audio.init().catch(e => console.warn('Audio init error (non-fatal):', e));
    // Don't play music here — wait for user click (startGame) to unlock audio first
    // Load sprites (this is the visible progress bar)
    try {
      await sprites.loadAll((p) => { loadProgress = p; });
    } catch(e) { console.error('Sprite load error:', e); }
    assetsReady = true;
    // Don't start game yet — wait for user click (which unlocks audio)
  })();

  // Pause/resume audio when tab/app is hidden/visible
  document.addEventListener('visibilitychange', () => {
    if(document.hidden){
      audio.stopMusic();
    } else {
      // Resume appropriate music based on current game mode
      if(game.mode === 'menu' || game.mode === 'splash') audio.playMusic('music_menu');
      else if(game.mode === 'select') audio.playMusic('music_select');
      else if(game.mode === 'fight' && game.fight) audio.playMusic('music_' + game.fight.p1.id);
    }
  });

  let acc = 0;
  let last = performance.now() / 1000;

  // Pre-load title background for loading screen (loads independently of sprite system)
  const titleBgImg = new Image();
  titleBgImg.src = 'assets/sprites/title_bg.png';
  let titleBgReady = false;
  titleBgImg.onload = () => { titleBgReady = true; };

  let loadT = 0;

  function drawLoadingScreen(){
    loadT += 1/60;
    ctx.setTransform(1,0,0,1,0,0);

    // Draw title background if loaded, otherwise dark gradient
    if(titleBgReady){
      ctx.drawImage(titleBgImg, 0, 0, 600, 600);
      // Dark overlay for readability
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0,0,600,600);
    } else {
      const g = ctx.createLinearGradient(0,0,0,600);
      g.addColorStop(0,'#02050e');
      g.addColorStop(0.5,'#080c1a');
      g.addColorStop(1,'#050815');
      ctx.fillStyle = g;
      ctx.fillRect(0,0,600,600);
    }

    // Title text "PIXEL BRAWL" with pulsing glow
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // PIXEL
    ctx.font = '900 52px Impact, system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = `rgba(120,240,255,${0.6 + 0.4 * Math.sin(loadT * 3)})`;
    ctx.shadowBlur = 30 + Math.sin(loadT * 3) * 10;
    ctx.fillText('PIXEL', 300, 200);

    // BRAWL (bigger, bolder)
    ctx.font = '900 72px Impact, system-ui, sans-serif';
    ctx.shadowColor = `rgba(210,150,255,${0.6 + 0.4 * Math.sin(loadT * 3 + 1)})`;
    ctx.shadowBlur = 35 + Math.sin(loadT * 3 + 1) * 10;
    ctx.fillText('BRAWL', 300, 280);
    ctx.shadowBlur = 0;

    // Animated energy line under title
    const lineY = 320;
    const lineW = 200 + Math.sin(loadT * 2) * 30;
    const lineGrad = ctx.createLinearGradient(300 - lineW/2, lineY, 300 + lineW/2, lineY);
    lineGrad.addColorStop(0, 'rgba(120,240,255,0)');
    lineGrad.addColorStop(0.3, 'rgba(120,240,255,0.8)');
    lineGrad.addColorStop(0.5, 'rgba(210,150,255,0.9)');
    lineGrad.addColorStop(0.7, 'rgba(120,240,255,0.8)');
    lineGrad.addColorStop(1, 'rgba(120,240,255,0)');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(300 - lineW/2, lineY, lineW, 3);

    // Loading bar
    const barW = 320, barH = 10, barX = 140, barY = 500;

    // Bar background
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 5);
    ctx.fill();

    // Bar fill with animated gradient
    const fillW = barW * loadProgress;
    if(fillW > 0){
      const fg = ctx.createLinearGradient(barX, barY, barX + barW, barY);
      const shift = (loadT * 0.5) % 1;
      fg.addColorStop(0, 'rgba(120,240,255,0.9)');
      fg.addColorStop(Math.min(shift, 0.99), 'rgba(180,100,255,0.9)');
      fg.addColorStop(1, 'rgba(120,240,255,0.9)');
      ctx.fillStyle = fg;
      ctx.shadowColor = 'rgba(120,240,255,0.5)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(barX, barY, Math.max(fillW, 4), barH, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Loading percentage or "CLICK TO START"
    if(assetsReady && !gameStarted){
      const pulse = 0.6 + 0.4 * Math.sin(loadT * 4);
      ctx.font = '900 22px Impact, system-ui, sans-serif';
      ctx.fillStyle = `rgba(255,255,255,${pulse})`;
      ctx.shadowColor = `rgba(120,240,255,${pulse * 0.8})`;
      ctx.shadowBlur = 20;
      ctx.fillText('CLICK TO START', 300, 520);
      ctx.shadowBlur = 0;
    } else {
      ctx.font = '600 14px Impact, system-ui, sans-serif';
      ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.2 * Math.sin(loadT * 4)})`;
      ctx.fillText(`LOADING ${Math.round(loadProgress * 100)}%`, 300, 530);
    }

    // Bottom tagline
    ctx.font = '400 11px Impact, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('PREPARE FOR BATTLE', 300, 565);
  }

  function frame(){
    const now = performance.now() / 1000;
    let delta = now - last;
    if(delta > 0.1) delta = 0.1; // tighter cap for 60fps
    last = now;
    acc += delta;

    if(!assetsReady){
      drawLoadingScreen();
      requestAnimationFrame(frame);
      return;
    }

    // Wait for user click to start (unlocks audio)
    if(!gameStarted){
      drawLoadingScreen(); // keep showing loading screen with "CLICK TO START"
      requestAnimationFrame(frame);
      return;
    }

    // fixed updates at 60fps
    while(acc >= DT){
      game.t += DT;
      input.update(DT);
      sprites.tick(DT);
      if(game.mode === 'fight' && game.fight){
        const out = game.fight.update(DT);
        if(out?.type === 'match_end'){
          game.setMode('results', out.payload);
          game.fight = null;
        }
      } else {
        ui.update(DT);
      }
      acc -= DT;
    }

    // render
    if(game.mode === 'fight' && game.fight){
      game.fight.render();
    } else {
      ui.render();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
