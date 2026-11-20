const { test } = require('node:test');
const assert = require('node:assert/strict');
const { simulate } = require('../src/history.js');
test('256 seeds preserve settlement, causation, chronology, and burial order', () => {
  const endings = new Set();
  for (let seed = 0; seed < 256; seed++) {
    const site = simulate(seed),
      { events, buildings, deposits, finds } = site;
    assert.ok(events.length >= 8, 'centuries of occupation leave a ledger');
    assert.deepEqual(site, simulate(seed));
    assert.ok(events.at(-1).year - events[0].year >= 200);
    events.forEach((e, i) => {
      assert.equal(e.id, i);
      if (i) assert.ok(e.year >= events[i - 1].year);
      e.causes.forEach((c) => assert.ok(c < i && events[c]));
    });
    for (const b of buildings) assert.equal(events[b.origin].construct, b.type);
    for (const f of finds) {
      assert.equal(events[f.origin].object, f.kind);
      assert.equal(events[f.origin].zone, f.zone);
      const d = deposits[f.layer];
      assert.ok(d.start <= events[f.origin].year && events[f.origin].year <= d.end);
      assert.ok(d.top <= f.depth && f.depth <= d.bottom);
    }
    for (let i = 1; i < deposits.length; i++) {
      assert.equal(deposits[i].bottom, deposits[i - 1].top);
      assert.ok(deposits[i].start > deposits[i - 1].end);
    }
    assert.equal(events.at(-1).type, 'abandon');
    assert.equal(events.at(-1).people, 0);
    assert.equal(finds.length, events.filter((e) => e.object).length);
    endings.add(site.cause);
  }
  assert.equal(endings.size, 2);
});
test('sample the unsigned seed range and check the physical record against economic events', () => {
  const { randomSource } = require('../src/history.js'),
    r = randomSource(11431);
  const seeds = [0, 1842, 1847, 2 ** 32 - 1, ...Array.from({ length: 384 }, () => Math.floor(r() * 2 ** 32))];
  for (const seed of seeds) {
    const s = simulate(seed),
      byType = (type) => s.events.find((e) => e.type === type),
      built = (kind) => s.buildings.find((b) => b.type === kind);
    assert.ok(s.frames.length > 40);
    assert.ok(s.events[built('granary').origin].grain >= 40);
    assert.ok(s.events[built('quay').origin].grain > 145);
    assert.ok(s.events[built('court').origin].trade >= 65);
    assert.ok(byType(s.cause).water < 0.63);
    assert.ok(byType('adapt').causes.includes(byType(s.cause).id));
    for (const b of s.buildings) {
      assert.equal(b.abandonment, s.events.at(-1).id);
      assert.equal(b.useYears, s.events.at(-1).year - s.events[b.origin].year);
      assert.ok(b.survival > 0 && b.survival < 1);
    }
    assert.equal(new Set(s.finds.map((f) => f.id)).size, s.finds.length);
    assert.equal(s.finds.at(-1).depth, 0);
    for (let i = 1; i < s.finds.length; i++) assert.ok(s.finds[i].depth <= s.finds[i - 1].depth);
    for (const e of s.events) assert.ok(e.causes.every((id) => s.events[id].year <= e.year));
    assert.deepEqual(s, simulate(seed));
  }
});
