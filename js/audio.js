const MUSIC = {
  music_menu: 'assets/music/menu.mp3',
  music_select: 'assets/music/select.mp3',
  music_blaze: 'assets/music/blaze.mp3',
  music_granite: 'assets/music/granite.mp3',
  music_shade: 'assets/music/shade.mp3',
  music_volt: 'assets/music/volt.mp3',
  music_laststand: 'assets/music/laststand.mp3',
  music_victory: 'assets/music/victory.mp3',
  music_defeat: 'assets/music/defeat.mp3',
};

const SFX = {
  sfx_light:'assets/sfx/hit_light.mp3',
  sfx_heavy:'assets/sfx/hit_heavy.mp3',
  sfx_special_hit:'assets/sfx/hit_special.mp3',
  sfx_hit_light:'assets/sfx/hit_light.mp3',
  sfx_hit_heavy:'assets/sfx/hit_heavy.mp3',
  sfx_block:'assets/sfx/block.mp3',
  sfx_grab:'assets/sfx/grab.mp3',
  sfx_dodge:'assets/sfx/dodge.mp3',
  sfx_perfectdodge:'assets/sfx/perfect_dodge.mp3',
  sfx_charge:'assets/sfx/charge.mp3',
  sfx_whoosh:'assets/sfx/whoosh.mp3',
  sfx_fire:'assets/sfx/fire_special.mp3',
  sfx_rock:'assets/sfx/rock_special.mp3',
  sfx_lightning:'assets/sfx/lightning_special.mp3',
  sfx_shadow:'assets/sfx/shadow_special.mp3',
  sfx_signature:'assets/sfx/signature.mp3',
  sfx_round:'assets/sfx/round_start.mp3',
  sfx_bell:'assets/sfx/bell.mp3',
  sfx_ko:'assets/sfx/ko.mp3',
  sfx_guardbreak:'assets/sfx/guard_break.mp3',
  sfx_intro_slam:'assets/sfx/intro_slam.mp3',
  sfx_combo3:'assets/sfx/combo_3.mp3',
  sfx_combo5:'assets/sfx/combo_3.mp3',
  sfx_combo7:'assets/sfx/combo_3.mp3',
  sfx_select:'assets/sfx/menu_select.mp3',
  sfx_nav:'assets/sfx/menu_move.mp3',
  sfx_menu_move:'assets/sfx/menu_move.mp3',
  sfx_xp:'assets/sfx/xp_gain.mp3',
  sfx_level:'assets/sfx/level_up.mp3',
  sfx_ach:'assets/sfx/achievement.mp3',
};

const VOICES = {
  blaze_start:'assets/voices/blaze_start.mp3',
  blaze_special:'assets/voices/blaze_special.mp3',
  blaze_sig:'assets/voices/blaze_sig.mp3',
  blaze_win:'assets/voices/blaze_win.mp3',
  granite_start:'assets/voices/granite_start.mp3',
  granite_special:'assets/voices/granite_special.mp3',
  granite_sig:'assets/voices/granite_sig.mp3',
  granite_win:'assets/voices/granite_win.mp3',
  shade_start:'assets/voices/shade_start.mp3',
  shade_special:'assets/voices/shade_special.mp3',
  shade_sig:'assets/voices/shade_sig.mp3',
  shade_win:'assets/voices/shade_win.mp3',
  volt_start:'assets/voices/volt_start.mp3',
  volt_special:'assets/voices/volt_special.mp3',
  volt_sig:'assets/voices/volt_sig.mp3',
  volt_win:'assets/voices/volt_win.mp3',
};

/**
 * AudioManager — Uses HTML5 Audio elements as primary (most compatible),
 * with Web Audio API as enhancement when available.
 * 
 * HTML5 Audio works on virtually every browser including Meta glasses.
 * Web Audio API may not be available or may be restricted.
 */
export class AudioManager{
  constructor(){
    this.master = { music: 0.55, sfx: 0.7, voice: 0.85 };
    this._ready = false;
    this._unlocked = false;
    
    // HTML5 Audio elements for music (most compatible)
    this._musicEl = null;
    this.musicKey = null;
    
    // SFX pool — pre-created Audio elements
    this._sfxPool = new Map(); // key -> [Audio, Audio, ...] (pool of 3 per sound)
    this._sfxUrls = {};
    
    // Web Audio API (optional enhancement)
    this.ctx = null;
    this.buffers = new Map();
    this.musicGain = null;
    this.musicNode = null;
    this._filter = null;
    this._filterConnected = false;
    this._useWebAudio = false;
  }

  async init(){
    // Set ready immediately — HTML5 Audio doesn't need async setup
    this._ready = true;
    
    // Merge all URLs
    this._sfxUrls = { ...SFX, ...VOICES };
    
    // Pre-create HTML5 Audio elements for SFX (pool of 3 each for overlapping sounds)
    const allSfx = { ...SFX, ...VOICES };
    const seenUrls = new Set();
    for(const [key, url] of Object.entries(allSfx)){
      if(seenUrls.has(url + key)) continue;
      seenUrls.add(url + key);
      const pool = [];
      for(let i = 0; i < 3; i++){
        const a = new Audio();
        a.preload = 'auto';
        a.src = url;
        pool.push(a);
      }
      this._sfxPool.set(key, { pool, idx: 0 });
    }

    // Try to set up Web Audio API as optional enhancement
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if(AC){
        this.ctx = new AC({ latencyHint:'interactive' });
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.master.music;
        this.musicGain.connect(this.ctx.destination);
        this._useWebAudio = true;
        console.log('[Audio] Web Audio API available');
      }
    } catch(e){
      console.log('[Audio] Web Audio not available, using HTML5 Audio only');
    }

    // Unlock audio on first user gesture
    const unlock = () => {
      if(this._unlocked) return;
      this._unlocked = true;
      console.log('[Audio] Unlocked by user gesture');
      
      // Resume Web Audio if available
      if(this.ctx && this.ctx.state !== 'running'){
        this.ctx.resume().catch(()=>{});
      }
      
      // Play a silent sound to unlock HTML5 Audio on iOS/mobile
      const silent = new Audio();
      silent.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAABhkVUkZYAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAABhkVUkZYAAAAAAAAAAAAAAAAA';
      silent.play().catch(()=>{});
      
      // If we had pending music, play it now
      if(this._pendingMusic){
        this.playMusic(this._pendingMusic);
        this._pendingMusic = null;
      }
    };
    
    for(const evt of ['pointerdown','pointerup','click','mousedown','mouseup',
                       'touchstart','touchend','keydown','keyup']){
      window.addEventListener(evt, unlock, { passive: true });
    }
    
    console.log('[Audio] Init complete. SFX pool:', this._sfxPool.size, 'sounds');
  }

  keys(){ return { MUSIC, SFX, VOICES }; }
  async loadAll(){ /* no-op — HTML5 Audio loads on demand */ }

  /**
   * Play a sound effect using HTML5 Audio pool (most compatible).
   */
  play(key, { vol=1, rate=1, variations=false } = {}){
    if(!this._ready) return;
    
    const entry = this._sfxPool.get(key);
    if(!entry) return;
    
    // Round-robin through the pool for overlapping sounds
    const audio = entry.pool[entry.idx % entry.pool.length];
    entry.idx++;
    
    const isVoice = key.startsWith('blaze_')||key.startsWith('granite_')||key.startsWith('shade_')||key.startsWith('volt_');
    audio.volume = vol * (isVoice ? this.master.voice : this.master.sfx);
    
    if(variations){
      audio.playbackRate = rate + (Math.random() - 0.5) * 0.2;
    } else {
      audio.playbackRate = rate;
    }
    
    // Reset and play
    audio.currentTime = 0;
    audio.play().catch(()=>{}); // silently fail if not unlocked yet
  }

  /**
   * Play music using HTML5 Audio element (most compatible).
   */
  playMusic(key, opts = { loop: true }){
    if(!this._ready){
      this._pendingMusic = key;
      return;
    }
    if(!this._unlocked){
      this._pendingMusic = key;
      console.log('[Audio] Music queued for after unlock:', key);
      return;
    }
    if(this.musicKey === key && this._musicEl && !this._musicEl.paused) return;
    
    const url = MUSIC[key];
    if(!url){
      console.warn('[Audio] No music URL for:', key);
      return;
    }
    
    // Fade out old music
    if(this._musicEl){
      const old = this._musicEl;
      const fadeOut = setInterval(()=>{
        if(old.volume > 0.05){
          old.volume = Math.max(0, old.volume - 0.05);
        } else {
          old.pause();
          clearInterval(fadeOut);
        }
      }, 30);
    }
    
    // Create new music element
    const el = new Audio(url);
    el.loop = opts.loop !== false;
    el.volume = 0;
    this._musicEl = el;
    this.musicKey = key;
    
    el.play().then(()=>{
      console.log('[Audio] ▶ Playing music:', key);
      // Fade in
      const fadeIn = setInterval(()=>{
        if(el.volume < this.master.music - 0.05){
          el.volume = Math.min(this.master.music, el.volume + 0.05);
        } else {
          el.volume = this.master.music;
          clearInterval(fadeIn);
        }
      }, 30);
    }).catch(e => {
      console.warn('[Audio] Music play failed:', key, e);
      // Queue for retry on next gesture
      this._pendingMusic = key;
      this._unlocked = false;
    });
  }

  stopMusic(){
    if(this._musicEl){
      this._musicEl.pause();
      this._musicEl.currentTime = 0;
      this._musicEl = null;
      this.musicKey = null;
    }
    if(this.musicNode){
      try{ this.musicNode.stop(); }catch{}
      this.musicNode = null;
    }
  }

  // Music filter effect (lowpass during slowmo) — Web Audio only
  setMusicFilter(freq){
    // Skip if no Web Audio — HTML5 Audio doesn't support filters
    if(!this.ctx || !this._useWebAudio) return;
    if(!this._filter){
      this._filter = this.ctx.createBiquadFilter();
      this._filter.type = 'lowpass';
      this._filter.frequency.value = 22050;
    }
    this._filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
  }

  clearMusicFilter(){
    if(this._filter){
      this._filter.frequency.setTargetAtTime(22050, this.ctx.currentTime, 0.2);
    }
  }
}
