// Prototype entry: a free camera that traverses portals through the core
// advance(), rendering with the stencil portal renderer.
import * as THREE from 'three';
import { PortalRenderer } from './render/portal-renderer.js';
import { WorldView } from './render/world-view.js';
import { Post } from './render/post.js';
import { protoWorld } from './core/proto.js';
import { advance } from './core/portal.js';
import { qmul, qnorm, qaxis, qrot, xpoint } from './core/math.js';

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
renderer.autoClear = false;
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
const pmrem = new THREE.PMREMGenerator(renderer);
const pr = new PortalRenderer(renderer);
pr.frameId = 0;
const post = new Post(renderer);
const ctx = { renderer, pmrem, shadows: true, shadowSize: 2048 };

const views = new Map();
function getView(key) {
  if (!views.has(key)) { const d = protoWorld(key); if (!d) return null; views.set(key, new WorldView(d, ctx).build()); }
  return views.get(key);
}
const api = { portals: (w) => getView(w).portals, resolve: (P) => getView(P.link.world).portal(P.link.slot) };

const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 6000);
let world = 'proto:A';
const start = getView(world).desc.spawn;
camera.position.set(start.p[0], 1.62, start.p[2]);
camera.quaternion.set(...qaxis([0, 1, 0], start.yaw));
getView('proto:B');

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
  renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  post.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// Move the camera by `delta` (world vector), crossing portals.
function move(delta) {
  const p0 = [camera.position.x, camera.position.y, camera.position.z];
  const r = advance(world, p0, [p0[0] + delta[0], p0[1] + delta[1], p0[2] + delta[2]], api);
  if (r.crossings.length) {
    const q = qnorm(qmul(r.xf.q, [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w]));
    camera.quaternion.set(...q);
    world = r.world;
  }
  camera.position.set(...r.p);
  return r;
}

let time = 0;
function frame(dt) {
  time += dt;
  pr.frameId++;
  renderer.info.reset();
  for (const v of views.values()) { v.update(dt, time); v.focus.copy(camera.position); }
  camera.updateMatrixWorld();
  pr.render(getView(world), camera, post.sceneRT, getView);
  post.render(time);
}

window.THR = {
  THREE, renderer, pr, post, camera, views, getView,
  get world() { return world; },
  setPose(w, p, yaw, pitch = 0) {
    world = w; getView(w);
    camera.position.set(...p);
    camera.quaternion.set(...qnorm(qmul(qaxis([0, 1, 0], yaw), qaxis([1, 0, 0], pitch))));
  },
  move, frame, ready: true,
  stats: () => ({ ...pr.stats, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, world }),
};

const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
canvas.addEventListener('click', () => canvas.requestPointerLock?.());
let yaw = start.yaw, pitch = 0;
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  const dq = qnorm(qmul(qaxis([0, 1, 0], -e.movementX * 0.0022), [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w]));
  const q2 = qnorm(qmul(dq, qaxis([1, 0, 0], -e.movementY * 0.0022)));
  camera.quaternion.set(...q2);
});
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!window.THR.manual) {
    const q = [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w];
    const f = qrot(q, [0, 0, -1]), r = qrot(q, [1, 0, 0]);
    let d = [0, 0, 0]; const sp = (keys.has('ShiftLeft') ? 12 : 4) * dt;
    if (keys.has('KeyW')) d = d.map((v, i) => v + f[i] * sp);
    if (keys.has('KeyS')) d = d.map((v, i) => v - f[i] * sp);
    if (keys.has('KeyD')) d = d.map((v, i) => v + r[i] * sp);
    if (keys.has('KeyA')) d = d.map((v, i) => v - r[i] * sp);
    if (d.some((v) => v !== 0)) move(d);
    frame(dt);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
