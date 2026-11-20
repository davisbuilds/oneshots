import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../../../scripts/browser.mjs';
import Cambrian from '../engine.js';

const tape = {
  seed: 4172,
  mutation: true,
  environment: 'balanced',
  actions: [[724, 'jade'], [4600, 'balanced'], [4600, 'amber'], [11520, 'balanced']],
  checkpoints: [0, 724, 5200, 27000],
};

function runTape(api, tape) {
  const world = new api.World(tape);
  let next = 0;
  const states = [];
  for (const tick of tape.checkpoints) {
    while (next < tape.actions.length && tape.actions[next][0] <= tick) {
      const [at, environment] = tape.actions[next++];
      world.step(at - world.tick).action(environment);
    }
    world.step(tick - world.tick);
    const last = world.organisms.at(-1);
    states.push(JSON.stringify({
      tick, environment: world.environment, summary: world.summary(), budget: world.budget(),
      jade: Array.from(world.jade), amber: Array.from(world.amber), organisms: world.organisms,
      lineages: world.lineages, events: world.events, ancestry: last ? world.ancestry(last.id, 64) : [],
    }));
  }
  return states;
}

const digest = (serialized) => createHash('sha256').update(serialized).digest('hex');
const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>Cambrian cross-runtime checkpoint</title>');
  await page.addScriptTag({ path: fileURLToPath(new URL('../engine.js', import.meta.url)) });
  await page.addScriptTag({ content: `globalThis.runTape = ${runTape.toString()};` });
  const nodeStates = runTape(Cambrian, tape);
  const chromeStates = await page.evaluate((tape) => globalThis.runTape(globalThis.Cambrian, tape), tape);
  for (const [i, checkpoint] of tape.checkpoints.entries()) {
    const expected = digest(nodeStates[i]);
    const observed = digest(chromeStates[i]);
    assert.equal(observed, expected, `serialized state mismatch at tick ${checkpoint}`);
    const { summary } = JSON.parse(nodeStates[i]);
    console.log(`Tick ${checkpoint}: ${summary.population} living, generation ${summary.maxGeneration}, ${expected}`);
  }
  const { summary } = JSON.parse(nodeStates.at(-1));
  assert.ok(summary.population > 0 && summary.maxGeneration > 20, 'the long checkpoint needs active evolution');
} finally {
  await browser.close();
}
