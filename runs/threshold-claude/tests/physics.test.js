// The character controller walking through real doorway geometry: crossing and
// returning, standing halfway, collisions consistent on both sides of the
// plane, edges and corners, high speed, and rapid repeated traversal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Space } from '../src/core/space.js';
import { Traveller, BODY, gatherContacts } from '../src/core/physics.js';
import { protoWorld } from '../src/core/proto.js';
import { toLocal, pairXf } from '../src/core/portal.js';
import { dist, xpoint, qrot, dot, madd, xf } from '../src/core/math.js';
import { makePortal } from '../src/core/portal.js';

const DT = 1 / 120;
const space = () => new Space(protoWorld);
const run = (t, input, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) t.step(input, DT); };

// Invariant: the eye is never behind a linked portal of its own world inside the opening.
function assertNoGhost(sp, t, msg = '') {
  for (const P of sp.portals(t.world)) {
    if (!P.link) continue;
    const l = toLocal(P, t.eye);
    assert.ok(!(l[2] < -1e-9 && Math.abs(l[0]) <= P.hw && Math.abs(l[1]) <= P.hh && l[2] > -0.5), `${msg} eye behind ${P.id}: ${l}`);
  }
}

test('walk through the doorway, turn round, walk back', () => {
  const sp = space();
  const t = new Traveller(sp, { world: 'proto:A', feet: [0.2, 0, -8], yaw: 0 });
  run(t, {}, 0.3);
  assert.ok(t.grounded, 'standing on the ground');
  const start = [...t.feet];
  run(t, { forward: 1 }, 1.6);
  assert.equal(t.world, 'proto:B', 'crossed into B');
  assert.equal(t.crossings.length, 1);
  const B = sp.portals('proto:B').find((P) => P.slot === 'toA');
  assert.ok(toLocal(B, t.eye)[2] > 1, 'walked out of the far doorway');
  run(t, {}, 0.5);
  t.turn(Math.PI, 0);
  run(t, { forward: 1 }, 1.6);
  run(t, {}, 0.6);
  assert.equal(t.world, 'proto:A', 'back in A');
  assert.equal(t.crossings.length, 2);
  assert.ok(dist(t.feet, start) < 0.35, `returned near the start: ${t.feet} vs ${start}`);
  assert.ok(t.grounded);
});

test('standing halfway through: grounded, and collisions match on both sides of the plane', () => {
  const sp = space();
  const A = sp.portals('proto:A').find((P) => P.slot === 'toB');
  const B = sp.resolve(A);
  // Body centred on the plane, eye 2 cm in front: half the capsule is beyond the plane.
  const t = new Traveller(sp, { world: 'proto:A', feet: xpoint(A.xf, [0, -A.hh, 0.02]), yaw: 0 });
  run(t, {}, 0.5);
  assert.equal(t.world, 'proto:A'); assert.ok(t.grounded);
  // Sidestep into the jamb from the A side of the plane and from the B side.
  const reach = (world, P, z) => {
    const s = new Traveller(sp, { world, feet: xpoint(P.xf, [0, -P.hh, z]), yaw: 0 });
    // face along -z of the portal frame and strafe right (+x of the portal)
    s.look = [...P.xf.q]; // looking into the portal (-z local); view right = +x local
    run(s, { right: 1 }, 1.2);
    return { world: s.world, x: toLocal(s.world === P.world ? P : sp.resolve(P), s.feet)[0] };
  };
  const a = reach('proto:A', A, 0.05);
  const b = reach('proto:B', B, 0.05);
  assert.ok(Math.abs(Math.abs(a.x) - (A.hw - BODY.radius)) < 0.02, `A side stops at the jamb: ${a.x}`);
  assert.ok(Math.abs(Math.abs(b.x) - (B.hw - BODY.radius)) < 0.02, `B side stops at the jamb: ${b.x}`);
});

test('a body straddling a portal collides with the far world beyond the plane, not its own', () => {
  // X: a doorway at z = 0 facing +z, with a wall 0.4 m behind it *inside* the
  // opening (like the inside of a small hut). Y: the linked doorway, open
  // ground beyond, and a post 0.5 m beyond the plane inside the opening.
  const door = (world, slot, link) => makePortal({ world, slot, p: [0, 1.5, 0], q: [0, 0, 0, 1], hw: 1, hh: 1.5, link });
  const worlds = {
    X: { key: 'X', ground: { kind: 'plane', y: 0 }, portals: [door('X', 'd', { world: 'Y', slot: 'd' })],
      parts: [{ kind: 'box', xf: xf([0, 1.5, -0.6]), he: [0.9, 1.4, 0.2], solid: true }] },
    Y: { key: 'Y', ground: { kind: 'plane', y: 0 }, portals: [door('Y', 'd', { world: 'X', slot: 'd' })],
      parts: [{ kind: 'box', xf: xf([0.6, 1.5, 0.5 + 0.1]), he: [0.1, 1.4, 0.1], solid: true }] },
  };
  const sp = new Space((k) => worlds[k]);
  // Feet just in front of X's door, capsule reaching 0.32 m beyond the plane.
  const cs = gatherContacts(sp, 'X', [0, 0, 0.05], [0, 1, 0]);
  assert.ok(!cs.some((k) => k.p[2] < -0.3 && !k.via), 'the hut wall behind the plane is ignored');
  // Walk in: the body passes the hut wall's position and meets Y's post instead.
  const t = new Traveller(sp, { world: 'X', feet: [0.6, 0, 1.2], yaw: 0 });
  for (let i = 0; i < 240; i++) t.step({ forward: 1 }, DT);
  assert.equal(t.world, 'Y', 'went through (the hut wall did not stop it)');
  // In Y the door maps (x, z) -> (-x, -z): x = 0.6 in X is x = -0.6 in Y, clear of the post at +0.6.
  const t2 = new Traveller(sp, { world: 'X', feet: [-0.6, 0, 1.2], yaw: 0 });
  for (let i = 0; i < 240; i++) t2.step({ forward: 1 }, DT);
  // -0.6 in X lands at +0.6 in Y: the post, 0.5 m beyond the plane, blocks it.
  // The post's near face is 0.5 m beyond the plane, so the feet stop at 0.5 - radius.
  assert.equal(t2.world, 'Y');
  assert.ok(Math.abs(t2.feet[2] - (0.5 - BODY.radius)) < 0.03, `stopped by Y's post at z = ${t2.feet[2].toFixed(3)}`);
  assert.ok(Math.abs(t2.feet[0] - 0.6) < 0.05, 'did not slide around it');
});

test('walking into the edges and corners never leaves the eye behind a portal', () => {
  const sp = space();
  const A = sp.portals('proto:A').find((P) => P.slot === 'toB');
  let crossed = 0, blocked = 0;
  for (let i = 0; i < 60; i++) {
    const x = -A.hw - 1.0 + (i / 59) * (2 * A.hw + 2.0);       // from outside the left jamb to outside the right
    const ang = ((i % 7) - 3) * 0.25;                           // approach angles
    const t = new Traveller(sp, { world: 'proto:A', feet: xpoint(A.xf, [x, -A.hh, 1.5]), yaw: ang });
    for (let k = 0; k < 300; k++) { t.step({ forward: 1, run: k % 2 === 0 }, DT); assertNoGhost(sp, t, `run ${i} step ${k}`); }
    if (t.world === 'proto:B') crossed++; else blocked++;
  }
  assert.ok(crossed > 10 && blocked > 10, `some cross, some are stopped by the frame (${crossed}/${blocked})`);
});

test('high speed: a 300 m/s body crosses exactly once without tunnelling', () => {
  const sp = space();
  const A = sp.portals('proto:A').find((P) => P.slot === 'toB');
  const t = new Traveller(sp, { world: 'proto:A', feet: xpoint(A.xf, [0, -A.hh, 1.5]), yaw: 0 });
  run(t, {}, 0.2);
  t.vel = qrot(A.xf.q, [0, 0, -300]);
  t.grounded = false;
  t.step({}, DT); // 2.5 m in one step: through the plane
  assert.equal(t.world, 'proto:B');
  assert.equal(t.crossings.length, 1);
  const v = Math.hypot(...t.vel);
  assert.ok(v > 250, 'kept its speed through the portal: ' + v);
  const B = sp.resolve(A);
  assert.ok(dot(t.vel, B.n) > 0, 'moving out of B');
});

test('rapid repeated traversal: 400 reversals across the threshold', () => {
  const sp = space();
  const A = sp.portals('proto:A').find((P) => P.slot === 'toB');
  const t = new Traveller(sp, { world: 'proto:A', feet: xpoint(A.xf, [0.1, -A.hh, 0.25]), yaw: 0 });
  t.look = [...A.xf.q];
  run(t, {}, 0.3);
  let worlds = 0;
  for (let k = 0; k < 400; k++) {
    const before = t.world;
    // walk towards the threshold until it is crossed (forward in A, backward in B)
    const dir = t.world === 'proto:A' ? 1 : -1;
    for (let s = 0; s < 90 && t.world === before; s++) { t.step({ forward: dir, run: true }, DT); assertNoGhost(sp, t); }
    if (t.world !== before) worlds++;
    for (let s = 0; s < 3; s++) { t.step({ forward: dir }, DT); assertNoGhost(sp, t); }
  }
  assert.equal(worlds, 400, 'every reversal crossed exactly once');
  // Wherever it ended, the body is standing in the doorway region, not lost.
  const P = t.world === 'proto:A' ? A : sp.resolve(A);
  const l = toLocal(P, t.feet);
  assert.ok(Math.abs(l[0]) < P.hw && Math.abs(l[2]) < 3, `still at the doorway: ${l}`);
});

test('back-to-back gate: walking through from each side leads to different places', () => {
  const sp = space();
  const front = sp.portals('proto:A').find((P) => P.slot === 'bf');
  const t1 = new Traveller(sp, { world: 'proto:A', feet: xpoint(front.xf, [0, -front.hh, 2]), yaw: Math.PI / 2 });
  t1.look = [...front.xf.q]; // in front of bf, looking into it
  run(t1, { forward: 1 }, 1.0);
  const t2 = new Traveller(sp, { world: 'proto:A', feet: xpoint(front.xf, [0, -front.hh, -2]), yaw: 0 });
  t2.look = [...front.xf.q]; t2.turn(Math.PI, 0); // behind bf = in front of bb, looking into bb
  run(t2, { forward: 1 }, 1.0);
  assert.equal(t1.world, 'proto:B'); assert.equal(t2.world, 'proto:B');
  const p1 = sp.portals('proto:B').find((P) => P.slot === 'bb1'), p2 = sp.portals('proto:B').find((P) => P.slot === 'bb2');
  assert.ok(dist(t1.feet, p1.xf.p) < 5, 'front side -> bb1');
  assert.ok(dist(t2.feet, p2.xf.p) < 5, 'back side -> bb2');
});

test('camera never sees across a plane it has not crossed: eye stays in front within the near zone', () => {
  const sp = space();
  const A = sp.portals('proto:A').find((P) => P.slot === 'toB');
  const t = new Traveller(sp, { world: 'proto:A', feet: xpoint(A.xf, [0, -A.hh, 0.6]), yaw: 0 });
  run(t, {}, 0.2);
  // creep towards the plane at 1 cm per step
  for (let k = 0; k < 200; k++) {
    const f = qrot(A.xf.q, [0, 0, -0.01]);
    t.moveBy(f, [0, 0, 0], DT);
    assertNoGhost(sp, t);
    if (t.world === 'proto:B') break;
  }
  assert.equal(t.world, 'proto:B');
  const B = sp.resolve(A);
  const l = toLocal(B, t.eye);
  assert.ok(l[2] > 0 && l[2] < 0.02, 'arrived just in front of the exit plane: ' + l[2]);
  void madd; void pairXf;
});
