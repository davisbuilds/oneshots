// bench.mjs: run the in-page benchmark (?bench) headless and save the table.
//   node tools/bench.mjs [quality=3] [width=1920] [height=1080] [fast]
// Results go to output/bench/. Headless Chromium here renders with SwiftShader
// (a CPU rasteriser): the GPU-inclusive times measure this machine's CPU, not
// a graphics card. Open index.html?bench in a desktop browser for real numbers.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../../../scripts/browser.mjs';
import { startServer } from './serve.mjs';
import { GL_ARGS } from './shoot.mjs';

const [quality = '3', width = '1920', height = '1080', fast = ''] = process.argv.slice(2);
const out = fileURLToPath(new URL('../output/bench/', import.meta.url));
await mkdir(out, { recursive: true });
const server = await startServer({ port: 0, quiet: true });
const browser = await launchBrowser({ headless: true, args: GL_ARGS });
try {
  const page = await browser.newPage({ viewport: { width: +width, height: +height } });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(`${server.url}index.html?bench${fast ? '=fast' : ''}&nosave&quality=${quality}`);
  await page.waitForFunction(() => window.THR && window.THR.bench, null, { timeout: 0, polling: 2000 });
  const table = await page.evaluate(() => document.getElementById('bench').textContent);
  const results = await page.evaluate(() => window.THR.bench);
  const name = `q${quality}-${width}x${height}${fast ? '-fast' : ''}`;
  await writeFile(out + name + '.json', JSON.stringify(results, null, 1));
  await writeFile(out + name + '.md', table + '\n');
  console.log(table);
} finally {
  await browser.close();
  await server.close();
}
