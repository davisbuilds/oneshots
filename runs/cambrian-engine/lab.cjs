'use strict';

const { readFileSync } = require('node:fs');
const { parseArgs } = require('node:util');

const engineSha256=require('node:crypto').createHash('sha256')
  .update(readFileSync(require.resolve('./engine.js'))).digest('hex');
const environments = ['balanced', 'jade', 'amber'];
const defaults = { seed: 42, ticks: 1200, environment: 'balanced', mutation: true, sampleEvery: 120 };
const flags = {
  seed: { type: 'string' },
  ticks: { type: 'string' },
  environment: { type: 'string' },
  mutation: { type: 'string' },
  actions: { type: 'string' },
  replay: { type: 'string' },
  control: { type: 'boolean' },
  'sample-every': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
};

const help = `Usage: node lab.cjs [options]
       node lab.cjs --replay FILE [--control] [--sample-every N]

Run the simulation without graphics and write deterministic JSON to stdout.

  --seed N            Unsigned 32-bit integer (default 42)
  --ticks N           Number of completed simulation ticks (default 1200)
  --environment NAME  balanced, jade, or amber (default balanced)
  --mutation MODE     on or off (default on)
  --actions FILE      JSON array of {"tick":120,"action":"jade"} records
  --replay FILE       Reproduce a browser export or prior lab JSON result
  --control           Replay the paired control in a browser export
  --sample-every N     Report every N ticks, plus tick 0 and the final tick
                      (default 120, or the interval in a replay file)
  -h, --help          Show this help

Actions must be ordered by tick. Actions at a given tick run in file order,
then the lab samples that tick if scheduled, then simulation resumes.
`;

function readJson(path, option) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${option} could not read JSON: ${error.message}`);
  }
}

function integer(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function flagInteger(value) {
  if (value === undefined) return undefined;
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

function validateReplay({ schema, engineSha256: recordedHash, seed, ticks, environment, mutation, sampleEvery, actions }) {
  if (recordedHash !== undefined && recordedHash !== engineSha256) throw new Error('engine SHA-256 differs from the recorded model');
  if (schema !== 1) throw new Error('expected replay schema 1');
  integer(seed, 'seed', 0, 0xffffffff);
  integer(ticks, 'ticks', 0);
  integer(sampleEvery, 'sample interval', 1);
  if (!environments.includes(environment)) {
    throw new Error(`environment must be ${environments.join(', ')}`);
  }
  if (typeof mutation !== 'boolean') throw new Error('mutation must be true or false');
  if (!Array.isArray(actions)) throw new Error('actions must be a JSON array');
  let previousTick = 0;
  const validatedActions = actions.map((record, index) => {
    const label = `actions[${index}]`;
    if (record === null || typeof record !== 'object') throw new Error(`${label} must be an object`);
    const { tick, action } = record;
    integer(tick, `${label}.tick`, previousTick, ticks);
    if (!environments.includes(action)) throw new Error(`${label}.action must be ${environments.join(', ')}`);
    previousTick = tick;
    return { tick, action };
  });
  return { schema, engineSha256, seed, ticks, environment, mutation, sampleEvery, actions: validatedActions };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function configFromFlags(options) {
  const sampleEvery = flagInteger(options['sample-every']);
  if (options.control && options.replay === undefined) throw new Error('--control requires --replay');
  if (options.replay !== undefined) {
    if (['seed', 'ticks', 'environment', 'mutation', 'actions'].some((flag) => options[flag] !== undefined)) {
      throw new Error('--replay can only be combined with --control and --sample-every');
    }
    const replay = readJson(options.replay, '--replay');
    if (!isRecord(replay)) throw new Error('--replay expects a JSON object');
    const record = options.control ? replay.control?.record : replay;
    if (!isRecord(record)) throw new Error('--control requires a replay file with a control.record object');
    const { sampleEvery: recordedSampleEvery = defaults.sampleEvery } = record;
    return validateReplay({ ...record, sampleEvery: sampleEvery ?? recordedSampleEvery });
  }
  if (options.mutation !== undefined && !['on', 'off'].includes(options.mutation)) {
    throw new Error('--mutation must be on or off');
  }
  return validateReplay({
    schema: 1,
    seed: flagInteger(options.seed) ?? defaults.seed,
    ticks: flagInteger(options.ticks) ?? defaults.ticks,
    environment: options.environment ?? defaults.environment,
    mutation: options.mutation === undefined ? defaults.mutation : options.mutation === 'on',
    sampleEvery: sampleEvery ?? defaults.sampleEvery,
    actions: options.actions === undefined ? [] : readJson(options.actions, '--actions'),
  });
}

function simulate(config) {
  const { World } = require('./engine.js');
  const { seed, environment, mutation, ticks, sampleEvery, actions } = config;
  const world = new World({ seed, environment, mutation: Number(mutation) });
  const samples = [];
  let actionIndex = 0;
  let nextSample = 0;
  for (;;) {
    while (actions[actionIndex]?.tick === world.tick) {
      world.action(actions[actionIndex].action);
      actionIndex += 1;
    }
    if (nextSample === world.tick) {
      samples.push({ tick: world.tick, ...world.summary() });
      nextSample = Math.min(ticks, nextSample + sampleEvery);
    }
    if (world.tick === ticks) break;
    world.step(Math.min(nextSample, actions[actionIndex]?.tick ?? ticks) - world.tick);
  }
  return { ...config, samples };
}

function main() {
  let config;
  try {
    const { values } = parseArgs({ options: flags });
    if (values.help) {
      process.stdout.write(help);
      return;
    }
    config = configFromFlags(values);
  } catch (error) {
    process.stderr.write(`lab: ${error.message}\nRun node lab.cjs --help for usage.\n`);
    process.exitCode = 2;
    return;
  }
  process.stdout.write(`${JSON.stringify(simulate(config), null, 2)}\n`);
}

main();
