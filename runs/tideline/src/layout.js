// layout.js: the terminal on the ground. Arden Bay is a straddle-carrier
// terminal: ship-to-shore cranes on a quay, straddle carriers (SC) running
// over rows of boxes stacked up to three high, and trucks served in a
// transfer zone behind the yard, through a gate at the east end.
//
// World frame: x along the quay (east), y inland (north), z up, metres. The
// quay edge is y = 0; water is y < 0. Ground is indexed by 6.5 m cells: a
// 40 ft yard slot is two cells long, a straddle carrier lane one cell wide.
'use strict';
(function (TL) {
  const CELL = 6.5;
  const NX = 150, NY = 72;
  const grid = new TL.MAPF.Grid(0, 0, CELL, NX, NY);
  const cx = (i) => (i + 0.5) * CELL;          // cell centre
  const cy = (j) => (j + 0.5) * CELL;

  // Rows of cells (j) and what they are for.
  const J = {
    quay: 0,                 // quay edge, bollards, waterside rail
    craneLanes: [1, 2, 3, 4],
    buffers: [2, 3],         // where cranes set boxes down / pick them up
    rail: 5,                 // landside crane rail (crossable between legs)
    apron: [6, 7, 8],
    block1: [9, 29],         // first row of yard blocks (inclusive)
    cross: [30, 31, 32],
    block2: [33, 53],
    back: [54, 55, 56],
    zone: [57, 60],          // transfer zone (SC side 57-59, trucks to 60)
    roadW: 61, roadW2: 62, roadE: 63, roadE2: 64,
  };
  const RAIL = { water: 3.0, land: 35.0 };     // rail centrelines, gauge 32 m

  const BERTHS = [
    { id: 'B1', x0: 6, x1: 336, depth: 15.0 },
    { id: 'B2', x0: 336, x1: 600, depth: 13.0 },
    { id: 'B3', x0: 600, x1: 806, depth: 11.0 },
  ];

  // Yard: seven columns of blocks (A-G) in two rows (1 by the quay, 2 inland),
  // 16 rows of boxes each, 10 slots per row, stacked up to three high.
  const BLOCKS = [];
  const SLOT_TIERS = 3;
  const letters = 'ABCDEFG';
  for (let b = 0; b < 7; b++) {
    const i0 = 4 + 18 * b;
    for (const [r, [j0, j1]] of [J.block1, J.block2].entries()) {
      const slots = [];
      for (let j = j0 + 1; j <= j1 - 1; j += 2) slots.push(j);
      BLOCKS.push({
        name: letters[b] + (r + 1), col: b, row: r, i0, i1: i0 + 15, j0, j1, slots,
        reefer: letters[b] + (r + 1) === 'D2',
        x0: i0 * CELL, x1: (i0 + 16) * CELL, y0: j0 * CELL, y1: (j1 + 1) * CELL,
      });
    }
  }
  const blockAt = (i, j) => BLOCKS.find(B => i >= B.i0 && i <= B.i1 && j >= B.j0 && j <= B.j1) || null;

  // Transfer bays (trucks reverse in, cab north; an SC straddles the trailer
  // from the south), SC parking pockets, gate lanes.
  const BAYS = [];
  for (let i = 72, k = 0; i <= 120; i += 3, k++) BAYS.push({ id: 'T' + String(k + 1).padStart(2, '0'), i, x: cx(i), yBox: cy(58) });
  const POCKETS = [];
  for (let i = 8; i <= 40; i++) POCKETS.push({ i, j: 58 });
  const GATE = { i: 136, x: cx(136), inLanes: [J.roadW, J.roadW2], outLanes: [J.roadE, J.roadE2], uTurnI: 66 };

  // Cell types for straddle carriers: 0 blocked, 1 lane (any heading),
  // 2 rail (crossing only), 3 yard row (along the row only), 4 zone (bays and
  // pockets, along y only).
  const SC_TYPE = new Uint8Array(NX * NY);
  (function () {
    const set = (i, j, t) => { if (i >= 0 && j >= 0 && i < NX && j < NY) SC_TYPE[j * NX + i] = t; };
    for (let i = 1; i <= 131; i++) {
      for (const j of J.craneLanes) set(i, j, 1);
      set(i, J.rail, 2);
      for (const j of J.apron) set(i, j, 1);
    }
    for (let i = 2; i <= 130; i++) { for (const j of J.cross) set(i, j, 1); for (const j of J.back) set(i, j, 1); }
    for (const B of BLOCKS) for (let i = B.i0; i <= B.i1; i++) for (let j = B.j0; j <= B.j1; j++) set(i, j, 3);
    for (const P of POCKETS) for (let j = 57; j <= 59; j++) set(P.i, j, 4);
    for (const T of BAYS) for (let j = 57; j <= 59; j++) set(T.i, j, 4);
  })();

  // Straddle carrier body: 10 m long, 5 m wide; reservations add 0.3 m.
  const SC_BODY = { hl: 5.0, hw: 2.5, margin: 0.3 };
  const TRUCK_BODY = { hl: 8.25, hw: 1.3, margin: 0.3 };
  const DIRX = 0, DIRY = Math.PI / 2;

  function buildScGraph() {
    const g = new TL.MAPF.Graph(grid, SC_BODY);
    const idx = new Int32Array(NX * NY * 2).fill(-1);
    const typeOk = (cells, heading) => {
      for (const c of cells) {
        if (c < 0) return false;
        const t = SC_TYPE[c];
        if (t === 0) return false;
        if (heading === 0 && t !== 1) return false;     // along x: open lanes only
      }
      return true;
    };
    // States on every cell centre whose body fits, in both orientations.
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      for (const h of [0, 1]) {
        const fp = g.footprint(cx(i), cy(j), h ? DIRY : DIRX);
        if (!typeOk(fp, h)) continue;
        const s = g.addState(cx(i), cy(j), h ? DIRY : DIRX, null);
        idx[(j * NX + i) * 2 + h] = s;
      }
    }
    const S = (i, j, h) => (i < 0 || j < 0 || i >= NX || j >= NY ? -1 : idx[(j * NX + i) * 2 + h]);
    // Moves along the heading, and quarter turns in place where the whole
    // 3 x 3 block of cells around is open lane.
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      for (const h of [0, 1]) {
        const a = S(i, j, h);
        if (a < 0) continue;
        const nbrs = h === 0 ? [[i + 1, j], [i - 1, j]] : [[i, j + 1], [i, j - 1]];
        for (const [ii, jj] of nbrs) {
          const b = S(ii, jj, h);
          if (b < 0) continue;
          g.addEdge(a, b, 1, { type: 'line', x0: cx(i), y0: cy(j), x1: cx(ii), y1: cy(jj), th: h ? DIRY : DIRX }, 'move');
        }
      }
      const a = S(i, j, 0), b = S(i, j, 1);
      if (a >= 0 && b >= 0) {
        let open = true;
        for (let dj = -1; dj <= 1 && open; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= NX || jj >= NY || SC_TYPE[jj * NX + ii] !== 1) { open = false; break; }
        }
        if (open) {
          g.addEdge(a, b, 3, { type: 'turn', x: cx(i), y: cy(j), th0: DIRX, th1: DIRY }, 'turn');
          g.addEdge(b, a, 3, { type: 'turn', x: cx(i), y: cy(j), th0: DIRY, th1: DIRX }, 'turn');
        }
      }
    }
    g.S = S;
    g.pocketStates = POCKETS.map(P => S(P.i, P.j, 1));
    g.bayStates = BAYS.map(T => S(T.i, 58, 1));
    // Pockets and bays are both private: only the vehicle that parks there
    // (or serves that bay) may sweep their cells.
    g.problems = g.sealPockets(g.pocketStates.concat(g.bayStates));
    g.nPockets = POCKETS.length;
    return g;
  }

  // Trucks drive a hand-laid road graph: lanes at cell centres, lane changes,
  // a U-turn at the west end, and the reverse-in / pull-out manoeuvres at the
  // transfer bays.
  function buildTruckGraph() {
    const g = new TL.MAPF.Graph(grid, TRUCK_BODY);
    const W = Math.PI, E = 0, N = Math.PI / 2;
    const lane = {};               // lane[j][i] -> state
    const iMax = NX - 2;           // entry / exit column
    const add = (j, i0, i1, th) => {
      lane[j] = lane[j] || {};
      for (let i = i0; i <= i1; i++) lane[j][i] = g.addState(cx(i), cy(j), th, `L${j}:${i}`);
    };
    add(J.roadW, GATE.uTurnI, iMax, W);
    add(J.roadW2, 128, iMax, W);
    add(J.roadE, GATE.uTurnI, iMax, E);
    add(J.roadE2, 128, iMax, E);
    const line = (a, b, d) => {
      const A = g.states[a], B = g.states[b];
      return g.addEdge(a, b, d, { type: 'line', x0: A.x, y0: A.y, x1: B.x, y1: B.y, th: A.th }, 'move');
    };
    // Along the lanes (westbound lanes run toward smaller i).
    for (const j of [J.roadW, J.roadW2]) for (const i of Object.keys(lane[j]).map(Number)) if (lane[j][i - 1] != null) line(lane[j][i], lane[j][i - 1], 1);
    for (const j of [J.roadE, J.roadE2]) for (const i of Object.keys(lane[j]).map(Number)) if (lane[j][i + 1] != null) line(lane[j][i], lane[j][i + 1], 1);
    const path = (a, b, d, pts, kind) => g.addEdge(a, b, d, { type: 'path', pts }, kind || 'path');
    // S-curve lane change over three cells.
    const sCurve = (x0, y0, x1, y1, th) => {
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const u = k / 12, s = TL.smooth(u);
        const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * s;
        pts.push([x, y, Math.atan2((y1 - y0) * 6 * u * (1 - u), x1 - x0)]);
      }
      return pts;
    };
    path(lane[J.roadW2][128], lane[J.roadW][125], 3, sCurve(cx(128), cy(J.roadW2), cx(125), cy(J.roadW), W));
    path(lane[J.roadE][127], lane[J.roadE2][130], 3, sCurve(cx(127), cy(J.roadE), cx(130), cy(J.roadE2), E));
    // U-turn: westbound to eastbound around the west end.
    {
      const i = GATE.uTurnI, R = (cy(J.roadE) - cy(J.roadW)) / 2, c0 = cx(i), c1 = cy(J.roadW) + R;
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const f = -Math.PI / 2 - Math.PI * k / 16;
        pts.push([c0 + R * Math.cos(f), c1 + R * Math.sin(f), f - Math.PI / 2]);
      }
      path(lane[J.roadW][i], lane[J.roadE][i], 5, pts, 'uturn');
    }
    // Transfer bays: reverse in from the westbound lane, pull out to eastbound.
    const R = 2 * CELL;
    const dock = [];
    for (const T of BAYS) {
      const yDock = T.yBox + 2.5;                 // truck centre, box 2.5 m behind it
      const s = g.addState(T.x, yDock, N, 'bay:' + T.id);
      dock.push(s);
      const start = lane[J.roadW][T.i - 2];
      const pin = [];
      const ccx = T.x - R, ccy = cy(J.roadW) - R;
      for (let k = 0; k <= 12; k++) {
        const f = Math.PI / 2 - (Math.PI / 2) * k / 12;
        pin.push([ccx + R * Math.cos(f), ccy + R * Math.sin(f), f + Math.PI / 2]);
      }
      for (let k = 1; k <= 4; k++) pin.push([T.x, ccy - (ccy - yDock) * k / 4, N]);
      path(start, s, 14, pin, 'dock');
      const out = lane[J.roadE][T.i + 2];
      const pout = [];
      const ay = cy(J.roadE) - R;
      for (let k = 0; k <= 4; k++) pout.push([T.x, yDock + (ay - yDock) * k / 4, N]);
      for (let k = 1; k <= 12; k++) {
        const f = Math.PI - (Math.PI / 2) * k / 12;
        pout.push([T.x + R + R * Math.cos(f), ay + R * Math.sin(f), f - Math.PI / 2]);
      }
      path(s, out, 10, pout, 'pullout');
    }
    // Outside the grid: a virtual queue the trucks wait in before the gate,
    // and the road beyond the exit. Neither has a body on the grid.
    const outside = g.states.length;
    g.states.push({ id: outside, x: cx(iMax) + 40, y: cy(J.roadW), th: W, fp: new Int32Array(0), tag: 'outside', priv: -1 });
    g.out.push([]); g.inn.push([]);
    const sink = g.states.length;
    g.states.push({ id: sink, x: cx(iMax) + 40, y: cy(J.roadE), th: E, fp: new Int32Array(0), tag: 'sink', priv: -1 });
    g.out.push([]); g.inn.push([]);
    for (const j of [J.roadW, J.roadW2]) {
      const e = { a: outside, b: lane[j][iMax], d: 2, motion: { type: 'line', x0: cx(iMax) + 13, y0: cy(j), x1: cx(iMax), y1: cy(j), th: W }, kind: 'enter', sweep: g.states[lane[j][iMax]].fp, priv: -1 };
      g.out[outside].push(e); g.inn[e.b].push(e);
    }
    for (const j of [J.roadE, J.roadE2]) {
      const e = { a: lane[j][iMax], b: sink, d: 2, motion: { type: 'line', x0: cx(iMax), y0: cy(j), x1: cx(iMax) + 13, y1: cy(j), th: E }, kind: 'leave', sweep: g.states[lane[j][iMax]].fp, priv: -1 };
      g.out[e.a].push(e); g.inn[sink].push(e);
    }
    g.lane = lane; g.dock = dock; g.outside = outside; g.sink = sink;
    g.boothIn = [lane[J.roadW][GATE.i], lane[J.roadW2][GATE.i]];
    g.boothOut = [lane[J.roadE][GATE.i], lane[J.roadE2][GATE.i]];
    g.problems = g.sealPockets(dock);
    return g;
  }

  // Scenery placed once and drawn by the renderer: light masts, buildings,
  // trees, fences. Positions only; all of it stays off the vehicle cells.
  function scenery() {
    const masts = [];
    for (const B of BLOCKS) if (B.col < 6) masts.push({ x: (B.i1 + 2) * CELL, y: (B.j0 + B.j1 + 1) / 2 * CELL, h: 34 });
    const buildings = [
      { name: 'Operations', x: 900, y: 335, w: 46, d: 28, h: 16, kind: 'office' },
      { name: 'Workshop', x: 40, y: 410, w: 70, d: 34, h: 13, kind: 'shed' },
      { name: 'Gatehouse', x: GATE.x + 2, y: 440, w: 24, d: 12, h: 6, kind: 'gatehouse' },
      { name: 'Reefer substation', x: 840, y: 250, w: 22, d: 16, h: 7, kind: 'sub' },
    ];
    const trees = [];
    const rng = TL.rng(11);
    for (let x = 20; x < 960; x += 14 + rng() * 10) trees.push({ x, y: 452 + rng() * 10, r: 3.5 + rng() * 2 });
    for (let y = 70; y < 430; y += 15 + rng() * 10) trees.push({ x: 940 + rng() * 25, y, r: 3.5 + rng() * 2 });
    for (let k = 0; k < 10; k++) trees.push({ x: cx(GATE.uTurnI) - 2 + rng() * 4, y: cy(J.roadW2) + (rng() - 0.5) * 2, r: 1.8 });
    return { masts, buildings, trees };
  }

  TL.Layout = {
    CELL, NX, NY, grid, cx, cy, J, RAIL, BERTHS, BLOCKS, SLOT_TIERS, BAYS, POCKETS, GATE,
    SC_TYPE, SC_BODY, TRUCK_BODY, blockAt, buildScGraph, buildTruckGraph, scenery,
  };
})(globalThis.TL = globalThis.TL || {});
