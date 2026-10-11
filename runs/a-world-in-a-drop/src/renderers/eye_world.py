"""Revised organic eye: layered stroma, corneal optics, curved lids and tapered lashes."""
import bpy,bmesh,math,random,sys
from math import sin,cos,pi,sqrt
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'source'))
from build_world import scene,mat,mesh,uv,curves,area,camera,noise_surface

def build_eye():
    random.seed(19181)
    s=scene('06_The_Witness',312,world=(.065,.085,.105),strength=.45)
    s.view_settings.exposure=.05
    # Warm tissue, softly mottled; pores are very small and low relief.
    skin=mat('Living skin / warm sienna',(.25,.135,.087),0,.46)
    p=skin.node_tree.nodes['Principled BSDF'];p.inputs['Subsurface Weight'].default_value=.17
    p.inputs['Subsurface Radius'].default_value=(1,.42,.22)
    noise_surface(skin,135,.075,2)
    mesh('Face continuing beyond the frame',[(-30,-20,-3),(30,-20,-3),(30,20,-3),(-30,20,-3)],[(0,1,2,3)],skin)
    waterline=mat('Lid margin / muted rose',(.28,.105,.075),0,.25)
    crease=mat('Lid crease / soft umber',(.075,.033,.022),0,.57)
    lashmat=mat('Eyelashes / brown black',(.004,.0025,.0018),0,.34)
    white=mat('Sclera / warm pearl',(.45,.43,.38),0,.28)
    white.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value=.13
    noise_surface(white,90,.045,2)
    sv=[];sf=[];sn=240;sr=45
    for j in range(sr):
        u=j/(sr-1)
        for i in range(sn):
            a=2*pi*i/sn;outside=1/sqrt((cos(a)/6)**2+(sin(a)/4.2)**2);rr=2.55+(outside-2.55)*u
            x=rr*cos(a);y=rr*sin(a);z=-2+2.3*sqrt(max(0,1-(x/6)**2-(y/4.2)**2));sv.append((x,y,z))
    for j in range(sr-1):
        for i in range(sn):a=j*sn+i;b=j*sn+(i+1)%sn;sf.append((a,a+sn,b+sn,b))
    mesh('The soft curve of the sclera / open iris aperture',sv,sf,white)

    # One polar-UV iris surface. Dense anisotropic detail breaks the radial order.
    iris=mat('Iris stroma / layered blue green',(.075,.17,.16),.03,.43)
    n=iris.node_tree.nodes;l=iris.node_tree.links;p=n['Principled BSDF']
    p.inputs['Subsurface Weight'].default_value=.065
    tex=n.new('ShaderNodeTexCoord');sep=n.new('ShaderNodeSeparateXYZ');l.new(tex.outputs['UV'],sep.inputs[0])
    mult=n.new('ShaderNodeVectorMath');mult.operation='MULTIPLY';mult.inputs[1].default_value=(240,5.5,1);l.new(tex.outputs['UV'],mult.inputs[0])
    fibers=n.new('ShaderNodeTexNoise');fibers.inputs['Scale'].default_value=1;fibers.inputs['Detail'].default_value=4;fibers.inputs['Roughness'].default_value=.78;l.new(mult.outputs[0],fibers.inputs['Vector'])
    grain=n.new('ShaderNodeValToRGB');grain.color_ramp.elements[0].position=.22;grain.color_ramp.elements[0].color=(.025,.042,.04,1);grain.color_ramp.elements[1].position=.78;grain.color_ramp.elements[1].color=(.4,.58,.53,1)
    l.new(fibers.outputs['Fac'],grain.inputs[0])
    radial=n.new('ShaderNodeValToRGB');r=radial.color_ramp
    r.elements.remove(r.elements[1]);r.elements[0].position=0;r.elements[0].color=(.25,.14,.055,1)
    for pos,col in [(.20,(.34,.26,.11,1)),(.40,(.14,.30,.25,1)),(.83,(.13,.29,.30,1)),(.97,(.008,.019,.022,1)),(1,(.003,.008,.01,1))]:r.elements.new(pos).color=col
    l.new(sep.outputs['Y'],radial.inputs[0])
    mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.75;l.new(radial.outputs[0],mix.inputs[1]);l.new(grain.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],p.inputs['Base Color'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.025;l.new(fibers.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    verts=[];faces=[];nt=640;nr=72;uvco=[]
    for j in range(nr):
        u=j/(nr-1)
        for i in range(nt):
            a=2*pi*i/nt;inner=.80+.006*sin(23*a)+.003*sin(61*a)
            rr=inner+(2.56-inner)*u
            z=.085+.025*sin(u*pi)+.012*sin(89*a+u*9)*sin(pi*u)+.007*sin(177*a-u*27)
            verts.append((rr*cos(a),rr*sin(a),z));uvco.append((i/nt,u))
    for j in range(nr-1):
        for i in range(nt):a=j*nt+i;b=j*nt+(i+1)%nt;faces.append((a,a+nt,b+nt,b))
    ob=mesh('Iris / continuous textured stroma',verts,faces,iris);uvlayer=ob.data.uv_layers.new(name='Polar stroma coordinates')
    for poly in ob.data.polygons:
        for li in poly.loop_indices:uvlayer.data[li].uv=uvco[ob.data.loops[li].vertex_index]
    # Thousands of short, tapered, branching fibrils, deliberately uneven.
    palette=[mat('Stromal fibrils / '+str(i),col,0,.45) for i,col in enumerate([(.08,.17,.145),(.045,.105,.10),(.16,.24,.19),(.18,.17,.09),(.025,.066,.073),(.10,.20,.21)])]
    groups=[[] for _ in palette]
    for i in range(930):
        a=random.uniform(0,2*pi);r0=random.uniform(.88,1.70);r1=random.uniform(2.25,2.55)
        if i%4==0:r0=random.uniform(1.5,2.2)
        phase=random.uniform(0,2*pi);pts=[]
        for k in range(28):
            t=k/27;rr=r0+(r1-r0)*t;aa=a+.006*sin(13*t+phase)+.008*sin(5*t+phase*2)
            z=.113+.014*sin(pi*t)+.006*sin(18*t+phase)
            pts.append((rr*cos(aa),rr*sin(aa),z,.12+.80*sin(pi*t)**.7))
        groups[i%len(groups)].append(pts)
        if i%3==0:
            branch=[]
            for k in range(12):
                t=k/11;rr=(r0+r1)*.5+(r1-r0)*.32*t;aa=a+.006+.024*t*t
                branch.append((rr*cos(aa),rr*sin(aa),.121,.75*(1-t)+.04))
            groups[i%len(groups)].append(branch)
    for i,paths in enumerate(groups):curves('Fine stromal branches %d'%i,paths,.0035,palette[i])
    # Irregular crypt openings and their subtle tissue banks.
    dark=mat('Crypt shadows',(.012,.027,.023),0,.6)
    vv=[];ff=[];banks=[]
    for i in range(75):
        a=2*pi*i/75+random.uniform(-.035,.035);r=random.uniform(1.12,1.72);length=random.uniform(.03,.13);width=random.uniform(.006,.024)
        start=len(vv);vv.append((r*cos(a),r*sin(a),.129));edge=[]
        for k in range(17):
            t=k*2*pi/16;rr=r+length*cos(t)*(1+.20*sin(3*t+i));aa=a+width/r*sin(t)
            v=(rr*cos(aa),rr*sin(aa),.132);vv.append(v);edge.append((*v,.3+.45*sin(pi*k/16)))
        for k in range(16):ff.append((start,start+1+k,start+2+k))
        banks.append(edge)
    mesh('Small shadowed iris crypts',vv,ff,dark);curves('Crypt tissue edges',banks,.0035,palette[2])
    pupil=mat('Pupil / absorbing depth',(.0001,.0002,.0002),0,1)
    uv('The natural dark pupil',(0,0,.02),(.825,.825,.07),pupil,80,32)

    # Thin, curved corneal shell: real refraction and reflected scene geometry.
    cornea=mat('Cornea / transparent living surface',(.97,.99,1),0,.023)
    p=cornea.node_tree.nodes['Principled BSDF'];p.inputs['Transmission Weight'].default_value=1;p.inputs['IOR'].default_value=1.376
    vv=[];ff=[];na=192;nb=48
    for j in range(nb):
        rr=2.62*j/(nb-1)
        for i in range(na):a=2*pi*i/na;vv.append((rr*cos(a),rr*sin(a),-1.78+sqrt(3.2**2-rr**2)))
    for j in range(nb-1):
        for i in range(na):a=j*na+i;b=j*na+(i+1)%na;ff.append((a,a+na,b+na,b))
    cor=mesh('The curved cornea',vv,ff,cornea)
    bm=bmesh.new();bm.from_mesh(cor.data)
    pole=[v for v in bm.verts if v.co.x*v.co.x+v.co.y*v.co.y<1e-12]
    bmesh.ops.remove_doubles(bm,verts=pole,dist=.00001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(cor.data);bm.free();cor.data.update();cor['merged_pole']=True
    solid=cor.modifiers.new('Corneal thickness','SOLIDIFY');solid.thickness=.035

    def boundary(a):
        x=5.10*cos(a);y=(2.10 if sin(a)>=0 else 1.78)*math.copysign(abs(sin(a))**1.55,sin(a))+.15*cos(a)
        rr=sqrt(x*x+y*y)
        scl=-2+2.3*sqrt(max(.02,1-(x/6)**2-(y/4.2)**2))
        corn=-1.78+sqrt(max(.01,3.2**2-min(rr,2.62)**2))
        w=max(0,min(1,(2.75-rr)/.25));z=(corn*w+scl*(1-w))+.11
        return Vector((x,y,z))
    # A single continuous annulus removes the angular gaps of the first study.
    vv=[];ff=[];nt=360;nr=42
    for j in range(nr):
        u=j/(nr-1)
        for i in range(nt):
            a=2*pi*i/nt;p0=boundary(a);outer=Vector((10*cos(a),6.7*sin(a),-.45-.013*(10*cos(a))**2))
            p0=p0.lerp(outer,u);p0.z+=.33*sin(pi*min(1,u*2.7))*math.exp(-u*2.0)
            # Extend the remote face surface beyond the widest camera framing.
            extension=max(0,(u-.60)/.40)**2
            p0+=Vector((5*cos(a),3.3*sin(a),-.5))*extension
            vv.append(tuple(p0))
    for j in range(nr-1):
        for i in range(nt):a=j*nt+i;b=j*nt+(i+1)%nt;ff.append((a,a+nt,b+nt,b))
    face=mesh('Continuous upper and lower eyelids',vv,ff,skin)
    face['extended_for_final_camera']=True
    edge=[(*boundary(2*pi*i/360),1) for i in range(360)]
    curves('Wet lid margin',[edge],.033,waterline,True)
    fold=[]
    for i in range(150):
        a=.06+(pi-.12)*i/149;p0=boundary(a);p0.y+=.39*sin(a)**.5;p0.z+=.03
        fold.append((*p0,.05+.85*sin(pi*i/149)))
    curves('The soft upper eyelid crease',[fold],.018,crease)
    # Long, curved, tapering lashes; upper and lower rows have distinct lengths.
    for side,count in [(1,78),(-1,45)]:
        paths=[]
        for i in range(count):
            if random.random()<.07:continue
            a=.10+(pi-.20)*(i+random.uniform(-.32,.32))/(count-1)
            if side<0:a=-a
            root=boundary(a);L=random.uniform(.80,1.48) if side>0 else random.uniform(.32,.65)
            L*=.70+.30*abs(cos(a));lean=.18*sin((i//3)*2.7)+.16*math.copysign(1,root.x)+random.uniform(-.13,.13)
            pts=[]
            for j in range(18):
                t=j/17;x=root.x+lean*L*(t+.6*t*t);y=root.y+side*L*(.22*t+.64*t*t);z=root.z+.10+.5*L*sin(pi*.80*t)
                pts.append((x,y,z,(1-t)**.8*(.72+random.random()*.12)+.008))
            paths.append(pts)
        curves('Upper curved eyelashes' if side>0 else 'Lower curved eyelashes',paths,.018 if side>0 else .011,lashmat)
    duct=mat('Inner corner / soft caruncle',(.32,.11,.085),0,.29)
    p0=boundary(pi);uv('Inner tear duct',p0+Vector((.17,0,-.025)),(.20,.10,.07),duct,24,16)
    # Fine scleral vessels only near the corners, with shallow branching.
    red=mat('Scleral capillaries',(.28,.18,.15),0,.5)
    paths=[]
    for side in [-1,1]:
        for i in range(9):
            x=side*random.uniform(3.8,4.9);y=random.uniform(-.8,1.0);pts=[];length=random.uniform(.5,.9)
            for k in range(14):
                t=k/13;xx=x-side*t*length;yy=y+.10*sin(pi*t+i*.3)+.012*sin(t*10+i)
                z=-2+2.3*sqrt(max(.02,1-(xx/6)**2-(yy/4.2)**2))+.007
                pts.append((xx,yy,z,.7*(1-t)+.05))
            paths.append(pts)
    curves('Delicate scleral vessels',paths,.004,red)

    # Reflected ocean card, invisible to the camera but visible to glossy rays.
    reflection=mat('Corneal memory / actual ocean card',(1,1,1),0,1)
    n=reflection.node_tree.nodes;n.clear();l=reflection.node_tree.links
    out=n.new('ShaderNodeOutputMaterial');em=n.new('ShaderNodeEmission');em.inputs['Strength'].default_value=9
    tx=n.new('ShaderNodeTexImage');tx.name='Opening ocean image'
    opening=ROOT/'frames'/'01_The_Atlantic'/'0001.png'
    if opening.exists():
        image=bpy.data.images.load(str(opening),check_existing=False);image.name='The original Atlantic / corneal memory';image.pack()
    else:image=next((x for x in bpy.data.images if 'original Atlantic' in x.name),None)
    if image:tx.image=image
    l.new(tx.outputs[0],em.inputs[0]);l.new(em.outputs[0],out.inputs[0])
    ob=mesh('The original ocean / reflection card',[(-4,-.6,7),(4,-.6,7),(4,1.4,7),(-4,1.4,7)],[(0,1,2,3)],reflection)
    uvlay=ob.data.uv_layers.new(name='Ocean card coordinates')
    for li,co in zip(ob.data.polygons[0].loop_indices,[(0,0),(1,0),(1,.60),(0,.60)]):uvlay.data[li].uv=co
    ob.visible_camera=False;ob.visible_shadow=False;ob.visible_diffuse=False;ob.visible_transmission=False
    # A long, soft sky catchlight; smaller amber fill brings life to the lids.
    lamp=area('Overcast ocean sky',(-3,4,8),(.65,.81,1),650,5,target=(0,0,0));lamp.data.shape='RECTANGLE';lamp.data.size=4;lamp.data.size_y=1.5
    camera(s,[(1,(0,0,9.0),(0,0,.1)),(70,(0,0,10.0),(0,0,.1)),(185,(0,0,15),(0,0,.1)),(260,(0,0,20.5),(0,0,.1)),(312,(.10,0,21),(0,0,.1))],lens=46,fstop=8)
    s.frame_set(1)
    return s

def replace_eye():
    old=bpy.data.scenes.get('06_The_Witness')
    if old:
        # Switch away before removing the old scene and its unique objects.
        bpy.context.window.scene=bpy.data.scenes['01_The_Atlantic']
        objects=list(old.objects);bpy.data.scenes.remove(old)
        for ob in objects:
            if not ob.users_scene:bpy.data.objects.remove(ob,do_unlink=True)
    build_eye()
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'projects'/'A_World_in_a_Drop.blend'))
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'checkpoints'/'05_organic_eye_revision.blend'))

if __name__=='__main__':replace_eye()
