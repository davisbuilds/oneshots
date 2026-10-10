"""Render the six selected 1920 x 816 publication stills from native geometry."""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
shots=[('01_The_Atlantic',1,'01_The_Atlantic'),('02_One_Drop',120,'02_One_Drop'),('03_Silica_Garden',145,'03_Silica_Garden'),('04_Inner_Tides',145,'04_Inner_Tides'),('05_The_Weave',145,'05_The_Weave'),('06_The_Witness',240,'06_The_Witness')]
for name,frame,title in shots:
    s=bpy.data.scenes[name];bpy.context.window.scene=s;s.frame_set(frame)
    s.render.resolution_x=1920;s.render.resolution_y=816;s.render.resolution_percentage=100
    s.render.engine='CYCLES';s.cycles.samples=64;s.cycles.adaptive_threshold=.045;s.cycles.adaptive_min_samples=8;s.cycles.use_denoising=True
    s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.color_depth='8'
    out=ROOT/'stills'/f'{title}.png'
    if out.exists():continue
    s.render.filepath=str(out);bpy.ops.render.render(write_still=True)
    print('STILL',out,flush=True)
