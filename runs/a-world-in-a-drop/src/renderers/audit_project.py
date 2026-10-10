"""Read-only structural audit of the portable Blender project."""
import bpy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
expected={'01_The_Atlantic':240,'02_One_Drop':264,'03_Silica_Garden':288,'04_Inner_Tides':240,'05_The_Weave':240,'06_The_Witness':312}
report={'blender':bpy.app.version_string,'scenes':{},'packed_images':[],'packed_sounds':[],'packed_fonts':[]}
for name,end in expected.items():
    s=bpy.data.scenes[name]
    assert s.camera and s.frame_end==end and s.camera.animation_data
    report['scenes'][name]={'frames':end,'fps':s.render.fps,'objects':len(s.objects),'camera':s.camera.name,'animated':True}
for im in bpy.data.images:
    if im.packed_file:report['packed_images'].append({'name':im.name,'width':im.size[0],'height':im.size[1]})
for sound in bpy.data.sounds:
    if sound.packed_file:report['packed_sounds'].append(sound.name)
for font in bpy.data.fonts:
    if font.packed_file:report['packed_fonts'].append(font.name)
cam=bpy.data.scenes['06_The_Witness'].camera
assert bpy.data.scenes['06_The_Witness'].objects['The curved cornea'].get('merged_pole')
roll=next(f for f in cam.animation_data.action.fcurves if f.data_path=='rotation_euler' and f.array_index==2)
assert abs(roll.evaluate(312))<.001,'Unexpected final camera roll'
assert report['packed_images'],'Missing packed ocean reflection'
if '00_EDIT' in bpy.data.scenes:
    edit=bpy.data.scenes['00_EDIT'];assert edit.frame_end==1488;assert report['packed_sounds']
    assert edit.view_settings.view_transform=='AgX'
    assert edit.view_settings.look=='AgX - Medium High Contrast'
    report['native_edit']={'duration':62,'strips':len(edit.sequence_editor.sequences),'audio_packed':True,'display_transform':edit.view_settings.view_transform}
print(json.dumps(report,indent=2))
(ROOT/'logs'/'project_audit.json').write_text(json.dumps(report,indent=2)+'\n')
