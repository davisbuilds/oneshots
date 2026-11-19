// Placeholder until the cavern generator is written: a variant of an existing archetype.
import { dunes } from './dunes.js';
import { forest } from './forest.js';
import { glacier } from './glacier.js';
export function cavern(ctx) {
  const g = { islands: forest, ruins: dunes, cavern: forest, monolith: glacier, abstract: glacier }['cavern'];
  const d = g(ctx);
  d.archetype = 'cavern';
  return d;
}
