(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const SPRITE_WIDTH = 252;
  const SPRITE_HEIGHT = 176;
  const CACHE_LIMIT = 96;
  const subjects = new WeakMap();
  const sprites = new Map();
  const portraits = new WeakMap();

  function rng(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let word = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      word ^= word + Math.imul(word ^ (word >>> 7), 61 | word);
      return ((word ^ (word >>> 14)) >>> 0) / 4294967296;
    };
  }

  const mix = (a, b, t) => a + (b - a) * t;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const wrap = (x, period) => x - Math.floor(x / period) * period;
  const shortest = (x, period) => x - Math.round(x / period) * period;
  const blend = (a, b, t) => a.map((n, i) => Math.round(mix(n, b[i], t)));
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  const pearl = [241, 240, 207];

  function surface(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function viewport(canvas) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelsWide = Math.round(width * ratio);
    const pixelsHigh = Math.round(height * ratio);
    if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
    if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, width, height };
  }

  function ellipse(ctx, x, y, rx, ry, turn = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, turn, 0, TAU);
  }

  function curve(ctx, color, width, x, y, x1, y1, x2, y2, x3, y3) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function bodyPoint(m, a, inset = 1) {
    const x = Math.cos(a);
    const y = Math.sin(a);
    const front = (x + 1) / 2;
    const folds = Math.sin(a * 11 + m.phase) * (.016 + m.armor * .018) +
      Math.sin(a * 23) * .008 + Math.sin(a * 5 + m.phase) * m.bell * .044;
    const taper = .47 + .53 * front;
    const wedge = .82 + .32 * front + .25 * front ** 2;
    const swell = mix(mix(.95, taper, m.tail * m.aspect * 1.16), wedge, m.jaw * .77);
    const domed = y < 0 ? 1 + m.bell * .31 : 1 - m.bell * .47;
    const waist = 1 - m.bell * .22 * Math.exp(-((x + .53) ** 2) * 17);
    const spine = -6 * x * x + 7 * x * (.8 - m.aspect) - m.bell * 7 * Math.sin((x + 1) * Math.PI);
    return [
      x * m.halfLength * (1 + folds) * inset,
      (y * m.halfHeight * swell * domed * waist * (1 + folds * 2) + spine) * inset
    ];
  }

  function morphology(o) {
    const known = subjects.get(o);
    if (known && known.genome === o.genome) return known;
    const g = o.traits || Cambrian.traits(o.genome);
    const aspect = clamp((g.aspect - .65) / 1.4, 0, 1);
    const phase = (aspect * .46 + g.spines * .29 + g.fins * .17 + g.vision * .08) * TAU;
    const hue = g.jaw * .5 + g.gut * .28 + g.spines * .13 + g.armor * .09;
    const cool = blend([31, 171, 135], [100, 175, 217], g.fins * .72);
    const warm = blend([228, 174, 77], [231, 97, 91], g.jaw * .8);
    const pigment = blend(cool, warm, clamp((hue - .24) / .57, 0, 1));
    const light = blend(pigment, pearl, .69);
    const shade = blend(pigment, [6, 20, 27], .78);
    const accent = blend(pigment, hue > .53 ? [255, 186, 81] : [119, 229, 199], .43);
    const m = {
      genome: o.genome, phase, aspect,
      bell: (1 - aspect) * (1 - g.armor) * (1 - g.jaw),
      halfLength: 48 + 23 * aspect,
      halfHeight: 21 + 20 * (1 - aspect) + 10 * g.armor + 6 * g.fins - 9 * g.tail,
      fins: g.fins, tail: g.tail, armor: g.armor, spines: g.spines,
      jaw: g.jaw, gut: g.gut, vision: g.vision, throttle: g.throttle,
      pigment, light, shade, accent,
      spriteKey: [aspect, g.tail, g.fins, g.armor, g.jaw, g.spines, g.gut, g.vision]
        .map((n) => Math.round(n * 36)).join(",")
    };
    subjects.set(o, m);
    return m;
  }

  function outline(m, inset) {
    const path = new Path2D();
    for (let step = 0; step <= 100; step++) {
      const [x, y] = bodyPoint(m, step / 100 * TAU, inset);
      if (step === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    return path;
  }

  function frills(ctx, m, random) {
    // Veined swimming lobes, one under each side of the mantle.
    for (const side of [-1, 1]) {
      const fin = new Path2D();
      const leading = m.halfLength * mix(.22, .62, m.fins);
      const trailing = -m.halfLength * mix(.62, 1.23, m.tail);
      const drop = m.halfHeight * (.41 + .4 * m.fins) + 30 * m.fins;
      const tip = Math.max(-88, trailing - (5 + 11 * m.fins));
      fin.moveTo(leading, side * m.halfHeight * .55);
      fin.bezierCurveTo(leading * .88, side * (drop + 3), 3, side * (drop + 9), -18, side * (drop + 8));
      fin.bezierCurveTo(-38, side * (drop + 15 + m.bell * 9), tip - 2, side * (drop + 5), tip, side * (drop - 2));
      fin.bezierCurveTo(trailing + 18, side * (drop - 13), trailing + 4, side * 13, trailing + 16, side * 3);
      fin.closePath();
      const film = ctx.createLinearGradient(0, 0, 0, side * (drop + 4));
      film.addColorStop(0, rgba(m.shade, .05));
      film.addColorStop(.65, rgba(m.pigment, .27 + m.fins * .21));
      film.addColorStop(1, rgba(m.light, .44 + m.fins * .13));
      ctx.fillStyle = film;
      ctx.fill(fin);
      ctx.strokeStyle = rgba(m.light, .24);
      ctx.lineWidth = .75;
      ctx.stroke(fin);
      ctx.save();
      ctx.clip(fin);
      const veins = Math.round(13 + 11 * m.fins);
      for (let i = 0; i < veins; i++) {
        const t = i / (veins - 1);
        const start = mix(leading, trailing + 8, t);
        const tipX = mix(leading * .83, tip - 7, t) + Math.sin(i + m.phase) * 1.8;
        const tipY = side * (drop + 10 + Math.sin(t * 4) * 6);
        curve(ctx, rgba(i % 3 === 0 ? m.light : m.accent, .17 + random() * .28),
          .6 + random() * .5, start, -side * 3, start + 5, side * 21, tipX + 4, tipY - 5 * side, tipX, tipY);
        curve(ctx, rgba(m.shade, .34), 1.25,
          start - 1, -side, start + 3.5, side * 22, tipX + 2.5, tipY - 5 * side, tipX - 1.5, tipY);
      }
      ctx.restore();
    }
  }

  function cilia(ctx, m, random) {
    const hairs = 50 + Math.round(m.fins * 40);
    for (let i = 0; i < hairs; i++) {
      const a = (i + random() * .8) / hairs * TAU;
      const [x, y] = bodyPoint(m, a, .96);
      const barb = i % 4 === 0;
      const reach = (3.5 + 18 * m.spines * (barb ? 1.1 : .32)) * (.5 + random());
      const dx = Math.cos(a) * reach * .45 - reach * .45;
      const dy = Math.sin(a) * reach;
      curve(ctx, rgba(barb ? m.light : m.accent, (barb ? .33 : .22) + random() * .29),
        barb ? .82 : .48, x, y, x + dx * .06, y + dy * .55, x + dx * .57,
        y + dy * 1.07, x + dx, y + dy * .91);
      if (barb && m.spines > .56) {
        curve(ctx, rgba(m.pigment, .39), .51, x + dx * .48, y + dy * .8,
          x + dx * .7, y + dy * .91, x + dx * 1.01, y + dy * .67, x + dx * 1.17, y + dy * .62);
      }
    }
  }

  function shellBands(ctx, m) {
    const bands = 3 + Math.round(m.armor * 10 + m.aspect * 3);
    for (let i = 0; i < bands; i++) {
      const t = (i + .5) / bands;
      const x = mix(-m.halfLength * .91, m.halfLength * .74, t) + Math.sin(i * .83 + m.phase) * 2.25;
      const y = m.halfHeight * Math.sqrt(Math.max(0, 1 - (x / m.halfLength) ** 2));
      const bow = 4 + 18 * m.armor + Math.sin(i + m.phase) * 3;
      const rib = new Path2D();
      rib.moveTo(x + 4, -m.halfHeight * 1.23);
      rib.bezierCurveTo(x - bow, -y * .59, x + bow * .25, y * .46, x - 5, m.halfHeight * 1.2);
      ctx.strokeStyle = rgba(m.shade, .13 + m.armor * .48);
      ctx.lineWidth = 2.6 + m.armor * 4;
      ctx.stroke(rib);
      const reflect = ctx.createLinearGradient(x, -y, x, y * 1.15);
      reflect.addColorStop(0, rgba(m.light, .35 + .42 * m.armor));
      reflect.addColorStop(.48, rgba(m.accent, .065 + .24 * m.armor));
      reflect.addColorStop(.69, rgba(m.accent, .02));
      reflect.addColorStop(1, rgba(m.light, .17 + .24 * m.armor));
      ctx.strokeStyle = reflect;
      ctx.lineWidth = .9 + 2 * m.armor;
      ctx.stroke(rib);
    }
  }

  function vesicle(ctx, x, y, radius, long, color, m, alpha) {
    const lens = ctx.createRadialGradient(x - radius * .38, y - radius * .38, radius * .04, x, y, radius);
    lens.addColorStop(0, rgba(m.light, alpha * .95));
    lens.addColorStop(.23, rgba(color, alpha * .85));
    lens.addColorStop(.57, rgba(color, alpha * .36));
    lens.addColorStop(.85, rgba(m.shade, alpha * .58));
    lens.addColorStop(1, rgba(color, alpha * .61));
    ellipse(ctx, x, y, radius, radius * long, -.28);
    ctx.fillStyle = lens;
    ctx.fill();
    ctx.strokeStyle = rgba(m.light, alpha * .36);
    ctx.lineWidth = .56;
    ctx.stroke();
  }

  function guts(ctx, m, random) {
    const nutrient = blend([177, 227, 140], [249, 181, 84], m.gut);
    const gut = blend(m.pigment, blend(nutrient, [255, 113, 82], m.jaw ** 2), .54);
    const width = m.halfLength;
    const gutWidth = 3 + m.gut * 8;
    const gutY = 5 + m.gut * 3;
    curve(ctx, rgba(m.shade, .43), gutWidth * 2.15, -width * .74, 2, -width * .27, -18, width * .24,
      gutY + 21, width * .72, -4);
    curve(ctx, rgba(gut, .41), gutWidth * 1.05, -width * .74, 2, -width * .27, -18, width * .24,
      gutY + 21, width * .72, -4);
    curve(ctx, rgba(m.light, .48), .8, -width * .75, .2, -width * .27, -20, width * .24,
      gutY + 19, width * .73, -5.4);

    // Graduated inclusions collect around the digestive tract and just inside the wall.
    for (let i = 0; i < 35 + m.gut * 19; i++) {
      const x = (random() * 1.76 - .88) * width;
      const y = Math.sin(x / width * 2.9 + m.phase) * m.halfHeight * .17 + (random() - .5) * m.halfHeight * 1.31;
      const radius = .7 + Math.pow(random(), 2.8) * (4 + m.gut * 5);
      vesicle(ctx, x, y, radius, .66 + random() * .42, gut, m, .36 + random() * .39);
    }
    for (let i = 0; i < 94; i++) {
      const [x, y] = bodyPoint(m, i / 94 * TAU + random() * .04, .73 + random() * .24);
      ctx.fillStyle = rgba(i % 6 === 0 ? m.light : m.pigment, .14 + random() * .38);
      const radius = .32 + random() * .85;
      ellipse(ctx, x, y, radius * 1.6, radius, random());
      ctx.fill();
    }
    for (let i = 0; i < 285; i++) {
      const x = (random() * 2 - 1) * width;
      const y = (random() * 2 - 1) * m.halfHeight;
      const radius = .12 + random() ** 3 * 1.12;
      ctx.fillStyle = rgba(i % 3 === 0 ? m.shade : m.light, .11 + random() * .20);
      ctx.fillRect(x, y, radius * 1.72, radius);
    }

    const senses = 2 + Math.round(m.vision * 5);
    for (let i = 0; i < senses; i++) {
      const t = i / (senses - 1);
      const x = width * (.86 - .27 * Math.abs(t - .46));
      const y = (t - .65) * m.halfHeight * .84;
      vesicle(ctx, x, y, 1.8 + 2.9 * m.vision, .7, m.accent, m, .9);
    }
  }

  function mantle(ctx, m, random) {
    const body = outline(m, 1);
    const volume = ctx.createLinearGradient(-m.halfLength * .3, -m.halfHeight, m.halfLength * .25, m.halfHeight);
    volume.addColorStop(0, rgba(m.light, .91));
    volume.addColorStop(.17, rgba(m.pigment, .67 + m.armor * .22));
    volume.addColorStop(.43, rgba(m.pigment, .23 + m.armor * .36));
    volume.addColorStop(.57, rgba(m.shade, .60 + m.armor * .25));
    volume.addColorStop(.81, rgba(m.pigment, .47 + m.armor * .24));
    volume.addColorStop(1, rgba(m.accent, .77));
    ctx.fillStyle = volume;
    ctx.fill(body);

    ctx.save();
    ctx.clip(body);
    const inner = ctx.createRadialGradient(m.halfLength * .08, -m.halfHeight * .52, 1, 0, 0, m.halfLength * .79);
    inner.addColorStop(0, rgba(m.light, .39 + m.armor * .2));
    inner.addColorStop(.48, rgba(m.pigment, .2));
    inner.addColorStop(1, rgba(m.shade, .01));
    ctx.fillStyle = inner;
    ctx.fillRect(-m.halfLength, -m.halfHeight * 1.1, m.halfLength * 2, m.halfHeight * 2.2);
    ctx.strokeStyle = rgba(m.accent, .12 + m.armor * .23);
    ctx.lineWidth = 6;
    ctx.stroke(outline(m, .92));

    shellBands(ctx, m);
    guts(ctx, m, random);

    // Broad grazing reflection follows the uneven dorsal membrane.
    const glare = new Path2D();
    for (let i = 0; i < 35; i++) {
      const [x, y] = bodyPoint(m, Math.PI * (1.075 + i / 34 * .80), .89 + .02 * Math.sin(i * .5));
      if (i === 0) glare.moveTo(x, y);
      else glare.lineTo(x, y);
    }
    const glints = ctx.createLinearGradient(-m.halfLength, 0, m.halfLength, 0);
    glints.addColorStop(0, rgba(m.light, 0));
    glints.addColorStop(.37, rgba(m.light, .17));
    glints.addColorStop(.61, rgba(m.light, .78));
    glints.addColorStop(1, rgba(m.light, .08));
    ctx.lineWidth = 1.8 + m.armor * 1.65;
    ctx.strokeStyle = glints;
    ctx.stroke(glare);
    ctx.restore();

    ctx.lineWidth = 1.06 + m.armor * 1.28;
    ctx.strokeStyle = rgba(m.light, .48 + m.armor * .37);
    ctx.stroke(body);
    ctx.lineWidth = .7;
    ctx.strokeStyle = rgba(m.light, .29);
    ctx.stroke(outline(m, .95));
  }

  function mouth(ctx, m) {
    const front = m.halfLength * .83;
    const reach = Math.min(107, front + 5 + 39 * m.jaw ** 1.68);
    for (const side of [-1, 1]) {
      const y = side * (2 + m.jaw * 13);
      curve(ctx, rgba(m.accent, .55 + m.jaw * .34), 1.4 + m.jaw * 2.5, front - 3, y,
        reach - 31, y * 2.1, reach - 1, y * 1.45, reach, y * .57);
      curve(ctx, rgba(m.light, .65 + m.jaw * .2), .8, front - 3, y - 1.15,
        reach - 31, y * 2.1 - 1.15, reach - 1, y * 1.45 - 1.15, reach, y * .57 - 1.15);
      const teeth = Math.round(2 + m.jaw * 7);
      for (let i = 0; i < teeth; i++) {
        const t = (i + 1) / (teeth + 1);
        const x = mix(front + 3, reach - 1, t) + Math.sin(i * 2.39 + m.phase) * 1.7;
        const py = y * (1 + Math.sin(Math.PI * t) * .65 - t * .43);
        const point = (3 + 5 * m.jaw) * side * (.67 + .33 * Math.sin(i + m.phase) ** 2);
        curve(ctx, rgba(m.light, .4 + m.jaw * .38), .58 + m.jaw * .4,
          x, py, x + 2, py - 2 * side, x + 2, py - point * .9, x + 4, py - point);
      }
    }
  }

  function buildSprite(m, resolution) {
    const canvas = surface(Math.round(SPRITE_WIDTH * resolution), Math.round(SPRITE_HEIGHT * resolution));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(resolution, 0, 0, resolution, canvas.width / 2, canvas.height / 2);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const random = rng(0x51D4605F);
    frills(ctx, m, random);
    cilia(ctx, m, random);
    mouth(ctx, m);
    mantle(ctx, m, random);
    return canvas;
  }

  function fieldSprite(m) {
    if (m.sprite) return m.sprite;
    const key = m.spriteKey;
    const found = sprites.get(key);
    if (found) sprites.delete(key);
    const canvas = found || buildSprite(m, .7);
    sprites.set(key, canvas);
    if (sprites.size > CACHE_LIMIT) sprites.delete(sprites.keys().next().value);
    m.sprite = canvas;
    return canvas;
  }

  function filaments(ctx, m, time, action) {
    const phase = time * (3 + 8 * m.tail + m.throttle * 3) + m.phase;
    const stroke = action === "hunting" ? 1.31 : 1;
    const trailing = -m.halfLength * .76;
    const threads = Math.round(2 + m.tail * 7);
    for (let i = 0; i < threads; i++) {
      const index = (i + .5) / threads - .5;
      const curl = Math.sin(phase - i * .78) * stroke;
      const y = m.halfHeight * index;
      const x = trailing - (24 + m.tail * 51) * (1 - Math.abs(index) * .67);
      const tipY = y * (2 + m.tail) + curl * (3 + m.tail * 13);
      curve(ctx, rgba(m.pigment, .32), 2.4 + m.tail * 1.1, trailing + 6, y,
        trailing - 20, y + curl * 4, x + 21, tipY + curl * 12, x, tipY);
      curve(ctx, rgba(m.light, .45 + .24 * m.tail), .67, trailing + 6, y - .8,
        trailing - 20, y - .8 + curl * 4, x + 21, tipY - .8 + curl * 12, x, tipY - .8);
      if (i % 2 === 0 && m.tail > .4) {
        curve(ctx, rgba(m.accent, .42), .58, mix(trailing, x, .51), mix(y, tipY, .44),
          x + 22, tipY * .78, x + 11, tipY + index * 28, x + 3, tipY + index * 25);
      }
    }

    const whiskers = Math.round(2 + m.vision * 4);
    for (let i = 0; i < whiskers; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = m.halfLength * (.76 - i * .035);
      const y = side * m.halfHeight * (.24 + i * .045);
      const flex = Math.sin(time * 5.7 + m.phase + i * .87);
      const tx = x + 17 + 32 * m.vision - i * 2.8;
      const ty = y * 2.04 + side * 8 + flex * 5.35;
      curve(ctx, rgba(m.light, .51), .69, x, y, x + 9, y + side * 6,
        tx - 16, ty * .89 - side * 12, tx, ty);
      ellipse(ctx, tx, ty, .9 + m.vision, .62 + m.vision * .48, side * .58);
      ctx.fillStyle = rgba(m.accent, .73);
      ctx.fill();
    }
  }

  function specimen(ctx, m, canvas, x, y, scale, angle, time, alpha, action) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const breath = .022 * Math.sin(time * 3.15 + m.phase);
    ctx.scale(scale * (1 + breath), scale * (1 - breath));
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    filaments(ctx, m, time, action);
    ctx.drawImage(canvas, -SPRITE_WIDTH / 2, -SPRITE_HEIGHT / 2, SPRITE_WIDTH, SPRITE_HEIGHT);
    ctx.restore();
  }

  const NOISE_EDGE = 128;
  const noiseCells = new Float32Array(NOISE_EDGE * NOISE_EDGE);
  {
    const random = rng(0x5239C19B);
    for (let i = 0; i < noiseCells.length; i++) noiseCells[i] = random();
  }

  function noise(x, y, periodX, periodY) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const dx = x - ix;
    const dy = y - iy;
    const tx = dx * dx * (3 - 2 * dx);
    const ty = dy * dy * (3 - 2 * dy);
    const row = wrap(iy, periodY) * NOISE_EDGE;
    const nextRow = wrap(iy + 1, periodY) * NOISE_EDGE;
    const col = wrap(ix, periodX);
    const nextCol = wrap(ix + 1, periodX);
    return mix(mix(noiseCells[row + col], noiseCells[row + nextCol], tx),
      mix(noiseCells[nextRow + col], noiseCells[nextRow + nextCol], tx), ty);
  }

  class Field {
    constructor(canvas) {
      this.canvas = canvas;
      this.camera = { x: 0, y: 0, width: 0, height: 0, scale: 1, worldWidth: 1, worldHeight: 1 };
      this.subjects = [];
      this.illumination = surface(1, 1);
      this.illuminatedWorld = null;
      this.lastLight = -Infinity;
      const random = rng(0x112A4B45);
      this.snow = Array.from({ length: 620 }, () => ({
        x: random(), y: random(), drift: random(), focus: random(), turn: random() * TAU
      }));
    }

    project(x, y) {
      const camera = this.camera;
      return {
        x: camera.width / 2 + shortest(x - camera.x, camera.worldWidth) * camera.scale,
        y: camera.height / 2 + shortest(y - camera.y, camera.worldHeight) * camera.scale
      };
    }

    toWorld(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const camera = this.camera;
      const { width, height, scale } = camera;
      if (!rect.width || !rect.height) return { x: camera.x, y: camera.y };
      const offsetX = ((clientX - rect.left) * width / rect.width - width / 2) / scale;
      const offsetY = ((clientY - rect.top) * height / rect.height - height / 2) / scale;
      return {
        x: wrap(camera.x + offsetX, camera.worldWidth),
        y: wrap(camera.y + offsetY, camera.worldHeight)
      };
    }

    pick(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const x = (clientX - rect.left) * this.camera.width / rect.width;
      const y = (clientY - rect.top) * this.camera.height / rect.height;
      if (x < 0 || x > this.camera.width || y < 0 || y > this.camera.height) return null;
      let nearest = null;
      let distance = Infinity;
      for (const subject of this.subjects) {
        const dx = x - subject.x;
        const dy = y - subject.y;
        const along = dx * subject.cos + dy * subject.sin;
        const across = dy * subject.cos - dx * subject.sin;
        if ((along / subject.a) ** 2 + (across / subject.b) ** 2 > 1) continue;
        const total = dx * dx + dy * dy;
        if (total < distance) {
          nearest = subject.id;
          distance = total;
        }
      }
      return nearest;
    }

    illuminate(world, camera, time) {
      this.lastLight = time;
      this.illuminatedWorld = world;
      this.lastCamera = camera;
      // Interpolate the simulation's nutrient cells in the optical image.
      const { cols, rows } = world;
      const columnWidth = world.width / cols;
      const rowHeight = world.height / rows;
      const field = new Float32Array(cols * rows * 2);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const sample = world.fieldAt((col + .5) * columnWidth, (row + .5) * rowHeight);
          const index = (row * cols + col) * 2;
          field[index] = sample[0];
          field[index + 1] = sample[1];
        }
      }
      const width = 220;
      const height = Math.round(clamp(width * camera.height / camera.width, 68, 208));
      const canvas = this.illumination;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d");
      const image = context.createImageData(width, height);
      const sampleStepX = camera.width / width / camera.scale;
      const sampleStepY = camera.height / height / camera.scale;
      const startX = camera.x - camera.width / 2 / camera.scale;
      const startY = camera.y - camera.height / 2 / camera.scale;
      const columns = Array.from({ length: width }, (_, px) => {
        const x = wrap(startX + px * sampleStepX, world.width);
        const coord = x / columnWidth - .5;
        const left = Math.floor(coord);
        return { u: x / world.width, x0: wrap(left, cols), x1: wrap(left + 1, cols), dx: coord - left };
      });
      const drift = time * .16;
      for (let py = 0, index = 0; py < height; py++) {
        const y = wrap(startY + py * sampleStepY, world.height);
        const v = y / world.height;
        const fy = y / rowHeight - .5;
        const y0 = Math.floor(fy);
        const row0 = wrap(y0, rows) * cols;
        const row1 = wrap(y0 + 1, rows) * cols;
        const dy = fy - y0;
        const warp = Math.sin(v * TAU) * .64;
        for (let px = 0; px < width; px++, index += 4) {
          const { u, x0, x1, dx } = columns[px];
          const falloff = Math.max(.39, 1 - .46 * ((px / width - .48) ** 2 * 2.8 + (py / height - .38) ** 2 * 2));
          const i00 = (row0 + x0) * 2;
          const i01 = (row0 + x1) * 2;
          const i10 = (row1 + x0) * 2;
          const i11 = (row1 + x1) * 2;
          const jade = clamp(mix(mix(field[i00], field[i01], dx), mix(field[i10], field[i11], dx), dy), 0, 1);
          const amber = clamp(mix(mix(field[i00 + 1], field[i01 + 1], dx),
            mix(field[i10 + 1], field[i11 + 1], dx), dy), 0, 1);
          const wisps = noise(u * 5, v * 4, 5, 4) * .55 + noise(u * 14, v * 11, 14, 11) * .3 +
            noise(u * 39, v * 28, 39, 28) * .15;
          const bath = Math.pow(wisps, 1.85);
          const wave = (2 * u + v) * TAU + noise(u * 6 - drift * .15, v * 4, 6, 4) * 4.4 + drift;
          const wave2 = (2 * v - u) * TAU + noise(u * 7, v * 4 + drift * .14, 7, 4) * 4.8 - drift;
          const caustic = (.5 + .5 * Math.cos(wave)) ** 10 * (.57 + .43 * Math.cos(wave2)) ** 5;
          const scatter = noise(u * 12 + warp, v * 2 + drift * .023, 12, 2) ** 2;
          const softBeam = scatter * (.5 + .5 * Math.cos(wave)) ** 3;
          const hot = amber * (.4 + bath * 1.1);
          const pollen = jade * (.42 + bath);
          const grain = (noiseCells[(index / 4 + py * 39) % noiseCells.length] - .5) * 2.1;
          image.data[index] = (5 + 10 * bath + 19 * hot + 4 * pollen + caustic * 7 + softBeam * 5 + grain) * falloff;
          image.data[index + 1] = (19 + 28 * bath + 22 * pollen + 12 * hot + caustic * 16 + softBeam * 18 + grain) * falloff;
          image.data[index + 2] = (24 + 35 * bath + 14 * pollen + 4 * hot + caustic * 22 + softBeam * 23 + grain) * falloff;
          image.data[index + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
    }

    suspended(ctx, time, foreground) {
      const { width, height, panX, panY, scale } = this.camera;
      // Two focal planes, with depth-dependent parallax and drift.
      const fraction = (v) => v - Math.floor(v);
      const tiny = .08 * Math.sin(time * .32);
      const color = foreground ? [158, 212, 193] : [98, 162, 154];
      const many = Math.round(clamp(width * height / 690, 135, this.snow.length));
      for (let i = foreground ? 3 : 0; i < many; i += foreground ? 6 : 1) {
        if (!foreground && i % 6 === 3) continue;
        const p = this.snow[i];
        const depth = foreground ? .60 + p.focus * .49 : .20 + p.focus * .31;
        const u = fraction(p.x + time * (.0014 + p.drift * .0039) - panX * scale * depth / width);
        const v = fraction(p.y + Math.sin(time * .29 + p.turn) * (.006 + depth * .009) +
          tiny * p.drift - panY * scale * depth / height);
        const focus = p.focus * .82 + .18;
        const radius = foreground ? .5 + focus ** 4 * 2.7 : .22 + focus ** 2.5 * .89;
        const alpha = .085 + focus * (foreground ? .33 : .31);
        const sx = u * width;
        const sy = v * height;
        if (foreground && i % 42 === 3) {
          const blur = radius * (3.2 + p.drift * 4);
          const haze = ctx.createRadialGradient(sx, sy, 0, sx, sy, blur);
          haze.addColorStop(0, rgba(color, alpha * .27));
          haze.addColorStop(.34, rgba(color, alpha * .14));
          haze.addColorStop(1, rgba(color, 0));
          ctx.fillStyle = haze;
          ctx.fillRect(sx - blur, sy - blur, blur * 2, blur * 2);
        }
        ctx.fillStyle = rgba(color, alpha);
        ellipse(ctx, sx, sy, radius, radius * (.58 + focus * .33), p.turn);
        ctx.fill();
      }
    }

    draw(world, options = {}) {
      const view = viewport(this.canvas);
      if (!view) return;
      const { ctx, width, height } = view;
      const time = options.time ?? 0;
      const zoom = options.zoom ?? 1;
      const center = options.center ?? { x: world.width / 2, y: world.height / 2 };
      const scale = Math.min(width / world.width, height / world.height) * zoom;
      const x = wrap(center.x, world.width);
      const y = wrap(center.y, world.height);
      const sameWorld = this.illuminatedWorld === world;
      const old = this.camera;
      // The microscope's suspended particles move with uninterrupted parallax across world seams.
      const panX = sameWorld ? old.panX + shortest(x - old.x, world.width) : x;
      const panY = sameWorld ? old.panY + shortest(y - old.y, world.height) : y;
      const camera = { width, height, scale, x, y, worldWidth: world.width, worldHeight: world.height, panX, panY };
      this.camera = camera;
      const last = this.lastCamera;
      if (!sameWorld || time < this.lastLight || time - this.lastLight > .33 ||
          width !== last.width || height !== last.height || Math.abs(last.scale - scale) > .022 ||
          Math.abs(shortest(last.x - x, world.width)) * scale > 5 ||
          Math.abs(shortest(last.y - y, world.height)) * scale > 5) {
        this.illuminate(world, camera, time);
      }
      ctx.drawImage(this.illumination, 0, 0, width, height);
      this.suspended(ctx, time, false);

      const hotspots = [];
      const periodX = world.width * scale;
      const periodY = world.height * scale;
      for (const organism of world.organisms) {
        const { x, y } = this.project(organism.x, organism.y);
        const { radius, maxEnergy } = organism.traits;
        const magnification = radius * scale * .051;
        const reach = Math.max(12, magnification * 132);
        const left = Math.ceil((-reach - x) / periodX);
        const right = Math.floor((width + reach - x) / periodX);
        const top = Math.ceil((-reach - y) / periodY);
        const bottom = Math.floor((height + reach - y) / periodY);
        if (left > right || top > bottom) continue;
        const m = morphology(organism);
        const angle = organism.angle + .055 * Math.sin(time * 2.7 + m.phase);
        const brightness = .75 + .25 * clamp(organism.energy / Math.max(maxEnergy * .65, 1), 0, 1);
        const sprite = fieldSprite(m);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const a = Math.max(11, m.halfLength * magnification * 1.19);
        const b = Math.max(8, m.halfHeight * magnification * 1.21);
        for (let row = top; row <= bottom; row++) {
          for (let col = left; col <= right; col++) {
            const sx = x + col * periodX;
            const sy = y + row * periodY;
            specimen(ctx, m, sprite, sx, sy, magnification, angle, time, brightness, organism.action);
            hotspots.push({ id: organism.id, x: sx, y: sy, cos, sin, a, b });
          }
        }
      }
      this.subjects = hotspots;
      this.suspended(ctx, time, true);
    }
  }

  const PORTRAIT_TILT = -.17;
  const PORTRAIT_SWAY = .045;

  function portraitArt(m) {
    const image = buildSprite(m, 2);
    const outline = surface(320, 240);
    const ctx = outline.getContext("2d", { willReadFrequently: true });
    const midX = outline.width / 2;
    const midY = outline.height / 2;
    ctx.translate(midX, midY);
    ctx.rotate(PORTRAIT_TILT);
    ctx.lineCap = "round";

    // Fit the membrane and sample an entire stroke cycle for the moving appendages.
    ctx.drawImage(image, -SPRITE_WIDTH / 2, -SPRITE_HEIGHT / 2, SPRITE_WIDTH, SPRITE_HEIGHT);
    const cycle = TAU / Math.min(5.7, 3 + 8 * m.tail + 3 * m.throttle);
    for (let i = 0; i < 14; i++) filaments(ctx, m, cycle * i / 14, "hunting");
    const rgba = ctx.getImageData(0, 0, outline.width, outline.height).data;
    let left = midX, right = midX, top = midY, bottom = midY;
    for (let y = 0, index = 3; y < outline.height; y++) {
      for (let x = 0; x < outline.width; x++, index += 4) {
        if (rgba[index] < 8) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    const maxX = Math.max(midX - left, right - midX);
    const maxY = Math.max(midY - top, bottom - midY);
    const swayX = maxY * PORTRAIT_SWAY + maxX * .022 + 2;
    const swayY = maxX * PORTRAIT_SWAY + maxY * .022 + 2;
    return {
      image, genome: m.genome,
      width: right - left + 1 + 2 * swayX,
      height: bottom - top + 1 + 2 * swayY,
      x: (left + right) / 2 - midX,
      y: (top + bottom) / 2 - midY
    };
  }

  function portrait(canvas, organism, time = 0) {
    const view = viewport(canvas);
    if (!view) return;
    const { ctx, width, height } = view;
    ctx.clearRect(0, 0, width, height);
    if (!organism) return;
    const m = morphology(organism);
    const cached = portraits.get(canvas);
    const art = cached?.genome === m.genome ? cached : portraitArt(m);
    if (art !== cached) portraits.set(canvas, art);
    const scale = Math.min(Math.max(1, width - 14) / art.width, Math.max(1, height - 14) / art.height);
    const angle = PORTRAIT_TILT + Math.sin(time * 1.17 + m.phase) * PORTRAIT_SWAY;
    specimen(ctx, m, art.image, width / 2 - art.x * scale, height / 2 - art.y * scale, scale, angle, time, 1, organism.action);
  }

  window.Optics = { Field, portrait };
})();
