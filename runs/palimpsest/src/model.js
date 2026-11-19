'use strict';
// All coordinates are metres. The builder batches chipped stone, strata and vegetation
// into one indexed-by-order triangle stream so software WebGL can orbit the site.
function createModel(site,found,year=null){
  const pos=[],col=[],uv=[];
  let rand=randomSource(site.seed);
  const rr=(a,b)=>a+(b-a)*rand(), pick=a=>a[Math.floor(rand()*a.length)];
  const palette=['#baa07a','#af9670','#bda481','#c4ab83','#a98e68','#cab18b'];
  const stone=()=>pick(palette), dirt=['#957850','#a68a61','#b19468','#ac9165'];
  const history=year!==null, alive=history && year<site.events.at(-1).year;
  function tri(a,b,c,color,gain=1){
    const shade=new THREE.Color(color).multiplyScalar(gain);
    const ab=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),ac=new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
    const n=ab.cross(ac);
    const horizontal=Math.abs(n.y)>Math.max(Math.abs(n.x),Math.abs(n.z));
    for(const p of [a,b,c]){
      pos.push(...p);col.push(shade.r,shade.g,shade.b);
      uv.push((horizontal?p[0]:p[0]+p[2])*.52,(horizontal?p[2]:p[1])*.52);
    }
  }
  function rings(bottom,top,color){
    for(let i=0;i<bottom.length;i++){
      const j=(i+1)%bottom.length,g=rr(.96,1.04);
      tri(bottom[i],top[i],top[j],color,g);tri(bottom[i],top[j],bottom[j],color,g);
    }
    for(let i=1;i<top.length-1;i++)tri(top[0],top[i+1],top[i],color);
  }
  function block(x,y,z,w,h,d,c=stone(),angle=0,rough=.04){
    const cut=Math.min(w,d)*rr(.055,.13),cs=Math.cos(angle),sn=Math.sin(angle);
    const pts=[[-w/2+cut,-d/2],[w/2-cut,-d/2],[w/2,-d/2+cut],[w/2,d/2-cut],[w/2-cut,d/2],[-w/2+cut,d/2],[-w/2,d/2-cut],[-w/2,-d/2+cut]];
    const ring=(dy,s,j)=>pts.map(([u,v])=>[x+(u*cs-v*sn)*s+rr(-j,j),y+dy+rr(-j,j),z+(u*sn+v*cs)*s+rr(-j,j)]);
    const r0=ring(0,.97,0),r1=ring(h*.86,1,Math.min(rough,h*.1)),r2=ring(h,.94,Math.min(rough,h*.09));
    rings(r0,r1,c);rings(r1,r2,c);
  }
  function tube(x,z,y,h,r1,r2,c,facets=12,offset=[0,0]){
    const ring=(radius,dy,ox,oz)=>Array.from({length:facets},(_,i)=>[x+ox+Math.cos(i*2*Math.PI/facets)*radius,y+dy,z+oz+Math.sin(i*2*Math.PI/facets)*radius]);
    rings(ring(r1,0,0,0),ring(r2,h,...offset),c);
  }
  const locations=[[-2.8,1.85],[2.65,-1.0],[2.55,2.55]];
  const height=(x,z)=>.08*Math.sin(x*1.7)+.06*Math.sin(z*2.3+x*.5)+.09*Math.cos(x*.6-z);
  const halfX=6.1,halfZ=4.25,nx=44,nz=32;
  const grid=[];
  for(let j=0;j<=nz;j++){
    grid[j]=[];
    for(let i=0;i<=nx;i++){
      let x=(i/nx*2-1)*halfX,z=(j/nz*2-1)*halfZ;
      const edge=Math.pow(Math.abs(x/halfX),7)*Math.pow(Math.abs(z/halfZ),7);
      x*=1-.10*edge;z*=1-.12*edge;
      x+=rr(-.073,.073);z+=rr(-.068,.068);
      grid[j][i]=[x,height(x,z)+rr(-.045,.045),z];
    }
  }
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    let a=grid[j][i],b=grid[j+1][i],c=grid[j+1][i+1],d=grid[j][i+1];
    const soil='#ab916a',v=rr(.91,1.07);tri(a,b,c,soil,v);tri(a,c,d,soil,v);
  }
  const perimeter=[...grid[0],...grid.slice(1).map(row=>row[nx]),...grid[nz].slice(0,nx).reverse(),...grid.slice(1,nz).reverse().map(row=>row[0])];
  let upper=perimeter;
  const strata=['#9c7449','#aa8056','#94704c','#af9271','#b69871','#886747','#785940','#8f6b48','#a37c53','#836345','#795c46','#694e3b'];
  for(let k=0;k<12;k++){
    const layer=site.deposits[3-Math.floor(k/3)],thickness=(layer.bottom-layer.top)/site.deposits[0].bottom*1.95/3+.03;
    const lower=upper.map(([x,y,z],i)=>[x*.998+rr(-.03,.03),y-thickness+Math.sin(i*.16+k*.8)*.018+rr(-.022,.022),z*.998+rr(-.03,.03)]);
    for(let i=0;i<upper.length;i++){
      const j=(i+1)%upper.length,g=rr(.87,1.09);
      tri(upper[i],upper[j],lower[j],strata[k],g);tri(upper[i],lower[j],lower[i],strata[k],g);
      if(rand()>.48){const a=lower[i],b=upper[i],m=[a[0]*1.004,(a[1]+b[1])/2,a[2]*1.004],v=rr(.025,.085);
        tri(m,[m[0]+(lower[j][0]-a[0])*.6,m[1]+v*.2,m[2]+(lower[j][2]-a[2])*.6],[m[0],m[1]+v,m[2]],pick(dirt));}
    }
    upper=lower;
  }
  function paving(x,z,w,d,base,n,m){
    for(let i=0;i<n;i++)for(let j=0;j<m;j++)
      block(x-w/2+(i+.5)*w/n,base,z-d/2+(j+.5)*d/m,w/n-.016,.18+rr(-.02,.025),d/m-.016);
  }
  function wall(x,z,n,levels,angle,broken){
    const along=[Math.cos(angle),Math.sin(angle)];
    for(let row=0;row<levels;row++)for(let i=0;i<n;i++){
      let u=i+.5+(row%2)*.43;
      if(u>n)continue;
      if(broken && row>=Math.max(1,Math.floor(levels*(.67+.41*Math.cos(i*1.2+angle)))))continue;
      block(x+u*.61*along[0],.1+row*.285,z+u*.61*along[1],.605,.29,.40,stone(),angle);
    }
  }
  function column(x,z,n,cap){
    block(x,.48,z,.85,.18,.83);
    tube(x,z,.66,.15,.40,.365,stone(),16);
    tube(x,z,.81,.13,.34,.31,stone(),16);
    for(let i=0;i<n;i++)tube(x,z,.94+i*.38,.37,.297-i*.004,.295-i*.004,stone(),16);
    if(cap){const y=.94+n*.38;tube(x,z,y,.16,.29,.41,stone(),16);block(x,y+.16,z,.84,.21,.82);}
  }
  const visible=site.buildings.filter(b=>!history||site.events[b.origin].year<=year);
  for(const b of visible){
    rand=randomSource(site.seed+b.origin*997);
    if(b.type==='court'){
      paving(-2.05,-.67,4.42,3.24,.01,6,4);paving(-2.05,-.79,4.16,2.83,.22,6,4);
      for(let i=0;i<3;i++)block(-2.0,.02+i*.13,1.33-i*.21,2.65-i*.05,.14,.4);
      for(let row=0;row<2;row++)for(let i=0;i<3;i++)column(-3.68+i*1.6,-1.82+row*2.03,alive?7:([7,7,3,6,2,1][row*3+i]),alive||row===0&&i<2);
      block(-2.88,3.96,-1.82,2.46,.32,.69);block(-2.88,4.28,-1.82,2.55,.12,.75);
      if(alive){block(-2.05,3.96,.21,4.14,.3,.69);block(-2.05,4.29,-.8,4.6,.24,3.22,'#8b6547');}
      wall(-4.15,-2.28,7,3,0,!alive);
      if(!alive){for(let i=0;i<3;i++)block(-1.1+i*.38,.44,-.75,.36,.46,.56,stone(),.18);}
    }
    if(b.type==='granary'){
      paving(2.52,-1.48,3.5,2.55,.01,5,4);
      wall(.73,-2.92,6,alive?7:6,0,!alive);wall(4.30,-2.9,5,alive?7:5,Math.PI/2,!alive);
      wall(.75,-2.8,5,alive?7:4,Math.PI/2,!alive);wall(.75,.05,2,4,0,!alive);wall(3.12,.05,2,4,0,!alive);wall(2.52,-2.75,3,3,Math.PI/2,!alive);
      if(alive)block(2.52,2.15,-1.44,3.9,.21,3.25,'#95714e');
    }
    if(b.type==='quay'){
      paving(2.55,2.23,4.0,1.7,-.03,7,4);
      wall(.62,3.21,7,2,0,true);wall(4.58,1.15,3,2,Math.PI/2,true);
      if(!alive)for(let i=0;i<15;i++)block(rr(.5,4.3),.11,rr(1.2,3.07),rr(.2,.5),rr(.06,.25),rr(.2,.35),stone(),rr(-.4,.4));
    }
    if(b.type==='hearth'){wall(-.1,-3.56,5,alive?4:3,0,!alive);wall(-.1,-3.56,2,3,Math.PI/2,!alive);}
    if(b.type==='intake'){for(let i=0;i<8;i++){block(-5.0+i*.31,.04,1.93,.30,.12,.22);block(-5+i*.31,.06,2.44,.3,.15,.23);}block(-3.1,.04,2.18,.26,.20,.30);}
  }
  // Modern square sondages expose the specific depth reached in each trench.
  if(!history)for(let zone=0;zone<3;zone++){
    const records=site.finds.filter(f=>f.zone===zone&&found.includes(f.id)&&f.depth>0);
    if(!records.length)continue;
    const [x,z]=locations[zone],d=Math.max(...records.map(f=>f.depth))/site.deposits[0].bottom;
    block(x,.19,z,.96,.025,.78,'#59452e');
    for(let i=0;i<3;i++)block(x+.24-i*.19,.223+i*.046,z,.18,.03,.74,pick(dirt));
    block(x-.58,.06,z-.39,.36,.12+d*.28,.42,'#a38158');
  }
  rand=randomSource(site.seed+355);
  function tree(x,z,h){
    let y=height(x,z),c='#594d38';
    tube(x,z,y,h*.58,.10,.057,c,7,[.07,0]);
    for(let branch=0;branch<7;branch++){
      const angle=rr(0,6.28),span=h*rr(.14,.32),dx=Math.cos(angle)*span,dz=Math.sin(angle)*span;
      tube(x+.05,z,y+h*.32,h*.35,.053,.027,c,6,[dx,dz]);
      for(let n=0;n<12;n++){
        let a=rr(0,6.28),rad=rr(0,.32),cx=x+dx+Math.cos(a)*rad,cz=z+dz+Math.sin(a)*rad,cy=y+h*.67+rr(-.18,.26),s=rr(.15,.32);
        const green=pick(['#666d43','#7e8352','#777c4b','#939063','#62673b']);
        tube(cx,cz,cy,s*.72,s*.55,s,green,7);tube(cx,cz,cy+s*.72,s*.78,s,s*.21,green,7);
      }
    }
  }
  tree(-4.92,-2.45,2.35);tree(4.94,-2.5,1.7);tree(-5.17,.42,1.05);
  const open=(x,z)=> !visible.some(b=>b.type==='court'&&x>-4.5&&x<.35&&z>-2.55&&z<1.59 || b.type==='granary'&&x>.50&&x<4.5&&z>-3.12&&z<.4 || b.type==='quay'&&x>.4&&x<4.75&&z>1.0&&z<3.4);
  for(let i=0;i<1450;i++){
    const x=rr(-5.84,5.84),z=rr(-4,4),y=height(x,z);
    if(!open(x,z))continue;
    if(i%4===0){let s=rr(.055,.26);block(x,y-.02,z,s,rr(.06,.17),s*.8,pick(dirt),rr(0,6));}
    else if(Math.sin(x*2.1+z*3)>.06){
      let c=pick(['#7b7643','#8e8655','#a29564','#737347']);
      for(let k=0;k<8;k++){let a=rr(0,6.28),h=rr(.07,.28);tri([x-.021,y,z],[x+.026,y,z+.018],[x+Math.cos(a)*h*.65,y+h,z+Math.sin(a)*h*.65],c);}
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();
  return geo;
}
