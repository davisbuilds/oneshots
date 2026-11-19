'use strict';
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const source = read('index.html');
const html = source
  .replace(
    /<link rel="stylesheet" href="([^"]+)"\s*\/?>/g,
    (_, file) => '<style>\n' + read(file) + '\n</style>',
  )
  .replace(
    /<script src="([^"]+)"><\/script>/g,
    (_, file) => '<script>\n' + read(file).replace(/<\/script/gi, '<\\/script') + '\n</script>',
  );
const dest = path.join(__dirname, 'output', 'cambrian-engine.html');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(dest, 'utf8') !== html)
    throw new Error('Standalone HTML differs from the current sources');
} else {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}
console.log('Standalone HTML · ' + Buffer.byteLength(html) + ' bytes');
