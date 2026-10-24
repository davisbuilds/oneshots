// gl.js: a small WebGL2 toolkit: matrices, shaders, meshes and an instancer.
// Everything in the scene is drawn as instances of four tiny meshes (a box,
// a prism, a cylinder and a low-poly ball) or as a generated hull.
'use strict';
(function (TL) {
  // ── 4x4 matrices, column-major ─────────────────────────────────────────
  const m4 = {
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    ortho(l, r, b, t, n, f) {
      const o = new Float32Array(16);
      o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
      o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
      return o;
    },
    lookAt(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
      let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
    },
    xform(m, x, y, z) {
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];
    },
    invert(m) {
      const inv = new Float32Array(16);
      inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
      inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
      inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
      inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
      inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
      inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
      inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
      inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
      inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
      inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
      inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
      inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
      inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
      inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
      inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
      inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
      let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
      det = 1 / det;
      for (let i = 0; i < 16; i++) inv[i] *= det;
      return inv;
    },
  };

  // ── Affine 3x4 frames for building models (row-major rows r0,r1,r2) ────
  // A frame is [a,b,c,tx, d,e,f,ty, g,h,i,tz].
  const F = {
    id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    mul(A, B) {
      const o = new Array(12);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) o[r * 4 + c] = A[r * 4] * B[c] + A[r * 4 + 1] * B[4 + c] + A[r * 4 + 2] * B[8 + c];
        o[r * 4 + 3] = A[r * 4] * B[3] + A[r * 4 + 1] * B[7] + A[r * 4 + 2] * B[11] + A[r * 4 + 3];
      }
      return o;
    },
    T: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z],
    Rz: (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; },
    Rx: (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; },
    Ry: (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; },
    apply(A, x, y, z) { return [A[0] * x + A[1] * y + A[2] * z + A[3], A[4] * x + A[5] * y + A[6] * z + A[7], A[8] * x + A[9] * y + A[10] * z + A[11]]; },
  };

  // ── Shaders ────────────────────────────────────────────────────────────
  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n');
      throw new Error('shader: ' + log + '\n' + lines.slice(0, 4000));
    }
    return s;
  }
  function program(gl, vs, fs, attribs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    if (attribs) attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  // ── Meshes with flat normals ───────────────────────────────────────────
  function boxMesh() {
    const P = [], N = [];
    const f = (n, a, b, c, d) => { for (const v of [a, b, c, a, c, d]) { P.push(...v); N.push(...n); } };
    const h = 0.5;
    f([1, 0, 0], [h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]);
    f([-1, 0, 0], [-h, h, -h], [-h, -h, -h], [-h, -h, h], [-h, h, h]);
    f([0, 1, 0], [h, h, -h], [-h, h, -h], [-h, h, h], [h, h, h]);
    f([0, -1, 0], [-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]);
    f([0, 0, 1], [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]);
    f([0, 0, -1], [-h, h, -h], [h, h, -h], [h, -h, -h], [-h, -h, -h]);
    return { P, N };
  }
  // Triangular prism along x (a roof / a hull bow piece): ridge at y = 0, z = 0.5.
  function prismMesh() {
    const P = [], N = [];
    const tri = (a, b, c) => {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...n); for (const p of [a, b, c]) { P.push(...p); N.push(n[0] / l, n[1] / l, n[2] / l); }
    };
    const h = 0.5;
    const A = [-h, -h, -h], B = [-h, h, -h], C = [-h, 0, h], D = [h, -h, -h], E = [h, h, -h], G = [h, 0, h];
    tri(A, C, B); tri(D, E, G);
    tri(A, D, G); tri(A, G, C);
    tri(B, C, G); tri(B, G, E);
    tri(A, B, E); tri(A, E, D);
    return { P, N };
  }
  function cylMesh(n = 10) {
    const P = [], N = [];
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
      const p0 = [Math.cos(a0) * 0.5, Math.sin(a0) * 0.5], p1 = [Math.cos(a1) * 0.5, Math.sin(a1) * 0.5];
      const nn = [Math.cos(am), Math.sin(am), 0];
      for (const v of [[p0, -0.5], [p1, -0.5], [p1, 0.5], [p0, -0.5], [p1, 0.5], [p0, 0.5]]) { P.push(v[0][0], v[0][1], v[1]); N.push(...nn); }
      for (const v of [[0, 0], p0, p1]) { P.push(v[0], v[1], 0.5); N.push(0, 0, 1); }
      for (const v of [[0, 0], p1, p0]) { P.push(v[0], v[1], -0.5); N.push(0, 0, -1); }
    }
    return { P, N };
  }
  // A faceted ball (two subdivisions of an octahedron): papercraft tree crowns.
  function ballMesh() {
    let tris = [];
    const v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const faces = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
    for (const f of faces) tris.push(f.map(i => v[i]));
    const norm = (p) => { const l = Math.hypot(...p); return p.map(x => x / l); };
    const mid = (a, b) => norm([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    for (let k = 0; k < 1; k++) {
      const out = [];
      for (const [a, b, c] of tris) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); out.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
      tris = out;
    }
    const P = [], N = [];
    for (const t of tris) {
      const [a, b, c] = t;
      const n = norm([(a[0] + b[0] + c[0]), (a[1] + b[1] + c[1]), (a[2] + b[2] + c[2])]);
      for (const p of t) { P.push(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5); N.push(...n); }
    }
    return { P, N };
  }

  // ── Instancer: one mesh, many transformed copies ───────────────────────
  // Per instance: three rows of an affine matrix and a colour whose alpha
  // carries a material code (see the fragment shader).
  class Instancer {
    constructor(gl, mesh) {
      this.gl = gl;
      this.n = mesh.P.length / 3;
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      const inter = new Float32Array(this.n * 6);
      for (let i = 0; i < this.n; i++) { inter.set(mesh.P.slice(i * 3, i * 3 + 3), i * 6); inter.set(mesh.N.slice(i * 3, i * 3 + 3), i * 6 + 3); }
      gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      this.ib = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
      for (let k = 0; k < 4; k++) {
        gl.enableVertexAttribArray(2 + k);
        gl.vertexAttribPointer(2 + k, 4, gl.FLOAT, false, 64, k * 16);
        gl.vertexAttribDivisor(2 + k, 1);
      }
      gl.bindVertexArray(null);
      this.cap = 0; this.data = new Float32Array(0); this.count = 0;
    }
    reset() { this.count = 0; }
    ensure(n) {
      if (n <= this.cap) return;
      let c = Math.max(1024, this.cap);
      while (c < n) c *= 2;
      const d = new Float32Array(c * 16);
      d.set(this.data.subarray(0, this.count * 16));
      this.data = d; this.cap = c;
    }
    // m: 12-number frame (rows); color [r,g,b]; mat: material code.
    push(m, r, g, b, mat) {
      if (this.count >= this.cap) this.ensure(this.count + 1);
      const d = this.data, o = this.count * 16;
      d[o] = m[0]; d[o + 1] = m[1]; d[o + 2] = m[2]; d[o + 3] = m[3];
      d[o + 4] = m[4]; d[o + 5] = m[5]; d[o + 6] = m[6]; d[o + 7] = m[7];
      d[o + 8] = m[8]; d[o + 9] = m[9]; d[o + 10] = m[10]; d[o + 11] = m[11];
      d[o + 12] = r; d[o + 13] = g; d[o + 14] = b; d[o + 15] = mat || 0;
      this.count++;
    }
    upload() {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
      if (this.gpuCap !== this.cap) { gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW); this.gpuCap = this.cap; }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * 16);
    }
    draw() {
      if (!this.count) return;
      const gl = this.gl;
      gl.bindVertexArray(this.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, this.n, this.count);
    }
  }

  // Colours: hex to linear-ish 0..1 triple (kept in sRGB; the look is paper).
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

  TL.GL = { m4, F, program, boxMesh, prismMesh, cylMesh, ballMesh, Instancer, hex };
})(globalThis.TL = globalThis.TL || {});
