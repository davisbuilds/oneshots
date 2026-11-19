import * as T from '../vendor/three.module.js';
const palettes = {
  ocean: ['#d4e1d2', '#769ea0', '#304e63', '#ffdec0', '#b9c6a6'],
  desert: ['#ffcfa0', '#eb976e', '#ac6674', '#fff3d0', '#f9d79c'],
  forest: ['#668e89', '#234652', '#102335', '#9ff8d4', '#77d8b7'],
  ice: ['#bed9e5', '#557d99', '#293e61', '#ffeed0', '#e0d9ec'],
  archive: ['#a5b3aa', '#526466', '#273539', '#fff0c0', '#d6d5b6'],
};
const sharedNoise = `
float hash21(vec2 p) {
  vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);
}
float noise2(vec2 p) {vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.),f.x),f.y);}
float fbm(vec2 p) {return .52*noise2(p)+.27*noise2(p*2.09+17.)+.14*noise2(p*4.21+3.)+.07*noise2(p*8.7);}
`;
const skyVertex = `varying vec3 ray;
void main(){ray=position;vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);
gl_Position=clip.xyww;}`;
const skyFragment =
  `
varying vec3 ray;uniform vec3 horizon,mid,zenith,sun,moon;uniform float clock,phase;uniform int climate;
` +
  sharedNoise +
  `
vec3 satellite(vec3 base,vec3 d,vec3 center,float r,vec3 tint,float rings) {
  center=normalize(center);
  vec3 right=normalize(cross(center,vec3(0,1,0))),up=cross(right,center);
  vec2 st=vec2(dot(d,right),dot(d,up))/r;
  if(dot(d,center)<.85 || length(st)>2.2) return base;
  float radius=length(st);
  vec2 tilt=mat2(.965,-.262,.262,.965)*st;
  float band=length(tilt*vec2(1.,4.7));
  float ring=(smoothstep(1.26,1.30,band)-smoothstep(1.94,1.99,band))*rings;
  ring*=.52+.26*sin(band*155.)+.17*sin(band*47.);
  if(tilt.y>0.) base=mix(base,tint,ring*.65);
  if(radius<1.0) {
    vec3 normal=vec3(st,sqrt(max(0.,1.-radius*radius)));
    float lit=dot(normal,normalize(vec3(-.78,.43,.37)));
    float craters=fbm(st*9.+phase)*.22+fbm(st*38.)*.08;
    vec3 sphere=tint*(.53+max(0.,lit)*.63+craters-.15);
    float mask=(1.-smoothstep(.985,1.,radius))*(.18+.74*smoothstep(-.14,.44,lit));
    base=mix(base,sphere,mask);
  }
  if(tilt.y<=0.)base=mix(base,tint,ring*.72);
  return base;
}
void main(){
  vec3 d=normalize(ray);float h=max(0.,d.y);
  vec3 col=mix(horizon,mid,smoothstep(0.,.45,h));
  col=mix(col,zenith,smoothstep(.20,1.,h));
  vec3 sd=normalize(vec3(-.64,.23,-.77));
  float s=max(dot(sd,d),0.);
  col+=sun*(.19*pow(s,12.)+.48*pow(s,100.)+.9*smoothstep(.9994,.99975,s));
  if(climate==0)col=satellite(col,d,vec3(-.51,.32,-1.),.138,moon,1.);
  if(climate==1) {
    col=satellite(col,d,vec3(.076,.155,-1.),.047,moon,0.);
    col=satellite(col,d,vec3(.151,.225,-1.),.025,moon*.92,0.);
    col=satellite(col,d,vec3(.203,.178,-1.),.014,moon*.87,0.);
  }
  if(climate==3)col=satellite(col,d,vec3(.38,.34,-1.),.116,moon,1.);
  if(h>.002) {
    vec2 uv=d.xz/(.12+h)*1.55+vec2(phase+clock*.002,3.);
    float cloud=fbm(uv*vec2(1.18,2.4));float wisps=fbm(uv*vec2(1.1,7.7)+21.);
    float mask=(smoothstep(.46,.75,cloud)*.43+smoothstep(.61,.82,wisps)*.20)*smoothstep(0.,.12,h);
    col=mix(col,mix(horizon,sun,.36),mask);
    if(climate==2||climate==3){
      float ribbon=exp(-abs(h-.42-.13*sin(d.x*6.+d.z*3.))*(climate==2?18.:12.));
      col+=vec3(.025,.13,.096)*ribbon*(.3+fbm(d.xz*35.)*.7);
      float star=hash21(floor(d.xz/(.3+h)*1200.));
      col+=vec3(smoothstep(.9984,1.,star)*.47*smoothstep(.06,.38,h));
    }
  }
  col+=(hash21(gl_FragCoord.xy)-.5)*.002;
  gl_FragColor=vec4(max(vec3(0.),col),1.);
  #include <colorspace_fragment>
}`;
export function sky(info) {
  const palette = palettes[info.biome];
  const uniforms = {
    clock: { value: 0 },
    phase: { value: (info.seed % 419) * 0.11 },
    climate: { value: Object.keys(palettes).indexOf(info.biome) },
  };
  ['horizon', 'mid', 'zenith', 'sun', 'moon'].forEach(
    (k, i) => (uniforms[k] = { value: new T.Color(palette[i]) })
  );
  const mat = new T.ShaderMaterial({
    uniforms,
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    depthTest: false,
    depthWrite: false,
    side: T.BackSide,
  });
  const mesh = new T.Mesh(new T.BoxGeometry(2, 2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -999;
  return { mesh, uniforms, fog: new T.Color(palette[0]) };
}
export function sea() {
  const mat = new T.ShaderMaterial({
    uniforms: { clock: { value: 0 } },
    clipping: true,
    vertexShader: `
    varying vec3 pos;
    #include <clipping_planes_pars_vertex>
    void main(){vec4 wp=modelMatrix*vec4(position,1.);pos=wp.xyz;
    vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
    #include <clipping_planes_vertex>
    }`,
    fragmentShader:
      `
    uniform float clock;varying vec3 pos;
    #include <clipping_planes_pars_fragment>
    ` +
      sharedNoise +
      `
    void main(){
      #include <clipping_planes_fragment>
      vec3 v=normalize(cameraPosition-pos);vec2 p=pos.xz;
      float t=clock*.54,dist=distance(cameraPosition,pos);
      float swell=fbm(p*.034+vec2(.045*t,0.));
      vec2 q=p+vec2(swell*7.,swell*4.);
      float fade=1.-smoothstep(40.,200.,dist);
      float dx=cos(q.x*.49+q.y*.18+t)*.085+cos(q.y*.67-q.x*.27+t*1.3)*.043;
      float dz=cos(q.y*.72+q.x*.35+t)*.12+cos(q.y*1.9+q.x*.28+t*2.)*.065*fade;
      dz+=sin(q.y*4.9+q.x+t*1.6)*.036*fade;
      vec3 n=normalize(vec3(dx,1.,dz));
      float fres=pow(1.-max(0.,dot(n,v)),3.);
      vec3 water=mix(vec3(.022,.117,.13),vec3(.082,.25,.25),swell);
      vec3 c=mix(water,vec3(.44,.59,.54),fres*.78);
      float shine=pow(max(0.,dot(reflect(-normalize(vec3(-.64,.23,-.77)),n),v)),97.);
      c+=vec3(1.,.86,.63)*shine*.95;
      float crest=smoothstep(.87,.99,sin(q.y*.9+q.x*.23+t)*.5+.5)*smoothstep(.54,.72,swell);
      c+=vec3(.24,.32,.28)*crest*fade;
      c=mix(c,vec3(.61,.73,.65),smoothstep(95.,570.,dist)*.92);
      gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
    }`,
  });
  const geo = new T.PlaneGeometry(1600, 1600);
  geo.rotateX(-Math.PI / 2);
  const mesh = new T.Mesh(geo, mat);
  mesh.position.y = -4.6;
  return mesh;
}
