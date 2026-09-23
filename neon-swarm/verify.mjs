import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto(new URL('./index.html', import.meta.url).href);
await page.mouse.move(640, 360);
for (let i = 0; i < 20; i++) { await page.mouse.move(400 + Math.random()*500, 200 + Math.random()*400, {steps: 5}); await page.waitForTimeout(200); }
await page.screenshot({ path: 'shot-playtest.png' });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
console.log('score:', await page.$eval('#sv', el => el.textContent));
await browser.close();
