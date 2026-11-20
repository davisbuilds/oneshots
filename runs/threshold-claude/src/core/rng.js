// Deterministic hashing, random streams and noise. Integer hashing only
// (Math.imul), so every platform derives the same decisions from a seed.

export function mix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
// Hash any number of 32-bit integers.
export function hash32(...xs) {
  let h = 0x9e3779b9;
  for (const x of xs) h = mix32((h ^ (x | 0)) + 0x632be5ab + (h << 6) + (h >>> 2));
  return h >>> 0;
}
export function hstr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return mix32(h >>> 0);
}
export const unit = (h) => (h >>> 8) / 16777216;    // [0, 1)
export const hash01 = (...xs) => unit(hash32(...xs));

// A seeded stream (mulberry32).
export function rng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (n) => Math.floor(next() * n),
    pick: (a) => a[Math.floor(next() * a.length)],
    chance: (p) => next() < p,
    gauss: () => { let u = 0, v = 0; while (u === 0) u = next(); v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    fork: (k) => rng(hash32(s, k)),
  };
}

// ── Gradient noise (2D), hashed lattice gradients, quintic fade ─────────────
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(ix, iz, seed, x, z) {
  const h = hash32(ix, iz, seed) & 15;
  const a = (h / 16) * Math.PI * 2;
  return Math.cos(a) * x + Math.sin(a) * z;
}
export function noise2(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fade(fx), v = fade(fz);
  const n00 = grad(ix, iz, seed, fx, fz), n10 = grad(ix + 1, iz, seed, fx - 1, fz);
  const n01 = grad(ix, iz + 1, seed, fx, fz - 1), n11 = grad(ix + 1, iz + 1, seed, fx - 1, fz - 1);
  return 1.414 * ((n00 + (n10 - n00) * u) + ((n01 + (n11 - n01) * u) - (n00 + (n10 - n00) * u)) * v); // ~[-1, 1]
}
export function fbm2(x, z, seed = 0, oct = 5, lac = 2.0, gain = 0.5) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, z * f, seed + i * 101); n += a; a *= gain; f *= lac; }
  return s / n;
}
export function ridged2(x, z, seed = 0, oct = 5, lac = 2.0, gain = 0.5) {
  let s = 0, a = 1, f = 1, n = 0, w = 1;
  for (let i = 0; i < oct; i++) {
    let r = 1 - Math.abs(noise2(x * f, z * f, seed + i * 131));
    r *= r; r *= w; w = Math.min(1, r * 2);
    s += a * r; n += a; a *= gain; f *= lac;
  }
  return s / n; // [0, 1]
}
// Value in [0,1) per integer cell, for placements.
export const cellRand = (ix, iz, seed, k = 0) => hash01(ix, iz, seed, k);
