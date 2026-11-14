// sort.js: sorting. Adjacent swaps, long swaps, a balance scale with an
// adversary behind it, merging, and choosing pivots.
(() => {
  const { base, strike, no, range, sorted } = BB;
  const L = BB.logic;

  const inversions = (a) => { let c = 0; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) c++; return c; };
  const cycles = (a) => { const seen = []; let c = 0; for (let i = 0; i < a.length; i++) { if (seen[i]) continue; c++; for (let j = i; !seen[j]; j = a[j] - 1) seen[j] = true; } return c; };
  BB.inversions = inversions;

  // ── swaps: sort a visible row; adjacent swaps only, or any two ─────────
  L.swaps = {
    unit: 'swaps', undo: true,
    init(cfg, rng) {
      const n = cfg.n, adj = cfg.mode === 'adjacent';
      let arr;
      for (let t = 0; t < 2000; t++) {
        arr = rng.shuffle(range(n, (i) => i + 1));
        const inv = inversions(arr), need = n - cycles(arr);
        if (adj ? (inv >= 7 && inv <= 9 && arr[0] !== 1) : (need >= n - 3 && need <= n - 2 && inv >= n * 2)) break;
      }
      const par = adj ? inversions(arr) : n - cycles(arr);
      return base({ mode: cfg.mode, arr, inv: inversions(arr), par, par2: par + Math.max(2, Math.ceil(par / 2)),
        prompt: adj ? 'Sort the row. You may only swap neighbours.' : 'Sort the row. Swap any two, but every swap costs.' });
    },
    act(s, a) {
      const { i, j } = a;
      if (a.t !== 'swap' || i === j || !(i >= 0 && j >= 0 && i < s.arr.length && j < s.arr.length)) return no();
      if (s.mode === 'adjacent' && Math.abs(i - j) !== 1) return no('Neighbours only on this floor.');
      const before = s.inv;
      [s.arr[i], s.arr[j]] = [s.arr[j], s.arr[i]];
      s.ops++; s.inv = inversions(s.arr);
      if (sorted(s.arr)) s.status = 'won';
      return { ev: [{ t: 'move', v: s.arr[i] / s.arr.length }], say: s.mode === 'adjacent' && s.inv > before ? { who: 'murphy', text: 'Those two were already in order. Now they are not.' } : null };
    },
    hint(s) {
      const a = s.arr;
      if (s.mode === 'adjacent') {
        const i = a.findIndex((v, k) => k < a.length - 1 && v > a[k + 1]);
        return { a: { t: 'swap', i, j: i + 1 }, note: `${a[i]} sits left of ${a[i + 1]}: an out-of-order pair. Swap them.`, line: 4 };
      }
      const i = a.findIndex((v, k) => v !== k + 1), j = a.indexOf(i + 1);
      return { a: { t: 'swap', i, j }, note: `${i + 1} is the smallest tile not yet in place. Swap it straight into slot [${i}].`, line: 6 };
    },
  };

  // ── scale: hidden weights, comparisons only ─────────────────────────────
  // lt[a*n+b] = 1 means a is known to be lighter than b. Murphy never fixes
  // the weights: he answers each weighing with whichever result leaves more
  // orderings possible (more linear extensions of what is known so far).
  const close = (lt, n) => { for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (lt[i * n + k]) for (let j = 0; j < n; j++) if (lt[k * n + j]) lt[i * n + j] = 1; return lt; };
  const withRel = (lt, n, a, b) => { const c = lt.slice(); c[a * n + b] = 1; return close(c, n); };
  const extensions = (lt, n) => {
    const pred = range(n, (j) => { let m = 0; for (let i = 0; i < n; i++) if (lt[i * n + j]) m |= 1 << i; return m; });
    const f = new Array(1 << n).fill(0); f[0] = 1;
    for (let m = 0; m < (1 << n); m++) if (f[m]) for (let j = 0; j < n; j++) if (!(m & (1 << j)) && (pred[j] & m) === pred[j]) f[m | (1 << j)] += f[m];
    return f[(1 << n) - 1];
  };
  const candidates = (s) => range(s.n).filter((a) => !range(s.n).some((b) => s.lt[a * s.n + b]));
  const pairsKnown = (s) => s.lt.reduce((x, y) => x + y, 0);
  const memo = new Map();
  // Fewest further weighings that always finish the sort from this state.
  const need = (lt, n) => {
    const key = n + ':' + lt.join('');
    if (memo.has(key)) return memo.get(key);
    let best = Infinity, any = false;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      if (lt[a * n + b] || lt[b * n + a]) continue;
      any = true;
      const v = 1 + Math.max(need(withRel(lt, n, a, b), n), need(withRel(lt, n, b, a), n));
      if (v < best) best = v;
    }
    if (!any) best = 0;
    memo.set(key, best);
    return best;
  };
  BB.poset = { close, extensions, need, withRel };

  L.scale = {
    unit: 'weighings',
    init(cfg, rng) {
      const n = cfg.n;
      return base({ n, goal: cfg.goal, lt: Array(n * n).fill(0), salt: rng.int(0, 99), last: null, champ: null,
        par: cfg.limit, limit: cfg.limit,
        prompt: cfg.goal === 'max' ? `Find the heaviest crate. You have ${cfg.limit} weighings.` : `Put all ${n} crates in order. You have ${cfg.limit} weighings.` });
    },
    act(s, a) {
      const n = s.n, x = a.a, y = a.b;
      if (a.t !== 'cmp' || x === y || !(x >= 0 && y >= 0 && x < n && y < n)) return no();
      const name = (i) => String.fromCharCode(65 + i);
      if (s.lt[x * n + y] || s.lt[y * n + x]) {
        const heavy = s.lt[x * n + y] ? y : x;
        s.last = { a: x, b: y, heavy, free: true };
        return no(`You already know ${name(heavy)} is heavier than ${name(heavy === x ? y : x)}. No need to weigh them.`);
      }
      const A = withRel(s.lt, n, x, y), B = withRel(s.lt, n, y, x);
      const ea = extensions(A, n), eb = extensions(B, n);
      const xLighter = ea !== eb ? ea > eb : ((x * 7 + y * 13 + s.ops * 5 + s.salt) & 1) === 0;
      s.lt = xLighter ? A : B; s.ops++;
      const heavy = xLighter ? y : x;
      s.last = { a: x, b: y, heavy };
      if (s.goal === 'max') {
        const c = candidates(s);
        if (c.length === 1) { s.champ = c[0]; s.status = 'won'; }
      } else if (pairsKnown(s) === n * (n - 1) / 2) {
        s.order = range(n).sort((p, q) => (s.lt[p * n + q] ? -1 : 1));
        s.status = 'won';
      }
      return { ev: [{ t: 'weigh', v: heavy / n }], say: { who: 'murphy', text: `${name(heavy)} is heavier.` } };
    },
    hint(s) {
      const n = s.n, name = (i) => String.fromCharCode(65 + i);
      if (s.goal === 'max') {
        const c = candidates(s);
        return { a: { t: 'cmp', a: c[0], b: c[1] }, note: `${name(c[0])} and ${name(c[1])} have never lost. Weigh them: the loser is out for good.`, line: 4 };
      }
      let best = null;
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        if (s.lt[a * n + b] || s.lt[b * n + a]) continue;
        const A = withRel(s.lt, n, a, b), B = withRel(s.lt, n, b, a);
        const ea = extensions(A, n), eb = extensions(B, n);
        const v = n <= 5 ? 1 + Math.max(need(A, n), need(B, n)) : Math.max(ea, eb);
        if (!best || v < best.v || (v === best.v && Math.max(ea, eb) < Math.max(best.ea, best.eb))) best = { a, b, v, ea, eb };
      }
      return { a: { t: 'cmp', a: best.a, b: best.b }, note: `Weigh ${name(best.a)} against ${name(best.b)}. One answer leaves ${best.ea} possible orders, the other ${best.eb}: close to an even split.` };
    },
  };

  // ── merge: two sorted runs into one, then a whole merge sort ───────────
  const mergeAdvance = (s, ev) => {
    for (;;) {
      if (s.active) {
        if (s.L.length && s.R.length) return;
        s.out.push(...s.L, ...s.R); s.L = []; s.R = [];
        s.next.push(s.out); s.out = []; s.active = false;
        ev.push({ t: 'good', v: 0.5 });
      }
      if (s.runs.length >= 2) { s.L = s.runs.shift(); s.R = s.runs.shift(); s.out = []; s.active = true; continue; }
      if (s.runs.length === 1) { s.next.push(s.runs.shift()); continue; }
      if (s.next.length > 1) { s.runs = s.next; s.next = []; s.pass++; continue; }
      s.round++;
      if (s.round >= s.rounds) { s.status = 'won'; s.result = s.next[0]; return; }
      mergeRound(s);
    }
  };
  const mergeRound = (s) => {
    const r = s.plan[s.round];
    s.runs = r.mode === 'merge' ? [r.a.slice(), r.b.slice()] : r.arr.map((v) => [v]);
    s.next = []; s.L = []; s.R = []; s.out = []; s.active = false; s.pass = 0; s.mode = r.mode; s.size = r.mode === 'merge' ? r.a.length + r.b.length : r.arr.length;
    s.prompt = r.mode === 'merge' ? 'Two sorted rows. Build one sorted row: always take the smaller front tile.' : 'Now a jumbled row. Singles merge into pairs, pairs into fours, fours into the lot.';
  };
  L.merge = {
    unit: 'comparisons',
    init(cfg, rng) {
      const pool = rng.shuffle(range(40, (i) => i + 10));
      const a = pool.slice(0, 4).sort((x, y) => x - y), b = pool.slice(4, 8).sort((x, y) => x - y);
      let arr;
      do arr = rng.shuffle(range(8, (i) => i + 1)); while (BB.inversions(arr) < 12);
      const s = base({ plan: cfg.plan || [{ mode: 'merge', a, b }, { mode: 'sort', arr }], maxStrikes: 3 });
      s.rounds = s.plan.length;
      mergeRound(s); mergeAdvance(s, []);
      return s;
    },
    act(s, a) {
      if (a.t !== 'pick' || !s.active || (a.side !== 'L' && a.side !== 'R')) return no();
      const mine = s[a.side], other = s[a.side === 'L' ? 'R' : 'L'];
      if (mine[0] > other[0]) return strike(s, `${mine[0]} is bigger than ${other[0]}. The smaller front tile goes first.`);
      s.ops++;
      const v = mine.shift(); s.out.push(v);
      const ev = [{ t: 'move', v: s.out.length / 8 }];
      mergeAdvance(s, ev);
      return { ev };
    },
    hint(s) {
      const side = s.L[0] < s.R[0] ? 'L' : 'R';
      return { a: { t: 'pick', side }, note: `Compare the two fronts: ${s.L[0]} and ${s.R[0]}. Take ${Math.min(s.L[0], s.R[0])}.`, line: 4 };
    },
  };

  // ── pivot: quicksort, where the only decision is the pivot ─────────────
  const bestCost = (n) => (n < 2 ? 0 : n - 1 + bestCost(Math.floor((n - 1) / 2)) + bestCost(Math.ceil((n - 1) / 2)));
  L.pivot = {
    unit: 'comparisons',
    init(cfg, rng) {
      const n = cfg.n || 15;
      const arr = rng.shuffle(range(n, (i) => i + 1)).map((v) => ({ v, d: 0, fixed: false }));
      const par = bestCost(n);
      return base({ arr, segs: [{ lo: 0, hi: n - 1, d: 0 }], par, par2: par + 8, limit: cfg.limit || par + 30,
        prompt: 'Pick a pivot. Everything smaller goes left of it, everything bigger goes right.' });
    },
    act(s, a) {
      const k = s.segs.findIndex((g) => a.i >= g.lo && a.i <= g.hi);
      if (a.t !== 'pivot' || k < 0) return no('That tile is already in its final place.');
      const g = s.segs[k], p = s.arr[a.i];
      const part = s.arr.slice(g.lo, g.hi + 1);
      const left = part.filter((t) => t.v < p.v), right = part.filter((t) => t.v > p.v);
      for (const t of [...left, ...right]) t.d = g.d + 1;
      p.fixed = true; p.d = g.d;
      s.arr.splice(g.lo, part.length, ...left, p, ...right);
      s.ops += part.length - 1;
      const subs = [];
      const add = (lo, len) => { if (len === 1) s.arr[lo].fixed = true; else if (len > 1) subs.push({ lo, hi: lo + len - 1, d: g.d + 1 }); };
      add(g.lo, left.length); add(g.lo + left.length + 1, right.length);
      s.segs.splice(k, 1, ...subs);
      s.lastPivot = { v: p.v, left: left.length, right: right.length };
      if (!s.segs.length) s.status = 'won';
      const lop = Math.min(left.length, right.length) === 0 && part.length > 2;
      return { ev: [{ t: 'weigh', v: p.v / s.arr.length }], say: lop ? { who: 'murphy', text: `${part.length - 1} comparisons and the pile only shrank by one. Lovely.` } : null };
    },
    hint(s) {
      const g = s.segs[0];
      const part = s.arr.slice(g.lo, g.hi + 1).map((t) => t.v).sort((x, y) => x - y);
      const m = part[Math.floor((part.length - 1) / 2)];
      const i = s.arr.findIndex((t) => t.v === m);
      return { a: { t: 'pivot', i }, note: `${m} is the middle value of this group, so it splits the other ${part.length - 1} as evenly as possible.`, line: 3 };
    },
  };
})();
