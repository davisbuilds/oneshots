// shoot.mjs: development screenshots.
//   node tools/shoot.mjs out_dir "1-3" "1-3:hhh" "map" ...   [W=1280 H=720 THEME=dark]
// A target is a level id, optionally followed by ':' and a script: h = play
// one hinted move, H = play hinted moves to the end, d = start the demo,
// i = keep the lesson card open, ? = ask for a hint. "map" and "book" shoot those screens.
import { mkdir } from 'node:fs/promises';
import { launchBrowser } from '../../../scripts/browser.mjs';
const [out, ...targets] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: +(process.env.DPR || 1), colorScheme: process.env.THEME === 'dark' ? 'dark' : 'light' });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await page.goto(new URL('../index.html?test', import.meta.url).href);
for (const t of targets) {
  const [id, script = ''] = t.split(':');
  if (id === 'map' || id === 'book') await page.evaluate((x) => { if (x === 'book') { const s = BB.app.api.save(); for (const l of BB.levels.slice(0, 20)) s.stars[l.id] = 3; } location.hash = x === 'book' ? '#book' : ''; BB.app.api.route(); }, id);
  else {
    await page.evaluate(([id, script]) => {
      const api = BB.app.api;
      api.open(id, { quiet: !script.includes('i') });
      for (const ch of script) {
        if (ch === 'h') { const x = api.hint(); if (x && x.a) api.act(x.a); }
        if (ch === 'H') for (let n = 0; n < 500 && api.state().status === 'play'; n++) api.act(api.hint().a);
        if (ch === '?') api.giveHint();
        if (ch === 'd') api.startDemo();
        if (ch === 'x') api.act({ t: 'nonsense' });
      }
    }, [id, script]);
  }
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${out}/${t.replace(/[^\w-]/g, '_')}.png` });
}
if (errs.length) console.log('errors:', errs.slice(0, 12));
await browser.close();
