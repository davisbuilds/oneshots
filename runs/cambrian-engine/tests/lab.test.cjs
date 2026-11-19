'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

const lab = join(__dirname, '..', 'lab.cjs');
const invoke = (...args) => spawnSync(process.execPath, [lab, ...args], { encoding: 'utf8' });

function jsonFixture(t, filename, value) {
  const directory = mkdtempSync(join(tmpdir(), 'cambrian-lab-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, filename);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

test('headless replay applies interventions before the next simulated tick', (t) => {
  const actions = [
    { tick: 0, action: 'jade' },
    { tick: 11, action: 'balanced' },
    { tick: 11, action: 'amber' },
    { tick: 37, action: 'jade' },
  ];
  const actionFile = jsonFixture(t, 'actions.json', actions);
  const result = invoke('--seed', '17', '--ticks', '37', '--mutation', 'off',
    '--sample-every', '10', '--actions', actionFile);
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.deepEqual(data.actions, actions);
  assert.deepEqual(data.samples.map((sample) => sample.tick), [0, 10, 20, 30, 37]);

  const { World } = require('../engine.js');
  const world = new World({ seed: 17, mutation: 0, environment: 'balanced' });
  world.action('jade');
  world.step(11);
  world.action('balanced');
  world.action('amber');
  world.step(26);
  world.action('jade');
  assert.deepEqual(data.samples.at(-1), JSON.parse(JSON.stringify({ tick: 37, ...world.summary() })));

  const control = invoke('--seed', '17', '--ticks', '37', '--mutation', 'off');
  assert.equal(control.status, 0, control.stderr);
  assert.notDeepEqual(data.samples.at(-1).diet, JSON.parse(control.stdout).samples.at(-1).diet);
  const replayFile = jsonFixture(t, 'replay.json', data);
  const replay = invoke('--replay', replayFile);
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(replay.stdout, result.stdout);
});

test('browser replay metadata can be resampled without redefining the run', (t) => {
  const replay = {
    schema: 1, seed: 0, ticks: 3, environment: 'amber', mutation: false,
    actions: [{ tick: 2, action: 'jade' }],
    samples: ['observational data is recalculated'],
  };
  const replayFile = jsonFixture(t, 'browser.json', replay);
  const result = invoke('--replay', replayFile, '--sample-every', '2');
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.seed, 0);
  assert.equal(data.mutation, false);
  assert.deepEqual(data.actions, replay.actions);
  assert.deepEqual(data.samples.map((sample) => sample.tick), [0, 2, 3]);
  const conflicting = invoke('--replay', replayFile, '--seed', '17');
  assert.equal(conflicting.status, 2);
  assert.match(conflicting.stderr, /--replay/);
});

test('invalid logs fail without a partially successful JSON result', (t) => {
  for (const actions of [
    [{ tick: 2, action: 'jade' }, { tick: 1, action: 'amber' }],
    [{ tick: 4, action: 'jade' }],
    [{ tick: 1, action: 'unknown' }],
    [{ tick: '1', action: 'jade' }],
  ]) {
    const actionFile = jsonFixture(t, 'bad-actions.json', actions);
    const result = invoke('--ticks', '3', '--actions', actionFile);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /actions\[/);
  }
});

test('a paired browser export replays its unperturbed control and its intervention', (t) => {
  const seed = 17;
  const ticks = 63;
  const splitTick = 11;
  const environment = 'amber';
  const mutation = false;
  const record = { schema: 1, seed, ticks, environment, mutation, actions: [], sampleEvery: 13 };
  const { World } = require('../engine.js');
  const controlWorld = new World({ seed, environment, mutation });
  controlWorld.step(ticks);
  const final = controlWorld.summary();
  const replayFile = jsonFixture(t, 'paired.json', {
    ...record,
    actions: [{ tick: splitTick, action: 'jade' }],
    sampleEvery: 20,
    control: { splitTick, environment, final, record },
  });

  const control = invoke('--replay', replayFile, '--control');
  assert.equal(control.status, 0, control.stderr);
  const data = JSON.parse(control.stdout);
  assert.deepEqual(data.actions, []);
  assert.equal(data.sampleEvery, 13);
  assert.deepEqual(data.samples.map(({ tick }) => tick), [0, 13, 26, 39, 52, 63]);
  assert.deepEqual(data.samples.at(-1), final);

  const primary = invoke('--replay', replayFile);
  assert.equal(primary.status, 0, primary.stderr);
  assert.notDeepEqual(JSON.parse(primary.stdout).samples.at(-1).diet, final.diet);

  const override = invoke('--replay', replayFile, '--control', '--sample-every', '19');
  assert.equal(override.status, 0, override.stderr);
  const overridden = JSON.parse(override.stdout);
  assert.equal(overridden.sampleEvery, 19);
  assert.deepEqual(overridden.samples.map(({ tick }) => tick), [0, 19, 38, 57, 63]);
  assert.deepEqual(overridden.samples.at(-1), final);
});

test('control replay requires a valid paired record', (t) => {
  const standalone = invoke('--control');
  assert.equal(standalone.status, 2);
  assert.equal(standalone.stdout, '');
  assert.match(standalone.stderr, /--control requires --replay/);

  const replay = { schema: 1, seed: 17, ticks: 63, environment: 'jade', mutation: true, actions: [] };
  const unpaired = invoke('--replay', jsonFixture(t, 'unpaired.json', replay), '--control');
  assert.equal(unpaired.status, 2);
  assert.equal(unpaired.stdout, '');
  assert.match(unpaired.stderr, /control\.record/);

  const malformed = {
    ...replay,
    control: { record: { ...replay, actions: [{ tick: 64, action: 'amber' }] } },
  };
  const invalid = invoke('--replay', jsonFixture(t, 'invalid.json', malformed), '--control');
  assert.equal(invalid.status, 2);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /actions\[0\]\.tick/);
});

test('a replay carrying a different engine digest is rejected', t=>{
  const record={schema:1,engineSha256:'0'.repeat(64),seed:3,ticks:4,environment:'jade',mutation:true,actions:[]};
  const run=invoke('--replay',jsonFixture(t,'different-engine.json',record));
  assert.equal(run.status,2);assert.match(run.stderr,/SHA-256/);assert.equal(run.stdout,'');
});
