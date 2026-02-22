const BUFFER_MS = 200;

export class Input {
  constructor(canvas){
    this.canvas = canvas;

    this.keys = new Set();
    this.keyDownAt = new Map();
    this.queue = []; // {t, action}
    this.now = 0;

    this._lastZTapT = -999;
    this._zChargeStarted = false;

    window.addEventListener('keydown', (e)=>{
      if(e.repeat) return;
      this.keys.add(e.code);
      this.keyDownAt.set(e.code, this.now);
      this._handleKeyDown(e);
    });
    window.addEventListener('keyup', (e)=>{
      this.keys.delete(e.code);
      this._handleKeyUp(e);
    });

    // touch fallback: swipe = dash/jump/crouch; tap=light; two-finger tap=heavy; long press=charge special; three-finger tap=grab
    this.touch = { active:false, start:null, startT:0, fingers:0, longPressFired:false };
    canvas.addEventListener('pointerdown', (e)=>this._pd(e));
    canvas.addEventListener('pointermove', (e)=>this._pm(e));
    canvas.addEventListener('pointerup', (e)=>this._pu(e));
    canvas.addEventListener('pointercancel', (e)=>this._pu(e));
  }

  update(dt){
    this.now += dt;

    // translate keyboard down-hold to block state
    if(this.keys.has('ArrowDown')){
      this._push('down_hold');
    }

    // keyboard special charge (hold Z)
    if(this.keys.has('KeyZ')){
      const t0 = this.keyDownAt.get('KeyZ') ?? this.now;
      const held = this.now - t0;
      if(held >= 0.4 && !this._zChargeStarted){
        this._zChargeStarted = true;
        this._push('special_charge_start');
      }
    }

    // touch long press
    if(this.touch.active && !this.touch.longPressFired){
      if(this.now - this.touch.startT > 0.4){
        this.touch.longPressFired = true;
        this._push('special_charge_start');
      }
    }

    // expire buffer
    const maxAge = BUFFER_MS/1000;
    this.queue = this.queue.filter(ev => (this.now - ev.t) <= maxAge);
  }

  consume(){
    const out = this.queue;
    this.queue = [];
    return out;
  }

  peek(){
    return this.queue;
  }

  _push(action){
    this.queue.push({ t:this.now, action });
  }

  _handleKeyDown(e){
    const c = e.code;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyZ','KeyX','KeyC','Space','Enter','Escape'].includes(c)) e.preventDefault();

    if(c==='ArrowLeft') this._push('dash_left');
    if(c==='ArrowRight') this._push('dash_right');
    if(c==='ArrowUp') this._push('jump');

    if(c==='KeyZ'){
      const dt = this.now - this._lastZTapT;
      this._lastZTapT = this.now;
      if(dt < 0.25) this._push('grab'); // double index tap
      else this._push('light');
      // charge special start handled by hold detection in update via keyDownAt
    }

    if(c==='KeyX') this._push('heavy');
    if(c==='KeyC') this._push('grab');

    if(c==='Enter') this._push('ui_confirm');
    if(c==='Escape') this._push('ui_back');
    if(c==='Space') this._push('ui_confirm');
  }

  _handleKeyUp(e){
    const c = e.code;
    if(c==='ArrowDown') this._push('down_release');

    if(c==='KeyZ'){
      const t0 = this.keyDownAt.get('KeyZ') ?? this.now;
      const held = this.now - t0;
      if(held >= 0.4){
        this._push('special_release');
      }
      this._zChargeStarted = false;
    }
  }

  _pd(e){
    this.canvas.setPointerCapture(e.pointerId);
    if(!this.touch.active){
      this.touch.active = true;
      this.touch.start = { x:e.offsetX, y:e.offsetY };
      this.touch.startT = this.now;
      this.touch.fingers = 1;
      this.touch.longPressFired = false;
      this._tapCandidates = [{t:this.now, x:e.offsetX, y:e.offsetY}];
    } else {
      this.touch.fingers++;
    }
  }

  _pm(e){
    if(!this.touch.active || !this.touch.start) return;
  }

  _pu(e){
    if(!this.touch.active || !this.touch.start) return;
    const dx = e.offsetX - this.touch.start.x;
    const dy = e.offsetY - this.touch.start.y;
    const adx = Math.abs(dx), ady=Math.abs(dy);
    const dt = this.now - this.touch.startT;

    // multi-finger taps
    if(dt < 0.25 && adx < 20 && ady < 20){
      if(this.touch.fingers>=3) this._push('grab');
      else if(this.touch.fingers===2) this._push('heavy');
      else this._push('light');
    } else {
      // swipe
      if(adx > ady && adx > 40){
        this._push(dx<0?'dash_left':'dash_right');
      } else if(ady > adx && ady > 40){
        this._push(dy<0?'jump':'crouch');
      }
    }

    if(this.touch.longPressFired) this._push('special_release');

    this.touch.active = false;
    this.touch.start = null;
    this.touch.fingers = 0;
    this.touch.longPressFired = false;
  }
}
