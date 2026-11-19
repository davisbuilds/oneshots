// Placeholder until the monolith generator is written: a variant of an existing archetype.
import { dunes } from './dunes.js';
import { forest } from './forest.js';
import { glacier } from './glacier.js';
export function monolith(ctx) {
  const g = { islands: forest, ruins: dunes, cavern: forest, monolith: glacier, abstract: glacier }['monolith'];
  const d = g(ctx);
  d.archetype = 'monolith';
  return d;
}
