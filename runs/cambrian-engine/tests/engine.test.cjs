'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {World, GENES, traits} = require('../engine.js');

function genome(overrides = {}) {
  return GENES.map((name) => overrides[name] ?? 0.5);
}

function livingState(world) {
  return world.organisms.map(({id, parentId, x, y, energy, genome}) => [id, parentId, x, y, energy, genome]);
}

test('seeded worlds replay across batches and environment changes', () => {
  const a = new World({seed: 'ledger', environment: 'amber'});
  const b = new World({seed: 'ledger', environment: 'amber'});
  assert.equal(a.organisms.length, 96);
  assert.equal(new Set(a.organisms.map((organism) => organism.genome.join())).size, 96);
  a.step(20);
  for (let i = 0; i < 20; i++) b.step();
  const previousBiomass = a.budget();
  const previousState = livingState(a);
  a.action('jade');
  b.action('jade');
  assert.deepEqual(a.budget(), previousBiomass);
  assert.deepEqual(livingState(a), previousState);
  a.step(60);
  for (let i = 0; i < 60; i++) b.step();
  assert.deepEqual(livingState(a), livingState(b));
  assert.deepEqual(a.budget(), b.budget());
  assert.deepEqual(a.events, b.events);
  assert.notDeepEqual(livingState(a), livingState(new World({seed: 'second'}).step(80)));
});

test('redistribution, death and resource renewal close the energy ledger', () => {
  const world = new World({seed: 'ledger'});
  const start = world.budget();
  world.step(700);
  const end = world.budget();
  const summary = world.summary();
  assert.ok(summary.births > 0 && summary.deaths > 0, 'births and deaths must actually run');
  assert.ok(summary.diet.jade > 0 && summary.diet.amber > 0, 'both substrates must be grazed');
  assert.ok(end.regenerated > 0 && end.burned > 0 && end.spoiled > 0);
  assert.ok(Math.abs(end.balance) < 0.00001, JSON.stringify(end));
  const remaining = world.organisms.reduce((sum, organism) => sum + organism.energy, 0);
  const substrate = [...world.jade, ...world.amber].reduce((sum, energy) => sum + energy, 0);
  assert.ok(Math.abs(start.initial + end.regenerated - end.burned - end.spoiled - remaining - substrate) < 0.00001);
  assert.equal(world.organisms.length + summary.deaths, summary.initialPopulation + summary.births);
});

test('cloning copies a genome, while mutation creates heritable differences and branches', () => {
  const founder = genome({gut: 0.1, jaw: 0.2, fertility: 0.9});
  const clones = new World({seed: 79, mutation: false, founders: Array(24).fill(founder)});
  clones.step(300);
  const clone = clones.organisms.find((organism) => organism.generation > 0);
  assert.ok(clone, 'clones must have actual descendants');
  assert.deepEqual(clone.genome, founder);
  assert.notEqual(clone.genome, founder);
  assert.equal(clones.lineages.length, 24);

  const variants = new World({seed: 79, mutation: 2, founders: Array(24).fill(founder)});
  variants.step(850);
  const daughterLineages = variants.lineages.filter(({parentId}) => parentId !== null);
  assert.ok(daughterLineages.length > 0, 'no daughter lineage appeared');
  for (const lineage of daughterLineages) {
    const [child, parent] = variants.ancestry(lineage.founderId, 2);
    assert.equal(child.lineage, lineage.id);
    assert.equal(child.birth, lineage.origin);
    assert.equal(parent.lineage, lineage.parentId);
    assert.ok(parent.birth < lineage.origin);
  }
  for (const lineage of variants.lineages) {
    const directMembers = variants.organisms.filter((organism) => organism.lineage === lineage.id).length;
    assert.equal(lineage.living, directMembers);
    assert.equal(lineage.extinct === null, directMembers > 0);
  }
  const variant = variants.organisms.find((organism) => organism.generation > 1);
  assert.ok(variant);
  assert.notDeepEqual(variant.genome, founder);
  assert.ok(variant.genome.every((locus) => locus >= 0 && locus <= 1));
  const pedigree = variants.ancestry(variant.id, 100);
  assert.equal(pedigree.length, variant.generation + 1);
  assert.equal(pedigree[0].id, variant.id);
  for (let i = 0; i < pedigree.length - 1; i++) {
    assert.equal(pedigree[i].parentId, pedigree[i + 1].id);
    assert.equal(pedigree[i].generation - 1, pedigree[i + 1].generation);
  }
  assert.equal(pedigree.at(-1).parentId, null);
  assert.deepEqual(founder, genome({gut: 0.1, jaw: 0.2, fertility: 0.9}));
});

test('contact feeding reaches across the torus and records lineage extinction', () => {
  const hunter = genome({jaw: 1, pursuit: 1, graspBias: 1, graspNeighbor: 1, graspHunger: 1, size: 0.95, armor: 1, turning: 0.1, throttle: 0});
  const grazer = genome({jaw: 0, pursuit: 0, size: 0.1, armor: 0, turning: 0.1, throttle: 0});
  const world = new World({seed: 20, founders: [hunter, grazer], mutation: 0});
  const [predator, prey] = world.organisms;
  predator.x = world.width - 1;
  predator.y = 20;
  predator.angle = 0;
  prey.x = 1;
  prey.y = 20;
  prey.angle = Math.PI / 2;
  prey.energy = 1;
  world.step();
  assert.ok(world.summary().diet.prey > 0);
  assert.equal(world.organisms.length, 1);
  assert.equal(world.organisms[0].id, predator.id);
  assert.equal(world.lineages[1].extinct, world.tick);
  assert.equal(world.lineages[1].living, 0);
  assert.equal(world.ancestry(prey.id, 1)[0].death, world.tick);
});

test('resource identity reverses the competitive advantage under common starting slots', () => {
  const jade = genome({gut: 0.02, jaw: 0.15, fertility: 0.78});
  const amber = genome({gut: 0.98, jaw: 0.15, fertility: 0.78});
  const founders = Array.from({length: 64}, (_, i) => i % 2 ? amber : jade);
  const jadeWorld = new World({seed: 602, environment: 'jade', mutation: 0, founders});
  const amberWorld = new World({seed: 602, environment: 'amber', mutation: 0, founders});
  assert.deepEqual(livingState(jadeWorld), livingState(amberWorld));
  for (const world of [jadeWorld, amberWorld]) world.step(1100);
  const meanGut = (world) => world.summary().meanTraits[GENES.indexOf('gut')];
  assert.ok(jadeWorld.summary().population >= 32 && amberWorld.summary().population >= 32);
  assert.ok(meanGut(jadeWorld) < 0.25 && meanGut(amberWorld) > 0.75,
    `mean gut: ${meanGut(jadeWorld)} in jade, ${meanGut(amberWorld)} in amber`);
});

test('body shape affects movement and founder morphology is expressed as traits', () => {
  const small = genome({size: 0.1, aspect: 0.9, fins: 1, tail: 1, armor: 0, throttle: 0.9});
  const large = genome({size: 0.9, aspect: 0.9, fins: 0, tail: 0, armor: 1, throttle: 0.9});
  assert.ok(traits(small).radius < traits(large).radius);
  const displacement = (g) => {
    const world = new World({seed: 20, founders: [g], mutation: 0});
    const swimmer = world.organisms[0];
    const {x, y} = swimmer;
    world.step();
    return Math.hypot(swimmer.x - x, swimmer.y - y);
  };
  assert.ok(displacement(small) > displacement(large));
});

test('opposite controller alleles turn and feed differently under the same local inputs', () => {
  function underGradient(chemotaxis, grazeBias, y) {
    const world = new World({seed: 5, founders: [genome({chemotaxis, grazeBias, gut: 0.08})]});
    world.jade.fill(0.3);
    world.amber.fill(0.3);
    world.jade.fill(3, 9 * world.cols, 10 * world.cols);
    const swimmer = world.organisms[0];
    swimmer.x = 240;
    swimmer.y = y;
    swimmer.angle = 0;
    world.step();
    return swimmer;
  }
  const toward = underGradient(1, 0.5, 240);
  const away = underGradient(0, 0.5, 240);
  assert.ok(toward.angle > Math.PI && away.angle > 0 && away.angle < Math.PI,
    `turn angles ${toward.angle} and ${away.angle}`);
  const strongGrazer = underGradient(0.5, 1, 252);
  const weakGrazer = underGradient(0.5, 0, 252);
  assert.equal(strongGrazer.angle, weakGrazer.angle);
  assert.equal(strongGrazer.y, weakGrazer.y);
  assert.ok(strongGrazer.intake > weakGrazer.intake, `intake ${strongGrazer.intake} and ${weakGrazer.intake}`);
});

test('bounded replay arithmetic preserves directions and Shannon entropy', () => {
  const { sine, cosine, direction, logShare } = require('../engine.js').numerics;
  assert.equal(direction(0, 0), 0);
  for (let i = -1024; i <= 1024; i++) {
    const angle = i * Math.PI / 81;
    assert.ok(Math.abs(sine(angle) - Math.sin(angle)) < 1e-14, `sine at ${angle}`);
    assert.ok(Math.abs(cosine(angle) - Math.cos(angle)) < 1e-14, `cosine at ${angle}`);
    const dx = 36 * Math.cos(angle);
    const dy = 36 * Math.sin(angle);
    assert.ok(Math.abs(direction(dy, dx) - Math.atan2(dy, dx)) < 2e-14, `bearing at ${angle}`);
  }
  for (const [dy, dx] of [[0, -36], [36, 0], [0, 36], [-36, 0]]) {
    assert.equal(direction(dy, dx), Math.atan2(dy, dx));
  }
  for (const share of [1, 5 / 6, 2 / 3, 0.5, 1 / 96, 1 / 1025, 1 / 1000000]) {
    assert.ok(Math.abs(logShare(share) - Math.log(share)) < 4e-15, `log share at ${share}`);
  }
  assert.ok(Math.abs(new World().summary().diversity - Math.log(96)) < 2e-14);
});

test('spatial lookup agrees with current positions throughout sequential movement', () => {
  class CheckedWorld extends World {
    _neighbor(observer) {
      const distance = (other) => {
        const dx = Math.abs(other.x - observer.x);
        const dy = Math.abs(other.y - observer.y);
        return Math.hypot(Math.min(dx, this.width - dx), Math.min(dy, this.height - dy));
      };
      let nearest = Infinity;
      for (const other of this.organisms) {
        if (other === observer || other.energy <= 0) continue;
        const separation = distance(other);
        if (separation < observer.traits.senses) nearest = Math.min(nearest, separation);
      }
      const indexed = super._neighbor(observer);
      assert.equal(indexed ? distance(indexed) : Infinity, nearest,
        `nearest living neighbor at tick ${this.tick} for specimen ${observer.id}`);
      return indexed;
    }
  }
  const world = new CheckedWorld({seed: 73});
  world.step(950);
  assert.ok(world.summary().births > 0 && world.summary().deaths > 0);
});
