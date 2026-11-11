import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../../../scripts/browser.mjs';
const browser = await launchBrowser({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let server;
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
  await page.close();

  execFileSync(process.execPath, [fileURLToPath(new URL('../tools/bundle.mjs', import.meta.url))]);
  const bundled = await readFile(new URL('../output/luminal.html', import.meta.url), 'utf8');
  // Observe readiness in the frame itself: inspecting it through the browser
  // driver during startup could grant the activation this test must lack.
  const embedded = bundled.replace('</body>', `<script>
    const ready = new MutationObserver(() => {
      if (document.body.classList.contains('ready')) {
        ready.disconnect(); console.debug('luminal-embedded-ready');
      }
    });
    ready.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  </script></body>`);
  const host = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  host.on('pageerror', error => errors.push(error.message));
  host.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(request.url === '/luminal.html' ? embedded : '<!doctype html><button id="host" autofocus>Outside the game</button><iframe sandbox="allow-scripts" width="900" height="520"></iframe>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await host.goto(`http://127.0.0.1:${server.address().port}/`);
  assert.ok(await host.locator('iframe').boundingBox(), 'the embedding frame has a layout before loading the game');
  await Promise.all([
    host.waitForEvent('console', { predicate: message => message.text() === 'luminal-embedded-ready', timeout: 60_000 }),
    host.locator('iframe').evaluate(frame => { frame.src = '/luminal.html'; }),
  ]);
  assert.deepEqual(errors, [], 'sandboxed startup never attempts focus without activation');
  assert.equal(await host.locator('#host').evaluate(button => document.activeElement === button), true, 'startup leaves host focus in place');
  const frame = host.frames().find(candidate => candidate !== host.mainFrame());
  assert.ok(frame, 'the bundled game loads in its scripts-only sandbox');
  await frame.locator('#playBtn').click();
  assert.equal(await frame.evaluate(() => LUMINAL.game.state), 'playing', 'a real click starts the embedded game');
  await host.keyboard.press('p');
  assert.equal(await frame.evaluate(() => LUMINAL.game.state), 'paused', 'keyboard input reaches the activated game');
  assert.equal(await frame.evaluate(() => document.activeElement.id), 'resumeBtn', 'an activated pause screen still focuses Resume');
  await host.keyboard.press('Enter');
  assert.equal(await frame.evaluate(() => LUMINAL.game.state), 'playing', 'the focused Resume button works with the keyboard');
  assert.deepEqual(errors, [], 'activated focus and input also produce no browser errors');
  console.log('PASS sandboxed startup preserves host focus and real input activates game controls');
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
