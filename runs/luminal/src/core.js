// core.js: the shared namespace, the tempo and the physical constants.
// Every source file is a classic script that adds to globalThis.LUMINAL, so the
// page opens straight from disk and the same files load in Node for the tests.
'use strict';
(function (L) {
  const BPM = 128;
  const BEAT = 60 / BPM;                 // 0.46875 s

  L.BPM = BPM;
  L.BEAT = BEAT;
  L.DT = 1 / 240;                        // fixed simulation step, seconds

  // Horizontal speeds in blocks per second. At "normal" the world scrolls five
  // blocks a beat, so one block is a sixteenth note's worth of beat * 1.25.
  L.SPEEDS = {
    slow: 4 / BEAT,
    normal: 5 / BEAT,
    fast: 6 / BEAT,
    rush: 7 / BEAT,
  };

  // Cube: a ground jump lasts exactly one beat and peaks 2.2 blocks up, so
  // holding the button bounces on every beat.
  const AIR = BEAT, APEX = 2.2;
  const G = 8 * APEX / (AIR * AIR);
  L.PHYS = {
    gravity: G,                           // blocks/s^2
    jump: G * AIR / 2,                    // take-off speed, blocks/s
    fallMax: 26,
    padJump: G * AIR / 2 * 1.38,          // yellow pad: about 4.2 blocks
    orbJump: G * AIR / 2 * 0.98,          // yellow orb
    gravOrbPush: 6,                       // blue orb: small shove toward the new floor
    coyote: 0.05,                         // seconds after leaving an edge that a jump still counts
    buffer: 0.09,                         // a press this long before an orb or landing still counts
    shipUp: 62,
    shipDown: 52,
    shipMax: 11.5,
    waveSlope: 1,                         // the wave flies at 45 degrees at every speed
    // Hitbox half sizes per mode. The inner box (30% of the size) is what
    // must hit a block's side to kill; anything shallower snaps onto the surface.
    box: { cube: [0.5, 0.5], ship: [0.5, 0.36], wave: [0.27, 0.27] },
    inner: 0.3,
  };

  L.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  L.lerp = (a, b, t) => a + (b - a) * t;
  L.smooth = t => { t = L.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  // Small deterministic PRNG for decoration (mulberry32).
  L.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Binary search: index of the last element with key(el) <= v, or -1.
  L.lastAtOrBefore = function (arr, v, key) {
    let lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (key(arr[mid]) <= v) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  };
})(globalThis.LUMINAL = globalThis.LUMINAL || {});
