import * as T from '../vendor/three.module.js';
import { doorway, barrier, WIDTH, HEIGHT } from './spatial.js';
const worlds = new Map();
export function getWorld(id) {
  if(worlds.has(id)) return worlds.get(id);
  const palette={1:0x81bcc7,2:0xf4a16a,4:0x286a68};
  const scene=new T.Scene(), fogColor=new T.Color(palette[id]);
  scene.background=fogColor; scene.fog=new T.FogExp2(fogColor,.008);
  scene.add(new T.HemisphereLight(0xfff1db,0x5b6a68,2));
  const light=new T.DirectionalLight(0xffe4bc,2);light.position.set(-10,20,-8);scene.add(light);
  function box(x,y,z,w,h,d,color) {
    const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color}));
    m.position.set(x,y,z);scene.add(m);
  }
  box(0,-.6,0,36,1.2,90,id==='1'?0x65797c:0xc7976d);
  const gates=[],barriers=[];
  function gate(key,x,z,yaw,to,mate) {
    const g=Object.assign(doorway(key,x,z,yaw),{to,mate});gates.push(g);
    for(const sign of [-1,1]) {
      box(x+sign*3.7,3.6,z,1.4,7.2,1.4,0x6b6254);
      barriers.push(barrier(x+sign*3.7,z,1.4,1.4));
    }
    box(x,HEIGHT+.5,z,9,1,1.5,0x847763);
  }
  if(id!=='1') gate('back',0,14,Math.PI,(BigInt(id)/2n).toString(),'front');
  if(id!=='4') gate('front',0,id==='1'?0:-12,0,(BigInt(id)*2n).toString(),'back');
  for(let j=0;j<14;j++) box((j%2?1:-1)*(9+j*.9),3+j*.2,-j*4,2,6+j*.4,2,0x887565);
  const world={id,scene,fogColor,gates,barriers,height:()=>0};worlds.set(id,world);return world;
}
