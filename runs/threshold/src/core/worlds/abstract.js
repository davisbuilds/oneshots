// Placeholder until the abstract generator is written: a variant of an existing archetype.
import { dunes } from './dunes.js';
import { forest } from './forest.js';
import { glacier } from './glacier.js';
export function abstract(ctx) {
  const g = { islands: forest, ruins: dunes, cavern: forest, monolith: glacier, abstract: glacier }['abstract'];
  const d = g(ctx);
  d.archetype = 'abstract';
  return d;
}
