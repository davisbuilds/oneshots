// node.js: loads the simulation scripts into Node in the same order as
// index.html, for the tests and the headless checker.
'use strict';
for (const f of ['util', 'hull', 'stability', 'vessel', 'stowage', 'mapf', 'layout', 'crane', 'sim']) require('./' + f + '.js');
module.exports = globalThis.TL;
