const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Culture } = require('../record.js');

// A small clock with an integral lets the test detect even a one-tick exposure shift.
class Clock {
  constructor({ environment }) {
    this.tick = 0;
    this.environment = environment;
    this.dose = 0;
    this.events = [];
  }
  step(n) {
    this.dose += n * (this.environment === 'jade' ? 3 : this.environment === 'amber' ? 2 : 1);
    this.tick += n;
  }
  summary() {
    return {
      tick: this.tick,
      population: this.dose,
      births: 0,
      deaths: 0,
      activeLineages: 1,
      maxGeneration: 0,
      diversity: 0,
      meanTraits: [],
      diet: { jade: 0, amber: 0, prey: 0 },
    };
  }
  action(action) {
    this.environment = action;
  }
}
const engine = { World: Clock };
const options = { seed: 113, environment: 'balanced', mutation: true };
test('exposures have a completed tick and survive replay including a final-tick action', async () => {
  const culture = new Culture(options, engine);
  culture.advance(7);
  culture.expose('jade');
  culture.advance(13);
  culture.expose('amber');
  assert.deepEqual(culture.export().actions, [
    { tick: 7, action: 'jade' },
    { tick: 20, action: 'amber' },
  ]);
  const old = await culture.reconstruct(8);
  assert.equal(old.dose, 10);
  const now = await culture.reconstruct(20);
  assert.equal(now.dose, culture.world.dose);
  assert.equal(now.environment, 'amber');
  assert.equal(culture.world.tick, 20);
});
test('paired control shares exact history then keeps the prior environment', async () => {
  const c = new Culture(options, engine);
  c.advance(8);
  c.expose('amber');
  c.advance(3);
  await c.pair();
  c.expose('jade');
  c.advance(50);
  assert.equal(c.control.tick, c.world.tick);
  assert.equal(c.control.dose, 114);
  assert.equal(c.world.dose, 164);
});
test('plot archive keeps regularly spaced results regardless of stepping batch size', () => {
  const a = new Culture(options, engine),
    b = new Culture(options, engine);
  a.advance(114);
  for (let i = 0; i < 114; i++) b.advance(1);
  assert.deepEqual(a.samples, b.samples);
  assert.ok(a.samples.length >= 4);
});

test('the browser record identifies the engine bytes used by the CLI and receipts', () => {
  const { readFileSync } = require('node:fs'),
    { createHash } = require('node:crypto');
  const hash = createHash('sha256')
    .update(readFileSync(require.resolve('../engine.js')))
    .digest('hex');
  assert.equal(new Culture(options, engine).export().engineSha256, hash);
  for (const name of ['ecology', 'stability', 'mosaic', 'benchmark', 'profile'])
    assert.equal(require('../experiments/' + name + '.json').engineSha256, hash);
});
test('long archives keep the stated interval and exact endpoints after thinning', () => {
  const c = new Culture(options, engine);
  c.advance(76013);
  assert.ok(c.interval > 16);
  assert.ok(c.samples.length <= 2048);
  assert.deepEqual(
    c.samples.map((s) => s.tick),
    Array.from({ length: 1 + Math.floor(76013 / c.interval) }, (_, i) => i * c.interval),
  );
});
