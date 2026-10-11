// level.js: "Heliotrope", the one level, written beat by beat against the song.
// Every position is a beat of the music (see builder.js): spikes(24.5) is a
// spike the player passes over half a beat after pressing on beat 24.
'use strict';
(function (L) {
  function build() {
    const b = L.LevelBuilder();
    const { lv, at } = b;
    const CEIL = 9;

    // ── 1. DAWN (bars 0-7): run, jump, read the beat ───────────────────────
    b.section(0, 'Dawn', 'dawn');
    b.spikes(8.5);
    b.spikes(10.5);
    b.spikes(12.5); b.spikes(13.5);          // hold through both
    b.blockB(15.6, 18, 0, 1);
    b.spikes(17.5, 1, { y: 1 });
    // A ceiling of hanging spikes: the first moment not to jump.
    b.blockB(19.2, 21.3, 2.45, 2.95, 'slab');
    b.spikes(20.25, 4, { y: 2.45, down: true });
    b.spikes(21.75);
    // Syncopation: the second jump is on the "and", so holding fails.
    b.spikes(23.5);
    b.spikes(25.0);
    b.spikes(26.5, 2);
    b.spikes(28.0);
    b.pad(29);
    b.blockB(29.7, 32, 2.5, 3, 'slab');
    b.spikes(31, 1, { y: 3 });

    // ── 2. PULSE (bars 8-15): orbs, pads, platforms ───────────────────────
    b.section(32, 'Pulse', 'pulse');
    b.orb(34.5, 2.7);                       // free orb: try it, nothing to lose
    b.orb(36.5, 2.7);
    b.spikes(37.1, 3);
    b.orb(40.5, 2.7); b.orb(41.5, 2.55);
    b.spikes(41.3, 7);
    b.blockB(44.6, 45.5, 1.5, 2, 'slab');
    b.spikes(45.25, 4);
    b.blockB(46.4, 47.4, 1.5, 2, 'slab');
    b.spikes(47.6, 3);
    b.blockB(48.4, 50, 0, 1);
    b.spikes(49.5, 1, { y: 1 });
    b.blockB(50, 52, 0, 2);
    b.spikes(51.5, 1, { y: 2 });
    b.pad(52.4, { y: 0 });
    b.spikes(53.3, 4);
    b.blockB(54, 56, 2.5, 3, 'slab');
    b.spikes(55.5, 1, { y: 3 });
    b.spikes(57.5, 2);
    b.spikes(58.5); b.spikes(59.5); b.spikes(60.5, 3);
    b.blockB(61.6, 64, 0, 1);

    // ── 3. ASCENT (bars 16-23): the ship, then the wave ───────────────────
    b.section(64, 'Ascent', 'ascent');
    b.mode(64, 'ship', { ceil: CEIL });
    // Four open bars to feel the ship, then walls to steer around.
    b.blockB(68, 68.5, 0, 3.2);
    b.blockB(70, 70.5, 5.6, CEIL);
    b.blockB(71.5, 72, 0, 4);
    // A tunnel that follows the melody's contour.
    const shipPath = [4.5, 5, 6, 6.5, 5.5, 4, 3, 3, 4, 5.5];
    shipPath.forEach((c, i) => {
      const bb = 73 + i * 0.6;
      b.blockB(bb, bb + 0.6, 0, c - 2.1, 'pillar');
      b.blockB(bb, bb + 0.6, c + 2.1, CEIL, 'pillar');
    });
    b.mode(80, 'wave', { ceil: CEIL });
    // Wave: hold to climb, release to dive. One beat per stroke.
    {
      const pts = [[80, 4.5, 4.4], [81.5, 4.5], [83.5, 4.5], [84, 7], [85, 2], [86, 7], [87, 2], [88, 7], [88.5, 4.5],
        [89, 7], [89.5, 4.5], [90, 7], [91, 2], [91.5, 4.5], [92, 2], [93, 7], [94, 2], [94.5, 4.5], [96, 4.5]];
      channel(b, pts, 2.0, 0, CEIL);
    }

    // ── 4. INVERSION (bars 24-31): gravity, then the build ────────────────
    b.section(96, 'Inversion', 'inversion');
    b.mode(96, 'cube', { ceil: CEIL });
    b.gravity(98.5, -1);
    b.spikes(100.5, 1, { y: CEIL, down: true });
    b.spikes(102.5, 2, { y: CEIL, down: true });
    b.gravity(104, 1);
    b.spikes(105.5);
    b.orb(106.5, 2.7, 'gravorb');
    b.spikes(107.6, 6);
    b.spikes(109.5, 1, { y: CEIL, down: true });
    b.orb(110.5, CEIL - 2.7, 'gravorb');
    b.spikes(111.6, 6, { y: CEIL, down: true });
    // The build: gravity pads on the beat, floor and ceiling.
    b.pad(113, { kind: 'gravpad' });
    b.spikes(113.8, 4);
    b.pad(114.5, { kind: 'gravpad', y: CEIL, down: true });
    b.spikes(115.3, 4, { y: CEIL, down: true });
    b.pad(116, { kind: 'gravpad' });
    b.spikes(116.8, 4);
    b.spikes(118.5, 1, { y: CEIL, down: true });
    b.gravity(119.5, 1);
    // Eighth notes: blue orbs zig-zag through a field of spikes.
    for (let i = 0; i < 6; i++) b.orb(121 + i * 0.5, i % 2 ? 6 : 3, 'gravorb');
    b.spikes(122.5, 15);
    b.spikes(122.5, 15, { y: CEIL, down: true });
    b.gravity(124.5, 1);
    b.pad(127);

    // ── 5. SUPERNOVA (bars 32-47): the drop ───────────────────────────────
    b.section(128, 'Supernova', 'supernova', { drop: true });
    b.speed(128, 'fast');
    b.mode(128, 'wave', { ceil: CEIL });
    {
      const pts = [[128, 4.5, 4.4], [129.25, 4.5]];
      for (let k = 0; k < 21; k++) pts.push([129.5 + k * 0.5, k % 2 ? 3 : 6]);
      pts.push([140.25, 4.5], [141, 4.5], [141.5, 7.5], [142.5, 1.5], [143, 4.5], [144, 4.5]);
      channel(b, pts, 1.6, 0, CEIL);
    }
    b.mode(144, 'ship', { ceil: CEIL });
    b.gravity(146, -1);
    b.blockB(147, 147.5, 0, 4);
    b.blockB(148.5, 149, 5, CEIL);
    b.gravity(150, 1);
    b.blockB(151, 151.5, 0, 5);
    b.blockB(152.5, 153, 4, CEIL);
    const dropShip = [5, 6, 7, 6, 4, 3, 2.8, 4, 5.5, 6.5, 5, 4];
    dropShip.forEach((c, i) => {
      const bb = 154 + i * 0.5;
      b.blockB(bb, bb + 0.5, 0, c - 1.9, 'pillar');
      b.blockB(bb, bb + 0.5, c + 1.9, CEIL, 'pillar');
    });
    b.mode(160, 'cube', { ceil: CEIL });
    b.spikes(161.5, 3);
    b.orb(163.5, 2.7);
    b.spikes(164.1, 5);
    b.orb(165.5, 2.7, 'gravorb');
    b.spikes(166.5, 8);
    b.spikes(167.5, 1, { y: CEIL, down: true });
    b.orb(168.5, CEIL - 2.7, 'gravorb');
    b.spikes(169.5, 8, { y: CEIL, down: true });
    b.spikes(170.5, 3);
    b.blockB(172, 173, 0, 1);
    b.blockB(173, 174, 0, 2);
    b.spikes(174.5, 3);
    b.pad(175.5);
    b.blockB(175.9, 178, 3.5, 4, 'slab');
    b.spikes(176.5, 6);
    b.mode(179, 'ship', { ceil: CEIL });
    [3, 6, 3, 6, 4, 5].forEach((c, i) => {
      const bb = 181 + i * 1.5;
      b.blockB(bb, bb + 0.5, 0, c - 2, 'pillar');
      b.blockB(bb, bb + 0.5, c + 2, CEIL, 'pillar');
    });
    b.mode(190, 'cube', { ceil: Infinity });

    // ── 6. ECHO (bars 48-51): breathe ─────────────────────────────────────
    b.section(192, 'Echo', 'echo');
    b.speed(192, 'slow');
    b.spikes(195.5);
    b.spikes(199.5);
    b.spikes(203.5, 2);

    // ── 7. ASCENSION (bars 52-59): everything, a step higher ──────────────
    b.section(208, 'Ascension', 'ascension');
    b.speed(208, 'fast');
    b.spikes(209.5); b.spikes(210.5); b.spikes(211.5, 2);
    b.orb(212.5, 2.7);
    b.spikes(213.1, 4);
    b.mode(214, 'ship', { ceil: CEIL });
    [5, 3, 6, 4].forEach((c, i) => {
      const bb = 215 + i;
      b.blockB(bb, bb + 0.5, 0, c - 2.1, 'pillar');
      b.blockB(bb, bb + 0.5, c + 2.1, CEIL, 'pillar');
    });
    b.mode(220, 'wave', { ceil: CEIL });
    channel(b, [[220, 4.5, 4.4], [221, 4.5], [221.5, 7.5], [222, 4.5], [222.5, 7.5], [223.5, 1.5], [224, 4.5],
      [224.5, 1.5], [225.5, 7.5], [226, 4.5], [227, 4.5], [227.5, 7.5], [228.5, 1.5], [229, 4.5], [231, 4.5]], 1.8, 0, CEIL);
    b.mode(231, 'cube', { ceil: CEIL });
    b.gravity(232, -1);
    b.spikes(233.5, 2, { y: CEIL, down: true });
    b.orb(234.5, CEIL - 2.7, 'gravorb');
    b.spikes(235.5, 6, { y: CEIL, down: true });
    b.spikes(236.5, 2);
    b.pad(238);
    b.section(240, 'Afterglow', 'afterglow', { finale: true });
    b.bounds(239, { ceil: Infinity });
    b.finish(244);
    return lv;
  }

  // A wave corridor: deadly walls above and below a centre line through
  // pts ([beat, y]), leaving a gap of 2 * half blocks.
  function channel(b, pts, half, floor, ceil) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [b0, c0, h0 = half] = pts[i], [b1, c1, h1 = half] = pts[i + 1];
      const x0 = b.at(b0), x1 = b.at(b1);
      if (Math.min(c0 - h0, c1 - h1) > floor + 0.05) b.wall([[x0, floor], [x1, floor], [x1, c1 - h1], [x0, c0 - h0]]);
      if (Math.max(c0 + h0, c1 + h1) < ceil - 0.05) b.wall([[x0, c0 + h0], [x1, c1 + h1], [x1, ceil], [x0, ceil]]);
    }
  }

  L.buildLevel = function () { return L.compile(build()); };
})(globalThis.LUMINAL = globalThis.LUMINAL || {});
