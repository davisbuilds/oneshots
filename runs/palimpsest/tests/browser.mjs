import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { launchBrowser } from '../../../scripts/browser.mjs';
const root = new URL('../', import.meta.url),
  out = new URL('output/', root);
mkdirSync(out, { recursive: true });
const browser = await launchBrowser({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const net = [],
  errors = [];
try {
  const context = await browser.newContext({ offline: true, viewport: { width: 1440, height: 960 } });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('request', (r) => {
    if (/^https?:/.test(r.url())) net.push(r.url());
  });
  await p.goto(new URL('index.html', root).href);
  const snap = async (name) => p.screenshot({ path: new URL(name + '.png', out).pathname });
  await p.locator('#viewport canvas').waitFor();
  await snap('desk');
  const assertText = async (sel, fragment) =>
    assert.ok((await p.locator(sel).innerText()).includes(fragment), sel + ' should contain ' + fragment);
  await p.locator('#labels').click();
  assert.ok(await p.locator('#markers').isHidden());
  await p.locator('#labels').click();
  await p.locator('#plus').click();
  await p.locator('#reset').click();
  await p.locator('.find-record').click();
  await assertText('#modal-body', 'Banded water jar');
  await p.locator('#detail-view').click();
  assert.equal(await p.locator('#detail-view').getAttribute('aria-pressed'), 'true');
  await p.locator('summary').click();
  await assertText('details', 'The last water carriers');
  await p.locator('#close').click();
  await p.locator('#excavate').click();
  await p.locator('#sweep').waitFor();
  await p.keyboard.press('Escape');
  assert.deepEqual(await p.evaluate(() => state.found), ['AS-008']);
  let dug = 0;
  for (let z = 0; z < 3; z++) {
    await p.locator('[data-zone="' + z + '"]').click();
    while ((await p.locator('#excavate').innerText()).includes('Excavate trench')) {
      await p.locator('#excavate').click();
      await p.locator('#sweep').waitFor();
      if (!dug) {
        const b = await p.locator('.cover').boundingBox();
        await p.mouse.move(b.x + b.width * 0.43, b.y + b.height * 0.38);
        await p.mouse.down();
        await p.mouse.move(b.x + b.width * 0.56, b.y + b.height * 0.52, { steps: 12 });
        await p.mouse.up();
        await snap('brushing');
      }
      for (let i = 0; i < 4 && (await p.locator('#lift').isDisabled()); i++)
        await p.locator('#sweep').click();
      await p.locator('#lift').click();
      await p.locator('#continue').waitFor();
      if (!dug) await snap('specimen');
      await p.locator('#continue').click();
      dug++;
    }
  }
  assert.equal(dug, 7);
  await p.locator('[data-tab="journal"]').click();
  assert.equal(await p.locator('.record-tile').count(), 8);
  await p.locator('[name=cause]').selectOption('avulsion');
  await p.locator('[name=departure]').selectOption('planned');
  await p.locator('[value="AS-005"]').check();
  await p.locator('[value="AS-007"]').check();
  await p.locator('#theory button').click();
  await assertText('#theory-note', 'citations recorded');
  await snap('journal');
  await p.reload();
  await p.locator('[data-tab="journal"]').click();
  assert.equal(await p.locator('[name=cause]').inputValue(), 'avulsion');
  await p.locator('#compare').click();
  await p.locator('#play').click();
  await p.waitForFunction(() => step === 1, {}, { timeout: 20000 });
  await p.locator('#play').click();
  await p.locator('[data-step="3"]').click();
  await snap('occupied');
  await p.locator('[data-step="7"]').click();
  await assertText('.score', 'Pressure: matches. Departure: matches.');
  await p.locator('#seed').click();
  await p.locator('#seed-input').fill('1847');
  await p.locator('#seed-form button').click();
  assert.equal(await p.evaluate(() => site.cause), 'drought');
  assert.equal(await p.evaluate(() => state.found.length), 1);
  await p.locator('#seed').click();
  await p.locator('#featured').click();
  assert.equal(await p.evaluate(() => state.found.length), 8);
  await p.setViewportSize({ width: 390, height: 844 });
  await snap('mobile');
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const fresh = await browser.newContext({ offline: true }),
    single = await fresh.newPage();
  single.on('pageerror', (e) => errors.push(e.message));
  single.on('request', (r) => {
    if (!r.url().startsWith('data:') && r.url() !== new URL('output/palimpsest.html', root).href)
      net.push(r.url());
  });
  await single.goto(new URL('output/palimpsest.html', root).href);
  await single.locator('#viewport canvas').waitFor();
  await single.locator('#excavate').click();
  await single.locator('#sweep').waitFor();
  assert.deepEqual(net, []);
  assert.deepEqual(errors, []);
  console.log(
    'Verified offline source and bundle, all eight records, brush interaction, provenance, journal persistence, historical replay, seed isolation and narrow layout.',
  );
} finally {
  await browser.close();
}
