import {
  clamp01, lerp,
  fighterPalette,
  darken, withAlpha,
  fillRoundRect, strokeRoundRect, roundRectPath,
} from './sprites.js';

export class Renderer{
  constructor(canvas, ctx, spriteManager){
    this.canvas = canvas;
    this.ctx = ctx;
    this.w = canvas.width;
    this.h = canvas.height;

    this.sprites = spriteManager;
    this.spriteAnimations = null; // Set by Fight when available

    this.shake = 0;
    this.shakeT = 0;
    this.flash = null;

    this.particles = [];

    // Hit sparks
    this.hitSparks = [];

    // Motion trails
    this.trails = []; // {x, y, img, facing, alpha, t}

    // Dynamic camera zoom
    this.zoom = 1.0;
    this.zoomTarget = 1.0;
    this.zoomCenterX = this.w/2;
    this.zoomCenterY = this.h/2;

    // HUD smoothing
    this._hud = {
      p1Hp: 1,
      p2Hp: 1,
      p1Mom: 0,
      p2Mom: 0,
    };

    // Combo counter display
    this._comboDisplay = {
      count: 0,
      x: 0, y: 0,
      t: 0, // time since last hit
      maxT: 1.5, // fade after this
      scale: 1,
      color: '#ffdd44',
    };

    // KO cinematic
    this._koSequence = {
      active: false,
      t: 0,
      duration: 1.2,
      flashT: 0,
    };

    // Visual hit-freeze
    this._freezeFrames = 0;

    // Background parallax scrolling offset
    this._parallaxOffset = 0;
    this._parallaxSpeed = 12; // pixels per second for slow background scroll

    // Arena background rotation
    this._arenaBackgrounds = ['arena_bg','arena_storm','arena_volcano','arena_shadow'];
    this._currentArenaBg = 0;
  }

  clear(){
    const c = this.ctx;
    c.setTransform(1,0,0,1,0,0);
    c.clearRect(0,0,this.w,this.h);
  }

  // Set which arena background to use (by index or name)
  setArenaBg(indexOrName){
    if(typeof indexOrName === 'number'){
      this._currentArenaBg = indexOrName % this._arenaBackgrounds.length;
    } else {
      const idx = this._arenaBackgrounds.indexOf(indexOrName);
      if(idx >= 0) this._currentArenaBg = idx;
    }
  }

  // Get the current arena background image
  getArenaBgImage(){
    const key = this._arenaBackgrounds[this._currentArenaBg];
    return this.sprites?.sprites?.[key] || this.sprites?.sprites?.arena_bg;
  }

  beginScene(arenaBg){
    const c = this.ctx;

    // render-only freeze
    if(this._freezeFrames>0){
      this._freezeFrames--;
      c.setTransform(1,0,0,1,0,0);
      // Slight white flash on freeze for impact feel
      c.globalAlpha = 0.04;
      c.fillStyle = '#fff';
      c.fillRect(0,0,this.w,this.h);
      c.globalAlpha = 1;
    } else {
      this.clear();

      // Background parallax scrolling
      this._parallaxOffset += this._parallaxSpeed / 60;
      if(this._parallaxOffset > this.w) this._parallaxOffset -= this.w;

      const bg = arenaBg || this.getArenaBgImage();
      if(bg){
        c.save();
        c.imageSmoothingEnabled = true;

        // Draw far background layer (slow parallax scroll)
        const pOff = this._parallaxOffset * 0.3;
        c.globalAlpha = 0.4;
        c.drawImage(bg, -pOff, -4, this.w + 20, this.h + 8);
        c.drawImage(bg, this.w - pOff, -4, this.w + 20, this.h + 8);

        // Draw main background layer
        c.globalAlpha = 1;
        c.drawImage(bg, 0, 0, this.w, this.h);
        c.restore();
      } else {
        const g = c.createLinearGradient(0,0,0,this.h);
        g.addColorStop(0,'#02050e');
        g.addColorStop(1,'#050815');
        c.fillStyle = g;
        c.fillRect(0,0,this.w,this.h);
      }

      // Dark overlay
      c.save();
      c.globalAlpha = 0.45;
      c.fillStyle = '#000';
      c.fillRect(0,0,this.w,this.h);
      c.restore();

      // Scanlines
      c.save();
      c.globalAlpha = 0.04;
      c.fillStyle = '#000';
      for(let y=0; y<this.h; y+=3) c.fillRect(0,y,this.w,1);
      c.restore();

      // Vignette
      c.save();
      const vg = c.createRadialGradient(this.w/2, this.h*0.55, 140, this.w/2, this.h*0.55, 540);
      vg.addColorStop(0,'rgba(0,0,0,0)');
      vg.addColorStop(1,'rgba(0,0,0,0.65)');
      c.fillStyle = vg;
      c.fillRect(0,0,this.w,this.h);
      c.restore();
    }

    // Dynamic camera zoom
    this.zoom = lerp(this.zoom, this.zoomTarget, 0.08);
    if(Math.abs(this.zoom - this.zoomTarget) < 0.001) this.zoom = this.zoomTarget;

    // Camera shake
    let sx=0, sy=0;
    if(this.shakeT>0){
      this.shakeT -= 1/60;
      const intensity = this.shake * (this.shakeT / Math.max(this.shakeT + 1/60, 0.01));
      sx = (Math.random()*2-1)*intensity;
      sy = (Math.random()*2-1)*intensity;
      if(this.shakeT<=0){ this.shake=0; this.shakeT=0; }
    }

    // Apply zoom + shake transform
    const z = this.zoom;
    const cx = this.zoomCenterX;
    const cy = this.zoomCenterY;
    c.setTransform(z, 0, 0, z, (1-z)*cx + sx*z, (1-z)*cy + sy*z);
  }

  doShake(intensity=6, time=0.25){
    this.shake = Math.max(this.shake, intensity);
    this.shakeT = Math.max(this.shakeT, time);
  }

  doFreeze(frames){
    this._freezeFrames = Math.max(this._freezeFrames, frames);
  }

  doFlash(color, time=0.2){
    this.flash = { color, t: time, dur: time };
  }

  doZoom(target, duration=0.5, centerX, centerY){
    this.zoomTarget = target;
    if(centerX !== undefined) this.zoomCenterX = centerX;
    if(centerY !== undefined) this.zoomCenterY = centerY;
    // Auto-reset zoom after duration
    setTimeout(() => { this.zoomTarget = 1.0; this.zoomCenterX = this.w/2; this.zoomCenterY = this.h/2; }, duration * 1000);
  }

  startKOSequence(){
    this._koSequence.active = true;
    this._koSequence.t = 0;
    this._koSequence.flashT = 0.15;
  }

  addHitSpark(spark){
    this.hitSparks.push({...spark, t0: spark.t});
  }

  addTrail(x, y, img, facing, alpha){
    this.trails.push({ x, y, img, facing, alpha, t: 0.12 });
    if(this.trails.length > 15) this.trails.shift();
  }

  addParticles(list){
    for(const p of list){
      p.px = p.x; p.py = p.y;
      p.spin = (Math.random()*2-1)*8;
      this.particles.push(p);
    }
    if(this.particles.length>120) this.particles.splice(0, this.particles.length-120);
  }

  updateParticles(dt){
    for(const p of this.particles){
      p.t -= dt;
      p.px = p.x; p.py = p.y;
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.vy += p.g*dt;
      p.vx *= 0.985;
    }
    this.particles = this.particles.filter(p=>p.t>0);

    // Hit sparks
    for(const s of this.hitSparks) s.t -= dt;
    this.hitSparks = this.hitSparks.filter(s => s.t > 0);

    // Trails
    for(const tr of this.trails) tr.t -= dt;
    this.trails = this.trails.filter(tr => tr.t > 0);

    // KO sequence
    if(this._koSequence.active){
      this._koSequence.t += dt;
      this._koSequence.flashT -= dt;
      if(this._koSequence.t >= this._koSequence.duration){
        this._koSequence.active = false;
      }
    }

    // Combo counter fade
    if(this._comboDisplay.count > 0){
      this._comboDisplay.t += dt;
      if(this._comboDisplay.t > this._comboDisplay.maxT){
        this._comboDisplay.count = 0;
      }
    }
  }

  updateCombo(count, x, y, color){
    if(count >= 2){
      this._comboDisplay.count = count;
      this._comboDisplay.x = x;
      this._comboDisplay.y = y - 120;
      this._comboDisplay.t = 0;
      this._comboDisplay.color = color;
      this._comboDisplay.scale = 1 + Math.min(count * 0.08, 0.6);
    }
  }

  drawParticles(){
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation='screen';
    for(const p of this.particles){
      const life = clamp01(p.t/p.t0);
      const a = 0.10 + 0.90*life;
      const s = p.s;

      // trail line
      c.globalAlpha = a*0.35;
      c.strokeStyle = withAlpha(p.color, 1);
      c.lineWidth = Math.max(1, s-1);
      c.beginPath();
      c.moveTo(p.px, p.py);
      c.lineTo(p.x, p.y);
      c.stroke();

      // core spark
      c.globalAlpha = a;
      c.fillStyle = withAlpha(p.color, 1);
      c.shadowColor = withAlpha(p.color, 0.9);
      c.shadowBlur = 12;
      c.beginPath();
      c.arc(p.x, p.y, s, 0, Math.PI*2);
      c.fill();
    }
    c.restore();
  }

  drawHitSparks(){
    const c = this.ctx;
    for(const s of this.hitSparks){
      const life = clamp01(s.t / s.t0);
      const size = s.size * life;

      c.save();
      c.globalCompositeOperation = 'screen';

      // Radial flash
      const g = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, size);
      g.addColorStop(0, `rgba(255,255,255,${0.95*life})`);
      g.addColorStop(0.3, withAlpha(s.color, 0.8*life));
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(s.x - size, s.y - size, size*2, size*2);

      // Slash lines
      c.strokeStyle = `rgba(255,255,255,${0.9*life})`;
      c.lineWidth = 2;
      const lineCount = 6;
      for(let i = 0; i < lineCount; i++){
        const angle = (Math.PI*2/lineCount)*i + (s.x * 0.1); // deterministic per spark
        const len = size * (0.4 + 0.4 * Math.sin(i*2.1));
        c.beginPath();
        c.moveTo(s.x + Math.cos(angle)*size*0.12, s.y + Math.sin(angle)*size*0.12);
        c.lineTo(s.x + Math.cos(angle)*len, s.y + Math.sin(angle)*len);
        c.stroke();
      }

      c.restore();
    }
  }

  drawTrails(){
    const c = this.ctx;
    for(const tr of this.trails){
      if(!tr.img) continue;
      const life = clamp01(tr.t / 0.12);
      c.save();
      c.globalAlpha = life * 0.25;
      c.globalCompositeOperation = 'screen';
      const drawH = 170;
      const drawW = drawH;
      c.translate(tr.x, tr.y);
      if(tr.facing === 1) c.scale(-1,1);
      c.drawImage(tr.img, -drawW/2, -drawH, drawW, drawH);
      c.restore();
    }
  }

  drawComboCounter(){
    const cd = this._comboDisplay;
    if(cd.count < 2) return;

    const c = this.ctx;
    const life = clamp01(1 - cd.t / cd.maxT);
    const popScale = cd.t < 0.1 ? 1.3 : 1.0;

    c.save();
    c.translate(cd.x, cd.y);
    c.scale(cd.scale * popScale, cd.scale * popScale);
    c.globalAlpha = life;

    // Number
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 36px Orbitron, system-ui';
    c.fillStyle = cd.color;
    c.shadowColor = withAlpha(cd.color, 0.9);
    c.shadowBlur = 20;
    c.fillText(`${cd.count}`, 0, 0);

    // Label
    c.font = '800 14px Orbitron, system-ui';
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.shadowColor = withAlpha(cd.color, 0.7);
    c.shadowBlur = 14;
    const label = cd.count >= 10 ? 'LEGENDARY!' :
                  cd.count >= 7 ? 'INCREDIBLE!' :
                  cd.count >= 5 ? 'AWESOME!' :
                  cd.count >= 3 ? 'COMBO!' : 'HIT';
    c.fillText(label, 0, 24);

    c.restore();
  }

  drawDamageNumbers(numbers){
    const c = this.ctx;
    for(const dn of numbers){
      const life = clamp01(dn.t / 0.8);
      c.save();
      c.globalAlpha = life;
      c.translate(dn.x, dn.y);
      const s = dn.scale * (dn.isCrit ? 1.3 : 1.0);
      c.scale(s, s);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `900 ${dn.isCrit ? 28 : 22}px Orbitron, system-ui`;
      c.fillStyle = dn.color;
      c.shadowColor = dn.isCrit ? 'rgba(255,200,0,0.9)' : 'rgba(255,255,255,0.7)';
      c.shadowBlur = dn.isCrit ? 16 : 10;
      c.fillText(`${dn.value}`, 0, 0);
      c.restore();
    }
  }

  endScene(){
    const c = this.ctx;

    // Arena floor glow
    c.save();
    c.setTransform(1,0,0,1,0,0);
    const floorY = 490;

    c.globalCompositeOperation='screen';
    const g = c.createLinearGradient(0,floorY-2,0,floorY+2);
    g.addColorStop(0,'rgba(120,240,255,0)');
    g.addColorStop(0.5,'rgba(120,240,255,0.20)');
    g.addColorStop(1,'rgba(120,240,255,0)');
    c.fillStyle = g;
    c.fillRect(20, floorY-2, 560, 4);

    const rg = c.createLinearGradient(0,floorY,0,floorY+110);
    rg.addColorStop(0,'rgba(120,240,255,0.10)');
    rg.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle = rg;
    c.fillRect(20, floorY, 560, 110);
    c.restore();

    // KO cinematic flash
    if(this._koSequence.active && this._koSequence.flashT > 0){
      c.save();
      c.setTransform(1,0,0,1,0,0);
      c.globalAlpha = clamp01(this._koSequence.flashT / 0.15) * 0.7;
      c.fillStyle = '#fff';
      c.fillRect(0,0,this.w,this.h);
      c.restore();
    }

    // Screen flash
    if(this.flash){
      this.flash.t -= 1/60;
      const a = clamp01(this.flash.t / (this.flash.dur || 0.2));
      c.setTransform(1,0,0,1,0,0);
      c.globalCompositeOperation = 'screen';
      c.globalAlpha = 0.55*a;
      c.fillStyle = this.flash.color;
      c.fillRect(0,0,this.w,this.h);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      if(this.flash.t<=0) this.flash=null;
    }
  }

  drawHud(hud){
    const c = this.ctx;
    c.save();
    c.setTransform(1,0,0,1,0,0);

    // Smooth HP / momentum
    this._hud.p1Hp = lerp(this._hud.p1Hp, hud.p1.hpPct, 0.18);
    this._hud.p2Hp = lerp(this._hud.p2Hp, hud.p2.hpPct, 0.18);
    this._hud.p1Mom = lerp(this._hud.p1Mom, hud.p1.momentum, 0.15);
    this._hud.p2Mom = lerp(this._hud.p2Mom, hud.p2.momentum, 0.15);

    const pad=14;
    const top=10;
    const barH=22;
    const barW=(this.w - pad*3)/2;

    const hpColor = (pct)=>{
      const p = clamp01(pct);
      if(p>0.66){
        const t=(p-0.66)/0.34;
        return `rgb(${Math.round(lerp(231,34,t))},${Math.round(lerp(216,224,t))},${Math.round(lerp(79,107,t))})`;
      }
      if(p>0.33){
        const t=(p-0.33)/0.33;
        return `rgb(${Math.round(lerp(255,231,t))},${Math.round(lerp(140,216,t))},${Math.round(lerp(60,79,t))})`;
      }
      {
        const t=p/0.33;
        return `rgb(${Math.round(lerp(255,255,t))},${Math.round(lerp(59,140,t))},${Math.round(lerp(59,60,t))})`;
      }
    };

    const drawHpBar=(side, x,y, pct, name, accent)=>{
      const r=8;
      const back = c.createLinearGradient(x,y,x,y+barH);
      back.addColorStop(0,'rgba(255,255,255,0.14)');
      back.addColorStop(1,'rgba(255,255,255,0.06)');
      fillRoundRect(c,x,y,barW,barH,r, back);

      const ww = clamp01(pct)*barW;
      const fill = c.createLinearGradient(x,y,x+barW,y);
      const col = hpColor(pct);
      const darkCol = col.startsWith('rgb(')
        ? (()=>{ const m=col.match(/rgb\((\d+),(\d+),(\d+)\)/); if(!m) return col; const r=+m[1],g=+m[2],b=+m[3]; const k=0.78; return `rgb(${Math.round(r*k)},${Math.round(g*k)},${Math.round(b*k)})`; })()
        : darken(col, 0.22);
      fill.addColorStop(0, col);
      fill.addColorStop(1, darkCol);
      fillRoundRect(c, x, y, ww, barH, r, fill);

      // glass shine
      c.save();
      c.globalAlpha = 0.40;
      roundRectPath(c, x, y, barW, barH, r);
      c.clip();
      const shine = c.createLinearGradient(x,y,x,y+barH);
      shine.addColorStop(0,'rgba(255,255,255,0.32)');
      shine.addColorStop(0.55,'rgba(255,255,255,0.10)');
      shine.addColorStop(1,'rgba(255,255,255,0)');
      c.fillStyle = shine;
      c.fillRect(x,y,barW,barH);
      c.restore();

      // border
      c.save();
      c.shadowColor = 'rgba(255,255,255,0.25)';
      c.shadowBlur = 10;
      strokeRoundRect(c, x, y, barW, barH, r, 'rgba(255,255,255,0.35)', 1.5);
      c.restore();

      // name
      const ny = y+barH+6;
      c.font='800 13px Orbitron, system-ui';
      c.textBaseline='top';
      c.textAlign = side==='left'?'left':'right';
      c.fillStyle = withAlpha(accent, 0.95);
      c.fillText(name, side==='left'?x: x+barW, ny);

      c.textAlign='left';
    };

    drawHpBar('left', pad, top, this._hud.p1Hp, hud.p1.name, hud.p1.color);
    drawHpBar('right', pad*2+barW, top, this._hud.p2Hp, hud.p2.name, hud.p2.color);

    // round score
    c.fillStyle='rgba(255,255,255,0.85)';
    c.font='700 12px Orbitron, system-ui';
    c.textBaseline='top';
    c.textAlign='center';
    c.fillText(`${hud.rounds.p1}-${hud.rounds.p2}`, this.w/2, top+barH+8);

    // match score
    c.save();
    c.textAlign='right';
    c.font='800 12px Orbitron, system-ui';
    const text = `${hud.matchScore.toLocaleString()}`;
    const tw = c.measureText(text).width;
    fillRoundRect(c, this.w-pad-tw-16, top+barH+6, tw+16, 18, 8, 'rgba(0,0,0,0.35)');
    strokeRoundRect(c, this.w-pad-tw-16, top+barH+6, tw+16, 18, 8, 'rgba(255,255,255,0.12)', 1);
    c.fillStyle='rgba(255,255,255,0.85)';
    c.fillText(text, this.w-pad, top+barH+8);
    c.restore();

    // timer
    const tm = Math.ceil(hud.timer);
    const urgent = tm<=10;
    c.save();
    c.textAlign='center';
    const pulse = urgent ? (0.65 + 0.35*Math.sin(performance.now()/140)) : 1;
    c.globalAlpha = urgent ? pulse : 1;
    c.fillStyle = urgent ? 'rgba(255,80,80,0.95)' : 'rgba(255,255,255,0.92)';
    c.shadowColor = urgent ? 'rgba(255,80,80,0.9)' : 'rgba(120,240,255,0.45)';
    c.shadowBlur = urgent ? 18 : 12;
    c.font = `900 28px Orbitron, system-ui`;
    c.fillText(String(tm), this.w/2, top-2);
    c.restore();

    // Momentum bar
    const mPad = 16;
    const mY = this.h-34;
    const mH = 12;
    const mW = this.w - mPad*2;

    const track = c.createLinearGradient(0,mY,0,mY+mH);
    track.addColorStop(0,'rgba(255,255,255,0.12)');
    track.addColorStop(1,'rgba(255,255,255,0.06)');
    fillRoundRect(c, mPad, mY, mW, mH, 7, track);

    const p1 = clamp01(this._hud.p1Mom/100);
    const fill = c.createLinearGradient(mPad,mY,mPad+mW,mY);
    fill.addColorStop(0, `rgba(255,215,64,0.32)`);
    fill.addColorStop(0.55, `rgba(255,215,64,0.58)`);
    fill.addColorStop(1, `rgba(255,245,180,0.36)`);
    fillRoundRect(c, mPad, mY, mW*p1, mH, 7, fill);

    if(p1>=1){
      const pulse = 0.55 + 0.45*Math.sin(performance.now()/120);
      c.save();
      c.globalCompositeOperation='screen';
      c.globalAlpha = pulse;
      c.shadowColor = 'rgba(255,215,64,0.95)';
      c.shadowBlur = 18;
      fillRoundRect(c, mPad, mY, mW, mH, 7, 'rgba(255,215,64,0.18)');
      c.restore();

      c.save();
      c.textAlign='center';
      c.font='900 12px Orbitron, system-ui';
      c.fillStyle='rgba(255,245,190,0.95)';
      c.shadowColor='rgba(255,215,64,0.95)';
      c.shadowBlur=16;
      c.globalAlpha = 0.65 + 0.35*Math.sin(performance.now()/160);
      c.fillText('SIGNATURE READY!', this.w/2, mY-18);
      c.restore();
    }

    // Guard break indicator
    if(hud.guardBreakWarning){
      c.save();
      c.textAlign='center';
      c.font='900 16px Orbitron, system-ui';
      c.fillStyle='rgba(255,80,80,0.95)';
      c.shadowColor='rgba(255,80,80,0.9)';
      c.shadowBlur=14;
      c.fillText('GUARD BREAK!', this.w/2, this.h/2 - 60);
      c.restore();
    }

    // Win streak counter
    if(hud.winStreak && hud.winStreak.current > 0){
      const ws = hud.winStreak;
      c.save();
      c.textAlign='left';
      c.textBaseline='top';

      // Streak badge
      const badgeX = pad;
      const badgeY = top + barH + 28;

      // Background pill
      const streakColors = {
        'Warming Up': 'rgba(255,255,255,0.15)',
        'On Fire': 'rgba(255,140,0,0.25)',
        'Unstoppable': 'rgba(255,60,60,0.25)',
        'LEGENDARY': 'rgba(255,215,64,0.35)',
      };
      const bgColor = streakColors[ws.title] || 'rgba(255,255,255,0.15)';
      const textColor = ws.current >= 10 ? 'rgba(255,215,64,0.95)' :
                        ws.current >= 5 ? 'rgba(255,100,100,0.95)' :
                        ws.current >= 3 ? 'rgba(255,180,60,0.95)' :
                        'rgba(255,255,255,0.75)';

      const streakText = `🔥 ${ws.current} ${ws.title}`;
      c.font = '700 10px Orbitron, system-ui';
      const tw = c.measureText(streakText).width;
      fillRoundRect(c, badgeX, badgeY, tw + 12, 16, 8, bgColor);
      c.fillStyle = textColor;
      if(ws.current >= 10){
        c.shadowColor = 'rgba(255,215,64,0.8)';
        c.shadowBlur = 10;
      }
      c.fillText(streakText, badgeX + 6, badgeY + 3);

      // Show multiplier if active
      if(ws.multiplier > 1){
        c.textAlign = 'right';
        c.fillStyle = 'rgba(255,215,64,0.85)';
        c.font = '800 10px Orbitron, system-ui';
        c.fillText(`${ws.multiplier}× SCORE`, this.w - pad, badgeY + 3);
      }

      c.restore();
    }

    // Daily challenge modifier display
    if(hud.dailyMod){
      c.save();
      c.textAlign='center';
      c.textBaseline='top';
      const modY = top + barH + 28;
      c.font = '800 11px Orbitron, system-ui';
      c.fillStyle = 'rgba(255,215,64,0.9)';
      c.shadowColor = 'rgba(255,215,64,0.6)';
      c.shadowBlur = 10;
      c.fillText(`⚡ ${hud.dailyMod}`, this.w/2, modY);
      c.restore();
    }

    // banner
    if(hud.banner){
      c.save();
      const y = this.h/2-32;
      fillRoundRect(c, 60, y, this.w-120, 64, 14, 'rgba(0,0,0,0.55)');
      strokeRoundRect(c, 60, y, this.w-120, 64, 14, 'rgba(255,255,255,0.18)', 1.5);
      c.textAlign='center';
      c.textBaseline='middle';

      // Animated banner text
      const bannerScale = hud.bannerT !== undefined ? Math.min(1.0, hud.bannerT * 4) : 1.0;
      c.save();
      c.translate(this.w/2, y+32);
      c.scale(bannerScale, bannerScale);
      c.font='900 30px Orbitron, system-ui';
      c.fillStyle='rgba(255,255,255,0.95)';
      c.shadowColor= hud.banner === 'K.O.' ? 'rgba(255,80,80,0.9)' : 'rgba(120,240,255,0.55)';
      c.shadowBlur= hud.banner === 'K.O.' ? 24 : 18;
      c.fillText(hud.banner, 0, 0);
      c.restore();
      c.restore();
    }

    c.restore();
  }

  _getAnimatedFrame(fighterId, state, attackKind, attackProgress){
    if(!this.spriteAnimations) return null;
    return this.spriteAnimations.getFrame(fighterId, state);
  }

  drawFighter(f){
    const c=this.ctx;
    const now = performance.now();

    // ground shadow
    c.save();
    c.globalAlpha=0.22;
    c.fillStyle='#000';
    c.beginPath();
    c.ellipse(f.x, f.y+110, 34, 10, 0, 0, Math.PI*2);
    c.fill();
    c.restore();

    // momentum ring
    const ring = clamp01(f.momentum/100);
    c.save();
    c.globalCompositeOperation='screen';
    c.globalAlpha=0.85;
    c.strokeStyle = ring>=1 ? 'rgba(255,215,64,0.85)' : 'rgba(255,215,64,0.28)';
    c.lineWidth = ring>=1 ? 5:3;
    c.shadowColor = 'rgba(255,215,64,0.7)';
    c.shadowBlur = ring>=1?14:8;
    c.beginPath();
    c.arc(f.x, f.y+108, 24, -Math.PI/2, -Math.PI/2 + Math.PI*2*ring);
    c.stroke();
    c.restore();

    // Pick sprite
    const fighterId = f.id;
    const state = (
      f.state==='victory' ? 'victory' :
      f.state==='ko' ? 'ko' :
      (f.hitstunF>0 || f.state==='hit') ? 'hitstun' :
      (f.blocking!=='none' || f.state==='block') ? 'blocking' :
      (!f.onGround || f.state==='jump') ? 'jumping' :
      (f.crouching || f.state==='crouch') ? 'crouching' :
      (f.charging || f.state==='special_charge') ? 'charging' :
      (f.attack ? 'attacking' : 'idle')
    );
    const attackKind = f.attack?.kind;
    // Calculate attack progress for animation frames
    let attackProgress = undefined;
    if (f.attack) {
      const totalF = f.attack.startupF + f.attack.activeF + f.attack.recoveryF;
      attackProgress = totalF > 0 ? f.attackF / totalF : 0;
    } else if (f.charging) {
      attackProgress = f.chargePct;
    }
    const im = this._getAnimatedFrame(fighterId, state, attackKind, attackProgress) || this.sprites?.get?.(fighterId, state, attackKind, attackProgress);

    const footX = f.x;
    const footY = f.y+110;
    const scale = f._renderScale || f.scaleMul || 1.0;
    const drawH = ((state==='jumping') ? 120 : 140) * scale;
    const drawW = drawH;

    // Motion trail for attacks and dashes
    if((f.attack || f.state === 'dash') && im){
      this.addTrail(footX, footY, im, f.facing, 0.2);
    }

    if(im){
      c.save();
      c.translate(footX, footY);

      if(f.facing === 1){ c.scale(-1,1); }

      // === PROCEDURAL ANIMATION ===

      // Idle: gentle breathing bob
      if(state === 'idle' || state === 'walk'){
        const bob = Math.sin(now / 400) * 3;
        c.translate(0, bob);
        // Walk lean
        if(f.state === 'walk'){
          c.rotate(f.facing * 0.04);
        }
      }

      // Attack: squash/stretch
      if(state === 'attacking' && f.attack){
        const totalF = f.attack.startupF + f.attack.activeF + f.attack.recoveryF;
        const progress = f.attackF / totalF;
        if(progress < 0.3){
          // Wind up: stretch tall
          c.scale(0.92, 1.08);
        } else if(progress < 0.55){
          // Swing: squash wide
          c.scale(1.18, 0.85);
        } else {
          // Recovery: return to normal
          const t = (progress - 0.55) / 0.45;
          c.scale(lerp(1.18, 1.0, t), lerp(0.85, 1.0, t));
        }
      }

      // Hitstun: shake + tilt
      if(f.hitstunF > 0){
        const shake = (Math.random() - 0.5) * 8;
        c.translate(shake, 0);
        c.rotate(0.06 * Math.sin(f.hitstunF * 3));
      }

      // Dash: lean forward + stretch
      if(f.state === 'dash'){
        c.scale(1.2, 0.9);
      }

      // Guard broken: wobble
      if(f.guardBroken){
        c.rotate(Math.sin(now / 80) * 0.08);
      }

      // KO: fall tilt
      if(f.state === 'ko'){
        const tilt = Math.min(f.stateT * 3, 0.5);
        c.rotate(tilt);
        c.translate(0, Math.min(f.stateT * 30, 20));
      }

      // Last stand: red pulse glow
      if(f.lastStand){
        const pulse = 0.5 + 0.5 * Math.sin(now / 200);
        c.shadowColor = `rgba(255,60,60,${pulse * 0.8})`;
        c.shadowBlur = 20;
      }

      // Glow
      const glow = f.glow || fighterPalette(fighterId)?.glow || '#ffffff';
      if(!f.lastStand){
        c.shadowColor = withAlpha(glow, 0.95);
        c.shadowBlur = 15;
      }

      c.imageSmoothingEnabled = true;

      // White flash on hitstun
      if(f.hitstunF > 4){
        c.globalAlpha = 1;
        c.filter = 'brightness(3)';
        c.drawImage(im, -drawW/2, -drawH, drawW, drawH);
        c.filter = 'none';
      } else {
        c.drawImage(im, -drawW/2, -drawH, drawW, drawH);
      }

      c.shadowBlur = 0;
      c.restore();
    } else {
      // Fallback rectangle
      const pal = fighterPalette(fighterId);
      c.save();
      c.fillStyle = pal?.primary || f.color || '#ff00ff';
      c.globalAlpha = 0.8;
      c.fillRect(footX - 32, footY - 140, 64, 140);
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.strokeRect(footX - 32, footY - 140, 64, 140);
      c.globalAlpha = 1;
      c.fillStyle = '#fff';
      c.font = '10px system-ui';
      c.textAlign = 'center';
      c.fillText(fighterId, footX, footY - 70);
      c.restore();
    }

    // Charge meter
    if(f.chargePct>0){
      const glow = f.glow || fighterPalette(fighterId)?.glow || '#ffffff';
      c.save();
      c.globalCompositeOperation='screen';
      const w=72, h=7;
      const x=f.x-w/2;
      const y=f.y+126;
      fillRoundRect(c, x, y, w, h, 5, 'rgba(255,255,255,0.14)');
      const gg=c.createLinearGradient(x,y,x+w,y);
      gg.addColorStop(0, withAlpha(glow, 0.9));
      gg.addColorStop(1, 'rgba(255,255,255,0.95)');
      fillRoundRect(c, x, y, w*f.chargePct, h, 5, gg);
      strokeRoundRect(c, x, y, w, h, 5, 'rgba(255,255,255,0.20)', 1);
      c.restore();
    }
  }
}
