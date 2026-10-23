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
// The hand-over: a crane lowering a box into a carrier already waiting.
// Search forward for a moment where the box is 4 to 10 s from touchdown.
let at = null;
for (let i = 0; i < 400 && !at; i++) {
  at = await page.evaluate(() => {
    const sim = TL.app.sim, t = TL.app.simT;
    for (const sc of sim.scs) {
      const tk = sc.task;
      if (!tk || tk.kind !== 'disch' || t < tk.pickT0 + 2) continue;
      const land = tk.attachT - 8;
      if (land - t >= 4 && land - t <= 10) return { k: sc.k, s: tk.pickState };
    }
    return null;
  });
  if (!at) await adv(150);
}
if (at) {
  // From the land side, under the crane's portal, with the panels faded.
  await page.evaluate(() => document.body.classList.add('cine'));
  await page.waitForTimeout(1200);
  await page.evaluate((at) => { const st = TL.app.sim.scG.states[at.s]; const c = TL.app.r.cam; c.x = st.x; c.y = st.y - 7; c.zoom = 0.07; c.az = 1.3; c.el = 0.5; TL.app.sel = { kind: 'sc', ref: TL.app.sim.scs[at.k] }; }, at);
  await adv(50);
  await page.screenshot({ path: out + '/detail-handover.png', clip: { x: 360, y: 160, width: 1200, height: 760 } });
  await page.evaluate(() => { document.body.classList.remove('cine'); const c = TL.app.r.cam; c.az = -Math.PI / 4; c.el = 0.62; TL.app.sel = null; });
  await page.waitForTimeout(1200);
} else console.log('no hand-over moment found');
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
