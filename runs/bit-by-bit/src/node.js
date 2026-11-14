// node.js: loads the browser scripts into Node in the same order as index.html.
'use strict';
for (const f of ['core', 'logic/search', 'logic/sort', 'logic/linear', 'logic/hash', 'logic/tree', 'logic/graph', 'logic/recur', 'levels']) require('./' + f + '.js');
module.exports = globalThis.BB;
