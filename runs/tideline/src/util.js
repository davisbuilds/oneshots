// util.js: the shared namespace, a seeded random generator and small helpers.
// Every source file is a classic script that adds to globalThis.TL, so the page
// opens straight from disk and the same simulation files load in Node.
'use strict';
(function (TL) {
  // sfc32, seeded through splitmix32: fast, deterministic, good enough for
  // generating cargo and arrivals. Same seed, same terminal.
  function splitmix(a) {
    return function () {
      a |= 0; a = (a + 0x9e3779b9) | 0;
      let t = a ^ (a >>> 16); t = Math.imul(t, 0x21f0aaad);
      t ^= t >>> 15; t = Math.imul(t, 0x735a2d97);
      return ((t ^ (t >>> 15)) >>> 0);
    };
  }
  TL.rng = function (seed) {
    const sm = splitmix(seed >>> 0);
    let a = sm(), b = sm(), c = sm(), d = sm();
    const next = function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
    next.int = (n) => Math.floor(next() * n);
    next.range = (lo, hi) => lo + next() * (hi - lo);
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.chance = (p) => next() < p;
    // Approximately normal (sum of three uniforms), clamped.
    next.normal = (mu, sd, lo = -Infinity, hi = Infinity) => {
      const z = (next() + next() + next() - 1.5) * 2;
      return Math.min(hi, Math.max(lo, mu + sd * z));
    };
    return next;
  };

  TL.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  TL.lerp = (a, b, t) => a + (b - a) * t;
  TL.smooth = (t) => t * t * (3 - 2 * t);
  TL.easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // Linear interpolation in a table of rows sorted by key.
  TL.interp = function (rows, key, value, field) {
    let lo = 0, hi = rows.length - 1;
    if (value <= rows[0][key]) return rows[0][field];
    if (value >= rows[hi][key]) return rows[hi][field];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rows[m][key] <= value) lo = m; else hi = m; }
    const a = rows[lo], b = rows[hi], t = (value - a[key]) / (b[key] - a[key]);
    return a[field] + (b[field] - a[field]) * t;
  };

  // Composite Simpson's rule over equally spaced ordinates (odd count; a
  // trailing even interval falls back to the trapezium).
  TL.simpson = function (ys, h) {
    const n = ys.length;
    if (n < 2) return 0;
    if (n === 2) return (ys[0] + ys[1]) * h / 2;
    const m = (n - 1) % 2 === 0 ? n : n - 1;
    let s = ys[0] + ys[m - 1];
    for (let i = 1; i < m - 1; i++) s += ys[i] * (i % 2 ? 4 : 2);
    let r = s * h / 3;
    if (m < n) r += (ys[n - 2] + ys[n - 1]) * h / 2;
    return r;
  };

  // Binary min-heap keyed by a numeric priority.
  TL.Heap = class {
    constructor() { this.k = []; this.v = []; }
    get size() { return this.k.length; }
    push(key, val) {
      const k = this.k, v = this.v; let i = k.length;
      k.push(key); v.push(val);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (k[p] <= key) break;
        k[i] = k[p]; v[i] = v[p]; i = p;
      }
      k[i] = key; v[i] = val;
    }
    pop() {
      const k = this.k, v = this.v, top = v[0], n = k.length - 1;
      const lk = k.pop(), lv = v.pop();
      if (n > 0) {
        let i = 0;
        while (true) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && k[c + 1] < k[c]) c++;
          if (k[c] >= lk) break;
          k[i] = k[c]; v[i] = v[c]; i = c;
        }
        k[i] = lk; v[i] = lv;
      }
      return top;
    }
    peekKey() { return this.k[0]; }
  };

  // Formatting for the UI and logs.
  TL.fmt = {
    int: (n) => Math.round(n).toLocaleString('en-US'),
    f1: (n) => (Math.round(n * 10) / 10).toFixed(1),
    f2: (n) => (Math.round(n * 100) / 100).toFixed(2),
    signed: (n, d = 1) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(d),
    hm: (sec) => {
      const d = new Date(TL.EPOCH + sec * 1000);
      return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    },
    dur: (sec) => {
      sec = Math.max(0, Math.round(sec));
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
      return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
    },
  };
  // Simulation time zero: Friday 23 October 2026, 06:00, terminal local time
  // (shown as is; the console does not pretend to know a time zone).
  TL.EPOCH = Date.UTC(2026, 9, 23, 6, 0, 0);
  TL.MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  TL.DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
})(globalThis.TL = globalThis.TL || {});
