// recur.js: recursion and dynamic programming. The tower puzzle, a call
// tree that repeats itself, and a grid where greed loses.
(() => {
  const { base, no, range } = BB;
  const L = BB.logic;
  const top = (a) => a[a.length - 1];

  // ── hanoi ──────────────────────────────────────────────────────────────
  // Next move of the shortest solution from any legal position.
  const hanoiNext = (pegs, k, target) => {
    if (k === 0) return null;
    const at = pegs.findIndex((p) => p.includes(k));
    if (at === target) return hanoiNext(pegs, k - 1, target);
    const spare = 3 - at - target;
    return hanoiNext(pegs, k - 1, spare) || { from: at, to: target, k, spare };
  };
  const hanoiRound = (s) => { const n = s.sizes[s.round]; s.n = n; s.pegs = [range(n, (i) => n - i), [], []]; s.prompt = `Move all ${n} discs to the right-hand peg. One disc at a time, never a bigger one on a smaller one.`; };
  L.hanoi = {
    unit: 'moves', undo: true,
    init(cfg) {
      const sizes = cfg.sizes || [3, 4];
      const par = sizes.reduce((t, n) => t + 2 ** n - 1, 0);
      const s = base({ sizes, rounds: sizes.length, par, par2: par + 8 });
      hanoiRound(s);
      return s;
    },
    act(s, a) {
      const f = s.pegs[a.from], t = s.pegs[a.to];
      if (a.t !== 'move' || !f || !t || a.from === a.to) return no();
      if (!f.length) return no('That peg is empty.');
      if (t.length && top(t) < top(f)) return no('A bigger disc cannot sit on a smaller one.');
      t.push(f.pop()); s.ops++;
      if (s.pegs[2].length === s.n) {
        s.round++;
        if (s.round >= s.rounds) s.status = 'won'; else hanoiRound(s);
        return { ev: [{ t: 'good', v: s.round / s.rounds }], say: s.status === 'play' ? { who: 'murphy', text: 'One more disc. That should only double your trouble.' } : null };
      }
      return { ev: [{ t: 'move', v: top(t) / s.n }] };
    },
    hint(s) {
      const m = hanoiNext(s.pegs, s.n, 2), names = ['left', 'middle', 'right'];
      const note = m.k === 1 ? `Move the smallest disc to the ${names[m.to]} peg.` : `Everything smaller than disc ${m.k} is stacked on the ${names[m.spare]} peg, out of the way. Move disc ${m.k} to the ${names[m.to]} peg.`;
      return { a: { t: 'move', from: m.from, to: m.to }, note, line: 4 };
    },
  };

  // ── fib: a call tree, with and without a memo ──────────────────────────
  const fibRound = (s) => {
    const r = s.plan[s.round];
    s.N = r.n; s.useMemo = r.memo; s.memo = {}; s.nodes = [{ id: 0, n: r.n, p: null, k: null, v: null }]; s.calls = 1; s.hits = 0;
    s.prompt = r.memo ? `Work out fib(${r.n}). This time every answer goes in the notebook, and a repeated question is answered from it for free.` : `Work out fib(${r.n}). Tap a call to split it into the two smaller calls it needs.`;
  };
  const fibResolve = (s) => {
    for (let again = true; again;) {
      again = false;
      for (const nd of s.nodes) {
        if (nd.v == null && nd.k && s.nodes[nd.k[0]].v != null && s.nodes[nd.k[1]].v != null) { nd.v = s.nodes[nd.k[0]].v + s.nodes[nd.k[1]].v; again = true; }
        if (nd.v != null && s.useMemo && nd.n > 1 && s.memo[nd.n] == null) { s.memo[nd.n] = nd.v; again = true; }
        if (nd.v == null && s.useMemo && s.memo[nd.n] != null) { nd.v = s.memo[nd.n]; nd.hit = true; s.hits++; again = true; }
      }
    }
  };
  L.fib = {
    unit: 'calls',
    init(cfg) {
      const plan = cfg.plan || [{ n: 5, memo: false }, { n: 8, memo: true }];
      const s = base({ plan, rounds: plan.length });
      // Without a memo every call above fib(1) must be expanded: fib(n+1)-1 of them.
      const fibv = (n) => (n < 2 ? n : fibv(n - 1) + fibv(n - 2));
      s.par = plan.reduce((t, r) => t + (r.memo ? r.n - 1 : fibv(r.n + 1) - 1), 0); s.par2 = s.par + 2; s.limit = s.par + 5;
      fibRound(s);
      return s;
    },
    act(s, a) {
      const nd = s.nodes[a.id];
      if (a.t !== 'call' || !nd) return no();
      if (nd.v != null || nd.k) return no(nd.v != null ? 'That call already has its answer.' : 'That call is waiting on the calls below it.');
      s.ops++;
      nd.k = [nd.n - 1, nd.n - 2].map((n) => { const id = s.nodes.length; s.nodes.push({ id, n, p: nd.id, k: null, v: n < 2 ? n : null }); return id; });
      s.calls += 2;
      const hits = s.hits;
      fibResolve(s);
      const ev = [{ t: 'reveal', v: nd.n / 9 }];
      let say = s.hits > hits ? { who: 'bit', text: 'Already in the notebook. No need to work it out again.' } : null;
      if (s.nodes[0].v != null) {
        s.results = (s.results || []).concat([{ n: s.N, calls: s.calls, expanded: s.ops }]);
        s.round++;
        if (s.round >= s.rounds) s.status = 'won';
        else { say = { who: 'murphy', text: `${s.calls} calls for fib(${s.N}), and you worked out fib(2) three separate times. I love it.` }; fibRound(s); }
        ev.push({ t: 'good', v: s.round / s.rounds });
      }
      return { ev, say };
    },
    hint(s) {
      const find = (id) => { const nd = s.nodes[id]; if (nd.v != null) return null; if (!nd.k) return nd; return find(nd.k[0]) || find(nd.k[1]); };
      const nd = find(0);
      return { a: { t: 'call', id: nd.id }, note: `fib(${nd.n}) is not known yet. It needs fib(${nd.n - 1}) and fib(${nd.n - 2}).`, line: 5 };
    },
  };

  // ── grid: the best path, first by feel and then by table ───────────────
  const gridBest = (g) => { const b = g.map((r) => r.slice()); for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) b[r][c] += Math.max(r ? b[r - 1][c] : 0, c ? b[r][c - 1] : 0); return b; };
  const gridGreedy = (g) => { let r = 0, c = 0, t = g[0][0]; while (r < g.length - 1 || c < g[0].length - 1) { if (r === g.length - 1) c++; else if (c === g[0].length - 1) r++; else if (g[r][c + 1] >= g[r + 1][c]) c++; else r++; t += g[r][c]; } return t; };
  BB.gridBest = gridBest; BB.gridGreedy = gridGreedy;
  L.grid = {
    unit: 'cells',
    init(cfg, rng) {
      const R = cfg.rows || 4, C = cfg.cols || 5;
      let g, opt;
      do { g = range(R, () => range(C, () => rng.int(1, 9))); opt = gridBest(g)[R - 1][C - 1]; } while (opt - gridGreedy(g) < 4);
      return base({ g, R, C, opt, phase: 'walk', pos: [0, 0], trail: [[0, 0]], sum: g[0][0], best: range(R, () => Array(C).fill(null)), from: range(R, () => Array(C).fill(null)), path: null,
        prompt: 'Walk from the top-left corner to the bottom-right, moving only right or down. Collect as much as you can.' });
    },
    act(s, a) {
      const { R, C, g } = s;
      if (s.phase === 'walk') {
        if (a.t !== 'step' || (a.d !== 'R' && a.d !== 'D')) return no();
        const [r, c] = s.pos, nr = r + (a.d === 'D'), nc = c + (a.d === 'R');
        if (nr >= R || nc >= C) return no('That way is off the board.');
        s.pos = [nr, nc]; s.trail.push([nr, nc]); s.sum += g[nr][nc];
        if (nr < R - 1 || nc < C - 1) return { ev: [{ t: 'move', v: s.sum / s.opt }] };
        s.phase = 'table'; s.walked = s.sum;
        s.prompt = 'Now be certain. Fill in the best total that can reach each square: a square is ready once the squares above it and to its left are done.';
        return { ev: [{ t: 'good', v: 0.5 }], say: { who: 'murphy', text: s.walked === s.opt ? `${s.walked}. Lucky. Can you prove nothing beats it?` : `You collected ${s.walked}. I know a path worth ${s.opt}.` } };
      }
      const { r, c } = a;
      if (a.t !== 'solve' || !(r >= 0 && r < R && c >= 0 && c < C)) return no();
      if (s.best[r][c] != null) return no('That square is already worked out.');
      if ((r && s.best[r - 1][c] == null) || (c && s.best[r][c - 1] == null)) return no('Not yet: this square needs the one above it and the one to its left first.');
      const up = r ? s.best[r - 1][c] : null, left = c ? s.best[r][c - 1] : null;
      s.from[r][c] = up == null && left == null ? null : (left == null || (up != null && up > left) ? 'U' : 'L');
      s.best[r][c] = g[r][c] + Math.max(up || 0, left || 0); s.ops++;
      s.calc = { r, c, up, left, v: g[r][c], best: s.best[r][c] };
      if (r === R - 1 && c === C - 1) {
        s.status = 'won'; s.path = [];
        for (let pr = r, pc = c; ;) { s.path.unshift([pr, pc]); const f = s.from[pr][pc]; if (!f) break; if (f === 'U') pr--; else pc--; }
        return { ev: [{ t: 'found' }] };
      }
      return { ev: [{ t: 'reveal', v: s.best[r][c] / s.opt }] };
    },
    hint(s) {
      const { R, C, g } = s;
      if (s.phase === 'walk') {
        const tail = range(R, () => Array(C).fill(0));
        for (let r = R - 1; r >= 0; r--) for (let c = C - 1; c >= 0; c--) tail[r][c] = g[r][c] + Math.max(r < R - 1 ? tail[r + 1][c] : 0, c < C - 1 ? tail[r][c + 1] : 0);
        const [r, c] = s.pos;
        const d = r === R - 1 ? 'R' : c === C - 1 ? 'D' : (tail[r][c + 1] >= tail[r + 1][c] ? 'R' : 'D');
        return { a: { t: 'step', d }, note: `Step ${d === 'R' ? 'right' : 'down'}. (I peeked at the whole board to know that. You will see how in a moment.)` };
      }
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (s.best[r][c] == null) {
        const up = r ? s.best[r - 1][c] : null, left = c ? s.best[r][c - 1] : null;
        const note = up == null && left == null ? 'The start square: its best total is just its own value.' : `Best way in is from ${left == null || (up != null && up > left) ? 'above' : 'the left'} (${Math.max(up || 0, left || 0)}). Add this square's ${g[r][c]}.`;
        return { a: { t: 'solve', r, c }, note, line: 4 };
      }
      return null;
    },
  };
})();
