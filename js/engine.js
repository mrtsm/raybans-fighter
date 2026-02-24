import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { AudioManager } from './audio.js';
import { UI } from './ui.js';
import { Fight } from './fight.js';
import { Progression } from './progression.js';
import { SpriteManager } from './sprites.js';

const FPS = 30;
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
      if(mode === 'menu') ui.enterMenu();
      if(mode === 'select') ui.enterSelect(payload);
      if(mode === 'fight'){
        this.fight = new Fight({ renderer, input, audio, progression, ...payload });
        this.fight.start();
      }
      if(mode === 'results') ui.enterResults(payload);
    }
  };
  ui.navigate = (mode, payload={}) => game.setMode(mode, payload);

  let loadProgress = 0;
  let assetsReady = false;

  (async () => {
    try { await audio.init(); } catch(e) { console.warn('Audio init error (non-fatal):', e); }
    // Load audio in background (don't block)
    const audioPromise = audio.loadAll().catch(e => console.warn('Audio load error:', e));
    // Sprites must finish before we show the game
    try {
      await sprites.loadAll((p) => { loadProgress = p; });
    } catch(e) { console.error('Sprite load error:', e); }
    // Wait for audio too (but sprites were the blocker)
    await audioPromise;
    assetsReady = true;
    game.setMode('menu');
  })();

  let acc = 0;
  let last = performance.now() / 1000;

  function drawLoadingScreen(){
    ctx.setTransform(1,0,0,1,0,0);
    // Background
    const g = ctx.createLinearGradient(0,0,0,600);
    g.addColorStop(0,'#02050e');
    g.addColorStop(1,'#050815');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,600,600);

    // Title
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 36px Orbitron, system-ui';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(120,240,255,0.6)';
    ctx.shadowBlur = 20;
    ctx.fillText('RAY-BANS FIGHTER', 300, 250);
    ctx.shadowBlur = 0;

    // Loading bar
    const barW = 300, barH = 12, barX = 150, barY = 310;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 6);
    ctx.fill();

    const fillW = barW * loadProgress;
    const fg = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    fg.addColorStop(0, 'rgba(120,240,255,0.9)');
    fg.addColorStop(1, 'rgba(180,100,255,0.9)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(fillW, 1), barH, 6);
    ctx.fill();

    // Percentage
    ctx.font = '600 14px Orbitron, system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`LOADING ${Math.round(loadProgress * 100)}%`, 300, 345);
  }

  function frame(){
    const now = performance.now() / 1000;
    let delta = now - last;
    if(delta > 0.25) delta = 0.25;
    last = now;
    acc += delta;

    if(!assetsReady){
      drawLoadingScreen();
      requestAnimationFrame(frame);
      return;
    }

    // fixed updates
    while(acc >= DT){
      game.t += DT;
      input.update(DT);
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
