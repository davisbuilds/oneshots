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

async function open(query, { width = 1280, height = 720, context = null } = {}) {
  const page = context ? await context.newPage() : await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(server.url) && !u.startsWith('data:') && !u.startsWith('blob:')) requests.push(u); });
  await page.goto(server.url + 'index.html?' + query);
  await page.waitForFunction(() => window.THR && window.THR.ready, null, { timeout: 120000 });
  await page.evaluate(() => { THR.app.manual = true; THR.app.post.params.grain = 0; });
  return page;
}
const shot = (page, name) => page.screenshot({ path: OUT + name + '.png', timeout: 240000 });
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
    // the real spawn: on the terrace, four metres above the deck; the walk goes down its stair
    await page.evaluate(() => { const s = THR.app.descs.get('0,0').spawn; THR.place('0,0', s.feet, s.yaw, 0.03); });
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
    log(`acceptance: walked ${(s0.feet[2] - halfway.feet[2]).toFixed(2)} m from the spawn, down the terrace stair, in ${r1.t.toFixed(2)} s, then ${taps} taps; eye ${(zh * 100).toFixed(1)} cm before the plane`);
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
    // The sideways door: through it the room lies on its side; walk in and be righted.
    await page.evaluate(() => {
      const A = THR.app.space.portals('1,0').find((p) => p.slot === 'tilt'), d = THR.app.descs.get('1,0');
      const x = A.xf.p[0] + A.n[0] * 5, z = A.xf.p[2] + A.n[2] * 5;
      THR.place('1,0', [x, d.heightAt(x, z) + 0.2, z], Math.atan2(A.n[0], A.n[2]), 0.05);
    });
    await simUntil(page, 'false', 0.4); await render(page, 4);
    await shot(page, 'b07-sideways-door');
    const ct = (await state(page)).crossings;
    await page.keyboard.down('KeyW');
    const rt = await simUntil(page, `THR.app.crossings > ${ct}`, 6);
    await simUntil(page, 'false', 0.15);
    await page.keyboard.up('KeyW');
    const st1 = await state(page);
    await simUntil(page, 'false', 1.5);
    const st2 = await state(page);
    log(`sideways door: entered ${st1.world} with up (${st1.up.map((v) => v.toFixed(2))}); 1.5 s later up (${st2.up.map((v) => v.toFixed(2))}), grounded ${st2.grounded}, feet y ${st2.feet[1].toFixed(2)}`);
    assert.ok(rt.ok && st1.world === '1,0/tilt' && st1.up[1] < 0.98, 'arrived turned relative to the room');
    assert.ok(st2.grounded && st2.up[1] > 0.99 && Math.abs(st2.feet[1]) < 0.4, 'righted onto the floor');
    await render(page, 3);
    await shot(page, 'b08-leaning-room');
    await page.close();
  }
  // ── 3. Discovery and persistence across a reload ────────────────────────
  if (want('persistence')) {
    // one browser context, so later pages share this page's local storage
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await open('play&nolock&fresh&quality=2', { context: ctx });
    // take the instrument from the pedestal with E, raise it with Q
    await page.evaluate(() => { const p = THR.app.descs.get('0,0').instrument.p; THR.place('0,0', [p[0], p[1] - 1.45, p[2] + 2.6], 0, -0.4); });
    await render(page, 4);
    await page.keyboard.press('KeyE'); await render(page, 1);
    const took = await page.evaluate(() => THR.app.save.data.instrument);
    assert.ok(took, 'took the instrument with E');
    await page.evaluate(() => THR.place('0,0', [0.5, 60, 4], 0, 0.02));
    await page.keyboard.press('KeyQ'); await simUntil(page, 'false', 0.8); await render(page, 2);
    await shot(page, 'c01-instrument');
    // wake the Threshold's lodestone, behind the great door
    await page.evaluate(() => THR.place('0,0', [0, 60, -37.6], 0, 0.1));
    await render(page, 2);
    const prompt = await page.evaluate(() => document.querySelector('.prompt').textContent);
    await page.keyboard.press('KeyE'); await simUntil(page, 'false', 1.5); await render(page, 2);
    await shot(page, 'c02-lodestone-awake');
    // walk into the desert so it is visited, then open the journal
    await page.evaluate(() => THR.place('0,0', [0, 60, -30], 0, 0));
    await page.keyboard.down('KeyW'); await simUntil(page, "THR.app.player.world === '1,0'", 5); await simUntil(page, 'false', 1.5); await page.keyboard.up('KeyW');
    await simUntil(page, 'false', 3); await render(page, 2);
    await page.keyboard.press('KeyJ'); await render(page, 1);
    await shot(page, 'c03-journal');
    const j = await page.evaluate(() => [...document.querySelectorAll('.j-n')].map((e) => e.textContent));
    await page.keyboard.press('KeyJ');
    const pos = await page.evaluate(() => { THR.app.save.setPos(THR.app.player.world, THR.app.player.feet, THR.app.player.look); THR.app.save.flush(); return { w: THR.app.player.world, f: THR.app.player.feet }; });
    log(`persistence: prompt "${prompt}", journal lists ${JSON.stringify(j)}, saved at ${pos.w} ${pos.f.map((v) => v.toFixed(1))}`);
    assert.match(prompt, /wake the lodestone/);
    assert.ok(j.length >= 2 && j.some((n) => /Ashmere/.test(n)), 'the journal lists the worlds visited');
    // reload the page: the world is regenerated from its seed, the overlay restores the changes
    await page.goto(page.url().replace('&fresh', ''));
    await page.waitForFunction(() => window.THR && window.THR.ready, null, { timeout: 120000 });
    await page.evaluate(() => { THR.app.manual = true; THR.app.state = 'play'; });
    await render(page, 4);
    const after = await page.evaluate(() => ({ w: THR.app.player.world, f: THR.app.player.feet, lit: THR.app.save.isLit('0,0'), inst: THR.app.save.data.instrument, visited: Object.keys(THR.app.save.data.visited) }));
    log(`persistence: after reload at ${after.w} ${after.f.map((v) => v.toFixed(1))}; lodestone lit ${after.lit}; instrument ${after.inst}; visited ${after.visited.join(' ')}`);
    assert.equal(after.w, pos.w); assert.ok(Math.hypot(after.f[0] - pos.f[0], after.f[2] - pos.f[2]) < 0.5, 'position restored');
    assert.ok(after.lit && after.inst && after.visited.includes('1,0'), 'discoveries restored');
    await page.evaluate(() => THR.place('0,0', [0, 60, -36], Math.PI, 0.3));
    await render(page, 6);
    const lit = await page.evaluate(() => THR.app.views.get('0,0').lodestone.lit);
    assert.ok(lit, 'the regenerated Threshold shows its lodestone awake');
    // measuring performance leaves the journey alone: ?bench keeps its own save in memory
    const home = page.url();
    const bench = await ctx.newPage();
    bench.on('pageerror', (e) => errors.push(e.message));
    await bench.goto(server.url + 'index.html?bench=fast&quality=1');
    await bench.waitForFunction(() => window.THR && window.THR.ready, null, { timeout: 120000 });
    const benchSave = await bench.evaluate(() => {
      const s = THR.app.save, fresh = !Object.keys(s.data.visited).length && !s.data.instrument;
      s.setPos('9,9', [0, 0, 0], [0, 0, 0, 1]); s.light('9,9'); s.flush();
      return { fresh, persisted: !!s.storage };
    });
    await bench.close();
    assert.ok(benchSave.fresh && !benchSave.persisted, 'the benchmark starts from an empty save that is never written');
    // another universe has its own journey: the same addresses are other worlds there
    await page.goto(home + '&universe=2');
    await page.waitForFunction(() => window.THR && window.THR.ready, null, { timeout: 120000 });
    const u2 = await page.evaluate(() => { THR.app.manual = true; const s = THR.app.save.data; return { w: THR.app.player.world, f: THR.app.player.feet, visited: Object.keys(s.visited), lit: Object.keys(s.lit), inst: s.instrument }; });
    log(`persistence: universe 2 starts at ${u2.w} ${u2.f.map((v) => v.toFixed(1))}; visited ${u2.visited.join(' ') || 'nothing'}; lit ${u2.lit.length}`);
    assert.ok(u2.w === '0,0' && !u2.visited.includes('1,0') && !u2.lit.length && !u2.inst, 'another universe does not inherit this journey');
    // forgetting everything there stays in that universe and leaves this one alone
    await Promise.all([page.waitForURL(/fresh/), page.evaluate(() => THR.app.action('reset'))]);
    assert.match(page.url(), /universe=2/, 'reset keeps the universe');
    await page.goto(home);
    await page.waitForFunction(() => window.THR && window.THR.ready, null, { timeout: 120000 });
    const back = await page.evaluate(() => { THR.app.manual = true; const s = THR.app.save.data; return { pos: s.pos, lit: Object.keys(s.lit), inst: s.instrument, visited: Object.keys(s.visited) }; });
    assert.equal(back.pos.world, pos.w, 'the benchmark did not move the saved position');
    assert.ok(back.inst && back.lit.includes('0,0') && !back.lit.includes('9,9') && back.visited.includes('1,0'), 'this journey survives the other universe and the benchmark');
    await ctx.close();
  }

  // ── 4. Streaming stays bounded while travelling through many worlds ──────
  if (want('streaming')) {
    const page = await open('play&nosave&nolock&fresh&quality=1');
    const keys = []; let i = 0, j = 0;
    for (let k = 0; k < 30; k++) { keys.push(`${i},${j}`); i += k % 3 === 2 ? 0 : 1; j += k % 3 === 2 ? 1 : 0; }
    const rows = [];
    for (const k of keys) {
      const r = await page.evaluate((k) => {
        const d = THR.app.descs.get(k), s = d.spawn.feet;
        THR.place(k, [s[0], s[1] + 0.5, s[2]], 0, 0);
        for (let n = 0; n < 3; n++) THR.frame(1 / 30);
        const st = THR.stats(), m = THR.app.renderer.info.memory;
        let tiles = 0; for (const v of THR.app.views.map.values()) tiles += v.counts().tiles;
        return { k, views: THR.app.views.map.size, geometries: m.geometries, textures: m.textures, tiles, built: st.built, disposed: st.disposed, ms: THR.app.views.lastBuildMs };
      }, k);
      rows.push(r);
    }
    const cap = await page.evaluate(() => THR.app.views.capacity);
    const maxViews = Math.max(...rows.map((r) => r.views)), maxGeo = Math.max(...rows.map((r) => r.geometries));
    const firstHalf = Math.max(...rows.slice(5, 15).map((r) => r.geometries)), secondHalf = Math.max(...rows.slice(15).map((r) => r.geometries));
    log(`streaming: 30 worlds visited; built ${rows.at(-1).built}, disposed ${rows.at(-1).disposed}; loaded worlds max ${maxViews}/${cap}; geometries max ${maxGeo} (worlds 5-15: ${firstHalf}, 15-30: ${secondHalf}); textures max ${Math.max(...rows.map((r) => r.textures))}; terrain tiles max ${Math.max(...rows.map((r) => r.tiles))}`);
    await writeFile(OUT + 'streaming.json', JSON.stringify(rows, null, 1));
    assert.ok(maxViews <= cap, 'loaded worlds never exceed the cache capacity');
    assert.ok(rows.at(-1).disposed >= 20, 'worlds left behind were disposed');
    assert.ok(secondHalf < firstHalf * 1.6, 'GPU geometry count does not keep growing');
    await page.close();
  }

  // ── 5. Recursion budgets and extreme views in the live renderer ──────────
  if (want('budget')) {
    const page = await open('play&nosave&nolock&fresh&quality=4');
    for (const [depth, budget] of [[1, 2], [2, 4], [3, 8], [5, 24]]) {
      const st = await page.evaluate(([depth, budget]) => {
        THR.app.pr.settings.maxDepth = depth; THR.app.pr.settings.maxRenders = budget; THR.app.qPinned = true;
        THR.place('3,0/mirror', [-2, 0, 0.3], -Math.PI / 2, 0.02);
        THR.frame(1 / 60); THR.frame(1 / 60); THR.frame(1 / 60);
        return THR.stats();
      }, [depth, budget]);
      log(`budget: depth ${depth}, budget ${budget}: rendered ${st.portalsRendered}, filled ${st.portalsFilled}, max level ${st.maxLevel}, world renders ${st.worldRenders}, draws ${st.calls}`);
      assert.ok(st.maxLevel <= depth && st.portalsRendered <= budget && st.worldRenders === st.portalsRendered + 1);
    }
    await shot(page, 'd01-mirror-deep');
    // extreme angles: grazing the plane of the great door; straight up the skylight; straight down at a doorway's threshold
    const cases = [['0,0', [6.6, 60, -32.2], -Math.PI / 2 + 0.03, 0], ['3,0/mirror', [0.3, 0, 0.2], 0, 1.5], ['0,0', [0.2, 60, -31.95], 0, -1.45], ['0,0', [0.2, 60, -32.05], Math.PI, -1.45]];
    let n = 0;
    for (const [w, f, yaw, pitch] of cases) {
      const r = await page.evaluate(([w, f, yaw, pitch]) => {
        THR.place(w, f, yaw, pitch); THR.frame(1 / 60); THR.frame(1 / 60);
        const gl = THR.app.renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
        const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let black = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] < 4) black++;
        return { world: THR.app.player.world, black: black / (W * H), st: THR.stats() };
      }, [w, f, yaw, pitch]);
      await shot(page, `d0${2 + n++}-extreme`);
      log(`extreme view ${n}: ${w} pitch ${pitch}: black pixels ${(r.black * 100).toFixed(2)}%, world renders ${r.st.worldRenders}, near-zone portals ${r.st.nearZone}`);
      assert.ok(r.black < 0.02, 'no holes or NaN pixels');
    }
    await page.close();
  }

  // ── 6. The cinematic demo runs through every shot ─────────────────────────
  if (want('demo')) {
    const page = await open('nosave&quality=1');
    const r = await page.evaluate(() => {
      THR.app.start(true);
      const worlds = new Set(); let t = 0;
      while (THR.app.demo.active && t < 90) { THR.frame(1 / 30, { noRender: t % 1 > 0.05 }); worlds.add(THR.app.player.world); t += 1 / 30; }
      return { t, worlds: [...worlds], crossings: THR.app.crossings || 0, done: THR.app.demo.done };
    });
    log(`demo: finished after ${r.t.toFixed(1)} s, ${r.crossings} real crossings, worlds ${r.worlds.join(' ')}`);
    assert.ok(r.done && r.t >= 45 && r.t <= 62, 'a 45 to 60 second journey');
    assert.ok(r.crossings >= 5 && r.worlds.length >= 5);
    await page.close();
    // "Watch the journey" from the pause screen: the film is not hidden behind
    // the pause panel, and a click on the picture hands control back
    const p2 = await open('play&fresh&nolock&quality=1');
    const savedPosition = await p2.evaluate(() => {
      const { save, player } = THR.app;
      save.setPos(player.world, player.feet, player.look);
      save.flush();
      return JSON.parse(localStorage.getItem(save.key)).pos;
    });
    await p2.evaluate(() => THR.app.hud.showPause(true)); // what releasing the pointer lock does
    await p2.click('.pause [data-act="demo"]');
    const during = await p2.evaluate(() => ({ demo: THR.app.demo.active, paused: document.querySelector('.pause').classList.contains('on') }));
    const cinematicPosition = await p2.evaluate(() => {
      THR.app.frames = 119;
      THR.frame(1 / 60, { noRender: true });
      return JSON.parse(localStorage.getItem(THR.app.save.key)).pos;
    });
    assert.deepEqual(cinematicPosition, savedPosition, 'watching the cinematic preserves the stored journey position');
    await p2.mouse.click(640, 360);
    const after = await p2.evaluate(() => ({ demo: THR.app.demo.active, paused: document.querySelector('.pause').classList.contains('on') }));
    log(`demo from pause: playing ${during.demo}, pause panel ${during.paused ? 'shown' : 'hidden'}; after a click playing ${after.demo}`);
    assert.ok(during.demo && !during.paused, 'the cinematic is not covered by the pause panel');
    assert.ok(!after.demo && !after.paused, 'a click on the picture ends the cinematic');
    const resumed = await p2.evaluate(() => {
      THR.app.frames = 239;
      THR.frame(1 / 60, { noRender: true });
      return JSON.parse(localStorage.getItem(THR.app.save.key)).pos;
    });
    assert.notDeepEqual(resumed, savedPosition, 'manual play resumes position autosaves');
    await p2.close();
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
