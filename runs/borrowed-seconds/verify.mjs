import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const output = fileURLToPath(new URL('./output/playwright/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const requests = [];
  const watch = p => {
    p.on('pageerror', error => errors.push(error.message));
    p.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    p.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  };
  watch(page);
  const url = new URL('./index.html?test=1', import.meta.url).href;
  const snapshot = () => page.evaluate(() => window.BorrowedSeconds.snapshot());
  const step = (n, keys = []) => page.evaluate(([n, keys]) => window.BorrowedSeconds.step(n, keys), [n, keys]);
  const shot = async name => {
    const filename = output + name + '.png';
    await page.screenshot({ path: filename, fullPage: true });
    assert.ok((await stat(filename)).size > 15_000, 'screenshot must contain a rendered scene');
  };
  // Pointer movement enters through the game's ordinary canvas handler. The
  // test interface only advances the production update function at fixed 60 Hz.
  async function walk(x, y, expected = 'playing') {
    const p = await page.evaluate(([x, y]) => window.BorrowedSeconds.screen(x, y), [x, y]);
    await page.mouse.click(p.x, p.y);
    let current = await snapshot();
    assert.ok(current.path.length, 'destination must generate a walkable route');
    for (let i = 0; i < 160; i++) {
      current = await step(5);
      if (!current.path.length || current.mode !== 'playing') break;
    }
    assert.equal(current.mode, expected, 'route must end without an unintended capture');
    if (expected === 'playing') assert.ok(Math.hypot(current.player.x - x, current.player.y - y) < 1, 'walk must reach its destination');
    return current;
  }
  await page.goto(url);
  await shot('01-title');
  await page.getByRole('button', { name: 'Begin the heist', exact: true }).click();
  let state = await snapshot();
  assert.equal(state.mode, 'playing');
  assert.equal(state.tick, 0);
  assert.equal(state.echoes.length, 0);
  await shot('02-first-museum');
  assert.equal(await page.evaluate(() => window.BorrowedSeconds.navigate(524, 188)), false, 'closed vault must be inaccessible');
  assert.equal(await page.evaluate(() => window.BorrowedSeconds.navigate(333, 210)), false, 'marble partition must be solid');
  const collision = await step(100, ['a']);
  assert.ok(collision.player.x >= 67 && collision.player.y <= 582, 'keyboard movement cannot leave the museum');
  await page.getByRole('button', { name: 'Reset the entire heist' }).click();
  await page.getByRole('button', { name: 'Pause the heist' }).click();
  assert.equal((await step(120)).tick, 0, 'pause must suspend the simulation');
  await page.locator('#resume').click();

  // Sound activation produces an actual signal, not only a changed button.
  await page.getByRole('button', { name: 'Enable sound' }).click();
  await page.waitForFunction(() => window.BorrowedSeconds.audioLevel() > .001);
  await page.getByRole('button', { name: 'Disable sound' }).click();

  // A whistle changes guard behavior and is retained in the echo's event log.
  await page.keyboard.press('e');
  state = await step(1);
  assert.ok(state.guards.some(g => g.interest === 'whistle'));
  await page.keyboard.press('r');
  assert.equal((await snapshot()).echoes.length, 0, 'a one-frame route must not become an echo');
  await step(20);
  await page.keyboard.press('r');
  state = await step(2);
  assert.equal(state.echoes[0].whistles, 1);
  assert.ok(state.guards.some(g => g.interest === 'echo whistle'), 'a recorded whistle must be replayed');
  await page.keyboard.press('Backspace');
  state = await snapshot();
  assert.equal(state.echoes.length, 0);
  assert.equal(state.tick, 0);

  // Recruit two real routes, then carry out the optional three-treasure heist.
  state = await walk(164, 160);
  assert.equal(state.west, true);
  await page.keyboard.press('r');
  state = await snapshot();
  assert.equal(state.tick, 0);
  assert.equal(state.echoes[0].role, 'West station');
  await walk(803, 480);
  state = await walk(856, 160);
  assert.equal(state.open, true);
  assert.equal(state.echoes[0].pose.moving, false, 'an echo holds still at the end of its recording');
  await page.keyboard.press('r');
  assert.equal((await snapshot()).echoes.length, 2);
  await walk(252, 344);
  await page.locator('#interact').click();
  assert.deepEqual((await step(1)).loot, ['moon']);
  await walk(290, 500);
  await walk(803, 480);
  await walk(843, 347);
  await page.locator('#interact').click();
  assert.deepEqual((await step(1)).loot, ['moon', 'knot']);
  await walk(803, 480);
  await walk(680, 490);
  state = await walk(524, 294);
  assert.equal(state.open, true);
  await shot('03-two-locks-released');
  await walk(524, 188);
  await page.getByRole('button', { name: /Take hourglass/ }).click();
  state = await step(1);
  assert.equal(state.carry, true);
  await shot('04-hourglass-lifted');
  await walk(524, 294);
  await walk(355, 568);
  const win = await walk(116, 543, 'won');
  assert.equal(win.carry, true);
  assert.deepEqual(win.loot, ['moon', 'knot']);
  assert.ok(win.tick < 3600);
  await shot('05-grand-larceny');

  // Replay uses the same security simulation and recorded interaction events.
  await page.getByRole('button', { name: 'Watch the replay', exact: true }).click();
  const replay = await step(win.tick);
  assert.equal(replay.mode, 'won');
  assert.equal(replay.tick, win.tick);
  assert.deepEqual(replay.player, win.player);
  assert.deepEqual(replay.guards, win.guards);
  assert.deepEqual(replay.loot, win.loot);
  assert.equal(replay.alarm, win.alarm);
  await page.getByRole('button', { name: 'Watch the replay', exact: true }).click();
  await step(300);
  const middle = await snapshot();
  await page.evaluate(() => window.BorrowedSeconds.seek(300));
  const scrubbed = await snapshot();
  assert.deepEqual(scrubbed.guards, middle.guards, 'scrubbing must reconstruct guard state');
  assert.deepEqual(scrubbed.player, middle.player);
  assert.equal(scrubbed.paused, true);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Keep a frame', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(output + 'exported-frame.png');
  assert.ok((await stat(output + 'exported-frame.png')).size > 10_000);

  // Captures and the clock are genuine loss conditions. Neither deletes crew.
  await page.getByRole('button', { name: 'Reset the entire heist' }).click();
  await walk(410, 500);
  state = await step(1400);
  assert.equal(state.mode, 'failed');
  assert.equal(state.alarm, 1);
  await page.getByRole('button', { name: 'Keep route & rewind' }).click();
  assert.equal((await snapshot()).echoes.length, 1);
  assert.equal((await snapshot()).tick, 0);
  await page.getByRole('button', { name: 'Reset the entire heist' }).click();
  state = await step(3600);
  assert.equal(state.mode, 'failed');
  assert.equal(state.tick, 3600);
  assert.equal(state.alarm, 0);
  await page.getByRole('button', { name: 'Retry this minute' }).click();
  assert.equal((await snapshot()).tick, 0);
  assert.equal((await snapshot()).echoes.length, 0);
  for (let i = 0; i < 5; i++) {
    await step(20);
    await page.keyboard.press('r');
  }
  assert.equal((await snapshot()).echoes.length, 5);
  await step(20);
  await page.keyboard.press('r');
  assert.equal((await snapshot()).echoes.length, 5, 'crew limit must be enforced');
  await page.getByRole('button', { name: 'Remove Echo 2', exact: true }).click();
  assert.equal((await snapshot()).echoes.length, 4);

  // The five-person guided plan obeys the same guards and wins.
  await page.goto(url);
  await page.getByRole('button', { name: 'Watch a plan', exact: true }).click();
  state = await step(540);
  assert.equal(state.echoes.length, 4);
  assert.equal(state.open, true);
  assert.ok(state.guards.some(g => g.interest === 'echo'));
  await shot('06-five-selves');
  const demoWin = await step(1800);
  assert.equal(demoWin.mode, 'won');
  await page.getByRole('button', { name: 'Watch the replay', exact: true }).click();
  const demoReplay = await step(demoWin.tick);
  assert.deepEqual(demoReplay.guards, demoWin.guards);
  assert.equal(demoReplay.mode, 'won');

  // Touch controls remain visible, release correctly, and survive rotation.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  watch(phone);
  await phone.goto(url);
  await phone.getByRole('button', { name: 'Begin the heist', exact: true }).tap();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const up = phone.getByRole('button', { name: 'Move up', exact: true });
  const box = await up.boundingBox();
  assert.ok(box.y + box.height <= 844, 'touch movement must stay in the viewport');
  // Use a real pointer so the direction button acquires and releases capture.
  const touchBox = await up.boundingBox();
  await phone.mouse.move(touchBox.x + touchBox.width / 2, touchBox.y + touchBox.height / 2);
  await phone.mouse.down();
  const moved = await phone.evaluate(() => window.BorrowedSeconds.step(25));
  await phone.mouse.up();
  const stopped = await phone.evaluate(() => window.BorrowedSeconds.step(25));
  assert.ok(moved.player.y < 543);
  assert.equal(stopped.player.y, moved.player.y, 'released direction must not stick');
  await phone.getByRole('button', { name: 'Map', exact: true }).tap();
  const westScreen = await phone.evaluate(() => window.BorrowedSeconds.screen(164, 160));
  await phone.touchscreen.tap(westScreen.x, westScreen.y);
  let phoneWest;
  for (let i = 0; i < 80; i++) {
    phoneWest = await phone.evaluate(() => window.BorrowedSeconds.step(5));
    if (!phoneWest.path.length || phoneWest.mode !== 'playing') break;
  }
  assert.equal(phoneWest.mode, 'playing');
  assert.equal(phoneWest.west, true);
  await phone.locator('#record').tap();
  assert.equal((await phone.evaluate(() => window.BorrowedSeconds.snapshot())).echoes.length, 1);
  await phone.screenshot({ path: output + '07-phone.png', fullPage: true });
  await phone.setViewportSize({ width: 844, height: 390 });
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await phone.getByRole('button', { name: 'How to play', exact: true }).tap();
  assert.equal(await phone.locator('#guide').evaluate(el => el.open), true);
  await phone.getByRole('button', { name: 'Understood', exact: true }).tap();
  await phone.close();

  // Reduced-motion startup is still; the ordinary RAF path advances only
  // after the player starts, and loses no state when paused or resized.
  const motion = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  watch(motion);
  await motion.goto(new URL('./index.html', import.meta.url).href);
  assert.equal(await motion.evaluate(() => window.BorrowedSeconds), undefined, 'test interface is opt-in');
  const before = await motion.locator('#clock').textContent();
  await motion.waitForTimeout(150);
  assert.equal(await motion.locator('#clock').textContent(), before);
  await motion.locator('#begin').click();
  await motion.waitForFunction(() => parseFloat(document.getElementById('clock').textContent) < 59.8);
  await motion.getByRole('button', { name: 'Pause the heist' }).click();
  const pausedClock = await motion.locator('#clock').textContent();
  await motion.waitForTimeout(150);
  assert.equal(await motion.locator('#clock').textContent(), pausedClock);
  await motion.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log('Borrowed Seconds: full heist, three treasures, exact replay, five-person demo, capture, timeout, echo limit, audio, PNG export, touch, resize, pause and reduced motion passed. No external requests or browser errors.');
} finally {
  await browser.close();
}
