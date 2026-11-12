// core.js: namespace, seeded randomness, and the contract every puzzle follows.
//
// A puzzle is a pure state machine: init(cfg, rng) -> state (plain JSON),
// act(state, action) mutates it, hint(state) names the next move of the
// textbook algorithm. The page, the demo player, the hint button and the
// tests all drive the same three functions.
var BB = globalThis.BB || (globalThis.BB = {});
(() => {
  BB.logic = {};
  BB.views = {};

  BB.rng = (seed) => {
    let a = (seed >>> 0) || 1;
    const r = () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.shuffle = (arr) => {
      const b = arr.slice();
      for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
      return b;
    };
    return r;
  };

  BB.clone = (o) => JSON.parse(JSON.stringify(o));
  BB.range = (n, f = (i) => i) => Array.from({ length: n }, (_, i) => f(i));
  BB.sorted = (a) => a.every((v, i) => !i || a[i - 1] <= v);

  // Fields every puzzle state carries. ops is the thing being counted
  // (peeks, swaps, comparisons...). par earns three stars, par2 two;
  // reaching limit without winning, or maxStrikes mistakes, loses.
  BB.base = (o) => Object.assign({
    status: 'play', ops: 0, strikes: 0, maxStrikes: 3,
    par: null, par2: null, limit: null, round: 0, rounds: 1, prompt: '', why: '',
  }, o);

  BB.strike = (s, text) => { s.strikes++; return { ok: false, ev: [{ t: 'strike' }], say: text ? { who: 'murphy', text } : null }; };
  BB.no = (text) => ({ ok: false, ev: [{ t: 'no' }], say: text ? { who: 'bit', text } : null });

  BB.init = (type, cfg, seed) => {
    const s = BB.logic[type].init(cfg || {}, BB.rng(seed == null ? 1 : seed));
    s.type = type;
    return s;
  };

  BB.act = (s, a) => {
    if (s.status !== 'play') return { ok: false, ev: [] };
    const r = BB.logic[s.type].act(s, a) || {};
    r.ev = r.ev || [];
    if (r.ok === undefined) r.ok = true;
    if (s.status === 'play' && s.strikes >= s.maxStrikes) { s.status = 'lost'; s.why = s.why || 'strikes'; }
    if (s.status === 'play' && s.limit != null && s.ops >= s.limit) { s.status = 'lost'; s.why = s.why || 'budget'; }
    return r;
  };

  BB.stars = (s, hints) => {
    if (s.status !== 'won') return 0;
    let st = 3;
    if (s.par != null && s.ops > s.par) st = (s.par2 != null && s.ops <= s.par2) ? 2 : 1;
    st = Math.min(st, 3 - s.strikes);
    if (hints) st = Math.min(st, 2);
    return Math.max(1, st);
  };

  // Follow the hint policy to the end. Used by the tests and the demo.
  BB.solve = (s, cap = 4000) => {
    const P = BB.logic[s.type], steps = [];
    while (s.status === 'play' && steps.length < cap) {
      const h = P.hint(s);
      if (!h || !h.a) throw new Error(s.type + ': the hint policy has no move from its own path');
      const r = BB.act(s, h.a);
      if (!r.ok) throw new Error(s.type + ': the hint policy made a rejected move ' + JSON.stringify(h.a));
      steps.push(h);
    }
    return steps;
  };
})();
