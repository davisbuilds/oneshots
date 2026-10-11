// verify.mjs: open index.html from disk in headless Chromium and play it.
//   node verify.mjs            (after npm ci and npx playwright install chromium)
// CHROMIUM_PATH=/path/to/chrome node verify.mjs uses another Chromium build.
// Covers: loading and the soundtrack, keyboard/mouse/touch input through the
// page's own handlers, death and respawn, a full clear driven step by step
// through the production update, saved bests, practice checkpoints, pause,
// and a real-time stretch on the audio clock.
import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const output = fileURLToPath(new URL('./output/playwright/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
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
const snap = page => page.evaluate(() => LUMINAL.game.api.snapshot());
const step = (page, n, route) => page.evaluate(([n, route]) => LUMINAL.game.api.step(n, route ? LUMINAL.route : null), [n, route]);

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  watch(page);
  const t0 = Date.now();
  await page.goto(url + '?test');
  await page.waitForFunction(() => window.LUMINAL && LUMINAL.game && LUMINAL.game.api.ready(), null, { timeout: 60000 });
  const firstChunkMs = Date.now() - t0;
  assert.equal(await page.locator('#playBtn').isEnabled(), true, 'Play is enabled once the first music chunk is ready');
  await shot(page, '01-title');

  // ── The soundtrack renders completely and has the intended shape ──────
  await page.waitForFunction(() => LUMINAL.game.audioDone, null, { timeout: 180000 });
  const audio = await page.evaluate(async () => {
    const b = await LUMINAL.mixdown(LUMINAL.game.chunks);
    const d = b.getChannelData(0), sr = b.sampleRate, beat = LUMINAL.BEAT;
    const rms = (b0, b1) => { let s = 0; const a = Math.floor(b0 * beat * sr), z = Math.floor(b1 * beat * sr); for (let i = a; i < z; i++) s += d[i] * d[i]; return 20 * Math.log10(Math.sqrt(s / (z - a))); };
    let peak = 0; for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    return { seconds: b.duration, peak, dawn: rms(0, 16), drop: rms(128, 160), echo: rms(192, 208) };
  });
  assert.ok(audio.seconds > 118, 'the whole song is rendered');
  assert.ok(audio.peak > 0.3 && audio.peak <= 1.0, `the mix is loud but never clips (peak ${audio.peak.toFixed(3)})`);
  assert.ok(audio.drop - audio.dawn > 6, `the drop is much louder than the opening (${audio.dawn.toFixed(1)} vs ${audio.drop.toFixed(1)} dB)`);
  assert.ok(audio.drop - audio.echo > 4, 'the bridge after the drop breathes');

  // ── Keyboard: Space starts the run, then jumps ─────────────────────────
  await page.keyboard.press('Space');
  let s = await snap(page);
  assert.equal(s.state, 'playing');
  assert.equal(s.attempt, 1);
  await page.keyboard.down('Space');
  s = await step(page, 30);
  assert.ok(s.y > 1.2, 'holding Space makes the cube jump');
  await page.keyboard.up('Space');
  s = await step(page, 60);
  assert.equal(s.held, false);

  // ── Death: run into the first spike without jumping ───────────────────
  for (let i = 0; i < 40 && s.state === 'playing'; i++) s = await step(page, 60);
  assert.equal(s.state, 'dead', 'standing still on the first spike is fatal');
  assert.ok(s.pct > 2 && s.pct < 5, `died at the first spike (${s.pct.toFixed(1)}%)`);
  assert.ok(s.save.best > 2, 'the best is recorded');
  assert.equal(s.save.deaths.reduce((a, b) => a + b, 0), 1, 'the death is recorded in the heat map');
  await page.evaluate(() => LUMINAL.game.api.draw());
  await shot(page, '02-death');
  // a press restarts immediately
  await page.waitForTimeout(260);
  await page.keyboard.press('ArrowUp');
  s = await snap(page);
  assert.equal(s.state, 'playing');
  assert.equal(s.attempt, 2, 'a press after dying starts the next attempt');
  assert.ok(s.t < 0.05, 'the new attempt starts at the beginning');

  // ── A full clear through the production update, step by step ──────────
  const shots = { 40: '03-pulse', 70: '04-ship', 86: '05-wave', 110: '06-inversion', 136: '07-drop', 166: '08-drop-cube', 200: '09-echo', 226: '10-ascension' };
  const beatOf = s => s.t / (60 / 128);
  for (let i = 0; i < 2000 && s.state === 'playing'; i++) {
    s = await step(page, 60, true);
    const b = Math.floor(beatOf(s));
    for (const k of Object.keys(shots)) {
      if (b >= +k) { await page.evaluate(() => LUMINAL.game.api.draw()); await shot(page, shots[k]); delete shots[k]; }
    }
  }
  assert.equal(s.state, 'complete', `the stored route finishes the level in the game (ended ${s.state} at ${s.pct.toFixed(1)}%)`);
  assert.equal(s.save.best, 100);
  assert.equal(s.save.completions, 1);
  assert.equal(s.save.firstClear, 2, 'the first clear is on attempt 2');
  await page.waitForSelector('#complete:not([hidden])', { timeout: 5000 });
  await shot(page, '11-complete');

  // ── Practice: checkpoints, respawn at the checkpoint, removal ─────────
  await page.click('#titleBtn');
  await page.click('#practiceBtn');
  s = await snap(page);
  assert.equal(s.practice, true);
  for (let i = 0; i < 10; i++) s = await step(page, 60, true);
  await page.keyboard.press('KeyZ');
  s = await snap(page);
  assert.equal(s.checkpoints, 1, 'Z places a checkpoint');
  const cpX = s.x;
  for (let i = 0; i < 20 && s.state === 'playing'; i++) s = await step(page, 60);
  assert.equal(s.state, 'dead');
  await page.evaluate(() => LUMINAL.game.api.respawn());
  s = await snap(page);
  assert.ok(Math.abs(s.x - cpX) < 1e-6, 'practice respawns at the checkpoint');
  assert.ok(s.save.attempts === 2, 'practice attempts do not count toward normal attempts');
  await page.click('#cpDel');
  assert.equal((await snap(page)).checkpoints, 0, 'the remove button deletes the checkpoint');
  await page.evaluate(() => LUMINAL.game.api.draw());
  await shot(page, '12-practice');

  // ── Pause and resume ─────────────────────────────────────────────────
  await page.keyboard.press('Escape');
  assert.equal((await snap(page)).state, 'paused');
  await page.waitForSelector('#pause:not([hidden])');
  await page.click('#resumeBtn');
  assert.equal((await snap(page)).state, 'playing');

  // ── Progress survives a reload ────────────────────────────────────────
  await page.reload();
  await page.waitForFunction(() => LUMINAL.game && LUMINAL.game.api.ready(), null, { timeout: 60000 });
  s = await snap(page);
  assert.equal(s.save.best, 100);
  assert.equal(s.save.completions, 1);
  assert.match(await page.locator('#stats').innerText(), /100%/, 'the title shows the saved best');

  // ── Mouse: a click on the canvas is a press ──────────────────────────
  await page.click('#playBtn');
  await page.mouse.move(640, 400);
  await page.mouse.down();
  assert.equal((await step(page, 2)).held, true, 'mouse down holds the button');
  await page.mouse.up();
  assert.equal((await step(page, 2)).held, false);

  // ── Real time: the clock follows the audio and the game keeps up ──────
  await page.evaluate(() => { const g = LUMINAL.game; g.liveInTest = true; g.autoplay = true; g.api.toTitle(); g.api.begin(false); });
  await page.waitForTimeout(6000);
  const live = await page.evaluate(() => { const g = LUMINAL.game; return { t: g.s.t, clock: g.api.clock(), audio: g.audio.songTime(), state: g.state, frame: g.frameTimes[g.frameTimes.length - 1] }; });
  assert.equal(live.state, 'playing');
  assert.ok(live.t > 4.5, `the game advances in real time (${live.t.toFixed(2)} s)`);
  if (live.audio !== null) assert.ok(Math.abs(live.audio - live.clock) < 0.03, `the game clock follows the audio clock (${(live.audio - live.clock).toFixed(3)} s apart)`);
  assert.ok(live.clock - live.t < live.frame + 0.05, 'the simulation is at most a frame behind the clock');
  await context.close();

  // ── Touch on a phone ─────────────────────────────────────────────────
  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pp = await phone.newPage();
  watch(pp);
  await pp.goto(url + '?test');
  await pp.waitForFunction(() => LUMINAL.game && LUMINAL.game.api.ready(), null, { timeout: 60000 });
  await shot(pp, '13-phone-title');
  await pp.tap('#playBtn');
  assert.equal((await snap(pp)).state, 'playing');
  await pp.evaluate(() => {
    const c = document.getElementById('view');
    const ev = (type) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: 400, clientY: 200 }));
    ev('pointerdown');
  });
  assert.equal((await step(pp, 2)).held, true, 'a touch holds the button');
  await pp.evaluate(() => document.getElementById('view').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true })));
  assert.equal((await step(pp, 2)).held, false);
  // a real tap through the touchscreen also reaches the game
  await pp.evaluate(() => { window.__taps = 0; document.getElementById('view').addEventListener('pointerdown', () => window.__taps++); });
  await pp.touchscreen.tap(420, 220);
  assert.equal(await pp.evaluate(() => window.__taps), 1, 'a touchscreen tap lands on the game view');
  for (let i = 0; i < 4; i++) await step(pp, 60, true);
  await pp.evaluate(() => LUMINAL.game.api.draw());
  await shot(pp, '14-phone-play');
  await phone.close();

  assert.deepEqual(errors, [], 'no page errors');
  assert.deepEqual(requests, [], 'no network requests');
  console.log(`verify: ok (first music chunk ready after ${firstChunkMs} ms; dawn ${audio.dawn.toFixed(1)} dB, drop ${audio.drop.toFixed(1)} dB, peak ${audio.peak.toFixed(2)})`);
} finally {
  await browser.close();
}
