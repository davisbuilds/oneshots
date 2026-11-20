// Post-processing: HDR scene target (depth + stencil, no MSAA: three.js
// resolves and invalidates multisampled colour after every render() call,
// which would break multi-pass stencil compositing), bloom by dual filtering,
// exposure, tone mapping and grading into an LDR target, then FXAA, vignette
// and grain to the canvas.
import * as THREE from '../../vendor/three/three.module.js';

const VS = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';

function rt(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, ...opts,
  });
}

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(g);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.params = { exposure: 1, bloom: 0.55, bloomThreshold: 1.1, vignette: 0.28, grain: 0.035, saturation: 1.05, contrast: 1.04, lift: [0, 0, 0], gain: [1, 1, 1], fxaa: true, fade: 0, fadeColor: [0, 0, 0] };
    this.levels = 6;
    this.prefilter = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThreshold: { value: 1 }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tSrc; uniform float uThreshold; uniform vec2 uTexel; varying vec2 vUv;
        vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
        void main() {
          vec3 c = (s(vec2(-1,-1)) + s(vec2(1,-1)) + s(vec2(-1,1)) + s(vec2(1,1))) * 0.25;
          c = (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : min(c, vec3(64.0));
          float l = max(c.r, max(c.g, c.b));
          float knee = uThreshold * 0.6;
          float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
          float w = max(soft, l - uThreshold) / max(l, 1e-4);
          gl_FragColor = vec4(c * w, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.down = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
        void main() {
          vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
          c += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
          c += texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
          c += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
          c += texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
          gl_FragColor = vec4(c / 8.0, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.up = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uWeight; varying vec2 vUv;
        void main() {
          vec2 o = uTexel;
          vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb + texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb
                 + texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
          c += (texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb
              + texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb) * 2.0;
          gl_FragColor = vec4(c / 12.0 * uWeight, 1.0);
        }`,
      depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
    });
    this.grade = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uBloom: { value: 0.5 },
        uSat: { value: 1 }, uContrast: { value: 1 }, uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tScene, tBloom; uniform float uExposure, uBloom, uSat, uContrast; uniform vec3 uLift, uGain; varying vec2 vUv;
        // AgX-like filmic curve (log2 encoding + sigmoid), gentle on saturated lights.
        vec3 agx(vec3 c) {
          const mat3 inM = mat3(0.842479, 0.0784336, 0.0792237, 0.0423303, 0.878468, 0.0791661, 0.0423756, 0.0784336, 0.879142);
          const mat3 outM = mat3(1.19688, -0.0980209, -0.0990297, -0.0528969, 1.15190, -0.0989612, -0.0529716, -0.0980435, 1.15107);
          c = inM * max(c, 0.0);
          c = clamp(log2(c + 1e-10), -12.47393, 4.026069);
          c = (c + 12.47393) / 16.5;
          vec3 x2 = c * c, x4 = x2 * x2;
          c = 15.5 * x4 * x2 - 40.14 * x4 * c + 31.96 * x4 - 6.868 * x2 * c + 0.4298 * x2 + 0.1191 * c - 0.00232;
          c = outM * c;
          return clamp(pow(max(c, 0.0), vec3(2.2)), 0.0, 1.0);
        }
        void main() {
          vec3 c = texture2D(tScene, vUv).rgb;
          if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
          c += texture2D(tBloom, vUv).rgb * uBloom;
          c = agx(c * uExposure);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat);
          c = (c - 0.5) * uContrast + 0.5;
          c = uGain * (c + uLift * (1.0 - c));
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), l);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.final = new THREE.ShaderMaterial({
      uniforms: {
        tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uVignette: { value: 0.3 }, uGrain: { value: 0.03 },
        uTime: { value: 0 }, uFxaa: { value: 1 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Vector3() },
      },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uVignette, uGrain, uTime, uFxaa, uFade; uniform vec3 uFadeColor; varying vec2 vUv;
        float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
        vec3 fxaa(vec2 uv) {
          vec3 rgbNW = texture2D(tSrc, uv + vec2(-1.0, -1.0) * uTexel).rgb, rgbNE = texture2D(tSrc, uv + vec2(1.0, -1.0) * uTexel).rgb;
          vec3 rgbSW = texture2D(tSrc, uv + vec2(-1.0, 1.0) * uTexel).rgb, rgbSE = texture2D(tSrc, uv + vec2(1.0, 1.0) * uTexel).rgb;
          vec3 rgbM = texture2D(tSrc, uv).rgb;
          float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(rgbM);
          float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
          vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
          float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
          float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
          dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
          vec3 a = 0.5 * (texture2D(tSrc, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSrc, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
          vec3 b = a * 0.5 + 0.25 * (texture2D(tSrc, uv - dir * 0.5).rgb + texture2D(tSrc, uv + dir * 0.5).rgb);
          float lB = luma(b);
          return (lB < lMin || lB > lMax) ? a : b;
        }
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 0.001) * 43758.5453); }
        void main() {
          vec3 c = uFxaa > 0.5 ? fxaa(vUv) : texture2D(tSrc, vUv).rgb;
          vec2 q = vUv - 0.5;
          c *= 1.0 - uVignette * smoothstep(0.25, 0.95, dot(q, q) * 2.2);
          c += (hash(vUv * 1000.0 + fract(uTime)) - 0.5) * uGrain;
          c = mix(c, uFadeColor, uFade);
          // linear -> sRGB
          c = mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.sceneRT = null;
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.dispose();
    this.sceneRT = rt(w, h, { depthBuffer: true, stencilBuffer: true });
    this.ldr = rt(w, h, { type: THREE.UnsignedByteType });
    this.chain = [];
    let cw = w >> 1, ch = h >> 1;
    for (let i = 0; i < this.levels; i++) { this.chain.push(rt(cw, ch)); cw = Math.max(1, cw >> 1); ch = Math.max(1, ch >> 1); }
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.camera);
  }

  render(time) {
    const p = this.params, r = this.r;
    const prevClip = r.clippingPlanes; r.clippingPlanes = [];
    // bloom
    const c0 = this.chain[0];
    this.prefilter.uniforms.tSrc.value = this.sceneRT.texture;
    this.prefilter.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
    this.prefilter.uniforms.uThreshold.value = p.bloomThreshold;
    this.pass(this.prefilter, c0);
    for (let i = 1; i < this.chain.length; i++) {
      const src = this.chain[i - 1];
      this.down.uniforms.tSrc.value = src.texture;
      this.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.pass(this.down, this.chain[i]);
    }
    for (let i = this.chain.length - 1; i > 0; i--) {
      const src = this.chain[i];
      this.up.uniforms.tSrc.value = src.texture;
      this.up.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.up.uniforms.uWeight.value = 1.0;
      r.autoClear = false;
      this.pass(this.up, this.chain[i - 1]);
    }
    const g = this.grade.uniforms;
    g.tScene.value = this.sceneRT.texture; g.tBloom.value = c0.texture;
    g.uExposure.value = p.exposure; g.uBloom.value = p.bloom / this.chain.length;
    g.uSat.value = p.saturation; g.uContrast.value = p.contrast; g.uLift.value.set(...p.lift); g.uGain.value.set(...p.gain);
    this.pass(this.grade, this.ldr);
    const f = this.final.uniforms;
    f.tSrc.value = this.ldr.texture; f.uTexel.value.set(1 / this.w, 1 / this.h);
    f.uVignette.value = p.vignette; f.uGrain.value = p.grain; f.uTime.value = time; f.uFxaa.value = p.fxaa ? 1 : 0;
    f.uFade.value = p.fade; f.uFadeColor.value.set(...p.fadeColor);
    this.pass(this.final, null);
    r.clippingPlanes = prevClip;
  }

  dispose() {
    this.sceneRT?.dispose(); this.ldr?.dispose();
    for (const c of this.chain || []) c.dispose();
  }
}
