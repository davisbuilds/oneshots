import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { launchBrowser } from '../../scripts/browser.mjs';
const require = createRequire(import.meta.url);
const { World, GENES } = require('./engine.js');
const root = fileURLToPath(new URL('./', import.meta.url));
const output = root + 'output/playwright/';
await mkdir(output, { recursive: true });
execFileSync(process.execPath, ['build.cjs'], { cwd: root });
const browser = await launchBrowser();
const errors = [],
  requests = [];
const state = (p) => p.evaluate(() => CambrianStation.observe());
function watch(page) {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
}
const click = (p, id) => p.locator('#' + id).click();
const shot = (p, name) => p.screenshot({ path: output + name + '.png', fullPage: true });
async function settle(p) {
  await p.waitForFunction(() => !CambrianStation.observe().pending);
  await p.waitForTimeout(230);
}
async function pause(p) {
  if ((await state(p)).running) await click(p, 'play');
  await settle(p);
}
function rebuild({ seed, mutation, environment, ticks, actions }) {
  const world = new World({ seed, mutation, environment });
  for (const a of actions) {
    world.step(a.tick - world.tick);
    world.action(a.action);
  }
  world.step(ticks - world.tick);
  return world;
}
const wrapDelta = (value, span) => value - Math.round(value / span) * span;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 970 }, offline: true });
  const p = await context.newPage();
  watch(p);
  await p.goto(new URL('./index.html', import.meta.url).href);
  await p.waitForSelector('#reticle:visible');
  await shot(p, '02-live');
  await pause(p);
  let s = await state(p),
    t = s.summary.tick;
  assert.equal(s.record.seed, 4172);
  assert.ok(t >= 296 && s.summary.births > 0);
  assert.deepEqual(s.summary, rebuild(s.record).summary());
  await p.waitForTimeout(250);
  assert.equal((await state(p)).summary.tick, t);
  await click(p, 'step');
  assert.equal((await state(p)).summary.tick, ++t);
  await click(p, 'zoomIn');
  assert.ok((await state(p)).zoom > s.zoom);
  await click(p, 'zoomOut');
  // Pick a different real cell via the same simulated camera geometry as the ruler.
  s = await state(p);
  const world = rebuild(s.record);
  const selected = world.organisms.find((o) => o.id === s.selectedId);
  const box = await p.locator('#fieldCanvas').boundingBox(),
    target = await p.locator('#reticle').boundingBox();
  const scale = s.zoom * Math.min(box.width / world.width, box.height / world.height);
  const x0 = target.x + target.width / 2,
    y0 = target.y + target.height / 2;
  const cells = world.organisms
    .filter((o) => o.id !== selected.id)
    .map((o) => ({
      o,
      x: x0 + wrapDelta(o.x - selected.x, world.width) * scale,
      y: y0 + wrapDelta(o.y - selected.y, world.height) * scale,
    }))
    .filter(
      (v) =>
        v.x > box.x + 20 &&
        v.x < box.x + box.width - 20 &&
        v.y > box.y + 40 &&
        v.y < box.y + box.height - 42,
    );
  assert.ok(cells.length > 2);
  const pick = cells.find((v) => v.o.generation > 0) ?? cells[0];
  await p.mouse.click(pick.x, pick.y);
  s = await state(p);
  assert.notEqual(s.selectedId, selected.id);
  await p.getByRole('button', { name: 'Genome', exact: true }).click();
  await p.waitForFunction((n) => document.querySelectorAll('.gene').length === n, GENES.length);
  await p.getByRole('button', { name: 'Ancestors', exact: true }).click();
  await p.waitForSelector('.ancestor');
  const archived = Number(await p.locator('.ancestor').last().getAttribute('data-ancestor'));
  await p.locator('.ancestor').last().click();
  await settle(p);
  assert.equal((await state(p)).selectedId, archived);
  assert.equal((await state(p)).history, true);
  await click(p, 'returnLive');
  await pause(p);
  await p.getByRole('button', { name: 'Anatomy', exact: true }).click();
  await click(p, 'trace');
  // Let the same culture diversify before selecting a branching family.
  await p.locator('#speed').selectOption('64');
  await click(p, 'play');
  await p.waitForFunction(() => CambrianStation.observe().summary.tick >= 1000);
  await pause(p);
  // Choose a measured family with multiple branches, including an extinct direct clade.
  const phy = rebuild((await state(p)).record),
    families = new Map();
  for (const l of phy.lineages) {
    let ancestor = l;
    while (ancestor.parentId) ancestor = phy.lineages[ancestor.parentId - 1];
    if (!families.has(ancestor.id)) families.set(ancestor.id, []);
    families.get(ancestor.id).push(l);
  }
  const family = [...families.values()].sort((a, b) => b.length - a.length)[0];
  assert.ok(family.length >= 3);
  await p.locator('#family').selectOption(String(family[0].id));
  await settle(p);
  const member = family.find((l) => l.parentId && l.living > 0);
  await p.locator('#branch').selectOption(String(member.id));
  await settle(p);
  await shot(p, '03-lineage');
  await p.locator('#scrub').fill('0');
  await settle(p);
  const atOrigin = await state(p);
  assert.equal(atOrigin.summary.tick, 0);
  assert.equal(Number(await p.locator('#branch').inputValue()), atOrigin.branch);
  assert.equal(Number(await p.locator('#family').inputValue()), atOrigin.branch);
  await click(p, 'returnLive');
  await pause(p);
  await p.locator('#family').selectOption(String(family[0].id));
  await settle(p);
  await p.locator('#branch').selectOption(String(member.id));
  await settle(p);
  await click(p, 'branchOrigin');
  await settle(p);
  s = await state(p);
  assert.equal(s.summary.tick, member.origin);
  assert.equal(s.selectedId, member.founderId);
  await click(p, 'returnLive');
  await pause(p);
  await click(p, 'perturb');
  await p.getByRole('button', { name: 'Amber-rich', exact: true }).click();
  await settle(p);
  s = await state(p);
  assert.equal(s.record.actions.length, 1);
  assert.deepEqual(s.control, s.summary);
  await p.locator('#speed').selectOption('64');
  await click(p, 'play');
  await p.waitForFunction((t) => CambrianStation.observe().summary.tick > t + 600, s.summary.tick);
  await pause(p);
  s = await state(p);
  assert.equal(s.control.tick, s.summary.tick);
  assert.notDeepEqual(s.control.diet, s.summary.diet);
  await p.getByRole('button', { name: 'Ecology', exact: true }).click();
  await settle(p);
  assert.match(await p.locator('#comparison').innerText(), /Paired control/);
  await p.locator('#trait').selectOption('0');
  await shot(p, '04-ecology');
  const download = p.waitForEvent('download');
  await click(p, 'export');
  const dest = output + 'replay.json';
  await (await download).saveAs(dest);
  const exported = JSON.parse(await readFile(dest, 'utf8'));
  const cli = JSON.parse(
    execFileSync(process.execPath, ['lab.cjs', '--replay', dest], { cwd: root, encoding: 'utf8' }),
  );
  assert.deepEqual(exported.samples, cli.samples);
  assert.deepEqual(exported.final, cli.samples.at(-1));
  const controlReplay = JSON.parse(
    execFileSync(process.execPath, ['lab.cjs', '--replay', dest, '--control'], {
      cwd: root,
      encoding: 'utf8',
    }),
  );
  assert.deepEqual(exported.control.final, controlReplay.samples.at(-1));
  await p.locator('.event').first().click();
  await settle(p);
  assert.equal((await state(p)).history, true);
  await p.waitForFunction(() => !CambrianStation.observe().running);
  if ((await state(p)).history) await click(p, 'returnLive');
  await p.locator('#speed').selectOption('1');
  await click(p, 'cinema');
  await p.waitForSelector('#caption:visible');
  await shot(p, '05-cinematic');
  assert.equal(await p.locator('#cinema').getAttribute('aria-pressed'), 'true');
  const pacing = await p.evaluate(async () => {
    const durations = [];
    let previous = null;
    await new Promise((done) => {
      function frame(now) {
        if (previous !== null) durations.push(now - previous);
        previous = now;
        if (durations.length === 120) done();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    durations.sort((a, b) => a - b);
    return {
      frames: durations.length,
      medianFrameMs: durations[59],
      p95FrameMs: durations[113],
      population: CambrianStation.observe().summary.population,
    };
  });
  console.log('Cinematic desktop frame intervals', pacing);
  await writeFile(output + 'frame-intervals.json', JSON.stringify(pacing, null, 2) + '\n');
  await click(p, 'guide');
  assert.match(await p.locator('dialog').innerText(), /digestive|gut locus/);
  const popup = context.waitForEvent('page');
  await p.locator('.study-link').click();
  const study = await popup;
  watch(study);
  await study.waitForFunction(
    () => window.CambrianStation?.observe().summary.tick === 14400 && !CambrianStation.observe().pending,
  );
  await settle(study);
  const studyState = await state(study);
  assert.equal(studyState.view, 'ecology');
  assert.equal(studyState.running, false);
  const receipt = JSON.parse(await readFile(root + 'experiments/mosaic.json', 'utf8'))
    .rows.find((r) => r.seed === 73)
    .mutation.at(-1);
  assert.equal(studyState.summary.population, receipt.population);
  const caption = await study.locator('#occupancy').innerText();
  assert.ok(caption.includes((100 * receipt.occupancy.low.meanInitialJadeShare).toFixed(1) + '%'));
  await shot(study, '07-mosaic');
  const obs = rebuild(studyState.record);
  const origin = new World({ seed: 73 });
  const point = obs.organisms[0],
    chart = await study.locator('#habitatChart').boundingBox();
  const index =
    Math.floor((point.x / origin.width) * origin.cols) +
    Math.floor((point.y / origin.height) * origin.rows) * origin.cols;
  const share = origin.jade[index] / (origin.jade[index] + origin.amber[index]);
  await study.mouse.click(
    chart.x + 42 + (chart.width - 56) * point.traits.gut,
    chart.y + chart.height - 19 - (chart.height - 29) * share,
  );
  assert.equal((await state(study)).view, 'field');
  await study.close();
  await p.keyboard.press('Escape');
  await click(p, 'configure');
  await p.locator('#seedInput').fill('73');
  await p.locator('#newMutation').uncheck();
  await p.locator('#newEnv').selectOption('jade');
  await p.getByRole('button', { name: 'Start culture', exact: true }).click();
  await pause(p);
  s = await state(p);
  assert.equal(s.record.seed, 73);
  assert.equal(s.record.environment, 'jade');
  assert.equal(s.record.mutation, false);
  assert.equal(s.control, null);
  assert.deepEqual(s.record.actions, []);
  const mobile = await context.newPage();
  watch(mobile);
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(new URL('./output/cambrian-engine.html', import.meta.url).href);
  await mobile.waitForSelector('#reticle:visible');
  await shot(mobile, '06-mobile');
  for (const view of ['atlas', 'ecology', 'field']) {
    await mobile.locator('[data-view="' + view + '"]').click();
    await settle(mobile);
    assert.ok(
      await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      view + ' fits mobile',
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log(
    'Offline source and bundled HTML passed · specimen picking, time lens, lineage, paired exposure, CLI replay, cinematic, new culture and mobile.',
  );
} finally {
  await browser.close();
}
