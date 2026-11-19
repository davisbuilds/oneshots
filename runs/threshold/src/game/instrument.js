// The instrument: a brass astrolabe the traveller carries. Raised (Q), its
// face shows the multiverse as far as it has been discovered: worlds visited
// (filled), worlds known only as a door's destination (hollow), woken
// lodestones (starred), pocket worlds as satellites of their hosts, and the
// links between them. It is rendered into the scene target after the world,
// so it is lit, graded and blooms like everything else.
import * as THREE from 'three';
import { parseKey, ORIGIN } from '../core/multiverse.js';

export class Instrument {
  constructor(app) {
    this.app = app;
    this.has = app.save.data.instrument;
    this.raised = false;
    this.k = 0;
    this.dirty = true;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(40, 1, 0.01, 10);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 768;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const brass = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.72, 0.5, 0.24), roughness: 0.32, metalness: 1.0 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.14, 0.08), roughness: 0.4, metalness: 1.0 });
    const face = new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.tex, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.85, roughness: 0.55, metalness: 0.0 });
    const g = this.group = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CircleGeometry(0.1, 96), face));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.008, 16, 128), brass); g.add(rim);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.113, 0.0035, 8, 128), dark); g.add(rim2);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.1, 0.012, 64), dark); back.rotation.x = Math.PI / 2; back.position.z = -0.007; g.add(back);
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 8, 32), brass); bail.position.y = 0.122; g.add(bail);
    this.needle = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.08, 0.002), brass); this.needle.position.z = 0.004; this.needle.geometry.translate(0, 0.04, 0); g.add(this.needle);
    this.scene.add(g);
    const key = new THREE.DirectionalLight(0xfff0dd, 2.4); key.position.set(-0.4, 0.7, 0.6); this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x302418, 0.9));
    this.lastDraw = 0;
  }
  acquire() { this.has = true; this.dirty = true; this.raised = true; }
  toggle() { if (this.has) { this.raised = !this.raised; this.dirty = true; } }

  update(dt) {
    this.k += ((this.raised ? 1 : 0) - this.k) * Math.min(1, dt * 6);
  }

  render(dt) {
    if (!this.has || this.k < 0.01) return;
    const app = this.app, r = app.renderer;
    if (this.dirty || app.time - this.lastDraw > 0.25) { this.draw(); this.lastDraw = app.time; this.dirty = false; }
    const k = this.k, e = 1 - Math.pow(1 - k, 3);
    const t = app.time;
    this.group.position.set(0.09, -0.24 + e * 0.135 + Math.sin(t * 1.6) * 0.0015, -0.42);
    this.group.rotation.set(-0.62 + e * 0.38, -0.12, 0.05 + Math.sin(t * 0.9) * 0.01);
    // the needle points to the Threshold's beacon (or north at the Threshold)
    const v = app.view, b = v?.desc.sky.beacon;
    const fw = app.player.forward();
    const heading = Math.atan2(fw[0], -fw[2]);
    const target = b ? Math.atan2(b[0], -b[2]) : 0;
    this.needle.rotation.z = -(target - heading);
    this.cam.aspect = app.camera.aspect; this.cam.fov = app.camera.fov; this.cam.updateProjectionMatrix();
    this.scene.environment = v?.scene.environment || null;
    const prev = r.clippingPlanes; r.clippingPlanes = [];
    r.setRenderTarget(app.post.sceneRT);
    app.post.sceneRT.scissorTest = false; r.setRenderTarget(app.post.sceneRT);
    r.state.buffers.stencil.setLocked(false);
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.clippingPlanes = prev;
  }

  // The face: an engraved disc with the discovered graph.
  draw() {
    const app = this.app, S = this.canvas.width, c = this.canvas.getContext('2d'), save = app.save.data;
    const cur = app.player.world;
    const curLat = parseKey(cur).lattice;
    c.clearRect(0, 0, S, S);
    const R = S / 2;
    const bg = c.createRadialGradient(R, R * 0.9, R * 0.1, R, R, R);
    bg.addColorStop(0, '#1d2733'); bg.addColorStop(1, '#0a0e13');
    c.fillStyle = bg; c.beginPath(); c.arc(R, R, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(214,178,118,0.55)'; c.lineWidth = 2;
    for (const rr of [0.96, 0.9, 0.62, 0.34]) { c.beginPath(); c.arc(R, R, R * rr, 0, Math.PI * 2); c.stroke(); }
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, l = i % 6 === 0 ? 0.06 : 0.025;
      c.beginPath(); c.moveTo(R + Math.sin(a) * R * 0.96, R - Math.cos(a) * R * 0.96); c.lineTo(R + Math.sin(a) * R * (0.96 - l), R - Math.cos(a) * R * (0.96 - l)); c.stroke();
    }
    c.fillStyle = 'rgba(214,178,118,0.85)'; c.font = `${S * 0.03}px Georgia, serif`; c.textAlign = 'center';
    c.fillText('N', R, R - R * 0.83); c.fillText('S', R, R + R * 0.87); c.fillText('E', R + R * 0.85, R + S * 0.01); c.fillText('W', R - R * 0.85, R + S * 0.01);
    // the graph, centred on the current lattice world
    const visited = save.visited;
    const nodes = new Map();
    const node = (k) => { if (!nodes.has(k)) nodes.set(k, { k, visited: !!visited[k], lit: !!save.lit[k] }); return nodes.get(k); };
    const edges = [];
    for (const [k, w] of Object.entries(visited)) { node(k); for (const to of w.links || []) { node(to); edges.push([k, to]); } }
    node(cur);
    const { i: ci, j: cj } = parseKey(curLat);
    const span = 3.2;
    const pos = (k) => {
      const p = parseKey(k);
      let x = (p.i - ci) / span, y = -(p.j - cj) / span;
      if (p.pocket) { const a = (p.pocket.charCodeAt(0) * 2.4) % 6.28; x += Math.cos(a) * 0.09; y += Math.sin(a) * 0.09; }
      const d = Math.hypot(x, y), m = 0.8;
      if (d > m) { x *= m / d; y *= m / d; }
      return [R + x * R, R + y * R];
    };
    c.lineWidth = 2.2;
    for (const [a, b] of edges) {
      if (a === b) continue;
      const [x0, y0] = pos(a), [x1, y1] = pos(b);
      c.strokeStyle = visited[a] && visited[b] ? 'rgba(232,206,150,0.8)' : 'rgba(232,206,150,0.3)';
      c.setLineDash(visited[a] && visited[b] ? [] : [6, 6]);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.setLineDash([]);
    for (const n of nodes.values()) {
      const [x, y] = pos(n.k), here = n.k === cur, pocket = n.k.includes('/');
      const rad = (pocket ? 0.016 : 0.026) * S;
      if (n.lit) { const gl = c.createRadialGradient(x, y, 0, x, y, rad * 3); gl.addColorStop(0, 'rgba(255,214,150,0.7)'); gl.addColorStop(1, 'rgba(255,214,150,0)'); c.fillStyle = gl; c.beginPath(); c.arc(x, y, rad * 3, 0, Math.PI * 2); c.fill(); }
      c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2);
      if (n.visited) { c.fillStyle = n.k === ORIGIN ? '#f6dfb0' : '#d8b878'; c.fill(); }
      else { c.strokeStyle = 'rgba(232,206,150,0.55)'; c.lineWidth = 2; c.stroke(); }
      if (here) {
        const pulse = 1 + 0.25 * Math.sin(app.time * 3);
        c.strokeStyle = 'rgba(160,220,255,0.95)'; c.lineWidth = 3;
        c.beginPath(); c.arc(x, y, rad * 1.9 * pulse, 0, Math.PI * 2); c.stroke();
      }
    }
    const d = app.view?.desc;
    c.fillStyle = 'rgba(236,214,170,0.92)'; c.font = `italic ${S * 0.042}px Georgia, serif`;
    if (d) c.fillText(d.name, R, R + R * 0.7);
    c.font = `${S * 0.024}px Georgia, serif`; c.fillStyle = 'rgba(236,214,170,0.6)';
    c.fillText(`${Object.keys(visited).length} visited · ${Object.keys(save.lit).length} awake`, R, R + R * 0.78);
    this.tex.needsUpdate = true;
  }
}
