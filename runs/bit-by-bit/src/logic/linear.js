// linear.js: stacks, queues and linked lists. A railway siding, a bracket
// matcher, a queue built from two stacks, and pointers you rewire by hand.
(() => {
  const { base, strike, no, range } = BB;
  const L = BB.logic;
  const top = (a) => a[a.length - 1];

  // ── shunt: sort a train with dead-end sidings (stacks) ─────────────────
  const shuntSolvable = (input, stacks, out, want, memo) => {
    if (out === want.length) return true;
    const key = input.length + '|' + stacks.map((k) => k.join(',')).join('|');
    if (memo.has(key)) return memo.get(key);
    const needCar = want[out];
    let res = false;
    const at = stacks.findIndex((k) => k.includes(needCar));
    if (at >= 0) {
      if (top(stacks[at]) === needCar) res = shuntSolvable(input, stacks.map((k, i) => (i === at ? k.slice(0, -1) : k)), out + 1, want, memo);
    } else if (input.length) {
      for (let k = 0; k < stacks.length && !res; k++) {
        if (k > 0 && !stacks[k].length && !stacks[k - 1].length) break; // empty sidings are interchangeable
        res = shuntSolvable(input.slice(1), stacks.map((q, i) => (i === k ? [...q, input[0]] : q)), out, want, memo);
      }
    }
    memo.set(key, res);
    return res;
  };
  const shuntOk = (input, k, want) => shuntSolvable(input, range(k, () => []), 0, want, new Map());
  BB.shuntOk = shuntOk;
  const shuntRound = (s) => {
    const r = s.plan[s.round];
    s.input = r.input.slice(); s.want = r.want.slice(); s.stacks = range(r.k, () => []); s.out = []; s.stuck = false;
    s.prompt = r.say;
  };
  L.shunt = {
    unit: 'moves', undo: true,
    init(cfg, rng) {
      const asc = (n) => range(n, (i) => i + 1);
      let two, three;
      do two = rng.shuffle(asc(5)); while (!shuntOk(two, 1, asc(5)) || two[0] < 3 || BB.inversions(two) < 3);
      do three = rng.shuffle(asc(6)); while (shuntOk(three, 1, asc(6)) || !shuntOk(three, 2, asc(6)) || three[0] === 1);
      const s = base({ plan: cfg.plan || [
        { input: [1, 2, 3, 4], want: [4, 3, 2, 1], k: 1, say: 'Turn the train around: the cars must leave 4, 3, 2, 1.' },
        { input: two, want: asc(5), k: 1, say: 'Now the cars must leave in order: 1, 2, 3, 4, 5.' },
        { input: three, want: asc(6), k: 2, say: 'Two sidings this time. Send the cars out 1 to 6.' },
      ] });
      s.rounds = s.plan.length;
      shuntRound(s);
      return s;
    },
    act(s, a) {
      const k = a.k, st = s.stacks[k];
      if (!st) return no();
      if (a.t === 'push') {
        if (!s.input.length) return no('No cars left on the arrival track.');
        st.push(s.input.shift());
      } else if (a.t === 'pop') {
        if (!st.length) return no('That siding is empty.');
        const needCar = s.want[s.out.length];
        if (top(st) !== needCar) return no(`The exit signal is waiting for car ${needCar}. Car ${top(st)} has to stay put.`);
        s.out.push(st.pop());
      } else return no();
      s.ops++;
      const ev = [{ t: 'move', v: (a.t === 'pop' ? s.out.length : 0.2) / s.want.length }];
      if (s.out.length === s.want.length) {
        s.round++;
        if (s.round >= s.rounds) s.status = 'won'; else shuntRound(s);
        ev.push({ t: 'good', v: s.round / s.rounds });
        return { ev };
      }
      if (!s.stuck && !shuntSolvable(s.input, s.stacks, s.out.length, s.want, new Map())) {
        s.stuck = true;
        // Name the pair that jams it: a car parked on one that has to leave first.
        const rank = (c) => s.want.indexOf(c);
        let pair = null;
        for (const q of s.stacks) for (let i = 0; i < q.length - 1; i++) if (rank(top(q)) > rank(q[i]) && (!pair || rank(q[i]) < rank(pair[1]))) pair = [top(q), q[i]];
        const r = strike(s, pair ? `Car ${pair[0]} is parked on top of car ${pair[1]}, and ${pair[1]} has to leave first. A siding only gives back its top car. Undo!` : 'Jammed: whichever siding the next car takes, it will sit on a car that must leave before it. Undo!');
        r.ok = true; r.ev.push(...ev);
        return r;
      }
      return { ev };
    },
    hint(s) {
      if (s.stuck) return { undo: true, note: 'This position is jammed. Step back one move.' };
      const needCar = s.want[s.out.length];
      const k = s.stacks.findIndex((q) => top(q) === needCar);
      if (k >= 0) return { a: { t: 'pop', k }, note: `Car ${needCar} is on top and it is next out. Send it.`, line: 4 };
      for (let j = 0; j < s.stacks.length; j++) {
        const stacks = s.stacks.map((q, i) => (i === j ? [...q, s.input[0]] : q));
        if (shuntSolvable(s.input.slice(1), stacks, s.out.length, s.want, new Map())) {
          const under = top(s.stacks[j]);
          return { a: { t: 'push', k: j }, note: under ? `Car ${s.input[0]} cannot leave yet. Park it on car ${under}: it will leave before ${under} does.` : `Car ${s.input[0]} cannot leave yet. Park it in the ${s.stacks.length > 1 ? 'empty ' : ''}siding.`, line: 2 };
        }
      }
      return { undo: true, note: 'No way through from here. Step back.' };
    },
  };

  // ── brackets: be the bracket matcher ───────────────────────────────────
  const PAIR = { ')': '(', ']': '[', '}': '{' };
  const bracketWant = (s) => {
    if (s.pos >= s.toks.length) return s.stack.length ? 'bad' : 'ok';
    const t = s.toks[s.pos];
    if (!PAIR[t]) return 'push';
    return top(s.stack) === PAIR[t] ? 'pop' : 'bad';
  };
  const bracketRound = (s) => { s.toks = s.plan[s.round]; s.pos = 0; s.stack = []; s.prompt = 'Read left to right. Push openers, pop when a closer matches the top.'; };
  const randomBrackets = (rng) => {
    const open = ['(', '[', '{'], close = { '(': ')', '[': ']', '{': '}' };
    const gen = (d) => { let o = ''; const k = rng.int(1, d ? 2 : 3); for (let i = 0; i < k && o.length < 6; i++) { const b = rng.pick(open); o += b + (d < 2 && rng() < 0.6 ? gen(d + 1) : '') + close[b]; } return o; };
    return () => { let v; do v = gen(0); while (v.length < 4 || v.length > 8); return v; };
  };
  L.brackets = {
    unit: 'steps',
    init(cfg, rng) {
      let plan = cfg.plan;
      if (!plan) {
        const g = randomBrackets(rng), swap = { ')': ']', ']': '}', '}': ')' };
        const a = g(), b = g(), c = g(), d = g();
        const k = b.split('').findIndex((ch, i) => PAIR[ch] && i < b.length - 1);
        const i = k < 0 ? b.length - 1 : k;
        plan = [a, b.slice(0, i) + swap[b[i]] + b.slice(i + 1), c + rng.pick([')', ']', '}']), d.slice(0, -1)];
        plan = [plan[0], ...rng.shuffle(plan.slice(1))];
      }
      const s = base({ plan, rounds: plan.length, verdicts: [] });
      bracketRound(s);
      return s;
    },
    act(s, a) {
      const want = bracketWant(s), t = s.toks[s.pos];
      if (!['push', 'pop', 'bad', 'ok'].includes(a.t)) return no();
      if (a.t !== want) {
        const why = { push: `"${t}" opens something. Push it and remember it.`, pop: `"${t}" closes the "${top(s.stack)}" on top of the stack. Pop it.`,
          bad: s.pos >= s.toks.length ? `The line ended but "${top(s.stack)}" was never closed.` : (s.stack.length ? `"${t}" cannot close "${top(s.stack)}".` : `"${t}" closes nothing: the stack is empty.`),
          ok: 'The line is finished and the stack is empty. Everything matched.' }[want];
        return strike(s, why);
      }
      s.ops++;
      if (a.t === 'push') { s.stack.push(t); s.pos++; return { ev: [{ t: 'move', v: s.stack.length / 5 }] }; }
      if (a.t === 'pop') { s.stack.pop(); s.pos++; return { ev: [{ t: 'move', v: s.stack.length / 5 }] }; }
      s.verdicts.push(a.t); s.round++;
      if (s.round >= s.rounds) s.status = 'won'; else bracketRound(s);
      return { ev: [{ t: 'good', v: s.round / s.rounds }] };
    },
    hint(s) {
      const want = bracketWant(s), t = s.toks[s.pos];
      const note = { push: `"${t}" is an opener: push it.`, pop: `"${t}" matches the "${top(s.stack)}" on top: pop.`,
        bad: s.pos >= s.toks.length ? 'End of the line with something still on the stack: broken.' : `"${t}" does not match the top of the stack: broken.`,
        ok: 'End of the line, empty stack: all matched.' }[want];
      return { a: { t: want }, note, line: { push: 5, pop: 6, bad: 7, ok: 8 }[want] };
    },
  };

  // ── twoq: serve first-come-first-served using only two stacks ──────────
  const twoqFlow = (s, ev) => {
    while (s.cur < s.script.length && s.script[s.cur] === 'i') { s.IN.push(s.nextId++); s.cur++; ev.push({ t: 'arrive' }); }
    if (s.cur >= s.script.length) s.status = 'won';
  };
  L.twoq = {
    unit: 'flips',
    init(cfg, rng) {
      const shapes = ['iiioiiooiooioo', 'iioiiiooiooioo', 'iiiioioooiiooo', 'iiooiiiooiooio'];
      const script = (cfg.script || rng.pick(shapes)).split('');
      const n = script.filter((c) => c === 'i').length;
      const s = base({ script, cur: 0, IN: [], OUT: [], nextId: 1, nextServe: 1, n, par: n, par2: n + 3, limit: n * 2 + 4,
        prompt: 'Serve customers in the order they arrived. You can only touch the top of each stack.' });
      twoqFlow(s, []);
      return s;
    },
    act(s, a) {
      const name = (i) => String.fromCharCode(64 + i);
      if (a.t === 'move') {
        if (!s.IN.length) return no('The IN stack is empty.');
        s.OUT.push(s.IN.pop()); s.ops++;
        return { ev: [{ t: 'move', v: s.OUT.length / s.n }] };
      }
      if (a.t === 'back') {
        if (!s.OUT.length) return no('The OUT stack is empty.');
        s.IN.push(s.OUT.pop()); s.ops++;
        return { ev: [{ t: 'move', v: 0.2 }], say: { who: 'murphy', text: 'Back and forth, back and forth. I could watch this all day.' } };
      }
      if (a.t === 'serve') {
        if (!s.OUT.length) return no('Nothing on the OUT stack to hand over.');
        if (top(s.OUT) !== s.nextServe) return strike(s, `That is order ${name(top(s.OUT))}. The customer at the window has been waiting for ${name(s.nextServe)}.`);
        s.OUT.pop(); s.nextServe++; s.cur++;
        const ev = [{ t: 'good', v: s.nextServe / s.n }];
        twoqFlow(s, ev);
        return { ev };
      }
      return no();
    },
    hint(s) {
      const name = (i) => String.fromCharCode(64 + i);
      if (s.OUT.length && top(s.OUT) === s.nextServe) return { a: { t: 'serve' }, note: `The top of OUT is ${name(s.nextServe)}, the oldest order. Serve it, and leave IN alone.`, line: 8 };
      if (s.OUT.includes(s.nextServe)) return { a: { t: 'back' }, note: 'OUT got scrambled: a newer order is sitting on an older one. Move it back.' };
      return { a: { t: 'move' }, note: s.OUT.length ? `Keep tipping IN over into OUT until ${name(s.nextServe)} surfaces.` : 'OUT is empty, so tip IN over into it, one order at a time. The oldest order ends up on top.', line: 7 };
    },
  };

  // ── walk: a linked list scattered through memory ───────────────────────
  const walkRound = (s) => {
    const r = s.round;
    s.cur = 0; s.goal = r === 0 ? s.k : s.nodes.length - 1;
    s.prompt = r === 0 ? `What is item number ${s.k} in the list? (The head is number 0.)` : `Find the node holding ${s.nodes[s.goal].v}. Start again from the head.`;
  };
  L.walk = {
    unit: 'hops',
    init(cfg, rng) {
      const n = cfg.n || 7, cells = cfg.cells || 12;
      const addrs = rng.shuffle(range(60, (i) => 0x12 + i * 3)).slice(0, cells).map((v) => '0x' + v.toString(16).toUpperCase());
      const where = rng.shuffle(range(cells)).slice(0, n);
      const vals = rng.shuffle(range(90, (i) => i + 10)).slice(0, n);
      const s = base({ addrs, nodes: range(n, (i) => ({ v: vals[i], cell: where[i] })), seen: range(n, (i) => i === 0), k: cfg.k || 4, rounds: 2 });
      s.par = s.k + n - 1; s.par2 = s.par;
      walkRound(s);
      return s;
    },
    act(s, a) {
      if (a.t !== 'hop') return no();
      const nxt = s.nodes[s.cur + 1];
      if (!nxt || a.cell !== nxt.cell) return no(nxt ? `You have no idea what lives at ${s.addrs[a.cell]}. The only address you hold is the one this node gives you: ${s.addrs[nxt.cell]}.` : 'This is the last node: its next is null.');
      s.cur++; s.seen[s.cur] = true; s.ops++;
      if (s.cur === s.goal) {
        s.round++;
        if (s.round >= s.rounds) s.status = 'won'; else walkRound(s);
        return { ev: [{ t: 'good', v: s.round / 2 }], say: s.status === 'won' ? { who: 'murphy', text: 'Last node, naturally. I do have standards.' } : null };
      }
      return { ev: [{ t: 'move', v: s.cur / s.nodes.length }] };
    },
    hint(s) {
      const nxt = s.nodes[s.cur + 1];
      return { a: { t: 'hop', cell: nxt.cell }, note: `This node says the next one lives at ${s.addrs[nxt.cell]}. Go there. There is no way to skip ahead.`, line: 3 };
    },
  };

  // ── rewire: change next-pointers without losing the list ───────────────
  // Anything no variable can reach is garbage collected on the spot.
  const listFrom = (s, id) => { const out = [], seen = new Set(); while (id != null && !seen.has(id)) { seen.add(id); const nd = s.nodes.find((x) => x.id === id); out.push(nd.v); id = nd.next; } return out; };
  // A finished list ends at null; listFrom stops at a repeat too, so a loop
  // can read back the right values without being a list at all.
  const endsAtNull = (s, id) => { const seen = new Set(); while (id != null) { if (seen.has(id)) return false; seen.add(id); id = s.nodes.find((x) => x.id === id).next; } return true; };
  const rewireRound = (s) => {
    const r = s.plan[s.round], base0 = s.round * 10, n = r.list.length;
    const id = (i) => (i >= 0 && i < n ? base0 + i : null);
    s.nodes = r.list.map((v, i) => ({ id: id(i), v, next: id(i + 1), slot: i, alive: true }));
    s.vars = { head: id(0) }; s.kind = r.kind; s.path = 0; s.gone = [];
    if (r.kind === 'insert') {
      const N = base0 + 9;
      s.nodes.push({ id: N, v: r.v, next: null, slot: r.at - 0.5, low: true, alive: true });
      s.vars.new = N;
      s.goal = [...r.list.slice(0, r.at), r.v, ...r.list.slice(r.at)];
      s.script = r.at === 0
        ? [{ a: { t: 'ptr', from: N, to: id(0) }, note: `First point the new node at ${r.list[0]}, the old front.` }, { a: { t: 'var', name: 'head', to: N }, note: 'Then move head to the new node. It is the front of the list now.' }]
        : [{ a: { t: 'ptr', from: N, to: id(r.at) }, note: `First point the new node at ${r.list[r.at]}. Now two arrows hold the rest of the list.` }, { a: { t: 'ptr', from: id(r.at - 1), to: N }, note: `Now it is safe to swing ${r.list[r.at - 1]}'s arrow over to the new node.` }];
      s.prompt = r.at === 0 ? `Put ${r.v} at the front of the list.` : `Splice ${r.v} in between ${r.list[r.at - 1]} and ${r.list[r.at]}.`;
    } else if (r.kind === 'delete') {
      s.goal = r.list.filter((_, i) => i !== r.at);
      s.script = [{ a: { t: 'ptr', from: id(r.at - 1), to: id(r.at + 1) }, note: `Point ${r.list[r.at - 1]} straight past ${r.list[r.at]}. With nothing pointing at it, ${r.list[r.at]} is swept away.` }];
      s.prompt = `Remove ${r.list[r.at]} from the list.`;
    } else {
      s.vars.a = null; s.vars.b = null;
      s.goal = r.list.slice().reverse();
      s.script = [];
      for (let i = 0; i < n; i++) {
        s.script.push({ a: { t: 'var', name: 'b', to: id(i + 1) }, note: i < n - 1 ? `Park b on ${r.list[i + 1]}. That bookmark is about to be the only thing holding the rest of the list.` : 'Nothing is left after this node, so b goes to null.', line: 4 });
        s.script.push({ a: { t: 'ptr', from: id(i), to: id(i - 1) }, note: i ? `Turn ${r.list[i]}'s arrow around to point at ${r.list[i - 1]}.` : `Turn ${r.list[0]}'s arrow around. It will be the new tail, so it points at null.`, line: 5 });
        s.script.push({ a: { t: 'var', name: 'a', to: id(i) }, note: `Move a up to ${r.list[i]}: a always marks the front of the part already reversed.`, line: 6 });
        s.script.push({ a: { t: 'var', name: 'head', to: id(i + 1) }, note: i < n - 1 ? `Move head on to ${r.list[i + 1]}, the next node to turn.` : 'Head steps off the end: every arrow is turned.', line: 7 });
      }
      s.script.push({ a: { t: 'var', name: 'head', to: id(n - 1) }, note: 'Finally, head goes to a: the old tail is the new front.', line: 8 });
      s.prompt = 'Reverse the list: every arrow must point the other way. You have two bookmarks, a and b.';
    }
    s.keep = s.kind === 'delete' ? s.nodes.filter((_, i) => i !== r.at).map((x) => x.id) : s.nodes.map((x) => x.id);
  };
  L.rewire = {
    unit: 'rewires', undo: true,
    init(cfg, rng) {
      let v = rng.int(2, 9);
      const vals = range(6, () => (v += rng.int(3, 9)));
      const plan = cfg.kind === 'reverse'
        ? [{ kind: 'reverse', list: rng.shuffle(range(40, (i) => i + 10)).slice(0, cfg.n || 5) }]
        : [{ kind: 'insert', list: [vals[0], vals[1], vals[3], vals[4]], at: 2, v: vals[2] },
           { kind: 'delete', list: vals.slice(0, 5), at: rng.int(1, 3) },
           { kind: 'insert', list: vals.slice(1, 5), at: 0, v: vals[0] }];
      const s = base({ plan: cfg.plan || plan });
      s.rounds = s.plan.length;
      const count = (r) => (r.kind === 'reverse' ? r.list.length : r.kind === 'insert' && r.at > 0 ? 2 : 1);
      s.par = s.plan.reduce((t, r) => t + count(r), 0); s.par2 = s.par + 2;
      if (cfg.kind === 'reverse') s.limit = s.par + 6;
      rewireRound(s);
      return s;
    },
    act(s, a) {
      const node = (id) => s.nodes.find((x) => x.id === id && x.alive);
      if (a.to != null && !node(a.to)) return no();
      const onPath = s.path >= 0 && s.script[s.path] && JSON.stringify(s.script[s.path].a) === JSON.stringify(a);
      if (a.t === 'ptr') {
        const f = node(a.from);
        if (!f || a.from === a.to) return no('A node cannot point at itself here.');
        if (f.next === a.to) return no('It already points there.');
        f.next = a.to; s.ops++;
      } else if (a.t === 'var') {
        if (!(a.name in s.vars) || a.name === 'new') return no();
        if (s.vars[a.name] === a.to) return no('It is already there.');
        s.vars[a.name] = a.to;
      } else return no();
      s.path = onPath ? s.path + 1 : -1;
      // Garbage collection: keep only what some variable can still reach.
      const live = new Set();
      for (const start of Object.values(s.vars)) for (let id = start; id != null && !live.has(id); id = node(id).next) live.add(id);
      const dead = s.nodes.filter((x) => x.alive && !live.has(x.id));
      const ev = [{ t: 'move', v: 0.4 }];
      let say = null;
      if (dead.length) {
        for (const d of dead) { d.alive = false; d.next = null; }
        s.gone = dead.map((d) => d.v);
        const lost = dead.filter((d) => s.keep.includes(d.id));
        ev.push({ t: 'gc', bad: lost.length > 0 });
        if (lost.length) {
          s.status = 'lost';
          s.why = `Nothing pointed at ${lost.map((d) => d.v).join(', ')} any more, so the garbage collector took ${lost.length > 1 ? 'them' : 'it'}. Always grab hold of the rest of the list before you let go.`;
          return { ev, say: { who: 'murphy', text: 'Yoink! Nobody was holding that.' } };
        }
        say = { who: 'bit', text: `Nothing points at ${dead[0].v} now, so memory reclaims it. That is all deleting is.` };
      }
      if (endsAtNull(s, s.vars.head) && JSON.stringify(listFrom(s, s.vars.head)) === JSON.stringify(s.goal)) {
        s.round++;
        if (s.round >= s.rounds) s.status = 'won'; else rewireRound(s);
        ev.push({ t: 'good', v: s.round / s.rounds });
      }
      return { ev, say };
    },
    hint(s) {
      if (s.path < 0 || !s.script[s.path]) return { undo: true, note: 'You have wandered off the usual recipe. Step back and I will show you the standard move.' };
      return s.script[s.path];
    },
  };
  BB.listFrom = listFrom;
})();
