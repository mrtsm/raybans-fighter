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
  sfx_light:'assets/sfx/light_hit.mp3',
  sfx_heavy:'assets/sfx/heavy_hit.mp3',
  sfx_block:'assets/sfx/block.mp3',
  sfx_grab:'assets/sfx/grab.mp3',
  sfx_dodge:'assets/sfx/dodge.mp3',
  sfx_perfectdodge:'assets/sfx/perfect_dodge.mp3',
  sfx_charge:'assets/sfx/charge.mp3',
  sfx_fire:'assets/sfx/fire_special.mp3',
  sfx_rock:'assets/sfx/rock_special.mp3',
  sfx_lightning:'assets/sfx/lightning_special.mp3',
  sfx_shadow:'assets/sfx/shadow_special.mp3',
  sfx_signature:'assets/sfx/signature.mp3',
  sfx_round:'assets/sfx/bell.mp3',
  sfx_ko:'assets/sfx/ko.mp3',
  sfx_select:'assets/sfx/menu_select.mp3',
  sfx_nav:'assets/sfx/menu_nav.mp3',
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
  }

  async init(){
    // lazily create audio context on first interaction if needed
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint:'interactive' });
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.master.music;
    this.musicGain.connect(this.ctx.destination);

    // resume on user gesture
    const resume = async()=>{
      if(this.ctx.state!=='running') await this.ctx.resume();
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }

  keys(){ return { MUSIC, SFX, VOICES }; }

  async loadAll(){
    const entries = Object.entries({ ...MUSIC, ...SFX, ...VOICES });
    await Promise.all(entries.map(async ([k,url])=>{
      try{
        const r = await fetch(url);
        if(!r.ok) return;
        const ab = await r.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(ab.slice(0));
        this.buffers.set(k, buf);
      } catch { /* missing assets are OK (dev) */ }
    }));
  }

  play(key, { vol=1, rate=1 } = {}){
    const buf = this.buffers.get(key);
    if(!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    const isVoice = key.startsWith('blaze_')||key.startsWith('granite_')||key.startsWith('shade_')||key.startsWith('volt_');
    g.gain.value = vol * (isVoice?this.master.voice:this.master.sfx);
    src.connect(g).connect(this.ctx.destination);
    src.start();
    return src;
  }

  playMusic(key, { loop=true } = {}){
    if(this.musicKey === key) return;
    const buf = this.buffers.get(key);
    if(!buf) { this.musicKey=null; return; }

    const fade = 0.25;
    const now = this.ctx.currentTime;

    // fade out old
    if(this.musicNode){
      const old = this.musicNode;
      this.musicGain.gain.cancelScheduledValues(now);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
      this.musicGain.gain.linearRampToValueAtTime(0, now+fade);
      setTimeout(()=>{ try{ old.stop(); }catch{} }, (fade*1000)+10);
    }

    // new node
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.connect(this.musicGain);
    this.musicNode = src;
    this.musicKey = key;

    // fade in
    this.musicGain.gain.setValueAtTime(0, now);
    this.musicGain.gain.linearRampToValueAtTime(this.master.music, now+fade);
    src.start();
  }
}
