// ============================================================
//  input.js — Dead-simple input for Meta glasses armband
//  Inputs: arrow keys + left click (light) + right click (special)
//  Key auto-release after 300ms (armband may not fire keyup)
// ============================================================

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.queue = [];   // { t, action }
    this.now = 0;

    // Currently held keys + when they went down
    this._keys = new Set();
    this._keyDownAt = new Map();

    // Prevent right-click context menu (critical for armband)
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('contextmenu', e => e.preventDefault());

    // ── Pointer events (PRIMARY — armband fires these) ──
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (e.button === 2) {
        this._push('special');
      } else {
        this._push('light');
      }
    });

    // ── Mouse events (fallback for desktop testing) ──
    canvas.addEventListener('mousedown', e => {
      e.preventDefault();
      if (e.button === 2) {
        this._push('special');
      } else {
        this._push('light');
      }
    });

    // ── Keyboard ──
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const c = e.code;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyZ','KeyX','Enter','Space','Escape'].includes(c)) {
        e.preventDefault();
      }
      this._keys.add(c);
      this._keyDownAt.set(c, this.now);

      // Edge-triggered actions (fire once on press)
      if (c === 'ArrowUp')   this._push('jump');
      if (c === 'KeyZ')      this._push('light');
      if (c === 'KeyX')      this._push('heavy');
      if (c === 'Enter')     this._push('ui_confirm');
      if (c === 'Space')     this._push('ui_confirm');
      if (c === 'Escape')    this._push('ui_back');
    });

    window.addEventListener('keyup', e => {
      this._keys.delete(e.code);
      this._keyDownAt.delete(e.code);
      if (e.code === 'ArrowDown') this._push('down_release');
    });
  }

  update(dt) {
    this.now += dt;

    // Auto-release keys after 500ms (armband may not fire keyup)
    for (const [code, downTime] of this._keyDownAt.entries()) {
      if (this.now - downTime > 0.5) {
        this._keys.delete(code);
        this._keyDownAt.delete(code);
        if (code === 'ArrowDown') this._push('down_release');
      }
    }

    // Continuous hold actions (pushed every frame while held)
    if (this._keys.has('ArrowLeft'))  this._push('walk_left_hold');
    if (this._keys.has('ArrowRight')) this._push('walk_right_hold');
    if (this._keys.has('ArrowDown'))  this._push('down_hold');

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
