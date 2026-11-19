// Per-world atmosphere: sky, height fog with sun inscattering, and the shader
// patch that gives every world material the same fog. Fog is integrated
// analytically along the view ray *from the portal plane the ray entered
// through* (uFogPlane), so a world seen through a doorway is not fogged for
// the stretch of the ray that lies in the viewer's own world; that stretch is
// fogged by the viewer's world when the portal surface is composited.
import * as THREE from 'three';

export const FOG_PARS = /* glsl */`
uniform vec3 uFogColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec4 uFogParams;   // density at base height, height falloff, base height, inscatter strength
uniform vec4 uFogPlane;    // world plane (n, d) the view ray entered through; n = 0 means the eye
uniform float uTime;
float fogAmount(vec3 ro, vec3 wp, out vec3 rd) {
  vec3 dv = wp - ro; float L = length(dv); rd = dv / max(L, 1e-4);
  float t0 = 0.0;
  if (dot(uFogPlane.xyz, uFogPlane.xyz) > 0.5) {
    float dn = dot(uFogPlane.xyz, rd);
    if (abs(dn) > 1e-5) t0 = clamp(-(dot(uFogPlane.xyz, ro) + uFogPlane.w) / dn, 0.0, L);
  }
  float d = L - t0;
  vec3 o = ro + rd * t0;
  float a = uFogParams.x, b = max(uFogParams.y, 1e-5);
  float h0 = clamp(b * (o.y - uFogParams.z), -12.0, 60.0);
  float k = b * rd.y * d;
  float integral = a * exp(-h0) * (abs(k) > 1e-4 ? (1.0 - exp(-k)) / (b * rd.y) : d);
  return 1.0 - exp(-max(integral, 0.0));
}
vec3 fogColorFor(vec3 rd) {
  float s = max(dot(rd, uSunDir), 0.0);
  return uFogColor + uSunColor * (pow(s, 8.0) * uFogParams.w + pow(s, 64.0) * uFogParams.w * 1.5);
}
vec3 applyFog(vec3 col, vec3 wp) {
  vec3 rd; float f = fogAmount(cameraPosition, wp, rd);
  return mix(col, fogColorFor(rd), f);
}
`;

// Uniforms shared by every material of one world (same objects, so updating
// them once updates them everywhere).
export function makeAtmosUniforms(a) {
  return {
    uFogColor: { value: new THREE.Color(...a.fogColor) },
    uSunDir: { value: new THREE.Vector3(...a.sunDir).normalize() },
    uSunColor: { value: new THREE.Color(...a.sunColor) },
    uFogParams: { value: new THREE.Vector4(a.fogDensity, a.fogFalloff, a.fogBase, a.inscatter) },
    uFogPlane: { value: new THREE.Vector4(0, 0, 0, 0) },
    uTime: { value: 0 },
  };
}

// Patch a built-in (Standard/Basic/Lambert) material: world-position varying,
// our fog instead of three's, optional extra chunks. Programs are shared
// between worlds because the code is identical; only uniforms differ.
export function patchMaterial(mat, uniforms, opts = {}) {
  const key = 'thr:' + (opts.key || '');
  mat.fog = false;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, opts.uniforms || {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\n' + (opts.vertexPars || ''))
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 twp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            twp = instanceMatrix * twp;
          #endif
          vWorldP = (modelMatrix * twp).xyz; }
        ${opts.vertexMain || ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\n' + FOG_PARS + (opts.fragmentPars || ''))
      .replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = applyFog(gl_FragColor.rgb, vWorldP);');
    if (opts.fragmentMap) shader.fragmentShader = opts.fragmentMap(shader.fragmentShader);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// ── Sky ────────────────────────────────────────────────────────────────────
// Analytic sky: gradient, sun, up to three moons, stars, aurora ribbons and a
// layer of drifting clouds lit from the sun. The same function shades the
// ocean's reflections.
export const SKY_PARS = /* glsl */`
uniform vec3 uZenith, uHorizon, uGround;
uniform vec4 uSunDisk;           // cos(size), glow, intensity, -
uniform vec4 uMoonDir[3];        // xyz direction, w angular radius (0 = none)
uniform vec3 uMoonCol[3];
uniform vec4 uSkyFx;             // stars, aurora, clouds coverage, cloud height
uniform vec3 uCloudCol;
uniform vec3 uAuroraCol;
uniform vec3 uMoonLight;
uniform vec4 uBeacon;           // xyz direction to the Threshold's beacon, w strength
float skHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float skNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = skHash(vec3(i, 1.7)), b = skHash(vec3(i + vec2(1, 0), 1.7)), c = skHash(vec3(i + vec2(0, 1), 1.7)), d = skHash(vec3(i + vec2(1, 1), 1.7));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float skFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * skNoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
vec3 skyColor(vec3 d, bool withDisc) {
  float y = d.y;
  float hz = pow(1.0 - max(y, 0.0), 4.0);
  vec3 col = mix(uZenith, uHorizon, hz);
  if (y < 0.0) col = mix(uHorizon, uGround, smoothstep(0.0, -0.25, y));
  // stars
  if (uSkyFx.x > 0.0 && y > -0.05) {
    vec3 sd = d * 220.0; vec3 cell = floor(sd); float h = skHash(cell);
    float star = step(0.985, h) * smoothstep(0.55, 0.0, length(fract(sd) - 0.5)) * (0.4 + 0.6 * skHash(cell + 3.1));
    star *= 0.75 + 0.25 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    col += vec3(0.85, 0.9, 1.0) * star * uSkyFx.x * smoothstep(-0.05, 0.25, y);
  }
  // aurora ribbons
  if (uSkyFx.y > 0.0 && y > 0.0) {
    vec2 ap = d.xz / (y + 0.15);
    float band = skFbm(ap * 0.6 + vec2(uTime * 0.01, 0.0));
    float r = smoothstep(0.35, 0.0, abs(sin(ap.x * 0.7 + band * 4.0 + uTime * 0.03) * 0.5 + (ap.y * 0.15) - 0.1));
    col += uAuroraCol * r * smoothstep(0.02, 0.4, y) * uSkyFx.y * (0.5 + band);
  }
  // sun
  float sd = dot(d, uSunDir);
  col += uSunColor * (pow(max(sd, 0.0), 6.0) * uSunDisk.y * 0.35 + pow(max(sd, 0.0), 120.0) * uSunDisk.y);
  if (withDisc) col += uSunColor * smoothstep(uSunDisk.x - 0.00012, uSunDisk.x + 0.00012, sd) * uSunDisk.z;
  // moons
  for (int i = 0; i < 3; i++) {
    float r = uMoonDir[i].w; if (r <= 0.0) continue;
    vec3 md = normalize(uMoonDir[i].xyz); float c = dot(d, md);
    float ang = acos(clamp(c, -1.0, 1.0));
    float disc = smoothstep(r, r * 0.985, ang);
    if (withDisc && disc > 0.0) {
      // a lit sphere: maria, craters and limb darkening, shaded by uMoonLight
      vec3 t = normalize(cross(md, vec3(0.0, 1.0, 0.0) + 1e-4)); vec3 b = cross(t, md);
      vec2 uv = vec2(dot(d - md * c, t), dot(d - md * c, b)) / r;
      float z = sqrt(max(1.0 - dot(uv, uv), 0.0));
      vec3 n = normalize(t * uv.x + b * uv.y - md * z);
      float lit = smoothstep(-0.08, 0.25, dot(n, normalize(uMoonLight)));
      vec2 sp = uv * 2.2 + float(i) * 7.3;
      float maria = smoothstep(0.45, 0.7, skFbm(sp * 0.9));
      float crater = skFbm(sp * 3.5) * 0.5 + skFbm(sp * 9.0) * 0.25;
      float tone = (0.92 - maria * 0.32) * (0.82 + crater * 0.36) * (0.55 + 0.45 * pow(z, 0.5));
      vec3 mc = uMoonCol[i] * tone * (lit * 1.7 + 0.04);
      col = mix(col, mc, disc);
    }
    if (withDisc) col += uMoonCol[i] * smoothstep(r * 3.2, r, ang) * 0.06 * (1.0 - disc);
    col += uMoonCol[i] * pow(max(c, 0.0), 900.0 * (0.02 / max(r, 0.004))) * 0.25;
  }
  // the beacon: a thin pillar of pale light on the horizon, towards the Threshold
  if (uBeacon.w > 0.0) {
    vec2 bd = normalize(uBeacon.xz), dd = normalize(d.xz + 1e-5);
    float ang = acos(clamp(dot(bd, dd), -1.0, 1.0));
    float w = 0.0022 + 0.004 * uBeacon.w;
    float pillar = smoothstep(w, 0.0, ang) * smoothstep(-0.02, 0.05, y) * (1.0 - smoothstep(0.1, 0.9, y));
    col += vec3(1.0, 0.86, 0.62) * pillar * uBeacon.w * 2.2;
  }
  // clouds
  if (uSkyFx.z > 0.0 && y > 0.0) {
    vec2 cp = d.xz / (y + 0.08) * uSkyFx.w + vec2(uTime * 0.004, uTime * 0.002);
    float n = skFbm(cp * 1.4);
    float cov = smoothstep(1.0 - uSkyFx.z, 1.0 - uSkyFx.z + 0.35, n);
    float lightN = skFbm(cp * 1.4 + uSunDir.xz * 0.08);
    float shade = clamp(0.6 + (n - lightN) * 3.0, 0.2, 1.3);
    vec3 cc = uCloudCol * shade + uSunColor * pow(max(sd, 0.0), 4.0) * 0.5 * (1.0 - cov * 0.5);
    col = mix(col, cc, cov * smoothstep(0.0, 0.18, y) * 0.92);
  }
  return col;
}
`;

export function makeSkyUniforms(s) {
  const moons = [0, 1, 2].map((i) => s.moons[i] || null);
  return {
    uZenith: { value: new THREE.Color(...s.zenith) },
    uHorizon: { value: new THREE.Color(...s.horizon) },
    uGround: { value: new THREE.Color(...s.ground) },
    uSunDisk: { value: new THREE.Vector4(Math.cos(s.sunSize), s.sunGlow, s.sunDisc, 0) },
    uMoonDir: { value: moons.map((m) => (m ? new THREE.Vector4(...m.dir, m.size) : new THREE.Vector4(0, 1, 0, 0))) },
    uMoonCol: { value: moons.map((m) => (m ? new THREE.Color(...m.color) : new THREE.Color(0, 0, 0))) },
    uSkyFx: { value: new THREE.Vector4(s.stars, s.aurora, s.clouds, s.cloudScale) },
    uCloudCol: { value: new THREE.Color(...s.cloudColor) },
    uAuroraCol: { value: new THREE.Color(...(s.auroraColor || [0.2, 1, 0.6])) },
    uMoonLight: { value: new THREE.Vector3(...(s.moonLight || [0.6, 0.45, 0.66])).normalize() },
    uBeacon: { value: new THREE.Vector4(...(s.beacon || [0, 0, 1, 0])) },
  };
}

// A full-screen triangle at the far plane that shades the view direction.
export function makeSkyMesh(uniforms) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uInvProj: { value: new THREE.Matrix4() }, uCamRot: { value: new THREE.Matrix3() } },
    vertexShader: /* glsl */`
      varying vec2 vNdc;
      void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: /* glsl */`
      ${FOG_PARS}
      ${SKY_PARS}
      uniform mat4 uInvProj; uniform mat3 uCamRot;
      varying vec2 vNdc;
      void main() {
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0); v.xyz /= v.w;
        vec3 d = normalize(uCamRot * v.xyz);
        vec3 col = skyColor(d, true);
        // haze toward the horizon blends the sky into the world's fog colour
        float hz = exp(-max(d.y, 0.0) * 9.0) * clamp(uFogParams.x * 900.0, 0.0, 1.0);
        col = mix(col, fogColorFor(d), hz * 0.85);
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthWrite: false, depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.onBeforeRender = (r, scene, camera) => {
    mat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    mat.uniforms.uCamRot.value.setFromMatrix4(camera.matrixWorld);
  };
  return mesh;
}
