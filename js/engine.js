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

  (async () => {
    try { await audio.init(); } catch(e) { console.warn('Audio init error (non-fatal):', e); }
    const audioPromise = audio.loadAll().catch(e => console.warn('Audio load error:', e));
    try {
      await sprites.loadAll((p) => { loadProgress = p; });
    } catch(e) { console.error('Sprite load error:', e); }
    await audioPromise;
    assetsReady = true;
    // Start with splash intro, NOT menu directly
    game.setMode('splash');
  })();

  let acc = 0;
  let last = performance.now() / 1000;

  // Loading screen particles
  const loadParticles = [];
  for(let i = 0; i < 40; i++){
    loadParticles.push({
      x: Math.random() * 600,
      y: Math.random() * 600,
      vx: (Math.random() - 0.5) * 20,
      vy: -Math.random() * 40 - 10,
      size: Math.random() * 3 + 1,
      alpha: Math.random() * 0.5 + 0.2,
      hue: Math.random() > 0.5 ? 190 : 270, // cyan or purple
    });
  }
  let loadT = 0;

  function drawLoadingScreen(){
    loadT += 1/60;
    ctx.setTransform(1,0,0,1,0,0);

    // Dark gradient background
    const g = ctx.createLinearGradient(0,0,0,600);
    g.addColorStop(0,'#02050e');
    g.addColorStop(0.5,'#080c1a');
    g.addColorStop(1,'#050815');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,600,600);

    // Animated particles
    for(const p of loadParticles){
      p.x += p.vx * (1/60);
      p.y += p.vy * (1/60);
      if(p.y < -10){ p.y = 610; p.x = Math.random() * 600; }
      if(p.x < -10) p.x = 610;
      if(p.x > 610) p.x = -10;
      const flicker = 0.5 + 0.5 * Math.sin(loadT * 3 + p.x * 0.01);
      ctx.fillStyle = `hsla(${p.hue},100%,70%,${p.alpha * flicker})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fighter silhouette (punch pose)
    ctx.save();
    ctx.translate(300, 320);
    const breathe = Math.sin(loadT * 2) * 2;
    const scale = 0.9;
    ctx.scale(scale, scale);
    ctx.translate(0, breathe);

    // Glow behind silhouette
    const glowPulse = 0.6 + 0.4 * Math.sin(loadT * 4);
    const glowGrad = ctx.createRadialGradient(0, -20, 10, 0, -20, 120);
    glowGrad.addColorStop(0, `rgba(120,240,255,${0.15 * glowPulse})`);
    glowGrad.addColorStop(0.5, `rgba(180,100,255,${0.08 * glowPulse})`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(-150, -180, 300, 350);

    // Draw fighter silhouette in punch pose using canvas primitives
    ctx.fillStyle = 'rgba(200,220,255,0.12)';
    ctx.strokeStyle = `rgba(120,240,255,${0.4 + 0.3 * glowPulse})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = `rgba(120,240,255,${0.6 * glowPulse})`;
    ctx.shadowBlur = 15;

    // Body torso
    ctx.beginPath();
    ctx.moveTo(-15, -80);
    ctx.lineTo(15, -80);
    ctx.lineTo(20, -10);
    ctx.lineTo(-20, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(0, -100, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Punching right arm (extended)
    ctx.beginPath();
    ctx.moveTo(15, -70);
    ctx.lineTo(50, -55);
    ctx.lineTo(85, -65);
    ctx.lineTo(85, -55);
    ctx.lineTo(48, -45);
    ctx.lineTo(15, -60);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Fist
    ctx.beginPath();
    ctx.arc(90, -60, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Left arm (pulled back)
    ctx.beginPath();
    ctx.moveTo(-15, -70);
    ctx.lineTo(-35, -50);
    ctx.lineTo(-30, -35);
    ctx.lineTo(-10, -55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(-30, 60);
    ctx.lineTo(-20, 62);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(10, -10);
    ctx.lineTo(35, 55);
    ctx.lineTo(25, 58);
    ctx.lineTo(5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Action lines radiating from fist
    ctx.shadowBlur = 8;
    for(let i = 0; i < 6; i++){
      const angle = -0.5 + i * 0.2;
      const len = 20 + Math.sin(loadT * 8 + i) * 10;
      const startR = 18;
      ctx.beginPath();
      ctx.moveTo(90 + Math.cos(angle) * startR, -60 + Math.sin(angle) * startR);
      ctx.lineTo(90 + Math.cos(angle) * (startR + len), -60 + Math.sin(angle) * (startR + len));
      ctx.strokeStyle = `rgba(120,240,255,${0.3 + 0.3 * Math.sin(loadT * 6 + i)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.restore();

    // Title text "PIXEL BRAWL" with pulsing glow
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // PIXEL
    ctx.font = '900 48px Orbitron, system-ui';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = `rgba(120,240,255,${0.6 + 0.4 * Math.sin(loadT * 3)})`;
    ctx.shadowBlur = 25 + Math.sin(loadT * 3) * 8;
    ctx.fillText('PIXEL', 300, 100);

    // BRAWL
    ctx.font = '900 62px Orbitron, system-ui';
    ctx.shadowColor = `rgba(210,150,255,${0.6 + 0.4 * Math.sin(loadT * 3 + 1)})`;
    ctx.shadowBlur = 30 + Math.sin(loadT * 3 + 1) * 8;
    ctx.fillText('BRAWL', 300, 165);
    ctx.shadowBlur = 0;

    // Loading bar
    const barW = 320, barH = 10, barX = 140, barY = 520;

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

    // Loading text
    ctx.font = '600 13px Orbitron, system-ui';
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.2 * Math.sin(loadT * 4)})`;
    ctx.fillText(`LOADING ${Math.round(loadProgress * 100)}%`, 300, 550);

    // Bottom tagline
    ctx.font = '400 10px Orbitron, system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText('PREPARE FOR BATTLE', 300, 575);
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
