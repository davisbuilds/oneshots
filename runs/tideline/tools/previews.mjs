// previews.mjs: the committed preview images (hero, details), from the live page.
//   node tools/previews.mjs [outdir]   (writes PNGs; convert to WebP with cwebp)
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const out = process.argv[2] || fileURLToPath(new URL('../output/previews/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(new URL('../index.html?still', import.meta.url).href);
await page.waitForFunction(() => window.TL && TL.app && TL.app.ready, null, { timeout: 120000 });
const adv = (ms) => page.evaluate((ms) => { const n = Math.round(ms / 50); for (let i = 0; i < n; i++) TL.app.filmFrame(50, i < n - 1); }, ms);
await page.evaluate(() => { TL.app.still = false; });
await adv(3000);
await page.screenshot({ path: out + '/hero.png' });
// The hand-over: a crane lowering a box into a waiting carrier.
const at = await page.evaluate(() => {
  const sim = TL.app.sim;
  let best = null;
  for (const sc of sim.scs) { const tk = sc.task; if (tk && tk.kind === 'disch' && tk.attachT > TL.app.simT + 20 && (!best || tk.attachT < best.task.attachT)) best = sc; }
  return best ? { k: best.k, attach: best.task.attachT, s: best.task.pickState } : null;
});
if (at) {
  await page.evaluate((at) => { const st = TL.app.sim.scG.states[at.s]; const c = TL.app.r.cam; c.x = st.x - 4; c.y = st.y + 6; c.zoom = 0.055; TL.app.hideCallouts = false; TL.app.sel = { kind: 'sc', ref: TL.app.sim.scs[at.k] }; }, at);
  // Just before the box lands: advance in sim time to attach - 9 s.
  const ms = await page.evaluate((at) => Math.max(0, (at.attach - 9 - TL.app.simT) / TL.app.speed * 1000), at);
  await adv(ms);
  await page.evaluate((at) => { const st = TL.app.sim.scG.states[at.s]; const c = TL.app.r.cam; c.x = st.x - 4; c.y = st.y + 6; c.zoom = 0.055; }, at);
  await adv(50);
  await page.screenshot({ path: out + '/detail-handover.png', clip: { x: 320, y: 220, width: 1100, height: 660 } });
}
// The vessel panel and the schedule, at native resolution.
await page.evaluate(() => { TL.UI.select('call', TL.app.sim.calls[0]); });
await adv(400);
await page.screenshot({ path: out + '/detail-panel.png', clip: { x: 1506, y: 80, width: 404, height: 990 } });
await page.screenshot({ path: out + '/detail-schedule.png', clip: { x: 98, y: 888, width: 1396, height: 182 } });
// Wide: the whole terminal.
await page.evaluate(() => { const c = TL.app.r.cam; c.x = 470; c.y = 140; c.zoom = 0.48; TL.app.sel = null; });
await adv(100);
await page.screenshot({ path: out + '/wide.png' });
console.log('errors', errs);
await browser.close();
