// stress.mjs: long automated exploration with the real physics, many seeds.
//   node tools/stress.mjs [hops=300] [seeds=3]
// A traveller hops through the multiverse: in each world it picks a random
// doorway, stands 6 m in front of it, walks in with the real controller, and
// must arrive in the linked world in front of the paired doorway; then it
// walks out for two seconds and must still be in that world, upright, above
// the world's floor, and never pass front to back through an opening (inside the
// opening, without a crossing). Also checked: the round trip back through the
// same doorway.
import { Space } from '../src/core/space.js';
import { Traveller } from '../src/core/physics.js';
import { describe } from '../src/core/worlds/index.js';
import { toLocal, segmentCrossing } from '../src/core/portal.js';
import { rng } from '../src/core/rng.js';

const hops = Number(process.argv[2] || 300), seeds = Number(process.argv[3] || 3);
const DT = 1 / 120;
const failures = [];
let total = 0, roundTrips = 0;
const archetypes = new Map();

// A missed crossing: within one step and one world, the eye passed front to
// back through an opening without being carried through it. (Being behind a
// portal is fine: portals are one-sided, and walking through a doorway's back
// is ordinary walking.)
function stepWith(sp, t, input) {
  const w0 = t.world, e0 = t.eye, n0 = t.crossings.length;
  t.step(input, DT);
  if (t.world !== w0 || t.crossings.length !== n0) return null;
  for (const P of sp.portals(w0)) if (P.link && segmentCrossing(P, e0, t.eye)) return P.id;
  return null;
}

export function runStress({ hops, seeds, log = console.log }) {
  const t0 = Date.now();
  for (let s = 0; s < seeds; s++) {
    const universe = 0x54485253 + s * 7919;
    const sp = new Space((k) => describe(k, universe), { capacity: 24 });
    const R = rng(universe);
    let world = '0,0';
    for (let h = 0; h < hops; h++) {
      const portals = sp.portals(world).filter((P) => P.link);
      const P = portals[R.int(portals.length)];
      const D = sp.resolve(P);
      const fail = (why, extra = {}) => { failures.push({ universe, world, slot: P.slot, to: P.link.world, why, ...extra }); };
      // stand in front of the doorway, on its floor, facing it
      const t = new Traveller(sp, { world, feet: [P.xf.p[0] + P.n[0] * 6, P.xf.p[1] - P.hh + 0.05, P.xf.p[2] + P.n[2] * 6], yaw: 0 });
      t.look = [...P.xf.q];
      if (Math.abs(P.n[1]) > 0.5) { world = P.link.world; continue; } // floor/ceiling portals are not walked into
      let crossed = false, steps = 0;
      for (; steps < 900 && !crossed; steps++) {
        const missed = stepWith(sp, t, { forward: 1 });
        if (missed) { fail('missed a crossing', { portal: missed }); break; }
        if (t.crossings.length) crossed = true;
      }
      total++;
      const arch = describe(world, universe).archetype;
      archetypes.set(arch, (archetypes.get(arch) || 0) + 1);
      if (!crossed) { fail('did not get through the doorway in 7.5 s', { at: t.feet.map((v) => +v.toFixed(2)) }); world = P.link.world; continue; }
      if (t.world !== P.link.world) { fail('arrived in the wrong world', { got: t.world }); world = t.world; continue; }
      const l = toLocal(D, t.eye);
      if (!(l[2] > 0 && l[2] < 1 && Math.abs(l[0]) < D.hw + 0.01)) fail('not in front of the paired doorway', { local: l.map((v) => +v.toFixed(3)) });
      // walk out for two seconds
      for (let k = 0; k < 240; k++) { const missed = stepWith(sp, t, { forward: 1 }); if (missed) { fail('missed a crossing after arriving', { portal: missed }); break; } }
      for (let k = 0; k < 120; k++) t.step({}, DT);
      const kill = sp.killHeight(t.world);
      if (t.world !== P.link.world && t.crossings.length < 2) fail('left the arrival world unexpectedly', { got: t.world });
      if (t.up[1] < 0.99) fail('not upright after arriving', { up: t.up });
      if (kill !== null && t.feet[1] < kill) fail('fell out of the world');
      if (!t.grounded) fail('not standing after walking out', { at: t.feet.map((v) => +v.toFixed(2)) });
      // every fifth hop: turn round and walk back through the same doorway
      if (h % 5 === 0 && t.world === P.link.world) {
        const back = new Traveller(sp, { world: t.world, feet: [D.xf.p[0] + D.n[0] * 4, D.xf.p[1] - D.hh + 0.05, D.xf.p[2] + D.n[2] * 4], yaw: 0 });
        back.look = [...D.xf.q];
        for (let k = 0; k < 600 && !back.crossings.length; k++) back.step({ forward: 1 }, DT);
        if (back.world !== world) fail('the way back did not lead home', { got: back.world });
        else roundTrips++;
      }
      world = t.world;
    }
  }
  const ms = Date.now() - t0;
  log(`stress: ${total} doorway hops over ${seeds} universe seeds, ${roundTrips} round trips, ${failures.length} failures, ${(ms / 1000).toFixed(1)} s`);
  log('stress: hops by archetype: ' + [...archetypes].map(([a, n]) => `${a} ${n}`).join(', '));
  for (const f of failures.slice(0, 25)) log('  FAIL ' + JSON.stringify(f));
  return { total, roundTrips, failures, archetypes: Object.fromEntries(archetypes) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = runStress({ hops, seeds });
  process.exit(r.failures.length ? 1 : 0);
}
