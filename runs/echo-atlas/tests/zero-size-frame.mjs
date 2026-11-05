import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from '../../../scripts/browser.mjs';

// An embedding page can run the demo before laying out its frame, so the first
// resize() sees a 0x0 window. The demo must wait for a real size, not throw.
const dir = mkdtempSync(path.join(tmpdir(), 'echo-atlas-frame-'));
const host = path.join(dir, 'host.html');
const demo = new URL('../index.html', import.meta.url).href;
writeFileSync(host, `<!doctype html><iframe id="f" src="${demo}" style="width:0;height:0;border:0"></iframe>`);
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    window.__errors = [];
    addEventListener('error', event => window.__errors.push(String(event.message)));
  });
  await page.goto(pathToFileURL(host).href);
  // file:// frames are cross-origin to each other; reach the demo through Playwright.
  let frame;
  for (let i = 0; i < 100 && !(frame = page.frames().find(f => f.url() === demo)); i++) await page.waitForTimeout(100);
  assert.ok(frame, 'the demo frame loads');
  await frame.waitForLoadState('load');
  assert.deepEqual(await frame.evaluate(() => [innerWidth, innerHeight]), [0, 0], 'the demo starts in a 0x0 frame');
  await page.evaluate(() => Object.assign(document.getElementById('f').style, { width: '960px', height: '567px' }));
  await frame.waitForFunction(() => innerWidth === 960);
  await page.waitForTimeout(500);
  const result = await frame.evaluate(() => ({ errors: window.__errors, canvas: [document.querySelector('canvas').width, document.querySelector('canvas').height] }));
  assert.deepEqual(result.errors, [], 'a 0x0 first layout throws no error');
  assert.deepEqual(result.canvas.map(v => v > 0), [true, true], 'the canvas is sized once the frame has a size');
  console.log('PASS a demo started in a 0x0 frame waits for its size');
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
