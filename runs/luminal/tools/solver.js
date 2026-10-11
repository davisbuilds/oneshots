// solver.js: proves the level can be finished under the real physics.
// A breadth-first search over button states: every few steps each surviving
// state branches into "held" and "released", and states that land in the same
// small cell of (y, vy, grounded, ...) are merged. The route it returns is a
// plain list of per-step inputs, replayed through the same step() as the game.
'use strict';
const L = require('../src/node.js');

function keyOf(lv, s) {
  let used = 0;
  // Only triggers near the player can still matter.
  const c = Math.floor(s.x / 4);
  for (let k = c - 1; k <= c + 1; k++) {
    const cell = lv.trigCells[k];
    if (cell) for (const i of cell) if (s.used[i]) used = used * 31 + i + 1;
  }
  return [
    Math.round(s.y * 20), Math.round(s.vy * 2), s.grounded ? 1 : 0, s.held ? 1 : 0,
    s.buffer > 0 ? 1 : 0, s.coyote > 0 ? 1 : 0, s.grav, s.mode, used,
  ].join(',');
}

// Search from state `start` until a state reaches x >= goalX (or finishes).
// Returns { inputs: Uint8Array per step from start.n, end, layers } or null.
function solve(lv, start, goalX, opts = {}) {
  const every = opts.every || 2;
  const cap = opts.cap || 600;
  // Among states that merge, keep the one reached with the fewest button
  // changes: the route comes out the way a person would play it.
  let frontier = [{ s: L.cloneState(start), node: -1, edges: 0 }];
  const parent = [], held = [];
  const goal = goalX === undefined ? lv.endX : goalX;
  for (let layer = 0; layer < 1e6; layer++) {
    const seen = new Map();
    const next = [];
    for (const f of frontier) {
      for (const h of [false, true]) {
        const s = L.cloneState(f.s);
        for (let k = 0; k < every && !s.dead && !s.finished; k++) L.step(lv, s, h);
        if (s.dead) continue;
        const id = parent.length;
        parent.push(f.node); held.push(h ? 1 : 0);
        if (s.finished || s.x >= goal) {
          const seq = [];
          for (let n = id; n >= 0; n = parent[n]) seq.push(held[n]);
          seq.reverse();
          const inputs = new Uint8Array(seq.length * every);
          seq.forEach((v, i) => inputs.fill(v, i * every, (i + 1) * every));
          return { inputs, end: s, layers: layer + 1 };
        }
        const key = keyOf(lv, s);
        const edges = f.edges + (h !== f.s.held ? 1 : 0);
        const prev = seen.get(key);
        if (prev !== undefined) {
          if (next[prev].edges > edges) next[prev] = { s, node: id, edges };
          continue;
        }
        seen.set(key, next.length);
        next.push({ s, node: id, edges });
      }
    }
    if (!next.length) {
      return { failed: true, x: Math.max(...frontier.map(f => f.s.x)), t: frontier[0].s.t, layers: layer };
    }
    if (next.length > cap) {
      // Keep a spread: sort by height and take evenly spaced states.
      next.sort((a, b) => a.s.y - b.s.y || a.s.vy - b.s.vy);
      const kept = [];
      for (let i = 0; i < cap; i++) kept.push(next[Math.floor(i * next.length / cap)]);
      frontier = kept;
    } else frontier = next;
  }
  return null;
}

// Replay inputs from a state; returns the final state.
function replay(lv, start, inputs, maxSteps) {
  const s = L.cloneState(start);
  const n0 = s.n;
  L.simulate(lv, s, n => !!inputs[n - n0], maxSteps === undefined ? inputs.length : maxSteps);
  return s;
}

// Where each press and release happens in a route: [{n, kind}].
function edges(inputs) {
  const out = [];
  let prev = 0;
  for (let n = 0; n < inputs.length; n++) {
    if (inputs[n] !== prev) out.push({ n, kind: inputs[n] ? 'press' : 'release' });
    prev = inputs[n];
  }
  return out;
}

// For each press, how far it can move (in steps, keeping the rest of the
// route) and still survive the next `horizon` seconds. That is the timing
// window a player has for that input.
function windows(lv, start, inputs, opts = {}) {
  const horizon = Math.round((opts.horizon || 1.2) / L.DT);
  const maxShift = opts.maxShift || 48;
  const res = [];
  const marks = edges(inputs);
  // Checkpoint states along the route so each probe starts close by.
  const snaps = [];
  {
    const s = L.cloneState(start);
    for (let n = 0; n < inputs.length; n++) {
      if (n % 240 === 0) snaps.push(L.cloneState(s));
      L.step(lv, s, !!inputs[n]);
    }
  }
  const survive = (seq, from) => {
    const k = Math.floor(from / 240);
    const s = L.cloneState(snaps[k]);
    const end = Math.min(seq.length, from + horizon);
    for (let n = k * 240; n < end; n++) {
      L.step(lv, s, !!seq[n]);
      if (s.dead) return false;
    }
    return true;
  };
  for (const m of marks) {
    if (m.kind !== 'press') continue;
    // The press lasts until the next release.
    let rel = m.n; while (rel < inputs.length && inputs[rel]) rel++;
    const len = rel - m.n;
    let early = 0, late = 0;
    for (let d = 1; d <= maxShift; d++) {
      const seq = shifted(inputs, m.n, len, -d);
      if (!seq || !survive(seq, Math.max(0, m.n - d - 1))) break;
      early = d;
    }
    for (let d = 1; d <= maxShift; d++) {
      const seq = shifted(inputs, m.n, len, d);
      if (!seq || !survive(seq, Math.max(0, m.n - 1))) break;
      late = d;
    }
    res.push({ n: m.n, t: start.t + m.n * L.DT, early, late, width: (early + late + 1) * L.DT });
  }
  return res;
}

function shifted(inputs, n, len, d) {
  const a = n + d, b = n + len + d;
  if (a < 0 || b > inputs.length) return null;
  const seq = inputs.slice();
  seq.fill(0, n, n + len);
  // Do not merge into a neighbouring press.
  for (let i = a - 1; i <= b; i++) if (i >= 0 && i < seq.length && seq[i]) return null;
  seq.fill(1, a, b);
  return seq;
}

module.exports = { solve, replay, edges, windows, keyOf };
