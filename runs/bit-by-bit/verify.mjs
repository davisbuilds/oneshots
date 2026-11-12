// verify.mjs: open index.html from disk in headless Chrome and play it.
//   node verify.mjs            (after pnpm install --frozen-lockfile at the repository root, with current Google Chrome)
// CHROMIUM_PATH=/path/to/chrome uses another Chromium build, subject to the version guard.
// Covers: loading with no network and no errors; the map and locking; every
// level played to its lesson card with real mouse clicks on the page's own
// controls; pointer drag and keyboard play; hints, undo, losing, the demo
// player; saved progress across a reload; and layout bounds for every level
// at desktop, phone and tablet size.
import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../../scripts/browser.mjs';

const output = fileURLToPath(new URL('./output/playwright/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await launchBrowser({ headless: true });
const url = new URL('./index.html', import.meta.url).href;
const errors = [], requests = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('request', (r) => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
};
const shot = async (page, name) => { const f = output + name + '.png'; await page.screenshot({ path: f }); assert.ok((await stat(f)).size > 15_000, `${name}: the screenshot has content`); };
const state = (page) => page.evaluate(() => BB.app.api.state());
const hint = (page) => page.evaluate(() => BB.app.api.hint());
const tap = (page, label, exact = true) => page.locator(exact ? `#stage [aria-label="${label}"]` : `#stage [aria-label^="${label}"]`).first().click();
const modalText = (page) => page.locator('#modal .card').innerText();

try {
  // ── A fresh visitor, playing with the mouse ───────────────────────────
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  watch(page);
  await page.goto(url);
  await page.waitForFunction(() => window.BB && BB.app);
  assert.equal(await page.locator('.chip').count(), 34);
  assert.equal(await page.locator('.chip:not(.locked)').count(), 1, 'only the first level is open to a new player');
  await shot(page, '01-map');
  await page.getByRole('button', { name: 'Start' }).click();
  assert.match(await modalText(page), /Zero Is First[\s\S]*array[\s\S]*Goal/i);
  await page.getByRole('button', { name: 'Play' }).click();

  // 1-1: a wrong locker is a strike, the right ones win.
  let s = await state(page);
  await tap(page, `Box ${(s.target + 1) % 8}, closed`);
  assert.equal((await state(page)).strikes, 1);
  for (let i = 0; i < 4; i++) await tap(page, `Box ${(await state(page)).target}, closed`);
  await page.waitForSelector('#modal .card.win');
  assert.match(await modalText(page), /Array indexing[\s\S]*O\(1\)[\s\S]*lockers\[0\]/);
  assert.equal(await page.locator('#modal .bigstars > .on').count(), 2, 'one mistake costs a star');
  await shot(page, '02-win-card');
  await page.getByRole('button', { name: /^Next:/ }).click();
  assert.equal((await state(page)).mode, 'linear');
  await page.getByRole('button', { name: 'Play' }).click();

  // 1-2: Murphy keeps the number in the last box, whatever order we open them in.
  for (const i of [3, 0, 6, 1, 5, 2, 4]) { assert.equal((await state(page)).status, 'play'); await tap(page, `Box ${i}, closed`); }
  await page.waitForSelector('#modal .card.win');
  assert.equal(await page.locator('#modal .bigstars > .on').count(), 3);
  await page.getByRole('button', { name: /^Next:/ }).click();
  await page.getByRole('button', { name: 'Play' }).click();

  // 1-3: opening boxes left to right loses; the lesson card says why; halving wins.
  for (const i of [0, 1, 2, 3]) await tap(page, `Box ${i}, closed`);
  await page.waitForSelector('#modal .card.fail');
  assert.match(await modalText(page), /Out of peeks[\s\S]*same size/);
  await shot(page, '03-murphy-wins');
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.locator('#hint').click();
  assert.match(await page.locator('#say').innerText(), /middle one, \[7\]/);
  assert.equal(await page.locator('#stage .tile.hot').count(), 1, 'the hinted box glows');
  for (let n = 0; n < 4; n++) await tap(page, `Box ${(await hint(page)).a.i}, closed`);
  await page.waitForSelector('#modal .card.win');
  assert.equal(await page.locator('#modal .bigstars > .on').count(), 2, 'a hint caps the result at two stars');

  // Watching the algorithm: the demo replays it with the code alongside.
  await page.getByRole('button', { name: 'Watch it run' }).click();
  await page.waitForSelector('#codepane .ln.hot', { timeout: 15000 });
  assert.match(await page.locator('#codepane .ln.hot').innerText(), /mid = \(lo \+ hi\) \/\/ 2/);
  await page.getByRole('button', { name: 'Fast speed' }).or(page.getByRole('button', { name: 'Normal speed' })).click();
  await page.waitForFunction(() => BB.game.demo && BB.game.demo.done, null, { timeout: 30000 });
  assert.equal((await state(page)).ops, 4);
  await shot(page, '04-demo');
  await page.getByRole('button', { name: 'My turn' }).click();
  assert.equal((await state(page)).ops, 0);
  assert.deepEqual(await page.evaluate(() => BB.app.api.save().stars), { '1-1': 2, '1-2': 3, '1-3': 2 });

  // Progress survives a reload, and the map unlocks exactly one more level.
  await page.goto(url);
  await page.waitForFunction(() => window.BB && BB.app);
  assert.equal(await page.locator('.chip:not(.locked)').count(), 4);
  assert.match(await page.locator('.btn.primary').first().innerText(), /Continue: One in a Million/);
  await page.locator('[data-book]').click();
  assert.equal(await page.locator('#book details.card').count(), 3);
  assert.equal(await page.locator('#book .card.unknown').count(), 31);
  await shot(page, '05-notebook');
  await context.close();

  // ── Everything else, with test mode on: no animation delays, all unlocked ─
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx2.newPage();
  watch(p);
  await p.goto(url + '?test');
  await p.waitForFunction(() => window.BB && BB.app);
  const open = (id) => p.evaluate((id) => BB.app.api.open(id, { quiet: true }), id);
  const st = () => state(p);

  // 1-4: drag the marker; it catches on the centre notch; keyboard works too.
  await open('1-4');
  const track = await p.locator('#stage rect.panel').boundingBox();
  await p.mouse.move(track.x + 40, track.y + track.height / 2);
  await p.mouse.down();
  await p.mouse.move(track.x + track.width / 2 + 5, track.y + track.height / 2, { steps: 6 });
  await p.mouse.up();
  assert.equal(await p.evaluate(() => BB.game.ui.g), 500000, 'the marker snaps to the exact middle');
  await tap(p, 'Guess');
  assert.deepEqual([(await st()).lo, (await st()).hi, (await st()).ops], [500001, 1000000, 1]);
  await p.locator('#stage [role="slider"]').focus();
  await p.keyboard.press('Home'); await p.keyboard.press('Enter');
  assert.equal((await st()).lo, 750001);

  // 2-2: tap one tile, then another, to swap; Z undoes and refunds the swap.
  await open('2-2');
  s = await st();
  await tap(p, `${s.arr[0]}, position 1`); await tap(p, `${s.arr[3]}, position 4`);
  assert.deepEqual([(await st()).arr[0], (await st()).arr[3], (await st()).ops], [s.arr[3], s.arr[0], 1]);
  await p.keyboard.press('z');
  assert.deepEqual([(await st()).arr, (await st()).ops], [s.arr, 0]);

  // 3-1: park cars by tapping the siding, send them out by tapping the top car.
  await open('3-1');
  for (let i = 0; i < 4; i++) await tap(p, 'Siding 1: park the next car here');
  assert.deepEqual((await st()).stacks[0], [1, 2, 3, 4]);
  for (const v of [4, 3, 2, 1]) await tap(p, `Car ${v}, top of siding: send it out`);
  assert.equal((await st()).round, 1, 'the train left reversed');

  // 4-2: swing the wrong arrow first and the garbage collector takes the list.
  await open('4-2');
  s = await st();
  const val = (id) => s.nodes.find((n) => n.id === id).v;
  await tap(p, `Node ${s.nodes[1].v}`); await tap(p, `Node ${val(s.vars.new)}`);
  await p.waitForSelector('#modal .card.fail');
  assert.match(await modalText(p), /garbage collector[\s\S]*Take that back/);
  await p.getByRole('button', { name: 'Take that back' }).click();
  assert.deepEqual([(await st()).status, (await st()).strikes], ['play', 1]);
  await tap(p, `Node ${val(s.vars.new)}`); await tap(p, `Node ${s.nodes[2].v}`);
  await tap(p, `Node ${s.nodes[1].v}`); await tap(p, `Node ${val(s.vars.new)}`);
  assert.equal((await st()).round, 1, 'spliced in the right order');

  // 4-3: move a variable by tapping its label, then a node.
  await open('4-3');
  s = await st();
  await tap(p, 'Variable b'); await tap(p, `Node ${s.nodes[1].v}`);
  assert.equal((await st()).vars.b, s.nodes[1].id);

  // 8-5: lay cables by tapping links; a keyboard user can do the same.
  await open('8-5');
  s = await st();
  for (const i of s.best.slice(0, 3)) await tap(p, `Cable ${s.g.edges[i][0]} to ${s.g.edges[i][1]}, cost ${s.g.edges[i][2]}`);
  // The line itself is a target too, away from its price tag.
  for (const i of s.best.slice(3, 6)) { const b = await p.locator('#stage path.fat').nth(i).boundingBox(); await p.mouse.click(b.x + b.width * 0.22, b.y + b.height * (s.g.edges[i].slope ? 0.22 : 0.22)); if (!(await st()).pick[i]) { await p.mouse.click(b.x + b.width * 0.78, b.y + b.height * 0.22); } assert.ok((await st()).pick[i], 'a tap on the cable line lays it'); }
  const last = s.g.edges[s.best[6]];
  await p.locator(`#stage .tile[aria-label="Cable ${last[0]} to ${last[1]}, cost ${last[2]}"]`).focus();
  await p.keyboard.press('Enter');
  assert.equal((await st()).status, 'won');
  await p.evaluate(() => BB.app.api.closeModal());

  // 9-1: tap a peg to lift, tap another to drop; an illegal drop is refused.
  await open('9-1');
  await tap(p, 'Left peg', false); await tap(p, 'Right peg', false);
  await tap(p, 'Left peg', false); await tap(p, 'Right peg', false);
  s = await st();
  assert.deepEqual(s.pegs, [[3, 2], [], [1]]);
  assert.equal(s.ops, 1);
  assert.match(await p.locator('#say').innerText(), /bigger disc cannot sit on a smaller/);

  // ── Every level, start to finish, with a real mouse ──────────────────────
  // For each move of the textbook algorithm, ask the page which of its own
  // controls performs it, then click those controls where they are on screen.
  // A control that is covered, off stage or wired to the wrong action fails here.
  const lessons = await p.evaluate(() => BB.levels.map((l) => ({ id: l.id, name: l.win.name })));
  let clicks = 0;
  for (const { id, name } of lessons) {
    await open(id);
    for (let n = 0; n < 600; n++) {
      const cur = await st();
      if (cur.status !== 'play') break;
      const h = await hint(p);
      if (cur.type === 'zoom') await p.evaluate((g) => { BB.game.ui.g = g; BB.app.api.render(); }, h.a.g); // the marker drag is tested above
      const k = await p.evaluate((a) => BB.app.api.probe(a), cur.type === 'zoom' ? { t: 'guess', g: h.a.g } : h.a);
      assert.ok(k > 0, `${id}: some control performs ${JSON.stringify(h.a)}`);
      for (let i = 1; i <= k; i++) { await p.locator(`#stage [data-probe="${i}"]`).click({ timeout: 5000 }); clicks++; }
      const after = await st();
      assert.ok(after.ops !== cur.ops || after.status !== cur.status || JSON.stringify(after) !== JSON.stringify(cur), `${id}: the click changed something`);
      assert.equal(after.strikes, 0, `${id}: the click did what the hint said`);
    }
    assert.equal((await st()).status, 'won', `${id} is won`);
    await p.waitForSelector('#modal .card.win');
    assert.equal(await p.locator('#modal .bigstars > .on').count(), 3, `${id}: three stars`);
    assert.ok((await modalText(p)).includes(name), `${id}: the card names ${name}`);
    await p.evaluate(() => BB.app.api.closeModal());
  }
  assert.equal(await p.evaluate(() => Object.values(BB.app.api.save().stars).filter((n) => n === 3).length), 34);
  await p.evaluate(() => { location.hash = ''; BB.app.api.route(); });
  assert.match(await p.locator('.progress').innerText(), /33 \/ 33 levels[\s\S]*102 \/ 102/);

  // ── Nothing is drawn off the stage, at desktop and phone size ──────────────
  for (const [w, h] of [[1280, 720], [390, 780], [820, 1100]]) {
    await p.setViewportSize({ width: w, height: h });
    for (const { id } of lessons) {
      await open(id);
      for (const moves of [0, 3]) {
        if (moves) await p.evaluate((k) => { const api = BB.app.api; for (let i = 0; i < k && api.state().status === 'play'; i++) api.act(api.hint().a); api.closeModal(); }, moves);
        const out = await p.evaluate(() => {
          const svg = document.querySelector('#stage'), box = svg.getBoundingClientRect(), bad = [];
          for (const el of svg.querySelectorAll('.tile, .lbl')) { const b = el.getBoundingClientRect(); if (!b.width) continue; if (b.left < box.left - 3 || b.right > box.right + 3 || b.top < box.top - 3 || b.bottom > box.bottom + 3) bad.push(el.getAttribute('aria-label') || el.textContent); }
          return { bad, wide: document.documentElement.scrollWidth > innerWidth + 1, small: box.height < 200 };
        });
        assert.deepEqual(out.bad, [], `${id} at ${w}x${h}, after ${moves} moves: nothing is clipped by the stage`);
        assert.equal(out.wide, false, `${id} at ${w}x${h}: no sideways scrolling`);
        assert.equal(out.small, false, `${id} at ${w}x${h}: the stage has room`);
      }
    }
  }
  await open('8-3'); await p.evaluate(() => { const api = BB.app.api; for (let i = 0; i < 3; i++) api.act(api.hint().a); });
  await shot(p, '06-phone-tablet');
  await ctx2.close();

  assert.deepEqual(requests, [], 'the game makes no network requests');
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`verify: ok (34 levels played to three stars with ${clicks} real clicks; layout checked at 3 sizes). Screenshots in ${output}`);
} finally {
  await browser.close();
}
