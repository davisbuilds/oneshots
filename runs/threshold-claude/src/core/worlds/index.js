// describe(key): the world descriptor for any address in the multiverse.
// Deterministic for (key, universe); nothing is stored.
import { parseKey, archetypeOf, latticeLinks, worldSeed, worldName, UNIVERSE } from '../multiverse.js';
import { protoWorld } from '../proto.js';
import { hub } from './hub.js';
import { dunes } from './dunes.js';
import { forest } from './forest.js';
import { glacier } from './glacier.js';
import { hallPocket, mirrorPocket, tiltPocket } from './pockets.js';
import { islands } from './islands.js';
import { ruins } from './ruins.js';
import { cavern } from './cavern.js';
import { monolith } from './monolith.js';
import { abstract } from './abstract.js';

export const GENERATORS = { hub, dunes, forest, glacier, islands, ruins, cavern, monolith, abstract };
export const POCKETS = { hall: hallPocket, mirror: mirrorPocket, tilt: tiltPocket };

export function describe(key, universe = UNIVERSE) {
  if (key.startsWith('proto:')) return protoWorld(key);
  const { i, j, pocket } = parseKey(key);
  if (!Number.isInteger(i) || !Number.isInteger(j)) return null;
  const ctx = { key, i, j, pocket, universe, seed: worldSeed(key, universe), name: worldName(key, universe) };
  if (pocket) {
    const g = POCKETS[pocket];
    if (!g || `${i},${j}` !== { hall: '0,0', mirror: '3,0', tilt: '1,0' }[pocket]) return null;
    return g({ ...ctx, archetype: 'pocket', links: [] });
  }
  ctx.archetype = archetypeOf(i, j, universe);
  ctx.links = latticeLinks(i, j, universe);
  const desc = GENERATORS[ctx.archetype](ctx);
  desc.universe = universe;
  return desc;
}
