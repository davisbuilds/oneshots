// Placeholder until the islands generator is written: a variant of an existing archetype.
import { dunes } from './dunes.js';
import { forest } from './forest.js';
import { glacier } from './glacier.js';
export function islands(ctx) {
  const g = { islands: forest, ruins: dunes, cavern: forest, monolith: glacier, abstract: glacier }['islands'];
  const d = g(ctx);
  d.archetype = 'islands';
  return d;
}
