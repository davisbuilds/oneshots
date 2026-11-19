import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import { launchBrowser } from '../../../scripts/browser.mjs';

export const runRoot = fileURLToPath(new URL('../', import.meta.url));
export const output = fileURLToPath(new URL('../output/', import.meta.url));
export async function browserSession(action) {
  await mkdir(output + 'playwright', { recursive: true });
  const mime = {
    '.js': 'text/javascript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.ttf': 'font/ttf',
    '.webm': 'video/webm',
  };
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const p = resolve(runRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!p.startsWith(resolve(runRoot) + sep)) throw Error();
      const data = await readFile(p);
      res.writeHead(200, { 'Content-Type': mime[extname(p)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((ok, no) => {
    server.once('error', no);
    server.listen(0, '127.0.0.1', ok);
  });
  let browser;
  try {
    browser = await launchBrowser({
      headless: true,
      args: process.platform === 'darwin' ? ['--use-angle=metal'] : ['--enable-unsafe-swiftshader'],
    });
    await action(browser, 'http://127.0.0.1:' + server.address().port);
  } finally {
    await browser?.close();
    await new Promise((ok) => server.close(ok));
  }
}
export const state = (page) => page.evaluate(() => window.threshold.inspect());
export const ready = (page) =>
  page.waitForFunction(() => window.threshold?.ready, null, { timeout: 60000 });
export async function until(page, key, predicate, parameter) {
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(predicate, parameter, { timeout: 25000, polling: 'raf' });
  } finally {
    await page.keyboard.up(key);
  }
}
