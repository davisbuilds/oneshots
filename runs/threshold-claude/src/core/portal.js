// Portal geometry and traversal: the engine's spatial contract.
//
// A portal is a rectangle in one world. In its local frame the opening is
// centred at the origin, spans |x| <= hw and |y| <= hh, and its front face
// looks along +Z. Two portals A (world X) and B (world Y) are linked: the
// region in front of A continues as the region in front of B, rotated half a
// turn about the shared vertical axis, so entering A's front face means
// leaving B's front face:
//
//     M_AB = B.xf ∘ FLIP ∘ A.xf⁻¹        FLIP: (x, y, z) -> (-x, y, -z)
//
// M_AB maps world-X coordinates to world-Y coordinates. M_BA = M_AB⁻¹ because
// FLIP is its own inverse, so every link is reversible by construction.
//
// Crossing rule (half-open, so a traveller can never be on both sides):
// front means local z >= 0 and back means z < 0. A motion segment crosses A
// when it starts in front, ends behind, and meets the plane inside the
// rectangle. The mapped end point then has z_B = -z_A > 0: strictly in front
// of B, so the exit portal cannot immediately re-trigger.
import { xf, xmul, xinv, xpoint, xvec, lerp3, madd, dot, sub, add, scale, len, norm, qrot } from './math.js';

export const FLIP = Object.freeze({ p: [0, 0, 0], q: [0, 1, 0, 0] });
export const EXIT_EPS = 1e-6;      // metres; separation from the exit plane after a crossing
export const MAX_CROSSINGS = 8;    // per motion segment; back-to-back chains stop here

export function makePortal({ world, slot, p, q, hw, hh, link = null, ...rest }) {
  const t = xf(p, q);
  const inv = xinv(t);
  const n = qrot(t.q, [0, 0, 1]);
  return {
    id: `${world}#${slot}`, world, slot, xf: t, inv, n,
    d: -dot(n, t.p),               // plane: dot(n, x) + d = 0
    hw, hh, link, ...rest,
  };
}

// Transform taking coordinates in a.world to coordinates in b.world.
export const pairXf = (a, b) => xmul(b.xf, xmul(FLIP, a.inv));

export const toLocal = (P, v) => xpoint(P.inv, v);
export const signedDistance = (P, v) => dot(P.n, v) + P.d;

export function corners(P, pad = 0) {
  const w = P.hw + pad, h = P.hh + pad;
  return [[-w, -h, 0], [w, -h, 0], [w, h, 0], [-w, h, 0]].map((c) => xpoint(P.xf, c));
}

// Does the segment p0 -> p1 pass through P's opening from front to back?
// Returns { t, x, y } (fraction along the segment, local hit) or null.
export function segmentCrossing(P, p0, p1) {
  const a = toLocal(P, p0), b = toLocal(P, p1);
  if (!(a[2] >= 0 && b[2] < 0)) return null;
  const t = a[2] / (a[2] - b[2]);
  const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
  if (Math.abs(x) > P.hw || Math.abs(y) > P.hh) return null;
  return { t, x, y };
}

// Move a point along p0 -> p1 starting in world `world`, passing through any
// portals on the way. `api.portals(world)` lists a world's portals and
// `api.resolve(P)` returns the linked portal record (or null if unlinked; an
// unlinked portal is not a crossing). Returns the final world, the final
// position, the accumulated transform (apply it to orientation and velocity)
// and the crossings made, in order.
export function advance(world, p0, p1, api) {
  let w = world, a = p0, b = p1, acc = { p: [0, 0, 0], q: [0, 0, 0, 1] };
  const crossings = [];
  for (let i = 0; i < MAX_CROSSINGS; i++) {
    let best = null;
    for (const P of api.portals(w)) {
      if (!P.link) continue;
      const c = segmentCrossing(P, a, b);
      if (c && (!best || c.t < best.c.t)) best = { P, c };
    }
    if (!best) break;
    const dest = api.resolve(best.P);
    if (!dest) break;
    const M = pairXf(best.P, dest);
    const hit = lerp3(a, b, best.c.t);
    // Start the remainder just in front of the exit plane: strictly in front
    // of the exit portal and strictly behind any coplanar back-to-back twin.
    a = madd(xpoint(M, hit), dest.n, EXIT_EPS);
    b = madd(xpoint(M, b), dest.n, EXIT_EPS);
    acc = xmul(M, acc);
    crossings.push({ from: best.P.id, to: dest.id, t: best.c.t, x: best.c.x, y: best.c.y });
    w = dest.world;
  }
  return { world: w, p: b, xf: acc, crossings };
}

// Cast a ray through portals. `api.hit(world, o, d, maxT)` returns the
// nearest geometry hit { t, ... } or null. Returns the hit with the world it
// is in and the ray's path, or null.
export function castRay(world, o, d, maxT, api, maxPortals = 6) {
  let w = world, origin = o, dir = norm(d), remaining = maxT, travelled = 0;
  const path = [{ world: w, o: origin, d: dir }];
  for (let k = 0; k <= maxPortals; k++) {
    const g = api.hit(w, origin, dir, remaining);
    let best = null;
    if (k < maxPortals) {
      const end = madd(origin, dir, g ? g.t : remaining);
      for (const P of api.portals(w)) {
        if (!P.link) continue;
        const c = segmentCrossing(P, origin, end);
        if (c && (!best || c.t < best.c.t)) best = { P, c };
      }
    }
    if (!best) return g ? { ...g, world: w, t: travelled + g.t, local: g.t, path } : null;
    const dest = api.resolve(best.P);
    if (!dest) return g ? { ...g, world: w, t: travelled + g.t, local: g.t, path } : null;
    const segLen = (g ? g.t : remaining) * best.c.t;
    const M = pairXf(best.P, dest);
    origin = madd(xpoint(M, madd(origin, dir, segLen)), dest.n, EXIT_EPS);
    dir = norm(xvec(M, dir));
    travelled += segLen; remaining -= segLen; w = dest.world;
    path.push({ world: w, o: origin, d: dir, via: best.P.id });
  }
  return null;
}

// Sutherland–Hodgman clip of a convex polygon to the half-space dot(n,x)+d >= 0.
export function clipPolygon(points, n, d) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = dot(n, a) + d, db = dot(n, b) + d;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) out.push(lerp3(a, b, da / (da - db)));
  }
  return out;
}

// Is the camera close enough to P's plane, inside the opening's tube, that
// the near clipping plane could cut the portal surface? The renderer then
// draws the portal as a shallow box reaching towards the camera.
export function cameraInNearZone(P, eye, depth, pad = 0) {
  const l = toLocal(P, eye);
  return l[2] >= 0 && l[2] < depth && Math.abs(l[0]) < P.hw + pad && Math.abs(l[1]) < P.hh + pad;
}

export { sub, add, scale, len };
