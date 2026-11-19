import * as T from '../vendor/three.module.js';
import { getWorld } from './world.js';
import { PortalRenderer } from './portals.js';
import { advance,EYE } from './spatial.js';
const r=new T.WebGLRenderer({antialias:true});document.body.append(r.domElement);r.setSize(innerWidth,innerHeight);
const c=new T.PerspectiveCamera(60,innerWidth/innerHeight,.08,600);
const p={id:'1',position:new T.Vector3(-1.5,EYE,14),orientation:new T.Quaternion(),velocity:new T.Vector3()};
c.position.copy(p.position);c.lookAt(0,3.3,0);p.orientation.copy(c.quaternion);
const engine=new PortalRenderer(r), keys=new Set();let info={};
onkeydown=e=>keys.add(e.code);onkeyup=e=>keys.delete(e.code);
r.setAnimationLoop(()=>{
  p.velocity.set((keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),0,(keys.has('KeyS')?1:0)-(keys.has('KeyW')?1:0));
  advance(p,p.velocity.clone().multiplyScalar(.13),getWorld);
  c.position.copy(p.position);c.quaternion.copy(p.orientation);info=engine.draw(getWorld(p.id),c,getWorld,0);
  window.threshold.ready=true;
});
window.threshold={ready:false,inspect:()=>({id:p.id,...info})};
