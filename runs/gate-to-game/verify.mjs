// verify.mjs: open index.html from disk in headless Chromium and check that
// the computer runs, the game plays, and the zoom goes all the way down.
//   node verify.mjs            (after npm ci and npx playwright install chromium)
// CHROMIUM_PATH=/path/to/chrome node verify.mjs uses another Chromium build.
import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const output = fileURLToPath(new URL('./output/playwright/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const url = new URL('./index.html', import.meta.url).href;
const errors = [], requests = [];
const watch = p => {
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
};
const shot = async (page, name) => {
  const f = output + name + '.png';
  await page.screenshot({ path: f });
  assert.ok((await stat(f)).size > 20_000, `${name}: the screenshot has content`);
};
const state = page => page.evaluate(() => G2G.app.state());
const settle = page => page.waitForTimeout(250);

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watch(page);
  await page.goto(url);
  await page.waitForFunction(() => window.G2G && G2G.app && G2G.app.machine.cycle > 150000, null, { timeout: 20000 });

  // The machine runs at its clock, and the game has drawn its screen.
  await page.waitForTimeout(1500);
  let s = await state(page);
  assert.ok(s.hz > 60000, `the CPU runs (${s.hz} cycles in the last second)`);
  assert.deepEqual(s.levels, ['Game', 'Pixel', 'Program', 'CPU', 'ALU', 'Add16', 'FullAdder', 'NAND', 'Transistor']);
  assert.ok(s.ball >= 0 && s.follow && s.pixel === s.ball, 'following the ball');
  const bricks = await page.evaluate(() => G2G.app.ram('bricks'));
  assert.ok(bricks > 0 && bricks <= 90);
  await shot(page, '01-game');

  // The page's gate-level CPU agrees with the reference CPU on this ROM.
  const cc = await page.evaluate(() => G2G.app.crossCheck(200000));
  assert.ok(cc.same && cc.writes > 5000, `in-page cross-check: ${cc.writes} writes`);
  assert.deepEqual(cc.state[0], cc.state[1]);

  // Keys reach the game through the memory-mapped keyboard.
  const px0 = await page.evaluate(() => G2G.app.ram('px'));
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(400); await page.keyboard.up('ArrowLeft');
  const px1 = await page.evaluate(() => G2G.app.ram('px'));
  assert.ok(px1 < px0 || px1 === 1, `the paddle moved left (${px0} -> ${px1})`);

  // Scrolling zooms in; deep enough, time stops.
  const box = await page.locator('#view').boundingBox();
  await page.mouse.move(box.width * 0.6, box.height * 0.5);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(30); }
  await page.waitForTimeout(600);
  s = await state(page);
  assert.ok(s.z > 3, `the wheel zooms (z = ${s.z.toFixed(2)})`);
  assert.ok(s.level >= 1 && s.stopped, 'deep in, the clock stops');
  const frozen = s.cycle;
  await page.waitForTimeout(300);
  assert.equal((await state(page)).cycle, frozen, 'no cycles run while zoomed in');

  // Every level renders, with its own caption.
  const expect = [/BRICKFALL/, /Pixel \(/, /The instruction/, /G16 CPU/, /ALU/, /Add16/, /FullAdder/, /One NAND gate/, /One transistor/];
  for (let i = 0; i < expect.length; i++) {
    await page.evaluate(i => G2G.app.level(i), i);
    await settle(page);
    s = await state(page);
    assert.equal(s.level, i);
    assert.match(s.caption[0], expect[i], `level ${i} caption: ${s.caption[0]}`);
    await shot(page, `02-level-${i}-${s.levels[i].toLowerCase()}`);
  }
  assert.ok(s.renderMs < 60, `a frame renders in ${s.renderMs.toFixed(1)} ms`);
  const deepest = s.z;
  assert.ok(Math.exp(deepest) > 1e6, `total magnification ${Math.exp(deepest).toExponential(1)}`);

  // Halfway between two levels both are drawn (the zoom is continuous).
  await page.evaluate(() => { const L = G2G.app.scene.levels; G2G.app.zoomTo((L[5].z + L[6].z) / 2); });
  await settle(page);
  await shot(page, '03-between-add16-and-fulladder');

  // Clicking a part of the CPU re-aims the path at it and dives in.
  await page.evaluate(() => G2G.app.level(3));
  await settle(page);
  const pcBox = await page.evaluate(() => {
    const h = G2G.app.scene.hits.find(h => h.kind === 'inst' && h.inst.label === 'pc');
    return h && { x: (h.x + h.w / 2) / G2G.app.scene.env.dpr, y: (h.y + h.h / 2) / G2G.app.scene.env.dpr };
  });
  assert.ok(pcBox, 'the program counter is on screen at the CPU level');
  await page.mouse.click(pcBox.x, pcBox.y);
  await page.waitForFunction(() => G2G.app.state().level >= 4, null, { timeout: 10000 });
  s = await state(page);
  assert.equal(s.path[1], 'PC', `the path now goes through the program counter: ${s.path.join(' > ')}`);
  assert.ok(s.level >= 4, 'and the camera dived into it');
  await shot(page, '04-retargeted-to-pc');

  // At the NAND, clicking another transistor selects it.
  const nandLevel = s.levels.indexOf('NAND');
  await page.evaluate(i => G2G.app.level(i), nandLevel);
  await settle(page);
  const before = (await state(page)).transistor;
  const other = await page.evaluate(t => {
    const h = G2G.app.scene.hits.filter(h => h.kind === 'transistor' && h.name !== t).sort((a, b) => b.w - a.w)[0];
    return { x: (h.x + h.w / 2) / G2G.app.scene.env.dpr, y: (h.y + h.h / 2) / G2G.app.scene.env.dpr, name: h.name };
  }, before);
  await page.mouse.click(other.x, other.y);
  await page.waitForFunction(n => G2G.app.state().transistor === n, other.name, { timeout: 5000 });

  // Escape returns to the game and the clock runs again.
  await page.keyboard.press('Escape');
  await page.waitForFunction(c => { const s = G2G.app.state(); return s.z < 0.05 && s.cycle > c; }, frozen, { timeout: 10000 });
  s = await state(page);
  assert.ok(s.z < 0.05 && !s.stopped && s.cycle > frozen, 'back at the game, running');

  // Clicking a pixel picks it; the tour then dives through every level.
  const scr = await page.evaluate(() => { const h = G2G.app.scene.hits.find(h => h.kind === 'screen'); return { x: h.x / G2G.app.scene.env.dpr, y: h.y / G2G.app.scene.env.dpr, w: h.w / G2G.app.scene.env.dpr }; });
  const pw = scr.w / 64;
  await page.mouse.click(scr.x + pw * 20.5, scr.y + pw * 9.5);       // a brick in the top row
  s = await state(page);
  assert.equal(s.pixel, 9 * 64 + 20);
  assert.equal(s.follow, false);
  await page.click('#tour');
  await page.waitForFunction(() => G2G.app.state().level >= 3, null, { timeout: 30000 });
  s = await state(page);
  assert.ok(s.tour && s.pixel === 9 * 64 + 20, `the tour is under way at level ${s.level}, on the chosen pixel`);
  await shot(page, '05-tour');
  await page.click('#tour');
  assert.equal((await state(page)).tour, false);

  // Phone, portrait and landscape: panels stay on screen, the frame keeps room.
  for (const [w, h, name] of [[390, 844, 'phone'], [844, 390, 'phone-landscape']]) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    watch(p);
    await p.goto(url);
    await p.waitForFunction(() => window.G2G && G2G.app && G2G.app.machine.cycle > 100000, null, { timeout: 20000 });
    const m = await p.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect();
      const ids = ['caption', 'controls', 'ruler', 'stats'];
      return { scrollW: document.documentElement.scrollWidth, rects: ids.map(id => [id, r(id)]), safe: G2G.app.state().safe, dpr: G2G.app.scene.env.dpr };
    });
    assert.ok(m.scrollW <= w, `${name}: no horizontal scroll`);
    for (const [id, r] of m.rects) assert.ok(r.left >= 0 && r.right <= w + 0.5 && r.top >= 0 && r.bottom <= h + 0.5, `${name}: #${id} on screen`);
    assert.ok(m.safe.w / m.dpr > w * 0.45 && m.safe.h / m.dpr > 150, `${name}: the frame has room (${Math.round(m.safe.w / m.dpr)} x ${Math.round(m.safe.h / m.dpr)})`);
    await p.tap('#touch button[data-key="2"]').catch(() => {});
    await shot(p, `06-${name}`);
    await p.evaluate(() => G2G.app.level(6));
    await p.waitForTimeout(300);
    await shot(p, `07-${name}-fulladder`);
    await p.close();
  }

  assert.deepEqual(errors, [], 'no page errors');
  assert.deepEqual(requests, [], 'no network requests');
  console.log('gate-to-game: browser verification passed');
} finally {
  await browser.close();
}
