// The multiverse's address space and portal graph.
//
// Worlds live on an unbounded integer lattice. The world at (i, j) has the key
// "i,j". Every lattice edge that exists is one portal pair:
//
//   E/W  between (i, j) and (i+1, j)  always present (so every world has a way on)
//   N/S  between (i, j) and (i, j+1)  present when hash(i, j) says so (~42%)
//   Lk/lk long links (wormholes) from (i, j) to (i, j) + OFFSET[k], ~7% each
//
// An edge is decided by a hash of *one* canonical endpoint, so both ends agree
// without either storing anything, and the slot names pair up (E<->W, N<->S,
// Lk<->lk). Pocket worlds ("i,j/name") hang off a host world for impossible
// architecture; their links are declared by the host's archetype.
//
// The graph is infinite, deterministic for a universe seed, and every link is
// reversible by construction. Local: a world's links need only hashes of
// itself and its few possible neighbours.
import { hash32, hstr, hash01, rng } from './rng.js';

export const UNIVERSE = 0x54485253; // 'THRS'
export const LONG = [[5, 2], [-3, 4], [4, -5], [-6, -1]];
export const ORIGIN = '0,0';

export const key = (i, j) => `${i},${j}`;
export function parseKey(k) {
  const [lat, pocket] = k.split('/');
  const [i, j] = lat.split(',').map(Number);
  return { i, j, lattice: key(i, j), pocket: pocket || null };
}

// Hand-placed links near the origin (the opening path). true/false forces an
// edge; undefined defers to the hash.
const FORCED_NS = new Map([
  ['0,0', false], ['0,-1', false], ['1,0', true], ['1,-1', false],
  ['2,0', false], ['2,-1', true], ['3,0', false], ['3,-1', false],
]);
const CURATED = new Map([['0,0', 'hub'], ['1,0', 'dunes'], ['2,0', 'forest'], ['3,0', 'glacier']]);
const curatedCell = (i, j) => j === 0 && i >= 0 && i <= 3;

export function hasNS(i, j, universe = UNIVERSE) {
  const f = FORCED_NS.get(key(i, j));
  if (f !== undefined) return f;
  return hash01(i, j, universe, 0x5151) < 0.42;
}
export function hasLong(i, j, k, universe = UNIVERSE) {
  const [dx, dz] = LONG[k];
  if (curatedCell(i, j) || curatedCell(i + dx, j + dz)) return false;
  return hash01(i, j, universe, 0x700 + k) < 0.07;
}

// Lattice links of world (i, j): [{ slot, to: { world, slot }, edge }].
export function latticeLinks(i, j, universe = UNIVERSE) {
  const out = [
    { slot: 'E', to: { world: key(i + 1, j), slot: 'W' }, edge: `x:${i},${j}` },
    { slot: 'W', to: { world: key(i - 1, j), slot: 'E' }, edge: `x:${i - 1},${j}` },
  ];
  if (hasNS(i, j, universe)) out.push({ slot: 'N', to: { world: key(i, j + 1), slot: 'S' }, edge: `z:${i},${j}` });
  if (hasNS(i, j - 1, universe)) out.push({ slot: 'S', to: { world: key(i, j - 1), slot: 'N' }, edge: `z:${i},${j - 1}` });
  for (let k = 0; k < LONG.length; k++) {
    const [dx, dz] = LONG[k];
    if (hasLong(i, j, k, universe)) out.push({ slot: 'L' + k, to: { world: key(i + dx, j + dz), slot: 'l' + k }, edge: `L${k}:${i},${j}` });
    if (hasLong(i - dx, j - dz, k, universe)) out.push({ slot: 'l' + k, to: { world: key(i - dx, j - dz), slot: 'L' + k }, edge: `L${k}:${i - dx},${j - dz}` });
  }
  return out;
}

export const ARCHETYPES = ['dunes', 'forest', 'glacier', 'islands', 'ruins', 'cavern', 'monolith', 'abstract'];
const WEIGHTS = [1.0, 1.1, 0.9, 1.0, 1.1, 0.8, 0.8, 0.7];
function baseArchetype(i, j, universe) {
  const u = hash01(i, j, universe, 0xa7c4) * WEIGHTS.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let k = 0; k < ARCHETYPES.length; k++) { acc += WEIGHTS[k]; if (u < acc) return k; }
  return ARCHETYPES.length - 1;
}
// Neighbours along E/W differ from each other's *base* choice, so a doorway
// usually shows a contrasting world.
export function archetypeOf(i, j, universe = UNIVERSE) {
  const c = CURATED.get(key(i, j));
  if (c) return c;
  let a = baseArchetype(i, j, universe);
  if (a === baseArchetype(i - 1, j, universe)) a = (a + 1 + (hash32(i, j, universe, 9) % (ARCHETYPES.length - 1))) % ARCHETYPES.length;
  return ARCHETYPES[a];
}

export const worldSeed = (k, universe = UNIVERSE) => hash32(hstr(k), universe);

// Pair-level properties (size and frame style) shared by both ends of a link.
const STYLES = ['monolith', 'gate', 'arch', 'slab'];
export function edgeProps(edge, universe = UNIVERSE) {
  if (edge === 'x:0,0') return { style: 'monolith', hw: 6.0, hh: 16.0, great: true };
  const r = rng(hash32(hstr(edge), universe));
  const style = STYLES[r.int(STYLES.length)];
  const hw = 1.4 + r.next() * 1.3;
  const hh = Math.max(hw * 1.35, 2.2 + r.next() * 1.8);
  return { style, hw, hh };
}

// Names: syllables chosen by seed, with an archetype epithet.
const PRE = ['Ash', 'Vel', 'Or', 'Cael', 'Mor', 'Sel', 'Ith', 'Nar', 'Ul', 'Ver', 'Tha', 'Ky', 'Eld', 'Sor', 'Lum', 'Hal', 'Ser', 'Quel', 'Ond', 'Rhe', 'Ise', 'Zar', 'Ama', 'Bel'];
const MID = ['', '', 'a', 'e', 'i', 'o', 'ae', 'y', 'an', 'or', 'il'];
const SUF = ['mere', 'lune', 'thal', 'dor', 'wyn', 'ra', 'sis', 'veil', 'holm', 'reach', 'gard', 'mire', 'cairn', 'fell', 'vane', 'ost', 'ane', 'is'];
export function worldName(k, universe = UNIVERSE) {
  const r = rng(hash32(hstr(k), universe, 0x4e41));
  let n = r.pick(PRE) + r.pick(MID) + r.pick(SUF);
  n = n.replace(/([aeiouy])\1+/g, '$1').replace(/^(.)(.*)$/, (m, a, b) => a + b.toLowerCase());
  return n;
}
