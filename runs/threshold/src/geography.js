// Integer layout and lattice noise keep spatial samples independent of load order.
export function hash(text) {
  let h = 2166136261;
  for (const char of String(text)) {
    h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  }
  return h >>> 0;
}
export function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
function lattice(x, z, s) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + s;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, z, s) {
  const a = Math.floor(x),
    b = Math.floor(z),
    u = smooth(x - a),
    v = smooth(z - b);
  const top = lattice(a, b, s) * (1 - u) + lattice(a + 1, b, s) * u;
  return top * (1 - v) + (lattice(a, b + 1, s) * (1 - u) + lattice(a + 1, b + 1, s) * u) * v;
}
export function ground(info, x, z) {
  if (info.biome === 'ocean' || info.biome === 'archive') return 0;
  // Flat aprons at every mouth share the same datum on both sides.
  let apron = 1;
  for (const g of info.gates)
    apron = Math.min(apron, smooth((Math.hypot(x - g.origin.x, z - g.origin.z) - 6) / 11));
  const n = noise(x * 0.035, z * 0.035, info.seed),
    wide = noise(x * 0.014, z * 0.014, info.seed + 9);
  const ridge = Math.sin(z * 0.073 + x * 0.115 + 3.2 * wide);
  const h =
    info.biome === 'desert'
      ? (ridge * 0.5 + 0.5) ** 2 * (3.6 + 5 * wide) + 2 * n - 1.8
      : info.biome === 'forest'
        ? (wide - 0.5) * 6 + (n - 0.5) * 2.2
        : (n - 0.45) * 5 + (wide - 0.48) * 8;
  if (info.biome === 'desert') {
    const u = Math.max(0, Math.min(1, (14 - z) / 29)),
      trail = -3.6 * u + 1.3 * Math.sin(u * 6.283);
    const valley = 0.16 + 0.84 * smooth((Math.abs(x - trail) - 1.8) / 8);
    return h * apron * valley;
  }
  return h * apron;
}
