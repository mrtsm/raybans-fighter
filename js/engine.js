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

  (async () => {
    console.log('[Boot] Starting asset load...');
    try { await audio.init(); console.log('[Boot] Audio init OK'); } catch(e) { console.warn('Audio init error (non-fatal):', e); }
    try { await audio.loadAll(); console.log('[Boot] Audio load OK'); } catch(e) { console.warn('Audio load error (non-fatal):', e); }
    try { await sprites.loadAll(); console.log('[Boot] Sprites load OK'); } catch(e) { console.error('Sprite load error:', e); }
    console.log('[Boot] Entering menu');
    game.setMode('menu');
  })();

  let acc = 0;
  let last = performance.now() / 1000;

  function frame(){
    const now = performance.now() / 1000;
    let delta = now - last;
    if(delta > 0.25) delta = 0.25;
    last = now;
    acc += delta;

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
