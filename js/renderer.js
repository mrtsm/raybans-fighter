export class Renderer{
  constructor(canvas, ctx){
    this.canvas = canvas;
    this.ctx = ctx;
    this.w = canvas.width;
    this.h = canvas.height;
    this.shake = 0;
    this.shakeT = 0;
    this.flash = null; // {color,a,t}
    this.particles = [];
  }

  clear(){
    const c = this.ctx;
    c.setTransform(1,0,0,1,0,0);
    c.clearRect(0,0,this.w,this.h);
  }

  beginScene(){
    const c = this.ctx;
    this.clear();

    // semi-transparent backdrop for outdoor readability
    c.fillStyle = 'rgba(0,0,0,0.70)';
    c.fillRect(0,0,this.w,this.h);

    // subtle particle field
    c.globalAlpha = 0.12;
    c.fillStyle = '#9ad7ff';
    for(let i=0;i<40;i++){
      const x = (Math.sin(i*97.1 + performance.now()/900) * 0.5 + 0.5) * this.w;
      const y = (Math.cos(i*41.3 + performance.now()/1100) * 0.5 + 0.5) * this.h;
      c.fillRect(x|0,y|0,2,2);
    }
    c.globalAlpha = 1;

    // camera shake
    let sx=0, sy=0;
    if(this.shakeT>0){
      this.shakeT -= 1/30;
      sx = (Math.random()*2-1)*this.shake;
      sy = (Math.random()*2-1)*this.shake;
      if(this.shakeT<=0){ this.shake=0; this.shakeT=0; }
    }
    c.setTransform(1,0,0,1,sx,sy);
  }

  doShake(intensity=6, time=0.25){
    this.shake = Math.max(this.shake, intensity);
    this.shakeT = Math.max(this.shakeT, time);
  }

  doFlash(color, time=0.2){
    this.flash = { color, t: time, a: 1 };
  }

  addParticles(list){
    for(const p of list) this.particles.push(p);
    if(this.particles.length>30) this.particles.splice(0, this.particles.length-30);
  }

  updateParticles(dt){
    for(const p of this.particles){
      p.t -= dt;
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.vy += p.g*dt;
    }
    this.particles = this.particles.filter(p=>p.t>0);
  }

  drawParticles(){
    const c = this.ctx;
    for(const p of this.particles){
      c.globalAlpha = Math.max(0, Math.min(1, p.t/p.t0));
      c.fillStyle = p.color;
      c.fillRect(p.x|0, p.y|0, p.s, p.s);
    }
    c.globalAlpha = 1;
  }

  endScene(){
    const c = this.ctx;
    if(this.flash){
      this.flash.t -= 1/30;
      const a = Math.max(0, this.flash.t/0.2);
      c.setTransform(1,0,0,1,0,0);
      c.globalAlpha = 0.65*a;
      c.fillStyle = this.flash.color;
      c.fillRect(0,0,this.w,this.h);
      c.globalAlpha = 1;
      if(this.flash.t<=0) this.flash=null;
    }
  }

  drawHud(hud){
    const c = this.ctx;
    c.setTransform(1,0,0,1,0,0);

    // health bars
    const barH=20;
    const top=8;
    const pad=12;
    const barW= (this.w - pad*3)/2;

    const drawBar=(x,y,w,h,pct,colorL)=>{
      c.fillStyle='rgba(255,255,255,0.10)';
      c.fillRect(x,y,w,h);
      const ww = Math.max(0, Math.min(1,pct))*w;
      const grad = c.createLinearGradient(x,y,x+w,y);
      grad.addColorStop(0,'#22e06b');
      grad.addColorStop(0.55,'#e7d84f');
      grad.addColorStop(1,'#ff3b3b');
      c.fillStyle=grad;
      c.fillRect(x,y,ww,h);
      c.strokeStyle='rgba(255,255,255,0.25)';
      c.lineWidth=2;
      c.strokeRect(x+1,y+1,w-2,h-2);
      // icon
      c.globalAlpha=0.9;
      c.fillStyle=colorL;
      c.fillRect(x-8,y,6,h);
      c.globalAlpha=1;
    };

    drawBar(pad, top, barW, barH, hud.p1.hpPct, hud.p1.color);
    drawBar(pad*2+barW, top, barW, barH, hud.p2.hpPct, hud.p2.color);

    // names & score
    c.fillStyle='rgba(255,255,255,0.92)';
    c.font='bold 14px system-ui';
    c.textBaseline='top';
    c.fillText(`${hud.p1.name}  ${hud.rounds.p1}-${hud.rounds.p2}  ${hud.p2.name}`, pad, top+barH+6);
    c.textAlign='right';
    c.fillText(`${hud.matchScore.toLocaleString()}`, this.w-pad, top+barH+6);
    c.textAlign='left';

    // timer
    c.font='bold 16px system-ui';
    c.textAlign='center';
    c.fillText(`${Math.ceil(hud.timer)}`, this.w/2, top+2);
    c.textAlign='left';

    // momentum bars
    const mY=this.h-26;
    const mH=10;
    const mW=this.w-pad*2;
    c.fillStyle='rgba(255,255,255,0.08)';
    c.fillRect(pad,mY,mW,mH);
    const p1w = mW*(hud.p1.momentum/100);
    c.fillStyle='rgba(255,215,64,0.85)';
    c.fillRect(pad,mY,p1w,mH);
    c.fillStyle='rgba(255,255,255,0.22)';
    c.fillRect(pad,mY+mH+4,mW,mH);
    const p2w = mW*(hud.p2.momentum/100);
    c.fillStyle='rgba(255,215,64,0.45)';
    c.fillRect(pad,mY+mH+4,p2w,mH);

    // hints
    if(hud.banner){
      c.fillStyle='rgba(0,0,0,0.55)';
      c.fillRect(0,this.h/2-26,this.w,52);
      c.fillStyle='rgba(255,255,255,0.95)';
      c.font='bold 18px system-ui';
      c.textAlign='center';
      c.fillText(hud.banner, this.w/2, this.h/2-10);
      c.textAlign='left';
    }
  }

  drawFighter(f){
    const c=this.ctx;
    const x=f.x, y=f.y;
    const w=f.w, h=f.h;

    // momentum ring
    const ring = f.momentum/100;
    c.globalAlpha=0.9;
    c.strokeStyle = ring>=1 ? 'rgba(255,215,64,0.9)' : 'rgba(255,215,64,0.4)';
    c.lineWidth = ring>=1 ? 5:3;
    c.beginPath();
    c.arc(x, y+h/2+16, 22, -Math.PI/2, -Math.PI/2 + Math.PI*2*ring);
    c.stroke();
    c.globalAlpha=1;

    // body silhouette
    const facing = f.facing;
    c.save();
    c.translate(x,y);
    c.scale(facing,1);

    // outline
    c.fillStyle='rgba(0,0,0,0.85)';
    this._humanoid(c, -w/2-3, -h/2-3, w+6, h+6);

    const grad=c.createLinearGradient(0,-h/2,0,h/2);
    grad.addColorStop(0,f.color);
    grad.addColorStop(1,'#111');
    c.fillStyle=grad;
    this._humanoid(c, -w/2, -h/2, w, h);

    // state accents
    if(f.lastStand){
      c.globalAlpha=0.5;
      c.fillStyle='rgba(255,40,40,0.55)';
      c.fillRect(-w/2,-h/2,w,h);
      c.globalAlpha=1;
    }

    // charge meter
    if(f.chargePct>0){
      c.globalAlpha=0.9;
      c.fillStyle='rgba(255,255,255,0.15)';
      c.fillRect(-w/2, h/2+8, w, 6);
      c.fillStyle='rgba(255,255,255,0.8)';
      c.fillRect(-w/2, h/2+8, w*f.chargePct, 6);
      c.globalAlpha=1;
    }

    c.restore();

    // shadow
    c.globalAlpha=0.20;
    c.fillStyle='#000';
    c.beginPath();
    c.ellipse(x, y+h/2+22, 26, 8, 0, 0, Math.PI*2);
    c.fill();
    c.globalAlpha=1;
  }

  _humanoid(c,x,y,w,h){
    // simple pixel-block humanoid for readability
    const headH= h*0.22;
    const bodyH= h*0.48;
    const legH= h - headH - bodyH;
    const hw= w*0.35;
    c.fillRect(x+w*0.5-hw/2, y, hw, headH);
    c.fillRect(x+w*0.35, y+headH, w*0.3, bodyH);
    c.fillRect(x+w*0.2, y+headH+bodyH*0.2, w*0.15, bodyH*0.6);
    c.fillRect(x+w*0.65, y+headH+bodyH*0.2, w*0.15, bodyH*0.6);
    c.fillRect(x+w*0.38, y+headH+bodyH, w*0.12, legH);
    c.fillRect(x+w*0.50, y+headH+bodyH, w*0.12, legH);
  }
}
