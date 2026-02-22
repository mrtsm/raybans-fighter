// Shared render helpers + SpriteManager

export const clamp01 = (v)=> Math.max(0, Math.min(1, v));
export const lerp = (a,b,t)=> a + (b-a)*t;

export const withAlpha = (hexOrRgb, a=1)=>{
  if(!hexOrRgb) return `rgba(0,0,0,${a})`;
  if(hexOrRgb.startsWith('rgba')) return hexOrRgb;
  if(hexOrRgb.startsWith('rgb(')){
    const inside = hexOrRgb.slice(4,-1);
    return `rgba(${inside},${a})`;
  }
  // #rrggbb
  if(hexOrRgb[0]==='#' && hexOrRgb.length===7){
    const r=parseInt(hexOrRgb.slice(1,3),16);
    const g=parseInt(hexOrRgb.slice(3,5),16);
    const b=parseInt(hexOrRgb.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return hexOrRgb;
};

export const darken = (hex, amt=0.2)=>{
  if(!(hex && hex[0]==='#' && hex.length===7)) return hex;
  const r=parseInt(hex.slice(1,3),16);
  const g=parseInt(hex.slice(3,5),16);
  const b=parseInt(hex.slice(5,7),16);
  const f=(x)=> Math.max(0, Math.min(255, Math.round(x*(1-amt))));
  return `#${f(r).toString(16).padStart(2,'0')}${f(g).toString(16).padStart(2,'0')}${f(b).toString(16).padStart(2,'0')}`;
};

// Default sprite facing direction (which way the art faces before any flip)
// true = sprite art faces left, false = sprite art faces right
export const SPRITE_FACES_LEFT = {
  blaze: true,
  granite: false,
  shade: true,
  volt: true,
};

const _fighterPalette = {
  blaze:   { primary:'#ff4b3a', secondary:'#ffd34a', glow:'#ff5533' },
  granite: { primary:'#9aa6b2', secondary:'#5a6773', glow:'#cfd8e3' },
  shade:   { primary:'#6a2cff', secondary:'#24113d', glow:'#b57bff' },
  volt:    { primary:'#33b7ff', secondary:'#1b2cff', glow:'#8de8ff' },
};

export const fighterPalette = (f)=>{
  const id = (typeof f === 'string') ? f : f?.id;
  return _fighterPalette[id] || { primary:f?.color||'#fff', secondary:darken(f?.color||'#fff',0.35), glow:f?.glow||f?.color||'#fff' };
};

export const roundRectPath = (ctx, x,y,w,h,r)=>{
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
};

export const fillRoundRect = (ctx, x,y,w,h,r, fill)=>{
  ctx.save();
  roundRectPath(ctx,x,y,w,h,r);
  if(fill) ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
};

export const strokeRoundRect = (ctx, x,y,w,h,r, stroke, lw=2)=>{
  ctx.save();
  roundRectPath(ctx,x,y,w,h,r);
  if(stroke) ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.stroke();
  ctx.restore();
};

export const neonText = (ctx, text, x,y, { color='#7df9ff', glow=null, align='center', size=24, weight=800 }={})=>{
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Orbitron, system-ui, sans-serif`;
  ctx.shadowColor = glow || color;
  ctx.shadowBlur = 16;
  ctx.fillText(text, x,y);
  ctx.shadowBlur = 0;
  ctx.restore();
};

// --- SpriteManager (as requested) ---
export class SpriteManager {
  constructor() {
    this.sprites = {};
    this.loaded = false;
  }
  async loadAll(onProgress) {
    const fighters = ['blaze','granite','shade','volt'];
    const poses = ['idle','light','heavy','block','jump','crouch','hitstun','ko','special','victory'];
    const total = fighters.length * poses.length + 2;
    let done = 0;
    const bust = `?v=${Date.now()}`;
    const load = (src) => new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { done++; onProgress?.(done/total); res(img); };
      img.onerror = (e) => { console.warn('Sprite FAILED:', src, e); done++; onProgress?.(done/total); res(null); };
      img.src = src + bust;
    });
    console.log('[Sprites] Loading', total, 'assets...');
    for (const f of fighters) {
      this.sprites[f] = {};
      for (const p of poses) {
        this.sprites[f][p] = await load(`assets/sprites/${f}/${p}.png`);
      }
    }
    this.sprites.arena_bg = await load('assets/sprites/arena_bg.png');
    this.sprites.title_bg = await load('assets/sprites/title_bg.png');
    const ok = Object.entries(this.sprites).filter(([k,v]) => typeof v === 'object' && v !== null && !(v instanceof HTMLImageElement)).map(([k,v]) => [k, Object.values(v).filter(Boolean).length]);
    console.log('[Sprites] Loaded fighters:', ok, 'bg:', !!this.sprites.arena_bg);
    this.loaded = true;
  }
  get(fighterId, state, attackKind) {
    const f = this.sprites[fighterId];
    if (!f) return null;
    if (state === 'attacking') {
      if (attackKind === 'heavy') return f.heavy;
      if (attackKind === 'air') return f.jump;
      if (attackKind === 'low') return f.crouch;
      return f.light;
    }
    if (state === 'blocking') return f.block;
    if (state === 'jumping') return f.jump;
    if (state === 'crouching') return f.crouch;
    if (state === 'hitstun') return f.hitstun;
    if (state === 'ko') return f.ko;
    if (state === 'victory') return f.victory;
    if (state === 'charging') return f.special;
    return f.idle;
  }
}
