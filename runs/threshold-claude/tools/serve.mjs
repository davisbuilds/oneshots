// serve.mjs: a tiny zero-dependency static server for the run directory.
// Browsers refuse ES modules from file:// URLs, so THRESHOLD needs one.
//   node tools/serve.mjs            serve on http://127.0.0.1:8737/
//   PORT=9000 node tools/serve.mjs
// It binds to localhost only and serves files under the run directory.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

export function startServer({ port = 8737, host = '127.0.0.1', root = ROOT, quiet = false } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (path === '' || path.endsWith(sep) || path.endsWith('/')) path = join(path, 'index.html');
      const file = join(root, path);
      if (!file.startsWith(normalize(root))) { res.writeHead(403).end('forbidden'); return; }
      const s = await stat(file);
      if (!s.isFile()) { res.writeHead(404).end('not found'); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, host, () => {
    const addr = server.address();
    if (!quiet) console.log(`THRESHOLD: http://${host}:${addr.port}/`);
    resolve({ server, port: addr.port, url: `http://${host}:${addr.port}/`, close: () => new Promise(r => server.close(r)) });
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer({ port: Number(process.env.PORT || 8737) });
}
