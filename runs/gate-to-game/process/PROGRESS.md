# Progress log

Times in UTC, 2026-10-06. Snapshots referenced here are in `snapshots/`,
numbered in the order they were made.

## 1. Survey and plan (22:00 to 22:15)

Read RUNS.md, the README, CLAUDE.md and two existing runs (the Antikythera
Engine and Borrowed Seconds) for layout, manifest and verifier conventions.

Plan: everything in plain JavaScript as classic scripts, so the page opens
straight from disk (ES modules do not load over `file://`) and the same files
run in Node for the tests. One namespace, `G2G`, filled in load order.

Decisions made before writing code:

- **The primitive is the NAND gate, and nothing else.** The HDL builder
  (`src/hdl.js`) has exactly one gate constructor. Constants are the two power
  rails, as on a chip. Every chip keeps its instance tree, because the zoom
  view has to walk down it.
- **Flip-flops from NANDs, not a DFF primitive.** A master-slave flip-flop of
  two 4-NAND gated latches (9 gates). This forces the simulator to deal with
  feedback for real.
- **A CPU of my own design, the G16**, in the family of the Hack machine from
  Nand2Tetris (an accumulator machine with A and D registers, one instruction
  per cycle, the ALU's control bits taken straight from the instruction) but
  with a different ALU: operand conditioning plus a carry-in, a choice of
  add/and/or/xor, and a free shift right by one. The shift pays for itself in
  the game's fixed-point maths.
- **Memory is outside the CPU.** RAM8 up to RAM4K are built and tested from
  NAND, but a 4K RAM is 1.13 million gates; in the browser, memory is
  simulated by its tested behaviour and the CPU by its gates. That is the
  boundary a real board has too, and the README says so.
- **No recursion in the language.** Static frames (every variable at a fixed
  address) make calls cheap and expressions stackless. The compiler checks the
  call graph and refuses recursion with the cycle in the message.

## 2. Gates, simulator and CPU (22:15 to 22:20)

- `src/hdl.js`, `src/chips.js`: 33 chips from Not to CPU, each with a
  behavioural spec. `tests/02-gates.test.js` builds each one and checks it
  against its spec, exhaustively when the inputs total 14 bits or fewer.
  All 35 tests passed on the first run.
- Gate counts: Not 1, And 2, Or 3, Xor 4, Mux 4, FullAdder 9, DLatch 4,
  DFF 9, Bit 13, ALU 784, **CPU 1,753**, RAM8 2,147, RAM4K 1,134,523.
- `src/sim.js`: the gates are ordered once. Each latch's cross-coupled pair is
  evaluated as a unit (three NAND evaluations settle it exactly), and the wire
  from each master latch to its slave is a "cut" read as the previous phase's
  value. Anything else that loops is refused as a combinational loop (tested).
  A convergence check re-evaluates the cut readers after each sweep; every
  phase of the CPU settles in one sweep.
- **Wrong:** the compiled sweep ran at 50 µs a cycle. A micro-benchmark showed
  V8 does not optimise one 4,000-statement function (51 µs a sweep) but runs
  the same code in chunks of 100 to 800 statements at about 2 µs. Chunked at
  500: **4.3 µs a cycle, about 230,000 cycles a second** for the whole CPU.
- `tests/03-cpu.test.js`: the gate CPU against the ISA reference
  (`src/isa.js`) for 100,000 random instructions, all outputs every cycle.
  Passed first time.
- Fault injection, to check the test has teeth. **Wrong at first:** only 81%
  of random stuck-at faults were caught. Three reasons, found by listing the
  escapes: (1) a stuck-at-1 on either input of a NOT gate changes nothing
  (NAND(a, 1) = NOT a), so those are not faults at all; (2) my latch fast path
  hard-coded the cross-coupling, so a fault on those wires was silently
  ignored, a real simulator bug for faulted netlists, now fixed (a pair whose
  cross wires are broken is simulated as two gates); (3) the clock-high phase
  only evaluates flip-flop gates, which masks faults that break the
  master/slave discipline, so the fault test evaluates every gate in both
  phases. After that: 223 of 228 sampled faults caught (97.8%).
- The scan path: real chips are tested by loading their flip-flops directly.
  `sim.loadDffs` does the same, and a test rebuilds 400 cycles of a running
  program from the registers alone and compares all 1,789 nets. This is what
  the zoom view uses to show any past cycle.

## 3. Transistors, assembler, compiler, game (22:20 to 22:22)

- `src/transistor.js`: switch-level CMOS. Four transistors make the NAND, with
  complementary pull-up and pull-down networks, and the solver reports a
  missing transistor as a floating node and a mis-wired one as a short. The
  whole ALU expanded to 3,136 transistors agrees net for net with the gate
  simulator.
- `src/asm.js`: rather than a table of allowed forms, the assembler evaluates
  an expression on 40 test operand pairs and finds the ALU control setting
  that behaves the same. So `D = (D+M+1)>>1` just works, and `D = D >> 2` is
  refused with "the ALU cannot compute". The 256 settings compute 65 distinct
  functions. Disassembly round-trips all 32,768 compute words. Two test bugs
  of mine on the way (a miscounted label address; a legal no-op word the
  assembler refused).
- `src/tin.js`: the Tin compiler. One bug: the call-graph scan counted
  `a >> 1` as a call to the runtime shift routine, so `__shr` looked
  recursive. It now uses the same rule as code generation. `*`, `/`, `%` and
  variable shifts are a runtime written in Tin itself.
- `game/breakout.tin`: BRICKFALL, 64 × 48. It keeps no brick map: the ball
  reads the colour of the pixel it is about to enter. With no input for three
  seconds an autopilot plays. 1,855 words of ROM, 187 words of RAM. It worked
  on its first run (snapshot 01).
- Cost per frame on the CPU: median 64 cycles, 99th percentile 371; a brick
  with a score redraw about 2,000; start-up 87,248. So 2,000 cycles a frame
  (120 kHz) is enough and the gate CPU has headroom.
- `tests/06-game.test.js`: the game played headless, and **one million
  cycles of the game on the NAND CPU against the reference: identical, every
  one of 40,785 memory writes in order**. Three test failures on the way were
  my tests' timing assumptions (start-up takes 44 frames; a key held for one
  frame can fall in a frame the game spends redrawing the score).
