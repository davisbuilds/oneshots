// render.js: a small WebGL2 renderer for luminous 2D geometry.
// Everything is drawn into one batch of coloured triangles (with a "kind" per
// vertex for soft glows, discs and rings), rendered to an offscreen target,
// then bloomed and composited with vignette, flash and chromatic aberration.
'use strict';
(function (L) {
  const FLOATS = 9;              // x y u v r g b a kind
  const MAXV = 6 * 40000;

  const VS = `#version 300 es
  layout(location=0) in vec2 p; layout(location=1) in vec2 uv; layout(location=2) in vec4 c; layout(location=3) in float k;
  uniform mat3 view; out vec2 vuv; out vec4 vc; out float vk;
  void main(){ vec3 q = view * vec3(p,1.0); gl_Position = vec4(q.xy,0.0,1.0); vuv=uv; vc=c; vk=k; }`;
  const FS = `#version 300 es
  precision mediump float; in vec2 vuv; in vec4 vc; in float vk; out vec4 o;
  void main(){
    float a = 1.0;
    if (vk > 0.5) {
      float d = length(vuv);
      if (vk < 1.5) { float f = max(0.0, 1.0 - d); a = f * f * f; }
      else if (vk < 2.5) { float w = fwidth(d); a = 1.0 - smoothstep(1.0 - w, 1.0, d); }
      else { float inner = fract(vk); float w = fwidth(d); a = (1.0 - smoothstep(1.0 - w, 1.0, d)) * smoothstep(inner - w, inner, d); }
    }
    o = vec4(vc.rgb, vc.a * a);
  }`;
  const QUAD_VS = `#version 300 es
  layout(location=0) in vec2 p; out vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p,0.0,1.0); }`;
  const BRIGHT_FS = `#version 300 es
  precision mediump float; in vec2 uv; uniform sampler2D src; uniform float threshold; out vec4 o;
  void main(){ vec3 c = texture(src, uv).rgb; float l = max(c.r, max(c.g, c.b)); o = vec4(c * smoothstep(threshold, threshold + 0.35, l), 1.0); }`;
  const BLUR_FS = `#version 300 es
  precision mediump float; in vec2 uv; uniform sampler2D src; uniform vec2 dir; out vec4 o;
  void main(){
    vec3 s = texture(src, uv).rgb * 0.227027;
    s += texture(src, uv + dir * 1.3846).rgb * 0.316216; s += texture(src, uv - dir * 1.3846).rgb * 0.316216;
    s += texture(src, uv + dir * 3.2308).rgb * 0.070270; s += texture(src, uv - dir * 3.2308).rgb * 0.070270;
    o = vec4(s, 1.0);
  }`;
  const FINAL_FS = `#version 300 es
  precision mediump float; in vec2 uv; uniform sampler2D scene; uniform sampler2D b1; uniform sampler2D b2; uniform sampler2D b3;
  uniform float bloom; uniform float aberr; uniform vec4 flash; uniform float vignette; uniform float time; uniform float grain; uniform float aspect;
  out vec4 o;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
  void main(){
    vec2 d = uv - 0.5;
    vec2 off = d * aberr;
    vec3 c;
    c.r = texture(scene, uv + off).r; c.g = texture(scene, uv).g; c.b = texture(scene, uv - off).b;
    vec3 bl = texture(b1, uv).rgb * 0.5 + texture(b2, uv).rgb * 0.8 + texture(b3, uv).rgb * 1.1;
    c += bl * bloom;
    c = mix(c, flash.rgb, flash.a);
    float v = 1.0 - vignette * dot(d * vec2(aspect, 1.0), d * vec2(aspect, 1.0)) * 1.1;
    c *= clamp(v, 0.0, 1.0);
    c = c / (1.0 + max(c - 1.0, 0.0) * 0.6);
    c += (hash(uv * 913.0) - 0.5) * grain;
    o = vec4(c, 1.0);
  }`;

  function compile(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  function target(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }

  L.Renderer = function (canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    const prog = compile(gl, VS, FS);
    const bright = compile(gl, QUAD_VS, BRIGHT_FS);
    const blur = compile(gl, QUAD_VS, BLUR_FS);
    const final = compile(gl, QUAD_VS, FINAL_FS);
    const data = new Float32Array(MAXV * FLOATS);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 32);
    const qvao = gl.createVertexArray();
    gl.bindVertexArray(qvao);
    const qbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let n = 0, blendMode = 'alpha', viewM = new Float32Array(9);
    let W = 0, H = 0, T = null;
    const r = { gl, canvas, alpha: 1, post: { bloom: 0.9, aberr: 0, flash: [1, 1, 1, 0], vignette: 0.8, grain: 0.03, threshold: 0.62 }, scale: 1 };

    r.resize = function (w, h) {
      if (w === W && h === H) return;
      W = w; H = h;
      canvas.width = w; canvas.height = h;
      const h2 = [Math.max(1, w >> 1), Math.max(1, h >> 1)], h4 = [Math.max(1, w >> 2), Math.max(1, h >> 2)], h8 = [Math.max(1, w >> 3), Math.max(1, h >> 3)];
      T = {
        scene: target(gl, w, h),
        a2: target(gl, ...h2), b2: target(gl, ...h2),
        a4: target(gl, ...h4), b4: target(gl, ...h4),
        a8: target(gl, ...h8), b8: target(gl, ...h8),
      };
    };
    r.size = () => [W, H];

    function flush() {
      if (!n) return;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * FLOATS);
      gl.useProgram(prog.p);
      gl.uniformMatrix3fv(prog.u.view, false, viewM);
      gl.drawArrays(gl.TRIANGLES, 0, n);
      n = 0;
    }
    r.flush = flush;

    r.begin = function (bg) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fb);
      gl.viewport(0, 0, W, H);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      r.blend('alpha');
    };

    r.blend = function (mode) {
      if (mode === blendMode && n) return;
      flush();
      blendMode = mode;
      if (mode === 'add') gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
      else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    };

    // World view: cx, cy at screen centre, `zoom` pixels per unit, rotation.
    r.view = function (cx, cy, zoom, rot = 0, mirror = false) {
      flush();
      const sx = 2 * zoom / W, sy = 2 * zoom / H;
      const c = Math.cos(rot), s = Math.sin(rot);
      // column-major mat3: rotate about (cx, cy) then scale to clip space
      viewM[0] = c * sx; viewM[1] = s * sy; viewM[2] = 0;
      viewM[3] = -s * sx; viewM[4] = c * sy; viewM[5] = 0;
      viewM[6] = -(c * cx - s * cy) * sx; viewM[7] = -(s * cx + c * cy) * sy; viewM[8] = 1;
      if (mirror) { viewM[3] = -viewM[3]; viewM[4] = -viewM[4]; }   // draw (x, y) at (x, -y)
    };
    // Screen view: pixels, origin top-left.
    r.screen = function () {
      flush();
      viewM.set([2 / W, 0, 0, 0, -2 / H, 0, -1, 1, 1]);
    };

    function v(x, y, u, w, c, k) {
      if (n >= MAXV) flush();
      const o = n * FLOATS;
      data[o] = x; data[o + 1] = y; data[o + 2] = u; data[o + 3] = w;
      data[o + 4] = c[0]; data[o + 5] = c[1]; data[o + 6] = c[2]; data[o + 7] = (c[3] === undefined ? 1 : c[3]) * r.alpha;
      data[o + 8] = k;
      n++;
    }
    r.tri = function (x1, y1, x2, y2, x3, y3, c, c2, c3) {
      if (n + 3 > MAXV) flush();
      v(x1, y1, 0, 0, c, 0); v(x2, y2, 0, 0, c2 || c, 0); v(x3, y3, 0, 0, c3 || c, 0);
    };
    r.quad = function (x1, y1, x2, y2, x3, y3, x4, y4, c, cb) {
      // corners in order; cb (optional) colours corners 3 and 4
      if (n + 6 > MAXV) flush();
      const d = cb || c;
      v(x1, y1, 0, 0, c, 0); v(x2, y2, 0, 0, c, 0); v(x3, y3, 0, 0, d, 0);
      v(x1, y1, 0, 0, c, 0); v(x3, y3, 0, 0, d, 0); v(x4, y4, 0, 0, d, 0);
    };
    r.rect = (x0, y0, x1, y1, c) => r.quad(x0, y0, x1, y0, x1, y1, x0, y1, c);
    // Vertical gradient: cBottom at y0, cTop at y1.
    r.rectV = (x0, y0, x1, y1, cb, ct) => r.quad(x0, y0, x1, y0, x1, y1, x0, y1, cb, ct);
    r.poly = function (pts, c) {
      for (let i = 1; i + 1 < pts.length; i++) r.tri(pts[0][0], pts[0][1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c);
    };
    r.line = function (x1, y1, x2, y2, w, c, c2) {
      const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l * w / 2, ny = dx / l * w / 2;
      r.quad(x1 + nx, y1 + ny, x1 - nx, y1 - ny, x2 - nx, y2 - ny, x2 + nx, y2 + ny, c, c2);
    };
    r.polyline = function (pts, w, c, closed) {
      const m = pts.length;
      for (let i = 0; i + 1 < m; i++) r.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
      if (closed && m > 2) r.line(pts[m - 1][0], pts[m - 1][1], pts[0][0], pts[0][1], w, c);
      // round the joints
      for (let i = closed ? 0 : 1; i < (closed ? m : m - 1); i++) r.disk(pts[i][0], pts[i][1], w / 2, c);
    };
    function sprite(x, y, rx, ry, c, k) {
      if (n + 6 > MAXV) flush();
      v(x - rx, y - ry, -1, -1, c, k); v(x + rx, y - ry, 1, -1, c, k); v(x + rx, y + ry, 1, 1, c, k);
      v(x - rx, y - ry, -1, -1, c, k); v(x + rx, y + ry, 1, 1, c, k); v(x - rx, y + ry, -1, 1, c, k);
    }
    r.glow = (x, y, rad, c, ry) => sprite(x, y, rad, ry || rad, c, 1);
    r.disk = (x, y, rad, c) => sprite(x, y, rad, rad, c, 2);
    r.ring = (x, y, rad, inner, c) => sprite(x, y, rad, rad, c, 3 + Math.min(0.99, Math.max(0.01, inner / rad)));

    function pass(p, dst, setup) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
      gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H);
      gl.useProgram(p.p);
      setup(p.u);
      gl.bindVertexArray(qvao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    function bindTex(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }

    r.end = function (time) {
      flush();
      gl.disable(gl.BLEND);
      const P = r.post;
      pass(bright, T.a2, u => { bindTex(0, T.scene.tex); gl.uniform1i(u.src, 0); gl.uniform1f(u.threshold, P.threshold); });
      const blurPair = (a, b, scale) => {
        pass(blur, b, u => { bindTex(0, a.tex); gl.uniform1i(u.src, 0); gl.uniform2f(u.dir, scale / a.w, 0); });
        pass(blur, a, u => { bindTex(0, b.tex); gl.uniform1i(u.src, 0); gl.uniform2f(u.dir, 0, scale / a.h); });
      };
      blurPair(T.a2, T.b2, 1);
      pass(blur, T.a4, u => { bindTex(0, T.a2.tex); gl.uniform1i(u.src, 0); gl.uniform2f(u.dir, 0.5 / T.a2.w, 0.5 / T.a2.h); });
      blurPair(T.a4, T.b4, 1.5);
      pass(blur, T.a8, u => { bindTex(0, T.a4.tex); gl.uniform1i(u.src, 0); gl.uniform2f(u.dir, 0.5 / T.a4.w, 0.5 / T.a4.h); });
      blurPair(T.a8, T.b8, 2);
      blurPair(T.a8, T.b8, 3);
      pass(final, null, u => {
        bindTex(0, T.scene.tex); bindTex(1, T.a2.tex); bindTex(2, T.a4.tex); bindTex(3, T.a8.tex);
        gl.uniform1i(u.scene, 0); gl.uniform1i(u.b1, 1); gl.uniform1i(u.b2, 2); gl.uniform1i(u.b3, 3);
        gl.uniform1f(u.bloom, P.bloom); gl.uniform1f(u.aberr, P.aberr);
        gl.uniform4fv(u.flash, P.flash); gl.uniform1f(u.vignette, P.vignette);
        gl.uniform1f(u.time, time % 100); gl.uniform1f(u.grain, P.grain); gl.uniform1f(u.aspect, W / H);
      });
      gl.enable(gl.BLEND);
    };
    return r;
  };
})(globalThis.LUMINAL = globalThis.LUMINAL || {});
