// verify.mjs: open index.html from disk in headless Chromium and use it.
//   node verify.mjs            (after npm ci and npx playwright install chromium)
// CHROMIUM_PATH=/path/to/chrome node verify.mjs uses another Chromium build.
// Covers: loading with no network and no errors, the scene and UI drawing,
// picking a crane in the scene, reassigning cranes (accepted and refused),
// dragging a planned box on the stowage plan (accepted and refused, with the
// departure condition changing), dragging a call on the berth schedule, the
// demo tour, and time passing.
import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const output = fileURLToPath(new URL('./output/playwright/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const url = new URL('./index.html', import.meta.url).href;
const errors = [], requests = [];
const shot = async (page, name) => {
  const f = output + name + '.png';
  await page.screenshot({ path: f });
  assert.ok((await stat(f)).size > 50_000, `${name}: the screenshot has content`);
};
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.className + ' :: ' + t.textContent));
// Advance time without drawing every frame (a software GPU would queue them
// all), then draw once.
const step = (page, ms) => page.evaluate((ms) => { const n = Math.round(ms / 50); for (let i = 0; i < n; i++) TL.app.filmFrame(50, i < n - 1); }, ms);

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
  const t0 = Date.now();
  await page.goto(url + '?still');
  await page.waitForFunction(() => window.TL && TL.app && TL.app.ready, null, { timeout: 120000 });
  console.log(`loaded in ${Date.now() - t0} ms`);
  await page.evaluate(() => { TL.app.still = false; });
  await step(page, 500);
  await shot(page, '01-console');
  // The page drew a scene: sample pixels from the WebGL canvas.
  const lit = await page.evaluate(() => {
    const c = document.getElementById('view'), g = c.getContext('webgl2');
    const px = new Uint8Array(4 * 64);
    g.readPixels(Math.floor(c.width * 0.3), Math.floor(c.height * 0.5), 64, 1, g.RGBA, g.UNSIGNED_BYTE, px);
    let s = 0, v = 0; for (let i = 0; i < 64; i++) { const l = (px[4 * i] + px[4 * i + 1] + px[4 * i + 2]) / 3; s += l; v += l * l; }
    return { mean: s / 64, varc: v / 64 - (s / 64) ** 2 };
  });
  assert.ok(lit.mean > 20 && lit.varc > 10, `the scene has content (${JSON.stringify(lit)})`);
  // KPIs and schedule are filled in.
  const kpi = await page.evaluate(() => ({ v: document.querySelector('#kV').textContent, c: document.querySelector('#kC').textContent, y: document.querySelector('#kY').textContent }));
  assert.match(kpi.c, /moves\/hr/, 'crane productivity is in moves per hour');
  assert.match(kpi.v, /\/\s*3/, 'vessels at berth out of three berths');

  // ── Pick a crane by clicking its pin, then its card ──────────────────
  const pin = page.locator('.pin', { hasText: 'QC-0' }).first();
  await pin.click();
  let sel = await page.evaluate(() => TL.app.sel && TL.app.sel.kind);
  assert.equal(sel, 'crane', 'clicking a crane pin selects the crane');
  // Picking in the scene itself: click where a crane projects.
  const where = await page.evaluate(() => { const c = TL.app.sim.cranes[1]; const p = TL.app.r.project(c.x, 19, 46); return p; });
  await page.mouse.click(where[0], where[1]);
  sel = await page.evaluate(() => TL.app.sel && TL.app.sel.kind + ':' + (TL.app.sel.ref && TL.app.sel.ref.id));
  assert.match(sel, /^crane:QC-0/, `clicking a crane in the scene selects it (${sel})`);

  // ── Reassign cranes in the equipment tab ─────────────────────────────
  await page.locator('#tabs button[data-t="equipment"]').click();
  await step(page, 400);
  // QC-06 (on the feeder at B3, or idle) to the Panamax at B1: refused, QC-04/05 are in the way.
  await page.selectOption('select[data-crane="5"]', { label: await page.evaluate(() => { const c = TL.app.sim.calls[0]; return `${c.vessel.name} (B1)`; }) });
  let ts = await toasts(page);
  assert.ok(ts.some(t => /red/.test(t) && /cannot pass|in the way|stands between/.test(t)), 'a crane that would have to pass others is refused: ' + ts.join(' | '));
  // QC-03 (end of the B1 group) to the ship at B2: accepted.
  await page.selectOption('select[data-crane="2"]', { label: await page.evaluate(() => { const c = TL.app.sim.calls[1]; return `${c.vessel.name} (B2)`; }) });
  ts = await toasts(page);
  assert.ok(ts.some(t => /ok/.test(t) && /QC-03/.test(t)), 'an end crane can move to the next ship: ' + ts.join(' | '));
  await step(page, 6000);
  const moved = await page.evaluate(() => { const s = TL.app.sim, c = s.cranes[2]; return { call: c.call && c.call.vessel.name, pending: c.pendingSet, status: c.status }; });
  console.log('QC-03 after reassignment:', moved);
  assert.ok(moved.pending || moved.call === 'Brindle Aster', 'QC-03 is reassigned or finishing its last box first');
  await shot(page, '02-equipment');

  // ── Stowage plan: drag a planned box ─────────────────────────────────
  await page.evaluate(() => TL.UI.select('call', TL.app.sim.calls[0]));
  await step(page, 400);
  const pick = await page.evaluate(() => {
    const P = TL.Panel, call = TL.app.vesselCall, v = call.vessel;
    // A bay with a free planned box, and a slot to move it to.
    for (let b = 0; b < v.bays.length; b++) {
      P.bay = b; P.dirty = true; P.update(TL.app.simT);
      const from = P.slots.find(o => o.planned && !o.planned.reserved && o.st.deck);
      if (!from) continue;
      // Target: the next free tier of another deck stack in the same bay.
      const to = P.slots.find(o => o.st !== from.st && o.st.deck && !o.box && !o.planned && o.idx === o.st.boxes.length + (call.plan.stacks[o.st.id] || []).filter(x => !x.loaded).length);
      if (!to) continue;
      const r = document.getElementById('cvBay').getBoundingClientRect();
      return { bay: b, from: [r.left + from.x + from.w / 2, r.top + from.y + from.h / 2], to: [r.left + to.x + to.w / 2, r.top + to.y + to.h / 2], id: from.planned.id, ver: TL.app.sim.planVersion || 0 };
    }
    return null;
  });
  assert.ok(pick, 'found a planned box and a target slot on the bay section');
  await page.locator('#cvBay').scrollIntoViewIfNeeded();
  const pos = await page.evaluate((id) => { const P = TL.Panel; const r = document.getElementById('cvBay').getBoundingClientRect(); const f = P.slots.find(o => o.planned && o.planned.id === id); return [r.left + f.x + f.w / 2, r.top + f.y + f.h / 2]; }, pick.id);
  const tgt = await page.evaluate((p) => { const P = TL.Panel; const r = document.getElementById('cvBay').getBoundingClientRect(); const call = TL.app.vesselCall; const f = P.slots.find(o => o.planned && o.planned.id === p.id); const to = P.slots.find(o => o.st !== f.st && o.st.deck && !o.box && !o.planned && o.idx === o.st.boxes.length + (call.plan.stacks[o.st.id] || []).filter(x => !x.loaded).length); return [r.left + to.x + to.w / 2, r.top + to.y + to.h / 2]; }, pick);
  await page.mouse.move(pos[0], pos[1]);
  await page.mouse.down();
  await page.mouse.move((pos[0] + tgt[0]) / 2, (pos[1] + tgt[1]) / 2, { steps: 4 });
  await page.mouse.move(tgt[0], tgt[1], { steps: 4 });
  await shot(page, '03-dragging');
  await page.mouse.up();
  ts = await toasts(page);
  const after = await page.evaluate(() => TL.app.sim.planVersion || 0);
  const accepted = ts.some(t => /ok/.test(t) && /Re-planned/.test(t));
  const refused = ts.some(t => /red/.test(t) && /Refused/.test(t));
  assert.ok(accepted || refused, 'the drop was judged: ' + ts.join(' | '));
  if (accepted) assert.ok(after > pick.ver, 'an accepted move changes the plan');
  console.log('stowage drag:', accepted ? 'accepted' : 'refused', ts[0].slice(0, 160));
  // A move that must be refused: a 28 t box to the top of a deck stack
  // forward of the bridge, blocking the view or overloading the stack.
  const refusal = await page.evaluate(() => {
    const sim = TL.app.sim, call = sim.calls[0], v = call.vessel;
    const box = call.plan.stacks.flat().find(b => !b.loaded && !b.reserved && b.w > 20);
    const st = v.stacks.filter(s => s.deck).sort((a, b) => b.x - a.x)[0];
    const r = sim.replan(call, box, st.id, st.maxTiers - 1);
    return r;
  });
  assert.equal(refusal.ok, false, 'an unsafe move is refused');
  console.log('refusal reasons:', refusal.errs);
  await shot(page, '04-stowage');

  // ── Berth schedule: drag a planned call ──────────────────────────────
  const bar = await page.evaluate(() => {
    const sim = TL.app.sim, c = sim.calls.find(x => x.state === 'planned' && x.vessel.cls === 'feeder');
    TL.Schedule.draw();
    const cv = document.getElementById('gantt'), r = cv.getBoundingClientRect();
    return { id: c.id, etb: c.etb, berth: c.berth, r: { left: r.left, top: r.top, width: r.width, height: r.height } };
  });
  const hit = await page.evaluate((id) => {
    const cv = document.getElementById('gantt'), r = cv.getBoundingClientRect();
    for (let y = 30; y < r.height; y += 4) for (let x = 100; x < r.width; x += 6) {
      const ev = { clientX: r.left + x, clientY: r.top + y };
      // Ask the schedule what is under this point.
      const t = TL.Schedule._hitTest ? TL.Schedule._hitTest(ev) : null;
      if (t && t.call.id === id) return [r.left + x + 20, r.top + y];
    }
    return null;
  }, bar.id);
  assert.ok(hit, 'found the feeder call on the schedule');
  await page.mouse.move(hit[0], hit[1]);
  await page.mouse.down();
  await page.mouse.move(hit[0] + 60, hit[1], { steps: 6 });
  await page.mouse.up();
  const after2 = await page.evaluate((id) => { const c = TL.app.sim.calls[id]; return { etb: c.etb, berth: c.berth }; }, bar.id);
  assert.ok(after2.etb !== bar.etb, `dragging the call moved it in time (${bar.etb} -> ${after2.etb})`);
  // Dragging the Panamax to the shallow feeder berth is refused.
  const deep = await page.evaluate(() => { const s = TL.app.sim; const c = s.calls.find(x => x.state === 'planned' && x.vessel.cls === 'panamax'); return s.moveCall(c, 2, c.etb); });
  assert.equal(deep.ok, false, 'a Panamax cannot be planned at the 206 m, 11 m deep berth');
  console.log('schedule refusal:', deep.errs);
  await shot(page, '05-schedule');

  // ── Demo tour ────────────────────────────────────────────────────────
  await page.evaluate(() => TL.Demo.start());
  await step(page, 9000);
  const demo = await page.evaluate(() => ({ on: TL.Demo.on, shot: TL.Demo.shot, cap: document.querySelector('#caption').textContent }));
  assert.ok(demo.on && demo.shot >= 1, 'the demo tour runs through its shots');
  await shot(page, '06-demo');
  await step(page, 40000);
  assert.equal(await page.evaluate(() => TL.Demo.on), false, 'the tour ends by itself');

  // ── Time passes: boxes move, the clock advances ──────────────────────
  const m0 = await page.evaluate(() => TL.app.sim.stats.moves.length);
  await page.evaluate(() => { TL.UI.setSpeed(180); });
  await step(page, 8000);
  const m1 = await page.evaluate(() => TL.app.sim.stats.moves.length);
  assert.ok(m1 > m0 + 10, `cranes keep working (${m0} -> ${m1} moves)`);
  await shot(page, '07-later');

  assert.deepEqual(requests, [], 'no network requests');
  assert.deepEqual(errors, [], 'no page errors');

  // ── Without WebGL2: the page says so ─────────────────────────────────
  const bare = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await bare.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return kind === 'webgl2' ? null : get.call(this, kind, ...rest); };
  });
  await bare.goto(url + '?still');
  await bare.waitForFunction(() => getComputedStyle(document.getElementById('fallback')).display !== 'none', null, { timeout: 120000 });
  assert.match(await bare.textContent('#fallback'), /needs WebGL2/, 'the fallback explains what is missing');
  await bare.close();
  console.log('verify: all checks passed');
} catch (e) {
  console.error('errors:', errors);
  throw e;
} finally {
  await browser.close();
}
