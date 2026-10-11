// builder.js: a small vocabulary for writing a level in beats.
// at(b) is where the player is at beat b, so an obstacle placed "at beat b"
// is reached exactly on that beat of the music, whatever the speed changes.
'use strict';
(function (L) {
  const BEAT = L.BEAT;

  // Hitbox sizes. Hazards are deliberately smaller than they look: a death
  // always means the player's box really overlapped the drawn shape.
  const SPIKE = { w: 1, h: 0.9, hitW: 0.3, hitH: 0.5 };
  const SMALL = { w: 1, h: 0.45, hitW: 0.3, hitH: 0.24 };
  L.HITBOX = { SPIKE, SMALL, orbR: 0.62, sawFactor: 0.72 };

  L.LevelBuilder = function () {
    const lv = {
      speedSegs: [{ t: 0, x: 0, v: L.SPEEDS.normal, name: 'normal' }],
      solids: [], hazards: [], triggers: [], portals: [], sections: [], decor: [], walls: [],
      spikes: [], marks: [],
    };
    const b = { lv };

    b.t = beat => beat * BEAT;
    b.at = beat => L.xAt(lv, beat * BEAT);

    b.speed = function (beat, name) {
      const t = beat * BEAT, x = b.at(beat);
      lv.speedSegs.push({ t, x, v: L.SPEEDS[name], name });
      lv.portals.push({ kind: 'speed', x, speed: name, beat });
    };

    b.section = function (beat, name, theme, extra) {
      lv.sections.push(Object.assign({ beat, t: beat * BEAT, x: b.at(beat), name, theme }, extra || {}));
    };

    // A row of n spikes on a surface at height y, centred at beat (or at x
    // when opts.x is given). down: hanging from a ceiling at y.
    b.spikes = function (beat, n = 1, opts = {}) {
      const kind = opts.small ? SMALL : SPIKE;
      const dir = opts.down ? -1 : 1;
      const y = opts.y || 0;
      const step = kind.w + (opts.gap || 0);
      const cx0 = (opts.x !== undefined ? opts.x : b.at(beat)) - (n - 1) * step / 2 + (opts.dx || 0);
      for (let i = 0; i < n; i++) {
        const cx = cx0 + i * step;
        const s = { cx, by: y, dir, w: kind.w, h: kind.h, small: !!opts.small };
        lv.spikes.push(s);
        const y0 = dir > 0 ? y : y - kind.hitH, y1 = dir > 0 ? y + kind.hitH : y;
        lv.hazards.push({ type: 'spike', x0: cx - kind.hitW / 2, x1: cx + kind.hitW / 2, y0, y1, vis: s });
      }
      return cx0;
    };
    b.spikesX = (x, n, opts = {}) => b.spikes(0, n, Object.assign({}, opts, { x }));

    // Solid blocks, in blocks (x0..x1, y0..y1).
    b.block = function (x0, x1, y0, y1, style) {
      const o = { x0, x1, y0, y1, style: style || 'block' };
      lv.solids.push(o);
      return o;
    };
    // A block whose left edge is reached at beat b0 and right edge at b1.
    b.blockB = (b0, b1, y0, y1, style) => b.block(b.at(b0), b.at(b1), y0, y1, style);

    b.pad = function (beat, opts = {}) {
      const x = opts.x !== undefined ? opts.x : b.at(beat);
      const y = opts.y || 0, down = !!opts.down;
      const o = { pad: true, kind: opts.kind || 'pad', x0: x - 0.45, x1: x + 0.45,
        y0: down ? y - 0.35 : y, y1: down ? y : y + 0.35, down, cx: x, cy: y };
      lv.triggers.push(o);
      return o;
    };

    b.orb = function (beat, y, kind, opts = {}) {
      const x = opts.x !== undefined ? opts.x : b.at(beat);
      const r = L.HITBOX.orbR;
      const o = { orb: true, kind: kind || 'orb', cx: x, cy: y, r, x0: x - r, x1: x + r, y0: y - r, y1: y + r };
      lv.triggers.push(o);
      return o;
    };

    b.saw = function (beat, y, radius, opts = {}) {
      const x = opts.x !== undefined ? opts.x : b.at(beat);
      const r = radius * L.HITBOX.sawFactor;
      lv.hazards.push({ type: 'saw', cx: x, cy: y, r, vr: radius, x0: x - r, x1: x + r, y0: y - r, y1: y + r, spin: opts.spin || 1 });
    };

    b.mode = function (beat, mode, opts = {}) {
      lv.portals.push(Object.assign({ kind: 'mode', mode, x: b.at(beat), beat }, opts));
    };
    b.gravity = function (beat, grav, opts = {}) {
      lv.portals.push(Object.assign({ kind: 'gravity', grav, x: b.at(beat), beat }, opts));
    };
    // A gate that only moves the ceiling (or floor).
    b.bounds = function (beat, opts) {
      lv.portals.push(Object.assign({ kind: 'bounds', x: b.at(beat), beat, hidden: true }, opts));
    };

    // A deadly wall drawn as a polygon (wave sections). Its hitbox is a
    // column-by-column staircase inset inside the drawn shape, so touching
    // the glow is safe and only touching the wall itself kills.
    b.wall = function (pts, opts = {}) {
      const inset = opts.inset === undefined ? 0.08 : opts.inset;
      const col = 0.25;
      lv.walls.push({ pts, style: opts.style || 'wall' });
      const xs = pts.map(p => p[0]);
      const xmin = Math.min(...xs), xmax = Math.max(...xs);
      const span = x => {
        // Vertical extent of the polygon at x (convex polygons only).
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < pts.length; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
          if ((x < ax && x < bx) || (x > ax && x > bx) || ax === bx) continue;
          const y = ay + (by - ay) * (x - ax) / (bx - ax);
          lo = Math.min(lo, y); hi = Math.max(hi, y);
        }
        return [lo, hi];
      };
      for (let x = xmin + inset; x < xmax - inset - 1e-9; x += col) {
        const x0 = x, x1 = Math.min(x + col, xmax - inset);
        const a = span(Math.max(x0, xmin + 1e-6)), c = span(Math.min(x1, xmax - 1e-6));
        const y0 = Math.max(a[0], c[0]) + inset, y1 = Math.min(a[1], c[1]) - inset;
        if (y1 > y0) lv.hazards.push({ type: 'wall', x0, x1, y0, y1, hidden: true });
      }
    };

    // A sign in the world, shown to players who have not cleared the level.
    b.mark = (beat, y, label) => lv.marks.push({ beat, x: b.at(beat), y, label });

    b.finish = function (beat) {
      lv.endBeat = beat;
      lv.endT = beat * BEAT;
      lv.endX = b.at(beat);
    };

    return b;
  };
})(globalThis.LUMINAL = globalThis.LUMINAL || {});
