import assert from 'node:assert/strict';
import { launchBrowser } from '../../../scripts/browser.mjs';
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.requestAnimationFrame = callback => { window.__firstFrame = callback; return 1; };
  });
  await page.goto(new URL('../index.html?test', import.meta.url).href);
  await page.waitForFunction(() => window.LUMINAL?.game && window.__firstFrame);
  const result = await page.evaluate(() => {
    const g = LUMINAL.game;
    window.__firstFrame(g.lastFrame - 1000);
    return { flash: g.flash, shake: g.cam.shake, punch: g.cam.punch, frame: g.frameTimes.at(-1) };
  });
  assert.deepEqual(result, { flash: 0, shake: 0, punch: 0, frame: 0 }, 'a RAF timestamp earlier than initialization cannot increase visual effects');
  console.log('PASS first animation-frame timestamp cannot create visual effects');
} finally { await browser.close(); }
