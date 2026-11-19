// verify.mjs: THRESHOLD in a real browser, driven by real keyboard input.
//   node verify.mjs            (after `pnpm install --frozen-lockfile` at the repository root and current Chrome)
//   CHROMIUM_PATH=/path/to/chrome node verify.mjs
// Renders with SwiftShader so it runs anywhere; frames are stepped by the test
// (the page's own loop is paused), physics runs at its fixed 120 Hz step.
// Screenshots go to output/verify/ (ignored by git).
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../../scripts/browser.mjs';
import { startServer } from './tools/serve.mjs';
import { GL_ARGS } from './tools/shoot.mjs';

const OUT = fileURLToPath(new URL('./output/verify/', import.meta.url));
await mkdir(OUT, { recursive: true });
const only = process.argv.slice(2);
const want = (name) => !only.length || only.some((o) => name.includes(o));
const report = [];
const log = (...a) => { const s = a.join(' '); console.log(s); report.push(s); };

const server = await startServer({ port: 0, quiet: true });
const browser = await launchBrowser({ headless: true, args: GL_ARGS });
const errors = [], requests = [];

async function open(query, { width = 1280, height = 720 } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(server.url) && !u.startsWith('data:') && !u.startsWith('blob:')) requests.push(u); });
  await page.goto(server.url + 'index.html?' + query);
  await page.waitForFunction(() => window.THR && window.THR.ready, null, { timeout: 120000 });
  await page.evaluate(() => { THR.app.manual = true; THR.app.post.params.grain = 0; });
  return page;
}
const shot = (page, name) => page.screenshot({ path: OUT + name + '.png' });
const state = (page) => page.evaluate(() => { const p = THR.app.player; return { world: p.world, feet: [...p.feet], eye: p.eye, look: [...p.look], up: [...p.up], vel: [...p.vel], crossings: THR.app.crossings || 0, grounded: p.grounded }; });
const render = (page, n = 1) => page.evaluate((n) => { for (let i = 0; i < n; i++) THR.frame(1 / 60); return THR.stats(); }, n);
// Step the simulation (no rendering) until `pred` holds or `seconds` pass.
const simUntil = (page, pred, seconds, dt = 1 / 60) => page.evaluate(({ pred, seconds, dt }) => {
  const f = new Function('app', 'P', `return (${pred});`);
  const P = (world, slot) => THR.app.space.portals(world).find((x) => x.slot === slot);
  let t = 0;
  while (t < seconds) { THR.frame(dt, { noRender: true }); t += dt; if (f(THR.app, P)) return { ok: true, t }; }
  return { ok: false, t };
}, { pred, seconds, dt });
// Mean colour of screen regions, read in the same task as the frame is drawn.
const sample = (page, regions) => page.evaluate((regions) => {
  THR.frame(1 / 240);
  const r = THR.app.renderer, gl = r.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  return regions.map(([x0, y0, x1, y1]) => {
    const w = Math.max(1, Math.round((x1 - x0) * W)), h = Math.max(1, Math.round((y1 - y0) * H));
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(Math.round(x0 * W), Math.round((1 - y1) * H), w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) { s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; }
    return s.map((v) => v / (w * h));
  });
}, regions);
const frameDiff = (page) => page.evaluate(() => {
  THR.frame(1 / 1000);
  const gl = THR.app.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return Array.from(px.filter((_, i) => i % 16 === 0));
});
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// Look around with the real mouse: drag (button held) by dx, dy pixels, in
// pieces that stay inside the viewport. 1 px = 0.0021 rad.
async function look(page, dx, dy = 0) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx) / 1000, Math.abs(dy) / 600)));
  for (let i = 0; i < n; i++) {
    const sx = 640 - dx / n / 2, sy = 360 - dy / n / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + dx / n, sy + dy / n, { steps: 8 });
    await page.mouse.up();
  }
}

try {
  // ── 1. The acceptance test: through the great door and back ───────────────
  if (want('acceptance')) {
    const page = await open('play&nosave&nolock&fresh&quality=3');
    await page.evaluate(() => THR.place('0,0', [0, 60, 26], 0, 0.03));
    await render(page, 8);
    await shot(page, 'a01-spawn');
    const s0 = await state(page);
    assert.equal(s0.world, '0,0');
    // Walk with the real W key towards the doorway, release short of it, then
    // ease in with brief taps until the eye is a few centimetres from the plane.
    const zOf = "(THR.app.player.eye[2] - P('0,0','E').xf.p[2])";
    await page.keyboard.down('KeyW');
    const r1 = await simUntil(page, `${zOf} < 0.45`, 30);
    await page.keyboard.up('KeyW');
    assert.ok(r1.ok, 'walked to the doorway');
    await simUntil(page, 'false', 0.3);
    let taps = 0;
    while (taps < 200) {
      const z = await page.evaluate(() => THR.app.player.eye[2] - THR.app.space.portals('0,0').find((p) => p.slot === 'E').xf.p[2]);
      if (z < 0.035) break;
      await page.keyboard.down('KeyW'); await simUntil(page, 'false', 1 / 120, 1 / 120);
      await page.keyboard.up('KeyW'); await simUntil(page, 'false', 1 / 30, 1 / 120);
      taps++;
    }
    const halfway = await state(page);
    const zh = halfway.eye[2] - (-32 + 0);
    log(`acceptance: walked ${(26 - halfway.feet[2]).toFixed(2)} m in ${r1.t.toFixed(2)} s, then ${taps} taps; eye ${(zh * 100).toFixed(1)} cm before the plane`);
    assert.equal(halfway.world, '0,0', 'still on the Threshold side');
    assert.ok(zh > 0 && zh < 0.05, 'standing in the doorway with the eye just before the plane');
    // Look around while standing in the doorway: real mouse movement.
    for (const [name, dx, dy] of [['a02-halfway-ahead', 0, 0], ['a03-halfway-left', -420, 0], ['a04-halfway-right', 840, 0], ['a05-halfway-down', -420, 260]]) {
      if (dx || dy) await look(page, dx, dy);
      await render(page, 2);
      await shot(page, name);
    }
    await look(page, 0, -260);
    // Pixel continuity across the plane: same view 5 mm before and 5 mm after.
    await page.evaluate(() => {
      const A = THR.app.space.portals('0,0').find((p) => p.slot === 'E');
      const p = THR.app.player; p.vel = [0, 0, 0];
      p.feet = [0.4, 60, A.xf.p[2] + 0.005]; p.look = [0, 0.13, 0, 0.99]; p.world = '0,0';
    });
    const before = await frameDiff(page);
    await page.evaluate(() => { const p = THR.app.player; p.moveBy([0, 0, -0.01], [0, 0, 0], 1 / 120); });
    const crossedTo = (await state(page)).world;
    const after = await frameDiff(page);
    let sum = 0, big = 0;
    for (let i = 0; i < before.length; i++) { const d = Math.abs(before[i] - after[i]); sum += d; if (d > 40) big++; }
    const meanDiff = sum / before.length, bigFrac = big / before.length;
    log(`acceptance: crossing continuity: world ${crossedTo}, mean |Δ| ${meanDiff.toFixed(2)} / 255, pixels changed by >40: ${(bigFrac * 100).toFixed(2)}%`);
    assert.equal(crossedTo, '1,0', 'a 1 cm step crosses the plane');
    assert.ok(meanDiff < 4 && bigFrac < 0.01, 'the image is continuous across the crossing');
    // Complete the crossing on foot and walk out into the desert.
    await page.keyboard.down('KeyW');
    await simUntil(page, 'false', 2.0);
    await page.keyboard.up('KeyW');
    const out = await state(page);
    assert.equal(out.world, '1,0', 'in the desert');
    await render(page, 6);
    await shot(page, 'a06-desert');
    // Turn round with the mouse: the doorway shows the Threshold behind.
    await look(page, 1496, 0);
    await render(page, 3);
    await shot(page, 'a07-turned');
    const tr = await page.evaluate(() => { const p = THR.app.player, A = THR.app.space.portals('1,0').find((x) => x.slot === 'W'); return { feet: p.feet, fwd: p.forward(), door: A.xf.p, n: A.n }; });
    log('acceptance: after turning: ' + JSON.stringify(tr, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)));
    const [mid, side] = await sample(page, [[0.45, 0.35, 0.55, 0.6], [0.02, 0.3, 0.12, 0.55]]);
    log(`acceptance: turned round: doorway luminance ${lum(mid).toFixed(1)} vs desert ${lum(side).toFixed(1)}`);
    assert.ok(lum(mid) > lum(side) * 1.25, 'the bright dawn platform is visible through the doorway');
    // Walk back through.
    await page.keyboard.down('KeyW');
    const r2 = await simUntil(page, "THR.app.player.world === '0,0'", 20);
    await simUntil(page, 'false', 1.0);
    await page.keyboard.up('KeyW');
    const back = await state(page);
    assert.ok(r2.ok, 'walked back to the Threshold');
    assert.equal(back.crossings, 2, 'exactly two crossings in the whole walk');
    await render(page, 3);
    await shot(page, 'a08-back');
    log(`acceptance: back on the Threshold at ${back.feet.map((v) => v.toFixed(2))}, ${back.crossings} crossings, grounded ${back.grounded}`);
    await page.close();
  }
  // ── 2. Impossible architecture ──────────────────────────────────────────
  if (want('impossible')) {
    const page = await open('play&nosave&nolock&fresh&quality=3');
    // The Endless Stoa: walk north for 25 s; the stoa is 44 m long.
    await page.evaluate(() => THR.place('0,0', [16.5, 60.24, 14], 0, 0));
    await render(page, 6);
    await shot(page, 'b01-stoa-looking-north');
    const c0 = (await state(page)).crossings;
    await page.keyboard.down('KeyW');
    let maxAbsZ = 0, minX = 99, maxX = -99;
    for (let k = 0; k < 25; k++) {
      await simUntil(page, 'false', 1);
      const s = await state(page);
      maxAbsZ = Math.max(maxAbsZ, Math.abs(s.feet[2])); minX = Math.min(minX, s.feet[0]); maxX = Math.max(maxX, s.feet[0]);
      assert.equal(s.world, '0,0');
    }
    await page.keyboard.up('KeyW');
    const sStoa = await state(page);
    log(`stoa: walked 25 s (~115 m) north inside a 44 m stoa: ${sStoa.crossings - c0} crossings, |z| never above ${maxAbsZ.toFixed(1)} m, x in [${minX.toFixed(2)}, ${maxX.toFixed(2)}]`);
    assert.ok(sStoa.crossings - c0 >= 2 && maxAbsZ < 23, 'the stoa loops');
    // The Cell: a seven-metre room whose door opens into a hall 160 m long.
    await page.evaluate(() => THR.place('0,0', [-2.5, 60, -6], Math.PI / 2, 0));
    await render(page, 6);
    await shot(page, 'b02-cell-door');
    await page.keyboard.down('KeyW');
    const rh = await simUntil(page, "THR.app.player.world === '0,0/hall'", 5);
    assert.ok(rh.ok, 'entered the hall through the cell door');
    await page.keyboard.down('ShiftLeft');
    await simUntil(page, 'false', 12);
    await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
    const sh = await state(page);
    log(`hall: entered after ${rh.t.toFixed(2)} s; then ran to z = ${sh.feet[2].toFixed(1)} m inside a room whose outside is 7 m across`);
    assert.equal(sh.world, '0,0/hall');
    assert.ok(sh.feet[2] < -80, 'ran more than 80 m inside');
    await render(page, 6);
    await shot(page, 'b03-hall');
    // The room that contains itself: east door -> west door.
    await page.evaluate(() => THR.place('3,0/mirror', [-2, 0, 0], -Math.PI / 2, 0));
    await render(page, 6);
    await shot(page, 'b04-mirror-east');
    const cm = (await state(page)).crossings;
    await page.keyboard.down('KeyW');
    const rm = await simUntil(page, `THR.app.crossings > ${cm}`, 6);
    await simUntil(page, 'false', 0.4);
    await page.keyboard.up('KeyW');
    const sm = await state(page);
    log(`mirror: walked out of the east door and came in by the west door at x = ${sm.feet[0].toFixed(2)}`);
    assert.ok(rm.ok && sm.world === '3,0/mirror' && sm.feet[0] < -4, 'east leads to west');
    // The window opens through the ceiling: fall back in from above, then stand.
    await page.evaluate(() => THR.place('3,0/mirror', [0, 1.0, -6.0], 0, 0));
    await simUntil(page, 'false', 0.3);
    const cw = (await state(page)).crossings;
    await page.keyboard.down('KeyW');
    const rw = await simUntil(page, `THR.app.crossings > ${cw}`, 4);
    await page.keyboard.up('KeyW');
    const s1 = await state(page);
    await render(page, 2);
    await shot(page, 'b05-through-the-skylight');
    const traj = [];
    for (let k = 0; k < 12; k++) { await simUntil(page, 'false', 0.25); const s = await state(page); traj.push([s.feet[1].toFixed(2), s.up.map((v) => v.toFixed(2)).join(','), s.grounded]); }
    const s2 = await state(page);
    log(`skylight: through the window after ${rw.t.toFixed(2)} s; eye at y ${s1.eye[1].toFixed(2)} with up (${s1.up.map((v) => v.toFixed(2))}); 3 s later feet y ${s2.feet[1].toFixed(2)}, up (${s2.up.map((v) => v.toFixed(2))}), grounded ${s2.grounded}`);
    log('skylight trajectory (y, up, grounded): ' + traj.map((t) => t.join(' ')).join(' | '));
    assert.ok(rw.ok && s1.eye[1] > 7, 'came in through the ceiling');
    assert.ok(s2.grounded && s2.up[1] > 0.99 && s2.feet[1] < 0.6, 'landed upright on the floor');
    await render(page, 3);
    await shot(page, 'b06-landed');
    await page.close();
  }
} finally {
  await writeFile(OUT + 'report.txt', report.join('\n') + '\n');
  await browser.close();
  await server.close();
}
if (errors.length) { console.log('page errors:\n  ' + [...new Set(errors)].slice(0, 20).join('\n  ')); }
assert.equal(errors.length, 0, 'no page errors');
assert.equal(requests.length, 0, 'no network requests outside the local server: ' + requests.join(', '));
console.log('verify: all checks passed');
