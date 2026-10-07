// Layer 6: the game, played headless on the machine.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../src/node.js');

const SRC = fs.readFileSync(path.join(__dirname, '../game/breakout.tin'), 'utf8');
const C = G.tin.compile(SRC);
const { MAP } = G.isa;
const W = MAP.WIDTH;

function game(cpu = 'ref') {
  const m = new G.machine.Machine(C.rom, { cpu });
  const ram = name => m.board.ram[C.globals.find(g => g.name === name).addr];
  const s16 = v => ((v & 0xFFFF) ^ 0x8000) - 0x8000;
  // The board's timer ticks every `per` cycles, like a 60 Hz video signal.
  const frames = (n, keys = 0, per = 2000) => { for (let i = 0; i < n; i++) { m.board.keys = keys; m.run(per); m.board.tick++; } };
  const px = (x, y) => m.board.screen[y * W + x];
  // Start-up draws the walls, 90 bricks and the score: about 87,000 cycles.
  const boot = () => frames(60);
  // Hold the key that moves the paddle away from the ball.
  const dodge = () => frames(1, ram('bx') < 32 ? 2 : 1);
  return { m, ram, s16, frames, px, boot, dodge };
}

test('the game compiles to a ROM that fits, with room to spare', () => {
  assert.ok(C.rom.length < 4096, `${C.rom.length} words`);
  assert.ok(C.ramUsed < 512, `${C.ramUsed} words of RAM`);
});

test('the first frame draws walls, six rows of bricks, the paddle and the ball', () => {
  const g = game();
  g.boot();
  for (let x = 0; x < W; x++) assert.equal(g.px(x, 6), 1, 'top wall');
  for (let y = 7; y < 48; y++) { assert.equal(g.px(0, y), 1); assert.equal(g.px(63, y), 1); }
  for (let r = 0; r < 6; r++) for (let c = 0; c < 15; c++)
    assert.equal(g.px(2 + 4 * c, 9 + 2 * r), 2 + 2 * r + (c & 1), `brick ${r},${c}`);
  assert.equal(g.ram('bricks'), 90);
  const paddle = [...Array(W).keys()].filter(x => g.px(x, 44) === 14);
  assert.equal(paddle.length, 8);
  assert.equal(g.px(g.ram('bx'), g.ram('by')), 15, 'ball');
  assert.equal(g.ram('held'), 1);
  // Score 0000 in the corner: the 0 glyph has a hole in the middle.
  assert.equal(g.px(1, 0), 14); assert.equal(g.px(2, 2), 0);
});

test('keys move the paddle; the launch key releases the ball', () => {
  const g = game();
  g.boot();
  const p0 = g.ram('px');
  g.frames(5, 1);                           // left
  assert.equal(g.ram('px'), p0 - 5);
  g.frames(12, 2);                          // right
  assert.equal(g.ram('px'), p0 + 7);
  assert.equal(g.ram('held'), 1);
  g.frames(1, 4);                           // launch
  assert.equal(g.ram('held'), 0);
  assert.equal(g.s16(g.ram('vy')), -10);
  const y0 = g.ram('by');
  g.frames(30);
  assert.ok(g.ram('by') < y0 - 10, 'the ball rises');
});

test('left alone, the autopilot plays and breaks bricks', () => {
  const g = game();
  g.frames(3600);                           // one minute
  assert.ok(g.ram('score') > 30, `score ${g.ram('score')}`);
  assert.ok(g.ram('bricks') < 80);
  // Every brick that is gone was counted, and the score is the sum of the rows.
  let left = 0, points = 0;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 15; c++) {
    if (g.px(2 + 4 * c, 9 + 2 * r)) left++; else points += 6 - r;
  }
  if (g.ram('level') === 1) {
    assert.equal(left, g.ram('bricks'));
    assert.equal(points, g.ram('score'));
  }
});

test('missing the ball costs a life, and three misses end the game', () => {
  const g = game();
  g.boot();
  for (let life = 3; life > 0; life--) {
    g.frames(5, 4);                         // hold launch (the HUD redraw can take a frame)
    assert.equal(g.ram('held'), 0);
    for (let f = 0; f < 3000 && g.ram('lives') === life; f++) g.dodge();
    assert.equal(g.ram('lives'), life - 1);
  }
  g.frames(5);                              // let the HUD redraw finish
  assert.equal(g.ram('over'), 1);
  g.frames(200);
  assert.equal(g.ram('over'), 0, 'a new game starts');
  assert.equal(g.ram('lives'), 3);
  assert.equal(g.ram('bricks'), 90);
});

test('the game runs identically on the 1,753-gate CPU, cycle for cycle', () => {
  // A million cycles of real play: serve, autopilot launch, bounces, bricks.
  const a = game('ref'), b = game('gates');
  const log = g => { const w = []; const orig = g.m.board.write.bind(g.m.board); g.m.board.write = (ad, v, ...r) => { w.push(ad, v); orig(ad, v, ...r); }; return w; };
  const wa = log(a), wb = log(b);
  for (let f = 0; f < 1000; f++) {
    a.frames(1, 0, 1000); b.frames(1, 0, 1000);
    if (f % 100 === 99) assert.deepEqual(b.m.state(), a.m.state(), `CPU state at frame ${f}`);
  }
  assert.equal(wb.length, wa.length);
  assert.deepEqual(wb, wa, 'every memory write, in order');
  assert.deepEqual(b.m.board.screen, a.m.board.screen);
  assert.ok(a.ram('held') === 0 || a.ram('score') > 0, 'the run got past the serve');
  console.log(`${a.m.cycle} cycles, ${wa.length / 2} writes, score ${a.ram('score')}`);
});
