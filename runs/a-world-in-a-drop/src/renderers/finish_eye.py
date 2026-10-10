"""Pack the opening ocean into the corneal reflection and preserve a final checkpoint."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'studies'/'revision_02'/'01_The_Atlantic'/'0001.png'
if (ROOT/'frames'/'01_The_Atlantic'/'0001.png').exists():path=ROOT/'frames'/'01_The_Atlantic'/'0001.png'
im=bpy.data.images.load(str(path),check_existing=False);im.name='The original Atlantic / corneal memory';im.pack()
card=bpy.data.scenes['06_The_Witness'].objects.get('The original ocean / reflection card')
if card:
    m=card.data.materials[0]
    m.node_tree.nodes['Opening ocean image'].image=im
else:
    m=bpy.data.scenes['06_The_Witness'].objects['The original ocean, reflected'].data.materials[0];n=m.node_tree.nodes;n.clear();l=m.node_tree.links
    out=n.new('ShaderNodeOutputMaterial');tex=n.new('ShaderNodeTexImage');tex.image=im;tex.label='Opening frame, reflected in the watching iris'
    em=n.new('ShaderNodeEmission');em.inputs['Strength'].default_value=.8;l.new(tex.outputs['Color'],em.inputs[0]);l.new(em.outputs[0],out.inputs['Surface'])
# Readable when opened interactively, while preserving all six animated scenes.
for sc in bpy.data.scenes:
    sc.render.engine='CYCLES';sc.cycles.samples=20;sc.cycles.use_denoising=True
    sc.cycles.use_adaptive_sampling=True;sc.cycles.adaptive_threshold=.07;sc.cycles.adaptive_min_samples=4
    sc.render.threads_mode='FIXED';sc.render.threads=5
bpy.context.window.scene=bpy.data.scenes['06_The_Witness'];bpy.context.scene.frame_set(285)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'projects'/'A_World_in_a_Drop.blend'))
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'checkpoints'/'03_picture_lock.blend'))
