// Render the page's guided tour to a film, frame by frame.
//   node runs/antikythera-engine/film.mjs [--fps 24] [--size 1280x720]   (from the repository root)
// Writes output/frames/*.png and, if an ffmpeg with libx264 is on PATH (or in
// $FFMPEG), output/antikythera_engine_tour.mp4. The page runs in capture mode:
// no animation loop; each frame advances the tour by exactly 1/fps seconds, so
// the film does not depend on how fast the machine renders.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const fps = +arg('--fps', 24);
const [W, H] = arg('--size', '1280x720').split('x').map(Number);
const frames = join(here, 'output', 'frames');
rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true });

const launch = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => { console.error(e); process.exit(1); });
// 30 September 2026 00:00 TT, the day after the run, so the film is reproducible.
await page.goto(pathToFileURL(join(here, 'index.html')).href + '?capture&tour&clean&jd=2461313.5');
await page.waitForFunction(() => window.__engine);
let n = 0;
for (;;) {
  const on = await page.evaluate(dt => { window.__engine.step(dt); return window.__engine.tour().on; }, n ? 1 / fps : 0);
  await page.screenshot({ path: join(frames, `${String(n).padStart(5, '0')}.png`) });
  if (++n % (fps * 5) === 0) console.log(`${(n / fps).toFixed(0)} s`);
  if (!on) break;
}
await browser.close();
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const out = join(here, 'output', 'antikythera_engine_tour.mp4');
try {
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, '%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  console.log(`wrote ${out} (${n} frames)`);
} catch (e) {
  console.log(`${n} frames in ${frames}; no usable ffmpeg (${e.message.split('\n')[0]}), so no MP4`);
}
