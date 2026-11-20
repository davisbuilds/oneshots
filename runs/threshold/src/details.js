import * as T from '../vendor/three.module.js';
import { random, ground, noise } from './geography.js';
import { shape, shade } from './sculpt.js';
const PI = Math.PI;
function fern() {
  return shape('lace-fern', () => {
    const pos = [],
      c = [];
    const face = (a, b, d, v) => {
      pos.push(...a, ...b, ...d);
      for (let i = 0; i < 3; i++) c.push(v * 0.65, v, v * 0.79);
    };
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.39996,
        s = Math.sin(angle),
        co = Math.cos(angle),
        len = 0.72 + 0.34 * Math.sin(i * 5.21);
      const pt = (t, lift = 0, side = 0) => [
        s * t * len + co * side,
        Math.sin(t * 2) * 0.9 + lift,
        co * t * len - s * side,
      ];
      for (let j = 1; j < 10; j++) {
        const t = j / 11,
          w = 0.145 * Math.sin(t * PI);
        for (const d of [-1, 1])
          face(pt(t - 0.07), pt(t + 0.05, 0.012), pt(t + 0.16, 0.025, w * d), 0.55 + 0.42 * t);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(c, 3));
    g.computeVertexNormals();
    return g;
  });
}
export function groundCover(m, info, cx, cz) {
  const rng = random((info.seed ^ Math.imul(cx, 132721) ^ Math.imul(cz, 43237)) >>> 0);
  const n = info.biome === 'forest' ? 78 : info.biome === 'desert' ? 22 : 12;
  for (let i = 0; i < n; i++) {
    const x = (cx + rng()) * 32,
      z = (cz + rng()) * 32,
      y = ground(info, x, z),
      s = 0.22 + rng() ** 1.6;
    if (info.gates.some((g) => Math.hypot(x - g.origin.x, z - g.origin.z) < 4)) continue;
    if (info.biome === 'forest') {
      if (noise(x * 0.063, z * 0.063, info.seed + 2) < 0.32) continue;
      m.place(fern(), 'living', i % 4 ? '#518c70' : '#82ab7f', x, y - 0.07, z, s * 1.45, s, s * 1.45, [
        0,
        rng() * 6.28,
        0,
      ]);
      if (i % 4 === 0) m.orb(x, y + s * 0.55, z, 0.045, 0.085, 0.045, '#a4f2b2', 'light');
    } else if (info.biome === 'desert') {
      m.cone(x, y + 0.02, z, s * 0.32, s * 0.18, s * 0.24, shade('#ac7250', 0.9 + 0.25 * rng()), [
        0,
        rng() * 5,
        0.13,
      ]);
      if (i % 4 === 0)
        for (let j = 0; j < 4; j++)
          m.beam(
            [x, y, z],
            [x + (rng() - 0.5) * 0.41, y + 0.19 + rng() * 0.37, z + (rng() - 0.5) * 0.48],
            0.018,
            '#968458'
          );
    } else m.cone(x, y + 0.12, z, s * 0.3, s * 0.7, s * 0.28, '#a3c4ca', [0.19, rng() * 6, 0.2]);
  }
}

export function pennants(m, info) {
  const cloth = shape('selvedge', () => {
    const pos = [],
      colors = [],
      idx = [],
      rows = 26,
      cols = 8;
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const v = j / rows,
          u = i / cols,
          fold = Math.sin(u * PI * 3.5 + v * 2.1);
        const hem = v ** 6 * (0.18 * Math.abs(u * 2 - 1) + 0.14 * Math.sin(i * 1.4) ** 2);
        pos.push(
          (u - 0.5) * (1 - v * 0.09) + 0.12 * v * v,
          -v + hem,
          0.115 * fold * (0.35 + 0.65 * v) + v * 0.24
        );
        const gold = u < 0.13 || u > 0.87 || j === 4 || j === 5 || j === 20;
        colors.push(
          ...(gold ? [0.89, 0.57, 0.23] : [0.72 + 0.07 * fold, 0.82 + 0.06 * fold, 0.83 + 0.04 * fold])
        );
        if (i && j) {
          const k = j * (cols + 1) + i;
          idx.push(k - cols - 2, k - 1, k, k - cols - 2, k, k - cols - 1);
        }
      }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
  for (const side of [-1, 1]) {
    const x = side * 4.7;
    m.beam([x - 0.55, 7.38, 1.15], [x + 0.55, 7.38, 1.15], 0.047, '#a48451', 'metal');
    m.beam([x, 7.38, 0.68], [x, 7.38, 1.15], 0.052, '#a48451', 'metal');
    m.place(cloth, 'living', '#894c38', x, 7.32, 1.17, 0.86, 2.6, 0.7, [0, 0, 0]);
  }
}

export function motes(info) {
  const rng = random(info.seed + 481),
    n = info.biome === 'forest' ? 420 : info.biome === 'ice' ? 430 : 100,
    pos = [],
    sizes = [];
  for (let i = 0; i < n; i++) {
    pos.push((rng() - 0.5) * 80, rng() * 15, (rng() - 0.5) * 80);
    sizes.push(0.35 + rng() * 0.65);
  }
  const geom = new T.BufferGeometry();
  geom.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geom.setAttribute('size', new T.Float32BufferAttribute(sizes, 1));
  const snow = info.biome === 'ice',
    forest = info.biome === 'forest';
  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    clipping: true,
    uniforms: {
      clock: { value: 0 },
      color: { value: new T.Color(snow ? '#e9ffff' : forest ? '#b6ffb3' : '#ffe4ad') },
      fall: { value: snow ? 1 : 0 },
      brightness: { value: forest || snow ? 0.73 : 0.29 },
    },
    vertexShader: `
    uniform float clock,fall;attribute float size;varying float opacity;
    #include <clipping_planes_pars_vertex>
    void main(){vec3 p=position;p.x+=sin(clock*.32+size*12.+p.z*.1)*.68;
    p.y=mod(p.y+clock*mix(.075,-.85,fall)*size,15.);
    vec4 mvPosition=modelViewMatrix*vec4(p,1.);
    gl_Position=projectionMatrix*mvPosition;
    gl_PointSize=clamp((20.+32.*size)/max(1.,-mvPosition.z),1.,6.);
    opacity=(.55+.45*sin(clock*.72+size*52.))*smoothstep(0.,1.,p.y);
    #include <clipping_planes_vertex>
    }`,
    fragmentShader: `
    varying float opacity;uniform vec3 color;uniform float brightness;
    #include <clipping_planes_pars_fragment>
    void main(){
    #include <clipping_planes_fragment>
    float a=1.-smoothstep(.08,.5,length(gl_PointCoord-.5));if(a<.04)discard;
    gl_FragColor=vec4(color,a*brightness*opacity);
    #include <colorspace_fragment>
    }`,
  });
  return new T.Points(geom, mat);
}
