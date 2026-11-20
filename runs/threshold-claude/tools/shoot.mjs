// shoot.mjs: open the page headless and take screenshots of scripted poses.
//   node tools/shoot.mjs <script.json> [outDir]
// The script is a list of { name, query?, eval?, frames?, width?, height? }:
// `eval` is a JavaScript string run in the page before the screenshot (use the
// window.THR hooks), `frames` renders that many frames first.
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../../../scripts/browser.mjs';
import { startServer } from './serve.mjs';

export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export async function openPage(browser, server, { query = '', width = 1280, height = 720 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  await page.goto(server.url + 'index.html' + query);
  await page.waitForFunction(() => window.THR && window.THR.ready, null, { timeout: 120000 });
  return { page, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const script = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const out = process.argv[3] || fileURLToPath(new URL('../output/shots/', import.meta.url));
  await mkdir(out, { recursive: true });
  const server = await startServer({ port: 0, quiet: true });
  const browser = await launchBrowser({ headless: true, args: GL_ARGS });
  let current = null;
  try {
    for (const s of script) {
      const q = s.query || '';
      if (!current || current.q !== q || current.w !== (s.width || 1280)) {
        if (current) await current.page.close();
        const o = await openPage(browser, server, { query: q, width: s.width || 1280, height: s.height || 720 });
        current = { ...o, q, w: s.width || 1280 };
      }
      const t0 = Date.now();
      const res = await current.page.evaluate(async ({ code, frames }) => {
        window.THR.app.manual = true;
        let r = null;
        if (code) r = await (new Function('THR', 'THREE', `return (async () => { ${code} })()`))(window.THR, window.THR.THREE);
        for (let i = 0; i < (frames || 1); i++) window.THR.frame(1 / 60);
        return { r, stats: window.THR.stats() };
      }, { code: s.eval || '', frames: s.frames || 1 });
      await current.page.screenshot({ path: `${out}/${s.name}.png` });
      console.log(`${s.name}: ${Date.now() - t0} ms`, JSON.stringify(res));
      if (current.errors.length) { console.log('  page messages:', current.errors.slice(0, 8).join('\n  ')); current.errors.length = 0; }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}
