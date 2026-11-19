// The application: renderer and post, the multiverse caches, the traveller,
// streaming, interaction, discovery, hints, quality adaptation, and the
// window.THR hooks used by the automated tests.
import * as THREE from '../../vendor/three/three.module.js';
import { PortalRenderer, LAYER } from '../render/portal-renderer.js';
import { Post } from '../render/post.js';
import { Space } from '../core/space.js';
import { Traveller } from '../core/physics.js';
import { describe } from '../core/worlds/index.js';
import { DescCache, ViewCache } from './worlds.js';
import { Input } from './input.js';
import { Save } from './save.js';
import { Hud } from '../ui/hud.js';
import { Instrument } from './instrument.js';
import { Demo } from './demo.js';
import { Sound } from './sound.js';
import { dist, qrot, dot, norm, sub, qmul, qnorm, qaxis } from '../core/math.js';
import { UNIVERSE, ORIGIN } from '../core/multiverse.js';

const DT = 1 / 120;
export const QUALITY = [
  { name: 'minimal', scale: 0.5, depth: 1, renders: 3, shadows: false, particles: 0.3 },
  { name: 'low', scale: 0.66, depth: 2, renders: 5, shadows: false, particles: 0.5 },
  { name: 'medium', scale: 0.8, depth: 2, renders: 8, shadows: true, particles: 0.75 },
  { name: 'high', scale: 1.0, depth: 3, renders: 12, shadows: true, particles: 1 },
  { name: 'ultra', scale: 1.0, depth: 4, renders: 18, shadows: true, particles: 1 },
];

export class App {
  constructor(canvas, ui, params) {
    this.canvas = canvas;
    this.params = params;
    this.universe = params.has('universe') ? Number(params.get('universe')) >>> 0 : UNIVERSE;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('capture') });
    r.autoClear = false;
    r.info.autoReset = false;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    const gl = r.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    this.software = /swiftshader|llvmpipe|software/i.test(this.gpu);
    this.qIndex = params.has('quality') ? Math.max(0, Math.min(4, Number(params.get('quality')))) : (this.software ? 1 : 3);
    this.qPinned = params.has('quality');
    this.pr = new PortalRenderer(r);
    this.pr.frameId = 0;
    this.post = new Post(r);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.ctx = { renderer: r, pmrem: this.pmrem, shadows: true, shadowSize: this.software ? 1024 : 2048, particleScale: 1 };
    this.descs = new DescCache((k) => this.describe(k));
    this.space = new Space((k) => this.descs.get(k), { capacity: 32 });
    this.views = new ViewCache(this.ctx, this.descs, Number(params.get('views') || 10));
    this.views.onBuild = (v) => this.applyPersistent(v);
    this.save = new Save(params.has('nosave') ? null : window.localStorage);
    if (params.has('fresh')) this.save.reset();
    this.input = new Input(canvas);
    this.input.assumeLocked = params.has('nolock');
    this.hud = new Hud(ui);
    this.hud.onAction = (a) => this.action(a);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.08, 6000);
    this.time = 0; this.acc = 0; this.frames = 0;
    this.state = 'title';
    this.lastWorld = null;
    this.perf = { frame: 16.7, cpu: 0, fps: 60, slow: 0, fast: 0 };
    this.hintState = { looked: 0, walked: 0, raised: false };
    this.resize();
    addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => this.onLock());
    canvas.addEventListener('click', () => { if (this.state === 'play' && !this.input.locked && !this.journalOpen) this.input.lock(); });
    this.spawn();
    this.instrument = new Instrument(this);
    this.demo = new Demo(this);
    this.sound = new Sound(this);
    this.avatar = makeAvatar();
    this.installHooks();
  }

  describe(key) {
    const d = describe(key, this.universe);
    if (!d) return null;
    // A pale pillar on every lattice world's horizon points home to the Threshold.
    if (!d.pocket && key !== ORIGIN) {
      const [i, j] = d.coord, n = Math.hypot(i, j);
      d.sky.beacon = [-i / n, 0, j / n, Math.max(0.18, 1 / (1 + 0.35 * n))];
    }
    return d;
  }

  spawn() {
    const pos = this.save.data.pos;
    let world = ORIGIN, feet, look;
    const d = this.descs.get(ORIGIN);
    if (pos && !this.params.has('fresh') && this.descs.get(pos.world)) { world = pos.world; feet = pos.feet; look = pos.look; }
    else feet = d.spawn.feet;
    this.player = new Traveller(this.space, { world, feet, yaw: d.spawn.yaw || 0 });
    if (look) this.player.look = look;
    this.player.onCross = (c) => this.onCross(c);
    this.player.onFall = () => this.onFall();
  }

  resize() {
    const q = QUALITY[this.qIndex];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.floor(innerWidth * dpr * q.scale)), h = Math.max(2, Math.floor(innerHeight * dpr * q.scale));
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px';
    this.post.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  setQuality(i) {
    i = Math.max(0, Math.min(QUALITY.length - 1, i));
    if (i === this.qIndex && this.qApplied) return;
    this.qIndex = i; this.qApplied = true;
    const q = QUALITY[i];
    this.pr.settings.maxDepth = q.depth; this.pr.settings.maxRenders = q.renders;
    this.renderer.shadowMap.enabled = q.shadows;
    this.ctx.particleScale = q.particles;
    this.resize();
  }

  get view() { return this.views.get(this.player.world); }

  // ── Events ──────────────────────────────────────────────────────────────
  action(a) {
    if (a === 'enter') { this.start(false); }
    else if (a === 'demo') { this.start(true); }
    else if (a === 'journal') { this.toggleJournal(true); }
    else if (a === 'reset') { this.save.reset(); location.search = '?fresh'; }
  }
  start(demo) {
    this.hud.fadeTitle();
    this.state = 'play';
    this.sound.start();
    if (demo) this.demo.start(); else if (!this.input.assumeLocked) this.input.lock();
    this.hud.showDot(true);
    if (!demo && !this.save.data.hints.look) setTimeout(() => { if (!this.demo.active) this.hint('look', 'Move the mouse to look around'); }, 2600);
  }
  onLock() {
    const locked = this.input.locked;
    if (this.state === 'play') this.hud.showPause(!locked && !this.journalOpen && !this.demo.active);
  }
  toggleJournal(v = !this.journalOpen) {
    this.journalOpen = v;
    this.hud.journal(v, this.save);
    if (v) this.input.unlock(); else if (this.state === 'play') this.input.lock();
    this.hud.showPause(false);
  }
  hint(id, text) { if (this.save.data.hints[id] || this.demo?.active) return; this.hud.hint(id, text); }
  doneHint(id) { if (!this.save.data.hints[id]) { this.save.data.hints[id] = true; this.save.touch(); } this.hud.clearHint(id); }

  onCross(c) {
    this.crossings = (this.crossings || 0) + 1;
    this.sound.cross?.();
  }
  onFall() {
    const s = this.player.safe;
    this.post.params.fade = 1; this.post.params.fadeColor = [0.92, 0.9, 0.86];
    if (s) { this.player.world = s.world; this.player.feet = [...s.feet]; this.player.look = [...s.look]; this.player.up = [...s.up]; }
    else { const d = this.descs.get(ORIGIN); this.player.world = ORIGIN; this.player.feet = [...d.spawn.feet]; }
    this.player.vel = [0, 0, 0];
    this.hud.note('The sea gives you back.');
  }

  onEnterWorld(key) {
    const d = this.descs.get(key);
    // the demo is a film, not a journey: it does not write to the journal
    if (this.demo.active) { this.lastWorld = key; this.post.target = d.post; return; }
    const first = this.save.visit(key, { name: d.name, epithet: d.epithet, archetype: d.archetype, coord: d.coord, links: d.portals.map((P) => P.link.world) });
    if (first || this.params.has('cards')) {
      const coord = d.pocket ? '' : `${d.coord[0] >= 0 ? '' : '−'}${Math.abs(d.coord[0])} · ${d.coord[1] >= 0 ? '' : '−'}${Math.abs(d.coord[1])}`;
      if (key !== ORIGIN || first) this.hud.worldCard(d.name, d.epithet, coord);
      if (first) this.photoAt = this.time + 2.2;
      if (first && this.lastWorld && Object.keys(this.save.data.visited).length === 2) { this.turnWatch = { t: this.time, yaw0: this.player.forward() }; }
      if (first && Object.keys(this.save.data.visited).length === 3) setTimeout(() => this.hint('journal', 'J — the journal remembers where you have been'), 7000);
    }
    this.save.data.landmarkNames ||= {};
    for (const L of d.landmarks) this.save.data.landmarkNames[key + '#' + L.id] = L.name;
    this.lastWorld = key;
    this.sound.world?.(d);
    this.post.target = d.post;
  }

  applyPersistent(v) {
    if (v.lodestone) v.lodestone.setLit(this.save.isLit(v.key));
    if (v.instrument) v.instrument.setTaken(this.save.data.instrument);
  }

  // ── Interaction ─────────────────────────────────────────────────────────
  interactTarget() {
    const v = this.view, eye = this.player.eye, f = this.player.forward();
    const near = (p, r) => { const d = sub(p, eye), l = Math.hypot(...d); return l < r && dot(d, f) / l > 0.82 ? l : null; };
    if (v?.instrument && !this.save.data.instrument && near(v.desc.instrument.p, 4.2)) return { kind: 'instrument', text: 'E — take the instrument' };
    if (v?.lodestone && !this.save.isLit(v.key)) {
      const p = v.desc.lodestone.p, c = [p[0], p[1] + 2.0, p[2]];
      if (near(c, 5)) return { kind: 'lodestone', text: 'E — wake the lodestone' };
    }
    return null;
  }
  interact(t) {
    const v = this.view;
    if (t.kind === 'instrument') {
      this.save.data.instrument = true; this.save.touch();
      v.instrument.setTaken(true);
      this.instrument.acquire();
      this.sound.chime?.(2);
      this.hud.note('The instrument hums. It knows where you are.');
      setTimeout(() => this.hint('raise', 'Q — raise the instrument'), 2500);
    } else if (t.kind === 'lodestone') {
      this.save.light(v.key);
      v.lodestone.setLit(true);
      this.sound.chime?.(3);
      const n = Object.keys(this.save.data.lit).length;
      this.hud.note(n === 1 ? 'The lodestone wakes. Its light will be seen from other worlds.' : `${n} lodestones awake.`);
      this.instrument.dirty = true;
    }
    this.doneHint('touch');
  }

  // ── Frame ───────────────────────────────────────────────────────────────
  frame(dt, opts = {}) {
    const t0 = performance.now();
    this.time += dt;
    this.frames++;
    const pl = this.player, inp = this.input;
    if (!this.qApplied) this.setQuality(this.qIndex);
    // input
    let mv = { forward: 0, right: 0, run: false, jump: false };
    if (this.demo.active) mv = this.demo.control(dt);
    else if (this.state === 'play' && inp.locked && !this.journalOpen) {
      mv = inp.move();
      const [lx, ly] = inp.takeLook();
      if (lx || ly) { pl.turn(-lx, -ly); this.hintState.looked += Math.abs(lx) + Math.abs(ly); }
      if (inp.take('KeyE')) { const t = this.interactTarget(); if (t) this.interact(t); }
      if (inp.take('KeyQ') || inp.take('Tab')) { this.instrument.toggle(); if (this.instrument.raised) this.doneHint('raise'); }
    }
    if (inp.take('KeyJ')) this.toggleJournal();
    if (inp.take('Escape') && this.journalOpen) this.toggleJournal(false);
    if (inp.take('Backquote') || inp.take('F3')) this.showStats = !this.showStats;
    if (inp.take('KeyN') && this.showStats) pl.noclip = !pl.noclip;
    // physics at a fixed step
    if (!opts.noPhysics) {
      this.acc = Math.min(this.acc + dt, 0.1);
      const before = [...pl.feet], w0 = pl.world;
      while (this.acc >= DT) { pl.step(mv, DT); this.acc -= DT; }
      if (pl.world === w0) this.hintState.walked += dist(before, pl.feet);
    }
    if (pl.world !== this.lastWorld) this.onEnterWorld(pl.world);
    this.updateHints();
    // streaming and world updates
    this.stream();
    const eye = pl.eye;
    const cur = this.view;
    if (cur) cur.focus.set(eye[0], eye[1], eye[2]);
    for (const v of this.views.map.values()) v.update(dt, this.time, v === cur ? 4 : 1.5);
    // camera
    const cam = this.camera;
    cam.position.set(eye[0], eye[1], eye[2]);
    cam.quaternion.set(...pl.look);
    cam.updateMatrixWorld(true);
    this.placeAvatar();
    // post params ease towards the current world's grading
    this.easePost(dt);
    // render
    const r = this.renderer;
    if (!opts.noRender) {
      r.info.reset();
      this.pr.frameId++;
      this.pr.wanted = new Set();
      this.pr.seen = new Map();
      if (cur) {
        this.pr.render(cur, cam, this.post.sceneRT, (k) => this.getView(k));
        this.instrument.render(dt);
      }
      this.post.render(this.time);
      if (this.photoAt && this.time >= this.photoAt) { this.photoAt = 0; this.takePhoto(); }
      // focus of other worlds: where the renderer looked at them from
      for (const [k, s] of this.pr.seen) { const v = this.views.get(k); if (v && v !== cur) v.focus.copy(s); }
    }
    this.sound.update?.(dt);
    this.instrument.update(dt);
    if (this.frames % 120 === 0 && this.state === 'play') { this.save.setPos(pl.world, pl.feet, pl.look); this.save.flush(); }
    this.perf.cpu = performance.now() - t0;
    if (this.showStats) this.hud.stats(this.statsText()); else this.hud.stats(null);
    inp.endFrame();
  }

  getView(k) {
    const v = this.views.get(k);
    if (v && v.ready) { this.views.touch(k); return v; }
    return null;
  }

  // Keep the current world and every world the renderer reached last frame;
  // preload destinations of nearby portals; build at most one world a frame.
  stream() {
    const pl = this.player, keep = new Set([pl.world]);
    if (!this.views.has(pl.world)) this.views.build(pl.world);
    for (const k of this.pr.seen?.keys() || []) keep.add(k);
    const cands = [];
    for (const k of this.pr.wanted || []) cands.push([0, k]);
    for (const P of this.space.portals(pl.world)) {
      const d = dist(P.xf.p, pl.eye);
      if (d < 160) { keep.add(P.link.world); if (!this.views.has(P.link.world)) cands.push([d, P.link.world]); }
    }
    cands.sort((a, b) => a[0] - b[0]);
    const budget = this.loadBudget ?? 1;
    let built = 0;
    for (const [, k] of cands) {
      if (built >= budget) break;
      if (!this.views.has(k)) { this.views.build(k); built++; keep.add(k); }
    }
    this.views.trim(keep);
  }

  placeAvatar() {
    const v = this.view, a = this.avatar;
    if (!v) return;
    if (a.parent !== v.scene) v.scene.add(a);
    const pl = this.player, f = pl.forward(), up = pl.up;
    a.position.set(...pl.feet);
    const fw = norm(sub(f, up.map((x) => x * dot(f, up))));
    a.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-fw[0], -fw[1], -fw[2]), new THREE.Vector3(...up)));
  }

  easePost(dt) {
    const tgt = this.post.target || this.view?.desc.post;
    if (!tgt) return;
    const p = this.post.params, k = Math.min(1, dt * 1.6);
    p.exposure += (tgt.exposure - p.exposure) * k;
    p.saturation += ((tgt.saturation ?? 1) - p.saturation) * k;
    p.contrast += ((tgt.contrast ?? 1) - p.contrast) * k;
    p.bloom += ((tgt.bloom ?? 0.5) - p.bloom) * k;
    p.lift = p.lift.map((x, i) => x + ((tgt.lift || [0, 0, 0])[i] - x) * k);
    p.gain = p.gain.map((x, i) => x + ((tgt.gain || [1, 1, 1])[i] - x) * k);
    p.fade = Math.max(0, p.fade - dt * 0.6);
  }

  updateHints() {
    const h = this.hintState;
    if (h.looked > 1.5) this.doneHint('look'), (!this.save.data.hints.walk && this.state === 'play' && !this.demo.active && setTimeout(() => this.hint('walk', 'W A S D to walk · Shift to run'), 900), this.save.data.hints.look = true);
    if (h.walked > 5) this.doneHint('walk');
    const t = this.state === 'play' && !this.demo.active ? this.interactTarget() : null;
    this.hud.prompt(t ? t.text : null);
    if (this.turnWatch) {
      const f = this.player.forward();
      if (dot(f, this.turnWatch.yaw0) < -0.3) { this.turnWatch = null; this.doneHint('turn'); }
      else if (this.time - this.turnWatch.t > 7) { this.hint('turn', 'Look behind you'); }
      if (this.time - (this.turnWatch?.t ?? this.time) > 25) { this.turnWatch = null; this.hud.clearHint('turn'); }
    }
  }

  takePhoto() {
    try {
      const c = document.createElement('canvas'); c.width = 352; c.height = 198;
      const g = c.getContext('2d');
      const s = this.canvas, ar = s.width / s.height, tw = s.height * (352 / 198);
      g.drawImage(s, (s.width - Math.min(s.width, tw)) / 2, 0, Math.min(s.width, tw), s.height, 0, 0, 352, 198);
      this.save.photo(this.player.world, c.toDataURL('image/jpeg', 0.72));
      void ar;
    } catch { /* tainted or unavailable */ }
  }

  statsText() {
    const r = this.renderer.info, s = this.pr.stats, q = QUALITY[this.qIndex], pl = this.player;
    const v = this.view, mem = r.memory;
    const heap = performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : 'n/a';
    let tiles = 0, scatter = 0;
    for (const w of this.views.map.values()) { const c = w.counts(); tiles += c.tiles; scatter += c.scatter; }
    return [
      `THRESHOLD diagnostics   (\` to hide, N noclip)`,
      `gpu        ${this.gpu}`,
      `frame      ${this.perf.frame.toFixed(1)} ms  (${(1000 / this.perf.frame).toFixed(0)} fps)   cpu ${this.perf.cpu.toFixed(1)} ms`,
      `quality    ${q.name}  scale ${q.scale}  depth ${this.pr.settings.maxDepth}  budget ${this.pr.settings.maxRenders}${this.qPinned ? ' (pinned)' : ''}`,
      `draws      ${r.render.calls}   tris ${(r.render.triangles / 1000).toFixed(0)}k   programs ${r.programs?.length ?? '?'}`,
      `portals    visible ${s.portalsVisible}  rendered ${s.portalsRendered}  filled ${s.portalsFilled}  depth ${s.maxLevel}  world renders ${s.worldRenders}  near ${s.nearZone}  budget hits ${s.budgetHits}`,
      `memory     geometries ${mem.geometries}  textures ${mem.textures}  heap ${heap}`,
      `worlds     loaded ${this.views.map.size}/${this.views.capacity}  built ${this.views.built}  disposed ${this.views.disposed}  last build ${this.views.lastBuildMs.toFixed(0)} ms`,
      `streaming  terrain tiles ${tiles}  scatter instances ${scatter}  descriptors ${this.descs.map.size}  physics worlds ${this.space.cache.size}`,
      `world      ${pl.world}  ${v ? v.desc.name : ''}  (${v ? v.desc.archetype : ''})`,
      `position   ${pl.feet.map((x) => x.toFixed(1)).join(', ')}   ${pl.grounded ? 'grounded' : 'airborne'}${pl.noclip ? ' noclip' : ''}   crossings ${this.crossings || 0}`,
    ].join('\n');
  }

  // Adaptive quality from the real frame interval.
  adapt(frameMs) {
    const p = this.perf;
    p.frame = p.frame * 0.95 + frameMs * 0.05;
    if (this.qPinned || this.demo.recording) return;
    if (p.frame > 21) { p.slow++; p.fast = 0; } else if (p.frame < 13) { p.fast++; p.slow = 0; } else { p.slow = 0; p.fast = 0; }
    if (p.slow > 90 && this.qIndex > 0) { this.setQuality(this.qIndex - 1); p.slow = 0; }
    if (p.fast > 360 && this.qIndex < 3) { this.setQuality(this.qIndex + 1); p.fast = 0; }
  }

  loop() {
    let last = performance.now();
    const tick = (now) => {
      const ms = now - last; last = now;
      if (!this.manual) { this.adapt(ms); this.frame(Math.min(0.05, ms / 1000)); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  installHooks() {
    const app = this;
    window.THR = {
      app, THREE, ready: true,
      get world() { return app.player.world; },
      frame: (dt = 1 / 60, opts) => app.frame(dt, opts),
      // Teleport the traveller (for tests and screenshots).
      place(world, feet, yaw = 0, pitch = 0) {
        app.player.world = world; app.player.feet = [...feet]; app.player.vel = [0, 0, 0];
        app.player.up = [0, 1, 0];
        app.player.look = qnorm(qmul(qaxis([0, 1, 0], yaw), qaxis([1, 0, 0], pitch)));
        app.state = 'play'; app.hud.showTitle(false); app.hud.showPause(false);
      },
      stats: () => ({ ...app.pr.stats, calls: app.renderer.info.render.calls, tris: app.renderer.info.render.triangles, world: app.player.world, geometries: app.renderer.info.memory.geometries, textures: app.renderer.info.memory.textures, views: app.views.map.size, built: app.views.built, disposed: app.views.disposed }),
      step: (input, seconds) => { const n = Math.round(seconds / DT); for (let i = 0; i < n; i++) app.player.step(input, DT); },
    };
  }
}

// The traveller as seen through portals: a cloaked figure carrying a light.
function makeAvatar() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.08, 0.075, 0.07), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.17, 0.15), roughness: 0.7 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(1.0, 0.75, 0.45), emissiveIntensity: 6 });
  const robe = new THREE.LatheGeometry([[0.0, 0], [0.42, 0], [0.36, 0.5], [0.27, 1.1], [0.2, 1.42], [0.0, 1.5]].map((p) => new THREE.Vector2(p[0], p[1])), 14);
  g.add(new THREE.Mesh(robe, cloth));
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), cloth); hood.position.y = 1.6; hood.scale.set(1, 1.15, 1.1); g.add(hood);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin); face.position.set(0, 1.58, -0.08); g.add(face);
  const light = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), lamp); light.position.set(0.32, 1.0, -0.25); g.add(light);
  g.traverse((o) => { if (o.isMesh) { o.layers.set(LAYER.AVATAR); o.castShadow = false; } });
  g.layers.set(LAYER.AVATAR);
  return g;
}
