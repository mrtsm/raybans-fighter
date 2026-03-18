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

export class AudioManager{
  constructor(){
    this.ctx = null;
    this.buffers = new Map();
    this.master = { music: 0.55, sfx: 0.7, voice: 0.85 };
    this.musicNode = null;
    this.musicGain = null;
    this.musicKey = null;
    this.lastStand = false;
    this._filter = null;
    this._filterConnected = false;
    this._ready = false;
    this._pendingMusic = null; // queue music play for after unlock
    this._rawBuffers = new Map(); // store raw ArrayBuffers before context ready
  }

  /**
   * LAZY INIT: Don't create AudioContext until a user gesture.
   * Pre-fetch all audio files as raw ArrayBuffers so they're ready.
   */
  async init(){
    // Pre-fetch all audio as raw data (no AudioContext needed)
    await this._prefetchAll();

    // Set up gesture listeners to create AudioContext on first interaction
    const unlockAudio = async () => {
      if(this._ready) return;
      console.log('[Audio] User gesture detected — creating AudioContext');
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint:'interactive' });
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.master.music;
        this.musicGain.connect(this.ctx.destination);

        // Immediately resume (we're inside a gesture handler)
        if(this.ctx.state !== 'running'){
          await this.ctx.resume();
        }

        // Decode all pre-fetched buffers
        await this._decodeAll();

        this._ready = true;
        console.log('[Audio] AudioContext running, buffers decoded:', this.buffers.size);

        // Play any pending music
        if(this._pendingMusic){
          this.playMusic(this._pendingMusic.key, this._pendingMusic.opts);
          this._pendingMusic = null;
        }
      } catch(e) {
        console.warn('[Audio] Failed to create AudioContext:', e);
      }
    };

    // Listen on EVERY possible event type for the gesture
    for(const evt of ['pointerdown','pointerup','click','mousedown','mouseup',
                       'touchstart','touchend','keydown','keyup']){
      window.addEventListener(evt, unlockAudio, { passive: true, once: false });
    }
  }

  /**
   * Pre-fetch all audio files as raw ArrayBuffers (no AudioContext needed).
   */
  async _prefetchAll(){
    const entries = Object.entries({ ...MUSIC, ...SFX, ...VOICES });
    const urlToKeys = new Map();
    for(const [k,url] of entries){
      if(!urlToKeys.has(url)) urlToKeys.set(url, []);
      urlToKeys.get(url).push(k);
    }
    await Promise.all([...urlToKeys.entries()].map(async ([url, keys])=>{
      try{
        const r = await fetch(url);
        if(!r.ok) return;
        const ab = await r.arrayBuffer();
        for(const k of keys) this._rawBuffers.set(k, ab);
      } catch {}
    }));
    console.log('[Audio] Pre-fetched', this._rawBuffers.size, 'audio files');
  }

  /**
   * Decode all pre-fetched ArrayBuffers into AudioBuffers.
   */
  async _decodeAll(){
    const promises = [];
    for(const [key, ab] of this._rawBuffers.entries()){
      if(this.buffers.has(key)) continue;
      promises.push(
        this.ctx.decodeAudioData(ab.slice(0))
          .then(buf => this.buffers.set(key, buf))
          .catch(() => {})
      );
    }
    await Promise.all(promises);
    this._rawBuffers.clear(); // free memory
  }

  keys(){ return { MUSIC, SFX, VOICES }; }

  // Legacy loadAll — now a no-op since we pre-fetch in init
  async loadAll(){ }

  play(key, { vol=1, rate=1, variations=false } = {}){
    if(!this._ready || !this.ctx) return;
    const buf = this.buffers.get(key);
    if(!buf) return;
    if(this.ctx.state !== 'running'){
      this.ctx.resume().catch(()=>{});
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    let actualRate = rate;
    if(variations){
      actualRate += (Math.random() - 0.5) * 0.2;
    }
    src.playbackRate.value = actualRate;
    const g = this.ctx.createGain();
    const isVoice = key.startsWith('blaze_')||key.startsWith('granite_')||key.startsWith('shade_')||key.startsWith('volt_');
    g.gain.value = vol * (isVoice?this.master.voice:this.master.sfx);
    src.connect(g).connect(this.ctx.destination);
    src.start();
    return src;
  }

  playMusic(key, opts = { loop:true }){
    // If audio not ready yet, queue it for when it unlocks
    if(!this._ready || !this.ctx){
      this._pendingMusic = { key, opts };
      console.log('[Audio] Queued music for after unlock:', key);
      return;
    }
    if(this.musicKey === key) return;
    const buf = this.buffers.get(key);
    if(!buf) { console.warn('[Audio] No buffer for', key); this.musicKey=null; return; }
    if(this.ctx.state !== 'running'){
      this.ctx.resume().catch(()=>{});
    }

    const fade = 0.25;
    const now = this.ctx.currentTime;

    if(this.musicNode){
      const old = this.musicNode;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(0, now+fade);
      setTimeout(()=>{ try{ old.stop(); }catch{} }, (fade*1000)+10);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = opts.loop !== false;
    src.connect(this.musicGain);
    this.musicNode = src;
    this.musicKey = key;

    this.musicGain.gain.setValueAtTime(0, now);
    this.musicGain.gain.linearRampToValueAtTime(this.master.music, now+fade);
    src.start();
    console.log('[Audio] ▶ Playing music:', key, 'ctx.state:', this.ctx.state);
  }

  stopMusic(){
    if(this.musicNode){
      try{ this.musicNode.stop(); }catch{}
      this.musicNode = null;
      this.musicKey = null;
    }
  }

  setMusicFilter(freq){
    if(!this.ctx) return;
    if(!this._filter){
      this._filter = this.ctx.createBiquadFilter();
      this._filter.type = 'lowpass';
      this._filter.frequency.value = 22050;
    }
    this._filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    if(!this._filterConnected && this.musicNode){
      try {
        this.musicGain.disconnect();
        this.musicGain.connect(this._filter);
        this._filter.connect(this.ctx.destination);
        this._filterConnected = true;
      } catch {}
    }
  }

  clearMusicFilter(){
    if(this._filter){
      this._filter.frequency.setTargetAtTime(22050, this.ctx.currentTime, 0.2);
    }
  }
}
