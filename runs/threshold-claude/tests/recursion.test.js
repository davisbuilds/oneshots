// Recursive and cyclic portal views terminate within their budgets. The real
// PortalRenderer runs against a stub WebGL renderer that only counts calls, on
// real world descriptors: the room that contains itself (two cycles), the
// endless stoa, the Threshold, and random far worlds.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { PortalRenderer } from '../src/render/portal-renderer.js';
import { corners } from '../src/core/portal.js';
import { describe } from '../src/core/worlds/index.js';
import { qaxis, qmul, qnorm } from '../src/core/math.js';
import { makeAtmosUniforms } from '../src/render/atmosphere.js';

test('renderer objects receive distinct v4 UUIDs through the platform random source', (t) => {
  t.mock.method(Math, 'random', () => assert.fail('renderer UUID used Math.random'));
  const first = new THREE.BufferGeometry().uuid;
  const second = new THREE.BufferGeometry().uuid;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  assert.match(first, uuid);
  assert.match(second, uuid);
  assert.notEqual(first, second);
});

function stubRenderer() {
  const noop = () => {};
  const stencil = { setLocked: noop, setTest: noop, setMask: noop, setFunc: noop, setOp: noop };
  return {
    calls: 0, clippingPlanes: [], shadowMap: {},
    getContext: () => ({ EQUAL: 0x202, KEEP: 0x1e00 }),
    state: { buffers: { stencil } },
    setRenderTarget: noop, setClearColor: noop, clear: noop,
    render() { this.calls++; },
  };
}
function views() {
  const cache = new Map();
  return (k) => {
    if (!cache.has(k)) {
      const d = describe(k);
      if (!d) return null;
      const portals = d.portals.map((P) => ({ ...P, cornersPad: corners(P, 0.08) }));
      cache.set(k, { key: k, desc: d, ready: true, scene: {}, uniforms: makeAtmosUniforms(d.atmos), fillColor: [0, 0, 0], portals,
        portal: (slot) => portals.find((P) => P.slot === slot), beforeRender() {} });
    }
    return cache.get(k);
  };
}
function camera(p, yaw, pitch = 0) {
  const c = new THREE.PerspectiveCamera(70, 16 / 9, 0.08, 6000);
  c.position.set(...p);
  c.quaternion.set(...qnorm(qmul(qaxis([0, 1, 0], yaw), qaxis([1, 0, 0], pitch))));
  c.updateMatrixWorld(true); c.updateProjectionMatrix();
  return c;
}

const target = { width: 1280, height: 720, scissor: new THREE.Vector4(), scissorTest: false };

test('the room that contains itself: cycles stop at the depth and render budgets', () => {
  const get = views();
  for (const [maxDepth, maxRenders] of [[1, 3], [2, 5], [3, 12], [4, 18], [8, 40]]) {
    const r = stubRenderer(), pr = new PortalRenderer(r);
    pr.settings.maxDepth = maxDepth; pr.settings.maxRenders = maxRenders;
    // standing in the middle, looking east at the door that opens into the west door
    pr.render(get('3,0/mirror'), camera([0, 1.62, 0], -Math.PI / 2), target, get);
    const s = pr.stats;
    assert.ok(s.maxLevel <= maxDepth, `depth ${s.maxLevel} <= ${maxDepth}`);
    assert.ok(s.portalsRendered <= maxRenders, `renders ${s.portalsRendered} <= ${maxRenders}`);
    assert.equal(s.worldRenders, s.portalsRendered + 1);
    assert.ok(s.portalsFilled > 0, 'the regress ends in a terminal fill');
    assert.ok(r.calls < 10 * (maxRenders + 1) + 50, `bounded draw submissions (${r.calls})`);
  }
});

test('looking up at the skylight, and along the stoa, terminates too', () => {
  const get = views();
  const cases = [['3,0/mirror', [0, 1.62, 0], 0, 1.4], ['3,0/mirror', [0, 1.62, 5], 0, 0.3], ['0,0', [16.5, 61.6, 10], 0, 0], ['0,0', [16.5, 61.6, -10], Math.PI, 0]];
  for (const [w, p, yaw, pitch] of cases) {
    const r = stubRenderer(), pr = new PortalRenderer(r);
    pr.settings.maxDepth = 6; pr.settings.maxRenders = 20;
    pr.render(get(w), camera(p, yaw, pitch), target, get);
    assert.ok(pr.stats.maxLevel <= 6 && pr.stats.portalsRendered <= 20, JSON.stringify(pr.stats));
    assert.ok(pr.stats.portalsRendered >= 1, `${w}: something seen through a portal`);
  }
});

test('random poses in many worlds never exceed the budget', () => {
  const get = views();
  let rendered = 0;
  for (let k = 0; k < 120; k++) {
    const w = ['0,0', '1,0', '2,0', '3,0', '0,0/hall', '3,0/mirror', `${k % 9 - 4},${(k * 7) % 11 - 5}`][k % 7];
    const v = get(w);
    const P = v.portals[k % v.portals.length];
    // stand somewhere in front of one of its portals, looking roughly at it
    const d = 1 + (k % 13) * 3, side = ((k * 37) % 17 - 8) * 0.4;
    const n = P.n, x = P.xf.p[0] + n[0] * d + n[2] * side, z = P.xf.p[2] + n[2] * d - n[0] * side;
    const yaw = Math.atan2(n[0], n[2]) + ((k % 5) - 2) * 0.3;
    const r = stubRenderer(), pr = new PortalRenderer(r);
    pr.settings.maxDepth = 1 + (k % 4); pr.settings.maxRenders = 2 + (k % 10);
    pr.render(v, camera([x, P.xf.p[1], z], yaw, 0), target, get);
    const s = pr.stats;
    assert.ok(s.maxLevel <= pr.settings.maxDepth && s.portalsRendered <= pr.settings.maxRenders, `${w} pose ${k}: ${JSON.stringify(s)}`);
    rendered += s.portalsRendered;
  }
  assert.ok(rendered > 100, `portals actually rendered across poses: ${rendered}`);
});
