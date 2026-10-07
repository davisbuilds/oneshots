// tools/shot.js: run the game headless and write the screen as a PPM image.
//   node tools/shot.js <frames> <out.ppm> [gates|ref] [keys-script]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const G = require('../src/node.js');
const [frames = '300', out = 'output/shot.ppm', cpu = 'ref'] = process.argv.slice(2);
const src = fs.readFileSync(path.join(__dirname, '../game/breakout.tin'), 'utf8');
const c = G.tin.compile(src);
const m = new G.machine.Machine(c.rom, { cpu });
const PER_FRAME = 4000;
const t0 = Date.now();
for (let f = 0; f < +frames; f++) { m.run(PER_FRAME); m.board.tick++; }
const S = 8, W = 64, H = 48;
const buf = Buffer.alloc(W * S * H * S * 3);
const pal = G.machine.PALETTE.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) {
  const col = pal[m.board.screen[(y / S | 0) * W + (x / S | 0)] & 15];
  buf.set(col, (y * W * S + x) * 3);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([Buffer.from(`P6 ${W * S} ${H * S} 255\n`), buf]));
const ram = n => m.board.ram[c.globals.find(g => g.name === n).addr];
console.log(`rom ${c.rom.length} words, ram ${c.ramUsed} words, ${m.cycle} cycles in ${Date.now() - t0} ms; score ${ram('score')} lives ${ram('lives')} bricks ${ram('bricks')} level ${ram('level')}`);
