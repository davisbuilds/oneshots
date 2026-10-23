// icons.js: every icon is a few strokes of path data written here (24 x 24
// grid, 1.6 px round strokes), and the logo is painted on a canvas.
'use strict';
(function (TL) {
  const P = {
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20',
    bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
    home: 'M4 11 12 4l8 7M6.5 9.5V20h11V9.5M10 20v-5h4v5',
    ship: 'M3 15h18l-2.5 4.5h-13zM5.5 15V11h13v4M8 11V8h5v3M10.5 8V5.5M4.5 21.5c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1',
    yard: 'M3.5 6h7v4.5h-7zM13.5 6h7v4.5h-7zM3.5 13.5h7V18h-7zM13.5 13.5h7V18h-7z',
    crane: 'M6 21V7M10 21V7M4 7h16M6 4l6 3M18 7v6M16.5 13h3v2.5h-3zM6 12l4 3M10 12l-4 3M4 21h8',
    straddle: 'M5 20V6h14v14M5 9h14M8 20v-6h8v6M3.5 20h4M16.5 20h4',
    gate: 'M4 20V6M4 9h16M8 9v4M12 9v4M16 9v4M20 6v14M2.5 20h3M18.5 20h3',
    calendar: 'M4.5 6h15v14h-15zM4.5 10h15M8.5 4v4M15.5 4v4M8 13.5h2M11 13.5h2M14 13.5h2M8 16.5h2M11 16.5h2',
    chart: 'M4 20h16M7 17v-5M11 17V8M15 17v-7M19 17V5',
    play: 'M8 5.5v13l10-6.5z',
    pause: 'M8 5.5v13M16 5.5v13',
    ff: 'M5 6v12l7-6zM12 6v12l7-6z',
    chev: 'M9.5 6l6 6-6 6',
    chevL: 'M14.5 6l-6 6 6 6',
    pin: 'M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    box: 'M3.5 7.5h17v10h-17zM7 7.5v10M10.5 7.5v10M14 7.5v10M17.5 7.5v10',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    alert: 'M12 4 2.8 19.5h18.4zM12 10v4.5M12 17v.4',
    info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5M12 7.8v.4',
    film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
    layers: 'M12 4 3 9l9 5 9-5zM3 13.5l9 5 9-5',
    x: 'M6 6l12 12M18 6 6 18',
    anchor: 'M12 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 7.5V20M7 11h10M4.5 14c0 3.5 3.4 6 7.5 6s7.5-2.5 7.5-6',
    gauge: 'M4 16a8 8 0 0 1 16 0M12 16l4-5M3 19h18',
    help: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.8v.4',
    drag: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  };
  TL.icon = function (name, cls) {
    return `<svg class="i ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[name] || P.info}"/></svg>`;
  };
  // Replace <span data-icon="x"> placeholders.
  TL.iconize = function (root) {
    for (const el of (root || document).querySelectorAll('[data-icon]')) { el.outerHTML = TL.icon(el.dataset.icon); }
  };
  // The logo: a crest of three cut-paper waves under a crane's boom.
  TL.drawLogo = function (cv) {
    const g = cv.getContext('2d'), s = cv.width / 34;
    g.clearRect(0, 0, cv.width, cv.height);
    g.save(); g.scale(s, s);
    const wave = (y, col) => {
      g.beginPath(); g.moveTo(3, y + 2);
      for (let x = 3; x <= 31; x += 1) g.lineTo(x, y + Math.sin((x - 3) / 28 * Math.PI * 2) * 1.6);
      g.lineTo(31, 31); g.lineTo(3, 31); g.closePath(); g.fillStyle = col; g.fill();
    };
    g.save(); g.beginPath(); g.arc(17, 17, 15, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#f2dcc9'; g.fillRect(0, 0, 34, 34);
    wave(20, '#4b8f98'); wave(23.5, '#2f5e78'); wave(27, '#28304a');
    g.restore();
    g.strokeStyle = '#c65a3e'; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(11, 19); g.lineTo(11, 7); g.lineTo(27, 7); g.moveTo(11, 11); g.lineTo(16, 7); g.moveTo(22, 7); g.lineTo(22, 13); g.stroke();
    g.fillStyle = '#e2a93f'; g.fillRect(19.5, 13, 5, 3);
    g.restore();
  };
})(globalThis.TL = globalThis.TL || {});
