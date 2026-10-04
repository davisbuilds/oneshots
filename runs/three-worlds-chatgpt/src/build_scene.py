"""Executed with Blender 4.0: blender -b -t 8 --python src/build_scene.py -- --study"""
import bpy, math, csv, sys, json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import OUTPUT as R, RUN_ROOT
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
study='--study' in args
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
s=bpy.context.scene; s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=32 if study else 256
s.cycles.use_denoising=False; s.cycles.max_bounces=8
s.render.threads_mode='FIXED';s.render.threads=8
s.render.resolution_x=960 if study else 3200;s.render.resolution_y=540 if study else 1800;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.color_depth='8'
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=.35
s.world.color=(.012,.018,.022)
def material(name,color,metal=0,rough=.5):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
copper=material('Hand-worked copper / sparse verdigris',(.52,.18,.065),1,.24)
n=copper.node_tree.nodes; l=copper.node_tree.links;p=n.get('Principled BSDF')
tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=3.6;tex.inputs['Detail'].default_value=5;tex.inputs['Roughness'].default_value=.7
r=n.new('ShaderNodeValToRGB');r.color_ramp.elements[0].position=.24;r.color_ramp.elements[0].color=(.024,.10,.075,1);r.color_ramp.elements[1].position=.43;r.color_ramp.elements[1].color=(.65,.255,.10,1)
r.color_ramp.elements.new(.7).color=(.37,.095,.027,1)
l.new(tex.outputs['Fac'],r.inputs[0]);l.new(r.outputs[0],p.inputs['Base Color'])
fine=n.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=180;fine.inputs['Detail'].default_value=2
b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.13;b.inputs['Distance'].default_value=.012;l.new(fine.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
stone=material('Basalt / procedural mineral grain',(.024,.032,.032),.10,.39)
n=stone.node_tree.nodes;l=stone.node_tree.links;p=n.get('Principled BSDF');t=n.new('ShaderNodeTexNoise');t.inputs['Scale'].default_value=78;t.inputs['Detail'].default_value=3
r=n.new('ShaderNodeValToRGB');r.color_ramp.elements[0].color=(.009,.014,.014,1);r.color_ramp.elements[1].color=(.065,.078,.076,1);l.new(t.outputs['Fac'],r.inputs[0]);l.new(r.outputs[0],p.inputs['Base Color'])
b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.27;b.inputs['Distance'].default_value=.018;l.new(t.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
floor=material('Gallery plaster',(.012,.018,.017),0,.72)
def cube(name,loc,scale,mat,bevel=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if bevel:
  m=o.modifiers.new('Soft dressed edges','BEVEL');m.width=bevel;m.segments=4;o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return o
def curve(name,pts,radius,mat):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=1;c.bevel_depth=radius;c.bevel_resolution=4;c.use_fill_caps=True
 sp=c.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,v in zip(sp.points,pts): p.co=(*v,1)
 o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);c.materials.append(mat);return o
rows=list(csv.DictReader(open(R/'data/lorenz-canonical.csv')))
pts=[(float(r['x'])/10,float(r['y'])/10,(float(r['z'])-6.26469892)/10+1.0) for r in rows]
sculpt=curve('MATTER — canonical open trajectory',pts,.014,copper)
cube('Floating basalt slab',(0,.05,.37),(4.8,3.15,.40),stone,.035)
cube('Recessed shadow foot',(0,.05,.12),(4.46,2.84,.24),stone,.015)
cube('Gallery floor',(0,0,-.07),(200,200,.1),floor)
# Infinite gallery floor creates a quiet seamless dark background.
# Visible, fine suspension cables: installation hardware, separate from the Lorenz curve.
wire=material('Suspension steel',(.13,.15,.145),.75,.4)
for k in [max((i for i,p in enumerate(pts) if p[0]<0),key=lambda i:pts[i][2]), max((i for i,p in enumerate(pts) if p[0]>0),key=lambda i:pts[i][2])]:
 v=pts[k];curve('Suspension cable', [v,(v[0],v[1],9)],.0015,wire)
def area(name,loc,target,power,color,size,shape='DISK',size_y=None):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape=shape;d.size=size
 if size_y is not None:d.size_y=size_y
 o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Large warm key',(-4,-4,7),(0,0,2.6),1250,(1,.77,.55),5,'RECTANGLE',2)
area('Cool edge softbox',(4,2,6),(0,0,3),1500,(.57,.78,1),4,'RECTANGLE',1.1)
area('Vertical copper reflection',(-3,1,4),(0,0,2.5),700,(1,.43,.18),3,'RECTANGLE',.45)
area('Front fill',(0,-7,5),(0,0,2.4),220,(.87,.94,1),5)
area('Plinth pool',(0,0,7),(0,0,0),250,(1,.87,.7),2)
bpy.ops.object.camera_add(location=(6,-24,7.3));cam=bpy.context.object;cam.name='Matched view — all three worlds';target=Vector((0,0,2.45));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=10.3;s.camera=cam;cam.data.lens=50
bpy.context.view_layer.update()
with open(R/'data/camera-projection.csv','w') as f:
 w=csv.writer(f);w.writerow(['u','v','depth'])
 for v in pts:
  q=world_to_camera_view(s,cam,Vector(v));w.writerow([q.x,1-q.y,q.z])
(R/'data/scene-transform.json').write_text(json.dumps({'xyz_to_blender':'(x/10, y/10, (z-6.26469892)/10+1.0)','camera_location':list(cam.location),'camera_target':list(target),'orthographic_scale':10.3,'tube_radius':.014,'cyclic':False},indent=2))
s.render.filepath='//'+('studies/04-matter-dark.png' if study else 'Matter.png')
bpy.ops.wm.save_as_mainfile(filepath=str(R/'One-Equation-Three-Worlds.blend'))
bpy.ops.render.render(write_still=True)
