// vessel.js: ship classes, the bay plan that fits inside each hull, and the
// weights a loading condition is made of.
//
// Conventions follow the ISO 9711 / industry bay-row-tier (BRT) system: 40 ft
// bays carry even numbers counted from the bow (02, 06, 10, ...), rows are
// numbered from the centreline with odd numbers to starboard and even to
// port (00 on the centreline when the count is odd), hold tiers are 02, 04,
// ... from the tank top and deck tiers 82, 84, ... from the hatch covers.
'use strict';
(function (TL) {
  const BOX = { L: 12.192, W: 2.438, H: 2.591, HC: 2.896 };
  const BAY_PITCH = 13.0;       // 40 ft bay plus cell-guide and lashing gap, m
  const ROW_PITCH = 2.50;       // cell guides, m
  const DB = 1.7;               // double bottom height, m
  const WING = 1.9;             // wing tank breadth inside the shell, m
  const COAMING = 1.6;          // hatch coaming above the deck, m
  const HATCH = 0.7;            // hatch cover thickness, m

  // Three ship classes. Only principal dimensions and the layout of the
  // accommodation are given; capacity, displacement and the bay plan are
  // derived from the hull.
  const CLASSES = {
    feeder: {
      label: 'Feeder', L: 147, B: 25.0, D: 13.8, T: 8.6, aftOver: 5, foreOver: 6.5,
      aftBody: 26, accomBays: 0, accomLen: 0, deckTiers: 4, eye: 26.5,
      lightFrac: 0.30, speed: 17.5, hold: { gangway: 0 },
    },
    intermediate: {
      label: 'Intermediate', L: 198, B: 30.0, D: 16.8, T: 11.0, aftOver: 6, foreOver: 7.5,
      aftBody: 30, accomBays: 3, accomLen: 13, deckTiers: 5, eye: 34,
      lightFrac: 0.285, speed: 20,
    },
    panamax: {
      label: 'Panamax', L: 278, B: 32.2, D: 21.4, T: 12.5, aftOver: 7, foreOver: 9,
      aftBody: 34, accomBays: 4, accomLen: 19.5, deckTiers: 6, eye: 41,
      lightFrac: 0.27, speed: 22,
    },
  };

  // ISO 6346 check digit for a container number (owner code + U + serial).
  function isoCheckDigit(code10) {
    const val = (ch) => {
      if (/[0-9]/.test(ch)) return +ch;
      // Letters run from 10, skipping multiples of 11.
      let v = 10;
      for (let c = 65; c < ch.charCodeAt(0); c++) { v++; if (v % 11 === 0) v++; }
      return v;
    };
    let s = 0;
    for (let i = 0; i < 10; i++) s += val(code10[i]) * Math.pow(2, i);
    return (s % 11) % 10;
  }

  class Vessel {
    constructor(clsId, name, line, opts = {}) {
      const c = CLASSES[clsId];
      this.cls = clsId; this.c = c; this.name = name; this.line = line;
      this.visit = opts.visit || 'ARD-0000';
      this.hull = new TL.Hull({ L: c.L, B: c.B, D: c.D, T: c.T, aftOver: c.aftOver, foreOver: c.foreOver });
      this._layout();
      this._weights();
    }

    // Lay out bays from the bow aft, skipping the accommodation block, and
    // find the rows and tiers that fit inside the hull at each bay.
    _layout() {
      const c = this.c, hull = this.hull;
      this.bays = [];
      this.stacks = [];
      const xBowLimit = hull.L - 9;               // collision bulkhead region
      const xAftLimit = c.aftBody;                // engine room aft of here (feeder) / steering
      // Bays forward of the accommodation, then accommodation, then aft bays.
      const accomX1 = c.accomBays ? xAftLimit + c.accomBays * BAY_PITCH : xAftLimit;   // aft face of the house's forward edge
      this.accom = c.accomBays
        ? { x0: accomX1, x1: accomX1 + c.accomLen }
        : { x0: xAftLimit - 18, x1: xAftLimit - 2 };    // feeder: house over the engine room, aft
      // Bays forward of the house, laid from the house forward so every bay
      // centre sits on the same 6.5 m rhythm (the house length is a multiple
      // of half a bay); listed bow first.
      const centers = [];
      const x0f = c.accomBays ? this.accom.x1 : xAftLimit;
      for (let x = x0f + BAY_PITCH / 2; x + BAY_PITCH / 2 <= xBowLimit; x += BAY_PITCH) centers.unshift(x);
      if (c.accomBays) for (let k = 0; k < c.accomBays; k++) centers.push(accomX1 - BAY_PITCH / 2 - k * BAY_PITCH);
      const deckTop = c.D + COAMING + HATCH;      // hatch cover top
      const holdTop = c.D + COAMING - 0.3;        // a hold stack may rise into the coaming
      centers.forEach((x, i) => {
        const bay = { idx: i, no: 2 + 4 * i, x, stacks: [] };
        const halfAt = (z) => Math.min(hull.halfBreadth(x - BOX.L / 2, z), hull.halfBreadth(x + BOX.L / 2, z), hull.halfBreadth(x, z));
        // Hold: rows whose box fits between the wing tanks at every tier.
        const holdRows = [];
        const nr = Math.floor((c.B - 2 * WING) / ROW_PITCH);
        for (let r = 0; r < nr; r++) {
          const y = (r - (nr - 1) / 2) * ROW_PITCH;
          let tiers = 0;
          for (let z = DB; z + BOX.H <= holdTop + 1e-6; z += BOX.H) {
            const need = Math.abs(y) + BOX.W / 2 + 0.15;
            if (halfAt(z) - WING >= need && halfAt(Math.min(z + BOX.H, c.D)) - WING >= need) tiers++;
            else if (tiers === 0) continue;
            else break;
          }
          if (tiers > 0) holdRows.push({ y, tiers, base: this._holdBase(halfAt, y) });
        }
        // Deck: rows that fit within the hull at deck level plus a small overhang.
        const deckRows = [];
        const nd = Math.floor((c.B + 0.3) / ROW_PITCH);
        const halfDeck = halfAt(c.D);
        for (let r = 0; r < nd; r++) {
          const y = (r - (nd - 1) / 2) * ROW_PITCH;
          if (Math.abs(y) + BOX.W / 2 <= halfDeck + 0.4) deckRows.push({ y });
        }
        // Row numbers: odd to starboard, even to port, 00 at the centre for odd counts.
        const rowNo = (y, list) => {
          const n = list.length, k = list.findIndex(o => o.y === y);
          const mid = (n - 1) / 2, off = k - mid;
          if (n % 2) return off === 0 ? 0 : off > 0 ? 2 * off - 1 : -2 * off;
          return off > 0 ? 2 * (off - 0.5) + 1 - 0 : 2 * (-off - 0.5) + 2;
        };
        for (const r of holdRows) {
          const s = { id: this.stacks.length, bay: i, deck: false, y: r.y, x, rowNo: rowNo(r.y, holdRows), maxTiers: r.tiers, base: DB, top: holdTop, maxW: 240, reefer: false, boxes: [] };
          this.stacks.push(s); bay.stacks.push(s.id);
        }
        for (const r of deckRows) {
          const s = { id: this.stacks.length, bay: i, deck: true, y: r.y, x, rowNo: rowNo(r.y, deckRows), maxTiers: c.deckTiers, base: deckTop, top: deckTop + c.deckTiers * BOX.HC + 0.01, maxW: 100, reefer: true, boxes: [] };
          this.stacks.push(s); bay.stacks.push(s.id);
        }
        this.bays.push(bay);
      });
      // Sort bays bow to stern by number (already in that order by construction).
      this.slotsTotal = this.stacks.reduce((n, s) => n + s.maxTiers, 0);
      this.teu = this.slotsTotal * 2;
      this.bridge = { x: (this.accom.x0 + this.accom.x1) / 2, eye: this.c.eye };
    }
    _holdBase() { return DB; }

    // Lightship, tanks and their centres. Lightship is a fraction of the design
    // displacement (container ships: deadweight is about 70-75% of displacement).
    _weights() {
      const c = this.c, hull = this.hull;
      const design = hull.atDraft(c.T);
      this.dispDesign = design.disp;
      const Wl = this.dispDesign * c.lightFrac;
      this.lightship = { W: Wl, x: 0.43 * hull.L, y: 0, z: 0.58 * c.D };
      this.dwt = this.dispDesign - Wl;
      const xm = 0.5 * hull.L;
      // Tanks: fuel and fresh water in the double bottom, ballast (DB), and the
      // anti-heeling pair in the wing tanks amidships.
      const ahCap = Math.round(this.dispDesign * 0.0055);
      this.tanks = {
        fuel: { cap: Math.round(this.dwt * 0.06), fill: 0.55, x: 0.33 * hull.L, y: 0, z: DB * 0.5, fsm: 60 },
        water: { cap: Math.round(this.dwt * 0.008), fill: 0.6, x: 0.12 * hull.L, y: 0, z: c.D * 0.5, fsm: 8 },
        ballast: { cap: Math.round(this.dispDesign * 0.22), fill: 0.3, x: xm, y: 0, z: DB * 0.45, fsm: 0 },
        ahP: { cap: ahCap, fill: 0.5, x: xm, y: -(c.B / 2 - WING / 2), z: c.D * 0.45, l: 18, b: WING },
        ahS: { cap: ahCap, fill: 0.5, x: xm, y: +(c.B / 2 - WING / 2), z: c.D * 0.45, l: 18, b: WING },
      };
    }

    // Free-surface moment of a slack rectangular tank: rho i, i = l b^3 / 12.
    static tankFSM(t) {
      if (t.fsm != null) return t.fill > 0.02 && t.fill < 0.98 ? t.fsm : 0;
      return t.fill > 0.02 && t.fill < 0.98 ? TL.RHO * t.l * Math.pow(t.b, 3) / 12 : 0;
    }

    // Sums of weight and moments for everything except cargo.
    fixedSums() {
      const s = { W: 0, Mx: 0, My: 0, Mz: 0, FSM: 0 };
      const add = (W, x, y, z) => { s.W += W; s.Mx += W * x; s.My += W * y; s.Mz += W * z; };
      const L = this.lightship;
      add(L.W, L.x, L.y, L.z);
      for (const t of Object.values(this.tanks)) {
        const W = t.cap * t.fill;
        // A tank's centre rises with its fill.
        const z = t.z + (t === this.tanks.ballast || t === this.tanks.fuel ? 0 : (t.fill - 0.5) * 3);
        add(W, t.x, t.y, z);
        s.FSM += Vessel.tankFSM(t);
      }
      return s;
    }

    // Vertical centre of a box at position k in a stack (cargo centre taken at
    // 45% of box height, the usual loading-computer assumption).
    boxZ(stack, k, boxes) {
      let z = stack.base;
      for (let i = 0; i < k; i++) z += boxes[i].h;
      return z;
    }
    stackHeight(stack, boxes) { let z = 0; for (const b of boxes) z += b.h; return z; }

    // Cargo sums for a set of stacks given as arrays of boxes.
    cargoSums(stackBoxes) {
      const s = { W: 0, Mx: 0, My: 0, Mz: 0, FSM: 0 };
      for (let i = 0; i < this.stacks.length; i++) {
        const st = this.stacks[i], list = stackBoxes[i];
        if (!list || !list.length) continue;
        let z = st.base;
        for (const b of list) {
          s.W += b.w; s.Mx += b.w * st.x; s.My += b.w * st.y; s.Mz += b.w * (z + 0.45 * b.h);
          z += b.h;
        }
      }
      return s;
    }

    // SOLAS V/22: the sea surface must be visible from the conning position
    // within min(2 LOA, 500 m) ahead of the bow. Returns the highest allowed
    // cargo top (m above keel) at x for drafts aft / forward.
    visibilityTop(x, Ta, Tf) {
      const hull = this.hull, bx = this.bridge.x;
      if (x <= bx) return Infinity;
      const ahead = Math.min(2 * hull.LOA, 500);
      const xt = hull.xFwd + ahead;
      // Draft at x, and the waterline height continued ahead of the bow.
      const T = (xx) => Ta + (Tf - Ta) * (xx / hull.L);
      const zEye = this.bridge.eye, zSea = T(xt);
      return zSea + (zEye - zSea) * (xt - x) / (xt - bx);
    }

    get particulars() {
      const h = this.hull;
      return { LOA: h.LOA, LBP: h.L, B: h.B, D: h.D, Tdes: this.c.T, teu: this.teu, dwt: this.dwt, disp: this.dispDesign, light: this.lightship.W };
    }

    // Bay-row-tier label of a stack position.
    brt(stackId, k) {
      const s = this.stacks[stackId];
      const bay = String(this.bays[s.bay].no).padStart(2, '0');
      const row = String(s.rowNo).padStart(2, '0');
      const tier = String((s.deck ? 82 : 2) + 2 * k).padStart(2, '0');
      return `${bay} ${row} ${tier}`;
    }
  }

  TL.BOX = BOX;
  TL.VESSEL = { CLASSES, BAY_PITCH, ROW_PITCH, DB, WING, COAMING, HATCH };
  TL.Vessel = Vessel;
  TL.isoCheckDigit = isoCheckDigit;
})(globalThis.TL = globalThis.TL || {});
