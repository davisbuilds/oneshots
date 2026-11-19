// Keyboard and mouse. Mouse look accumulates while the pointer is locked;
// actions are edge-triggered presses consumed once per frame.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.look = [0, 0];
    this.sensitivity = 0.0021;
    this.enabled = true;
    this.assumeLocked = false; // tests: keyboard and mouse without pointer lock
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['Tab', 'Space'].includes(e.code) && this.locked) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // without pointer lock (tests, or a browser that refuses it) look by dragging
      if (this.assumeLocked && document.pointerLockElement !== this.canvas && !(e.buttons & 1)) return;
      this.look[0] += e.movementX; this.look[1] += e.movementY;
    });
    addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.pressed.add('Mouse0'); });
  }
  get locked() { return this.assumeLocked || document.pointerLockElement === this.canvas; }
  lock() { try { const p = this.canvas.requestPointerLock?.({ unadjustedMovement: true }); p?.catch?.(() => this.canvas.requestPointerLock?.()); } catch { this.canvas.requestPointerLock?.(); } }
  unlock() { if (this.locked) document.exitPointerLock?.(); }
  move() {
    const k = this.keys;
    return {
      forward: (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0),
      right: (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0),
      run: k.has('ShiftLeft') || k.has('ShiftRight'),
      jump: k.has('Space'),
    };
  }
  takeLook() { const l = this.look; this.look = [0, 0]; return [l[0] * this.sensitivity, l[1] * this.sensitivity]; }
  take(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }
  endFrame() { this.pressed.clear(); }
}
