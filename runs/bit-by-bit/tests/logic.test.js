// logic.test.js: every level is solvable for three stars by the textbook
// algorithm, Murphy cannot be beaten by luck, and no move corrupts a state.
//   node --test tests/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const BB = require('../src/node.js');

const SEEDS = 40;
const play = (lv, seed) => { const s = BB.init(lv.type, lv.cfg, seed); const steps = BB.solve(s); return { s, steps }; };

test('the curriculum is well formed', () => {
  assert.equal(BB.levels.length, 34);
  assert.equal(new Set(BB.levels.map((l) => l.id)).size, BB.levels.length);
  for (const lv of BB.levels) {
    assert.ok(BB.logic[lv.type], `${lv.id}: puzzle type ${lv.type} exists`);
    assert.ok(BB.worlds.find((w) => w.n === lv.world), `${lv.id}: belongs to a world`);
    for (const k of ['title', 'goal']) assert.ok(lv[k], `${lv.id} has ${k}`);
    assert.ok(lv.intro.length && lv.win.name && lv.win.big && lv.win.insight && lv.win.code.length, `${lv.id} teaches something`);
  }
});

for (const lv of BB.levels) {
  test(`${lv.id} ${lv.title}: the textbook algorithm earns three stars on every seed`, () => {
    for (let k = 0; k < SEEDS; k++) {
      const seed = k === 0 ? lv.seed : 7919 * k + lv.index;
      const { s, steps } = play(lv, seed);
      assert.equal(s.status, 'won', `seed ${seed}: ${s.why}`);
      assert.equal(BB.stars(s, 0), 3, `seed ${seed}: ops ${s.ops}, par ${s.par}, strikes ${s.strikes}`);
      for (const h of steps) {
        assert.ok(h.note && h.note.length > 8, 'every step explains itself');
        if (h.line != null) assert.ok(h.line >= 1 && h.line <= lv.win.code.length && lv.win.code[h.line - 1].trim(), `${lv.id}: line ${h.line} is a line of the shown code`);
      }
      assert.deepEqual(JSON.parse(JSON.stringify(s)), s, 'state is plain JSON');
    }
  });

  test(`${lv.id} ${lv.title}: random play never throws and always terminates`, () => {
    const acts = [];
    const rnd = BB.rng(99 + lv.index);
    const any = () => {
      const i = rnd.int(-1, 16), j = rnd.int(0, 15), L = 'ABCDEFGHIJSTWKPUMO'[rnd.int(0, 17)];
      return rnd.pick([{ t: 'peek', i }, { t: 'guess', g: rnd.int(-5, 1000005) }, { t: 'shift', i }, { t: 'place' }, { t: 'swap', i, j }, { t: 'cmp', a: i, b: j },
        { t: 'pick', side: rnd.pick(['L', 'R']) }, { t: 'pivot', i }, { t: 'push', k: rnd.int(0, 2) }, { t: 'pop', k: rnd.int(0, 2) }, { t: 'push' }, { t: 'pop' }, { t: 'bad' }, { t: 'ok' },
        { t: 'move' }, { t: 'back' }, { t: 'serve' }, { t: 'hop', cell: j }, { t: 'ptr', from: i, to: j }, { t: 'ptr', from: i + 10, to: null }, { t: 'var', name: rnd.pick(['head', 'a', 'b', 'new', 'x']), to: rnd.pick([i, null]) },
        { t: 'slot', i }, { t: 'pick', k: rnd.int(10, 99) }, { t: 'go', side: rnd.pick(['l', 'r']) }, { t: 'visit', k: rnd.int(10, 99) }, { t: 'rot', k: rnd.int(10, 99) }, { t: 'swap', i }, { t: 'stop' },
        { t: 'visit', v: L }, { t: 'settle', v: L }, { t: 'do', v: L }, { t: 'edge', i }, { t: 'move', from: rnd.int(0, 3), to: rnd.int(0, 3) }, { t: 'call', id: j }, { t: 'step', d: rnd.pick(['R', 'D']) }, { t: 'solve', r: rnd.int(0, 4), c: rnd.int(0, 5) }, { t: 'nonsense' }]);
    };
    for (let k = 0; k < 12; k++) {
      const s = BB.init(lv.type, lv.cfg, 500 + k);
      const P = BB.logic[lv.type];
      for (let n = 0; n < 400 && s.status === 'play'; n++) {
        // Mostly noise, sometimes the right move, so deep states are reached too.
        const h = rnd() < 0.55 ? P.hint(s) : null;
        const a = h && h.a ? h.a : any();
        acts.push(a);
        const r = BB.act(s, a);
        assert.ok(Array.isArray(r.ev), 'act always reports events');
        assert.ok(s.ops >= 0 && s.strikes >= 0);
      }
      assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
    }
  });
}

// ── Murphy is a real adversary ───────────────────────────────────────────
test('binary search: no strategy at all beats 4 peeks on 15 boxes, and the revealed values stay consistent', () => {
  // Exhaustive: every possible sequence of first three peeks, then every fourth.
  const lv = BB.level('1-3');
  let games = 0;
  const go = (acts) => {
    const s = BB.init(lv.type, lv.cfg, lv.seed);
    for (const i of acts) BB.act(s, { t: 'peek', i });
    if (acts.length === 3) { assert.equal(s.status, 'play', `peeks ${acts} must not have found it`); games++; return; }
    for (let i = 0; i < 15; i++) if (!acts.includes(i)) go([...acts, i]);
  };
  go([]);
  assert.equal(games, 15 * 14 * 13);
  const rnd = BB.rng(5);
  for (let k = 0; k < 300; k++) {
    const s = BB.init(lv.type, { mode: 'binary', n: 15, limit: 99 }, k + 1);
    for (const i of rnd.shuffle(BB.range(15))) BB.act(s, { t: 'peek', i });
    assert.equal(s.status, 'won');
    const seen = s.open.filter((v) => v != null);
    assert.ok(seen.every((v, i) => !i || seen[i - 1] < v), `revealed values are strictly increasing: ${s.open}`);
    assert.equal(s.open.filter((v) => v === s.target).length, 1);
    s.open.forEach((v, i) => { if (v != null) assert.equal(s.note[i], v === s.target ? 'hit' : v > s.target ? 'hi' : 'lo'); });
  }
});

test('one in a million: halving needs exactly 20 guesses and nothing does better', () => {
  const lv = BB.level('1-4');
  const { s } = play(lv, 1);
  assert.equal(s.ops, 20);
  const rnd = BB.rng(11);
  for (let k = 0; k < 200; k++) {
    const t = BB.init('zoom', { n: 1000000, limit: 5000 }, 1);
    while (t.status === 'play') BB.act(t, { t: 'guess', g: rnd() < 0.5 ? Math.floor((t.lo + t.hi) / 2) : rnd.int(t.lo, t.hi) });
    assert.ok(t.ops >= 20, `a sloppy strategy took ${t.ops}`);
  }
});

test('linear search: the number is always in the last box opened', () => {
  const rnd = BB.rng(3);
  for (let k = 0; k < 50; k++) {
    const s = BB.init('boxes', { mode: 'linear', n: 7 }, k + 1);
    for (const i of rnd.shuffle(BB.range(7))) { assert.equal(s.status, 'play'); BB.act(s, { t: 'peek', i }); }
    assert.equal(s.status, 'won'); assert.equal(s.ops, 7);
    assert.equal(new Set(s.open).size, 7, 'no duplicate decoys');
  }
});

test('the scale: every answer is consistent, the maximum needs n-1 weighings, and five crates need seven', () => {
  const { extensions, need } = BB.poset;
  assert.equal(extensions(Array(25).fill(0), 5), 120);
  assert.equal(need(Array(25).fill(0), 5), 7, 'minimax over every strategy: 7 weighings sort 5, and 6 cannot');
  assert.equal(need(Array(16).fill(0), 4), 5);
  const rnd = BB.rng(8);
  for (let k = 0; k < 60; k++) {
    const s = BB.init('scale', { n: 8, goal: 'max', limit: 99 }, k);
    let real = 0;
    while (s.status === 'play') { const r = BB.act(s, { t: 'cmp', a: rnd.int(0, 7), b: rnd.int(0, 7) }); if (r.ok) real++; assert.ok(extensions(s.lt, 8) >= 1, 'the answers so far admit at least one set of weights'); }
    assert.ok(real >= 7 && s.ops === real);
    const t = BB.init('scale', { n: 5, goal: 'sort', limit: 99 }, k);
    while (t.status === 'play') BB.act(t, { t: 'cmp', a: rnd.int(0, 4), b: rnd.int(0, 4) });
    assert.ok(t.ops >= 7, 'random weighing never sorts five in under seven against the adversary');
    assert.equal(new Set(t.order).size, 5);
  }
});

// ── Puzzle-specific truths the lessons rely on ───────────────────────────
test('sorting pars are the true optimum', () => {
  for (let k = 1; k <= 30; k++) {
    const a = BB.init('swaps', { mode: 'adjacent', n: 6 }, k);
    assert.equal(a.par, BB.inversions(a.arr));
    // Breadth-first search over every sequence of arbitrary swaps.
    const b = BB.init('swaps', { mode: 'any', n: 6 }, k);
    const goal = '123456', seen = new Set([b.arr.join('')]);
    let frontier = [b.arr], d = 0;
    while (!seen.has(goal)) { d++; const next = []; for (const cur of frontier) for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) { const c = cur.slice(); [c[i], c[j]] = [c[j], c[i]]; const key = c.join(''); if (!seen.has(key)) { seen.add(key); next.push(c); } } frontier = next; }
    assert.equal(b.par, d, 'selection sort uses the fewest possible swaps');
  }
  const p = BB.init('pivot', { n: 15 }, 1);
  assert.equal(p.par, 34);
  const worst = BB.init('pivot', { n: 15, limit: 999 }, 1);
  while (worst.status === 'play') { const g = worst.segs[0]; let i = g.lo; for (let j = g.lo; j <= g.hi; j++) if (worst.arr[j].v < worst.arr[i].v) i = j; BB.act(worst, { t: 'pivot', i }); }
  assert.equal(worst.ops, 105, 'always picking the smallest costs n(n-1)/2');
});

test('merge sort ends sorted and stays under n log n comparisons', () => {
  for (let k = 1; k <= 30; k++) {
    const { s } = play(BB.level('2-4'), k);
    assert.deepEqual(s.result, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(s.ops <= 7 + 17, `comparisons ${s.ops}`);
  }
});

test('the siding: every train is solvable, round three needs both sidings, and a buried car is a strike', () => {
  for (let k = 1; k <= 40; k++) {
    const s = BB.init('shunt', {}, k);
    for (const r of s.plan) assert.ok(BB.shuntOk(r.input, r.k, r.want));
    assert.ok(!BB.shuntOk(s.plan[2].input, 1, s.plan[2].want));
  }
  const s = BB.init('shunt', { plan: [{ input: [2, 1, 3], want: [1, 2, 3], k: 1, say: '' }] }, 1);
  BB.act(s, { t: 'push', k: 0 }); BB.act(s, { t: 'push', k: 0 });
  assert.equal(s.strikes, 0);
  const r = BB.act(s, { t: 'push', k: 0 });
  assert.equal(s.strikes, 1); assert.equal(s.stuck, true);
  assert.match(r.say.text, /Car 3 is parked on top of car 1/);
  assert.equal(BB.logic.shunt.hint(s).undo, true);
});

test('two stacks, one line: careless flipping runs out of budget', () => {
  const s = BB.init('twoq', {}, 1);
  while (s.status === 'play') {
    const h = BB.logic.twoq.hint(s);
    BB.act(s, h.a);
    if (s.status === 'play' && h.a.t === 'serve') while (s.OUT.length && s.status === 'play') BB.act(s, { t: 'back' }); // "tidy up" after every serve
  }
  assert.equal(s.status, 'lost');
  for (const shape of ['iiioiiooiooioo', 'iioiiiooiooioo', 'iiiioioooiiooo', 'iiooiiiooiooio']) {
    let d = 0; for (const c of shape) { d += c === 'i' ? 1 : -1; assert.ok(d >= 0); } assert.equal(d, 0);
  }
});

test('linked lists: letting go of the rest of the list loses it', () => {
  const s = BB.init('rewire', {}, 1);
  const N = s.vars.new, prev = s.nodes[1].id;
  BB.act(s, { t: 'ptr', from: prev, to: N });
  assert.equal(s.status, 'lost'); assert.match(s.why, /garbage collector/);
  const r = BB.init('rewire', { kind: 'reverse' }, 1);
  BB.act(r, { t: 'ptr', from: r.nodes[0].id, to: null });
  assert.equal(r.status, 'lost');
  const ok = BB.init('rewire', { kind: 'reverse' }, 1);
  const before = BB.listFrom(ok, ok.vars.head);
  BB.solve(ok);
  assert.deepEqual(BB.listFrom(ok, ok.vars.head), before.reverse());
});

test('hash tables: probing matches a reference implementation', () => {
  for (let k = 1; k <= 40; k++) {
    const s = BB.init('hash', { mode: 'probe' }, k);
    const keys = s.queue.slice(), ref = Array(10).fill(null);
    for (const key of keys) { let i = key % 10; while (ref[i] != null) i = (i + 1) % 10; ref[i] = key; }
    BB.solve(s);
    assert.deepEqual(s.table, ref);
    assert.deepEqual(s.found, [true, false, true]);
    const m = BB.init('hash', { mode: 'murphy' }, k);
    for (const key of m.pool.slice(0, 6)) if (m.status === 'play') BB.act(m, { t: 'pick', k: key });
    assert.notEqual(m.status, 'play');
  }
});

test('trees: inserts keep the search-tree order, rotations preserve it, pars are shortest', () => {
  const T = BB.T;
  for (let k = 1; k <= 30; k++) {
    const a = play(BB.level('6-1'), k).s;
    assert.deepEqual(T.walk(a.t, 'in'), a.all);
    const b = play(BB.level('6-2'), k).s;
    assert.equal(T.height(b.t), 3);
    const c = BB.init('bst', BB.level('6-4').cfg, k);
    const keys = T.walk(c.t, 'in');
    assert.ok(T.height(c.t) >= 5);
    BB.solve(c);
    assert.deepEqual(T.walk(c.t, 'in'), keys, 'rotations never change the left-to-right order');
    assert.equal(c.ops, c.par);
  }
  const bad = BB.init('bst', BB.level('6-2').cfg, 1);
  for (const key of bad.all) if (bad.status === 'play') BB.act(bad, { t: 'pick', k: key });
  assert.equal(bad.status, 'lost', 'sorted order makes a pole');
});

test('heaps: the heap rule holds after every settled step and extraction is sorted', () => {
  for (let k = 1; k <= 40; k++) {
    const up = play(BB.level('7-1'), k).s;
    assert.ok(BB.heapOk(up.h)); assert.equal(up.h.length, 9);
    const down = play(BB.level('7-2'), k).s;
    assert.equal(down.out.length, 7);
    assert.ok(BB.sorted(down.out));
  }
});

test('graphs: BFS distances are true distances, Dijkstra finds the optimum, greed alone would not', () => {
  for (let k = 1; k <= 20; k++) {
    const s = play(BB.level('8-1'), k).s;
    const g = s.g, dist = { [g.start]: 0 };
    for (let changed = true; changed;) { changed = false; for (const [a, b] of g.edges) for (const [x, y] of [[a, b], [b, a]]) if (dist[x] != null && (dist[y] == null || dist[y] > dist[x] + 1)) { dist[y] = dist[x] + 1; changed = true; } }
    assert.deepEqual(s.dist, dist);
    assert.equal(s.path.length - 1, dist[g.flag]);
    const m = play(BB.level('8-5'), k).s;
    assert.equal(new Set(m.g.edges.map((e) => e[2])).size, m.g.edges.length, 'distinct weights, so the cheapest network is unique');
    assert.equal(m.cost, m.opt);
  }
  const d = play(BB.level('8-3'), 1).s;
  assert.deepEqual(d.path, ['S', 'B', 'A', 'C', 'E', 'T']);
  assert.equal(d.dist.T, 15);
  assert.deepEqual(d.order, ['S', 'B', 'A', 'C', 'D', 'E', 'T']);
  const t = play(BB.level('8-4'), 1).s;
  for (const [a, b] of t.g.edges) assert.ok(t.done.indexOf(a) < t.done.indexOf(b));
});

test('recursion: the tower pars are 2^n - 1 from any position, memo collapses the tree, greed loses the grid', () => {
  const h = play(BB.level('9-1'), 1).s;
  assert.equal(h.ops, 7 + 15);
  const rnd = BB.rng(2);
  for (let k = 0; k < 30; k++) {
    const s = BB.init('hanoi', { sizes: [4] }, 1);
    for (let i = 0; i < 12; i++) BB.act(s, { t: 'move', from: rnd.int(0, 2), to: rnd.int(0, 2) });
    BB.solve(s);
    assert.equal(s.status, 'won', 'the hint finds its way from anywhere');
  }
  const f = play(BB.level('9-2'), 1).s;
  assert.deepEqual(f.results, [{ n: 5, calls: 15, expanded: 7 }, { n: 8, calls: 15, expanded: 14 }]);
  for (let k = 1; k <= 30; k++) {
    const g = BB.init('grid', {}, k);
    assert.ok(BB.gridGreedy(g.g) <= g.opt - 4);
    const done = play(BB.level('9-3'), k).s;
    assert.equal(done.best[done.R - 1][done.C - 1], done.opt);
    assert.equal(done.path.reduce((t, [r, c]) => t + done.g[r][c], 0), done.opt);
  }
});

// ── Review findings ──────────────────────────────────────────────────────
test('a hint never tells the player to step back in a puzzle that has no undo', () => {
  const rnd = BB.rng(41);
  let asked = 0;
  for (const lv of BB.levels) {
    const P = BB.logic[lv.type];
    for (let k = 0; k < 30; k++) {
      const s = BB.init(lv.type, lv.cfg, 1700 + k);
      for (let n = 0; n < 60 && s.status === 'play'; n++) {
        const h = P.hint(s);
        if (h && h.undo) { asked++; assert.ok(typeof P.undo === 'function' ? P.undo(s) : P.undo, `${lv.id}: the hint says to step back, so undo must be available`); break; }
        // A plausible wrong-ish move: any pool ticket, key or siding, else the hinted move.
        const a = s.pool ? { t: 'pick', k: rnd.pick(s.pool) } : s.left ? { t: 'pick', k: rnd.pick(s.left) } : s.stacks && s.input && s.input.length && rnd() < 0.5 ? { t: 'push', k: rnd.int(0, s.stacks.length - 1) } : h.a;
        BB.act(s, a);
      }
    }
  }
  assert.ok(asked > 20, 'the search reaches positions where the hint is to step back');
});

test('the extract-min listing on the lesson card really empties a heap, down to the last element', () => {
  const { spawnSync } = require('node:child_process');
  const listing = BB.level('7-2').win.code.join('\n');
  const py = `
def swap(h, i, j): h[i], h[j] = h[j], h[i]
def smaller_child(h, i):
    kids = [j for j in (2 * i + 1, 2 * i + 2) if j < len(h)]
    return min(kids, key=lambda j: h[j]) if kids else None
${listing}
import heapq, random
random.seed(7)
for n in range(1, 40):
    heap = [random.randrange(100) for _ in range(n)]
    want = sorted(heap); heapq.heapify(heap)
    out = []
    while heap: out.append(pop(heap))
    assert out == want, (n, out, want)
print("ok")
`;
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), 'ok', r.stderr);
});

test('the merge sort listing sorts, and merges in linear time as its O(n log n) label says', () => {
  const { spawnSync } = require('node:child_process');
  const listing = BB.level('2-4').win.code.join('\n');
  const py = `
${listing}
import random, time
random.seed(11)
for n in range(0, 60):
    a = [random.randrange(50) for _ in range(n)]
    assert merge_sort(a) == sorted(a), (n, a)
# Two interleaved runs of 200,000: front-removal from a Python list shifts
# every remaining item, which takes seconds; a linear merge takes milliseconds.
left, right = list(range(0, 400000, 2)), list(range(1, 400000, 2))
t = time.perf_counter()
assert merge(left, right) == list(range(400000))
took = time.perf_counter() - t
assert took < 2.0, f"merging 400,000 items took {took:.1f} s"
print("ok")
`;
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.stdout.trim(), 'ok', r.stderr);
});

test('the best-path listing agrees with the puzzle on every grid, edges included', () => {
  const { spawnSync } = require('node:child_process');
  const listing = BB.level('9-3').win.code.join('\n');
  const rnd = BB.rng(5);
  const grids = [[[1, 2], [3, 4]], [[7]], [[1, 2, 3]], [[1], [2], [3]]];
  for (let k = 0; k < 40; k++) {
    const R = rnd.int(1, 6), C = rnd.int(1, 6);
    grids.push(Array.from({ length: R }, () => Array.from({ length: C }, () => rnd.int(0, 9))));
  }
  const want = grids.map((g) => { const b = BB.gridBest(g); return b[b.length - 1][b[0].length - 1]; });
  // Stand-ins for the names the original listing left undefined, so it is
  // judged on its arithmetic rather than on a NameError.
  const py = `
import json, sys
from copy import deepcopy as copy
GRID = None
class _Order:
    def __iter__(self): return ((r, c) for r in range(len(GRID)) for c in range(len(GRID[0])))
every_square_in_reading_order = _Order()
${listing}
grids, want = json.loads(sys.argv[1]), json.loads(sys.argv[2])
for g, w in zip(grids, want):
    GRID = g
    got = best_path(g)
    assert got == w, (g, got, w)
print("ok")
`;
  const r = spawnSync('python3', ['-c', py, JSON.stringify(grids), JSON.stringify(want)], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), 'ok', r.stderr);
});
