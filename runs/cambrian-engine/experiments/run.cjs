'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { cpus } = require('node:os');
const { basename } = require('node:path');
const { World, GENES } = require('../engine.js');

const seeds = [17, 31, 73, 101, 211, 307];
const selectionEnvironments = ['jade', 'amber'];
const trainingTicks = 4800;
const assayTicks = [180, 360];
const assayFounders = 48;
const gardenSalts = [10191, 44111];
const pulseTick = 1200;
const pulseWindow = 600;
const gutLocus = GENES.indexOf('gut');
const controllerLoci = GENES.flatMap((gene, index) =>
  /^(chemotaxis$|pursuit$|throttle$|turnBias$|thrust|graze|grasp)/.test(gene) ? [index] : []);
const engineSha256 = createHash('sha256').update(readFileSync(require.resolve('../engine.js'))).digest('hex');
const rounded = (value, digits = 6) => Number(value.toFixed(digits));

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function compareAcrossSeeds(values) {
  const center = mean(values);
  return {
    values: values.map((value) => rounded(value)),
    mean: center === null ? null : rounded(center),
    positive: values.filter((value) => value > 0).length,
    zero: values.filter((value) => value === 0).length,
    negative: values.filter((value) => value < 0).length,
  };
}

function inspectPopulation(world) {
  const summary = world.summary();
  const n = world.organisms.length;
  const traitMeans = Array(GENES.length).fill(0);
  const traitSquares = Array(GENES.length).fill(0);
  const genomes = new Set();
  for (const organism of world.organisms) {
    genomes.add(Array.from(organism.genome).join(','));
    for (let i = 0; i < GENES.length; i += 1) {
      const value = organism.genome[i];
      traitMeans[i] += value;
      traitSquares[i] += value * value;
    }
  }
  const traits = n === 0 ? null : Object.fromEntries(GENES.map((gene, i) => [gene, rounded(traitMeans[i] / n)]));
  const rmsTraitSpread = n === 0 ? null : Math.sqrt(mean(traitSquares.map((sum, i) =>
    Math.max(0, sum / n - (traitMeans[i] / n) ** 2))));
  return {
    tick: world.tick,
    population: n,
    births: summary.births,
    deaths: summary.deaths,
    allTimeGeneration: summary.maxGeneration,
    livingGeneration: summary.livingMaxGeneration,
    livingBranches: summary.activeLineages,
    newBranches: world.lineages.length - summary.initialPopulation,
    preyBites: summary.predation,
    distinctGenomes: genomes.size,
    rmsTraitSpread: rmsTraitSpread === null ? null : rounded(rmsTraitSpread),
    traits,
    diet: Object.fromEntries(Object.entries(summary.diet).map(([diet, amount]) => [diet, rounded(amount, 3)])),
  };
}

function sampleGenomePool(organisms, seed) {
  const candidates = [...organisms].sort((a, b) => a.id - b.id);
  let state = seed;
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const j = Math.floor((state / 0x100000000) * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.length ? Array.from({ length: assayFounders }, (_, i) =>
    candidates[i % candidates.length].genome) : null;
}

function garden(founders, seed, environment) {
  if (founders === null) return null;
  const world = new World({ seed, environment, founders, mutation: 0 });
  return assayTicks.map((tick) => {
    world.step(tick - world.tick);
    const { population, births, deaths } = world.summary();
    const livingDescendants = world.organisms.reduce((count, organism) => count + (organism.generation > 0 ? 1 : 0), 0);
    return { tick, population, livingDescendants, births, deaths, biomass: rounded(world.budget().biomass, 3) };
  });
}

function founderState(world) {
  return world.organisms.map(({ x, y, angle, age, energy, genome }) => ({ x, y, angle, age, energy, genome }));
}

function selection(seed) {
  const donorWorlds = new Map();
  const ancestor = new World({ seed, mutation: 0 });
  const founders = founderState(ancestor);
  const donors = [];
  for (const mutation of [1, 0]) {
    for (const environment of selectionEnvironments) {
      const world = new World({ seed, environment, mutation });
      assert.deepEqual(founderState(world), founders, `different founders in paired arm for seed ${seed}`);
      const start = inspectPopulation(world);
      world.step(trainingTicks / 2);
      const midpoint = inspectPopulation(world);
      world.step(trainingTicks / 2);
      const end = inspectPopulation(world);
      const source = `${environment}-${mutation ? 'mutation' : 'no-mutation'}`;
      donors.push({ source, start, midpoint, end });
      donorWorlds.set(source, world);
    }
  }
  donorWorlds.set('ancestor', ancestor);
  const assays = gardenSalts.map((salt) => {
    const gardenSeed = (seed * 65537 + salt) >>> 0;
    const pools = new Map([...donorWorlds].map(([source, world]) =>
      [source, sampleGenomePool(world.organisms, gardenSeed)]));
    for (const environment of selectionEnvironments) {
      const evolved = pools.get(`${environment}-mutation`);
      pools.set(`${environment}-neutral-gut`, evolved?.map((genome) => {
        const edited = genome.slice();
        edited[gutLocus] = 0.5;
        return edited;
      }) ?? null);
      pools.set(`${environment}-ancestral-controller`, evolved?.map((genome, i) => {
        const edited = genome.slice();
        for (const locus of controllerLoci) edited[locus] = pools.get('ancestor')[i][locus];
        return edited;
      }) ?? null);
    }
    const blocks = Object.fromEntries([...pools].map(([source, founders]) => [source,
      Object.fromEntries(selectionEnvironments.map((environment) =>
        [environment, garden(founders, gardenSeed, environment)]))]));
    return { seed: gardenSeed, blocks };
  });
  return { seed, donors, assays };
}

function adaptation(rows, response) {
  const metrics = {
    mutation: [], noMutation: [], extraWithMutation: [],
    neutralGut: [], ancestralController: [],
    jadeOnJadeVsAncestor: [], amberOnAmberVsAncestor: [],
  };
  for (const row of rows) {
    const byBlock = row.assays.map(({ blocks }) => {
      const rate = (source, environment) => response(blocks[source][environment]?.at(-1)) / assayFounders;
      const advantage = (suffix) => (
        (rate(`jade-${suffix}`, 'jade') - rate(`amber-${suffix}`, 'jade')) +
        (rate(`amber-${suffix}`, 'amber') - rate(`jade-${suffix}`, 'amber'))
      ) / 2;
      const mutation = advantage('mutation');
      const noMutation = advantage('no-mutation');
      return {
        mutation,
        noMutation,
        extraWithMutation: mutation - noMutation,
        neutralGut: advantage('neutral-gut'),
        ancestralController: advantage('ancestral-controller'),
        jadeOnJadeVsAncestor: rate('jade-mutation', 'jade') - rate('ancestor', 'jade'),
        amberOnAmberVsAncestor: rate('amber-mutation', 'amber') - rate('ancestor', 'amber'),
      };
    });
    for (const [label, collection] of Object.entries(metrics)) {
      const values = byBlock.map((block) => block[label]);
      if (values.every(Number.isFinite)) collection.push(mean(values));
    }
  }
  return Object.fromEntries(Object.entries(metrics).map(([name, values]) => [name, compareAcrossSeeds(values)]));
}

function dietWindow(start, end) {
  const energy = Object.fromEntries(Object.keys(end).map((key) => [key, end[key] - start[key]]));
  const total = energy.jade + energy.amber + energy.prey;
  const fractions = Object.fromEntries(Object.entries(energy).map(([key, amount]) =>
    [key, total > 0 ? rounded(amount / total) : null]));
  return {
    assimilated: Object.fromEntries(Object.entries(energy).map(([key, amount]) => [key, rounded(amount, 3)])),
    fractions,
  };
}

function pulseArm(seed, environment, shift) {
  const world = new World({ seed, environment, mutation: 1 });
  world.step(pulseTick - pulseWindow);
  const before = world.summary().diet;
  world.step(pulseWindow);
  const atShift = world.summary().diet;
  if (shift) world.action(shift);
  world.step(pulseWindow);
  const early = world.summary().diet;
  world.step(pulseWindow);
  return {
    before: dietWindow(before, atShift),
    early: dietWindow(atShift, early),
    late: dietWindow(early, world.summary().diet),
    finalPopulation: world.organisms.length,
  };
}

function pulse(seed) {
  const treatment = pulseArm(seed, 'amber', 'jade');
  const control = pulseArm(seed, 'amber');
  assert.deepEqual(treatment.before, control.before);
  return {
    seed,
    'amber-to-jade': treatment,
    'amber-control': control,
    'jade-reference': pulseArm(seed, 'jade'),
  };
}

function pulseShares(rows, diet) {
  const effects = rows.flatMap((row) => {
    const treatment = row['amber-to-jade'].late.fractions[diet];
    const control = row['amber-control'].late.fractions[diet];
    return treatment === null || control === null ? [] : [treatment - control];
  });
  return compareAcrossSeeds(effects);
}

function ecology() {
  const selectionRows = seeds.map(selection);
  const pulseRows = seeds.map(pulse);
  return {
    schema: 1,
    study: 'ecology',
    engineSha256,
    parameters: {
      seeds, trainingTicks, assayFounders, assayTicks, gardenSalts, pulseTick, pulseWindow,
      controllerLoci: controllerLoci.map((index) => GENES[index]),
    },
    adaptation: {
      survivalAndGrowth: adaptation(selectionRows, (sample) => sample?.population),
      livingDescendants: adaptation(selectionRows, (sample) => sample?.livingDescendants),
      cumulativeBirths: adaptation(selectionRows, (sample) => sample?.births),
    },
    pulse: {
      lateJadeShareDeltaVsAmberControl: pulseShares(pulseRows, 'jade'),
      latePreyShareDeltaVsAmberControl: pulseShares(pulseRows, 'prey'),
      rows: pulseRows,
    },
    selection: selectionRows,
  };
}

function mosaicArm(seed, mutation, sampleTicks) {
  const world = new World({ seed, mutation, environment: 'balanced' });
  const initialJadeShares = world.jade.map((jade, i) => jade / (jade + world.amber[i]));
  const tileWidth = world.width / world.cols;
  const tileHeight = world.height / world.rows;
  return sampleTicks.map((tick) => {
    world.step(tick - world.tick);
    const classes = { low: [], medium: [], high: [] };
    for (const organism of world.organisms) {
      const gut = organism.genome[gutLocus];
      const tier = gut < 1 / 3 ? 'low' : gut < 2 / 3 ? 'medium' : 'high';
      const index = Math.floor(organism.y / tileHeight) * world.cols + Math.floor(organism.x / tileWidth);
      classes[tier].push(initialJadeShares[index]);
    }
    const occupancy = Object.fromEntries(Object.entries(classes).map(([name, shares]) => [name, {
      population: shares.length, meanInitialJadeShare: shares.length ? rounded(mean(shares)) : null,
    }]));
    return { tick, population: world.organisms.length, occupancy };
  });
}

function mosaic() {
  const sampleTicks = [0, 4800, 9600, 14400];
  const rows = seeds.map((seed) => ({ seed, mutation: mosaicArm(seed, 1, sampleTicks), noMutation: mosaicArm(seed, 0, sampleTicks) }));
  const occupancySummary = Object.fromEntries(['mutation', 'noMutation'].map((mode) => [mode,
    sampleTicks.map((tick, i) => {
      const snapshots = rows.map((row) => row[mode][i]);
      const differences = snapshots.flatMap(({ occupancy: { low, high } }) =>
        low.population && high.population ? [low.meanInitialJadeShare - high.meanInitialJadeShare] : []);
      return {
        tick, livingWorlds: snapshots.filter(({ population }) => population > 0).length,
        worldsWithBothExtremes: differences.length, lowMinusHighShare: compareAcrossSeeds(differences),
      };
    })]));
  return { schema: 1, study: 'balanced-mosaic', engineSha256, parameters: { seeds, sampleTicks }, occupancySummary, rows };
}

function inspectFinite(world) {
  const checkNonnegative = (value) => Number.isFinite(value) && value >= 0;
  assert.ok(world.jade.every(checkNonnegative), `invalid jade field at tick ${world.tick}`);
  assert.ok(world.amber.every(checkNonnegative), `invalid amber field at tick ${world.tick}`);
  for (const organism of world.organisms) {
    assert.ok([organism.x, organism.y, organism.energy, organism.age].every(Number.isFinite),
      `nonfinite organism ${organism.id} at tick ${world.tick}`);
    assert.ok(organism.energy > 0, `nonpositive energy for live organism ${organism.id}`);
    assert.ok(organism.x >= 0 && organism.x < world.width && organism.y >= 0 && organism.y < world.height,
      `out of bounds organism ${organism.id}`);
    assert.ok(organism.genome.every((gene) => Number.isFinite(gene) && gene >= 0 && gene <= 1),
      `out of range genome for organism ${organism.id}`);
    assert.ok(Number.isSafeInteger(organism.generation) && organism.generation >= 0,
      `invalid ancestor depth for organism ${organism.id}`);
  }
  const summary = world.summary();
  const budget = world.budget();
  assert.ok(Object.values(budget).every(Number.isFinite), `nonfinite budget at tick ${world.tick}`);
  assert.equal(summary.initialPopulation + summary.births - summary.deaths, world.organisms.length);
  const absoluteResidual = Math.abs(budget.balance);
  const relativeResidual = absoluteResidual / (budget.initial + budget.regenerated);
  assert.ok(relativeResidual <= 1e-8, `energy budget drift at tick ${world.tick}: ${relativeResidual}`);
  return { summary, absoluteResidual, relativeResidual };
}

function verifyLivingAncestry(world) {
  let deepest = null;
  for (const organism of world.organisms) {
    if (deepest === null || organism.generation > deepest.generation) deepest = organism;
  }
  if (deepest === null) return null;
  const ancestry = world.ancestry(deepest.id, deepest.generation + 1);
  assert.equal(ancestry.length, deepest.generation + 1);
  assert.equal(ancestry[0].id, deepest.id);
  assert.equal(ancestry.at(-1).parentId, null);
  for (const [index, record] of ancestry.entries()) {
    assert.equal(record.generation, deepest.generation - index);
    if (index + 1 === ancestry.length) break;
    const parent = ancestry[index + 1];
    assert.equal(record.parentId, parent.id);
    assert.ok(record.birth > parent.birth);
  }
  return { organism: deepest.id, depth: deepest.generation, founder: ancestry.at(-1).id, checkedRecords: ancestry.length };
}

function host() {
  return { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model };
}

function stability(seed, ticks) {
  const interval = 256;
  const world = new World({ seed, environment: 'balanced', mutation: 1 });
  const initial = inspectFinite(world);
  let maxPopulation = world.organisms.length;
  let minPopulation = maxPopulation;
  let maxAbsoluteResidual = initial.absoluteResidual;
  let maxRelativeResidual = initial.relativeResidual;
  let elapsedStepMs = 0;
  const checkpoints = [];
  const checkpointEvery = Math.ceil(ticks / interval / 12) * interval;
  const startUsage = process.memoryUsage();
  const peakUsage = { heapUsed: startUsage.heapUsed, rss: startUsage.rss };
  while (world.tick < ticks) {
    const time = performance.now();
    world.step(Math.min(interval, ticks - world.tick));
    elapsedStepMs += performance.now() - time;
    const { summary, absoluteResidual, relativeResidual } = inspectFinite(world);
    maxPopulation = Math.max(maxPopulation, summary.population);
    minPopulation = Math.min(minPopulation, summary.population);
    maxAbsoluteResidual = Math.max(maxAbsoluteResidual, absoluteResidual);
    maxRelativeResidual = Math.max(maxRelativeResidual, relativeResidual);
    const { heapUsed, rss } = process.memoryUsage();
    peakUsage.heapUsed = Math.max(peakUsage.heapUsed, heapUsed);
    peakUsage.rss = Math.max(peakUsage.rss, rss);
    if (world.tick % checkpointEvery === 0 || world.tick === ticks) {
      checkpoints.push({ tick: world.tick, population: summary.population, births: summary.births,
        deaths: summary.deaths, maxGeneration: summary.maxGeneration, livingMaxGeneration: summary.livingMaxGeneration });
    }
  }
  return {
    schema: 1,
    study: 'stability',
    engineSha256,
    host: host(),
    parameters: { seed, ticks, interval },
    minPopulation,
    maxPopulation,
    maxAbsoluteResidual,
    maxRelativeResidual,
    elapsedStepMs: rounded(elapsedStepMs, 1),
    ticksPerSecond: rounded(ticks / elapsedStepMs * 1000, 1),
    peakSampledMemoryBytes: peakUsage,
    checkpoints,
    finalBudget: world.budget(),
    verifiedLivingAncestry: verifyLivingAncestry(world),
    final: inspectPopulation(world),
  };
}

function benchmark(ticks) {
  const configurations = [
    { seed: 17, environment: 'balanced' },
    { seed: 31, environment: 'jade' },
    { seed: 73, environment: 'amber' },
  ];
  const warmup = 1200;
  const interval = 60;
  const rows = configurations.map((config) => {
    const world = new World(config);
    world.step(warmup);
    const end = warmup + ticks;
    const elapsed = [];
    let minPopulation = world.organisms.length;
    let maxPopulation = minPopulation;
    while (world.tick < end) {
      const batch = Math.min(interval, end - world.tick);
      const start = performance.now();
      world.step(batch);
      elapsed.push((performance.now() - start) / batch);
      minPopulation = Math.min(minPopulation, world.organisms.length);
      maxPopulation = Math.max(maxPopulation, world.organisms.length);
    }
    elapsed.sort((a, b) => a - b);
    return {
      ...config, minPopulation, maxPopulation,
      medianMsPerTick: rounded(elapsed[Math.floor(elapsed.length / 2)]),
      p95BatchMsPerTick: rounded(elapsed[Math.ceil(elapsed.length * 0.95) - 1]),
    };
  });
  return { schema: 1, study: 'benchmark', engineSha256, host: host(),
    parameters: { ticks, warmup, interval }, rows };
}

function profileSummary(path, benchmarkPath) {
  const profiledBenchmark = JSON.parse(readFileSync(benchmarkPath, 'utf8'));
  assert.equal(profiledBenchmark.study, 'benchmark');
  const profile = JSON.parse(readFileSync(path, 'utf8'));
  const nodes = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
  const amounts = new Map();
  let total = 0;
  for (const [i, id] of profile.samples.entries()) {
    const frame = nodes.get(id);
    const file = basename(frame.url);
    const name = `${frame.functionName || '(anonymous)'}${file ? ` @ ${file}` : ''}`;
    const duration = profile.timeDeltas[i];
    total += duration;
    amounts.set(name, (amounts.get(name) ?? 0) + duration);
  }
  const frames = [...amounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, duration]) =>
    ({ name, share: rounded(duration / total) }));
  return {
    schema: 1, study: 'cpu-profile', engineSha256: profiledBenchmark.engineSha256, host: profiledBenchmark.host,
    parameters: profiledBenchmark.parameters, samples: profile.samples.length, seconds: rounded(total / 1e6, 3), frames,
  };
}

function unsigned(value, label, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`invalid ${label}`);
  }
  return number;
}

const [command, ...args] = process.argv.slice(2);
let result;
switch (command) {
  case 'ecology':
    assert.ok(gutLocus >= 0 && controllerLoci.length > 4, 'assay requires the signed motor controller');
    result = ecology();
    break;
  case 'mosaic':
    result = mosaic();
    break;
  case 'stability':
    result = stability(unsigned(args[0] ?? '73', 'seed', 0, 0xffffffff), unsigned(args[1] ?? '620000', 'tick count'));
    break;
  case 'benchmark':
    result = benchmark(unsigned(args[0] ?? '18000', 'tick count'));
    break;
  case 'profile-summary':
    result = profileSummary(args[0], args[1]);
    break;
  default:
    console.error('Usage: node experiments/run.cjs ecology | mosaic | stability [SEED [TICKS]] | benchmark [TICKS] | profile-summary FILE PROFILED_BENCHMARK_JSON');
    process.exitCode = 2;
}
if (result) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
