"""Render selected Blender scenes; supports resumable frames and study mode."""
import bpy, sys, argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
p=argparse.ArgumentParser();p.add_argument('--scene',default='all');p.add_argument('--frames',default='');p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=20);p.add_argument('--engine',default='CYCLES');p.add_argument('--study',action='store_true');p.add_argument('--step',type=int,default=1);p.add_argument('--start',type=int,default=1);p.add_argument('--end',type=int,default=0);p.add_argument('--outdir',default='')
a=p.parse_args(args)
for sc in bpy.data.scenes:
    if not sc.name[:2].isdigit() or (a.scene!='all' and not sc.name.startswith(a.scene)):continue
    bpy.context.window.scene=sc;sc.render.engine=a.engine;sc.render.resolution_percentage=a.scale;sc.render.use_persistent_data=True
    if a.engine=='CYCLES':
        sc.cycles.samples=max(a.samples,24) if sc.name=='06_The_Witness' and not a.study and not a.outdir else a.samples
        sc.cycles.use_denoising=True;sc.cycles.use_adaptive_sampling=True;sc.cycles.adaptive_threshold=.08;sc.cycles.adaptive_min_samples=4
    else:sc.eevee.taa_render_samples=a.samples
    frames=[int(x) for x in a.frames.split(',')] if a.frames else range(a.start,a.end or sc.frame_end+1,a.step)
    folder=ROOT/(a.outdir or ('studies' if a.study else 'frames'))/sc.name;folder.mkdir(parents=True,exist_ok=True)
    for f in frames:
        out=folder/f'{f:04d}.png'
        if out.exists():continue
        sc.frame_set(f);sc.render.filepath=str(out);bpy.ops.render.render(write_still=True)
        print('COMPLETE',sc.name,f,flush=True)
