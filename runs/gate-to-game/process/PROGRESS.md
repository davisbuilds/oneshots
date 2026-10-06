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

## 4. The zoom (22:22 to 22:40)

- Design: every level a 1600 × 1000 frame inside a 16:10 anchor of the level
  above; every chip box 16:10 too, so a child's schematic fits its box exactly
  and its port pins meet the wires drawn to the box. The camera is one number,
  the log of the magnification; between levels it scales about the fixed
  point of the frame-to-anchor map. Drawing recurses inward from one level
  above the camera, culled by size and visibility, so the whole hierarchy
  appears wherever it is big enough, not just the path.
- `src/trace.js`: pixel log entry, then probe snapshots of both cycles, then
  a walk back through flipped gates. The first rule (deepest gate on the
  chain) **always landed in a one-gate NOT wrapper** inside the ALU's operand
  conditioning, which makes a dull last step. Changed to: the first gate in a
  full adder if the chain passes through one, else the deepest. On a played
  screen, 2,618 of 2,772 drawn pixels now trace through the adder.
- `src/layout.js`: explicit placement for the CPU, grids (snaked for carry
  chains) for 16-wide arrays, columns by longest path otherwise. Wires grouped
  by (source port, target port).
- First look in Chromium (my screenshots of this were overwritten by the next
  run of the script): every level rendered, no errors, the CPU at 122 kHz.
  **Wrong:** the title, stats and caption panels covered the frames' edges;
  the source listing overflowed into the assembly column; the instruction's
  field breakdown sat under the CPU card; the CMOS cell's wiring was a tangle,
  and each transistor's cross-section showed through its symbol too early.
- Fixes: a sidebar on wide screens, a top bar and bottom sheet on phones, and
  a measured safe area that every frame is fitted into (snapshot 02); columns
  clipped; the card moved; the CMOS cell redrawn as the textbook vertical
  schematic; cross-sections only appear past 380 px. CPU parts got names
  ("A register" rather than ResetRegister16). Snapshot 03 shows the
  in-between frames: continuous at every boundary.
- `tests/07-view.test.js`: every layout inside its frame, 16:10, no overlaps;
  every input bit of every chip wired exactly once; for every seventh pixel
  the traced cycle really writes that pixel's value to its address and the
  chosen gate really flipped and its transistor conducts; the camera's
  transform at the end of each level equals the next level's at its start.
- `verify.mjs`: the real browser. Two failures were timing in my test (a
  fixed 900 ms wait for an eased camera; a tour slower than I assumed);
  replaced every sleep with a wait for the condition, and made the camera snap
  once within 0.003 of its target. Snapshot 04: clicking the program counter
  re-aims the path through PC > Inc16 > HalfAdder.

## 5. Slow motion, the whole computer in NAND, the film (22:40 to 22:52)

- Unit-delay replay of the chosen cycle (`trace.replay`): start from the
  previous cycle's settled state, hand each master's value to its slave,
  apply the new instruction, update all gates at once per step. **All 554
  replays tried settle on exactly the state of the two-phase simulator**, in
  at most 28 gate delays, with a median of 86 nets glitching on the way.
  Snapshot 05 is the adder mid-wave. Now a test.
- RAM512 and RAM4K at gate level, interpreted (1.13M gates are too many to
  compile): 7 s. That made a stronger claim cheap: a `Computer` chip, CPU plus
  RAM4K plus address decoding, 1,136,320 NANDs, runs a compiled Fibonacci and
  sieve program in lockstep with the reference for all 2,049 cycles.
- Phones (snapshot 06): portrait and landscape both keep every panel on
  screen, no horizontal scroll. The frames are 16:10, so a portrait phone has
  spare height.
- Clock: 2,000 cycles a frame costs about 8 ms here, which a slow phone may
  not afford, so the page lowers it (to no less than 500, above the game's
  99th-percentile need) and shows the clock it achieves.
- `tools/film.mjs`: `?film` replaces the page's clock with a virtual one, and
  the script screenshots one frame per 1/30 s of virtual time into FFmpeg.
  51.1 s, 1,534 frames, 85 s to render (snapshot 07). Built and checked again
  with the `imageio-ffmpeg` wheel's encoder, as the Run assets workflow will.
- The selected-pixel highlight was a heavy cyan square once the pixel was big
  (snapshot 08); it now fades out as the pixel grows.

## 6. Collection plumbing and docs (22:52 to 23:00)

- `npm test`, `npm run verify:browser` and the Validate Runs workflow now
  include this run (the workflow uses the runner's preinstalled Node; nothing
  new is downloaded). README and AGENTS.md count seven verifiers.
- Not done here: the film is declared as a release asset but not published;
  that is the Run assets workflow's job after merge. The verifier ran against
  the preinstalled Chromium 1194 build via `CHROMIUM_PATH`, because the locked
  Playwright wants a newer build than this container has.
