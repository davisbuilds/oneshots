// Placeholder until the ruins generator is written: a variant of an existing archetype.
import { dunes } from './dunes.js';
import { forest } from './forest.js';
import { glacier } from './glacier.js';
export function ruins(ctx) {
  const g = { islands: forest, ruins: dunes, cavern: forest, monolith: glacier, abstract: glacier }['ruins'];
  const d = g(ctx);
  d.archetype = 'ruins';
  return d;
}
