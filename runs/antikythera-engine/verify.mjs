// Headless check of the Antikythera Engine page.
//   node runs/antikythera-engine/verify.mjs      (from the repository root, after npm ci)
// Checks: the page renders without errors; the JavaScript ephemeris and the
// brass angles agree with src/fixture.py (exact Python arithmetic on the tooth
// counts); every wheel of design.json is on stage; the cut sheets are a
// well-formed SVG with every wheel. Saves screenshots next to this file
// (ignored by git).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(execFileSync('python3', [join(here, 'src', 'fixture.py')]).toString());

const launch = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  const url = pathToFileURL(join(here, 'index.html')).href + '?jd=2461313.5&paused';
  await page.goto(url);
  await page.waitForFunction(() => window.__engine && window.__engine.frames() > 2, null, { timeout: 60000 });

  // 1. ephemeris port and brass angles against exact Python
  const got = await page.evaluate(fx => fx.map(f => ({
    ...f, jsTrue: window.__engine.trueLongitude(f.body, f.jd), jsBrass: window.__engine.brassLongitude(f.body, f.jd),
  })), fixture);
  const d = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  let worstTrue = 0, worstBrass = 0;
  for (const g of got) { worstTrue = Math.max(worstTrue, d(g.jsTrue, g.true)); worstBrass = Math.max(worstBrass, d(g.jsBrass, g.brass)); }
  assert.ok(worstTrue < 1e-6, `JS ephemeris differs from Python by ${worstTrue} deg`);
  assert.ok(worstBrass < 1e-6, `brass angles differ from exact arithmetic by ${worstBrass} deg`);

  // 2. the wheels on stage are exactly the design's, turning at the design's rates
  const stage = await page.evaluate(() => {
    const D = window.__engine.design, W = window.__engine.wheelAngles();
    const want = D.trains.flatMap(t => t.meshes.flatMap(m => [`${t.body}:${m.level}:${m.src}:${m.drv}`, `${t.body}:${m.level}:${m.dst}:${m.drn}`]));
    const have = W.map(w => `${w.body}:${w.level}:${w.axis}:${w.z}`);
    const finals = D.trains.map(t => { const last = W.filter(w => w.body === t.body && w.axis === 'C')[0]; return [last.rate, t.ratio[0] / t.ratio[1]]; });
    return { want: want.sort(), have: have.sort(), finals };
  });
  assert.deepEqual(stage.have, stage.want);
  for (const [rate, ratio] of stage.finals) assert.ok(Math.abs(rate - ratio) < 1e-12 * Math.max(1, ratio), `tube rate ${rate} != ratio ${ratio}`);

  // 3. the calendar: round trips across the Julian/Gregorian switch
  const cal = await page.evaluate(() => {
    const E = window.__engine;
    return [E.fmtDate(2451545.0), E.fmtDate(2299160.5), E.fmtDate(2299161.5), E.fmtDate(625673.5), E.jdFromDate(2000, 1, 1.5)];
  });
  assert.deepEqual(cal, ['1 January 2000', '15 October 1582', '16 October 1582', '1 January 3000 BC', 2451545.0]);

  // 4. it drew something, and the ledger follows the date
  await page.evaluate(() => window.__engine.setJD(2461313.5));
  await page.waitForTimeout(400);
  const date = await page.textContent('#dateMain');
  assert.equal(date, '30 September 2026');
  const px = await page.evaluate(() => {
    const c = document.getElementById('gl'), g = c.getContext('webgl2');
    const w = c.width, h = c.height, buf = new Uint8Array(w * h * 4);
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, buf);
    let lum = 0, lum2 = 0, n = 0;
    for (let i = 0; i < buf.length; i += 4 * 97) { const l = 0.3 * buf[i] + 0.59 * buf[i + 1] + 0.11 * buf[i + 2]; lum += l; lum2 += l * l; n++; }
    return { mean: lum / n, sd: Math.sqrt(lum2 / n - (lum / n) ** 2) };
  });
  assert.ok(px.mean > 8 && px.sd > 12, `canvas looks blank: ${JSON.stringify(px)}`);
  await page.screenshot({ path: join(here, 'verify-overview.png') });

  // 5. cut sheets
  const svg = await page.evaluate(() => window.__engine.cutSheets());
  const nWheels = await page.evaluate(() => window.__engine.design.trains.reduce((s, t) => s + 2 * t.meshes.length, 0) + window.__engine.design.moon.idlers + 2);
  assert.match(svg, /^<\?xml/);
  assert.equal((svg.match(/<path /g) || []).length, nWheels);
  assert.ok(svg.includes(`data-wheels="${nWheels}"`));

  // 6. a close look at the movement and the Earth
  await page.evaluate(() => window.__engine.setView('move'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(here, 'verify-movement.png') });
  await page.evaluate(() => { window.__engine.setView('earth'); window.__engine.focus('moon'); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(here, 'verify-moon.png') });

  assert.deepEqual(errors, []);
  console.log(`antikythera-engine: ${fixture.length} ephemeris/brass checks (worst ${worstTrue.toExponential(1)} / ${worstBrass.toExponential(1)} deg), ${stage.have.length} wheels, ${nWheels} on the cut sheets, OK`);
} finally {
  await browser.close();
}
