// film.mjs: render the demo tour as a film, one frame of virtual time at a time.
//   node tools/film.mjs [out.mp4] [--fps 30] [--size 1920x1080]
// FFMPEG names an ffmpeg with libx264 (the asset build uses the imageio-ffmpeg wheel's).
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = args[0] && !args[0].startsWith('--') ? args[0] : fileURLToPath(new URL('../output/tideline_demo.mp4', import.meta.url));
const fps = +opt('--fps', 30);
const [W, H] = opt('--size', '1920x1080').split('x').map(Number);
await mkdir(fileURLToPath(new URL('../output/', import.meta.url)), { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(new URL('../index.html?still', import.meta.url).href);
await page.waitForFunction(() => window.TL && TL.app && TL.app.ready, null, { timeout: 180000 });
await page.evaluate(() => { document.body.classList.add('film'); TL.app.still = false; TL.UI.setSpeed(12); });
const ff = spawn(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error(`ffmpeg exited ${c}`)) : res())));
const dt = 1000 / fps;
let frames = 0;
const shoot = async () => { ff.stdin.write(await page.screenshot({ type: 'jpeg', quality: 92 })); frames++; };
// Settle for a second, start the tour, film until it ends, hold a second.
for (let i = 0; i < 30; i++) await page.evaluate(d => TL.app.filmFrame(d), dt);
await page.evaluate(() => TL.Demo.start());
let s;
do { s = await page.evaluate(d => TL.app.filmFrame(d), dt); await shoot(); if (frames % 150 === 0) console.log(`${frames} frames`); } while (s.demo && frames < fps * 90);
for (let i = 0; i < fps; i++) { await page.evaluate(d => TL.app.filmFrame(d), dt); await shoot(); }
ff.stdin.end();
await done;
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`wrote ${out}: ${frames} frames, ${(frames / fps).toFixed(1)} s, ${W} x ${H}`);
