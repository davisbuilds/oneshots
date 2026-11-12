// tree.js: binary search trees and heaps.
(() => {
  const { base, strike, no, range } = BB;
  const L = BB.logic;

  // A tree is { root, n: { key: { k, l, r } } }, keys double as ids.
  const T = {
    make: () => ({ root: null, n: {} }),
    insert(t, k) {
      t.n[k] = { k, l: null, r: null };
      if (t.root == null) { t.root = k; return 0; }
      let at = t.root, d = 1;
      for (;;) { const side = k < at ? 'l' : 'r'; if (t.n[at][side] == null) { t.n[at][side] = k; return d; } at = t.n[at][side]; d++; }
    },
    from: (keys) => { const t = T.make(); for (const k of keys) T.insert(t, k); return t; },
    height: (t, k = t.root) => (k == null ? 0 : 1 + Math.max(T.height(t, t.n[k].l), T.height(t, t.n[k].r))),
    parent(t, k) { for (const p of Object.values(t.n)) if (p.l === k || p.r === k) return p.k; return null; },
    depth(t, k) { let d = 0; for (let at = t.root; at !== k; d++) at = k < at ? t.n[at].l : t.n[at].r; return d; },
    walk(t, order, k = t.root, out = []) {
      if (k == null) return out;
      const nd = t.n[k];
      if (order === 'pre') out.push(k);
      T.walk(t, order, nd.l, out);
      if (order === 'in') out.push(k);
      T.walk(t, order, nd.r, out);
      if (order === 'post') out.push(k);
      return out;
    },
    // Rotate k up over its parent. Works for both directions.
    rotate(t, k) {
      const p = T.parent(t, k);
      if (p == null) return false;
      const g = T.parent(t, p), nk = t.n[k], np = t.n[p];
      if (np.l === k) { np.l = nk.r; nk.r = p; } else { np.r = nk.l; nk.l = p; }
      if (g == null) t.root = k; else if (t.n[g].l === p) t.n[g].l = k; else t.n[g].r = k;
      return true;
    },
    code: (t) => T.walk(t, 'pre').join(','),
  };
  BB.T = T;

  // Shortest sequence of rotations from t to any tree of height <= goal.
  const rotPlan = (t, goal) => {
    if (T.height(t) <= goal) return [];
    const start = T.code(t), seen = new Map([[start, null]]);
    let frontier = [t];
    while (frontier.length) {
      const next = [];
      for (const cur of frontier) for (const k of Object.keys(cur.n).map(Number)) {
        if (k === cur.root) continue;
        const c = BB.clone(cur); T.rotate(c, k);
        const code = T.code(c);
        if (seen.has(code)) continue;
        seen.set(code, { from: T.code(cur), k });
        if (T.height(c) <= goal) { const path = []; for (let at = code; seen.get(at); at = seen.get(at).from) path.unshift(seen.get(at).k); return path; }
        next.push(c);
      }
      frontier = next;
    }
    return null;
  };
  BB.rotPlan = rotPlan;

  const fits = (t, left, goal) => {
    if (!left.length) return true;
    for (const k of left) { const c = BB.clone(t); T.insert(c, k); if (T.height(c) <= goal && fits(c, left.filter((x) => x !== k), goal)) return true; }
    return false;
  };

  const ORDER = { in: 'in-order: left subtree, then the node, then right subtree', pre: 'pre-order: the node first, then left subtree, then right subtree', post: 'post-order: left subtree, right subtree, and the node last' };
  const bstNext = (s) => {
    if (s.mode === 'insert') {
      s.cur = s.queue[0]; s.at = s.t.root;
      s.prompt = `Insert ${s.cur}. Smaller goes left, bigger goes right.`;
    } else if (s.mode === 'traverse') {
      s.order = s.orders[s.round]; s.seq = T.walk(s.t, s.order); s.out = [];
      s.prompt = `Tap the nodes in ${ORDER[s.order]}.`;
    }
  };
  L.bst = {
    undo: (s) => s.mode === 'order' || s.mode === 'rotate',
    unit: (s) => ({ insert: 'comparisons', order: 'inserts', traverse: 'visits', rotate: 'rotations' }[s.mode]),
    init(cfg, rng) {
      const n = cfg.n || 7, mode = cfg.mode;
      const s = base({ mode, t: T.make() });
      const pool = () => rng.shuffle(range(90, (i) => i + 10)).slice(0, n);
      if (mode === 'insert') {
        let keys;
        do keys = pool(); while (T.height(T.from(keys)) !== 4);
        s.all = keys.slice().sort((a, b) => a - b);
        T.insert(s.t, keys[0]); s.queue = keys.slice(1);
        bstNext(s);
      } else if (mode === 'order') {
        s.all = pool().sort((a, b) => a - b); s.left = s.all.slice(); s.goal = cfg.goal || 3;
        s.prompt = `Insert all ${n} keys, in any order you like. The tree must end up only ${s.goal} levels tall.`;
      } else if (mode === 'traverse') {
        let keys;
        do keys = pool(); while (T.height(T.from(keys)) !== 3 + (n > 7));
        s.t = T.from(keys); s.all = keys.slice().sort((a, b) => a - b);
        s.orders = cfg.orders || ['in', 'pre', 'post']; s.rounds = s.orders.length; s.maxStrikes = 4;
        bstNext(s);
      } else {
        s.goal = cfg.goal || 3;
        let keys, plan;
        for (let i = 0; ; i++) {
          keys = i === 0 && cfg.stick ? pool().sort((a, b) => a - b) : pool();
          const t = T.from(keys);
          if (T.height(t) < 5) continue;
          plan = rotPlan(t, s.goal);
          if (plan && plan.length >= 3 && plan.length <= 6) { s.t = t; break; }
        }
        s.all = keys.slice().sort((a, b) => a - b);
        s.par = plan.length; s.par2 = s.par + 2; s.limit = s.par + 6;
        s.prompt = `Tap a node to rotate it up over its parent. Get the tree down to ${s.goal} levels.`;
      }
      return s;
    },
    act(s, a) {
      if (s.mode === 'insert') {
        if (a.t !== 'go' || (a.side !== 'l' && a.side !== 'r')) return no();
        const want = s.cur < s.at ? 'l' : 'r';
        if (a.side !== want) return strike(s, `${s.cur} is ${s.cur < s.at ? 'smaller' : 'bigger'} than ${s.at}. It goes ${want === 'l' ? 'left' : 'right'}.`);
        s.ops++;
        const child = s.t.n[s.at][want];
        if (child != null) { s.at = child; return { ev: [{ t: 'move', v: s.ops / 20 }] }; }
        T.insert(s.t, s.cur); s.queue.shift();
        if (!s.queue.length) { s.status = 'won'; s.cur = null; s.at = null; return { ev: [{ t: 'found' }] }; }
        bstNext(s);
        return { ev: [{ t: 'good', v: 1 - s.queue.length / 7 }] };
      }
      if (s.mode === 'order') {
        if (a.t !== 'pick' || !s.left.includes(a.k)) return no();
        T.insert(s.t, a.k); s.left = s.left.filter((x) => x !== a.k); s.ops++;
        const h = T.height(s.t);
        if (h > s.goal) { s.status = 'lost'; s.why = `The tree is already ${h} levels tall. Keys that arrive in sorted order pile up on one side, like a linked list.`; return { ev: [{ t: 'move', v: 0.2 }], say: { who: 'murphy', text: 'Timber! That is not a tree, that is a pole.' } }; }
        if (!s.left.length) s.status = 'won';
        return { ev: [{ t: 'move', v: a.k / 100 }] };
      }
      if (s.mode === 'traverse') {
        if (a.t !== 'visit' || !(a.k in s.t.n) || s.out.includes(a.k)) return no();
        const want = s.seq[s.out.length];
        if (a.k !== want) return strike(s, { in: `Not yet. In-order finishes everything on a node's left before the node itself.`, pre: 'Not yet. Pre-order takes a node, then its whole left side, then its right side.', post: 'Not yet. Post-order takes a node only after both of its subtrees are done.' }[s.order]);
        s.out.push(a.k); s.ops++;
        if (s.out.length < s.seq.length) return { ev: [{ t: 'move', v: s.out.length / s.seq.length }] };
        s.done = { order: s.order, out: s.out }; s.round++;
        const say = s.order === 'in' ? { who: 'bit', text: `${s.out.join(', ')}. In-order reads a search tree in sorted order!` } : null;
        if (s.round >= s.rounds) s.status = 'won'; else bstNext(s);
        return { ev: [{ t: 'good', v: s.round / s.rounds }], say };
      }
      if (a.t !== 'rot' || !(a.k in s.t.n)) return no();
      if (a.k === s.t.root) return no('The root has no parent to rotate over.');
      T.rotate(s.t, a.k); s.ops++;
      if (T.height(s.t) <= s.goal) s.status = 'won';
      return { ev: [{ t: 'move', v: 1 - T.height(s.t) / 8 }] };
    },
    hint(s) {
      if (s.mode === 'insert') {
        const want = s.cur < s.at ? 'l' : 'r';
        return { a: { t: 'go', side: want }, note: `${s.cur} is ${want === 'l' ? 'smaller' : 'bigger'} than ${s.at}: go ${want === 'l' ? 'left' : 'right'}.`, line: want === 'l' ? 5 : 7 };
      }
      if (s.mode === 'order') {
        // Middle-first among the picks that can still end in a short tree.
        const mid = s.all[(s.all.length - 1) >> 1];
        const cands = s.left.slice().sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid));
        for (const k of cands) { const c = BB.clone(s.t); T.insert(c, k); if (T.height(c) <= s.goal && fits(c, s.left.filter((x) => x !== k), s.goal)) return { a: { t: 'pick', k }, note: `Insert ${k}: it is the middle of the keys that will share its branch, so half go to each side.`, line: 4 }; }
        return { undo: true, note: 'No order of the remaining keys keeps this tree short. Step back.' };
      }
      if (s.mode === 'traverse') {
        const k = s.seq[s.out.length];
        return { a: { t: 'visit', k }, note: `Next is ${k}.`, line: { in: 5, pre: 3, post: 7 }[s.order] };
      }
      const plan = rotPlan(s.t, s.goal), k = plan[0];
      return { a: { t: 'rot', k }, note: `Rotate ${k} up over ${T.parent(s.t, k)}. ${k}'s side rises a level and the other side sinks one.` };
    },
  };

  // ── heap: a min-heap stored in an array ────────────────────────────────
  const par = (i) => (i - 1) >> 1;
  const kids = (h, i) => [2 * i + 1, 2 * i + 2].filter((j) => j < h.length);
  const minKid = (h, i) => kids(h, i).sort((a, b) => h[a] - h[b])[0];
  const heapStart = (s, ev) => {
    for (;;) {
      if (s.mode === 'up') {
        if (!s.queue.length) { s.status = 'won'; s.c = -1; return; }
        s.h.push(s.queue.shift()); s.c = s.h.length - 1;
        s.prompt = `${s.h[s.c]} joins at the end. Swap it with its parent while it is smaller.`;
        if (s.c > 0) return;
      } else {
        if (!s.h.length) { s.status = 'won'; s.c = -1; return; }
        s.out.push(s.h[0]);
        const last = s.h.pop();
        if (s.h.length) s.h[0] = last;
        s.c = 0;
        s.prompt = s.h.length ? `${s.out[s.out.length - 1]} leaves from the top. ${s.h[0]} was moved up to fill the hole: sink it by swapping with its smaller child.` : '';
        if (ev) ev.push({ t: 'good', v: s.out.length / 7 });
        if (kids(s.h, 0).some((j) => s.h[j] < s.h[0])) return;
      }
    }
  };
  L.heap = {
    unit: 'swaps',
    init(cfg, rng) {
      const vals = rng.shuffle(range(60, (i) => i + 10));
      const s = base({ mode: cfg.mode, h: [], out: [], c: -1, maxStrikes: 3 });
      const build = (a) => { const h = []; for (const v of a) { h.push(v); for (let i = h.length - 1; i > 0 && h[i] < h[par(i)]; i = par(i)) [h[i], h[par(i)]] = [h[par(i)], h[i]]; } return h; };
      if (s.mode === 'up') {
        s.h = build(vals.slice(0, 5).map((v) => v + 12));
        const small = Math.min(...s.h) - rng.int(2, 6), big = Math.max(...s.h) + rng.int(2, 6);
        const midv = s.h[1] - 1 > s.h[0] ? s.h[1] - 1 : s.h[1] + 1;
        s.queue = [];
        for (let v of [midv, big, small, s.h[2] + 1]) { while (s.h.includes(v) || s.queue.includes(v)) v++; s.queue.push(v); }
      } else s.h = build(vals.slice(0, cfg.n || 7));
      heapStart(s);
      return s;
    },
    act(s, a) {
      const h = s.h, c = s.c;
      const settle = (ev) => { heapStart(s, ev); return { ev }; };
      if (s.mode === 'up') {
        const shouldSwap = c > 0 && h[c] < h[par(c)];
        if (a.t === 'stop') {
          if (shouldSwap) return strike(s, `${h[c]} is smaller than its parent ${h[par(c)]}. It has to keep climbing.`);
          return settle([{ t: 'good', v: 0.5 }]);
        }
        if (a.t !== 'swap') return no();
        if (a.i !== par(c)) return no(`${h[c]} can only trade places with its parent.`);
        if (!shouldSwap) return strike(s, `${h[c]} is not smaller than ${h[par(c)]}. It has found its place.`);
        [h[c], h[a.i]] = [h[a.i], h[c]]; s.c = a.i; s.ops++;
        if (s.c === 0) return settle([{ t: 'move', v: 0.9 }]);
        return { ev: [{ t: 'move', v: 1 - s.c / h.length }] };
      }
      const m = minKid(h, c), shouldSwap = m != null && h[m] < h[c];
      if (a.t === 'stop') {
        if (shouldSwap) return strike(s, `${h[c]} is bigger than its child ${h[m]}. It has to sink further.`);
        return settle([]);
      }
      if (a.t !== 'swap') return no();
      if (!kids(h, c).includes(a.i)) return no(`${h[c]} can only trade places with one of its children.`);
      if (!shouldSwap) return strike(s, `Both children are bigger than ${h[c]}. It stays.`);
      if (a.i !== m) return strike(s, `Swap with the smaller child, ${h[m]}. If ${h[a.i]} went up it would sit above something smaller than itself.`);
      [h[c], h[a.i]] = [h[a.i], h[c]]; s.c = a.i; s.ops++;
      if (!kids(h, s.c).some((j) => h[j] < h[s.c])) return settle([{ t: 'move', v: 0.5 }]);
      return { ev: [{ t: 'move', v: s.c / h.length }] };
    },
    hint(s) {
      const h = s.h, c = s.c;
      if (s.mode === 'up') {
        if (c > 0 && h[c] < h[par(c)]) return { a: { t: 'swap', i: par(c) }, note: `${h[c]} is smaller than its parent ${h[par(c)]}: swap them.`, line: 4 };
        return { a: { t: 'stop' }, note: `${h[c]} is not smaller than its parent ${h[par(c)]}. It stays where it is.`, line: 3 };
      }
      const m = minKid(h, c);
      return { a: { t: 'swap', i: m }, note: `${h[c]} is bigger than its smaller child, ${h[m]}: swap them.`, line: 10 };
    },
  };
  BB.heapOk = (h) => h.every((v, i) => !i || h[par(i)] <= v);
})();
