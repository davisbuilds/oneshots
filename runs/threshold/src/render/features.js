// Descriptor features turned into meshes: ocean, particles, monuments,
// floating stones, mesas, the elder tree, light shafts, pools, lodestones.
import * as THREE from '../../vendor/three/three.module.js';
import { FOG_PARS, SKY_PARS } from './atmosphere.js';
import { rng } from '../core/rng.js';
import { LAYER } from './portal-renderer.js';
import { lumenTreeGeo, rockGeo } from './props.js';
import { noiseTexture } from './materials.js';

const CLIP_V = '#include <clipping_planes_pars_vertex>';
const CLIP_F = '#include <clipping_planes_pars_fragment>';

export function ocean(view, f) {
  const geo = view.track(new THREE.CircleGeometry(9000, 64).rotateX(-Math.PI / 2));
  const mat = view.track(new THREE.ShaderMaterial({
    uniforms: { ...view.uniforms, tNoise: { value: noiseTexture() }, uDeep: { value: new THREE.Color(...f.deep) }, uShallow: { value: new THREE.Color(...f.shallow) }, uGlitter: { value: f.glitter ?? 1 } },
    clipping: true,
    vertexShader: `${CLIP_V}\nvarying vec3 vWorldP;\nvoid main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorldP = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;\n#include <clipping_planes_vertex>\n}`,
    fragmentShader: `${CLIP_F}\n${FOG_PARS}\n${SKY_PARS}
      uniform sampler2D tNoise; uniform vec3 uDeep, uShallow; uniform float uGlitter; varying vec3 vWorldP;
      void main() {
        #include <clipping_planes_fragment>
        vec3 V = cameraPosition - vWorldP; float dist = length(V); V /= dist;
        vec2 p = vWorldP.xz; float t = uTime;
        vec2 g = vec2(0.0);
        const int NW = 6;
        for (int i = 0; i < NW; i++) {
          float fi = float(i);
          float a = fi * 2.4 + 0.7; vec2 dir = vec2(cos(a), sin(a));
          float fr = 0.035 * pow(1.65, fi), am = 0.9 / pow(1.9, fi);
          g += dir * am * fr * cos(dot(dir, p) * fr + t * sqrt(9.8 * fr) * 0.9);
        }
        vec2 q = p * 0.11;
        vec2 d1 = texture2D(tNoise, q + vec2(t * 0.012, t * 0.007)).rg - 0.5;
        vec2 d2 = texture2D(tNoise, q * 2.7 - vec2(t * 0.02, -t * 0.015)).gr - 0.5;
        float far = smoothstep(30.0, 900.0, dist);
        g += (d1 * 0.5 + d2 * 0.35) * (1.0 - far);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y) * vec3(1.0 - far * 0.7, 1.0, 1.0 - far * 0.7));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 R = reflect(-V, n); R.y = abs(R.y) + 0.02; R = normalize(R);
        vec3 refl = skyColor(R, false);
        float s = max(dot(R, uSunDir), 0.0);
        vec3 spec = uSunColor * (pow(s, 900.0) * 60.0 + pow(s, 90.0) * 1.2) * uGlitter;
        float sss = pow(max(dot(-V, uSunDir), 0.0), 3.0) * 0.4;
        vec3 body = mix(uDeep, uShallow, clamp(0.5 + g.x * 0.6, 0.0, 1.0)) * (0.6 + 0.4 * max(uSunDir.y, 0.0)) + uShallow * sss;
        vec3 col = mix(body, refl, fres) + spec;
        gl_FragColor = vec4(applyFog(col, vWorldP), 1.0);
      }`,
  }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.set(Math.round(cam.position.x / 100) * 100, f.y, Math.round(cam.position.z / 100) * 100); mesh.updateMatrixWorld(); };
  view.scene.add(mesh);
}

// Particles living in a box that wraps around the camera.
export function particles(view, f) {
  const n = Math.round(f.count * (view.ctx.particleScale ?? 1));
  const R = rng(view.desc.seed ^ 0x51), pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = R.next() * f.box; pos[i * 3 + 1] = R.next() * f.box; pos[i * 3 + 2] = R.next() * f.box; seed[i] = R.next(); }
  const g = view.track(new THREE.BufferGeometry());
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const kind = { dust: 0, spores: 1, snow: 2, motes: 3 }[f.kind] ?? 3;
  const mat = view.track(new THREE.ShaderMaterial({
    uniforms: { ...view.uniforms, uBox: { value: f.box }, uSize: { value: f.size }, uCol: { value: new THREE.Color(...f.color) }, uCol2: { value: new THREE.Color(...(f.color2 || f.color)) }, uSpeed: { value: f.speed }, uWind: { value: new THREE.Vector3(...(f.wind || [0, 0, 0])) }, uGlow: { value: f.glow ?? 0.5 }, uKind: { value: kind }, uPix: { value: 600 } },
    clipping: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `${CLIP_V}
      uniform float uBox, uSize, uSpeed, uTime, uKind, uPix; uniform vec3 uWind; attribute float seed; varying float vSeed; varying vec3 vWorldP; varying float vFade;
      void main() {
        vec3 p = position;
        float t = uTime;
        if (uKind < 0.5) p += uWind * t * uSpeed * (0.6 + seed) + vec3(0.0, sin(t * 2.0 + seed * 40.0) * 0.3, 0.0);
        else if (uKind < 1.5) p += vec3(sin(t * 0.3 + seed * 30.0) * 1.5, t * uSpeed * (0.3 + seed), cos(t * 0.27 + seed * 21.0) * 1.5);
        else if (uKind < 2.5) p += vec3(uWind.x * t * uSpeed + sin(t + seed * 30.0) * 0.4, -t * uSpeed * (0.7 + seed * 0.6), uWind.z * t * uSpeed);
        else p += vec3(sin(t * 0.21 + seed * 30.0), sin(t * 0.17 + seed * 13.0) * 0.6, cos(t * 0.19 + seed * 17.0)) * 2.0 + vec3(0.0, t * uSpeed * 0.2, 0.0);
        vec3 c = cameraPosition;
        p = mod(p - c + uBox * 0.5, uBox) - uBox * 0.5 + c;
        vWorldP = p; vSeed = seed;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        float d = -mvPosition.z;
        vFade = smoothstep(uBox * 0.5, uBox * 0.3, length(p - c)) * smoothstep(0.2, 1.0, d);
        gl_PointSize = clamp(uSize * uPix / max(d, 0.1) * (0.6 + seed * 0.8), 1.0, 48.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `${CLIP_F}\n${FOG_PARS}
      uniform vec3 uCol, uCol2; uniform float uGlow, uKind; varying float vSeed; varying vec3 vWorldP; varying float vFade;
      void main() {
        #include <clipping_planes_fragment>
        vec2 q = gl_PointCoord - 0.5; float r = length(q);
        float a = smoothstep(0.5, 0.0, r);
        a *= a;
        float flick = uKind > 0.5 && uKind < 1.5 ? 0.5 + 0.5 * sin(uTime * (1.0 + vSeed * 3.0) + vSeed * 50.0) : 1.0;
        vec3 col = mix(uCol, uCol2, step(0.5, fract(vSeed * 7.0))) * (uGlow + 0.35) * flick;
        vec3 rd; float fog = fogAmount(cameraPosition, vWorldP, rd);
        gl_FragColor = vec4(col * a * vFade * (1.0 - fog), 1.0);
      }`,
  }));
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.layers.set(LAYER.TRANSPARENT);
  pts.onBeforeRender = (r) => { mat.uniforms.uPix.value = r.getDrawingBufferSize(new THREE.Vector2()).y * 0.9; };
  view.scene.add(pts);
}

function addMesh(view, geo, mat, { shadow = true, layer = LAYER.OPAQUE } = {}) {
  view.track(geo);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = true; m.layers.set(layer);
  view.scene.add(m);
  return m;
}

export function ring(view, f) {
  const g = new THREE.TorusGeometry(f.r, f.tube, 18, 120);
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(f.yaw).setPosition(...f.p));
  addMesh(view, g, view.materialFor(f.mat));
  if (f.glyph) {
    const gl = new THREE.TorusGeometry(f.r - f.tube * 0.95, f.tube * 0.12, 6, 160);
    gl.applyMatrix4(new THREE.Matrix4().makeRotationY(f.yaw).setPosition(...f.p));
    addMesh(view, gl, view.materialFor(f.glyph), { shadow: false });
  }
}

export function stacks(view, f) {
  const R = rng(f.seed ^ 0x5717), list = [];
  for (let k = 0; k < f.n; k++) {
    const a = R.range(0, Math.PI * 2), r = R.range(f.r0, f.r1), h = R.range(80, 320), w = R.range(25, 70);
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(w * (1 - t * 0.55) * (0.85 + 0.3 * Math.sin(t * 9 + k)), t * h - 20)); }
    pts.push(new THREE.Vector2(0.01, h - 20));
    const g = new THREE.LatheGeometry(pts, 9);
    g.translate(Math.sin(a) * r, 0, -Math.cos(a) * r);
    list.push(g);
  }
  for (const g of list) addMesh(view, g, view.materialFor(f.mat), { shadow: false });
}

export function mesas(view, f) {
  const R = rng(f.seed ^ 0x3e5a);
  const base = view.desc.heightAt || (() => 0);
  for (let k = 0; k < f.n; k++) {
    const a = R.range(0, Math.PI * 2), r = R.range(f.r0, f.r1), h = R.range(f.h0, f.h1), w = R.range(80, 260);
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    const pts = [];
    const steps = 2 + R.int(3);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, tier = Math.floor(t * steps) / steps;
      pts.push(new THREE.Vector2(w * (1 - tier * 0.35) * (1 - Math.pow(t, 6) * 0.1), t * h));
    }
    pts.push(new THREE.Vector2(0.01, h));
    const g = new THREE.LatheGeometry(pts, 11);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const px = p.getX(i), pz = p.getZ(i); const k2 = 1 + Math.sin(Math.atan2(pz, px) * 3 + k) * 0.12; p.setX(i, px * k2); p.setZ(i, pz * k2 * R.range(0.95, 1.05)); }
    g.computeVertexNormals();
    g.translate(x, base(x, z) - 8, z);
    addMesh(view, g, view.materialFor(f.mat), { shadow: false });
  }
}

export function floaters(view, f) {
  const R = rng(f.seed ^ 0xf10a);
  const group = new THREE.Group();
  for (let k = 0; k < f.n; k++) {
    const a = R.range(0, Math.PI * 2), r = R.range(f.r0, f.r1), y = f.center[1] + R.range(f.y0, f.y1);
    const g = k % 3 === 0 ? new THREE.BoxGeometry(R.range(2, 7), R.range(2, 5), R.range(2, 7)) : rockGeo(k % 4, 1).scale(R.range(2, 6), R.range(2, 5), R.range(2, 6));
    view.track(g);
    const m = new THREE.Mesh(g, view.materialFor(f.mat));
    m.position.set(f.center[0] + Math.sin(a) * r, y, f.center[2] - Math.cos(a) * r);
    m.rotation.set(R.range(0, 3), R.range(0, 3), R.range(0, 3));
    m.castShadow = true; m.receiveShadow = true;
    const ph = R.range(0, 6.28), sp = R.range(0.05, 0.15), y0 = m.position.y, rs = R.range(-0.04, 0.04);
    view.updaters.push((dt, t) => { m.position.y = y0 + Math.sin(t * sp + ph) * 1.6; m.rotation.y += rs * dt; });
    group.add(m);
  }
  view.scene.add(group);
}

export function pool(view, f) {
  const mat = view.track(new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.03, metalness: 0.0, envMapIntensity: 2.5 }));
  view.patch(mat, 'pool');
  const g = new THREE.CircleGeometry(f.r, 48).rotateX(-Math.PI / 2);
  g.translate(f.p[0], f.p[1] + 0.25, f.p[2]);
  addMesh(view, g, mat, { shadow: false });
}

export function elder(view, f) {
  const t = lumenTreeGeo(7, f.h / 20);
  t.trunk.translate(...f.p); t.caps.translate(...f.p);
  addMesh(view, t.trunk, view.materialFor(f.bark));
  addMesh(view, t.caps, view.materialFor(f.cap, true), { shadow: false });
  const light = new THREE.PointLight(new THREE.Color(...view.desc.materials[f.cap].emissive), 900, 160, 2);
  light.position.set(f.p[0], f.p[1] + f.h * 0.7, f.p[2]); light.layers.set(LAYER.LIGHTS);
  view.scene.add(light);
}

// Sunbeams falling through roof slots: additive volumes along the sun direction.
export function shafts(view, f) {
  const sd = new THREE.Vector3(...view.desc.atmos.sunDir).normalize();
  const len = f.y / Math.max(sd.y, 0.2);
  const mat = view.track(new THREE.ShaderMaterial({
    uniforms: { ...view.uniforms, uLen: { value: len } },
    clipping: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `${CLIP_V}\nvarying vec3 vL; varying vec3 vWorldP; void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vWorldP = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;\n#include <clipping_planes_vertex>\n}`,
    fragmentShader: `${CLIP_F}\n${FOG_PARS}\nuniform float uLen; varying vec3 vL; varying vec3 vWorldP;
      void main() {
        #include <clipping_planes_fragment>
        float t = smoothstep(-0.5, -0.1, vL.y);
        float edge = smoothstep(0.5, 0.15, abs(vL.x)) * smoothstep(0.5, 0.42, abs(vL.z));
        float flick = 0.85 + 0.15 * sin(uTime * 0.7 + vWorldP.z * 0.08);
        vec3 c = uSunColor * 0.022 * edge * t * flick;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  const geo = view.track(new THREE.BoxGeometry(1, 1, 1));
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sd);
  for (const x of f.slots) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(f.width, len, (f.z1 - f.z0) * 0.98);
    m.quaternion.copy(q);
    m.position.set(x - sd.x * len / 2, f.y - sd.y * len / 2, (f.z0 + f.z1) / 2 - sd.z * len / 2);
    m.layers.set(LAYER.TRANSPARENT);
    view.scene.add(m);
  }
}

export const FEATURES = { ocean, particles, ring, stacks, mesas, floaters, pool, elder, shafts };
