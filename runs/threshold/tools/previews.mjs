// previews.mjs: render the README's preview images from the committed page.
//   node tools/previews.mjs [width=1920] [height=1080]
// Writes PNGs to output/previews/; convert them to the committed WebP files
// with tools/previews_webp.py (Pillow).
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../../../scripts/browser.mjs';
import { startServer } from './serve.mjs';
import { GL_ARGS } from './shoot.mjs';

const [width = '1920', height = '1080'] = process.argv.slice(2);
const OUT = fileURLToPath(new URL('../output/previews/', import.meta.url));
await mkdir(OUT, { recursive: true });

// name, world, feet (null y = terrain height + 0.1), yaw, pitch, extra page code
const SHOTS = [
  ['hero', '0,0', [0, 64, 36.5], 0, -0.015],
  ['turnaround', '1,0', [-10, null, 2.5], Math.PI / 2 + 0.06, 0.2],
  ['halfway', '0,0', [0.6, 60, -31.975], 0.95, -0.12],
  ['stoa', '0,0', [16.5, 60.24, 16], 0, 0.02],
  ['mirror', '3,0/mirror', [-2.5, 0, 0.6], -Math.PI / 2, 0.03],
  ['skylight', '3,0/mirror', [0.4, 0, 0.6], 0.1, 1.45],
  ['cell', '0,0', [-1.2, 60, -6.6], Math.PI / 2 + 0.04, 0.05],
  ['hall', '0,0/hall', [6, 0.3, -96], -0.15, 0.16],
  ['window', '1,0', 'hallwin:8:1.6', 0.15, 0.06],
  ['forest', '2,0', [-4, null, 10], 0.5, 0.22],
  ['vault', '3,0', 'mirror:40:0', 0, 0.33],
  ['islands', '2,-1', 'spawn', 0.4, 0.06],
  ['ruins', '-3,2', 'temple', 0, 0.05],
  ['cavern', '4,0', 'spawn', 0.3, 0.1],
  ['monolith', '-1,0', 'spawn', 0.2, 0.18],
  ['abstract', '-12,9', 'spawn', 0.25, 0.1],
];

const server = await startServer({ port: 0, quiet: true });
const browser = await launchBrowser({ headless: true, args: GL_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: +width, height: +height } });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(`${server.url}index.html?play&nosave&nolock&quality=4&mute`);
  await page.waitForFunction(() => window.THR && window.THR.ready);
  for (const [name, world, at, yaw, pitch] of SHOTS) {
    await page.evaluate(([world, at, yaw, pitch]) => {
      const app = THR.app; app.manual = true;
      const d = app.descs.get(world);
      let feet;
      if (Array.isArray(at)) feet = [at[0], at[1] ?? (d.heightAt ? d.heightAt(at[0], at[2]) + 0.1 : 0), at[2]];
      else if (at === 'spawn') feet = [...d.spawn.feet];
      else if (at === 'temple') { const t = d.landmarks[0].p; feet = [t[0] + 28, d.heightAt(t[0] + 28, t[2] + 12) + 0.1, t[2] + 12]; yaw = Math.atan2(28, 12); }
      else {
        const [slot, dist, side] = at.split(':'); const P = d.portals.find((p) => p.slot === slot);
        const r = [P.n[2], 0, -P.n[0]], x = P.xf.p[0] + P.n[0] * +dist + r[0] * +side, z = P.xf.p[2] + P.n[2] * +dist + r[2] * +side;
        feet = [x, d.heightAt ? d.heightAt(x, z) + 0.1 : P.xf.p[1] - P.hh, z]; yaw += Math.atan2(P.n[0], P.n[2]);
      }
      THR.place(world, feet, yaw, pitch);
      app.hud.card.classList.remove('on'); app.hud.clearHint(); app.hud.prompt(null);
      app.post.params.fade = 0;
      for (let i = 0; i < 4; i++) app.frame(1 / 60);
      app.post.params.fade = 0; app.post.target = d.post;
      Object.assign(app.post.params, { exposure: d.post.exposure, saturation: d.post.saturation, contrast: d.post.contrast, bloom: d.post.bloom, lift: d.post.lift, gain: d.post.gain });
      for (let i = 0; i < 2; i++) app.frame(1 / 60, { noPhysics: true });
      document.querySelectorAll('.card, .banner, .hint, .prompt').forEach((e) => e.classList.remove('on'));
    }, [world, at, yaw, pitch]);
    await page.screenshot({ path: `${OUT}${name}.png`, timeout: 600000 });
    console.log('preview', name);
  }
} finally {
  await browser.close();
  await server.close();
}
