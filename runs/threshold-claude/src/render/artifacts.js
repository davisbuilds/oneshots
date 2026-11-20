// Artifacts: each world's lodestone (dormant until woken, then a pillar of
// light visible from far away and through portals), and the instrument that
// waits on the pedestal of the Threshold.
import * as THREE from '../../vendor/three/three.module.js';
import { FOG_PARS } from './atmosphere.js';
import { LAYER } from './portal-renderer.js';

const CLIP_V = '#include <clipping_planes_pars_vertex>';
const CLIP_F = '#include <clipping_planes_pars_fragment>';

export function lodestone(view, L) {
  const group = new THREE.Group();
  group.position.set(...L.p);
  group.rotation.y = L.yaw || 0;
  const glowCol = new THREE.Color(...(view.desc.lodestoneColor || [1.0, 0.78, 0.45]));
  const core = view.track(new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.25, metalness: 0.6, emissive: glowCol, emissiveIntensity: 0.4 }));
  view.patch(core, 'lode');
  const metal = view.track(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.55, 0.42, 0.25), roughness: 0.3, metalness: 1.0 }));
  view.patch(metal, 'lodem');
  const add = (g, m, y = 0) => { view.track(g); const o = new THREE.Mesh(g, m); o.position.y = y; o.castShadow = true; group.add(o); return o; };
  const spin = [];
  const top = 0.9;
  if (L.kind === 'obelisk') {
    const o = add(new THREE.CylinderGeometry(0.18, 0.32, 2.6, 4), metal, top + 1.6); o.rotation.y = Math.PI / 4;
    const c = add(new THREE.OctahedronGeometry(0.3), core, top + 3.4); spin.push([c, 0.6]);
  } else if (L.kind === 'orb') {
    const c = add(new THREE.SphereGeometry(0.42, 32, 16), core, top + 1.3); spin.push([c, 0.2]);
    for (let k = 0; k < 2; k++) { const r = add(new THREE.TorusGeometry(0.62 + k * 0.12, 0.018, 8, 64), metal, top + 1.3); r.rotation.x = 1.1 + k; spin.push([r, 0.3 + k * 0.2]); }
  } else if (L.kind === 'crystal') {
    const c = add(new THREE.OctahedronGeometry(0.5), core, top + 1.4); c.scale.y = 1.8; spin.push([c, 0.4]);
  } else {
    const c = add(new THREE.SphereGeometry(0.2, 24, 12), core, top + 1.3);
    for (let k = 0; k < 3; k++) { const r = add(new THREE.TorusGeometry(0.55 + k * 0.17, 0.03, 8, 72), metal, top + 1.3); r.rotation.set(k * 1.1, k * 0.7, 0); spin.push([r, 0.25 + k * 0.15]); }
    spin.push([c, 0.1]);
  }
  // the beam: a soft additive column that reaches the sky
  const beamMat = view.track(new THREE.ShaderMaterial({
    uniforms: { ...view.uniforms, uCol: { value: glowCol }, uOn: { value: 0 } },
    clipping: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `${CLIP_V}\nvarying vec3 vL; varying vec3 vWorldP; void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vWorldP = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;\n#include <clipping_planes_vertex>\n}`,
    fragmentShader: `${CLIP_F}\n${FOG_PARS}\nuniform vec3 uCol; uniform float uOn; varying vec3 vL; varying vec3 vWorldP;
      void main() {
        #include <clipping_planes_fragment>
        vec3 V = normalize(cameraPosition - vWorldP);
        float rim = pow(abs(V.x * normalize(vL.x + 1e-4) * 0.0 + 1.0), 1.0);
        float h = vL.y / 600.0;
        float a = (1.0 - smoothstep(0.0, 1.0, h)) * (0.65 + 0.35 * sin(vL.y * 0.05 - uTime * 2.0));
        float dc = length(cameraPosition - vWorldP);
        a *= mix(0.05, 1.0, smoothstep(4.0, 60.0, dc)) * smoothstep(0.0, 6.0, vL.y + 300.0);
        vec3 rd; float fog = fogAmount(cameraPosition, vWorldP, rd);
        gl_FragColor = vec4(uCol * a * uOn * 0.55 * (1.0 - fog * 0.6) * rim, 1.0);
      }`,
  }));
  const beamGeo = view.track(new THREE.CylinderGeometry(0.35, 0.9, 600, 16, 1, true).translate(0, 300 + top + 1.3, 0));
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.layers.set(LAYER.TRANSPARENT); beam.frustumCulled = false; beam.visible = false;
  group.add(beam);
  const light = new THREE.PointLight(glowCol, 0, 30, 2);
  light.position.y = top + 1.5; light.layers.set(LAYER.LIGHTS);
  group.add(light);
  view.scene.add(group);
  let lit = false, k = 0;
  view.updaters.push((dt, t) => {
    k += ((lit ? 1 : 0) - k) * Math.min(1, dt * 1.5);
    for (const [o, s] of spin) { o.rotation.y += dt * s * (1 + k * 2); o.rotation.x += dt * s * 0.3; }
    core.emissiveIntensity = 0.35 + 0.25 * Math.sin(t * 1.7) * (1 - k) + k * 7;
    beamMat.uniforms.uOn.value = k; beam.visible = k > 0.01;
    light.intensity = k * 60;
  });
  return { group, setLit(v) { lit = v; }, get lit() { return lit; }, p: L.p };
}

export function instrumentOnPedestal(view, I) {
  const g = new THREE.Group();
  g.position.set(...I.p);
  const brass = view.track(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.7, 0.5, 0.25), roughness: 0.28, metalness: 1.0 }));
  view.patch(brass, 'brass');
  const gem = view.track(new THREE.MeshStandardMaterial({ color: 0x050505, emissive: new THREE.Color(0.55, 0.85, 1.0), emissiveIntensity: 3 }));
  view.patch(gem, 'gem');
  const rings = [];
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(view.track(new THREE.TorusGeometry(0.28 - k * 0.06, 0.012, 8, 64)), brass);
    r.rotation.set(k * 0.9, k * 0.4, 0); g.add(r); rings.push(r);
  }
  g.add(new THREE.Mesh(view.track(new THREE.IcosahedronGeometry(0.06, 1)), gem));
  view.scene.add(g);
  view.updaters.push((dt, t) => { rings.forEach((r, i) => { r.rotation.y += dt * (0.4 + i * 0.3); r.rotation.x += dt * 0.15 * (i + 1); }); g.position.y = I.p[1] + Math.sin(t * 1.3) * 0.04; });
  return { group: g, setTaken(v) { g.visible = !v; } };
}
