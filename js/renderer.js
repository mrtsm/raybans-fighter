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

    this.shake = 0;
    this.shakeT = 0;
    this.flash = null; // {color,t,dur}

    this.particles = [];

    // HUD smoothing
    this._hud = {
      p1Hp: 1,
      p2Hp: 1,
      p1Mom: 0,
      p2Mom: 0,
    };

    // Visual hit-freeze (render-only, does not affect sim)
    this._freezeFrames = 0;

  }

  clear(){
    const c = this.ctx;
    c.setTransform(1,0,0,1,0,0);
    c.clearRect(0,0,this.w,this.h);
  }

  beginScene(){
    const c = this.ctx;

    // render-only freeze: keep prior frame for 1–2 frames to sell impact
    if(this._freezeFrames>0){
      this._freezeFrames--;
      c.setTransform(1,0,0,1,0,0);
      c.globalAlpha = 0.06;
      c.fillStyle = '#000';
      c.fillRect(0,0,this.w,this.h);
      c.globalAlpha = 1;
    } else {
      this.clear();

      // Arena background sprite (fallback to gradient while loading)
      const bg = this.sprites?.sprites?.arena_bg;
      if(bg){
        c.save();
        c.imageSmoothingEnabled = true;
        c.globalAlpha = 1;
        c.drawImage(bg, 0,0, this.w, this.h);
        c.restore();
      } else {
        const g = c.createLinearGradient(0,0,0,this.h);
        g.addColorStop(0,'#02050e');
        g.addColorStop(1,'#050815');
        c.fillStyle = g;
        c.fillRect(0,0,this.w,this.h);
      }

      // Keep ~70% dark overlay for HUD readability
      c.save();
      c.globalAlpha = 0.70;
      c.fillStyle = '#000';
      c.fillRect(0,0,this.w,this.h);
      c.restore();

      // subtle scanlines
      c.save();
      c.globalAlpha = 0.05;
      c.fillStyle = '#000';
      for(let y=0; y<this.h; y+=4) c.fillRect(0,y,this.w,1);
      c.restore();

      // vignette
      c.save();
      const vg = c.createRadialGradient(this.w/2, this.h*0.55, 140, this.w/2, this.h*0.55, 540);
      vg.addColorStop(0,'rgba(0,0,0,0)');
      vg.addColorStop(1,'rgba(0,0,0,0.65)');
      c.fillStyle = vg;
      c.fillRect(0,0,this.w,this.h);
      c.restore();
    }

    // camera shake
    let sx=0, sy=0;
    if(this.shakeT>0){
      this.shakeT -= 1/30;
      sx = (Math.random()*2-1)*this.shake;
      sy = (Math.random()*2-1)*this.shake;
      if(this.shakeT<=0){ this.shake=0; this.shakeT=0; }
    }
    this.ctx.setTransform(1,0,0,1,sx,sy);
  }

  doShake(intensity=6, time=0.25){
    this.shake = Math.max(this.shake, intensity);
    this.shakeT = Math.max(this.shakeT, time);

    if(intensity>=8) this._freezeFrames = Math.max(this._freezeFrames, 2);
  }

  doFlash(color, time=0.2){
    this.flash = { color, t: time, dur: time };
  }

  addParticles(list){
    for(const p of list){
      p.px = p.x; p.py = p.y;
      p.spin = (Math.random()*2-1)*8;
      this.particles.push(p);
    }
    if(this.particles.length>90) this.particles.splice(0, this.particles.length-90);
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
  }

  drawParticles(){
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation='screen';
    for(const p of this.particles){
      const life = clamp01(p.t/p.t0);
      const a = 0.10 + 0.90*life;
      const s = p.s;

      // trail
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
      c.shadowBlur = 10;
      c.beginPath();
      c.arc(p.x, p.y, s, 0, Math.PI*2);
      c.fill();
    }
    c.restore();
  }

  endScene(){
    const c = this.ctx;

    // arena floor glow + reflection haze
    c.save();
    c.setTransform(1,0,0,1,0,0);
    const floorY = 490; // fight arena.floorY+110

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

    // screen flash
    if(this.flash){
      this.flash.t -= 1/30;
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
    this._hud.p1Hp = lerp(this._hud.p1Hp, hud.p1.hpPct, 0.12);
    this._hud.p2Hp = lerp(this._hud.p2Hp, hud.p2.hpPct, 0.12);
    this._hud.p1Mom = lerp(this._hud.p1Mom, hud.p1.momentum, 0.18);
    this._hud.p2Mom = lerp(this._hud.p2Mom, hud.p2.momentum, 0.18);

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

    // match score panel
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

    // Momentum (player) — golden bar with glow
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

    // banner
    if(hud.banner){
      c.save();
      const y = this.h/2-32;
      fillRoundRect(c, 60, y, this.w-120, 64, 14, 'rgba(0,0,0,0.50)');
      strokeRoundRect(c, 60, y, this.w-120, 64, 14, 'rgba(255,255,255,0.15)', 1.5);
      c.textAlign='center';
      c.textBaseline='middle';
      c.font='900 26px Orbitron, system-ui';
      c.fillStyle='rgba(255,255,255,0.95)';
      c.shadowColor='rgba(120,240,255,0.55)';
      c.shadowBlur=18;
      c.fillText(hud.banner, this.w/2, y+32);
      c.restore();
    }

    c.restore();
  }

  drawFighter(f){
    const c=this.ctx;

    // ground shadow
    c.save();
    c.globalAlpha=0.22;
    c.fillStyle='#000';
    c.beginPath();
    c.ellipse(f.x, f.y+110, 34, 10, 0, 0, Math.PI*2);
    c.fill();
    c.restore();

    // momentum ring (subtle)
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

    // Pick sprite based on fighter state/attack (SpriteManager API)
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
    const im = this.sprites?.get?.(fighterId, state, attackKind);

    // Feet anchor
    const footX = f.x;
    const footY = f.y+110;

    // Target size: sprites are 256×256; draw at ~64×140 in game.
    const drawH = (state==='jumping') ? 160 : 170;
    const drawW = drawH; // square sprites

    if(im){
      c.save();
      c.translate(footX, footY);

      // Flip based on facing
      const flip = (f.facing === -1);
      if(flip){ c.scale(-1,1); }

      // Glow
      const glow = f.glow || fighterPalette(fighterId)?.glow || '#ffffff';
      c.shadowColor = withAlpha(glow, 0.95);
      c.shadowBlur = 15;

      c.imageSmoothingEnabled = true;
      c.drawImage(im, -drawW/2, -drawH, drawW, drawH);

      c.shadowBlur = 0;
      c.restore();
    } else {
      // Fallback: colored rectangle if sprite missing
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

    // Charge meter (keep gameplay affordance)
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
