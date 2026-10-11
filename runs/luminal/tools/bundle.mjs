// bundle.mjs: inline every script into one self-contained HTML file,
// output/luminal.html, for sharing as a single attachment.
//   node tools/bundle.mjs           write it
//   node tools/bundle.mjs --check   build in memory and check it is complete
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const html = await readFile(root + 'index.html', 'utf8');
const tags = [...html.matchAll(/<script src="(src\/[\w.]+\.js)"><\/script>/g)];
if (tags.length < 8) throw new Error(`expected the page's scripts, found ${tags.length}`);
let out = html;
for (const [tag, path] of tags) {
  const code = await readFile(root + path, 'utf8');
  if (/<\/script/i.test(code)) throw new Error(`${path} contains a closing script tag`);
  out = out.replace(tag, () => `<script>/* ${path} */\n${code}</script>`);
}
if (/<script src=/.test(out)) throw new Error('an external script is left');
if (process.argv.includes('--check')) {
  console.log(`bundle ok: ${tags.length} scripts, ${(out.length / 1024).toFixed(0)} KiB`);
} else {
  await mkdir(root + 'output', { recursive: true });
  await writeFile(root + 'output/luminal.html', out);
  console.log(`wrote output/luminal.html (${(out.length / 1024).toFixed(0)} KiB, ${tags.length} scripts inlined)`);
}
