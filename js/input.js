// ============================================================
//  input.js — Input for Meta glasses armband
//  Tap = attack, Swipe L/R = walk, Swipe Up = jump, Swipe Down = block
//  Also supports keyboard for desktop testing
// ============================================================

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.queue = [];   // { t, action }
    this.now = 0;

    // Currently held keys + when they went down
    this._keys = new Set();
    this._keyDownAt = new Map();

    // Swipe tracking
    this._pointer = null; // { id, startX, startY, startTime, moved }
    this._SWIPE_THRESHOLD = 20; // px to distinguish swipe from tap
    this._SWIPE_WALK_FRAMES = 0; // how many frames to keep walking after swipe
    this._walkDir = 0; // -1 left, 0 none, 1 right
    this._walkUntil = 0; // timestamp to stop walking

    // Prevent right-click context menu
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('contextmenu', e => e.preventDefault());

    // ── Pointer events (PRIMARY — armband fires these) ──
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      this._pointer = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTime: this.now,
        moved: false,
        lastX: e.clientX,
        lastY: e.clientY,
      };
      // Right click is always special (no swipe needed)
      if (e.button === 2) {
        this._push('special');
        this._pointer = null;
      }
    });

    canvas.addEventListener('pointermove', e => {
      if (!this._pointer || e.pointerId !== this._pointer.id) return;
      e.preventDefault();
      const dx = e.clientX - this._pointer.startX;
      const dy = e.clientY - this._pointer.startY;
      this._pointer.lastX = e.clientX;
      this._pointer.lastY = e.clientY;

      // Check if movement exceeds swipe threshold
      if (Math.abs(dx) > this._SWIPE_THRESHOLD || Math.abs(dy) > this._SWIPE_THRESHOLD) {
        this._pointer.moved = true;

        // Determine swipe direction (horizontal vs vertical)
        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal swipe — walk
          this._walkDir = dx > 0 ? 1 : -1;
          this._walkUntil = this.now + 0.6; // walk for 600ms after swipe
        } else {
          // Vertical swipe
          if (dy < -this._SWIPE_THRESHOLD) {
            // Swipe up = jump
            this._push('jump');
          } else if (dy > this._SWIPE_THRESHOLD) {
            // Swipe down = block
            this._push('down_hold');
          }
        }
      }
    });

    canvas.addEventListener('pointerup', e => {
      if (!this._pointer || e.pointerId !== this._pointer.id) return;
      e.preventDefault();

      const dx = e.clientX - this._pointer.startX;
      const dy = e.clientY - this._pointer.startY;

      if (!this._pointer.moved && Math.abs(dx) < this._SWIPE_THRESHOLD && Math.abs(dy) < this._SWIPE_THRESHOLD) {
        // It was a TAP — attack!
        this._push('light');
      } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > this._SWIPE_THRESHOLD) {
        // Horizontal swipe ended — set walk direction with momentum
        this._walkDir = dx > 0 ? 1 : -1;
        this._walkUntil = this.now + 0.6;
      }

      this._pointer = null;
    });

    canvas.addEventListener('pointercancel', e => {
      this._pointer = null;
    });

    // ── Mouse events (fallback for desktop — only if no pointer support) ──
    canvas.addEventListener('mousedown', e => {
      // Skip if pointer events already handled this
      if (this._pointer) return;
      e.preventDefault();
      if (e.button === 2) {
        this._push('special');
      } else {
        this._push('light');
      }
    });

    // ── Keyboard (desktop testing) ──
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const c = e.code || e.key;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyZ','KeyX','Enter','Space','Escape'].includes(c)) {
        e.preventDefault();
      }
      this._keys.add(c);
      this._keyDownAt.set(c, this.now);
      if (e.key) { this._keys.add(e.key); this._keyDownAt.set(e.key, this.now); }

      // Edge-triggered
      if (c === 'ArrowUp' || e.key === 'ArrowUp')     this._push('jump');
      if (c === 'ArrowLeft' || e.key === 'ArrowLeft')  this._push('walk_left_hold');
      if (c === 'ArrowRight' || e.key === 'ArrowRight') this._push('walk_right_hold');
      if (c === 'KeyZ')      this._push('light');
      if (c === 'KeyX')      this._push('heavy');
      if (c === 'Enter' || e.key === 'Enter')     this._push('ui_confirm');
      if (c === 'Space')     this._push('ui_confirm');
      if (c === 'Escape')    this._push('ui_back');
    });

    window.addEventListener('keyup', e => {
      this._keys.delete(e.code);
      this._keys.delete(e.key);
      this._keyDownAt.delete(e.code);
      this._keyDownAt.delete(e.key);
      if (e.code === 'ArrowDown' || e.key === 'ArrowDown' || e.key === 'Down') this._push('down_release');
    });
  }

  update(dt) {
    this.now += dt;

    // Auto-release keys after 800ms (armband may not fire keyup)
    for (const [code, downTime] of this._keyDownAt.entries()) {
      if (this.now - downTime > 0.8) {
        this._keys.delete(code);
        this._keyDownAt.delete(code);
        if (code === 'ArrowDown') this._push('down_release');
      }
    }

    // Keyboard continuous hold
    if (this._keys.has('ArrowLeft') || this._keys.has('Left'))   this._push('walk_left_hold');
    if (this._keys.has('ArrowRight') || this._keys.has('Right')) this._push('walk_right_hold');
    if (this._keys.has('ArrowDown') || this._keys.has('Down'))   this._push('down_hold');

    // Swipe-based walking (from pointer/armband)
    if (this._walkDir !== 0 && this.now < this._walkUntil) {
      if (this._walkDir < 0) this._push('walk_left_hold');
      else                    this._push('walk_right_hold');
    } else {
      this._walkDir = 0;
    }

    // Expire old buffered actions (200ms buffer window)
    this.queue = this.queue.filter(ev => (this.now - ev.t) <= 0.2);
  }

  consume() {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  peek() {
    return this.queue;
  }

  _push(action) {
    this.queue.push({ t: this.now, action });
  }
}
