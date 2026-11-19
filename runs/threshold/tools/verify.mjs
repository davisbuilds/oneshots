import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { browserSession, ready, state, until, output } from './browser.mjs';

await browserSession(async (browser, url) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage(),
    errors = [],
    external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(url + '/')) external.push(r.url());
  });
  await page.goto(url + '/tests/lab.html');
  await page.waitForFunction(() => window.lab);
  const pixels = await page.evaluate(() => lab.probes());
  console.log('Framebuffer witnesses', JSON.stringify(pixels));
  if (process.argv.includes('--pixels')) {
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    return;
  }
  const disposal = await page.evaluate(() => lab.resourceProbe());
  console.log('GPU disposal', JSON.stringify(disposal));
  // Tap the actual destination bus in the test page to witness sound and mute.
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (...args) {
      if (args[0] instanceof AudioDestinationNode) {
        const probe = this.context.createAnalyser();
        connect.call(this, probe);
        const samples = new Float32Array(probe.fftSize);
        window.outputRms = () => {
          probe.getFloatTimeDomainData(samples);
          return Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
        };
      }
      return connect.apply(this, args);
    };
  });
  await page.goto(url);
  await ready(page);
  await page.evaluate(() => document.fonts.ready);
  const shot = (name) => page.screenshot({ path: output + 'playwright/' + name + '.png' });
  await shot('cover');
  await page.getByRole('button', { name: 'Enable ambient sound' }).click();
  await page.waitForFunction(() => window.outputRms?.() > 0.008);
  await page.getByRole('button', { name: 'Mute ambient sound' }).click();
  await page.waitForFunction(() => window.outputRms() < 0.0008);
  await page.getByRole('button', { name: 'Enable ambient sound' }).click();
  await page.getByRole('button', { name: 'Enter the atlas' }).click();
  await page.keyboard.down('Shift');
  await until(page, 'w', () => threshold.inspect().pos[2] < 10.1);
  await until(page, 'd', () => threshold.inspect().pos[0] > 2.15);
  await page.keyboard.press('e');
  await page.waitForFunction(() => threshold.inspect().tuned);
  await page.keyboard.press('j');
  await page.getByText('Tide dial sounded.', { exact: false }).waitFor();
  await shot('journal');
  await page.keyboard.press('j');
  await page.keyboard.down('Shift');
  await until(page, 'a', () => threshold.inspect().pos[0] < 0.1);
  await until(page, 'w', () => threshold.inspect().id === '2');
  await until(page, 'w', () => threshold.inspect().pos[2] < 8.4);
  await page.keyboard.up('Shift');
  await shot('desert');
  await until(page, 'ArrowRight', () => {
    const [x, y] = threshold.inspect().quaternion;
    return 2 * (x * x + y * y) - 1 > 0.99;
  });
  await shot('return-window');
  await page.keyboard.down('Shift');
  await until(page, 'w', () => threshold.inspect().id === '1');
  await page.keyboard.up('Shift');
  await page.keyboard.press('j');
  await page.getByText('2 worlds entered').waitFor();
  assert.ok((await page.locator('#entries').innerText()).includes('The Saffron Sea'));
  await page.keyboard.press('j');
  await page.keyboard.press('Escape');
  // A reload reconstructs both the world and the IndexedDB-backed instrument.
  await page.reload();
  await ready(page);
  await page.waitForFunction(() => threshold.inspect().tuned);
  assert.equal((await state(page)).id, '1');
  await page.keyboard.press('i');
  await page.locator('#budget').fill('1');
  await page.waitForFunction(() => threshold.inspect().passBudget === 1 && threshold.inspect().passes <= 2);
  await page.locator('#budget').fill('5');
  await page.locator('#hide-metrics').click();
  const start = Date.now();
  await page.getByRole('button', { name: /Guided passage/ }).click();
  const route = [];
  for (const [id, name, seconds] of [
    ['2', 'saffron', 11.5],
    ['4', 'vesper', 22],
    ['8', 'glass', 32],
    ['16', 'archive', 41],
    ['16', 'returning-aisle', 47.2],
  ]) {
    await page.waitForFunction(
      ([id, seconds]) => {
        const s = threshold.inspect();
        return s.id === id && s.demoSeconds >= seconds;
      },
      [id, seconds],
      { timeout: 35000 }
    );
    route.push(await state(page));
    await shot(name);
  }
  await page.waitForFunction(() => threshold.inspect().mode === 'cover', null, { timeout: 20000 });
  const elapsed = (Date.now() - start) / 1000;
  assert.ok(elapsed >= 45 && elapsed < 75, '52 seconds of active simulation; wall time ' + elapsed);
  await page.waitForFunction(() => threshold.inspect().tuned);
  await page.keyboard.press('j');
  await page.getByText('2 worlds entered').waitFor();
  // Recall is explicit and the resumed pose must survive another reload.
  await page.getByRole('button', { name: 'Recall this mooring' }).first().click();
  await page.waitForFunction(() => threshold.inspect().id === '2' && threshold.inspect().mode === 'walk');
  await page.keyboard.press('Escape');
  await page.reload();
  await ready(page);
  assert.equal((await state(page)).id, '2');
  await page.setViewportSize({ width: 390, height: 750 });
  await page.getByRole('button', { name: 'Field journal' }).click();
  await page.getByRole('heading', { name: 'Field journal' }).waitFor();
  await shot('narrow-journal');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const offline = await browser.newContext({ offline: true, viewport: { width: 960, height: 600 } });
  const standalone = await offline.newPage(),
    remoteRequests = [];
  standalone.on('request', (r) => {
    if (/^https?:/.test(r.url())) remoteRequests.push(r.url());
  });
  await standalone.goto(pathToFileURL(output + 'threshold.html').href);
  await ready(standalone);
  await standalone.getByRole('button', { name: 'Enter the atlas' }).click();
  await standalone.keyboard.down('Shift');
  await until(standalone, 'w', () => threshold.inspect().id === '2');
  assert.deepEqual(remoteRequests, []);
  await offline.close();
  const result = { browser: browser.version(), pixels, disposal, route, cinematicWallSeconds: elapsed };
  await writeFile(output + 'playwright/verification.json', JSON.stringify(result, null, 2) + '\n');
  console.log('THRESHOLD browser verification passed · tour ' + elapsed.toFixed(1) + ' s');
});
