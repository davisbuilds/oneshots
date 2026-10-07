// scene.js: the continuous zoom, drawn on a 2D canvas.
//
// Every level is a frame of 1600 x 1000 units, and each level sits inside a
// 16:10 rectangle (its anchor) of the level above. The camera position is one
// number, z, the natural log of the magnification. Between two levels the
// camera zooms about the fixed point of the map from a frame to its anchor,
// so the anchor grows in place, as in Powers of Ten. Drawing starts one level
// above the camera and recurses inwards, skipping anything off screen or too
// small to see, so the chip hierarchy is drawn all the way down wherever it
// is large enough, not only along the path.
'use strict';
(function (G) {
  const { FW, FH } = G.layout;
  const C = {
    bg: '#060910', panel: '#0b111d', panel2: '#101929', edge: '#22304d', edgeHi: '#3a5280',
    dim: '#2c3956', lit: '#ffb03a', litSoft: 'rgba(255,176,58,0.18)', flip: '#ff4fd8', flipSoft: 'rgba(255,79,216,0.22)',
    ink: '#e7ecf6', muted: '#8391ad', faint: '#4d5a78', path: '#5fd4ff', pathSoft: 'rgba(95,212,255,0.16)',
    vdd: '#ff6b6b', gnd: '#6b9bff',
  };
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
  const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hex4 = v => '0x' + (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  const bin16 = v => (v & 0xFFFF).toString(2).padStart(16, '0');
  const commas = n => Math.round(n).toLocaleString('en-US');

  // ---- CMOS NAND cell geometry, in the Nand's own 1600 x 1000 frame -------
  // The textbook layout: two PMOS side by side under VDD, two NMOS stacked
  // above GND, the output node between them. Each transistor box is 16:10, so
  // its cross-section can be drawn inside it.
  const TW = 300, TH = 187.5;
  const CMOS = {
    vdd: 80, gnd: 944, outY: 404,
    P1: { x: 400, y: 140, w: TW, h: TH }, P2: { x: 900, y: 140, w: TW, h: TH },
    N1: { x: 650, y: 470, w: TW, h: TH }, N2: { x: 650, y: 724, w: TW, h: TH },
  };
  const LEAD = 0.7;     // where the source/drain leads leave a transistor box

  class Scene {
    constructor(canvas, env) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.env = env;               // { machine, compiled, nl, screenCanvas }
      this.levels = [];
      this.z = 0;
      this.hits = [];
      this.time = 0;
      this.sel = null;
      this.transistor = 'P1';
    }

    // ---- Levels ----------------------------------------------------------

    setSelection(sel, keepZ) {
      this.sel = sel;
      const L = [];
      const px = 160 + sel.x * 20, py = 20 + sel.y * 20;
      L.push({ kind: 'game', short: 'Game', name: 'BRICKFALL', anchor: { x: px + 10 - 16, y: py, w: 32, h: 20 } });
      L.push({ kind: 'pixel', short: 'Pixel', name: `Pixel (${sel.x}, ${sel.y})`, anchor: sel.record ? { x: 520, y: 600, w: 560, h: 350 } : null });
      if (sel.record) {
        L.push({ kind: 'program', short: 'Program', name: `Instruction at ROM ${sel.pc}`, anchor: { x: 1100, y: 700, w: 440, h: 275 } });
        sel.path.forEach((inst, i) => {
          const last = i === sel.path.length - 1;
          const next = sel.path[i + 1];
          const anchor = last ? CMOS[this.transistor] : G.layout.layoutOf(this.env.nl, inst).boxes[inst.children.indexOf(next)];
          L.push({ kind: last ? 'nand' : 'chip', inst, short: i === 0 ? 'CPU' : last ? 'NAND' : inst.type, name: i === 0 ? 'The G16 CPU' : `${inst.type} · ${inst.label}`, anchor });
        });
        L.push({ kind: 'mosfet', short: 'Transistor', name: `Transistor ${this.transistor}`, anchor: null });
      }
      let z = 0;
      for (const l of L) {
        l.z = z;
        if (l.anchor) { l.s = l.anchor.w / FW; z += Math.log(1 / l.s); }
      }
      this.zMax = L[L.length - 1].z;
      this.levels = L;
      if (!keepZ) this.z = Math.min(this.z, this.zMax);
      this.z = Math.min(this.z, this.zMax);
    }

    levelAt(z) {
      const L = this.levels;
      let k = 0;
      while (k + 1 < L.length && L[k + 1].z <= z + 1e-9) k++;
      const f = L[k].anchor ? (z - L[k].z) / Math.log(1 / L[k].s) : 0;
      return { k, f: Math.min(1, Math.max(0, f)) };
    }

    // Screen transform {x, y, s} of level k at local zoom f.
    // Frames are fitted into the safe area: the canvas less the panels.
    transform(k, f) {
      const sa = this.env.safe || { x: 0, y: 0, w: this.cv.width, h: this.cv.height };
      const fs = Math.min(sa.w / FW, sa.h / FH);
      const ox = sa.x + (sa.w - FW * fs) / 2, oy = sa.y + (sa.h - FH * fs) / 2;
      const l = this.levels[k];
      if (!l.anchor) return { x: ox, y: oy, s: fs };
      const s = l.s, R = l.anchor;
      const Px = R.x / (1 - s), Py = R.y / (1 - s);
      const k2 = Math.pow(s, f);
      const o = { x: Px * (1 - k2), y: Py * (1 - k2) };
      const sc = fs / k2;
      return { x: ox - o.x * sc, y: oy - o.y * sc, s: sc };
    }
    inner(T, R) { return { x: T.x + R.x * T.s, y: T.y + R.y * T.s, s: T.s * R.w / FW }; }
    outer(T, R) { const s = T.s * FW / R.w; return { x: T.x - R.x * s, y: T.y - R.y * s, s }; }

    // ---- Frame ------------------------------------------------------------

    // `override` replaces the camera's transform for the current level (used
    // to ease the camera after the path below it changes).
    render(time, override) {
      this.time = time;
      this.replayStep(time);
      const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      this.hits = [];
      if (!this.levels.length) return;
      const { k, f } = this.levelAt(this.z);
      this.cur = { k, f };
      let T = override || this.transform(k, f);
      let start = k;
      // Draw from one level up (two when the anchor is wide), for the margins.
      for (let up = 0; up < 2 && start > 0; up++) { start--; T = this.outer(T, this.levels[start].anchor); }
      this.dpr = this.env.dpr || 1;
      this.drawLevel(start, T, 1);
    }

    drawLevel(i, T, alpha) {
      const l = this.levels[i];
      if (!l) return;
      switch (l.kind) {
        case 'game': this.drawGame(T); break;
        case 'pixel': this.drawPixel(T, alpha); break;
        case 'program': this.drawProgram(T, alpha); break;
        case 'chip': this.drawChip(l.inst, T, alpha, 0); return;
        case 'nand': this.drawCmos(l.inst, T, alpha, true); return;
        case 'mosfet': this.drawMosfet(this.levels[i - 1].inst, this.transistor, T, alpha); return;
      }
      if (l.anchor && this.levels[i + 1]) {
        const T2 = this.inner(T, l.anchor);
        const w = FW * T2.s;
        if (w > 8 && this.visible(T2)) {
          const a = l.kind === 'game' ? smooth(260, 520, w) : smooth(90, 260, w);
          if (a > 0.01) this.clipFrame(T2, () => this.drawLevel(i + 1, T2, a));
        }
      }
    }

    visible(T, w = FW, h = FH) {
      const x1 = T.x + w * T.s, y1 = T.y + h * T.s;
      return x1 > 0 && y1 > 0 && T.x < this.cv.width && T.y < this.cv.height;
    }
    clipRect(T, r, fn) {
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath(); ctx.rect(T.x + r.x * T.s, T.y + r.y * T.s, r.w * T.s, r.h * T.s); ctx.clip();
      fn();
      ctx.restore();
    }
    clipFrame(T, fn) {
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath(); ctx.rect(T.x, T.y, FW * T.s, FH * T.s); ctx.clip();
      fn();
      ctx.restore();
    }

    // ---- Drawing helpers ---------------------------------------------------

    text(str, T, x, y, size, color, align = 'left', font = SANS, weight = '') {
      const px = size * T.s;
      if (px < 3.5) return false;
      const ctx = this.ctx;
      ctx.font = `${weight} ${px}px ${font}`;
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.fillText(str, T.x + x * T.s, T.y + y * T.s);
      return true;
    }
    rect(T, r, fill, stroke, lw = 1, radius = 0) {
      const ctx = this.ctx;
      const x = T.x + r.x * T.s, y = T.y + r.y * T.s, w = r.w * T.s, h = r.h * T.s;
      ctx.beginPath();
      if (radius && w > 6) ctx.roundRect(x, y, w, h, radius * T.s); else ctx.rect(x, y, w, h);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    }
    line(T, pts, color, lw) {
      const ctx = this.ctx;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, T.x + x * T.s, T.y + y * T.s));
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
    }
    hit(T, r, data) { this.hits.push({ x: T.x + r.x * T.s, y: T.y + r.y * T.s, w: r.w * T.s, h: r.h * T.s, ...data }); }

    // Values come from the settled cycle, or, in slow motion, from the
    // unit-delay replay at the current step; then "flipped" means the net
    // changed in the last two gate delays: the wavefront.
    v(net) { return this.frame ? this.frame[net] : this.sel.now[net]; }
    flipped(net) {
      if (!this.frame) return this.sel.before[net] !== this.sel.now[net];
      const h = this.replay.history, i = this.step;
      return (i > 0 && h[i][net] !== h[i - 1][net]) || (i > 1 && h[i - 1][net] !== h[i - 2][net]);
    }
    replayStep(time) {
      const r = this.replay;
      if (!r) { this.frame = null; return; }
      const period = r.steps * r.stepMs + r.hold;
      const t = (time - r.t0) % period;
      this.step = Math.min(r.steps, Math.floor(t / r.stepMs));
      this.frame = r.history[this.step];
    }

    // ---- Level: the game ----------------------------------------------------

    drawGame(T) {
      const ctx = this.ctx, sel = this.sel;
      const scr = { x: 160, y: 20, w: 1280, h: 960 };
      const sx = T.x + scr.x * T.s, sy = T.y + scr.y * T.s, pw = 20 * T.s;
      // Only the visible pixels, so a zoomed-in screen stays cheap.
      const x0 = Math.max(0, Math.floor(-sx / pw)), y0 = Math.max(0, Math.floor(-sy / pw));
      const x1 = Math.min(64, Math.ceil((this.cv.width - sx) / pw)), y1 = Math.min(48, Math.ceil((this.cv.height - sy) / pw));
      ctx.imageSmoothingEnabled = false;
      // A soft glow around the screen.
      if (pw < 40) {
        ctx.save(); ctx.shadowColor = 'rgba(90,140,255,0.25)'; ctx.shadowBlur = 40 * T.s;
        this.rect(T, scr, '#000'); ctx.restore();
      }
      if (x1 > x0 && y1 > y0) ctx.drawImage(this.env.screenCanvas, x0, y0, x1 - x0, y1 - y0, sx + x0 * pw, sy + y0 * pw, (x1 - x0) * pw, (y1 - y0) * pw);
      // The pixel grid appears as the pixels grow.
      const ga = smooth(10, 40, pw) * 0.5;
      if (ga > 0.01) {
        ctx.strokeStyle = `rgba(0,0,0,${ga})`; ctx.lineWidth = Math.max(1, pw * 0.03);
        ctx.beginPath();
        for (let x = x0; x <= x1; x++) { ctx.moveTo(sx + x * pw, sy + y0 * pw); ctx.lineTo(sx + x * pw, sy + y1 * pw); }
        for (let y = y0; y <= y1; y++) { ctx.moveTo(sx + x0 * pw, sy + y * pw); ctx.lineTo(sx + x1 * pw, sy + y * pw); }
        ctx.stroke();
      }
      this.hit(T, scr, { kind: 'screen', scr });
      // The selected pixel.
      const fade = 1 - smooth(30, 90, pw);
      if (sel && fade > 0.01) {
        const r = { x: scr.x + sel.x * 20, y: scr.y + sel.y * 20, w: 20, h: 20 };
        const pulse = this.env.still ? 1 : 0.55 + 0.45 * Math.sin(this.time / 220);
        ctx.save();
        ctx.strokeStyle = `rgba(95,212,255,${(0.5 + 0.5 * pulse) * fade})`;
        ctx.lineWidth = Math.max(1.5, pw * 0.08);
        const g = Math.max(3, pw * 0.25) / T.s;
        this.rect(T, { x: r.x - g, y: r.y - g, w: r.w + 2 * g, h: r.h + 2 * g }, null, ctx.strokeStyle, ctx.lineWidth);
        ctx.restore();
      }
    }

    // ---- Level: one pixel ----------------------------------------------------

    drawPixel(T, alpha) {
      const ctx = this.ctx, sel = this.sel;
      ctx.save(); ctx.globalAlpha = alpha;
      const col = G.machine.PALETTE[sel.value & 15];
      const lum = parseInt(col.slice(1, 3), 16) * 0.3 + parseInt(col.slice(3, 5), 16) * 0.59 + parseInt(col.slice(5, 7), 16) * 0.11;
      const ink = lum > 140 ? '#0a0d14' : C.ink, sub = lum > 140 ? 'rgba(10,13,20,0.7)' : C.muted;
      const cx = 800;
      this.text(`pixel (${sel.x}, ${sel.y})`, T, cx, 92, 46, ink, 'center', SANS, '600');
      this.text(`memory word ${hex4(sel.address)}  =  SCREEN + ${sel.y}·64 + ${sel.x}`, T, cx, 158, 26, sub, 'center', MONO);
      // The word, bit by bit.
      const bw = 44, bx = cx - bw * 8, by = 210;
      for (let i = 0; i < 16; i++) {
        const b = (sel.value >> (15 - i)) & 1;
        const r = { x: bx + i * bw + 3, y: by, w: bw - 6, h: 58 };
        this.rect(T, r, b ? (lum > 140 ? 'rgba(10,13,20,0.85)' : 'rgba(255,255,255,0.9)') : null, sub, Math.max(1, 1.5 * T.s), 6);
        this.text(String(b), T, r.x + r.w / 2, r.y + 30, 30, b ? (lum > 140 ? '#fff' : '#0a0d14') : sub, 'center', MONO, '600');
      }
      this.text(`value ${sel.value} → colour ${sel.value & 15} of the palette`, T, cx, 320, 26, sub, 'center', SANS);
      // Palette strip.
      for (let i = 0; i < 16; i++) {
        const r = { x: cx - 16 * 16 + i * 32, y: 352, w: 28, h: 28 };
        this.rect(T, r, G.machine.PALETTE[i], i === (sel.value & 15) ? ink : null, Math.max(1, 3 * T.s), 4);
      }
      if (!sel.record) {
        this.text('Never written since power-on: still the 0 the RAM started with.', T, cx, 600, 30, ink, 'center');
        ctx.restore(); return;
      }
      this.text(`last written in cycle ${commas(sel.record.cycle)}, by one instruction:`, T, cx, 470, 30, ink, 'center', SANS, '500');
      // Card for the program level (drawn inside it by drawLevel).
      const a = this.levels[1].anchor;
      this.rect(T, { x: a.x - 6, y: a.y - 6, w: a.w + 12, h: a.h + 12 }, C.panel, lum > 140 ? '#0a0d14' : C.edgeHi, Math.max(1, 3 * T.s), 14);
      this.hit(T, a, { kind: 'zoom', level: 2 });
      ctx.restore();
    }

    // ---- Level: the program -------------------------------------------------

    drawProgram(T, alpha) {
      const ctx = this.ctx, sel = this.sel, comp = this.env.compiled;
      ctx.save(); ctx.globalAlpha = alpha;
      this.rect(T, { x: 0, y: 0, w: FW, h: FH }, C.panel);
      const src = this.env.sourceLines, prog = comp.program, rom = comp.rom;
      const pc = sel.pc;
      // Tin source, around the line.
      const sx = 40, sw = 620;
      this.text('Tin source  ·  game/breakout.tin', T, sx, 48, 22, C.muted, 'left', SANS, '600');
      const line = sel.srcLine;
      const first = Math.max(1, line - 8);
      for (let i = 0; i < 18; i++) {
        const n = first + i;
        if (n > src.length) break;
        const y = 92 + i * 34;
        if (n === line) this.rect(T, { x: sx - 10, y: y - 16, w: sw, h: 32 }, C.pathSoft, C.path, Math.max(1, 1.5 * T.s), 4);
        this.text(String(n).padStart(3), T, sx, y, 19, C.faint, 'left', MONO);
        this.clipRect(T, { x: sx + 50, y: y - 20, w: sw - 70, h: 40 }, () =>
          this.text(src[n - 1] || '', T, sx + 52, y, 19, n === line ? C.ink : C.muted, 'left', MONO));
      }
      if (line <= 0) this.text('(start-up code: global initialisers, then main)', T, sx, 92, 19, C.muted, 'left', MONO);
      // Call chain.
      if (sel.calls && sel.calls.length) {
        this.text('called as', T, sx, 724, 20, C.muted, 'left', SANS, '600');
        const names = sel.calls.map(c => c.name + '()');
        for (let i = 0, y = 760; i < names.length; i += 3, y += 32)
          this.text((i ? '  ←  ' : '') + names.slice(i, i + 3).join('  ←  '), T, sx, y, 20, C.ink, 'left', MONO);
      }
      // Assembly and machine code, around the PC.
      const ax = 690, mx = 1060;
      this.text('G16 assembly', T, ax, 48, 22, C.muted, 'left', SANS, '600');
      this.text('ROM word', T, mx, 48, 22, C.muted, 'left', SANS, '600');
      const lo = Math.max(0, pc - 7), hi = Math.min(rom.length - 1, pc + 7);
      for (let a = lo; a <= hi; a++) {
        const y = 92 + (a - lo) * 34;
        const here = a === pc;
        if (here) this.rect(T, { x: ax - 10, y: y - 16, w: 860, h: 32 }, C.pathSoft, C.path, Math.max(1, 1.5 * T.s), 4);
        this.text(String(a).padStart(4), T, ax, y, 19, C.faint, 'left', MONO);
        this.clipRect(T, { x: ax + 60, y: y - 20, w: mx - ax - 76, h: 40 }, () =>
          this.text(this.env.asmLines[prog.asmLine[a]].trim(), T, ax + 64, y, 19, here ? C.ink : C.muted, 'left', MONO));
        this.text(bin16(rom[a]).replace(/(.{4})/g, '$1 ').trim(), T, mx, y, 19, here ? C.ink : C.faint, 'left', MONO);
      }
      // The fields of this instruction.
      const w = rom[pc];
      const fy = 92 + 15 * 34 + 16;
      const fields = w & 0x8000
        ? [['1', 'compute'], [w >> 14 & 1, w >> 14 & 1 ? 'y = M' : 'y = A'], [bin16(w).slice(2, 10), 'ALU: zx nx zy ny ci f f sh'], [bin16(w).slice(10, 13), 'store to A D M'], [bin16(w).slice(13), 'jump if < = >']]
        : [['0', 'load'], [bin16(w).slice(1), `A = ${w}`]];
      let fx = mx;
      fields.forEach(([bits, what]) => {
        this.text(String(bits), T, fx, fy, 19, C.lit, 'left', MONO);
        fx += String(bits).length * 11.6 + 12;
      });
      this.text(fields.map(f => f[1]).join('  ·  '), T, mx, fy + 34, 15, C.muted, 'left', SANS);
      // Card for the CPU.
      const R = this.levels[2].anchor;
      this.rect(T, { x: R.x - 6, y: R.y - 6, w: R.w + 12, h: R.h + 12 }, C.bg, C.edgeHi, Math.max(1, 2.5 * T.s), 12);
      this.text(`the CPU during cycle ${commas(sel.record.cycle)}`, T, R.x, R.y - 24, 20, C.muted, 'left', SANS, '600');
      // A connector from the instruction to the card.
      const yy = 92 + (pc - lo) * 34;
      this.line(T, [[R.x + R.w - 24, yy + 16], [R.x + R.w - 24, R.y - 44]], C.path, Math.max(1, 1.5 * T.s));
      this.hit(T, R, { kind: 'zoom', level: 3 });
      ctx.restore();
    }

    // ---- Levels: chips --------------------------------------------------------

    onPath(inst) {
      const p = this.sel.path;
      return p && p.includes(inst);
    }

    // Draw an instance's schematic in its frame T.
    drawChip(inst, T, alpha, depth) {
      if (!this.visible(T) || alpha < 0.02) return;
      const ctx = this.ctx, nl = this.env.nl;
      const lay = G.layout.layoutOf(nl, inst);
      const wires = G.layout.wiresOf(nl, inst);
      ctx.save();
      ctx.globalAlpha *= alpha;
      this.rect(T, { x: 0, y: 0, w: FW, h: FH }, depth % 2 ? C.panel2 : C.panel);
      // Title.
      const spec = G.hdl.CHIPS[inst.type] || {};
      const names = (spec.layout && spec.layout.names) || {};
      const pnames = inst.parent && G.hdl.CHIPS[inst.parent.type].layout && G.hdl.CHIPS[inst.parent.type].layout.names || {};
      const heading = !inst.parent ? 'G16 CPU' : pnames[inst.label] ? `${pnames[inst.label]}  ·  ${inst.type}` : `${inst.type}  ·  ${inst.label}`;
      this.text(heading, T, 24, 30, 26, C.ink, 'left', SANS, '600');
      if (spec.about) this.text(spec.about, T, 24, 64, 17, C.muted, 'left', SANS);
      // Wires first, so boxes sit on top.
      for (const w of wires) this.drawWire(T, w, inst);
      // Ports on the frame edges.
      const P = G.layout.ports(inst);
      P.ins.forEach(p => this.drawPort(T, inst, 'ins', p));
      P.outs.forEach(p => this.drawPort(T, inst, 'outs', p));
      // Children.
      inst.children.forEach((c, i) => {
        const b = lay.boxes[i];
        const sw = b.w * T.s;
        if (sw < 2.5) return;
        const Tc = this.inner(T, b);
        if (!this.visible(Tc)) return;
        const path = this.onPath(c);
        if (c.type === 'Nand') this.drawNandBox(c, T, b, path, depth);
        else {
          this.rect(T, b, depth % 2 ? C.panel : C.panel2, path ? C.path : C.edgeHi, Math.max(1, (path ? 2.2 : 1.2) * Math.min(3, T.s * 2)), 10);
          const ia = smooth(150, 380, sw);
          if (ia < 0.99) {
            ctx.save(); ctx.globalAlpha *= 1 - ia;
            const nice = names[c.label];
            const title = nice || c.type, sub = nice ? c.type : c.label;
            const size = Math.min(b.h * 0.22, b.w * 0.8 / Math.max(4, title.length) * 1.6);
            this.text(title, T, b.x + b.w / 2, b.y + b.h / 2 - size * 0.35, size, path ? C.path : C.ink, 'center', SANS, '600');
            this.text(sub, T, b.x + b.w / 2, b.y + b.h / 2 + size * 0.7, size * 0.6, C.muted, 'center', MONO);
            ctx.restore();
          }
          if (ia > 0.01) this.drawChip(c, Tc, ia, depth + 1);
        }
        this.hit(T, b, { kind: 'inst', inst: c });
      });
      ctx.restore();
    }

    drawPort(T, inst, side, port) {
      const p = G.layout.pin({ x: 0, y: 0, w: FW, h: FH }, inst, side, port);
      const nets = [].concat(side === 'ins' ? inst.ins[port] : inst.outs[port]);
      const on = nets.some(n => this.v(n)), fl = nets.some(n => this.flipped(n));
      const r = { x: p.x - 9, y: p.y - 9, w: 18, h: 18 };
      if (fl) this.rect(T, { x: r.x - 6, y: r.y - 6, w: 30, h: 30 }, C.flipSoft, null, 0, 15);
      this.rect(T, r, on ? C.lit : C.dim, null, 0, 9);
      const label = nets.length > 1 ? `${port} ${hex4(this.busValue(nets))}` : `${port} ${this.v(nets[0])}`;
      this.text(label, T, side === 'ins' ? p.x + 16 : p.x - 16, p.y - 20, 17, fl ? C.flip : C.muted, side === 'ins' ? 'left' : 'right', MONO);
    }
    busValue(nets) { return nets.reduce((v, n, i) => v | (this.v(n) << i), 0); }

    drawWire(T, w, inst) {
      const ctx = this.ctx;
      const on = w.nets.some(n => this.v(n));
      const fl = w.nets.some(n => this.flipped(n));
      const a = w.src.at, b = w.dst.at;
      if (w.src.kind === 'rail' || w.src.kind === 'clk') {
        // A short stub with a label, rather than a wire to nowhere.
        this.line(T, [[b.x - 40, b.y], [b.x, b.y]], w.src.kind === 'clk' ? C.path : on ? C.lit : C.dim, Math.max(1, 2 * T.s));
        this.text(w.src.kind === 'clk' ? 'clk' : w.src.v ? 'VDD' : 'GND', T, b.x - 44, b.y, 13, w.src.kind === 'clk' ? C.path : w.src.v ? C.vdd : C.gnd, 'right', MONO);
        return;
      }
      const lw = (w.nets.length > 1 ? 3.2 : 1.8);
      const x0 = T.x + a.x * T.s, y0 = T.y + a.y * T.s, x1 = T.x + b.x * T.s, y1 = T.y + b.y * T.s;
      const dx = x1 - x0;
      const k = dx > 30 * T.s ? Math.max(30 * T.s, dx * 0.5) : 140 * T.s + Math.abs(dx) * 0.3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + k, y0, x1 - k, y1, x1, y1);
      if (fl) { ctx.strokeStyle = C.flipSoft; ctx.lineWidth = Math.max(4, (lw + 7) * T.s); ctx.stroke(); }
      ctx.strokeStyle = on ? (w.nets.length > 1 && !w.nets.every(n => this.v(n)) ? '#c98a3a' : C.lit) : C.dim;
      ctx.lineWidth = Math.max(0.8, lw * T.s);
      ctx.stroke();
      // Bus value, at the middle, when there is room.
      if (w.nets.length > 1 && T.s > 0.7 && Math.hypot(x1 - x0, y1 - y0) > 220) {
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, px = 12 * T.s;
        const label = hex4(this.busValue(w.nets));
        ctx.font = `${px}px ${MONO}`;
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(6,9,16,0.85)'; ctx.fillRect(mx - tw / 2 - 3, my - px * 0.75, tw + 6, px * 1.5);
        ctx.fillStyle = fl ? C.flip : C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, mx, my);
      }
    }

    // A NAND gate symbol filling a 16:10 box, with its CMOS cell inside.
    drawNandBox(inst, T, b, path, depth) {
      const ctx = this.ctx, nl = this.env.nl;
      const g = inst.gate;
      const va = this.v(nl.gA[g]), vb = this.v(nl.gB[g]), vo = this.v(nl.gOut[g]);
      const fo = this.flipped(nl.gOut[g]);
      const sw = b.w * T.s;
      const ia = smooth(170, 420, sw);
      const X = u => T.x + (b.x + u * b.w) * T.s, Y = v => T.y + (b.y + v * b.h) * T.s;
      ctx.save();
      ctx.globalAlpha *= 1 - ia * 0.85;
      // Stubs from the box edge to the body.
      const lw = Math.max(1, 0.012 * b.w * T.s);
      const stub = (u0, v0, u1, val, f) => {
        ctx.beginPath(); ctx.moveTo(X(u0), Y(v0)); ctx.lineTo(X(u1), Y(v0));
        if (f) { ctx.strokeStyle = C.flipSoft; ctx.lineWidth = lw * 4; ctx.stroke(); }
        ctx.strokeStyle = val ? C.lit : C.dim; ctx.lineWidth = lw; ctx.stroke();
      };
      stub(0, 1 / 3, 0.26, va, this.flipped(nl.gA[g]));
      stub(0, 2 / 3, 0.26, vb, this.flipped(nl.gB[g]));
      stub(0.78, 0.5, 1, vo, fo);
      // Body: flat back, round front, and the inverting bubble.
      ctx.beginPath();
      ctx.moveTo(X(0.26), Y(0.12)); ctx.lineTo(X(0.46), Y(0.12));
      ctx.arc(X(0.46), Y(0.5), 0.38 * b.h * T.s, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(X(0.26), Y(0.88)); ctx.closePath();
      if (fo) { ctx.save(); ctx.shadowColor = C.flip; ctx.shadowBlur = Math.min(30, 0.1 * sw); }
      ctx.fillStyle = C.panel2; ctx.fill();
      ctx.strokeStyle = path ? C.path : fo ? C.flip : C.edgeHi; ctx.lineWidth = lw * (path ? 1.8 : 1.2); ctx.stroke();
      if (fo) ctx.restore();
      ctx.beginPath(); ctx.arc(X(0.745), Y(0.5), 0.035 * b.w * T.s, 0, Math.PI * 2);
      ctx.fillStyle = vo ? C.lit : C.dim; ctx.fill();
      ctx.strokeStyle = path ? C.path : C.edgeHi; ctx.lineWidth = lw; ctx.stroke();
      if (sw > 60) this.text(inst.label === 'q' || inst.label === 'qb' || inst.label === 's' || inst.label === 'r' ? inst.label : 'NAND', T, b.x + b.w * 0.43, b.y + b.h * 0.5, b.h * 0.13, C.muted, 'center', SANS, '600');
      ctx.restore();
      if (ia > 0.01) this.drawCmos(inst, this.inner(T, b), ia, false);
    }

    // ---- Level: the CMOS cell -------------------------------------------------

    drawCmos(inst, T, alpha, isLevel) {
      if (!this.visible(T)) return;
      const ctx = this.ctx, nl = this.env.nl, g = inst.gate;
      const a = this.v(nl.gA[g]), b = this.v(nl.gB[g]), out = this.v(nl.gOut[g]);
      const fa = this.flipped(nl.gA[g]), fb = this.flipped(nl.gB[g]), fo = this.flipped(nl.gOut[g]);
      const cell = G.transistor.nandCell(a, b);
      const on = Object.fromEntries(cell.transistors.map(t => [t.name, t.on]));
      ctx.save(); ctx.globalAlpha *= alpha;
      this.rect(T, { x: 0, y: 0, w: FW, h: FH }, '#0a0f1a');
      const lw = Math.max(1, 4 * T.s);
      const wire = (pts, v, f, w = lw) => {
        if (f) this.line(T, pts, C.flipSoft, w * 3.5);
        this.line(T, pts, v === 1 ? C.lit : C.dim, w);
      };
      const top = r => [r.x + r.w * LEAD, r.y], bot = r => [r.x + r.w * LEAD, r.y + r.h], gate = r => [r.x, r.y + r.h / 2];
      const { P1, P2, N1, N2 } = CMOS, yo = CMOS.outY;
      // Rails.
      this.line(T, [[330, CMOS.vdd], [1270, CMOS.vdd]], C.vdd, lw * 1.8);
      this.line(T, [[330, CMOS.gnd], [1270, CMOS.gnd]], C.gnd, lw * 1.8);
      this.text('VDD  (logic 1)', T, 1290, CMOS.vdd, 24, C.vdd, 'left', MONO);
      this.text('GND  (logic 0)', T, 1290, CMOS.gnd, 24, C.gnd, 'left', MONO);
      // Pull-up network: two PMOS in parallel from VDD to the output node.
      wire([[top(P1)[0], CMOS.vdd], top(P1)], 1, false);
      wire([[top(P2)[0], CMOS.vdd], top(P2)], 1, false);
      wire([bot(P1), [bot(P1)[0], yo], [bot(P2)[0], yo], bot(P2)], out, fo);
      // The output node, out to the gate's output pin.
      wire([[bot(P2)[0], yo], [1450, yo], [1450, FH / 2], [FW, FH / 2]], out, fo);
      wire([[top(N1)[0], yo], top(N1)], out, fo);
      // Pull-down network: two NMOS in series from the output node to GND.
      const mid = cell.mid === 1 ? 1 : 0;
      wire([bot(N1), top(N2)], mid, false);
      wire([bot(N2), [bot(N2)[0], CMOS.gnd]], 0, false);
      // Inputs: a drives P1 and N1, b drives P2 and N2.
      wire([[0, FH / 3], [300, FH / 3]], a, fa, lw * 0.9);
      wire([[300, gate(P1)[1]], [300, gate(N1)[1]]], a, fa, lw * 0.9);
      wire([[300, gate(P1)[1]], gate(P1)], a, fa, lw * 0.9);
      wire([[300, gate(N1)[1]], gate(N1)], a, fa, lw * 0.9);
      wire([[0, FH * 2 / 3], [240, FH * 2 / 3]], b, fb, lw * 0.9);
      wire([[240, 110], [240, gate(N2)[1]]], b, fb, lw * 0.9);
      wire([[240, gate(N2)[1]], gate(N2)], b, fb, lw * 0.9);
      wire([[240, 110], [860, 110], [860, gate(P2)[1]], gate(P2)], b, fb, lw * 0.9);
      // Pins and node labels.
      this.text(`a = ${a}`, T, 20, FH / 3 - 32, 28, fa ? C.flip : C.ink, 'left', MONO, '600');
      this.text(`b = ${b}`, T, 20, FH * 2 / 3 - 32, 28, fb ? C.flip : C.ink, 'left', MONO, '600');
      this.text(`out = ${out}`, T, FW - 20, FH / 2 + 36, 28, fo ? C.flip : C.ink, 'right', MONO, '600');
      this.text('output node', T, 1225, yo - 24, 19, C.muted, 'left', SANS);
      this.text(cell.mid === 'Z' ? 'mid (floating)' : `mid = ${cell.mid}`, T, top(N2)[0] + 18, (bot(N1)[1] + top(N2)[1]) / 2, 18, C.muted, 'left', MONO);
      if (isLevel || T.s > 0.3) {
        const lines = out
          ? ['A PMOS is on and the NMOS chain is broken,', 'so the output connects to VDD: out = 1.']
          : ['Both NMOS are on and both PMOS are off,', 'so the output connects to GND: out = 0.'];
        lines.forEach((l, i) => this.text(l, T, 1020, 640 + i * 32, 22, C.muted, 'left', SANS));
        this.text('NAND: out is 0 only when a and b are both 1.', T, 1020, 720, 22, C.ink, 'left', SANS);
      }
      // Transistors.
      for (const name of ['P1', 'P2', 'N1', 'N2']) {
        const r = CMOS[name];
        const chosen = this.sel.path && this.sel.path[this.sel.path.length - 1] === inst && name === this.transistor;
        this.drawTransistorSymbol(T, r, name[0] === 'P', on[name], name, chosen, name[1] === '1' ? a : b, name[1] === '1' ? fa : fb);
        const ia = smooth(380, 800, r.w * T.s);
        if (ia > 0.01) this.drawMosfet(inst, name, this.inner(T, r), ia);
        this.hit(T, r, { kind: 'transistor', inst, name });
      }
      ctx.restore();
    }

    // A MOSFET symbol, vertical: gate from the left, source and drain leads
    // leaving the top and bottom of the box at x = LEAD.
    drawTransistorSymbol(T, r, isP, conducting, name, chosen, gateV, gateFlip) {
      const ctx = this.ctx;
      const X = u => r.x + u * r.w, Y = v => r.y + v * r.h;
      const lw = Math.max(1, 4 * T.s);
      const sd = conducting ? C.lit : C.dim;
      this.rect(T, r, 'rgba(255,255,255,0.025)', chosen ? C.path : C.edge, Math.max(1, (chosen ? 2.5 : 1) * T.s), 14);
      if (chosen) this.rect(T, { x: r.x - 8, y: r.y - 8, w: r.w + 16, h: r.h + 16 }, null, C.pathSoft, Math.max(2, 8 * T.s), 18);
      // Drain/source leads to the channel.
      this.line(T, [[X(LEAD), Y(0)], [X(LEAD), Y(0.28)], [X(0.52), Y(0.28)]], sd, lw);
      this.line(T, [[X(LEAD), Y(1)], [X(LEAD), Y(0.72)], [X(0.52), Y(0.72)]], sd, lw);
      // Channel, then the gate plate beside it.
      this.line(T, [[X(0.52), Y(0.2)], [X(0.52), Y(0.8)]], conducting ? C.lit : C.faint, lw * (conducting ? 2.4 : 1.2));
      this.line(T, [[X(0.45), Y(0.26)], [X(0.45), Y(0.74)]], gateV ? C.lit : C.dim, lw * 1.6);
      const gEnd = isP ? 0.37 : 0.45;
      if (gateFlip) this.line(T, [[X(0), Y(0.5)], [X(gEnd), Y(0.5)]], C.flipSoft, lw * 3.5);
      this.line(T, [[X(0), Y(0.5)], [X(gEnd), Y(0.5)]], gateV ? C.lit : C.dim, lw);
      if (isP) {
        ctx.beginPath(); ctx.arc(T.x + X(0.41) * T.s, T.y + Y(0.5) * T.s, 0.04 * r.w * T.s, 0, Math.PI * 2);
        ctx.strokeStyle = gateV ? C.lit : C.dim; ctx.lineWidth = lw; ctx.stroke();
      }
      this.text(name, T, X(0.78), Y(0.36), 34, chosen ? C.path : C.ink, 'left', SANS, '700');
      this.text(isP ? 'PMOS' : 'NMOS', T, X(0.78), Y(0.56), 19, C.muted, 'left', SANS, '600');
      this.text(conducting ? 'on' : 'off', T, X(0.78), Y(0.74), 20, conducting ? C.lit : C.muted, 'left', MONO, '600');
    }

    // ---- Level: one transistor, in cross-section --------------------------------

    drawMosfet(inst, name, T, alpha) {
      if (!this.visible(T)) return;
      const ctx = this.ctx, nl = this.env.nl, g = inst.gate;
      const isP = name[0] === 'P';
      const gateNet = name[1] === '1' ? nl.gA[g] : nl.gB[g];
      const gv = this.v(gateNet), gf = this.flipped(gateNet);
      const on = isP ? gv === 0 : gv === 1;
      const out = this.v(nl.gOut[g]);
      ctx.save(); ctx.globalAlpha *= alpha;
      // Body silicon: p-type for NMOS, an n-well for PMOS.
      const body = isP ? '#1c2f4d' : '#33203f', well = isP ? '#7d2f45' : '#244d7a';
      this.rect(T, { x: 0, y: 0, w: FW, h: FH }, '#070a11');
      this.rect(T, { x: 0, y: 470, w: FW, h: 530 }, body);
      // Source and drain diffusions.
      const sR = { x: 170, y: 470, w: 380, h: 190 }, dR = { x: 1050, y: 470, w: 380, h: 190 };
      this.rect(T, sR, well, null, 0, 40); this.rect(T, dR, well, null, 0, 40);
      // Gate oxide and polysilicon gate.
      this.rect(T, { x: 520, y: 440, w: 560, h: 30 }, '#c8d4e6');
      this.rect(T, { x: 520, y: 290, w: 560, h: 150 }, gv ? '#6d5a2c' : '#3a4256', gf ? C.flip : C.edgeHi, Math.max(1, 3 * T.s), 6);
      // Metal contacts.
      const contact = (x, label, v) => {
        this.rect(T, { x: x - 50, y: 330, w: 100, h: 140 }, '#8b95a8');
        this.line(T, [[x, 330], [x, 160]], v ? C.lit : C.dim, Math.max(1, 8 * T.s));
        this.text(label, T, x, 120, 30, C.ink, 'center', SANS, '600');
      };
      const cell = G.transistor.nandCell(this.v(nl.gA[g]), this.v(nl.gB[g]));
      const mid = cell.mid === 1 ? 1 : 0, midTxt = cell.mid === 'Z' ? 'floating' : cell.mid;
      const terms = {
        P1: [['source (VDD)', 1], [`drain (out = ${out})`, out]], P2: [['source (VDD)', 1], [`drain (out = ${out})`, out]],
        N1: [[`source (mid = ${midTxt})`, mid], [`drain (out = ${out})`, out]], N2: [['source (GND)', 0], [`drain (mid = ${midTxt})`, mid]],
      }[name];
      contact(360, terms[0][0], terms[0][1]);
      contact(1240, terms[1][0], terms[1][1]);
      this.line(T, [[800, 290], [800, 160]], gv ? C.lit : C.dim, Math.max(1, 8 * T.s));
      this.text(`gate = ${gv}`, T, 800, 120, 30, gf ? C.flip : C.ink, 'center', SANS, '600');
      // The channel: carriers gathered under the oxide when the transistor is on.
      if (on) {
        this.rect(T, { x: 540, y: 472, w: 520, h: 26 }, isP ? 'rgba(255,120,140,0.55)' : 'rgba(110,180,255,0.6)');
        const n = 26, t = this.time / 1000;
        for (let i = 0; i < n; i++) {
          const u = ((i / n) + (gf ? t * 0.25 : 0)) % 1;
          const x = 540 + u * 520, y = 485 + 6 * Math.sin(i * 2.3);
          this.text(isP ? '+' : '−', T, x, y, 22, '#fff', 'center', MONO, '700');
        }
      }
      // Labels.
      this.text(isP ? 'p+' : 'n+', T, sR.x + sR.w / 2, 570, 34, '#fff', 'center', SANS, '700');
      this.text(isP ? 'p+' : 'n+', T, dR.x + dR.w / 2, 570, 34, '#fff', 'center', SANS, '700');
      this.text(isP ? 'n-well' : 'p-type silicon', T, 800, 820, 30, 'rgba(255,255,255,0.65)', 'center', SANS, '600');
      this.text('gate oxide', T, 1100, 455, 18, '#c8d4e6', 'left', SANS);
      this.text('polysilicon gate', T, 800, 365, 24, '#e8edf7', 'center', SANS, '600');
      const why = isP
        ? (on ? 'Gate at 0: holes gather under the oxide and form a p-channel, so the drain connects to VDD.'
          : 'Gate at 1: no channel forms; the transistor is off.')
        : (on ? 'Gate at 1: electrons gather under the oxide and form an n-channel between the n+ regions.'
          : 'Gate at 0: no channel; the n+ regions stay isolated.');
      this.text(`${name}, ${isP ? 'PMOS' : 'NMOS'}: ${on ? 'ON' : 'OFF'}`, T, 800, 40, 34, on ? C.lit : C.ink, 'center', SANS, '700');
      this.text(why, T, 800, 925, 24, C.ink, 'center', SANS);
      this.text('schematic cross-section, not to scale', T, 800, 968, 17, C.muted, 'center', SANS);
      ctx.restore();
    }
  }

  G.scene = { Scene, CMOS, COLORS: C, hex4, bin16, commas };
})(globalThis.G2G || (globalThis.G2G = {}));
