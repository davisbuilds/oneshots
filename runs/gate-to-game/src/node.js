// node.js: loads the browser scripts into Node, in the same order as index.html.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
for (const f of ['hdl', 'chips', 'sim', 'transistor', 'isa', 'asm', 'tin', 'machine', 'layout', 'trace']) {
  const file = path.join(__dirname, f + '.js');
  if (fs.existsSync(file)) require(file);
}
module.exports = globalThis.G2G;
