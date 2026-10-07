// tools/film.mjs: render the guided tour as a film, frame by frame.
//   node tools/film.mjs [out.mp4] [--fps 30] [--size 1280x800]
// Opens index.html?film in headless Chromium (CHROMIUM_PATH to override the
// browser), plays the game for a few seconds on the gate-level CPU, starts
// the tour, and pipes one screenshot per frame of virtual time to ffmpeg.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = args[0] && !args[0].startsWith('--') ? args[0] : fileURLToPath(new URL('../output/gate_to_game_tour.mp4', import.meta.url));
const fps = +opt('--fps', 30);
const [W, H] = opt('--size', '1280x800').split('x').map(Number);
await mkdir(fileURLToPath(new URL('../output/', import.meta.url)), { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(new URL('../index.html?film', import.meta.url).href);
await page.waitForFunction(() => window.G2G && G2G.app && G2G.app.filmFrame);

// FFMPEG names the encoder (the asset build uses the imageio-ffmpeg wheel's).
const ff = spawn(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error(`ffmpeg exited ${c}`)) : res())));

const dt = 1000 / fps;
let t = 0, frames = 0;
const step = () => page.evaluate(t => G2G.app.filmFrame(t), t);
const shoot = async () => { ff.stdin.write(await page.screenshot({ type: 'jpeg', quality: 92 })); frames++; };

// Play for 8 seconds without recording, so the game is under way.
for (let i = 0; i < 8 * 60; i++) { t += 1000 / 60; await step(); }
// Four seconds of the game, then the tour, until it returns to the game.
for (let i = 0; i < 4 * fps; i++) { t += dt; await step(); await shoot(); }
await page.evaluate(() => G2G.app.startTour());
let s;
do { t += dt; s = await step(); await shoot(); } while (s.tour && frames < fps * 180);
for (let i = 0; i < 2 * fps; i++) { t += dt; await step(); await shoot(); }
ff.stdin.end();
await done;
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`wrote ${out}: ${frames} frames, ${(frames / fps).toFixed(1)} s`);
