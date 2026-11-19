// A loaded world: the three.js scene built from a world descriptor, plus the
// per-world uniforms, lights, environment map and portal records the portal
// renderer needs. update() streams terrain and scatter around the world's
// focus; dispose() releases every GPU resource the world created.
import * as THREE from 'three';
import { makeAtmosUniforms, makeSkyUniforms, makeSkyMesh, patchMaterial } from './atmosphere.js';
import { partGeometry, merge } from './geometry.js';
import { corners } from '../core/portal.js';
import { LAYER } from './portal-renderer.js';
import { detailMaterial } from './materials.js';
import { Terrain } from './terrain.js';
import { ScatterRender } from './props.js';
import { FEATURES } from './features.js';
import { lodestone, instrumentOnPedestal } from './artifacts.js';

export class WorldView {
  constructor(desc, ctx) {
    this.desc = desc;
    this.key = desc.key;
    this.ctx = ctx;
    this.ready = false;
    this.scene = new THREE.Scene();
    this.scene.name = desc.key;
    this.scene.matrixWorldAutoUpdate = true;
    this.uniforms = { ...makeAtmosUniforms(desc.atmos), ...makeSkyUniforms(desc.sky) };
    this.fillColor = desc.fill || desc.atmos.fogColor;
    this.portals = desc.portals.map((P) => ({ ...P, cornersPad: corners(P, 0.08) }));
    this.bySlot = new Map(this.portals.map((P) => [P.slot, P]));
    this.focus = new THREE.Vector3(...(desc.spawn?.feet || [0, 0, 0]));
    this.disposables = [];
    this.updaters = [];
    this.mats = new Map();
    this.stats = { meshes: 0, triangles: 0 };
  }

  portal(slot) { return this.bySlot.get(slot) || null; }
  track(x) { this.disposables.push(x); return x; }
  patch(mat, key) { return patchMaterial(mat, this.uniforms, { key }); }

  // Merged static parts carry per-vertex colour; everything else does not
  // (a material reading a missing colour attribute would render black).
  materialFor(name, double = false, vertexColors = false) {
    const k = name + (double ? ':2' : '') + (vertexColors ? ':vc' : '');
    if (!this.mats.has(k)) {
      const spec = this.desc.materials[name] || { color: [1, 0, 1] };
      const m = this.track(detailMaterial(double ? { ...spec, side: 'double' } : spec, this.uniforms, { env: this.desc.light.env, vertexColors, key: vertexColors ? 'vc' : '' }));
      this.mats.set(k, m);
    }
    return this.mats.get(k);
  }

  build() {
    const d = this.desc, s = this.scene;
    const sky = makeSkyMesh(this.uniforms);
    this.track(sky.geometry); this.track(sky.material);
    s.add(sky);
    // lights
    const L = d.light;
    const sun = new THREE.DirectionalLight(new THREE.Color(...d.atmos.sunColor), L.sun);
    sun.layers.set(LAYER.LIGHTS);
    s.add(sun, sun.target);
    this.sun = sun;
    if (this.ctx.shadows && L.shadows !== false && L.sun > 0) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(this.ctx.shadowSize, this.ctx.shadowSize);
      const c = sun.shadow.camera, r = L.shadowRange || 45;
      c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 700;
      sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
      c.layers.enable(LAYER.DETAIL);
    }
    const hemi = new THREE.HemisphereLight(new THREE.Color(...L.hemiSky), new THREE.Color(...L.hemiGround), L.hemi);
    hemi.layers.set(LAYER.LIGHTS);
    s.add(hemi);
    for (const pl of d.lights || []) {
      const p = new THREE.PointLight(new THREE.Color(...pl.color), pl.intensity, pl.range, 2);
      p.position.set(...pl.p); p.layers.set(LAYER.LIGHTS); s.add(p);
    }
    // static parts, merged per material
    const groups = new Map();
    for (const part of d.parts) {
      if (part.hidden) continue;
      if (!groups.has(part.mat)) groups.set(part.mat, []);
      groups.get(part.mat).push(partGeometry(part));
    }
    for (const [name, geos] of groups) {
      const g = this.track(merge(geos, { colors: true }));
      const spec = d.materials[name] || {};
      const mesh = new THREE.Mesh(g, this.materialFor(name, false, true));
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = spec.castShadow !== false; mesh.receiveShadow = true;
      if (spec.transparent) mesh.layers.set(LAYER.TRANSPARENT);
      s.add(mesh);
      this.stats.meshes++; this.stats.triangles += g.index.count / 3;
    }
    // terrain and scatter
    const tf = d.features.find((f) => f.type === 'terrain');
    if (tf && d.heightAt) {
      this.terrain = new Terrain(d.heightAt, this.materialFor(tf.mat), { castShadow: false });
      s.add(this.terrain.group);
      this.terrain.update(this.focus, 1e9);
    }
    if (d.scatter.length && d.scatterCache) {
      this.scatter = new ScatterRender(this, d.scatterCache);
      s.add(this.scatter.group);
      this.scatter.update(this.focus);
    }
    for (const f of d.features) if (FEATURES[f.type]) FEATURES[f.type](this, f);
    if (d.lodestone) this.lodestone = lodestone(this, d.lodestone);
    if (d.instrument) this.instrument = instrumentOnPedestal(this, d.instrument);
    this.makeEnvironment();
    this.ready = true;
    return this;
  }

  makeEnvironment() {
    if (!this.ctx.pmrem) return;
    const skyScene = new THREE.Scene();
    const sky = makeSkyMesh(this.uniforms);
    skyScene.add(sky);
    const rt = this.ctx.pmrem.fromScene(skyScene, 0, 0.1, 100, { size: 64 });
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
      if (!this.lastShadowFocus || this.lastShadowFocus.distanceToSquared(f) > 9 || this.shadowDirty) {
        this.shadowDirty = false;
        const c = this.sun.shadow.camera, texel = (c.right - c.left) / this.sun.shadow.mapSize.x * 4;
        const sd = this.uniforms.uSunDir.value;
        const fx = Math.round(f.x / texel) * texel, fy = Math.round(f.y / texel) * texel, fz = Math.round(f.z / texel) * texel;
        this.sun.target.position.set(fx, fy, fz);
        this.sun.position.set(fx + sd.x * 300, fy + sd.y * 300, fz + sd.z * 300);
        this.sun.target.updateMatrixWorld(); this.sun.updateMatrixWorld();
        pr.r.shadowMap.needsUpdate = true;
        this.lastShadowFocus = (this.lastShadowFocus || new THREE.Vector3()).copy(f);
        pr.stats.shadowUpdates = (pr.stats.shadowUpdates || 0) + 1;
      }
    }
  }

  update(dt, time, budgetMs = 4) {
    this.uniforms.uTime.value = time;
    for (const f of this.updaters) f(dt, time);
    if (this.terrain) this.terrain.update(this.focus, budgetMs);
    if (this.scatter) this.scatter.update(this.focus);
  }

  counts() {
    return { tiles: this.terrain ? this.terrain.cache.size : 0, scatter: this.scatter ? this.scatter.count : 0, triangles: this.stats.triangles };
  }

  dispose() {
    this.terrain?.dispose();
    this.scatter?.dispose();
    for (const x of this.disposables) x.dispose?.();
    this.scene.traverse((o) => { if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose(); });
    this.scene.clear();
    this.disposables = [];
    this.mats.clear();
    this.ready = false;
    this.disposed = true;
  }
}
