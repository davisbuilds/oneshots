// Layer 4: the assembler.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/node.js');
const { rng, randBits } = require('./util.js');
const { assemble, disassemble } = G.asm;

const one = s => assemble(s).words[0];

test('loads and the encoding of compute instructions', () => {
  assert.equal(one('A = 0'), 0);
  assert.equal(one('A = 32767'), 0x7FFF);
  assert.equal(one('A = 0x4000'), 0x4000);
  // D = D + M: m=1, ctl all zero (x+y, no conditioning), dest D.
  assert.equal(one('D = D + M'), 0b1100000000010000);
  // M = D: x = D, y zeroed (zy), add; dest M.
  assert.equal(one('M = D'), 0b1000100000001000);
  // 0 ; jmp
  assert.equal(one('0 ; jmp') & 0b111, 0b111);
  assert.throws(() => one('A = 32768'), /0 to 32767/);
  assert.throws(() => one('D = 5'), /cannot compute/);
  assert.throws(() => one('D = D + A + M'), /A or M, not both/);
  assert.throws(() => one('D = D >> 2'), /cannot compute/);
  assert.throws(() => one('Q = D'), /destination/);
  assert.throws(() => one('D ; jxx'), /unknown jump/);
});

test('every expression the assembler accepts computes what it says', () => {
  const exprs = ['0', '1', '-1', 'D', 'A', 'M', '~D', '~M', '-D', '-A', 'D+1', 'M+1', 'D-1', 'A-1', 'D+A', 'D-M', 'M-D',
    'D&A', 'D|M', 'D^M', '~D&M', 'D+M+1', 'D-A-1', 'D>>1', 'M>>1', '(D+M)>>1', '(D+M+1)>>1', '~(D|A)', '~(D&M)', '~(D^A)', '(D^M)>>1'];
  const r = rng(5);
  for (const e of exprs) {
    const w = one(`D = ${e}`);
    const tree = G.asm.parseExpr(e);
    for (let i = 0; i < 200; i++) {
      const D = randBits(r, 16), Y = randBits(r, 16);
      const st = { A: Y, D, PC: 0 };
      const got = G.isa.step(st, w, Y).next.D;
      assert.equal(got, G.asm.evalExpr(tree, D, Y), `${e} with D=${D} Y=${Y}`);
    }
  }
});

test('labels, symbols, forward references and source lines', () => {
  const p = assemble(`
    .equ SCREEN 0x4000
    .equ BALL SCREEN
    .line 7
  start:
    A = end          # forward reference
    0 ; jmp
    .line 8
    A = SCREEN+3
  end: A = start
    0;JMP`);
  assert.deepEqual([...p.words.slice(0, 3)], [3, one('0;jmp'), 0x4003]);
  assert.equal(p.labels.get('end'), 3);
  assert.equal(p.symbols.get('BALL'), 0x4000);
  assert.deepEqual([...p.srcLine], [7, 7, 8, 8, 8]);
  assert.throws(() => assemble('a:\na:\n A = 1'), /defined twice/);
  assert.throws(() => assemble(' A = nowhere'), /unknown symbol/);
});

test('disassembly round-trips every compute instruction', () => {
  // 2 (m) x 256 (ALU) x 8 (dest) x 8 (jump): every compute word.
  let distinct = 0;
  for (let w = 0x8000; w <= 0xFFFF; w++) {
    const text = disassemble(w);
    const back = one(text);
    // Different control settings can compute the same function; the
    // reassembled word must behave identically, which for the ALU field
    // means the same function of D and Y.
    const a = G.isa.decode(w), b = G.isa.decode(back);
    if (!b.isC) {
      // "A = 1" reads back as a load of 1, which has the same effect.
      assert.ok(a.dA && !a.dD && !a.dM && !(a.jl | a.je | a.jg), text);
      for (const [D, Y] of [[0, 0], [5, 9], [0xFFFF, 0x1234]]) assert.equal(G.isa.alu(D, Y, a.ctl), b.value, text);
      continue;
    }
    assert.equal(b.dA + b.dD + b.dM, a.dA + a.dD + a.dM, text);
    assert.equal(b.jl << 2 | b.je << 1 | b.jg, a.jl << 2 | a.je << 1 | a.jg, text);
    for (const [D, Y] of [[0, 0], [1, 2], [0xFFFF, 3], [0x8000, 0x7FFF], [1234, 4321]])
      assert.equal(G.isa.alu(D, Y, b.ctl), G.isa.alu(D, Y, a.ctl), text);
    if (a.ctl === b.ctl) distinct++;
  }
  assert.ok(distinct > 0);
  console.log(`the ALU computes ${G.asm.distinctFunctions} distinct functions of D and Y with 256 settings`);
});
