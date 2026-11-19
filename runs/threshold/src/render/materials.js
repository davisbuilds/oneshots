// Procedural PBR detail: one tileable noise texture (generated once) sampled
// triplanar in world space, shaped per material kind into albedo variation,
// roughness, bump and emission. No UVs or image assets are needed, so every
// generated surface gets consistent, scale-correct detail.
import * as THREE from '../../vendor/three/three.module.js';
import { patchMaterial } from './atmosphere.js';

let NOISE = null;
export function noiseTexture() {
  if (NOISE) return NOISE;
  const N = 256, data = new Uint8Array(N * N * 4);
  const h = (x, y, s) => { let v = Math.imul(x * 374761393 + y * 668265263 + s * 2147483647 | 0, 1274126177); v ^= v >>> 13; v = Math.imul(v, 1103515245); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, y, cell, s) => {
    const n = N / cell, gx = x / cell, gy = y / cell, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const g = (a, b) => h(((a % n) + n) % n, ((b % n) + n) % n, s);
    return (g(ix, iy) * (1 - u) + g(ix + 1, iy) * u) * (1 - v) + (g(ix, iy + 1) * (1 - u) + g(ix + 1, iy + 1) * u) * v;
  };
  const fbm = (x, y, cells, s) => { let t = 0, a = 1, n = 0; for (const c of cells) { t += a * vnoise(x, y, c, s + c); n += a; a *= 0.55; } return t / n; };
  // Worley F1 on a 12x12 tileable grid
  const G = 12, cs = N / G, pts = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push([(i + h(i, j, 7)) * cs, (j + h(i, j, 9)) * cs]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4;
    data[o] = Math.round(255 * fbm(x, y, [64, 32, 16, 8], 1));
    data[o + 1] = Math.round(255 * fbm(x, y, [32, 16, 8, 4], 2));
    const gi = Math.floor(x / cs), gj = Math.floor(y / cs);
    let m = 1e9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = gi + di, jj = gj + dj, p = pts[(((jj % G) + G) % G) * G + (((ii % G) + G) % G)];
      const px = p[0] + Math.floor(ii / G) * N - (((ii % G) + G) % G === ii % G ? 0 : 0), py = p[1] + Math.floor(jj / G) * N;
      m = Math.min(m, Math.hypot(px - x, py - y));
    }
    data[o + 2] = Math.round(255 * Math.min(1, m / (cs * 0.85)));
    data[o + 3] = Math.round(255 * h(x, y, 3));
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  NOISE = t;
  return t;
}

const DETAIL_PARS = /* glsl */`
uniform sampler2D tNoise;
uniform vec3 uDetailGlow;
float dHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec4 tri(vec3 p, vec3 w, float s) {
  return texture2D(tNoise, p.yz * s) * w.x + texture2D(tNoise, p.xz * s) * w.y + texture2D(tNoise, p.xy * s) * w.z;
}
vec3 dAlbedo = vec3(1.0); float dRough = 1.0; float dH = 0.0; float dBump = 0.0; vec3 dEmit = vec3(0.0);
void detailEval(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec4 a = tri(p, w, 0.043), b = tri(p, w, 0.21), c = tri(p, w, 1.1);
#if defined(DETAIL_STONE) || defined(DETAIL_SLABS)
  float m = a.r * 0.55 + b.g * 0.45;
  dAlbedo = vec3(mix(0.74, 1.14, m)) * mix(vec3(1.0), vec3(1.05, 1.0, 0.93), smoothstep(0.3, 0.8, a.g));
  dAlbedo *= mix(0.82, 1.0, smoothstep(0.05, 0.35, b.b));
  dH = b.r * 0.5 + c.g * 0.5; dBump = 0.6;
  dRough = mix(0.85, 1.12, c.r);
  #ifdef DETAIL_SLABS
    bool top = abs(n.y) > 0.6;
    vec2 t2 = normalize(vec2(-n.z, n.x) + 1e-5);
    vec2 sz = top ? vec2(2.4, 2.4) : vec2(1.8, 0.9);
    vec2 q = top ? p.xz / sz : vec2(dot(p.xz, t2), p.y) / sz;
    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    vec2 f = fract(q), id = floor(q);
    float e = min(min(f.x, 1.0 - f.x) * sz.x, min(f.y, 1.0 - f.y) * sz.y);
    float groove = smoothstep(0.004, 0.03, e);
    dAlbedo *= mix(0.84, 1.1, dHash(vec3(id, 3.0))) * mix(0.5, 1.0, groove);
    dH = dH * 0.4 + groove; dBump = 1.0;
    dRough *= mix(1.15, 1.0, groove);
  #endif
#elif defined(DETAIL_SAND)
  float u = dot(p.xz, vec2(0.94, 0.34)) + a.r * 5.0 + b.g * 1.5;
  float rip = sin(u * 8.0) * 0.5 + 0.5;
  float flt = smoothstep(0.55, 0.9, n.y);
  dH = mix(c.r, rip * 0.8 + c.r * 0.2, flt); dBump = 0.55;
  dAlbedo = vec3(mix(0.86, 1.08, a.g * 0.6 + b.r * 0.4)) * mix(1.0, mix(0.93, 1.03, rip), flt);
  dRough = 1.0;
  dEmit = vec3(step(0.996, c.a) * 0.25) * flt;
#elif defined(DETAIL_ROCK)
  float band = sin(p.y * 1.6 + a.r * 6.0 + b.g * 2.0) * 0.5 + 0.5;
  dAlbedo = vec3(mix(0.7, 1.15, band * 0.6 + b.r * 0.4)) * mix(vec3(1.0), vec3(1.08, 0.98, 0.9), a.g);
  dH = band * 0.6 + c.g * 0.4; dBump = 0.9;
  dRough = mix(0.85, 1.1, c.b);
#elif defined(DETAIL_MOSS)
  float m = a.r * 0.5 + b.g * 0.5;
  dAlbedo = vec3(mix(0.6, 1.3, m));
  dH = b.r * 0.5 + c.g * 0.5; dBump = 0.5;
  float g = smoothstep(0.6, 0.78, a.g * 0.55 + b.b * 0.45) * smoothstep(0.3, 0.7, n.y);
  float spots = smoothstep(0.9, 0.97, c.a) * smoothstep(0.4, 0.7, b.g);
  dEmit = uDetailGlow * (g * 0.06 + spots * 0.45) * (0.75 + 0.25 * sin(uTime * 0.6 + a.r * 20.0));
#elif defined(DETAIL_BARK)
  vec4 s = texture2D(tNoise, vec2(atan(n.z, n.x) * 0.9 + p.x * 0.02, p.y * 0.05)) ;
  vec4 s2 = tri(p * vec3(1.0, 0.12, 1.0), w, 0.9);
  dAlbedo = vec3(mix(0.6, 1.25, s2.r * 0.7 + s.g * 0.3));
  dH = s2.r; dBump = 1.2; dRough = 1.0;
  dEmit = uDetailGlow * smoothstep(0.82, 0.95, s2.b * 0.6 + c.a * 0.4) * 0.15;
#elif defined(DETAIL_SNOW)
  dAlbedo = vec3(mix(0.9, 1.04, b.r)) * mix(vec3(0.92, 0.95, 1.0), vec3(1.0), smoothstep(0.2, 0.8, n.y));
  dH = a.r * 0.4 + b.g * 0.4 + c.r * 0.2; dBump = 0.45;
  dRough = mix(0.8, 1.0, c.g);
  dEmit = vec3(step(0.993, c.a) * 0.6 * smoothstep(0.5, 0.9, n.y));
#elif defined(DETAIL_ICE)
  float crack = 1.0 - smoothstep(0.02, 0.07, b.b);
  dAlbedo = vec3(mix(0.85, 1.15, a.r)) * mix(1.0, 0.55, crack);
  dH = a.g * 0.5 + crack * 0.5; dBump = 0.5;
  dRough = mix(0.6, 1.4, crack + c.r * 0.3);
#elif defined(DETAIL_CONCRETE)
  bool top = n.y > 0.7;
  float board = smoothstep(0.0, 0.06, abs(fract(p.y / 0.32) - 0.5) * 2.0 - 0.9) ;
  float streak = texture2D(tNoise, vec2(dot(p.xz, normalize(vec2(-n.z, n.x) + 1e-5)) * 0.35, p.y * 0.012)).r;
  dAlbedo = vec3(mix(0.78, 1.1, b.r * 0.5 + c.g * 0.5)) * mix(0.82, 1.0, streak) * (top ? 1.0 : mix(1.0, 0.85, board));
  dH = c.r * 0.5 + (top ? 0.0 : board * 0.5); dBump = 0.5;
  dRough = mix(0.9, 1.1, c.b);
  #ifdef SNOW_CAP
    float cap = smoothstep(0.55, 0.8, n.y + (a.r - 0.5) * 0.3);
    dAlbedo = mix(dAlbedo, vec3(2.0, 2.05, 2.15), cap); dRough = mix(dRough, 0.85, cap);
  #endif
#endif
}
vec3 bumpNormal(vec3 vpos, vec3 n, float h, float k) {
  vec3 dpx = dFdx(vpos), dpy = dFdy(vpos);
  float dhx = dFdx(h) * k, dhy = dFdy(h) * k;
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 g = (r1 * dhx + r2 * dhy) * sign(det);
  vec3 nn = abs(det) * n - g * 0.06;
  // grazing angles: the surface gradient vanishes; keep the geometric normal
  return (abs(det) > 1e-12 && dot(nn, nn) > 1e-20) ? normalize(nn) : n;
}
`;

export function detailMaterial(spec, uniforms, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...(spec.color || [0.5, 0.5, 0.5])),
    roughness: spec.rough ?? 0.8, metalness: spec.metal ?? 0,
    vertexColors: opts.vertexColors ?? true, envMapIntensity: spec.env ?? opts.env ?? 1,
  });
  if (spec.emissive) { m.emissive = new THREE.Color(...spec.emissive); m.emissiveIntensity = spec.emissiveIntensity ?? 1; }
  if (spec.transparent) { m.transparent = true; m.opacity = spec.opacity ?? 0.5; m.depthWrite = false; }
  if (spec.side === 'double') m.side = THREE.DoubleSide;
  const kind = spec.detail;
  if (!kind) { patchMaterial(m, uniforms, { key: 'plain' + (opts.key || '') , vertexMain: opts.vertexMain, vertexPars: opts.vertexPars }); return m; }
  m.defines = { ['DETAIL_' + kind.toUpperCase()]: '' };
  if (spec.snowCap) m.defines.SNOW_CAP = '';
  const extra = { tNoise: { value: noiseTexture() }, uDetailGlow: { value: new THREE.Color(...(spec.glow || [0, 0, 0])) } };
  patchMaterial(m, uniforms, {
    key: 'det-' + kind + (spec.snowCap ? '-cap' : '') + (opts.key || ''),
    uniforms: extra,
    vertexPars: opts.vertexPars, vertexMain: opts.vertexMain,
    fragmentPars: DETAIL_PARS,
    fragmentMap: (fs) => fs
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gnW = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
        detailEval(vWorldP, gnW);
        diffuseColor.rgb *= dAlbedo;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * dRough, 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = bumpNormal(-vViewPosition, normal, dH, dBump);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += dEmit;'),
  });
  return m;
}
