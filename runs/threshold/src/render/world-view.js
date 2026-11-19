// A loaded world: the three.js scene built from a world descriptor, plus the
// per-world uniforms, lights, environment map and portal records the portal
// renderer needs. Building is split into steps so a world can be prepared
// over several frames; dispose() releases every GPU resource it created.
import * as THREE from 'three';
import { makeAtmosUniforms, makeSkyUniforms, makeSkyMesh, patchMaterial } from './atmosphere.js';
import { partGeometry, merge } from './geometry.js';
import { corners } from '../core/portal.js';
import { LAYER } from './portal-renderer.js';

export class WorldView {
  constructor(desc, ctx) {
    this.desc = desc;
    this.key = desc.key;
    this.ctx = ctx;
    this.ready = false;
    this.scene = new THREE.Scene();
    this.scene.name = desc.key;
    this.uniforms = { ...makeAtmosUniforms(desc.atmos), ...makeSkyUniforms(desc.sky) };
    this.fillColor = desc.fill || desc.atmos.fogColor;
    this.portals = desc.portals.map((P) => ({ ...P, cornersPad: corners(P, 0.08) }));
    this.bySlot = new Map(this.portals.map((P) => [P.slot, P]));
    this.focus = new THREE.Vector3();
    this.disposables = [];
    this.updaters = [];
    this.materials = {};
    this.lastShadowFocus = null;
    this.stats = { meshes: 0, triangles: 0 };
  }

  portal(slot) { return this.bySlot.get(slot) || null; }

  track(x) { this.disposables.push(x); return x; }

  // Build everything synchronously (generators may override with steps).
  build() {
    const d = this.desc, s = this.scene, u = this.uniforms;
    s.add(makeSkyMesh(u));
    this.track(s.children[s.children.length - 1].geometry); this.track(s.children[s.children.length - 1].material);
    // Lights
    const L = d.light;
    const sun = new THREE.DirectionalLight(new THREE.Color(...d.atmos.sunColor), L.sun);
    sun.position.set(...d.atmos.sunDir).multiplyScalar(200);
    sun.layers.set(LAYER.LIGHTS);
    s.add(sun, sun.target);
    this.sun = sun;
    if (this.ctx.shadows && L.shadows !== false) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.ctx.shadowSize, this.ctx.shadowSize);
      const c = sun.shadow.camera; const r = L.shadowRange || 45;
      c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 600;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
      c.layers.enable(LAYER.DETAIL);
    }
    const hemi = new THREE.HemisphereLight(new THREE.Color(...L.hemiSky), new THREE.Color(...L.hemiGround), L.hemi);
    hemi.layers.set(LAYER.LIGHTS);
    s.add(hemi);
    for (const pl of d.lights || []) {
      const p = new THREE.PointLight(new THREE.Color(...pl.color), pl.intensity, pl.range, 2);
      p.position.set(...pl.p); p.layers.set(LAYER.LIGHTS); s.add(p);
    }
    // Materials
    for (const [name, m] of Object.entries(d.materials)) this.materials[name] = this.makeMaterial(name, m);
    // Static parts, merged per material
    const groups = new Map();
    for (const part of d.parts) {
      if (!groups.has(part.mat)) groups.set(part.mat, []);
      groups.get(part.mat).push(partGeometry(part));
    }
    for (const [mat, geos] of groups) {
      const g = this.track(merge(geos, { colors: true }));
      const mesh = new THREE.Mesh(g, this.materials[mat] || this.materials.default);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = d.materials[mat]?.castShadow !== false; mesh.receiveShadow = true;
      if (d.materials[mat]?.transparent) mesh.layers.set(LAYER.TRANSPARENT);
      s.add(mesh);
      this.stats.meshes++; this.stats.triangles += g.index.count / 3;
    }
    if (d.ground) this.addGround(d.ground);
    this.makeEnvironment();
    this.ready = true;
    return this;
  }

  makeMaterial(name, m) {
    const opts = {
      color: new THREE.Color(...(m.color || [0.5, 0.5, 0.5])), roughness: m.rough ?? 0.8, metalness: m.metal ?? 0,
      vertexColors: true, envMapIntensity: m.env ?? this.desc.light.env ?? 1,
    };
    if (m.emissive) { opts.emissive = new THREE.Color(...m.emissive); opts.emissiveIntensity = m.emissiveIntensity ?? 1; }
    if (m.transparent) { opts.transparent = true; opts.opacity = m.opacity ?? 0.5; opts.depthWrite = false; }
    if (m.side === 'double') opts.side = THREE.DoubleSide;
    const mat = this.track(new THREE.MeshStandardMaterial(opts));
    patchMaterial(mat, this.uniforms, { key: 'std' });
    return mat;
  }

  addGround(g) {
    if (g.kind === 'plane') {
      const geo = this.track(new THREE.PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2));
      const mesh = new THREE.Mesh(geo, this.materials[g.mat]);
      mesh.position.y = g.y; mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.onBeforeRender = (r, sc, cam) => { mesh.position.x = Math.round(cam.position.x / 50) * 50; mesh.position.z = Math.round(cam.position.z / 50) * 50; mesh.updateMatrixWorld(); };
      // the snap happens before the model-view matrix is computed for this draw
      this.scene.add(mesh);
    }
  }

  makeEnvironment() {
    if (!this.ctx.pmrem) return;
    const skyScene = new THREE.Scene();
    const sky = makeSkyMesh(this.uniforms);
    skyScene.add(sky);
    const rt = this.ctx.pmrem.fromScene(skyScene, 0, 0.1, 100, { size: 128 });
    sky.geometry.dispose(); sky.material.dispose();
    this.envRT = this.track(rt);
    this.scene.environment = rt.texture;
  }

  // Called by the portal renderer before each draw of this world.
  beforeRender(cam, level, clip, pr) {
    const fp = this.uniforms.uFogPlane.value;
    if (clip) fp.set(clip.n[0], clip.n[1], clip.n[2], clip.d); else fp.set(0, 0, 0, 0);
    if (this.sun && this.sun.castShadow && this.shadowFrame !== pr.frameId) {
      this.shadowFrame = pr.frameId;
      const f = this.focus;
      if (!this.lastShadowFocus || this.lastShadowFocus.distanceToSquared(f) > 16 || this.shadowAnimated) {
        const c = this.sun.shadow.camera, texel = (c.right - c.left) / this.sun.shadow.mapSize.x;
        const sd = this.uniforms.uSunDir.value;
        // snap the focus to shadow texels along the light's axes to avoid shimmer
        const fx = Math.round(f.x / texel) * texel, fy = Math.round(f.y / texel) * texel, fz = Math.round(f.z / texel) * texel;
        this.sun.target.position.set(fx, fy, fz);
        this.sun.position.set(fx + sd.x * 250, fy + sd.y * 250, fz + sd.z * 250);
        this.sun.target.updateMatrixWorld(); this.sun.updateMatrixWorld();
        pr.r.shadowMap.needsUpdate = true;
        this.lastShadowFocus = (this.lastShadowFocus || new THREE.Vector3()).copy(f);
      }
    }
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
    for (const f of this.updaters) f(dt, time);
  }

  dispose() {
    for (const x of this.disposables) x.dispose?.();
    this.scene.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isInstancedMesh) { o.geometry?.dispose?.(); }
      if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose();
    });
    this.scene.clear();
    this.disposables = [];
    this.ready = false;
    this.disposed = true;
  }
}
