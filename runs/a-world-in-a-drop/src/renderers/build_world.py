"""A WORLD IN A DROP — deterministic procedural Blender production.
Run: blender -b -t 5 --python source/build_world.py
All geometry and shaders are original; no downloaded visual assets.
"""
import bpy, math, random, os, sys, argparse
from mathutils import Vector, Matrix
from math import sin, cos, pi, exp
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
random.seed(8217)
FPS = 24
W,H = 1280,544
SCENES = [('01_The_Atlantic',240),('02_One_Drop',264),('03_Silica_Garden',288),('04_Inner_Tides',240),('05_The_Weave',240),('06_The_Witness',312)]

def mat(name, color, metallic=0, rough=.35, emission=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic; p.inputs['Roughness'].default_value=rough
    p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    return m

def noise_surface(m, scale, strength, detail=4):
    n=m.node_tree.nodes; l=m.node_tree.links; p=n.get('Principled BSDF')
    t=n.new('ShaderNodeTexNoise'); t.inputs['Scale'].default_value=scale; t.inputs['Detail'].default_value=detail
    b=n.new('ShaderNodeBump'); b.inputs['Strength'].default_value=strength; b.inputs['Distance'].default_value=.12
    l.new(t.outputs['Fac'],b.inputs['Height']); l.new(b.outputs['Normal'],p.inputs['Normal'])
    return t

def mesh(name, verts, faces, material):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o)
    if material:o.data.materials.append(material)
    for p in me.polygons:p.use_smooth=True
    return o

def uv(name, loc, scale, material, segments=32,rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=True
    return o

def curves(name, paths, radius, material, cyclic=False):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D';cu.resolution_u=2
    cu.bevel_depth=radius;cu.bevel_resolution=2;cu.resolution_u=2
    for pts in paths:
        sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
        for p,v in zip(sp.points,pts):p.co=(*v[:3],1);p.radius=v[3] if len(v)>3 else 1
        sp.use_cyclic_u=cyclic
    ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);cu.materials.append(material)
    return ob

def ring(name, r, z, material, width=.025, n=160, deform=0):
    return curves(name,[[(r*(1+deform*sin(7*t))*cos(t),r*(1+deform*sin(7*t))*sin(t),z) for t in [2*pi*i/n for i in range(n)]]],width,material,True)

def key(ob, prop, frame, value):
    setattr(ob,prop,value);ob.keyframe_insert(data_path=prop,frame=frame)

def linear(ob):
    if ob.animation_data and ob.animation_data.action:
        for fc in ob.animation_data.action.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'

def aim(ob, target):ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()

def camera(sc, keys, lens=42, focus=10, fstop=5.6):
    d=bpy.data.cameras.new('Lens');ob=bpy.data.objects.new('Camera',d);sc.collection.objects.link(ob);sc.camera=ob
    d.lens=lens;d.clip_start=.025;d.clip_end=600;d.dof.use_dof=True;d.dof.focus_distance=focus;d.dof.aperture_fstop=fstop
    first_direction=(Vector(keys[0][2])-Vector(keys[0][1])).normalized()
    up=Vector((0,1,0)) if abs(first_direction.z)>.8 else Vector((0,0,1))
    for f,loc,target in keys:
        ob.location=loc
        direction=(Vector(target)-Vector(loc)).normalized();right=direction.cross(up).normalized();vertical=right.cross(direction).normalized()
        ob.rotation_euler=Matrix((right,vertical,-direction)).transposed().to_euler()
        ob.keyframe_insert(data_path='location',frame=f);ob.keyframe_insert(data_path='rotation_euler',frame=f)
        d.dof.focus_distance=(Vector(loc)-Vector(target)).length;d.dof.keyframe_insert(data_path='focus_distance',frame=f)
    return ob

def area(name, loc, color, energy, size, target=(0,0,0)):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size
    ob=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(ob);ob.location=loc;aim(ob,target);return ob

def scene(name, length, world=(.008,.02,.03), strength=.3):
    sc=bpy.data.scenes.new(name);bpy.context.window.scene=sc
    sc.render.engine='CYCLES';sc.cycles.samples=20;sc.cycles.use_denoising=True
    sc.render.resolution_x=W;sc.render.resolution_y=H;sc.render.resolution_percentage=100
    sc.render.fps=FPS;sc.frame_start=1;sc.frame_end=length
    sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGB'
    sc.render.film_transparent=False
    sc.world=bpy.data.worlds.new(name+' atmosphere');sc.world.use_nodes=True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value=(*world,1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value=strength
    sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast';sc.view_settings.exposure=-.25
    sc.use_nodes=True;n=sc.node_tree.nodes;n.clear();l=sc.node_tree.links
    r=n.new('CompositorNodeRLayers');r.scene=sc
    g=n.new('CompositorNodeGlare');g.glare_type='FOG_GLOW';g.quality='MEDIUM';g.threshold=1.5;g.size=7;g.mix=-.88
    c=n.new('CompositorNodeComposite');l.new(r.outputs['Image'],g.inputs[0]);l.new(g.outputs[0],c.inputs[0])
    sc.render.filepath='//../frames/'+name+'/'
    return sc

def dust(name, count, bounds, material, size=.022, drift=(.3,0,.5), length=240):
    # Single mesh of low-poly spheres, animated as one cloud.
    verts=[];faces=[]
    for i in range(count):
        x,y,z=[random.uniform(*b) for b in bounds];r=size*random.uniform(.3,1.7);o=len(verts)
        verts.extend([(x+r,y,z),(x-r,y,z),(x,y+r,z),(x,y-r,z),(x,y,z+r),(x,y,z-r)])
        faces.extend([tuple(o+j for j in f) for f in [(0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)]])
    ob=mesh(name,verts,faces,material);key(ob,'location',1,(0,0,0));key(ob,'location',length,drift);linear(ob);return ob

def ocean():
    sc=scene(*SCENES[0],world=(.12,.2,.27),strength=.45)
    water=mat('Atlantic / cold graphite',(.008,.029,.041),.48,.29)
    noise_surface(water,260,.24,3)
    n=190;extent=180;verts=[];faces=[]
    def height(x,y):return .55*sin(.44*x+.31*y)+.32*sin(.81*y-.23*x)+.15*sin(1.35*x+.86*y)+.055*sin(3.7*x-2.4*y)
    for j in range(n):
        y=(j/(n-1)-.3)*extent
        for i in range(n):
            x=(i/(n-1)-.5)*extent;verts.append((x,y,height(x,y)))
    for j in range(n-1):
        for i in range(n-1):a=j*n+i;faces.append((a,a+1,a+n+1,a+n))
    sea=mesh('An unbroken moving sea',[(0,0,0)],[],water)
    sea.location.y=30
    ocean=sea.modifiers.new('Wind-driven ocean spectrum','OCEAN')
    ocean.geometry_mode='GENERATE';ocean.resolution=14;ocean.viewport_resolution=10
    ocean.spatial_size=100;ocean.size=1;ocean.repeat_x=3;ocean.repeat_y=3
    ocean.wave_scale=1.8;ocean.choppiness=2.2;ocean.wind_velocity=25;ocean.depth=100
    ocean.wave_scale_min=.05;ocean.wave_alignment=.25;ocean.wave_direction=.4;ocean.random_seed=8;ocean.use_normals=True
    ocean.use_foam=True;ocean.foam_coverage=.15;ocean.foam_layer_name='Sea foam'
    ocean.time=1;ocean.keyframe_insert(data_path='time',frame=1)
    ocean.time=5.5;ocean.keyframe_insert(data_path='time',frame=240)
    choptex=bpy.data.textures.new('Wind chop / short waves',type='CLOUDS');choptex.noise_scale=1.3;choptex.noise_depth=2
    chop=sea.modifiers.new('Short wind chop','DISPLACE');chop.texture=choptex;chop.strength=.34;chop.texture_coords='GLOBAL'
    wn=water.node_tree.nodes;wl=water.node_tree.links
    attr=wn.new('ShaderNodeAttribute');attr.attribute_name='Sea foam'
    ramp=wn.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.15;ramp.color_ramp.elements[0].color=(.008,.029,.041,1);ramp.color_ramp.elements[1].position=.78;ramp.color_ramp.elements[1].color=(.29,.38,.4,1)
    wl.new(attr.outputs['Fac'],ramp.inputs[0]);wl.new(ramp.outputs['Color'],wn.get('Principled BSDF').inputs['Base Color'])
    foam=mat('Foam / silver',(.25,.43,.47),.25,.4)
    paths=[]
    for k in range(180):
        x=random.uniform(-65,65);y=random.uniform(-4,100);pts=[]
        for j in range(18):
            xx=x+j*.13;yy=y+.13*sin(j*.3);pts.append((xx,yy,height(xx,yy)+.045,.25+.5*sin(pi*j/17)))
        if height(x,y)>.38:paths.append(pts)
    # Foam is generated from the wave spectrum rather than placed on the surface.
    # A cloudy luminous horizon, rendered as a procedural backdrop.
    sky=mat('Storm wall',(.13,.2,.26),0,1)
    ns=sky.node_tree.nodes;lk=sky.node_tree.links;p=ns.get('Principled BSDF')
    tex=ns.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=3.4;tex.inputs['Detail'].default_value=6;tex.inputs['Roughness'].default_value=.72
    ramp=ns.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.25;ramp.color_ramp.elements[0].color=(.008,.019,.03,1);ramp.color_ramp.elements[1].position=.78;ramp.color_ramp.elements[1].color=(.23,.34,.4,1)
    lk.new(tex.outputs['Fac'],ramp.inputs[0]);lk.new(ramp.outputs[0],p.inputs['Base Color']);lk.new(ramp.outputs[0],p.inputs['Emission Color']);p.inputs['Emission Strength'].default_value=.65
    mesh('Weather beyond the horizon',[(-200,135,-5),(200,135,-5),(200,135,100),(-200,135,100)],[(0,1,2,3)],sky)
    area('Break in the weather',(-15,55,35),(.56,.76,1),0,42)
    area('Pale horizon',(15,95,12),(.8,.89,1),0,25)
    # Broad cloud reflections, rather than a studio softbox reflected in the sea.
    wn=sc.world.node_tree.nodes;wl=sc.world.node_tree.links
    tc=wn.new('ShaderNodeTexCoord');cloud=wn.new('ShaderNodeTexNoise');cloud.inputs['Scale'].default_value=4;cloud.inputs['Detail'].default_value=5
    cr=wn.new('ShaderNodeValToRGB');cr.color_ramp.elements[0].position=.28;cr.color_ramp.elements[0].color=(.012,.025,.04,1);cr.color_ramp.elements[1].position=.73;cr.color_ramp.elements[1].color=(.42,.53,.64,1)
    wl.new(tc.outputs['Normal'],cloud.inputs['Vector']);wl.new(cloud.outputs['Fac'],cr.inputs[0]);wl.new(cr.outputs[0],wn['Background'].inputs[0]);wn['Background'].inputs[1].default_value=.8
    # Hero drop follows the camera down, then dominates the frame for the handoff.
    glass=mat('Rain / silver lens',(.63,.82,.86),.12,.055)
    p=glass.node_tree.nodes['Principled BSDF'];p.inputs['Coat Weight'].default_value=1;p.inputs['Transmission Weight'].default_value=.72;p.inputs['IOR'].default_value=1.333
    drop=uv('The drop',(0,-2,7),(.13,.13,.20),glass,48,32)
    for f,loc,s in [(1,(0,0,14),(.025,.025,.04)),(80,(.5,1,9),(.10,.10,.19)),(170,(.15,1.5,5),(.22,.22,.32)),(240,(0,1.5,3.0),(.85,.85,1.08))]:
        key(drop,'location',f,loc);key(drop,'scale',f,s)
    camera(sc,[(1,(0,-21,12),(0,80,8)),(100,(.5,-13,9),(.5,10,3)),(180,(.2,-8,5.8),(.1,4,3.4)),(240,(0,-3.0,3.5),(0,1.5,3))],lens=42,fstop=8)
    rain=mat('Rain streaks',(.33,.54,.65),.3,.3,.2)
    paths=[]
    for i in range(180):
        x=random.uniform(-18,18);y=random.uniform(-8,35);z=random.uniform(1,22)
        paths.append([(x,y,z),(x-.07,y+.03,z-.6)])
    r=curves('Falling rain',paths,.006,rain);key(r,'location',1,(0,0,4));key(r,'location',240,(1,0,-7));linear(r)
    return sc

def leaf():
    sc=scene(*SCENES[1],world=(.023,.06,.035),strength=.35)
    green=mat('Leaf / living jade',(.025,.17,.072),.18,.3);noise_surface(green,32,.27)
    p=green.node_tree.nodes['Principled BSDF'];p.inputs['Subsurface Weight'].default_value=.12
    veins=mat('Veins / chartreuse',(.055,.18,.035),.1,.44)
    def surface(x,y):return .15*x*x+.11*y*y+.10*sin(x*3+y*1.5)
    verts=[];faces=[];nu=100;nv=50
    for j in range(nu):
        y=-5+10*j/(nu-1);w=2.7*max(0,sin(pi*j/(nu-1)))**.75
        for i in range(nv):x=(-1+2*i/(nv-1))*w;verts.append((x,y,surface(x,y)))
    for j in range(nu-1):
        for i in range(nv-1):a=j*nv+i;faces.append((a,a+1,a+nv+1,a+nv))
    mesh('One rain-bent leaf',verts,faces,green)
    paths=[[(0,y,surface(0,y)+.035) for y in [-5+i*.05 for i in range(201)]]]
    fine=[]
    for j in range(17):
        y=-4+j*.48;w=2.7*max(0,sin(pi*(y+5)/10))**.75
        for side in [-1,1]:
            pts=[]
            for k in range(25):t=k/24;x=side*w*.94*t;yy=y+.65*t;pts.append((x,yy,surface(x,yy)+.035,1-.7*t))
            paths.append(pts)
            for k in range(3,22,3):
                x,yy,z,_=pts[k];fine.append([(x+side*t*.5,yy+t*.4,surface(x+side*t*.5,yy+t*.4)+.025) for t in [i/9 for i in range(10)]])
    curves('The branching vein',paths,.013,veins);curves('Capillary venation',fine,.004,veins)
    glass=mat('Droplet / lucid water',(.14,.38,.32),.42,.065)
    p=glass.node_tree.nodes['Principled BSDF'];p.inputs['Transmission Weight'].default_value=.65;p.inputs['IOR'].default_value=1.333;p.inputs['Coat Weight'].default_value=1
    drop=uv('The same drop',(0,0,3),(.7,.7,.95),glass,64,40)
    for f,loc,s in [(1,(0,0,3.4),(.42,.42,.65)),(62,(0,0,.8),(.7,.7,.8)),(77,(0,0,.37),(.94,.94,.35)),(103,(0,0,.65),(.74,.74,.69)),(145,(0,0,.56),(.80,.80,.59)),(264,(0,0,.56),(.8,.8,.59))]:key(drop,'location',f,loc);key(drop,'scale',f,s)
    # Delicate crown after impact, settling into the meniscus.
    ripple=mat('Meniscus glint',(.22,.59,.42),.65,.12)
    crown=curves('Impact crown',[[(.88*cos(t),.88*sin(t),.20+.22*(.5+.5*cos(12*t))) for t in [2*pi*i/192 for i in range(192)]]],.025,ripple,True)
    for f,s in [(1,(.001,)*3),(64,(.001,)*3),(80,(1,1,1)),(115,(1.4,1.4,.04)),(140,(.001,)*3)]:key(crown,'scale',f,s)
    for i in range(36):
        x=random.uniform(-1.9,1.9);y=random.uniform(-3.8,3.8)
        if x*x+y*y<1.5:continue
        r=random.uniform(.035,.13);uv('Satellite dew', (x,y,surface(x,y)+r*.6),(r,r,r*.7),glass,16,10)
    # Off-axis blurred leaves establish an immense canopy around the macro world.
    for i in range(16):
        o=uv('Canopy bokeh',(random.uniform(-12,12),random.uniform(1,15),random.uniform(-5,-2)),(random.uniform(1,3),random.uniform(2,4),.2),green,16,8);o.rotation_euler=(random.random(),random.random(),random.random()*pi)
    area('Storm skylight',(-3,1,8),(.48,.78,1),650,5)
    area('Amber beneath the canopy',(5,3,4),(1,.72,.30),550,3)
    area('Long silver catchlight',(-4,-3,5),(.75,1,1),600,2)
    camera(sc,[(1,(0,-2.4,3.8),(0,0,3.4)),(65,(2.8,-6,4),(0,0,.6)),(150,(1.4,-3.1,2.6),(0,0,.5)),(215,(.3,-1.45,1.35),(0,0,.6)),(264,(.03,-.44,.85),(0,0,.57))],lens=46,fstop=4)
    return sc

def diatom(name, pos, radius, material, pores, orient=(0,0,0)):
    # Siliceous rosette: concentric ribs and radial struts leave real apertures.
    paths=[]
    for k in range(1,17):
        rr=radius*k/16
        paths.append([(rr*(1+.009*sin(7*t+k))*cos(t),rr*(1+.009*sin(7*t+k))*sin(t),.20*radius*(1-(rr/radius)**2)+.012*sin(12*t)) for t in [2*pi*j/160 for j in range(160)]])
    ob=curves(name+' / circular frustule',paths,.009*radius,material,True)
    ribs=[]
    for k in range(72):
        t=2*pi*k/72;ribs.append([(radius*u*cos(t+.05*sin(4*u)),radius*u*sin(t+.05*sin(4*u)),.20*radius*(1-u*u)) for u in [.13+i*.87/25 for i in range(26)]])
    rib=curves(name+' / radial costae',ribs,.007*radius,material)
    bead=uv(name+' / nucleus',(0,0,.20*radius),(.10*radius,)*3,pores,24,16)
    # Perforated silica panels: true open pores, modelled rather than textured.
    vv=[];ff=[]
    for row in range(3,16):
        r0=radius*row/16;r1=radius*(row+1)/16;rm=(r0+r1)/2
        count=int(2*pi*rm/(radius*.072))
        for k in range(count):
            a=(k+.5*(row%2))*2*pi/count;da=pi/count
            start=len(vv)
            for boundary in [0,1]:
                for q in range(16):
                    theta=q*2*pi/16
                    if boundary==0:
                        xx=cos(theta)/max(abs(cos(theta)),abs(sin(theta)));yy=sin(theta)/max(abs(cos(theta)),abs(sin(theta)))
                    else:xx=.70*cos(theta);yy=.62*sin(theta)
                    rr=rm+(r1-r0)*.5*xx;aa=a+da*yy
                    zz=.20*radius*(1-(rr/radius)**2)+.010*sin(12*aa)
                    vv.append((rr*cos(aa),rr*sin(aa),zz))
            for q in range(16):ff.append((start+q,start+(q+1)%16,start+16+(q+1)%16,start+16+q))
    shell=mesh(name+' / open silica pores',vv,ff,material)
    root=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(root);root.location=pos;root.rotation_euler=orient
    for child in [ob,rib,bead,shell]:child.parent=root
    return root

def garden():
    sc=scene(*SCENES[2],world=(.006,.045,.055),strength=.45)
    silica=mat('Silica / opaline turquoise',(.10,.37,.36),.48,.3)
    gold=mat('Warm silica',(.66,.35,.09),.55,.29)
    heart=mat('Stored sunlight',(.8,.40,.095),.35,.22,.65)
    particle=mat('Suspended living light',(.21,.75,.69),.25,.3,1.3)
    main=diatom('Asterion / imagined diatom',(0,0,0),2.7,silica,heart,(0,0,.2))
    key(main,'rotation_euler',1,(.40,-.24,.1));key(main,'rotation_euler',288,(-.05,.06,.65))
    for i in range(20):
        a=random.uniform(0,2*pi);r=random.uniform(4,13);z=random.uniform(-12,2)
        ob=diatom('Drifting frustule %02d'%i,(r*cos(a),r*sin(a),z),random.uniform(.5,2.1),silica if i%3 else gold,heart,(random.uniform(-.7,.7),random.uniform(-.7,.7),a))
        loc=ob.location.copy();key(ob,'location',1,loc);key(ob,'location',288,loc+Vector((.4*sin(a),.7*cos(a),.35)))
        rot=Vector(ob.rotation_euler);key(ob,'rotation_euler',1,rot);key(ob,'rotation_euler',288,rot+Vector((.1,.1,.3)));linear(ob)
    # Fine filaments arc around the lens in layers.
    paths=[]
    for i in range(22):
        a=random.random()*2*pi;r=random.uniform(4,11)
        paths.append([(r*cos(a+t*.4),r*sin(a+t*.4),-14+27*t,.5+.5*sin(pi*t)) for t in [j/79 for j in range(80)]])
    curves('Threads of the surrounding water',paths,.018,silica)
    dust('Marine snow',550,[(-12,12),(-7,7),(-12,8)],particle,.019,drift=(.65,.3,1.0),length=288)
    area('Light filtered through water',(-4,4,8),(.25,.8,1),1600,7)
    area('A low amber sun',(4,-3,3),(1,.57,.22),1200,5)
    area('Depth light',(0,3,-5),(.1,.5,.55),1100,4)
    camera(sc,[(1,(.2,-.2,19),(0,0,0)),(100,(.65,-.25,16),(0,0,0)),(200,(.2,.15,8),(0,0,.12)),(288,(.01,.01,1.0),(0,0,.1))],lens=42,fstop=3.5)
    return sc

def membranes():
    sc=scene(*SCENES[3],world=(.012,.009,.027),strength=.35)
    teal=mat('Membrane / twilight',(.042,.17,.22),.5,.34);noise_surface(teal,7,.35)
    amber=mat('Membrane / amber',(.30,.085,.025),.5,.32)
    glow=mat('Membrane edge / phosphor',(.52,.21,.04),.45,.28,.65)
    dustmat=mat('Organelles',(.18,.7,.72),.4,.2,1)
    # A breathing tunnel made of folded annular bilayers.
    for j in range(18):
        z=3-j*1.7;r=2.5+.45*sin(j*.63);verts=[];faces=[];nt=144;nr=12
        for k in range(nr):
            u=k/(nr-1)
            for i in range(nt):
                a=2*pi*i/nt;rr=r+u*2.9+.24*sin(5*a+j*.6)+.15*sin(11*a+j)
                zz=z+.4*sin(3*a+j*.5)+.22*cos(8*a+u*4)+.75*sin(u*pi)
                verts.append((rr*cos(a),rr*sin(a),zz))
        for k in range(nr-1):
            for i in range(nt):a=k*nt+i;b=k*nt+(i+1)%nt;faces.append((a,b,b+nt,a+nt))
        ob=mesh('Folded bilayer %02d'%j,verts,faces,teal if j%3 else amber)
        key(ob,'rotation_euler',1,(0,0,j*.08));key(ob,'rotation_euler',240,(0,0,j*.08+.18*(-1)**j))
        edge=curves('A living boundary %02d'%j,[[(verts[i][0],verts[i][1],verts[i][2]) for i in range(nt)]],.024,glow,True)
        key(edge,'rotation_euler',1,(0,0,j*.08));key(edge,'rotation_euler',240,(0,0,j*.08+.18*(-1)**j))
        if j%2==0:
            for i in range(18):
                a=i*2*pi/18;uv('Vesicle',(3.4*cos(a),3.4*sin(a),z+.5),(.075,.075,.105),dustmat,12,8)
    dust('Intracellular drift',350,[(-5,5),(-5,5),(-26,5)],dustmat,.025,drift=(.3,.5,1.8))
    for j in range(5):area('Light within %d'%j,(0,0,6-j*7),(.3,.72,1) if j%2 else (1,.5,.17),260,3,target=(2,0,-j*7))
    camera(sc,[(1,(0,0,15),(0,0,-12)),(110,(.25,-.15,6),(0,0,-18)),(240,(0,0,-17),(0,0,-35))],lens=35,fstop=5.6)
    return sc

def weave():
    sc=scene(*SCENES[4],world=(.008,.017,.029),strength=.4)
    blue=mat('Filament / petrol blue',(.035,.29,.38),.72,.22)
    gold=mat('Filament / pale gold',(.64,.33,.075),.65,.26)
    light=mat('Filament / light',(.7,.44,.15),.4,.2,1.8)
    # The tunnel unravels into the radial architecture that will become an iris.
    roots=[]
    for group,material in enumerate([blue,gold,light]):
        paths=[]
        for i in range(90 if group<2 else 28):
            a=2*pi*(i/(90 if group<2 else 28))+.024*group;pts=[]
            for j in range(100):
                u=j/99;r=1.3+u*11.7;theta=a+.07*sin(9*u+a*4)+.12*(1-u)
                z=-2+1.2*sin(u*8+a*3)*(1-u)+.18*sin(u*42+a*7)
                pts.append((r*cos(theta),r*sin(theta),z,.45+.5*sin(pi*u)))
            paths.append(pts)
        ob=curves('The radial weave %d'%group,paths,.019 if group<2 else .009,material)
        key(ob,'rotation_euler',1,(0,0,-.2));key(ob,'rotation_euler',240,(0,0,.035));roots.append(ob)
    # Connected knots, rather than atomic diagrams: deliberately abstract.
    for i in range(110):
        a=random.uniform(0,2*pi);r=random.uniform(1.0,10);uv('A moment of coherence',(r*cos(a),r*sin(a),-1+random.uniform(-.5,.5)),(.035,)*3,light,12,8)
    ring('The aperture',1.3,-1.7,light,.017,deform=.025)
    dust('The last suspended lights',220,[(-11,11),(-5,5),(-2,7)],blue,.023,drift=(0,.4,1.2))
    area('Teal rake',(-5,4,5),(.19,.71,1),1700,6)
    area('Amber rake',(4,-1,3),(1,.57,.22),1250,4)
    camera(sc,[(1,(0,0,4.5),(.2,0,-2)),(100,(.1,0,8),(0,0,-2)),(240,(0,0,13.5),(0,0,-2))],lens=38,fstop=5)
    return sc

def witness_v1():
    """Initial sculptural eye, retained as a development study."""
    sc=scene(*SCENES[5],world=(.023,.038,.049),strength=.35)
    irisblue=mat('Iris / deep Atlantic',(.029,.21,.25),.35,.35)
    irisgold=mat('Iris / amber stroma',(.38,.20,.06),.35,.38)
    irisdark=mat('Iris / limbal ink',(.005,.019,.022),.18,.37)
    highlight=mat('Iris / pale silk',(.18,.42,.38),.3,.3)
    # Iris annulus with layered radial crypts; the same construction as the weave.
    verts=[];faces=[];nt=720;nr=22
    for j in range(nr):
        u=j/(nr-1);r=.68+u*1.95
        for i in range(nt):
            a=2*pi*i/nt;z=.15+.18*sin(u*pi)+.035*sin(a*97+u*5)+.015*sin(a*213-u*18)
            verts.append((r*cos(a),r*sin(a),z))
    for j in range(nr-1):
        for i in range(nt):a=j*nt+i;b=j*nt+(i+1)%nt;faces.append((a,b,b+nt,a+nt))
    body=mesh('The ocean-coloured iris',verts,faces,irisblue)
    body.data.materials.append(irisgold)
    for p in body.data.polygons:
        center=p.center
    for idx,p in enumerate(body.data.polygons):
        j=idx//nt;i=idx%nt
        if j<6+2*sin(i*.17):p.material_index=1
    for group,ma in enumerate([irisblue,irisgold,highlight,irisdark]):
        paths=[]
        for k in range(210):
            a=2*pi*k/210+group*.0065;pts=[]
            for j in range(48):
                u=j/47;r=.71+1.88*u+.035*sin(a*23+u*12);theta=a+.006*sin(16*u+a*17)+.004*sin(44*u+a*29)+.009*sin(u*8+a*71)
                z=.19+.18*sin(u*pi)+.024*sin(a*97+u*5)+.015*group+.019*sin(a*53+u*31)
                pts.append((r*cos(theta),r*sin(theta),z,.3+.7*sin(pi*u)**.5))
            paths.append(pts)
        curves('Radial iris fibres %d'%group,paths,.008 if group!=3 else .006,ma)
    for k in range(5):ring('Limbal boundary',2.58+k*.012,.17,irisdark,.015)
    ring('Collarette',1.12,.35,irisgold,.028,deform=.06)
    black=mat('Pupil / still darkness',(.001,.003,.004),.18,.2)
    uv('Pupil',(0,0,.11),(.70,.70,.13),black,64,24)
    # Almond-shaped sclera: a curved annulus from iris to lid, leaving pupil clear.
    sclera=mat('Sclera / soft ivory',(.20,.22,.20),.05,.36)
    sclera.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value=.15
    verts=[];faces=[];nt=300;nr=24
    for j in range(nr):
        u=j/(nr-1)
        for i in range(nt):
            a=2*pi*i/nt;x0=2.60*cos(a);y0=2.60*sin(a)
            x1=5.8*cos(a);y1=2.5*sin(a)*(.74+.26*abs(sin(a)))
            verts.append(((1-u)*x0+u*x1,(1-u)*y0+u*y1,.05-.7*u*u))
    for j in range(nr-1):
        for i in range(nt):a=j*nt+i;b=j*nt+(i+1)%nt;faces.append((a,b,b+nt,a+nt))
    mesh('The curved white of the eye',verts,faces,sclera)
    skin=mat('Skin / warm umber',(.115,.065,.047),.03,.47);noise_surface(skin,55,.17)
    mesh('Face receding into shadow',[(-22,-14,-1.7),(22,-14,-1.7),(22,14,-1.7),(-22,14,-1.7)],[(0,1,2,3)],skin)
    # Broad lid planes, disappearing into darkness at their outer edges.
    for side in [-1,1]:
        verts=[];faces=[];nu=180;nv=20;edge=[]
        for i in range(nu):
            x=-5.8+11.6*i/(nu-1);yy=side*2.5*max(0,1-(x/5.8)**2)**.65;edge.append((x,yy,-.52))
            for j in range(nv):
                u=j/(nv-1);verts.append((x*(1+u*.75),yy+side*u*5,-.5+.33*sin(u*pi)-u*.7))
        for i in range(nu-1):
            for j in range(nv-1):a=i*nv+j;faces.append((a,a+nv,a+nv+1,a+1))
        mesh('Upper lid' if side==1 else 'Lower lid',verts,faces,skin)
        curves('The wet lid margin',[edge],.075,skin)
        lashes=[]
        for i in range(13,170,4):
            x,y,z=edge[i];length=random.uniform(.17,.44)*(1 if side==1 else .5)
            lashes.append([(x+t*.20*math.copysign(1,x),y+side*length*t,z+.15*sin(t*pi/2)) for t in [j/8 for j in range(9)]])
        curves('Fine eyelashes',lashes,.012,irisdark)
    # An original ocean render is inserted here by finish_eye.py, as the corneal reflection.
    refl=mat('Corneal memory / ocean reflection',(.12,.27,.34),.25,.12,.2)
    verts=[(0,0,.58)];uvs=[(.5,.5)]
    for i in range(97):
        a=2*pi*i/96;verts.append((.64*cos(a),.64*sin(a),.55));uvs.append((.5+.5*cos(a),.5+.5*sin(a)))
    ob=mesh('The original ocean, reflected',verts,[(0,i+1,i+2) for i in range(96)],refl)
    uvlay=ob.data.uv_layers.new(name='Reflection UV')
    for p in ob.data.polygons:
        for li in p.loop_indices:uvlay.data[li].uv=uvs[ob.data.loops[li].vertex_index]
    # Corneal light, small enough to let the ocean remain readable.
    catch=mat('Corneal silver glint',(.6,.85,1),.4,.1,1.8)
    uv('The travelling glint returns',(-.36,.38,.65),(.095,.04,.015),catch,24,12)
    area('The ocean sky',(-3,5,7),(.54,.79,1),900,6)
    area('Warm edge of a watching face',(6,-1,5),(1,.62,.35),600,5)
    camera(sc,[(1,(0,0,9.0),(0,0,.1)),(70,(0,0,10.0),(0,0,.1)),(185,(0,0,15),(0,0,.1)),(260,(0,0,20.5),(0,0,.1)),(312,(.10,0,21.0),(0,0,.1))],lens=46,fstop=8)
    return sc

def witness():
    sys.path.insert(0,str(ROOT/'source'))
    from eye_world import build_eye
    return build_eye()

def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    initial=bpy.context.scene
    for fn in [ocean,leaf,garden,membranes,weave,witness]:
        sc=fn();sc.frame_set(1)
        for label,frame in [('Arrival',1),('Passage',sc.frame_end//2),('Threshold',sc.frame_end)]:sc.timeline_markers.new(label,frame=frame)
        print('BUILT',sc.name,flush=True)
    bpy.data.scenes.remove(initial)
    bpy.context.window.scene=bpy.data.scenes[SCENES[0][0]]
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'projects'/'A_World_in_a_Drop.blend'))
    if not (ROOT/'checkpoints'/'01_procedural_blocking.blend').exists():
        bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'checkpoints'/'01_procedural_blocking.blend'))

if __name__=='__main__':build()
