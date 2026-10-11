// shoot.mjs: development screenshots at chosen beats along the stored route.
//   node tools/shoot.mjs out_dir beat1 beat2 ...   [W=1280 H=720]
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const [out, ...beats] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await page.goto(new URL('../index.html?test' + (process.env.Q || ''), import.meta.url).href);
await page.waitForFunction(() => window.LUMINAL && LUMINAL.game && LUMINAL.game.api.ready(), null, { timeout: 60000 }).catch(e => { console.log('errors:', errs); throw e; });
if (process.env.TITLE) await page.screenshot({ path: `${out}/title.png` });
for (const b of beats) {
  await page.evaluate(b => { const g = LUMINAL.game; g.api.begin(false); g.api.jumpTo(+b); g.state = 'playing'; for (let i = 0; i < 30; i++) g.api.draw(); }, b);
  await page.screenshot({ path: `${out}/b${String(b).padStart(5, '0')}.png` });
}
console.log('errors:', errs.slice(0, 10));
await browser.close();
