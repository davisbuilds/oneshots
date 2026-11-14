// search.js: arrays and searching. Lockers, Murphy's hiding places, the
// million-number guessing game, and making room in a sorted array.
(() => {
  const { base, strike, no, range } = BB;
  const L = BB.logic;

  // ── boxes: index access, linear search, binary search ──────────────────
  // In the search modes nothing is hidden in advance. Murphy answers each
  // peek in whatever way keeps the most places left to look, which is what
  // "worst case" means; the values he shows always stay consistent.
  const assign = (s, i, rel) => {
    const { n, open, target: T } = s;
    let lo = -Infinity, hi = Infinity;
    for (let j = i - 1; j >= 0; j--) if (open[j] != null) { lo = open[j] + (i - j); break; }
    for (let j = i + 1; j < n; j++) if (open[j] != null) { hi = open[j] - (j - i); break; }
    if (rel === 'gt') lo = Math.max(lo, T + (i - s.lo)); else hi = Math.min(hi, T - (s.hi - i));
    if (lo === -Infinity) lo = hi - 5;
    if (hi === Infinity) hi = lo + 5;
    const span = Math.min(hi, lo + 5) - lo + 1;
    const pick = (s.salt * 31 + i * 17 + s.ops * 7) % span;
    return rel === 'gt' ? lo + pick : Math.max(lo, hi - pick);
  };

  L.boxes = {
    unit: 'peeks',
    init(cfg, rng) {
      const n = cfg.n;
      const s = base({ mode: cfg.mode, n, open: Array(n).fill(null), note: Array(n).fill('') });
      if (s.mode === 'index') {
        const word = cfg.word || 'ZERO';
        const decoys = rng.shuffle('ABCDFGHKLMNPSTUVWXY'.split('')).slice(0, n - word.length);
        s.items = [word[0], ...rng.shuffle([...word.slice(1), ...decoys])];
        s.word = word; s.got = '';
        s.targets = word.split('').map((c) => s.items.indexOf(c));
        s.rounds = word.length; s.target = s.targets[0];
        s.prompt = `Open locker [${s.target}].`;
      } else if (s.mode === 'linear') {
        s.target = rng.int(10, 99);
        s.junk = rng.shuffle(range(90, (i) => i + 10).filter((v) => v !== s.target)).slice(0, n);
        s.par = n; s.par2 = n;
        s.prompt = `Find ${s.target}. The boxes are in no particular order.`;
      } else {
        s.target = rng.int(45, 60); s.salt = rng.int(1, 9999);
        s.lo = 0; s.hi = n - 1;
        s.par = s.limit = cfg.limit || Math.ceil(Math.log2(n + 1));
        s.prompt = `Find ${s.target}. The boxes are sorted, smallest on the left.`;
      }
      return s;
    },
    act(s, a) {
      const i = a.i;
      if (a.t !== 'peek' || !(i >= 0 && i < s.n)) return no();
      if (s.open[i] != null) return no('That one is already open.');
      if (s.mode === 'index') {
        if (i !== s.target) return strike(s, `That is locker [${i}]. Counting starts at zero.`);
        s.ops++; s.open[i] = s.items[i]; s.got += s.items[i]; s.round++;
        if (s.round >= s.rounds) { s.status = 'won'; s.prompt = `Lockers spell ${s.got}.`; }
        else { s.target = s.targets[s.round]; s.prompt = `Open locker [${s.target}].`; }
        return { ev: [{ t: 'good', v: s.round / s.rounds }] };
      }
      s.ops++;
      if (s.mode === 'linear') {
        const left = s.open.filter((v) => v == null).length;
        if (left === 1) { s.open[i] = s.target; s.note[i] = 'hit'; s.status = 'won'; return { ev: [{ t: 'found' }], say: { who: 'murphy', text: 'Fine. It was in the last box. It is always in the last box.' } }; }
        s.open[i] = s.junk[left - 2]; s.note[i] = 'miss';
        const q = ['Nope.', 'Not that one.', 'Cold.', 'Keep going.', 'So close. (Not really.)', 'Wrong again!', 'Hee hee.'];
        return { ev: [{ t: 'reveal', v: s.open[i] / 100 }], say: { who: 'murphy', text: q[(s.ops - 1) % q.length] } };
      }
      let rel;
      if (i < s.lo) rel = 'lt';
      else if (i > s.hi) rel = 'gt';
      else {
        const left = i - s.lo, right = s.hi - i;
        if (!left && !right) {
          s.open[i] = s.target; s.note[i] = 'hit'; s.status = 'won';
          return { ev: [{ t: 'found' }], say: { who: 'murphy', text: 'Hmph. Nowhere left to move it.' } };
        }
        rel = left > right ? 'gt' : 'lt';
      }
      const v = assign(s, i, rel);
      s.open[i] = v; s.note[i] = rel === 'gt' ? 'hi' : 'lo';
      if (rel === 'gt') s.hi = Math.min(s.hi, i - 1); else s.lo = Math.max(s.lo, i + 1);
      const left = s.hi - s.lo + 1;
      return { ev: [{ t: 'reveal', v: (v - 20) / 70 }], say: { who: 'murphy', text: `${v} is too ${rel === 'gt' ? 'big' : 'small'}. ${left} ${left === 1 ? 'box' : 'boxes'} it could still be in.` } };
    },
    hint(s) {
      if (s.mode === 'index') return { a: { t: 'peek', i: s.target }, note: `Locker [${s.target}] is ${s.target} steps from the first one, which is [0].`, line: 3 };
      if (s.mode === 'linear') { const i = s.open.indexOf(null); return { a: { t: 'peek', i }, note: 'No order means no clues. Open the next box.', line: 2 }; }
      const mid = Math.floor((s.lo + s.hi) / 2);
      return { a: { t: 'peek', i: mid }, note: s.lo === s.hi ? `Only box [${mid}] is left.` : `Boxes [${s.lo}] to [${s.hi}] are still possible. Open the middle one, [${mid}], so either answer rules out half.`, line: 4 };
    },
  };

  // ── zoom: guess a number in 1..n against the same adversary ─────────────
  L.zoom = {
    unit: 'guesses',
    init(cfg) {
      const n = cfg.n;
      const par = Math.ceil(Math.log2(n + 1));
      return base({ n, lo: 1, hi: n, log: [], par, par2: par + 4, limit: cfg.limit || par + 10, prompt: `Murphy is thinking of a number from 1 to ${n.toLocaleString('en-US')}.` });
    },
    act(s, a) {
      const g = Math.round(a.g);
      if (a.t !== 'guess' || !(g >= s.lo && g <= s.hi)) return no(`Guess between ${s.lo.toLocaleString('en-US')} and ${s.hi.toLocaleString('en-US')}: everything else is ruled out.`);
      s.ops++;
      const left = g - s.lo, right = s.hi - g;
      if (!left && !right) { s.log.push({ g, ans: 'hit', left: 1 }); s.status = 'won'; return { ev: [{ t: 'found' }], say: { who: 'murphy', text: `${g.toLocaleString('en-US')}. Yes. Fine. That was my number all along.` } }; }
      const ans = left > right ? 'lower' : 'higher';
      if (ans === 'lower') s.hi = g - 1; else s.lo = g + 1;
      const rem = s.hi - s.lo + 1;
      s.log.push({ g, ans, left: rem });
      return { ev: [{ t: 'reveal', v: 1 - Math.log2(rem + 1) / Math.log2(s.n + 1) }], say: { who: 'murphy', text: `${ans === 'lower' ? 'Lower' : 'Higher'}! ${rem.toLocaleString('en-US')} left.` } };
    },
    hint(s) {
      const g = Math.floor((s.lo + s.hi) / 2);
      return { a: { t: 'guess', g }, note: `Guess the exact middle, ${g.toLocaleString('en-US')}. Whatever he says, half of what is left disappears.`, line: 3 };
    },
  };

  // ── shift: inserting into a sorted array means moving everything after ──
  const shiftRound = (s) => {
    s.x = s.xs[s.round];
    s.cells.push(null); s.gap = s.cells.length - 1;
    s.prompt = `Insert ${s.x} so the row stays sorted. Slide tiles to open a gap.`;
  };
  L.shift = {
    unit: 'shifts', undo: true,
    init(cfg, rng) {
      const n = cfg.n || 7;
      let v = rng.int(12, 20);
      const vals = range(n, () => (v += rng.int(2, 9)));
      const s = base({ cells: vals.slice(), xs: [vals[n - 3] + 1, vals[0] - rng.int(1, 4)], rounds: 2 });
      s.par = 2 + (n + 1); s.par2 = s.par + 3;
      shiftRound(s);
      return s;
    },
    act(s, a) {
      if (a.t === 'shift') {
        const i = a.i;
        if (Math.abs(i - s.gap) !== 1 || s.cells[i] == null) return no('Only a tile next to the gap can slide into it.');
        s.cells[s.gap] = s.cells[i]; s.cells[i] = null; s.gap = i; s.ops++;
        return { ev: [{ t: 'move', v: s.cells.length ? s.gap / s.cells.length : 0 }] };
      }
      if (a.t === 'place') {
        const g = s.gap, c = s.cells;
        if ((g > 0 && c[g - 1] > s.x) || (g < c.length - 1 && c[g + 1] < s.x)) return strike(s, `${s.x} does not belong there: the row would no longer be sorted.`);
        c[g] = s.x; s.gap = -1; s.round++;
        if (s.round >= s.rounds) { s.status = 'won'; s.x = null; return { ev: [{ t: 'good', v: 1 }] }; }
        shiftRound(s);
        return { ev: [{ t: 'good', v: 0.5 }], say: { who: 'murphy', text: `That was the easy end. Now try ${s.x}.` } };
      }
      return no();
    },
    hint(s) {
      const g = s.gap, c = s.cells;
      if (g > 0 && c[g - 1] > s.x) return { a: { t: 'shift', i: g - 1 }, note: `${c[g - 1]} is bigger than ${s.x}, so it has to move one slot right.`, line: 4 };
      // Off the textbook path: the gap was slid past the spot, so a smaller
      // tile sits to its right. Slide it back; there's no listing line for that.
      if (g < c.length - 1 && c[g + 1] != null && c[g + 1] < s.x) return { a: { t: 'shift', i: g + 1 }, note: `${c[g + 1]} is smaller than ${s.x}, so the gap went too far. Slide ${c[g + 1]} back left.` };
      return { a: { t: 'place' }, note: `Everything to the left is smaller than ${s.x}. Drop it in.`, line: 6 };
    },
  };
})();
