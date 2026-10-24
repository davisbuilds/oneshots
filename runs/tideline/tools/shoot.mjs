// shoot.mjs: development screenshots of the live page in headless Chromium.
//   node tools/shoot.mjs out.png [W H] [--eval "js"] [--t seconds]
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const out = args[0];
const W = +(args[1] && !args[1].startsWith('--') ? args[1] : 1600), H = +(args[2] && !args[2].startsWith('--') ? args[2] : 900);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: +(process.env.DPR || 1) });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await page.goto(new URL('../index.html?still' + (process.env.Q || ''), import.meta.url).href);
await page.waitForFunction(() => window.TL && TL.app && TL.app.ready, null, { timeout: 120000 }).catch(e => { console.log('errors:', errs); throw e; });
if (opt('--eval')) await page.evaluate(opt('--eval'));
const t = opt('--t');
await page.evaluate((t) => { const a = TL.app; a.frame(t ? a.simT + +t : a.simT + 0.5); }, t);
await page.screenshot({ path: out });
console.log('errors:', errs.slice(0, 10));
await browser.close();
