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

    // Walk vs dash (double-tap detection)
    this._lastDirTap = { left: -999, right: -999 };
    this._walkHeld = { left: false, right: false };

    // Mouse/armband input
    this._mouseDownAt = new Map(); // button → timestamp
    this._mouseChargeStarted = new Map(); // button → bool

    // Prevent context menu globally (critical for armband right-click)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Unified click handler — works for both mouse events AND pointer events
    // Meta glasses armband may only fire pointer events, not mouse events
    this._clickHandled = false; // prevent double-fire from mouse+pointer

    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if(this._clickHandled) return; // already handled by pointerdown
      this._clickHandled = true;
      setTimeout(() => { this._clickHandled = false; }, 50);

      this._mouseDownAt.set(e.button, this.now);
      this._mouseChargeStarted.set(e.button, false);

      if(e.button === 0) { // Left click → attack
        this._push('light');
      }
      if(e.button === 2) { // Right click → special
        this._push('special');
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      e.preventDefault();
      const downT = this._mouseDownAt.get(e.button) ?? this.now;
      const held = this.now - downT;

      if(e.button === 0 && held >= 0.4) { // Left held = special release
        this._push('special_release');
      }

      this._mouseDownAt.delete(e.button);
      this._mouseChargeStarted.delete(e.button);
    });

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

    // Pointer events — primary input path for Meta glasses armband
    this.touch = { active:false, start:null, startT:0, fingers:0, longPressFired:false };
    canvas.addEventListener('pointerdown', (e)=>{
      e.preventDefault();
      // Push attack/special immediately on pointerdown (armband primary path)
      if(!this._clickHandled) {
        this._clickHandled = true;
        setTimeout(() => { this._clickHandled = false; }, 50);

        this._mouseDownAt.set(e.button, this.now);
        this._mouseChargeStarted.set(e.button, false);

        if(e.button === 0) { // Left click → attack
          this._push('light');
        }
        if(e.button === 2) { // Right click → special
          this._push('special');
        }
      }
      // Touch tracking (for swipe gestures on actual touch screens)
      if(e.pointerType === 'touch') {
        this._pd(e);
      }
    });
    canvas.addEventListener('pointermove', (e)=>{
      if(e.pointerType === 'touch') this._pm(e);
    });
    canvas.addEventListener('pointerup', (e)=>{
      // Handle charge release
      const downT = this._mouseDownAt.get(e.button) ?? this.now;
      const held = this.now - downT;
      if(e.button === 0 && held >= 0.4) {
        this._push('special_release');
      }
      this._mouseDownAt.delete(e.button);
      this._mouseChargeStarted.delete(e.button);

      if(e.pointerType === 'touch') this._pu(e);
    });
    canvas.addEventListener('pointercancel', (e)=>{
      this._mouseDownAt.delete(e.button);
      this._mouseChargeStarted.delete(e.button);
      if(e.pointerType === 'touch') this._pu(e);
    });
  }

  update(dt){
    this.now += dt;

    // translate keyboard down-hold to block state
    if(this.keys.has('ArrowDown')){
      this._push('down_hold');
    }

    // Walk hold — continuous movement while arrow is held
    if(this.keys.has('ArrowLeft')){
      this._push('walk_left_hold');
    }
    if(this.keys.has('ArrowRight')){
      this._push('walk_right_hold');
    }

    // keyboard special charge (hold Z or hold left-click)
    if(this.keys.has('KeyZ')){
      const t0 = this.keyDownAt.get('KeyZ') ?? this.now;
      const held = this.now - t0;
      if(held >= 0.4 && !this._zChargeStarted){
        this._zChargeStarted = true;
        this._push('special_charge_start');
      }
    }

    // Mouse left-click charge detection
    if(this._mouseDownAt.has(0)){
      const held = this.now - this._mouseDownAt.get(0);
      if(held >= 0.4 && !this._mouseChargeStarted.get(0)){
        this._mouseChargeStarted.set(0, true);
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

    // Gamepad API polling (for any standard gamepad)
    this._pollGamepad();

    // expire buffer
    const maxAge = BUFFER_MS/1000;
    this.queue = this.queue.filter(ev => (this.now - ev.t) <= maxAge);
  }

  _pollGamepad(){
    const gamepads = navigator.getGamepads?.() || [];
    for(const gp of gamepads){
      if(!gp) continue;
      const lx = gp.axes[0] || 0;
      const ly = gp.axes[1] || 0;
      // D-pad buttons (12=up, 13=down, 14=left, 15=right)
      const dUp = gp.buttons[12]?.pressed;
      const dDown = gp.buttons[13]?.pressed;
      const dLeft = gp.buttons[14]?.pressed;
      const dRight = gp.buttons[15]?.pressed;

      if(lx < -0.5 || dLeft) this._push('walk_left_hold');
      if(lx > 0.5 || dRight) this._push('walk_right_hold');
      if((ly < -0.5 || dUp) && !this._gpJumped) { this._push('jump'); this._gpJumped = true; }
      if(ly >= -0.3 && !dUp) this._gpJumped = false;
      if(ly > 0.5 || dDown) this._push('down_hold');

      // A=light, B/X=heavy
      if(gp.buttons[0]?.pressed && !this._gpA) { this._push('light'); this._gpA = true; }
      if(!gp.buttons[0]?.pressed) this._gpA = false;
      if(gp.buttons[1]?.pressed && !this._gpB) { this._push('heavy'); this._gpB = true; }
      if(!gp.buttons[1]?.pressed) this._gpB = false;
      // Confirm/back
      if(gp.buttons[9]?.pressed && !this._gpStart) { this._push('ui_confirm'); this._gpStart = true; }
      if(!gp.buttons[9]?.pressed) this._gpStart = false;
    }
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

    // Walk vs Dash: double-tap = dash, single tap starts walk
    if(c==='ArrowLeft'){
      const dt = this.now - this._lastDirTap.left;
      this._lastDirTap.left = this.now;
      if(dt < 0.2) this._push('dash_left');
      // walk_left_hold is pushed in update() while key is held
    }
    if(c==='ArrowRight'){
      const dt = this.now - this._lastDirTap.right;
      this._lastDirTap.right = this.now;
      if(dt < 0.2) this._push('dash_right');
    }

    if(c==='ArrowUp') this._push('jump');

    if(c==='KeyZ'){
      const dt = this.now - this._lastZTapT;
      this._lastZTapT = this.now;
      this._push('light');
    }

    if(c==='KeyX') this._push('heavy');

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

    if(dt < 0.25 && adx < 20 && ady < 20){
      if(this.touch.fingers>=2) this._push('heavy');
      else this._push('light');
    } else {
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
