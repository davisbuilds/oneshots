// film.mjs: record the cinematic demo as a video, frame by frame.
//   FFMPEG=/path/to/ffmpeg node tools/film.mjs [width=1280] [height=720] [fps=30]
// The page's own loop is paused; each frame advances the real engine (physics,
// streaming, portals) by exactly 1/fps seconds, so the film is deterministic
// and independent of how slowly the machine renders. Writes
// output/threshold_demo.mp4 (silent: the demo's sound is synthesised live).
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../../../scripts/browser.mjs';
import { startServer } from './serve.mjs';
import { GL_ARGS } from './shoot.mjs';

const [width = '1280', height = '720', fps = '30'] = process.argv.slice(2);
const OUT = fileURLToPath(new URL('../output/', import.meta.url));
const FRAMES = OUT + 'film-frames/';
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
await rm(FRAMES, { recursive: true, force: true });
await mkdir(FRAMES, { recursive: true });
const server = await startServer({ port: 0, quiet: true });
const browser = await launchBrowser({ headless: true, args: GL_ARGS });
let n = 0;
try {
  const page = await browser.newPage({ viewport: { width: +width, height: +height } });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(`${server.url}index.html?nosave&quality=3&capture`);
  await page.waitForFunction(() => window.THR && window.THR.ready);
  await page.evaluate(() => { THR.app.manual = true; THR.app.qPinned = true; THR.app.demo.recording = true; THR.app.start(true); });
  const t0 = Date.now();
  for (;;) {
    const r = await page.evaluate((dt) => {
      THR.frame(dt);
      return { url: document.getElementById('view').toDataURL('image/jpeg', 0.93), active: THR.app.demo.active, world: THR.app.player.world };
    }, 1 / +fps);
    await writeFile(`${FRAMES}${String(n).padStart(5, '0')}.jpg`, Buffer.from(r.url.split(',')[1], 'base64'));
    n++;
    if (n % 60 === 0) console.log(`frame ${n} (${(n / +fps).toFixed(1)} s of film) in ${((Date.now() - t0) / 60000).toFixed(1)} min, ${r.world}`);
    if (!r.active || n > +fps * 75) break;
  }
} finally {
  await browser.close();
  await server.close();
}
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', fps, '-i', FRAMES + '%05d.jpg', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT + 'threshold_demo.mp4'], { stdio: 'inherit' });
await rm(FRAMES, { recursive: true, force: true });
console.log(`wrote output/threshold_demo.mp4: ${n} frames, ${(n / +fps).toFixed(1)} s at ${width}x${height}`);
