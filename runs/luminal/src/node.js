// node.js: loads the browser scripts into Node in the same order as index.html.
'use strict';
for (const f of ['core', 'builder', 'physics', 'song', 'level']) require('./' + f + '.js');
module.exports = globalThis.LUMINAL;
