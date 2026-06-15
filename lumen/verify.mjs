import { createRequire } from 'module';
const require = createRequire('/Users/dg-mac-mini/Dev/davisbuilds-site/package.json');
const { chromium } = require('@playwright/test');

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto('file:///Users/dg-mac-mini/Dev/one-shots/lumen/index.html');
await page.waitForTimeout(500);
const errOverlay = await page.$eval('#err', el => el.style.display === 'block' ? el.textContent : '');
if (errOverlay) { console.log('SHADER FAIL:\n' + errOverlay); process.exit(1); }

// scene 1: cornell — let it converge (software GL is slow)
await page.waitForTimeout(14000);
console.log('cornell spp:', await page.$eval('#stSpp', el => el.textContent));
await page.screenshot({ path: 'v-cornell.png' });

// click glass sphere -> material panel + focus pick
await page.mouse.click(382, 258);
await page.waitForTimeout(400);
console.log('material panel:', await page.$eval('#material', el => el.style.display));

// scene 2: dispersion caustics — needs the most samples
await page.click('.sc[data-s="1"]');
await page.waitForTimeout(28000);
console.log('dispersion spp:', await page.$eval('#stSpp', el => el.textContent));
await page.screenshot({ path: 'v-dispersion.png' });

// scene 3: studio
await page.click('.sc[data-s="2"]');
await page.waitForTimeout(12000);
await page.screenshot({ path: 'v-studio.png' });

// scene 4: noir
await page.click('.sc[data-s="3"]');
await page.waitForTimeout(12000);
await page.screenshot({ path: 'v-noir.png' });

console.log('console errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
