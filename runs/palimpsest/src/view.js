'use strict';
function terrainTexture(){
  const c=document.createElement('canvas');c.width=c.height=256;
  const ctx=c.getContext('2d'),img=ctx.createImageData(256,256),r=randomSource(31);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const value=202+r()*45+6*Math.sin(x*.049+3*Math.sin(y*.025))+4*Math.cos(y*.0982);
    const i=(x+y*256)*4;img.data.set([value,value,value,255],i);
  }
  ctx.putImageData(img,0,0);
  for(let i=0;i<2200;i++){let a=r()*256,b=r()*256;ctx.fillStyle=r()>.44?'rgba(56,37,22,.20)':'rgba(255,255,234,.64)';ctx.fillRect(a,b,r()*2.2+.3,r()*1.15+.2);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;
}
function makeView(host,markers,onSelect){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setClearColor(0,0);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  host.prepend(renderer.domElement);const canvas=renderer.domElement;
  canvas.setAttribute('aria-label','Rotatable 3D excavation model');canvas.tabIndex=0;
  const scene=new THREE.Scene(),cam=new THREE.OrthographicCamera(-8,8,5,-5,.1,100);
  const hemi=new THREE.HemisphereLight(0xfff1d4,0xa28d76,1.72);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffdfa8,2.35);sun.position.set(-7,14,7);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10});sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00022;sun.shadow.normalBias=.015;scene.add(sun);
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,map:terrainTexture(),roughness:.98,side:THREE.DoubleSide});
  let mesh,angle=.60,elev=.52,zoom=1,drag=null,year=null,site,found;
  const pinPos=[[-2.48,1.66,1.09],[2.72,1.83,-1.55],[3.38,.55,2.39]];
  let targets=[];
  function draw(){
    if(!site)return;
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    const half=Math.max(7.95*h/w,4.45)/zoom;
    cam.left=-half*w/h;cam.right=half*w/h;cam.top=half;cam.bottom=-half;
    cam.position.set(Math.sin(angle)*Math.cos(elev)*22,.46+Math.sin(elev)*22,Math.cos(angle)*Math.cos(elev)*22);cam.lookAt(0,.46,0);cam.updateProjectionMatrix();cam.updateMatrixWorld();
    for(let i=0;i<markers.length;i++){
      const p=new THREE.Vector3(...pinPos[i]).project(cam);
      markers[i].style.left=(p.x*.5+.5)*100+'%';markers[i].style.top=(.5-p.y*.5)*100+'%';
    }
    renderer.render(scene,cam);
  }
  new ResizeObserver(()=>{if(host.clientWidth){renderer.setSize(host.clientWidth,host.clientHeight);draw();}}).observe(host);
  function load(s,ids,at=null){
    site=s;found=ids;year=at;
    if(mesh){scene.remove(mesh);mesh.geometry.dispose();}
    mesh=new THREE.Mesh(createModel(site,found,year),mat);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);draw();
  }
  canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,start:e.clientX,startY:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.classList.add('moving');};
  canvas.onpointermove=e=>{if(!drag)return;angle-=(e.clientX-drag.x)*.007;elev=Math.min(1.22,Math.max(.24,elev+(e.clientY-drag.y)*.005));drag.x=e.clientX;drag.y=e.clientY;draw();};
  canvas.onpointerup=e=>{
    if(drag&&Math.hypot(e.clientX-drag.start,e.clientY-drag.startY)<5&&year===null){
      const rect=canvas.getBoundingClientRect(),pt=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);
      const ray=new THREE.Raycaster();ray.setFromCamera(pt,cam);const hit=ray.intersectObject(mesh)[0];
      if(hit){const p=hit.point;onSelect(p.x<.3?0:p.z<.75?1:2);}
    }
    drag=null;canvas.classList.remove('moving');
  };
  canvas.onpointercancel=()=>{drag=null;canvas.classList.remove('moving');};
  function magnify(v){zoom=Math.max(.70,Math.min(1.8,zoom+v));draw();}
  canvas.onwheel=e=>{e.preventDefault();magnify(e.deltaY>0?-.06:.06);};
  canvas.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){angle+=e.key==='ArrowLeft'?-.15:.15;draw();e.preventDefault();}};
  return {load,magnify,draw,reset(){angle=.60;elev=.52;zoom=1;draw();},orbit(v){angle+=v;draw();}};
}
