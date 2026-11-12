// hash.js: hash tables. A coat check where the ticket number says which
// hook to use, what happens when two tickets want the same hook, and a
// turn at being the adversary.
(() => {
  const { base, strike, no, range } = BB;
  const L = BB.logic;
  const M = 10;
  const home = (k) => k % M;
  const probeSeq = (table, k) => { const seq = []; for (let p = 0; p < M; p++) { const i = (home(k) + p) % M; seq.push(i); if (table[i] == null || table[i] === k) break; } return seq; };
  BB.probeSeq = probeSeq;

  const nextQuery = (s) => {
    s.q = s.queries[s.qi]; s.step = 0; s.opened = [];
    s.prompt = `Is ticket ${s.q} here? Open only the hooks you must.`;
  };
  L.hash = {
    unit: 'looks',
    init(cfg, rng) {
      const tens = () => rng.int(1, 9) * 10;
      const s = base({ mode: cfg.mode, table: Array(M).fill(null), phase: 'insert', opened: [], found: [] });
      if (cfg.mode === 'murphy') {
        const d = rng.int(1, 4);
        const same = rng.shuffle(range(9, (i) => (i + 1) * 10 + d)).slice(0, 6);
        const near = [d + 1, d + 1, d + 2].map((x, i) => (rng.int(1, 3) + i * 3) * 10 + x);
        const far = [d + 5, (d + 7) % 10, d + 5].map((x, i) => (rng.int(1, 3) + i * 3) * 10 + x);
        s.pool = rng.shuffle([...same, ...near, ...far]); s.picked = []; s.need = 6; s.worst = 0; s.worstKey = null;
        s.prompt = 'Your turn to be Murphy. Hang 6 coats so that finding one of them takes 6 looks.';
        return s;
      }
      if (cfg.mode === 'place') {
        const digits = rng.shuffle(range(M)).slice(0, 6);
        s.queue = digits.slice(0, 5).map((d) => tens() + d);
        const absent = tens() + digits[5];
        s.queries = [s.queue[3], absent, s.queue[0]];
      } else {
        const d = rng.int(1, 4);
        const t = rng.shuffle(range(9, (i) => (i + 1) * 10));
        s.queue = [t[0] + d, t[1] + d, t[2] + d + 1, t[3] + d, t[4] + 9, t[5] + 9, t[6] + 7];
        s.queries = [s.queue[3], t[7] + d + 1, s.queue[5]];
      }
      s.k = s.queue[0]; s.qi = 0;
      s.prompt = `Hang coat ${s.k}. Its last digit is its hook.`;
      return s;
    },
    act(s, a) {
      if (s.mode === 'murphy') {
        if (a.t !== 'pick' || !s.pool.includes(a.k) || s.picked.includes(a.k)) return no();
        const seq = probeSeq(s.table, a.k);
        s.table[seq[seq.length - 1]] = a.k; s.picked.push(a.k); s.ops++;
        s.worst = 0;
        for (const k of s.picked) { const n = probeSeq(s.table, k).length; if (n > s.worst) { s.worst = n; s.worstKey = k; } }
        if (s.worst >= s.need) s.status = 'won';
        else if (s.picked.length >= s.need) { s.status = 'lost'; s.why = `The slowest coat to find, ${s.worstKey}, takes only ${s.worst} looks. Murphy wants ${s.need}. Tickets that share a last digit pile up behind each other.`; }
        return { ev: [{ t: 'move', v: seq.length / 6 }], say: seq.length > 2 ? { who: 'murphy', text: `Ooh, ${seq.length} tries to hang that one. Now you are thinking like me.` } : null };
      }
      const i = a.i;
      if (a.t !== 'slot' || !(i >= 0 && i < M)) return no();
      if (s.phase === 'insert') {
        const seq = probeSeq(s.table, s.k), dest = seq[seq.length - 1];
        if (i !== dest) {
          if (i === home(s.k)) return strike(s, `Hook ${i} is taken by ${s.table[i]}. Walk right to the next free hook.`);
          return strike(s, seq.length > 1 ? `Start at hook ${home(s.k)}, then walk right to the first free hook.` : `${s.k} ends in ${home(s.k)}. It goes on hook ${home(s.k)}.`);
        }
        const placed = s.k;
        s.table[i] = s.k; s.ops++;
        s.queue.shift();
        const ev = [{ t: 'move', v: i / M }];
        if (s.queue.length) { s.k = s.queue[0]; s.prompt = `Hang coat ${s.k}.`; return { ev, say: seq.length > 1 ? { who: 'bit', text: `Hook ${home(placed)} was taken, so ${placed} slid along to hook ${i}.` } : null }; }
        s.phase = 'find'; s.k = null; nextQuery(s);
        return { ev: [...ev, { t: 'good', v: 0.5 }], say: { who: 'murphy', text: 'Lights out! Every hook is covered. Good luck finding anything now.' } };
      }
      const want = (home(s.q) + s.step) % M;
      if (i !== want) return strike(s, s.step ? `Keep walking right from hook ${home(s.q)}: hook ${want} is next.` : `${s.q} ends in ${home(s.q)}. Start at hook ${home(s.q)}.`);
      s.ops++; s.opened.push(i);
      const v = s.table[i];
      if (v !== s.q && v != null) { s.step++; return { ev: [{ t: 'reveal', v: i / M }], say: { who: 'bit', text: `${v}, not ${s.q}. It might have slid along: check the next hook.` } }; }
      s.found.push(v === s.q); s.qi++;
      const say = v === s.q ? null : { who: 'bit', text: `An empty hook. If ${s.q} were here it would have stopped at or before this one, so it is not in the table.` };
      if (s.qi >= s.queries.length) { s.status = 'won'; return { ev: [{ t: 'found' }], say }; }
      nextQuery(s);
      return { ev: [{ t: 'good', v: s.qi / s.queries.length }], say };
    },
    hint(s) {
      if (s.mode === 'murphy') {
        // Depth-first search for a set of picks that still reaches the goal.
        const search = (table, picked, left) => {
          for (const k of s.pool) {
            if (picked.includes(k)) continue;
            const seq = probeSeq(table, k), t2 = table.slice(); t2[seq[seq.length - 1]] = k;
            const p2 = [...picked, k];
            if (Math.max(...p2.map((x) => probeSeq(t2, x).length)) >= s.need) return k;
            if (left > 1 && search(t2, p2, left - 1) != null) return k;
          }
          return null;
        };
        const k = search(s.table, s.picked, s.need - s.picked.length);
        if (k == null) return { undo: true, note: 'These picks are too spread out to make a long pile-up. Step back.' };
        return { a: { t: 'pick', k }, note: `Take ${k}. It ends in ${home(k)}, so it lands in the same crowd as the others and makes the walk longer.` };
      }
      if (s.phase === 'insert') {
        const seq = probeSeq(s.table, s.k), dest = seq[seq.length - 1];
        return { a: { t: 'slot', i: dest }, note: seq.length > 1 ? `${s.k} wants hook ${home(s.k)}, but it is taken. Walk right to the first free hook: ${dest}.` : `${s.k} ends in ${home(s.k)}: hook ${home(s.k)}.`, line: s.mode === 'place' ? 2 : seq.length > 1 ? 4 : 5 };
      }
      const want = (home(s.q) + s.step) % M;
      return { a: { t: 'slot', i: want }, note: s.step ? `Not there yet. Keep walking right: hook ${want}.` : `${s.q} ends in ${home(s.q)}. Look on hook ${home(s.q)} first.`, line: s.mode === 'place' ? 5 : s.step ? 11 : 8 };
    },
  };
})();
