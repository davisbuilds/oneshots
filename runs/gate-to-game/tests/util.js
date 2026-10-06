'use strict';
// Small deterministic PRNG so failures reproduce.
function rng(seed = 1) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
const randBits = (r, w) => Math.floor(r() * 2 ** w) >>> 0;
module.exports = { rng, randBits };
