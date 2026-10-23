// render.js: the paper diorama. Draws the simulation with WebGL2: instanced
// flat-shaded boxes, generated hulls, an analytically painted ground, layered
// cut-paper water, and soft shadows from one warm sun.
'use strict';
(function (TL) {
  const { m4, F, program, Instancer, hex } = TL.GL;
  const L = TL.Layout;
  const WL = TL.SIM.WL;

  const PAL = {
    paper: hex('#f4ead9'), paper2: hex('#e9dcc5'), ink: hex('#28304a'), navy: hex('#2c3a5c'), navy2: hex('#3a4a6e'),
    terracotta: hex('#c65a3e'), mustard: hex('#e2a93f'), teal: hex('#4b8f98'), slate: hex('#5d84a3'), sage: hex('#8fa679'),
    cream: hex('#e6d7bd'), steel: hex('#9aa3b0'), hull: hex('#2c3a5a'), anti: hex('#b4523b'), deck: hex('#cfc3ab'),
    white: hex('#f7f2ea'), glass: hex('#33445f'), rubber: hex('#2a2b30'), tree: hex('#8fa679'), tree2: hex('#6f8e63'), trunk: hex('#8a6a4f'),
    concrete: hex('#ddd0b9'), orange: hex('#e08a3a'), red: hex('#c65a3e'),
  };
  // Container colours by owner (index in stowage.js LINES.color).
  const BOXCOL = [hex('#c65a3e'), hex('#e2a93f'), hex('#4b8f98'), hex('#5d84a3'), hex('#e3d4b8'), hex('#8fa679'), hex('#9aa3b0')];

  // ── Shaders ────────────────────────────────────────────────────────────
  const COMMON = `
precision highp float;
precision highp sampler2DShadow;
uniform vec3 u_sun; uniform vec3 u_sunCol; uniform vec3 u_sky; uniform vec3 u_gnd;
uniform sampler2DShadow u_shadow; uniform mat4 u_lvp; uniform float u_texel;
uniform float u_time; uniform vec3 u_eye;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*noise(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float shadowAt(vec3 wp, vec3 n){
  vec4 lp = u_lvp * vec4(wp + n * 0.18, 1.0);
  vec3 c = lp.xyz / lp.w * 0.5 + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
    s += texture(u_shadow, vec3(c.xy + vec2(float(i), float(j)) * u_texel * 1.25, c.z - 0.0008));
  return s / 9.0;
}
vec3 light(vec3 base, vec3 n, vec3 wp){
  float ndl = max(dot(n, u_sun), 0.0);
  float sh = shadowAt(wp, n);
  vec3 amb = mix(u_gnd, u_sky, n.z * 0.5 + 0.5);
  // Shadows are warm and never black: the paper still shows.
  return base * (amb + u_sunCol * ndl * sh);
}
float grain(vec3 wp){ return (noise(wp.xy * 3.1 + wp.z * 1.7) - 0.5) * 0.035 + (noise(wp.xy * 0.37) - 0.5) * 0.03; }
`;

  const VS_INST = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm;
layout(location=2) in vec4 a_r0; layout(location=3) in vec4 a_r1; layout(location=4) in vec4 a_r2; layout(location=5) in vec4 a_col;
uniform mat4 u_vp;
out vec3 v_wp; out vec3 v_n; out vec3 v_col; flat out float v_mat; out vec3 v_loc; flat out vec3 v_scale; flat out vec3 v_ln;
void main(){
  mat3 R = mat3(a_r0.x, a_r1.x, a_r2.x, a_r0.y, a_r1.y, a_r2.y, a_r0.z, a_r1.z, a_r2.z);
  vec3 T = vec3(a_r0.w, a_r1.w, a_r2.w);
  vec3 wp = R * a_pos + T;
  vec3 s = vec3(length(R[0]), length(R[1]), length(R[2]));
  v_n = normalize(R * (a_nrm / max(s * s, vec3(1e-6))));
  v_wp = wp; v_col = a_col.rgb; v_mat = a_col.a; v_loc = a_pos; v_scale = s; v_ln = a_nrm;
  gl_Position = u_vp * vec4(wp, 1.0);
}`;

  const FS_INST = `#version 300 es
${COMMON}
in vec3 v_wp; in vec3 v_n; in vec3 v_col; flat in float v_mat; in vec3 v_loc; flat in vec3 v_scale; flat in vec3 v_ln;
out vec4 o;
void main(){
  vec3 n = normalize(v_n);
  vec3 base = v_col;
  int mat = int(v_mat + 0.5);
  // Distance (m) to the nearest edge of this face, for cut-paper edges.
  vec3 al = abs(v_ln);
  vec2 uv; vec2 sz;
  if (al.x > 0.5) { uv = v_loc.yz; sz = v_scale.yz; }
  else if (al.y > 0.5) { uv = v_loc.xz; sz = v_scale.xz; }
  else { uv = v_loc.xy; sz = v_scale.xy; }
  vec2 de = (0.5 - abs(uv)) * sz;
  float edge = min(de.x, de.y);
  float px = fwidth(edge) * 1.2 + 1e-4;
  if (mat == 1) {
    // Container: corrugated long sides, a door end, darker corner posts.
    float L = v_scale.x;
    if (al.y > 0.5) {
      float r = fract(v_loc.x * L / 0.32);
      base *= 0.93 + 0.09 * smoothstep(0.15, 0.5, abs(r - 0.5) * 2.0);
      float rail = step(0.5 - 0.16 / v_scale.z, abs(v_loc.z));
      base *= 1.0 - 0.10 * rail;
    } else if (al.x > 0.5) {
      if (v_ln.x > 0.0) {
        float bars = step(0.46, fract((v_loc.y + 0.5) * 4.0)) * step(abs(v_loc.z), 0.44);
        base *= 0.86 - 0.10 * bars;
      } else base *= 0.95;
    } else if (v_ln.z > 0.0) {
      float r = fract(v_loc.x * L / 0.6);
      base *= 1.0 + 0.035 * step(0.5, r);
    }
    float corner = step(0.5 - 0.15 / L, abs(v_loc.x)) * step(0.5 - 0.15 / v_scale.y, abs(v_loc.y));
    base *= 1.0 - 0.18 * corner;
  } else if (mat == 2) {
    // Accommodation: rows of windows on the walls.
    if (al.z < 0.5) {
      vec2 w = vec2((al.x > 0.5 ? v_loc.y * v_scale.y : v_loc.x * v_scale.x), v_loc.z * v_scale.z + v_scale.z * 0.5);
      float fx = fract(w.x / 2.1), fz = fract(w.y / 2.8);
      float win = step(0.25, fx) * step(fx, 0.75) * step(0.42, fz) * step(fz, 0.78) * step(1.0, w.y);
      base = mix(base, vec3(0.20, 0.26, 0.37), win * 0.9);
    }
  } else if (mat == 3) {
    // Box girder with truss bracing painted on its sides.
    if (al.z < 0.5) {
      float a = (al.x > 0.5 ? v_loc.y * v_scale.y : v_loc.x * v_scale.x);
      float h = v_scale.z;
      float d = abs(fract((a + (v_loc.z + 0.5) * h) / (2.0 * h)) - 0.5);
      float d2 = abs(fract((a - (v_loc.z + 0.5) * h) / (2.0 * h)) - 0.5);
      float line = 1.0 - smoothstep(0.03, 0.06, min(d, d2));
      base *= 1.0 - 0.28 * line;
      float bord = 1.0 - smoothstep(0.08, 0.14, min(0.5 - abs(v_loc.z), 1.0));
      base *= 1.0 - 0.15 * bord;
    }
  } else if (mat == 5) {
    if (al.z < 0.5) base = mix(base, vec3(0.22, 0.29, 0.40), step(0.0, v_loc.z) * 0.85);
  } else if (mat == 6) {
    base *= 0.9 + 0.2 * noise(v_wp.xy * 0.8 + v_wp.z);
  } else if (mat == 7) {
    // Hatch cover panels.
    if (v_ln.z > 0.5) base *= 0.96 + 0.05 * step(0.5, fract(v_loc.x * v_scale.x / 3.0));
  } else if (mat == 8) {
    // Unlit (lamps, highlights).
    o = vec4(base, 1.0); return;
  }
  vec3 c = light(base, n, v_wp);
  // Cut-paper edges: a crisp light rim on tops, a soft dark rim on walls.
  float rim = 1.0 - smoothstep(0.0, px, edge - px * 0.2);
  if (n.z > 0.6) c = mix(c, c * 1.16 + 0.03, rim * 0.85);
  else c = mix(c, c * 0.84, rim * 0.6);
  c *= 1.0 + grain(v_wp);
  o = vec4(c, 1.0);
}`;

  // Hull: a generated mesh with baked colours.
  const VS_HULL = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec3 a_nrm; layout(location=2) in vec3 a_col;
uniform mat4 u_vp; uniform mat4 u_model;
out vec3 v_wp; out vec3 v_n; out vec3 v_col; out vec3 v_lp;
void main(){
  vec4 wp = u_model * vec4(a_pos, 1.0);
  v_wp = wp.xyz; v_n = normalize(mat3(u_model) * a_nrm); v_col = a_col; v_lp = a_pos;
  gl_Position = u_vp * wp;
}`;
  const FS_HULL = `#version 300 es
${COMMON}
in vec3 v_wp; in vec3 v_n; in vec3 v_col; in vec3 v_lp;
uniform float u_wl;
out vec4 o;
void main(){
  vec3 n = normalize(v_n);
  if (!gl_FrontFacing) n = -n;
  vec3 c = light(v_col, n, v_wp);
  c *= 1.0 + grain(v_wp) * 0.8;
  // Wet line where the water meets the hull.
  float d = abs(v_wp.z - u_wl);
  c = mix(c, c * 0.72, (1.0 - smoothstep(0.0, 0.5, d)) * 0.5);
  o = vec4(c, 1.0);
}`;

  // Ground: one big plane, its markings painted analytically.
  const VS_PLANE = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_vp; uniform vec4 u_rect; uniform float u_z;
out vec3 v_wp;
void main(){
  vec3 wp = vec3(mix(u_rect.x, u_rect.z, a_pos.x), mix(u_rect.y, u_rect.w, a_pos.y), u_z);
  v_wp = wp; gl_Position = u_vp * vec4(wp, 1.0);
}`;
  const FS_GROUND = `#version 300 es
${COMMON}
in vec3 v_wp;
uniform vec4 u_blocks[14];
uniform vec4 u_bays[17];
out vec4 o;
float lineAt(float v, float at, float w){ float d = abs(v - at); float aa = fwidth(v); return 1.0 - smoothstep(w*0.5, w*0.5 + aa, d); }
float grid(float v, float pitch, float w){ float d = abs(fract(v / pitch + 0.5) - 0.5) * pitch; float aa = fwidth(v); return 1.0 - smoothstep(w*0.5, w*0.5+aa, d); }
float dash(float v, float on, float off){ return step(fract(v / (on + off)), on / (on + off)); }
void main(){
  vec2 p = v_wp.xy;
  vec3 base = vec3(0.957, 0.918, 0.851);
  vec3 asph = vec3(0.905, 0.868, 0.800);
  vec3 lane = vec3(0.985, 0.975, 0.95);
  vec3 yel = vec3(0.886, 0.663, 0.247);
  vec3 c = base;
  bool inTerm = p.x > -8.0 && p.x < 975.0 && p.y < 455.0;
  if (!inTerm) {
    c = mix(vec3(0.905, 0.900, 0.800), vec3(0.87, 0.88, 0.77), fbm(p * 0.02));
  } else {
    // Apron, rails and crane lanes.
    if (p.y < 52.0) {
      c = vec3(0.945, 0.905, 0.835);
      c = mix(c, vec3(0.975, 0.955, 0.92), step(p.y, 1.3));
      c = mix(c, yel, lineAt(p.y, 1.75, 0.22));
      for (int k = 0; k < 2; k++) { float ry = k == 0 ? 3.0 : 35.0;
        c = mix(c, vec3(0.42, 0.43, 0.47), lineAt(p.y, ry - 0.55, 0.16) + lineAt(p.y, ry + 0.55, 0.16));
        c = mix(c, vec3(0.80, 0.77, 0.70), lineAt(p.y, ry, 0.9) * 0.4); }
      for (int k = 1; k <= 8; k++) { if (k == 5 || k == 6) continue; float ly = float(k) * 6.5;
        c = mix(c, lane, lineAt(p.y, ly, 0.14) * dash(p.x, 3.0, 3.0) * 0.9); }
      c = mix(c, yel, lineAt(p.y, 39.0, 0.18) * 0.9);
      c = mix(c, yel, lineAt(p.y, 52.0, 0.25));
    } else if (p.y < 371.0) {
      c = asph;
      for (int b = 0; b < 14; b++) {
        vec4 r = u_blocks[b];
        if (p.x > r.x && p.x < r.z && p.y > r.y && p.y < r.w) {
          c = vec3(0.885, 0.845, 0.775);
          float gx = grid(p.x - r.x, 6.5, 0.10), gy = grid(p.y - r.y - 6.5, 13.0, 0.10);
          c = mix(c, lane, max(gx * 0.55, gy * 0.35));
        }
        float bx = max(lineAt(p.x, r.x, 0.25), lineAt(p.x, r.z, 0.25)) * step(r.y, p.y) * step(p.y, r.w);
        float by = max(lineAt(p.y, r.y, 0.25), lineAt(p.y, r.w, 0.25)) * step(r.x, p.x) * step(p.x, r.z);
        c = mix(c, yel, max(bx, by) * 0.85);
      }
      // Aisle centrelines.
      c = mix(c, yel, (lineAt(p.y, 201.5, 0.14) + lineAt(p.y, 357.5, 0.14)) * dash(p.x, 5.0, 4.0) * 0.8);
    } else {
      // Transfer zone, roads, gate.
      c = vec3(0.93, 0.89, 0.82);
      if (p.y > 393.0 && p.y < 423.0 && p.x > 410.0) c = vec3(0.86, 0.835, 0.79);
      for (int b = 0; b < 17; b++) {
        vec4 r = u_bays[b];
        float lx = max(lineAt(p.x, r.x - 3.0, 0.14), lineAt(p.x, r.x + 3.0, 0.14)) * step(372.0, p.y) * step(p.y, 392.0);
        c = mix(c, lane, lx);
      }
      c = mix(c, lane, lineAt(p.y, 409.5, 0.15) * dash(p.x, 4.0, 4.0) * step(410.0, p.x));
      c = mix(c, yel, (lineAt(p.y, 393.2, 0.2) + lineAt(p.y, 422.8, 0.2)) * step(410.0, p.x));
      // Zebra by the gate.
      float z = step(0.5, fract(p.y / 1.6)) * step(abs(p.x - 870.0), 3.0) * step(394.0, p.y) * step(p.y, 422.0);
      c = mix(c, lane, z * 0.8);
    }
    // Terminal fence line.
    c = mix(c, vec3(0.6, 0.6, 0.62), lineAt(p.y, 455.0, 0.3) * step(p.x, 975.0) + lineAt(p.x, 975.0, 0.3) * step(p.y, 455.0));
  }
  vec3 n = vec3(0.0, 0.0, 1.0);
  vec3 col = light(c, n, v_wp);
  col *= 1.0 + grain(v_wp) * 1.4;
  o = vec4(col, 1.0);
}`;

  // Water: layered cut paper. Each layer is a threshold of slow, stretched
  // noise; the layer above casts a small shadow and shows a light cut edge.
  const FS_WATER = `#version 300 es
${COMMON}
in vec3 v_wp;
uniform vec4 u_ships[6];   // centre x, y, half length, half beam
uniform float u_shipYaw[6];
out vec4 o;
float field(vec2 p){
  vec2 q = vec2(p.x * 0.0045 + p.y * 0.0012, p.y * 0.022);
  float t = u_time * 0.006;
  return fbm(q + vec2(t, t * 0.3)) + 0.5 * fbm(q * 2.3 - vec2(t * 0.7, 0.0)) * 0.6;
}
float shipDist(vec2 p){
  float d = 1e9;
  for (int i = 0; i < 6; i++){
    vec4 s = u_ships[i]; if (s.z <= 0.0) continue;
    float a = u_shipYaw[i]; vec2 r = p - s.xy; r = vec2(r.x * cos(a) + r.y * sin(a), -r.x * sin(a) + r.y * cos(a));
    vec2 q = abs(r) - s.zw; d = min(d, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
  }
  return d;
}
void main(){
  vec2 p = v_wp.xy;
  // Depth: deeper (darker) away from the quay.
  float far = smoothstep(-40.0, -420.0, p.y);
  float f = field(p) + far * 0.22 - (1.0 - far) * 0.05;
  vec2 off = normalize(-u_sun.xy) * 2.2;
  float fs = field(p + off) + far * 0.22;
  vec3 c0 = vec3(0.235, 0.47, 0.53), c1 = vec3(0.19, 0.36, 0.47), c2 = vec3(0.145, 0.25, 0.39), c3 = vec3(0.12, 0.20, 0.33);
  float t1 = 0.50, t2 = 0.62, t3 = 0.74;
  float aa = fwidth(f) * 1.2;
  vec3 c = mix(c0, c1, smoothstep(t1 - aa, t1 + aa, f));
  c = mix(c, c2, smoothstep(t2 - aa, t2 + aa, f));
  c = mix(c, c3, smoothstep(t3 - aa, t3 + aa, f));
  // The higher (lighter) layer shadows the one below it.
  float sh = 0.0;
  sh += step(f, t1) * smoothstep(t1 - aa, t1 + aa, fs) * 0.0;
  sh += step(t1, f) * step(fs, t1) * 0.0;
  float edgeL = 0.0;
  for (int k = 0; k < 3; k++){
    float t = k == 0 ? t1 : (k == 1 ? t2 : t3);
    // Lower layer (f > t) near a cut where the layer above (f < t) overhangs.
    sh += step(t, f) * step(fs, t) * 0.16;
    edgeL += (1.0 - smoothstep(0.0, aa * 1.5, abs(f - t))) * step(f, t);
  }
  c *= 1.0 - sh;
  c = mix(c, c * 1.25 + 0.04, clamp(edgeL, 0.0, 1.0) * 0.45);
  // Foam strips: torn paper along the quay wall and around hulls.
  float q = -p.y;
  float foamN = fbm(vec2(p.x * 0.05, p.y * 0.2) + u_time * 0.01);
  float quayFoam = smoothstep(4.0 + foamN * 6.0, 0.5, q);
  float sd = shipDist(p);
  float hullFoam = smoothstep(3.0 + foamN * 5.0, 0.3, sd) * step(-0.5, sd);
  float foam = max(quayFoam * 0.9, hullFoam * 0.8);
  c = mix(c, vec3(0.62, 0.80, 0.80), foam * 0.75);
  // Long thin highlight cuts.
  float streak = smoothstep(0.035, 0.0, abs(fbm(vec2(p.x * 0.006, p.y * 0.05) + 3.0) - 0.55)) * (0.4 + far * 0.6);
  c = mix(c, vec3(0.55, 0.76, 0.78), streak * 0.5);
  vec3 col = light(c, vec3(0.0, 0.0, 1.0), v_wp) * 0.92;
  col *= 1.0 + grain(v_wp) * 0.9;
  o = vec4(col, 1.0);
}`;

  const VS_DEPTH = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=2) in vec4 a_r0; layout(location=3) in vec4 a_r1; layout(location=4) in vec4 a_r2;
uniform mat4 u_vp;
void main(){
  mat3 R = mat3(a_r0.x, a_r1.x, a_r2.x, a_r0.y, a_r1.y, a_r2.y, a_r0.z, a_r1.z, a_r2.z);
  gl_Position = u_vp * vec4(R * a_pos + vec3(a_r0.w, a_r1.w, a_r2.w), 1.0);
}`;
  const VS_DEPTH_HULL = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_vp; uniform mat4 u_model;
void main(){ gl_Position = u_vp * u_model * vec4(a_pos, 1.0); }`;
  const FS_DEPTH = `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(1.0); }`;

  // Decals: text and signs painted on a canvas, laid flat or upright.
  const VS_DECAL = `#version 300 es
layout(location=0) in vec3 a_pos; layout(location=1) in vec2 a_uv; layout(location=2) in float a_a;
uniform mat4 u_vp;
out vec2 v_uv; out float v_a; out vec3 v_wp;
void main(){ v_uv = a_uv; v_a = a_a; v_wp = a_pos; gl_Position = u_vp * vec4(a_pos, 1.0); }`;
  const FS_DECAL = `#version 300 es
${COMMON}
in vec2 v_uv; in float v_a; in vec3 v_wp;
uniform sampler2D u_tex;
out vec4 o;
void main(){
  vec4 t = texture(u_tex, v_uv);
  if (t.a * v_a < 0.02) discard;
  vec3 c = light(t.rgb, vec3(0.0, 0.0, 1.0), v_wp);
  o = vec4(c, t.a * v_a);
}`;

  // ── Hull mesh from the hull form ───────────────────────────────────────
  function hullMesh(gl, vessel) {
    const h = vessel.hull, c = vessel.c;
    const nx = 64, nz = 18;
    const xs = [], zs = [];
    for (let i = 0; i <= nx; i++) xs.push(h.xAft + (h.xFwd - h.xAft) * i / nx);
    for (let k = 0; k <= nz; k++) { const u = k / nz; zs.push(h.D * (u < 0.5 ? 0.9 * u * u * 2 : 0.45 + (u - 0.5) * 1.1)); }
    zs[zs.length - 1] = h.D;
    const P = [], N = [], C = [];
    const anti = PAL.anti, top = PAL.hull, boot = c.T + 0.6, deckC = PAL.deck;
    const tri = (a, b, cc, col) => {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
      for (const p of [a, b, cc]) { P.push(...p); N.push(...n); C.push(...(col || (p[2] < boot ? anti : top))); }
    };
    const y = (x, z) => h.halfBreadth(x, z);
    // Sides (both), as quads between stations and waterlines.
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const x0 = xs[i], x1 = xs[i + 1], z0 = zs[k], z1 = zs[k + 1];
      const a = [x0, y(x0, z0), z0], b = [x1, y(x1, z0), z0], cc = [x1, y(x1, z1), z1], d = [x0, y(x0, z1), z1];
      const zm = (z0 + z1) / 2, col = zm < boot ? anti : top;
      if (a[1] + b[1] + cc[1] + d[1] < 1e-6) continue;
      tri(a, b, cc, col); tri(a, cc, d, col);
      const m = (p) => [p[0], -p[1], p[2]];
      tri(m(a), m(cc), m(b), col); tri(m(a), m(d), m(cc), col);
    }
    // Bottom: close each section at its lowest wet waterline.
    for (let i = 0; i < nx; i++) {
      const x0 = xs[i], x1 = xs[i + 1];
      let k0 = 0; while (k0 < nz && y(x0, zs[k0]) <= 0) k0++;
      let k1 = 0; while (k1 < nz && y(x1, zs[k1]) <= 0) k1++;
      const z0 = zs[Math.min(k0, nz)], z1 = zs[Math.min(k1, nz)];
      const a = [x0, y(x0, z0), z0], b = [x1, y(x1, z1), z1];
      tri(a, [x0, -a[1], z0], [x1, -b[1], z1], anti); tri(a, [x1, -b[1], z1], b, anti);
    }
    // Deck.
    for (let i = 0; i < nx; i++) {
      const x0 = xs[i], x1 = xs[i + 1], a = y(x0, h.D), b = y(x1, h.D);
      tri([x0, -a, h.D], [x1, -b, h.D], [x1, b, h.D], deckC); tri([x0, -a, h.D], [x1, b, h.D], [x0, a, h.D], deckC);
    }
    // Transom.
    for (let k = 0; k < nz; k++) {
      const z0 = zs[k], z1 = zs[k + 1], x = xs[0] + 0.01;
      const a = y(x, z0), b = y(x, z1);
      if (a + b < 1e-6) continue;
      tri([x, -a, z0], [x, a, z0], [x, b, z1], top); tri([x, -a, z0], [x, b, z1], [x, -b, z1], top);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = (arr, loc, n) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0); };
    buf(P, 0, 3); buf(N, 1, 3); buf(C, 2, 3);
    gl.bindVertexArray(null);
    return { vao, n: P.length / 3 };
  }

  // ── The renderer ───────────────────────────────────────────────────────
  class Renderer {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true, alpha: false });
      if (!gl) throw new Error('WebGL2 is not available');
      this.gl = gl; this.canvas = canvas;
      this.progInst = program(gl, VS_INST, FS_INST);
      this.progHull = program(gl, VS_HULL, FS_HULL);
      this.progGround = program(gl, VS_PLANE, FS_GROUND);
      this.progWater = program(gl, VS_PLANE, FS_WATER);
      this.progDepth = program(gl, VS_DEPTH, FS_DEPTH);
      this.progDepthHull = program(gl, VS_DEPTH_HULL, FS_DEPTH);
      this.progDecal = program(gl, VS_DECAL, FS_DECAL);
      this.box = new Instancer(gl, TL.GL.boxMesh());
      this.prism = new Instancer(gl, TL.GL.prismMesh());
      this.cyl = new Instancer(gl, TL.GL.cylMesh(10));
      this.ball = new Instancer(gl, TL.GL.ballMesh());
      this.sBox = new Instancer(gl, TL.GL.boxMesh());      // static scenery
      this.sCyl = new Instancer(gl, TL.GL.cylMesh(10));
      this.sBall = new Instancer(gl, TL.GL.ballMesh());
      this.sPrism = new Instancer(gl, TL.GL.prismMesh());
      this.all = [this.box, this.prism, this.cyl, this.ball, this.sBox, this.sCyl, this.sBall, this.sPrism];
      // Unit quad for planes.
      this.quad = gl.createVertexArray();
      gl.bindVertexArray(this.quad);
      const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      // Shadow map.
      const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      this.shadowSize = Math.min(4096, max);
      this.shadowTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.shadowFb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.hulls = new Map();
      // Camera: target on the ground, zoom in metres per CSS pixel.
      this.cam = { x: 190, y: 45, zoom: 0.25, az: -Math.PI / 4, el: 0.62, shiftX: 0, shiftY: 0 };
      this.sun = this._norm([-0.62, -0.30, 0.72]);
      this.decals = null;
      this.staticBuilt = false;
    }
    _norm(v) { const l = Math.hypot(...v); return v.map(x => x / l); }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      this.dpr = dpr;
    }

    // View-projection for the current camera.
    matrices() {
      const c = this.cam, W = this.canvas.clientWidth, H = this.canvas.clientHeight;
      const dir = [Math.cos(c.el) * Math.cos(c.az), Math.cos(c.el) * Math.sin(c.az), Math.sin(c.el)];
      const D = 1500;
      const eye = [c.x + dir[0] * D, c.y + dir[1] * D, dir[2] * D];
      const view = m4.lookAt(eye, [c.x, c.y, 0], [0, 0, 1]);
      const hw = W * c.zoom / 2, hh = H * c.zoom / 2;
      const sx = c.shiftX * c.zoom, sy = c.shiftY * c.zoom;
      const proj = m4.ortho(-hw - sx, hw - sx, -hh - sy, hh - sy, 10, 4000);
      this.view = view; this.proj = proj; this.vp = m4.mul(proj, view); this.eye = eye; this.dir = dir;
      this.ivp = m4.invert(this.vp);
      return this.vp;
    }
    // World point to CSS pixels.
    project(x, y, z) {
      const p = m4.xform(this.vp, x, y, z);
      return [(p[0] * 0.5 + 0.5) * this.canvas.clientWidth, (0.5 - p[1] * 0.5) * this.canvas.clientHeight, p[2]];
    }
    // CSS pixel to a ray (origin, direction) in world space.
    ray(px, py) {
      const nx = px / this.canvas.clientWidth * 2 - 1, ny = 1 - py / this.canvas.clientHeight * 2;
      const a = m4.xform(this.ivp, nx, ny, -1), b = m4.xform(this.ivp, nx, ny, 1);
      const d = this._norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      return { o: a, d };
    }
    groundAt(px, py, z = 0) {
      const r = this.ray(px, py);
      const t = (z - r.o[2]) / r.d[2];
      return [r.o[0] + r.d[0] * t, r.o[1] + r.d[1] * t];
    }

    // Light-space matrix covering what the camera sees.
    _lightVP() {
      const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
      const pts = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => this.groundAt(x, y, 0));
      let cx = 0, cy = 0; for (const p of pts) { cx += p[0] / 4; cy += p[1] / 4; }
      let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p[0] - cx, p[1] - cy));
      r = Math.min(r + 60, 1400);
      const s = this.sun, D = 900;
      const view = m4.lookAt([cx + s[0] * D, cy + s[1] * D, s[2] * D], [cx, cy, 0], [0, 0, 1]);
      // Snap to texels so shadows do not shimmer while panning.
      const texel = 2 * r / this.shadowSize;
      const o = m4.xform(view, cx, cy, 0);
      const ox = Math.round(o[0] / texel) * texel - o[0], oy = Math.round(o[1] / texel) * texel - o[1];
      const proj = m4.ortho(-r + ox, r + ox, -r + oy, r + oy, 100, 2400);
      this.shadowTexel = 1 / this.shadowSize;
      return m4.mul(proj, view);
    }

    hullFor(vessel) {
      let h = this.hulls.get(vessel.cls);
      if (!h) { h = hullMesh(this.gl, vessel); this.hulls.set(vessel.cls, h); }
      return h;
    }

    _uniformsCommon(p, t) {
      const gl = this.gl;
      gl.uniform3fv(p.u.u_sun, this.sun);
      gl.uniform3fv(p.u.u_sunCol, [0.66, 0.60, 0.50]);
      gl.uniform3fv(p.u.u_sky, [0.56, 0.57, 0.61]);
      gl.uniform3fv(p.u.u_gnd, [0.47, 0.44, 0.42]);
      gl.uniformMatrix4fv(p.u.u_lvp, false, this.lvp);
      gl.uniform1f(p.u.u_texel, this.shadowTexel);
      gl.uniform1f(p.u.u_time, t);
      gl.uniform3fv(p.u.u_eye, this.eye);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      gl.uniform1i(p.u.u_shadow, 0);
    }

    // Draw a frame. scene: { ships: [{ vessel, matrix(Float32Array 16) }], decals, waterShips }
    draw(scene, t) {
      const gl = this.gl;
      this.resize();
      this.matrices();
      this.lvp = this._lightVP();
      for (const ins of this.all) if (ins.dirty !== false) ins.upload();
      // Shadow pass.
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFb);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.colorMask(false, false, false, false);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3.0);
      gl.useProgram(this.progDepth.p);
      gl.uniformMatrix4fv(this.progDepth.u.u_vp, false, this.lvp);
      for (const ins of this.all) ins.draw();
      gl.useProgram(this.progDepthHull.p);
      gl.uniformMatrix4fv(this.progDepthHull.u.u_vp, false, this.lvp);
      for (const s of scene.ships) {
        const h = this.hullFor(s.vessel);
        gl.uniformMatrix4fv(this.progDepthHull.u.u_model, false, s.matrix);
        gl.bindVertexArray(h.vao); gl.drawArrays(gl.TRIANGLES, 0, h.n);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.colorMask(true, true, true, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // Main pass.
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0.957, 0.918, 0.851, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // Water.
      let p = this.progWater;
      gl.useProgram(p.p); this._uniformsCommon(p, t);
      gl.uniformMatrix4fv(p.u.u_vp, false, this.vp);
      gl.uniform4fv(p.u.u_rect, [-3000, -3000, 4000, 0]);
      gl.uniform1f(p.u.u_z, WL);
      const ws = new Float32Array(24), wy = new Float32Array(6);
      (scene.waterShips || []).slice(0, 6).forEach((s, i) => { ws.set([s.x, s.y, s.hl, s.hw], i * 4); wy[i] = s.yaw; });
      gl.uniform4fv(p.u.u_ships, ws); gl.uniform1fv(p.u.u_shipYaw, wy);
      gl.bindVertexArray(this.quad); gl.drawArrays(gl.TRIANGLES, 0, 6);
      // Ground.
      p = this.progGround;
      gl.useProgram(p.p); this._uniformsCommon(p, t);
      gl.uniformMatrix4fv(p.u.u_vp, false, this.vp);
      gl.uniform4fv(p.u.u_rect, [-3000, 0, 4000, 3000]);
      gl.uniform1f(p.u.u_z, 0);
      const bl = new Float32Array(56);
      L.BLOCKS.forEach((B, i) => bl.set([B.x0, B.y0, B.x1, B.y1], i * 4));
      gl.uniform4fv(p.u.u_blocks, bl);
      const bays = new Float32Array(68);
      L.BAYS.forEach((B, i) => bays.set([B.x, B.yBox, 0, 0], i * 4));
      gl.uniform4fv(p.u.u_bays, bays);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      // Hulls.
      p = this.progHull;
      gl.useProgram(p.p); this._uniformsCommon(p, t);
      gl.uniformMatrix4fv(p.u.u_vp, false, this.vp);
      gl.uniform1f(p.u.u_wl, WL);
      for (const s of scene.ships) {
        const h = this.hullFor(s.vessel);
        gl.uniformMatrix4fv(p.u.u_model, false, s.matrix);
        gl.bindVertexArray(h.vao); gl.drawArrays(gl.TRIANGLES, 0, h.n);
      }
      // Instances.
      p = this.progInst;
      gl.useProgram(p.p); this._uniformsCommon(p, t);
      gl.uniformMatrix4fv(p.u.u_vp, false, this.vp);
      for (const ins of this.all) ins.draw();
      // Decals.
      if (scene.decals) this._drawDecals(scene.decals, t);
      gl.bindVertexArray(null);
    }

    _drawDecals(d, t) {
      const gl = this.gl;
      if (!d.vao) {
        d.vao = gl.createVertexArray();
        gl.bindVertexArray(d.vao);
        d.buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, d.buf);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20);
        d.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, d.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, d.canvas);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      }
      gl.bindVertexArray(d.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, d.buf);
      gl.bufferData(gl.ARRAY_BUFFER, d.verts.subarray(0, d.count * 6), gl.DYNAMIC_DRAW);
      const p = this.progDecal;
      gl.useProgram(p.p); this._uniformsCommon(p, t);
      gl.uniformMatrix4fv(p.u.u_vp, false, this.vp);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, d.tex);
      gl.uniform1i(p.u.u_tex, 1);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -4);
      gl.drawArrays(gl.TRIANGLES, 0, d.count);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }

  TL.Renderer = Renderer;
  TL.PAL = PAL;
  TL.BOXCOL = BOXCOL;
})(globalThis.TL = globalThis.TL || {});
