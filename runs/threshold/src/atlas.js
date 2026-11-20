import { doorway } from './spatial.js';
import { hash, random } from './geography.js';

const provinces = ['ocean', 'desert', 'forest', 'ice', 'archive'];
export const field = {
  ocean: [
    'Pelagic Causeway',
    'Pelagic waters',
    'The tide here rises on both sides of the horizon.',
    'Tide dial',
  ],
  desert: [
    'The Saffron Sea',
    'Aeolian basin',
    'Three moons hang over an instrument too large for any hand.',
    'Meridian bell',
  ],
  forest: [
    'Vesper Canopy',
    'Noctilucent forest',
    'Beneath the caps, falling spores drift toward the light.',
    'Spore lantern',
  ],
  ice: [
    'The Glass Meridian',
    'Glacial shelf',
    'A broken choir of ice still holds a single note.',
    'Ice harmonic',
  ],
  archive: [
    'The Folded Archive',
    'Recursive chamber',
    'The west aisle returns to itself. Two doors share the north wall.',
    'Echo register',
  ],
};
const opening = { 1: 'ocean', 2: 'desert', 3: 'archive', 4: 'forest', 8: 'ice', 16: 'archive' };
const prefixes = [
  'Quiet',
  'Ashen',
  'Gilded',
  'Hollow',
  'Singing',
  'Pale',
  'Distant',
  'Umber',
  'Silver',
  'Amber',
  'Sleeping',
  'Western',
];
const placeNames = {
  ocean: ['Shoals', 'Strait', 'Sound'],
  desert: ['Erg', 'Basin', 'Sands'],
  forest: ['Grove', 'Underwood', 'Canopy'],
  ice: ['Shelf', 'Spire', 'Glacier'],
  archive: ['Gallery', 'Vault', 'Cloister'],
};
export function describe(id) {
  const n = BigInt(id);
  if (n < 1n || String(n) !== id) throw Error('Invalid atlas address');
  const seed = hash(id),
    rng = random(seed);
  const biome = opening[id] || provinces[Math.floor(rng() * provinces.length)];
  const title = opening[id]
    ? field[biome][0]
    : prefixes[Math.floor(rng() * prefixes.length)] + ' ' + placeNames[biome][Math.floor(rng() * 3)];
  const gates = [];
  function gate(key, x, z, yaw, to, mate) {
    gates.push(Object.assign(doorway(key, x, z, yaw), { to: String(to), mate }));
  }
  if (n > 1n) gate('back', 0, 14, Math.PI, n / 2n, n % 2n ? 'fork' : 'front');
  const offset = { ocean: 0, desert: -3.6, forest: 2.8, ice: -2.4, archive: 2.4 }[biome];
  const angle = opening[id] || biome === 'archive' || biome === 'ocean' ? 0 : (rng() - 0.5) * 1.25;
  gate('front', offset, biome === 'ocean' ? 0 : biome === 'archive' ? -22 : -15, angle, n * 2n, 'back');
  if (biome === 'archive') gate('fork', 12.7, -22, 0, n * 2n + 1n, 'back');
  else
    gate(
      'fork',
      biome === 'ocean' ? 15.7 : 17,
      biome === 'ocean' ? 8 : 2,
      -Math.PI / 2,
      n * 2n + 1n,
      'back'
    );
  if (biome === 'archive') {
    gate('verso', -9.4, -22, 0, n, 'recto');
    gate('recto', -9.4, 22, Math.PI, n, 'verso');
  }
  const beacon = biome === 'ocean' ? [3.8, 9.8] : biome === 'archive' ? [5.6, 4] : [5.8, 5.4];
  return { id, seed, biome, title, gates, beacon, barriers: [] };
}
