// Shared render helpers + SpriteManager
const ASSET_VERSION = '20260320';

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

// All sprites have been normalized to face LEFT at the file level.
// Flip when fighter faces right (facing === 1).
export const ALL_SPRITES_FACE_LEFT = true;

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

export const neonText = (ctx, text, x,y, { color='#7df9ff', glow=null, align='center', size=24, weight=800, blur=16, stroke=true }={})=>{
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Impact, system-ui, sans-serif`;
  ctx.shadowColor = glow || color;
  ctx.shadowBlur = blur;
  ctx.fillText(text, x,y);
  ctx.shadowBlur = 0;
  ctx.restore();
};

/**
 * Remove background from a sprite image (white, black, or any solid color),
 * returning a new canvas with transparency where background pixels were.
 * Detects background color by sampling edge pixels, then removes with soft anti-aliasing.
 */
function removeBackground(img){
  if(!img || !img.width) return img;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  const w = c.width, h = c.height;

  // Sample ALL edge pixels (top, bottom, left, right borders) to detect background
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  for(let x = 0; x < w; x++){
    // top row
    let i = x * 4;
    bgR += d[i]; bgG += d[i+1]; bgB += d[i+2]; bgCount++;
    // bottom row
    i = ((h-1)*w + x) * 4;
    bgR += d[i]; bgG += d[i+1]; bgB += d[i+2]; bgCount++;
  }
  for(let y = 1; y < h-1; y++){
    // left col
    let i = (y*w) * 4;
    bgR += d[i]; bgG += d[i+1]; bgB += d[i+2]; bgCount++;
    // right col
    i = (y*w + w-1) * 4;
    bgR += d[i]; bgG += d[i+1]; bgB += d[i+2]; bgCount++;
  }
  bgR = Math.round(bgR / bgCount);
  bgG = Math.round(bgG / bgCount);
  bgB = Math.round(bgB / bgCount);

  // Flood-fill from corners to find connected background pixels
  const visited = new Uint8Array(w * h);
  const isBg = new Uint8Array(w * h);
  const threshold = 45; // color distance threshold for background
  const queue = [];

  // Seed from all 4 edges
  for(let x = 0; x < w; x++){
    queue.push(x); // top row
    queue.push((h-1)*w + x); // bottom row
  }
  for(let y = 0; y < h; y++){
    queue.push(y*w); // left col
    queue.push(y*w + w-1); // right col
  }

  while(queue.length > 0){
    const idx = queue.pop();
    if(idx < 0 || idx >= w*h || visited[idx]) continue;
    visited[idx] = 1;
    const pi = idx * 4;
    const r = d[pi], g = d[pi+1], b = d[pi+2];
    const dist = Math.sqrt((r-bgR)**2 + (g-bgG)**2 + (b-bgB)**2);
    if(dist < threshold){
      isBg[idx] = 1;
      const x = idx % w, y = (idx / w) | 0;
      if(x > 0) queue.push(idx - 1);
      if(x < w-1) queue.push(idx + 1);
      if(y > 0) queue.push(idx - w);
      if(y < h-1) queue.push(idx + w);
    }
  }

  // Apply: make background pixels transparent, with soft edges
  for(let idx = 0; idx < w*h; idx++){
    if(isBg[idx]){
      d[idx*4+3] = 0; // fully transparent
    } else {
      // Check if adjacent to background for anti-aliased edges
      const x = idx % w, y = (idx / w) | 0;
      let adjBg = 0;
      if(x > 0 && isBg[idx-1]) adjBg++;
      if(x < w-1 && isBg[idx+1]) adjBg++;
      if(y > 0 && isBg[idx-w]) adjBg++;
      if(y < h-1 && isBg[idx+w]) adjBg++;
      if(adjBg >= 2){
        d[idx*4+3] = Math.round(d[idx*4+3] * 0.4); // semi-transparent edge
      } else if(adjBg === 1){
        d[idx*4+3] = Math.round(d[idx*4+3] * 0.7); // slight edge softening
      }
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

// --- SpriteManager ---
export class SpriteManager {
  constructor() {
    this.sprites = {};
    this.loaded = false;
    this._animT = 0;
  }
  // Tick animation timer
  tick(dt) {
    this._animT += dt;
  }
  async loadAll(onProgress) {
    const fighters = ['blaze','granite','shade','volt'];
    const bgKeys = ['arena_bg','arena_storm','arena_volcano','arena_shadow','title_bg'];
    // Only load backgrounds + idle sprites upfront (9 assets instead of 45+)
    const total = fighters.length + bgKeys.length;
    let done = 0;
    const bust = `?v=${ASSET_VERSION}`;
    const load = (src) => new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { done++; onProgress?.(done/total); res(img); };
      img.onerror = () => { done++; onProgress?.(done/total); res(null); };
      img.src = src + bust;
    });
    console.log('[Sprites] Loading', total, 'essential assets (idle + backgrounds)...');
    const promises = [];
    // Load only idle sprites for each fighter (needed for select screen)
    for (const f of fighters) {
      this.sprites[f] = {};
      promises.push(load(`assets/sprites/${f}/idle.png`).then(img => { this.sprites[f].idle = img; }));
    }
    for (const bgKey of bgKeys) {
      promises.push(load(`assets/sprites/${bgKey}.png`).then(img => { this.sprites[bgKey] = img; }));
    }
    await Promise.all(promises);
    console.log('[Sprites] Essential assets loaded');
    this.loaded = true;
  }

  /** Lazy-load all poses for a specific fighter (call before fight starts) */
  async loadFighter(fighterId) {
    if (this._fighterFullyLoaded?.[fighterId]) return;
    if (!this._fighterFullyLoaded) this._fighterFullyLoaded = {};
    const poses = ['light','heavy','block','jump','crouch','hitstun','ko','special','victory'];
    const bust = `?v=${ASSET_VERSION}`;
    const load = (src) => new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src + bust;
    });
    if (!this.sprites[fighterId]) this.sprites[fighterId] = {};
    const promises = [];
    for (const p of poses) {
      if (!this.sprites[fighterId][p]) {
        promises.push(load(`assets/sprites/${fighterId}/${p}.png`).then(img => { this.sprites[fighterId][p] = img; }));
      }
    }
    if (promises.length > 0) {
      console.log(`[Sprites] Lazy-loading ${promises.length} poses for ${fighterId}...`);
      await Promise.all(promises);
      console.log(`[Sprites] ${fighterId} fully loaded`);
    }
    this._fighterFullyLoaded[fighterId] = true;
  }
  get(fighterId, state, attackKind, attackProgress) {
    const f = this.sprites[fighterId];
    if (!f) return null;

    // Animation frame selection based on attack progress
    if (state === 'attacking' && attackProgress !== undefined) {
      if (attackKind === 'heavy') {
        return f.heavy;
      }
      if (attackKind === 'light') {
        return f.light;
      }
      if (attackKind === 'air') return f.jump;
      if (attackKind === 'low') return f.crouch;
      return f.light;
    }

    if (state === 'attacking') {
      if (attackKind === 'heavy') return f.heavy;
      if (attackKind === 'air') return f.jump;
      if (attackKind === 'low') return f.crouch;
      return f.light;
    }

    // Idle breathing animation (cycle between idle frames)
    if (state === 'idle') {
      const frames = [f.idle, f.idle_2, f.idle_3].filter(Boolean);
      if(frames.length > 1){
        const frameIdx = Math.floor(this._animT * 2) % frames.length;
        return frames[frameIdx];
      }
      return f.idle;
    }

    // Charging uses special sprite
    if (state === 'charging') {
      return f.special;
    }

    if (state === 'blocking') return f.block;
    if (state === 'jumping') return f.jump;
    if (state === 'crouching') return f.crouch;
    if (state === 'hitstun') return f.hitstun;
    if (state === 'ko') return f.ko;
    if (state === 'victory') return f.victory;
    return f.idle;
  }
}

/* ── SpriteAnimation: per-fighter animated frames ── */

export class SpriteAnimation {
  constructor(fighterId, basePath){
    this.fighterId = fighterId;
    this.basePath = basePath; // e.g. 'assets/sprites/blaze'
    this.frames = {};         // { idle: [img,img,img], light: [windup,main,followthrough], ... }
    this.idleIdx = 0;
    this.idleTimer = 0;
    this.idleCycleDur = 200;  // ms per idle frame
    this.attackPhase = null;   // null | 'windup' | 'main' | 'followthrough'
    this.attackTimer = 0;
    this.attackPhaseDur = 100; // ms per attack phase
    this.attackType = null;    // 'light' | 'heavy' | 'special'
    this._loaded = false;
  }

  async load(){
    const loadImg = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src + (src.includes('?') ? '&' : '?') + 'v=' + ASSET_VERSION;
    });

    const bp = this.basePath;

    // Load idle frames (idle.png is frame 0, idle_2.png, idle_3.png)
    const idleFrames = await Promise.all([
      loadImg(`${bp}/idle.png`),
      loadImg(`${bp}/idle_2.png`),
      loadImg(`${bp}/idle_3.png`),
    ]);
    this.frames.idle = idleFrames.filter(Boolean);

    // Load attack animation frames for each attack type
    for(const atk of ['light', 'heavy', 'special']){
      const [windup, main, followthrough] = await Promise.all([
        loadImg(`${bp}/${atk}_windup.png`),
        loadImg(`${bp}/${atk}.png`),
        loadImg(`${bp}/${atk}_followthrough.png`),
      ]);
      this.frames[atk] = [windup, main, followthrough].map(f => f || null);
    }

    this._loaded = true;
  }

  /** Call every frame with dt in seconds */
  tick(dtMs){
    if(!this._loaded) return;

    // Tick idle animation
    this.idleTimer += dtMs;
    if(this.idleTimer >= this.idleCycleDur){
      this.idleTimer -= this.idleCycleDur;
      this.idleIdx = (this.idleIdx + 1) % (this.frames.idle?.length || 1);
    }

    // Tick attack animation
    if(this.attackPhase){
      this.attackTimer += dtMs;
      if(this.attackTimer >= this.attackPhaseDur){
        this.attackTimer -= this.attackPhaseDur;
        if(this.attackPhase === 'windup') this.attackPhase = 'main';
        else if(this.attackPhase === 'main') this.attackPhase = 'followthrough';
        else { this.attackPhase = null; this.attackType = null; }
      }
    }
  }

  /** Trigger an attack animation */
  triggerAttack(type){
    if(['light','heavy','special'].includes(type)){
      this.attackType = type;
      this.attackPhase = 'windup';
      this.attackTimer = 0;
    }
  }

  /** Get the current frame image for the fighter's state */
  getFrame(state){
    if(!this._loaded) return null;

    // If we're in an attack animation, return the attack frame
    if(this.attackPhase && this.attackType){
      const atkFrames = this.frames[this.attackType];
      if(atkFrames){
        const idx = this.attackPhase === 'windup' ? 0 : this.attackPhase === 'main' ? 1 : 2;
        if(atkFrames[idx]) return atkFrames[idx];
      }
    }

    // For idle state, cycle through idle frames
    if(state === 'idle' || state === 'walk'){
      const idles = this.frames.idle;
      if(idles && idles.length > 0){
        return idles[this.idleIdx % idles.length];
      }
    }

    return null; // fallback to static sprite
  }
}

/* ── SpriteAnimationManager: manages all fighter animations ── */

export class SpriteAnimationManager {
  constructor(){
    this.animations = {}; // fighterId → SpriteAnimation
  }

  async init(fighters){
    const promises = [];
    for(const id of fighters){
      const anim = new SpriteAnimation(id, `assets/sprites/${id}`);
      this.animations[id] = anim;
      promises.push(anim.load());
    }
    await Promise.all(promises);
  }

  get(fighterId){
    return this.animations[fighterId] || null;
  }

  tick(dtMs){
    for(const anim of Object.values(this.animations)){
      anim.tick(dtMs);
    }
  }

  triggerAttack(fighterId, type){
    const anim = this.animations[fighterId];
    if(anim) anim.triggerAttack(type);
  }

  /** Get current frame for a fighter given their state */
  getFrame(fighterId, state){
    const anim = this.animations[fighterId];
    if(anim) return anim.getFrame(state);
    return null;
  }
}
