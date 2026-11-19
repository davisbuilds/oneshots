// Character physics: a capsule walking through portal-connected worlds.
//
// Collision is portal-aware. While the capsule overlaps a portal's opening,
// contacts with its own world's geometry *beyond* the portal plane inside the
// opening are ignored, and the destination world's geometry in front of the
// linked portal is mapped through the portal and used instead. A body standing
// halfway through a doorway therefore collides with exactly what it would see:
// this world in front of the plane, the other world beyond it.
//
// The eye decides when the traveller crosses: the camera never renders from
// the wrong side of a portal plane.
import {
  add, sub, scale, dot, cross, len, norm, madd, lerp3, clamp, reject,
  qmul, qnorm, qrot, qbetween, qslerp, qaxis, xpoint, xvec, xinv,
} from './math.js';
import { advance, pairXf, toLocal } from './portal.js';

export const BODY = Object.freeze({ radius: 0.32, height: 1.78, eye: 1.62, step: 0.55 });
export const MOVE = Object.freeze({ walk: 4.6, run: 9.0, accel: 55, airAccel: 9, jump: 5.6, gravity: 16, maxFall: 60 });
const ITER = 5;

// ── Collider primitives ─────────────────────────────────────────────────────
export function boxCollider(x, he, extra = {}) { return { kind: 'box', xf: x, inv: xinv(x), he, r: Math.hypot(he[0], he[1], he[2]), c: x.p, ...extra }; }
export function capsuleCollider(a, b, r, extra = {}) { return { kind: 'capsule', a, b, rad: r, c: lerp3(a, b, 0.5), r: len(sub(b, a)) / 2 + r, ...extra }; }

function closestOnSeg(p, a, b) {
  const ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-12), 0, 1);
  return [madd(a, ab, t), t];
}
function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) return [p1, p2];
  if (a <= 1e-12) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-12) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  return [madd(p1, d1, s), madd(p2, d2, t)];
}

// Contact between the capsule segment a-b (radius r) and a collider.
// Returns { n, depth, p } (n pushes the capsule out) or null.
export function capsuleContact(a, b, r, c) {
  if (c.kind === 'box') {
    const la = xpoint(c.inv, a), lb = xpoint(c.inv, b), he = c.he;
    let t = 0.5, p, q;
    for (let k = 0; k < 10; k++) {
      p = lerp3(la, lb, t);
      q = [clamp(p[0], -he[0], he[0]), clamp(p[1], -he[1], he[1]), clamp(p[2], -he[2], he[2])];
      t = closestOnSeg(q, la, lb)[1];
    }
    p = lerp3(la, lb, t);
    q = [clamp(p[0], -he[0], he[0]), clamp(p[1], -he[1], he[1]), clamp(p[2], -he[2], he[2])];
    const d = sub(p, q), dl = len(d);
    let n, depth, pt;
    if (dl > 1e-7) {
      if (dl >= r) return null;
      n = scale(d, 1 / dl); depth = r - dl; pt = q;
    } else {
      // segment point inside the box: leave by the shallowest face
      let best = 0, pen = Infinity;
      for (let i = 0; i < 3; i++) { const pi = he[i] - Math.abs(p[i]); if (pi < pen) { pen = pi; best = i; } }
      n = [0, 0, 0]; n[best] = p[best] >= 0 ? 1 : -1;
      depth = pen + r; pt = [...p]; pt[best] = n[best] * he[best];
    }
    return { n: xvec(c.xf, n), depth, p: xpoint(c.xf, pt) };
  }
  if (c.kind === 'capsule') {
    const [p, q] = segSeg(a, b, c.a, c.b);
    const d = sub(p, q), dl = len(d), rr = r + c.rad;
    if (dl >= rr) return null;
    const n = dl > 1e-7 ? scale(d, 1 / dl) : [1, 0, 0];
    return { n, depth: rr - dl, p: madd(q, n, c.rad) };
  }
  if (c.kind === 'sphere') {
    const [p] = closestOnSeg(c.c, a, b);
    const d = sub(p, c.c), dl = len(d), rr = r + c.rad;
    if (dl >= rr) return null;
    const n = dl > 1e-7 ? scale(d, 1 / dl) : [0, 1, 0];
    return { n, depth: rr - dl, p: madd(c.c, n, c.rad) };
  }
  return null;
}

// ── Portal-aware contact gathering ───────────────────────────────────────────
const inTube = (P, l) => Math.abs(l[0]) < P.hw && Math.abs(l[1]) < P.hh;

// Portals of `world` whose opening the capsule overlaps.
function straddled(api, world, a, b, r) {
  const out = [];
  for (const P of api.portals(world)) {
    if (!P.link) continue;
    const la = toLocal(P, a), lb = toLocal(P, b);
    const zmin = Math.min(la[2], lb[2]) - r, zmax = Math.max(la[2], lb[2]) + r;
    if (zmax < 0 || zmin > 0) continue;
    const xmin = Math.min(la[0], lb[0]) - r, xmax = Math.max(la[0], lb[0]) + r;
    const ymin = Math.min(la[1], lb[1]) - r, ymax = Math.max(la[1], lb[1]) + r;
    if (xmax < -P.hw || xmin > P.hw || ymax < -P.hh || ymin > P.hh) continue;
    out.push(P);
  }
  return out;
}

function worldContacts(api, world, a, b, r, out, filter) {
  const mid = lerp3(a, b, 0.5), reach = len(sub(b, a)) / 2 + r + 0.5;
  for (const c of api.colliders(world, mid, reach)) {
    const k = capsuleContact(a, b, r, c);
    if (k && (!filter || filter(k))) out.push(k);
  }
  const T = api.terrain && api.terrain(world);
  if (T) {
    // the capsule's lower sphere against the height field
    const h = T.height(a[0], a[2]);
    if (a[1] - r < h + 0.001) {
      const n = T.normal(a[0], a[2]);
      const k = { n, depth: (h - (a[1] - r)) * n[1], p: [a[0], h, a[2]] };
      if (!filter || filter(k)) out.push(k);
    }
  }
}

export function gatherContacts(api, world, feet, up, body = BODY) {
  const r = body.radius;
  const a = madd(feet, up, r), b = madd(feet, up, body.height - r);
  const ports = straddled(api, world, a, b, r);
  const contacts = [];
  worldContacts(api, world, a, b, r, contacts, ports.length ? (k) => {
    for (const P of ports) { const l = toLocal(P, k.p); if (l[2] < 0 && inTube(P, l)) return false; }
    return true;
  } : null);
  for (const P of ports) {
    const D = api.resolve(P);
    if (!D) continue;
    const toD = pairXf(P, D), back = pairXf(D, P);
    const da = xpoint(toD, a), db = xpoint(toD, b);
    const local = [];
    worldContacts(api, D.world, da, db, r, local, (k) => { const l = toLocal(D, k.p); return l[2] > 0 && inTube(D, l); });
    for (const k of local) contacts.push({ n: xvec(back, k.n), depth: k.depth, p: xpoint(back, k.p), via: P.id });
  }
  return contacts;
}

// Push the capsule out of everything; returns the corrected feet position,
// the velocity with blocked components removed, and ground information.
export function resolve(api, world, feet, vel, up, body = BODY) {
  let p = feet, v = vel, ground = null, wall = null;
  for (let i = 0; i < ITER; i++) {
    const cs = gatherContacts(api, world, p, up, body);
    if (!cs.length) break;
    cs.sort((x, y) => y.depth - x.depth);
    const k = cs[0];
    p = madd(p, k.n, k.depth + 1e-5);
    const vn = dot(v, k.n);
    if (vn < 0) v = madd(v, k.n, -vn);
    const u = dot(k.n, up);
    if (u > 0.62) { if (!ground || u > dot(ground.n, up)) ground = k; }
    else if (u > -0.3) wall = k;
  }
  // a last sweep to learn about ground contact without moving
  if (!ground) {
    for (const k of gatherContacts(api, world, madd(p, up, -0.02), up, body)) if (dot(k.n, up) > 0.62) { ground = k; break; }
  }
  return { p, v, ground, wall };
}

// ── The traveller ────────────────────────────────────────────────────────────
// State: world, feet position, velocity, `up` (body axis) and `look` (camera
// orientation quaternion). Everything is in the coordinates of `world`.
export class Traveller {
  constructor(api, { world, feet, yaw = 0, up = [0, 1, 0] }) {
    this.api = api;
    this.world = world;
    this.feet = [...feet];
    this.vel = [0, 0, 0];
    this.up = norm(up);
    this.look = qnorm(qmul(qbetween([0, 1, 0], this.up), qaxis([0, 1, 0], yaw)));
    this.grounded = false;
    this.crossings = [];   // recent crossings (for UI and tests)
    this.onCross = null;
    this.body = BODY;
    this.noclip = false;
  }

  get eye() { return madd(this.feet, this.up, this.body.eye); }
  forward() { return qrot(this.look, [0, 0, -1]); }

  // Mouse look: yaw about the body axis, pitch about the camera's right axis.
  turn(dyaw, dpitch) {
    let q = qnorm(qmul(qaxis(this.up, dyaw), this.look));
    const f = qrot(q, [0, 0, -1]);
    const pitch = Math.asin(clamp(dot(f, this.up), -1, 1));
    const np = clamp(pitch + dpitch, -1.5, 1.5);
    q = qnorm(qmul(q, qaxis([1, 0, 0], np - pitch)));
    this.look = q;
  }

  // Rotate the body (and view) towards the world's gravity at our position.
  align(dt) {
    const g = this.api.gravity(this.world, this.feet);
    const target = norm(scale(g, -1));
    const c = dot(this.up, target);
    if (c > 0.99999) { this.up = target; return; }
    const full = qbetween(this.up, target);
    const ang = Math.acos(clamp(c, -1, 1));
    const step = Math.min(1, (dt * 3.2) / Math.max(ang, 1e-6) + dt * 2.5);
    const dq = qslerp([0, 0, 0, 1], full, Math.min(1, step));
    // rotate about the eye so the view pivots naturally
    const eye = this.eye;
    this.up = norm(qrot(dq, this.up));
    this.look = qnorm(qmul(dq, this.look));
    this.vel = qrot(dq, this.vel);
    this.feet = madd(eye, this.up, -this.body.eye);
  }

  // One fixed physics step. input: { forward, right, run, jump } in [-1, 1].
  step(input, dt) {
    const api = this.api, up0 = this.up;
    this.align(dt);
    const up = this.up;
    const g = api.gravity(this.world, this.feet);
    const f = qrot(this.look, [0, 0, -1]), rgt = qrot(this.look, [1, 0, 0]);
    let fw = reject(f, up); if (len(fw) < 1e-3) fw = reject(qrot(this.look, [0, 1, 0]), up);
    fw = norm(fw);
    const rt = norm(cross(fw, up));
    let wish = add(scale(fw, input.forward || 0), scale(rt, input.right || 0));
    const wl = len(wish); if (wl > 1) wish = scale(wish, 1 / wl);
    const speed = input.run ? MOVE.run : MOVE.walk;
    const target = scale(wish, speed);
    let v = this.vel;
    const vv = dot(v, up), vh = madd(v, up, -vv);
    const acc = this.grounded ? MOVE.accel : MOVE.airAccel;
    const dv = sub(target, vh), dl = len(dv), maxd = acc * dt;
    const vh2 = dl > maxd ? madd(vh, dv, maxd / dl) : target;
    v = madd(vh2, up, vv);
    if (this.noclip) { v = scale(add(scale(f, input.forward || 0), scale(rgt, input.right || 0)), speed * 2); }
    else {
      if (this.grounded && input.jump) { v = madd(v, up, MOVE.jump - Math.max(0, dot(v, up))); this.grounded = false; this.jumped = true; }
      v = madd(v, g, dt);
      const fall = dot(v, up); if (fall < -MOVE.maxFall) v = madd(v, up, -MOVE.maxFall - fall);
    }
    // Substep fast motion so a body never moves more than 0.15 m per collision pass.
    const n = Math.min(64, Math.max(1, Math.ceil(len(v) * dt / 0.15)));
    for (let i = 0; i < n; i++) {
      const w0 = this.world;
      this.moveBy(scale(v, dt / n), v, dt / n);
      v = this.vel;
      if (this.world !== w0 && i < n - 1) v = this.vel; // already transformed by the crossing
    }
    void up0;
  }

  moveBy(delta, v, dt) {
    const api = this.api, up = this.up, wasGrounded = this.grounded;
    const eye0 = this.eye;
    let p = add(this.feet, delta);
    let res = this.noclip ? { p, v, ground: null, wall: null } : resolve(api, this.world, p, v, up, this.body);
    // Step up onto ledges no higher than BODY.step when walking into them.
    if (!this.noclip && wasGrounded && res.wall) {
      const h = reject(delta, up);
      if (len(h) > 1e-5) {
        const lifted = resolve(api, this.world, add(madd(this.feet, up, this.body.step), h), v, up, this.body);
        const dropped = resolve(api, this.world, madd(lifted.p, up, -this.body.step), lifted.v, up, this.body);
        const gain = (q) => dot(sub(q, this.feet), norm(h));
        if (dropped.ground && gain(dropped.p) > gain(res.p) + 1e-4 && dot(sub(dropped.p, this.feet), up) <= this.body.step + 0.01) res = dropped;
      }
    }
    // Stay glued to the ground walking down steps and slopes.
    if (!this.noclip && wasGrounded && !res.ground && !this.jumped && dot(res.v, up) <= 0.5) {
      const probe = resolve(api, this.world, madd(res.p, up, -this.body.step * 0.9), res.v, up, this.body);
      if (probe.ground) res = probe;
    }
    this.jumped = false;
    this.grounded = !!res.ground;
    let vel = res.v;
    if (this.grounded && dot(vel, up) < 0) vel = madd(vel, up, -dot(vel, up));
    // Cross portals along the eye's path.
    const eye1 = madd(res.p, up, this.body.eye);
    const go = advance(this.world, eye0, eye1, api);
    if (go.crossings.length) {
      const R = go.xf;
      this.world = go.world;
      this.up = norm(xvec(R, up));
      this.look = qnorm(qmul(R.q, this.look));
      this.vel = xvec(R, vel);
      this.feet = madd(go.p, this.up, -this.body.eye);
      for (const c of go.crossings) { this.crossings.push(c); this.onCross?.(c, R); }
      if (this.crossings.length > 64) this.crossings.splice(0, this.crossings.length - 64);
    } else {
      this.feet = res.p;
      this.vel = vel;
    }
    // Falling out of a world: back to the last safe ground.
    const kill = api.killHeight?.(this.world);
    if (kill !== undefined && kill !== null && this.feet[1] < kill) this.onFall?.();
    if (this.grounded) this.safe = { world: this.world, feet: [...this.feet], look: [...this.look], up: [...this.up] };
  }

  // Camera pose for rendering (in the coordinates of this.world).
  pose() { return { world: this.world, p: this.eye, q: this.look }; }
}
