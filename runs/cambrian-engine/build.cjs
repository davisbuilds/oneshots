'use strict';
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const source = read('index.html');
// Each local asset has its own declaration line in the checked-in template.
function embedAsset(line) {
  const tag = line.trim();
  if (tag.startsWith('<script src=')) {
    const asset = /^<script src="([a-z0-9-]+\.js)">/.exec(tag);
    if (!asset || tag.slice(asset[0].length).trim() !== '</script>') {
      throw new Error('Expected a local script declaration on one line');
    }
    const body = read(asset[1]).replace(/<\/script/gi, '<\\/script');
    return '<script>\n' + body + '\n</script>';
  }
  if (tag.startsWith('<link rel="stylesheet"')) {
    const asset = /href="([a-z0-9-]+\.css)"/.exec(tag);
    if (!asset) throw new Error('Expected a local stylesheet');
    return '<style>\n' + read(asset[1]) + '\n</style>';
  }
  return line;
}

const html = source.split('\n').map(embedAsset).join('\n');
const dest = path.join(__dirname, 'output', 'cambrian-engine.html');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(dest, 'utf8') !== html)
    throw new Error('Standalone HTML differs from the current sources');
} else {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}
console.log('Standalone HTML · ' + Buffer.byteLength(html) + ' bytes');
