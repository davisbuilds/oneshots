// Small, dependency-free vector, quaternion and rigid-transform math for the
// engine's core (portal transforms, traversal, physics, generation). The
// renderer converts these to three.js objects; the core never imports three,
// so it runs unchanged under Node's test runner.
//
// Conventions: right-handed, +Y up, cameras look down -Z (as in three.js).
// Vectors are [x, y, z]; quaternions are [x, y, z, w]; a rigid transform is
// { p: [x, y, z], q: [x, y, z, w] } mapping local -> parent: p + q * v.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export function norm(a) { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; }
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;

// Remove the component of v along unit n.
export const reject = (v, n) => madd(v, n, -dot(v, n));

// ── Quaternions ───────────────────────────────────────────────────────────
export const QI = Object.freeze([0, 0, 0, 1]);

export function qmul(a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
export const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
export function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  // Canonical sign (w >= 0) keeps comparisons and hashing stable.
  const s = q[3] < 0 ? -1 / l : 1 / l;
  return [q[0] * s, q[1] * s, q[2] * s, q[3] * s];
}
export function qaxis(axis, angle) {
  const n = norm(axis), s = Math.sin(angle / 2);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
}
// Rotate vector v by unit quaternion q.
export function qrot(q, v) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}
// Rotation whose local axes map to the given orthonormal world axes.
export function qfromBasis(xa, ya, za) {
  const m00 = xa[0], m10 = xa[1], m20 = xa[2];
  const m01 = ya[0], m11 = ya[1], m21 = ya[2];
  const m02 = za[0], m12 = za[1], m22 = za[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return qnorm(q);
}
// Rotation that looks along `forward` (-Z maps to forward) with `up` as near +Y.
export function qlook(forward, up = [0, 1, 0]) {
  const z = norm(scale(forward, -1));
  let x = cross(up, z);
  if (len(x) < 1e-6) x = cross([1, 0, 0], z);
  x = norm(x);
  const y = cross(z, x);
  return qfromBasis(x, y, z);
}
// Shortest rotation taking unit vector a to unit vector b.
export function qbetween(a, b) {
  const d = dot(a, b);
  if (d < -0.999999) {
    let axis = cross([1, 0, 0], a);
    if (len(axis) < 1e-6) axis = cross([0, 1, 0], a);
    return qaxis(axis, Math.PI);
  }
  const c = cross(a, b);
  return qnorm([c[0], c[1], c[2], 1 + d]);
}
export function qslerp(a, b, t) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (cos > 0.9995) return qnorm([a[0] + (bx - a[0]) * t, a[1] + (by - a[1]) * t, a[2] + (bz - a[2]) * t, a[3] + (bw - a[3]) * t]);
  const th = Math.acos(cos), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return qnorm([a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb]);
}
// Angle in radians between two rotations.
export function qangle(a, b) {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}

// ── Rigid transforms ──────────────────────────────────────────────────────
export const XI = Object.freeze({ p: Object.freeze([0, 0, 0]), q: QI });
export const xf = (p = [0, 0, 0], q = QI) => ({ p: [p[0], p[1], p[2]], q: qnorm(q) });
// (a ∘ b)(v) = a(b(v))
export const xmul = (a, b) => ({ p: add(a.p, qrot(a.q, b.p)), q: qnorm(qmul(a.q, b.q)) });
export function xinv(a) { const qi = qconj(a.q); return { p: scale(qrot(qi, a.p), -1), q: qnorm(qi) }; }
export const xpoint = (a, v) => add(a.p, qrot(a.q, v));
export const xvec = (a, v) => qrot(a.q, v);
// Yaw about +Y, as used for most placed objects.
export const xyaw = (p, yaw) => xf(p, qaxis([0, 1, 0], yaw));

// Column-major 4x4 matrix (three.js Matrix4.elements order).
export function xmat4(a, out = new Array(16)) {
  const [x, y, z, w] = a.q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  out[0] = 1 - (yy + zz); out[1] = xy + wz; out[2] = xz - wy; out[3] = 0;
  out[4] = xy - wz; out[5] = 1 - (xx + zz); out[6] = yz + wx; out[7] = 0;
  out[8] = xz + wy; out[9] = yz - wx; out[10] = 1 - (xx + yy); out[11] = 0;
  out[12] = a.p[0]; out[13] = a.p[1]; out[14] = a.p[2]; out[15] = 1;
  return out;
}
export const xaxes = (a) => [qrot(a.q, [1, 0, 0]), qrot(a.q, [0, 1, 0]), qrot(a.q, [0, 0, 1])];
