"""Build a portable native Blender scene-strip edit, with the original score packed."""
import bpy,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
names=['01_The_Atlantic','02_One_Drop','03_Silica_Garden','04_Inner_Tides','05_The_Weave','06_The_Witness']
starts=[1,205,433,685,889,1093]
sc=bpy.data.scenes.get('00_EDIT') or bpy.data.scenes.new('00_EDIT')
bpy.context.window.scene=sc
sc.render.resolution_x=1280;sc.render.resolution_y=544;sc.render.resolution_percentage=100
sc.render.fps=24;sc.frame_start=1;sc.frame_end=1488
sc.render.engine='CYCLES';sc.cycles.samples=12
sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast'
# Scene strips carry scene-linear pixels. Apply the same display transform as
# the source worlds and ease exposure through each overlapping scene change.
for i,(name,start) in enumerate(zip(names,starts)):
    exposure=bpy.data.scenes[name].view_settings.exposure
    if i:
        sc.view_settings.exposure=bpy.data.scenes[names[i-1]].view_settings.exposure
        sc.view_settings.keyframe_insert(data_path='exposure',frame=start)
    sc.view_settings.exposure=exposure
    sc.view_settings.keyframe_insert(data_path='exposure',frame=start+(36 if i else 0))
sc.sequence_editor_clear();ed=sc.sequence_editor_create();seq=ed.sequences
clips=[]
for i,(name,start) in enumerate(zip(names,starts)):
    st=seq.new_scene(name,bpy.data.scenes[name],1+i%2,start);st.scene_input='CAMERA';clips.append(st)
    sc.timeline_markers.new(name.replace('_',' '),frame=start)
    if i:
        seq.new_effect('Dissolve / a change of scale',type='GAMMA_CROSS',channel=3,frame_start=start,frame_end=start+36,seq1=clips[i-1],seq2=st)
black=seq.new_effect('Quiet darkness',type='COLOR',channel=4,frame_start=1364,frame_end=1489);black.color=(0,0,0)
black.blend_type='ALPHA_OVER'
for f,v in [(1364,0),(1405,1)]:black.blend_alpha=v;black.keyframe_insert('blend_alpha',frame=f)
opening=seq.new_effect('Arriving out of darkness',type='COLOR',channel=4,frame_start=1,frame_end=30);opening.color=(0,0,0);opening.blend_type='ALPHA_OVER'
for f,v in [(1,1),(29,0)]:opening.blend_alpha=v;opening.keyframe_insert('blend_alpha',frame=f)
font=bpy.data.fonts.load(str(ROOT/'source'/'fonts'/'DejaVuSerif.ttf'));font.pack()
title=seq.new_effect('A World in a Drop',type='TEXT',channel=6,frame_start=1417,frame_end=1489)
title.text='A World in a Drop';title.font=font;title.font_size=38;title.color=(.80,.85,.86,1);title.location=(.5,.52);title.align_x='CENTER';title.align_y='CENTER'
title.blend_type='ALPHA_OVER'
for f,v in [(1417,0),(1441,1),(1465,1),(1488,0)]:title.blend_alpha=v;title.keyframe_insert('blend_alpha',frame=f)
sub=seq.new_effect('An imagined journey',type='TEXT',channel=7,frame_start=1424,frame_end=1489)
sub.font=bpy.data.fonts.load(str(ROOT/'source'/'fonts'/'DejaVuSans.ttf'));sub.font.pack()
sub.text='A N   I M A G I N E D   J O U R N E Y';sub.font_size=10;sub.color=(.44,.53,.56,1);sub.location=(.5,.42);sub.align_x='CENTER';sub.align_y='CENTER';sub.blend_type='ALPHA_OVER'
for f,v in [(1424,0),(1448,1),(1465,1),(1488,0)]:sub.blend_alpha=v;sub.keyframe_insert('blend_alpha',frame=f)
sound=seq.new_sound('Original score / sea, glass, breath',str(ROOT/'audio'/'original_score.wav'),8,1);sound.volume=10**(-1.4/20)
sc.timeline_markers.new('The original ocean returns in the pupil',frame=1165)
sc.timeline_markers.new('A World in a Drop',frame=1417)
sc.frame_set(1250)
sc.render.image_settings.file_format='FFMPEG';sc.render.ffmpeg.format='MPEG4';sc.render.ffmpeg.codec='H264';sc.render.ffmpeg.constant_rate_factor='HIGH';sc.render.ffmpeg.audio_codec='AAC'
sc.render.filepath='//../delivery/native_scene_edit.mp4'
# Open on the editable strips, avoiding an empty 3D view of the edit scene.
if bpy.context.screen:
    areas=[a for a in bpy.context.screen.areas if a.type=='VIEW_3D']
    if areas:
        area=max(areas,key=lambda a:a.width*a.height)
        area.type='SEQUENCE_EDITOR';area.spaces.active.view_type='SEQUENCER'
        region=next((r for r in area.regions if r.type=='WINDOW'),None)
        if region:
            with bpy.context.temp_override(area=area,region=region):
                bpy.ops.sequencer.view_all()
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'projects'/'A_World_in_a_Drop_EDIT.blend'))
