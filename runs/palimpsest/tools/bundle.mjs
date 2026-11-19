// Package exactly the classic script entry used by the direct-file edition.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url),
  read = (name) => readFileSync(new URL(name, root), 'utf8');
const html = read('index.html')
  .replace(/<link rel="stylesheet" href="([^"]+)"\s*\/?>/g, (_, file) => '<style>' + read(file) + '</style>')
  .replace(
    /<script src="([^"]+)"><\/script>/g,
    (_, file) => '<script>' + read(file).replace(/<\/script/gi, '<\\/script') + '</script>',
  );
const bundle = html.replace(
  '<head>',
  '<head><!-- Three.js license\n' + read('vendor/THREE-LICENSE.txt') + '-->',
);
const out = new URL('output/palimpsest.html', root);
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== bundle)
    throw Error('Offline edition is stale. Run node tools/bundle.mjs.');
} else {
  mkdirSync(new URL('output/', root), { recursive: true });
  writeFileSync(out, bundle);
  console.log(fileURLToPath(out));
}
