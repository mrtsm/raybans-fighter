// ============================================================
//  input.js — Input for Meta glasses armband (v2: Combo System)
//  
//  5 inputs, 8+ actions via combos:
//    Tap alone       → strike (quick, 10dmg)
//    Forward+Tap     → heavy (15dmg, lunge)
//    Back+Tap        → counter (8dmg, armor)
//    Up+Tap          → dive slam (12dmg, overhead)
//    Down+Tap        → uppercut (12dmg, anti-air)
//    Swipe L/R       → dash (100px, i-frames)
//    Swipe Down      → parry
//    Swipe Up        → jump
//    Fwd+Fwd+Tap     → ULTIMATE (when momentum full)
// ============================================================

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.queue = [];
    this.now = 0;

    // Player facing direction (fight.js sets this each frame)
    this.playerFacing = 1; // 1=facing right, -1=facing left

    // Combo tracking
    this._lastSwipeDir = null;   // 'left'|'right'|'up'|'down'
    this._lastSwipeTime = 0;
    this._comboWindow = 0.4;     // 400ms window for direction+tap combos

    // Ultimate tracking (forward-forward-tap)
    this._fwdSwipeCount = 0;
    this._lastFwdSwipeTime = 0;
    this._ultimateWindow = 0.6; // 600ms window for fwd+fwd+tap

    // Swipe tracking
    this._pointer = null;
    this._SWIPE_THRESHOLD = 20;
    this._swipeHandled = false; // prevent multi-fire per gesture

    // Keyboard
    this._keys = new Set();
    this._keyDownAt = new Map();

    // Prevent context menu
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('contextmenu', e => e.preventDefault());

    // ── Pointer events (armband) ──
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      this._pointer = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTime: this.now,
        moved: false,
        swipeFired: false,
      };
    });

    canvas.addEventListener('pointermove', e => {
      if (!this._pointer || e.pointerId !== this._pointer.id) return;
      e.preventDefault();
      const dx = e.clientX - this._pointer.startX;
      const dy = e.clientY - this._pointer.startY;

      if (!this._pointer.swipeFired &&
          (Math.abs(dx) > this._SWIPE_THRESHOLD || Math.abs(dy) > this._SWIPE_THRESHOLD)) {
        this._pointer.moved = true;
        this._pointer.swipeFired = true;

        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal swipe → DASH
          const dir = dx > 0 ? 'right' : 'left';
          this._registerSwipe(dir);
          this._push(dir === 'right' ? 'dash_right' : 'dash_left');
        } else {
          if (dy < -this._SWIPE_THRESHOLD) {
            // Swipe up → JUMP
            this._registerSwipe('up');
            this._push('jump');
          } else if (dy > this._SWIPE_THRESHOLD) {
            // Swipe down → PARRY
            this._registerSwipe('down');
            this._push('parry');
          }
        }
      }
    });

    canvas.addEventListener('pointerup', e => {
      if (!this._pointer || e.pointerId !== this._pointer.id) return;
      e.preventDefault();

      if (!this._pointer.moved) {
        // It was a TAP — check for combo
        this._handleTap();
      }

      this._pointer = null;
    });

    canvas.addEventListener('pointercancel', () => {
      this._pointer = null;
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

      // Arrow keys = swipe equivalent (for desktop testing)
      if (c === 'ArrowLeft') {
        this._registerSwipe('left');
        this._push('dash_left');
      }
      if (c === 'ArrowRight') {
        this._registerSwipe('right');
        this._push('dash_right');
      }
      if (c === 'ArrowUp') {
        this._registerSwipe('up');
        this._push('jump');
      }
      if (c === 'ArrowDown') {
        this._registerSwipe('down');
        this._push('parry');
      }

      // Z = tap (attack)
      if (c === 'KeyZ') this._handleTap();

      // X = heavy (shortcut, same as forward+tap)
      if (c === 'KeyX') this._push('heavy_strike');

      // Enter/Space = UI confirm
      if (c === 'Enter' || c === 'Space') this._push('ui_confirm');
      if (c === 'Escape') this._push('ui_back');
    });

    window.addEventListener('keyup', e => {
      this._keys.delete(e.code);
      this._keys.delete(e.key);
      this._keyDownAt.delete(e.code);
      this._keyDownAt.delete(e.key);
    });
  }

  // ── Register a swipe direction for combo tracking ──
  _registerSwipe(dir) {
    this._lastSwipeDir = dir;
    this._lastSwipeTime = this.now;

    // Track forward swipes for ultimate (fwd+fwd+tap)
    const isFwd = (dir === 'right' && this.playerFacing === 1) ||
                  (dir === 'left' && this.playerFacing === -1);

    if (isFwd) {
      if (this.now - this._lastFwdSwipeTime < this._ultimateWindow) {
        this._fwdSwipeCount++;
      } else {
        this._fwdSwipeCount = 1;
      }
      this._lastFwdSwipeTime = this.now;
    } else {
      // Non-forward swipe resets the ultimate counter
      this._fwdSwipeCount = 0;
    }
  }

  // ── Handle a tap (index finger) ──
  _handleTap() {
    const timeSinceSwipe = this.now - this._lastSwipeTime;
    const recentSwipe = timeSinceSwipe < this._comboWindow;

    // Check for ultimate first (fwd+fwd+tap within window)
    if (this._fwdSwipeCount >= 2 && (this.now - this._lastFwdSwipeTime) < this._ultimateWindow) {
      this._push('ultimate');
      this._fwdSwipeCount = 0;
      return;
    }

    if (recentSwipe && this._lastSwipeDir) {
      const dir = this._lastSwipeDir;
      const isFwd = (dir === 'right' && this.playerFacing === 1) ||
                    (dir === 'left' && this.playerFacing === -1);
      const isBack = (dir === 'right' && this.playerFacing === -1) ||
                     (dir === 'left' && this.playerFacing === 1);

      if (isFwd) {
        this._push('heavy_strike');     // Forward + tap = heavy
      } else if (isBack) {
        this._push('counter_strike');   // Back + tap = counter (armor)
      } else if (dir === 'up') {
        this._push('dive_slam');        // Up + tap = diving slam (overhead)
      } else if (dir === 'down') {
        this._push('uppercut');         // Down + tap = uppercut (anti-air)
      }
      // Clear the swipe after using it for a combo
      this._lastSwipeDir = null;
    } else {
      // Plain tap = quick strike
      this._push('strike');
    }
  }

  update(dt) {
    this.now += dt;

    // Auto-release keys after 800ms
    for (const [code, downTime] of this._keyDownAt.entries()) {
      if (this.now - downTime > 0.8) {
        this._keys.delete(code);
        this._keyDownAt.delete(code);
      }
    }

    // Expire old buffered actions (300ms buffer)
    this.queue = this.queue.filter(ev => (this.now - ev.t) <= 0.3);
  }

  consume() {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  peek() {
    return this.queue;
  }

  clearQueue() {
    this.queue = [];
  }

  _push(action) {
    this.queue.push({ t: this.now, action });
  }
}
