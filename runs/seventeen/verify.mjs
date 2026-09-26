import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(new URL('./index.html', import.meta.url).href);
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shot1.png' });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shot2.png' });

const errOverlay = await page.$eval('#err', el => el.style.display === 'block' ? el.textContent : '');
const stats = await page.$eval('#sFps', el => el.textContent);
console.log('console errors:', errors.length ? errors.join('\n') : 'none');
console.log('shader error overlay:', errOverlay || 'none');
console.log('fps readout:', stats);
await browser.close();
