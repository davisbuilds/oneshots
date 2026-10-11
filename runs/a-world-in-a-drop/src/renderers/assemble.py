"""Encode image sequences and assemble the 62-second master with FFmpeg.
--animatic reads the preserved 2 fps blocking renders; default reads full frames.
"""
import argparse,subprocess,json,os
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
names=['01_The_Atlantic','02_One_Drop','03_Silica_Garden','04_Inner_Tides','05_The_Weave','06_The_Witness']
durations=[10,11,12,10,10,13]
p=argparse.ArgumentParser();p.add_argument('--animatic',action='store_true');p.add_argument('--fps',type=float,default=24);p.add_argument('--source',default='frames');p.add_argument('--output',default='A_World_in_a_Drop.mp4');p.add_argument('--reuse-clips',action='store_true');a=p.parse_args()
folder=ROOT/('checkpoints/animatic_frames' if a.animatic else a.source)
outdir=ROOT/('checkpoints/animatic_edit' if a.animatic else 'delivery');outdir.mkdir(exist_ok=True,parents=True)
fps=2 if a.animatic else a.fps
def run(cmd):
    print(' '.join(str(x) for x in cmd),flush=True);subprocess.run([str(x) for x in cmd],check=True,cwd=ROOT)
clips=[]
for name,duration in zip(names,durations):
    images=sorted((folder/name).glob('*.png'))
    if not images:raise RuntimeError('No images for '+name)
    expected=round(duration*fps)
    if len(images)!=expected:
        raise RuntimeError(f'{name}: expected {expected} images at {fps} fps, found {len(images)}')
    size=None
    for image_path in images:
        with Image.open(image_path) as im:
            if size is not None and im.size!=size:
                raise RuntimeError(f'Mixed render sizes in {name}; use a fresh render directory.')
            size=im.size;im.verify()
    listing=outdir/(name+'.ffconcat')
    listing.write_text('ffconcat version 1.0\n'+''.join("file '"+str(x)+"'\nduration "+str(1/fps)+'\n' for x in images)+"file '"+str(images[-1])+"'\n")
    clip=outdir/(name+'.mp4');clips.append(clip)
    if a.reuse_clips and clip.exists():continue
    filter='fps=24' if fps==24 or a.animatic else 'tpad=stop_mode=clone:stop_duration=0.25,minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1'
    run(['ffmpeg','-hide_banner','-loglevel','warning','-y','-threads','3','-framerate',fps,'-pattern_type','glob','-i',folder/name/'*.png','-vf',filter+',scale=1280:544:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709','-t',duration,'-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-an',clip])

cmd=['ffmpeg','-hide_banner','-loglevel','warning','-y','-threads','3','-filter_complex_threads','2']
for clip in clips:cmd+=['-i',clip]
cmd+=['-i',ROOT/'audio'/'original_score.wav']
filters=[]
for i in range(6):filters.append(f'[{i}:v]setpts=PTS-STARTPTS,fps=24[v{i}]')
offsets=[8.5,18,28.5,37,45.5]
last='v0'
for i,offset in enumerate(offsets):
    tag=f'x{i}';filters.append(f'[{last}][v{i+1}]xfade=transition=fade:duration=1.5:offset={offset},fps=24[{tag}]');last=tag
# A restrained lens vignette and two short fades retain the deep blacks.
serif='source/fonts/DejaVuSerif.ttf'
sans='source/fonts/DejaVuSans.ttf'
filters.append(f"[{last}]vignette=angle=PI/5:eval=init,fade=t=in:st=0:d=1.2,fade=t=out:st=56.8:d=1.7,tpad=stop_mode=add:stop_duration=3.5:color=black,drawtext=fontfile={serif}:text='A World in a Drop':fontsize=38:fontcolor=0xcbd8da:x=(w-tw)/2:y=(h-th)/2-9:alpha='if(lt(t,59),0,if(lt(t,60),(t-59),if(lt(t,61),1,max(0,62-t))))',drawtext=fontfile={sans}:text='A N   I M A G I N E D   J O U R N E Y':fontsize=10:fontcolor=0x70888e:x=(w-tw)/2:y=h/2+39:alpha='if(lt(t,59.3),0,if(lt(t,60.3),(t-59.3),if(lt(t,61),1,max(0,62-t))))',setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709[picture]")
filters.append('[6:a]volume=-1.4dB,afade=t=out:st=60.5:d=1.5[audio]')
filterfile=outdir/'edit.ffscript';filterfile.write_text(';\n'.join(filters))
output=outdir/('A_World_in_a_Drop_rough_animatic.mp4' if a.animatic else a.output)
cmd+=['-filter_complex_script',filterfile,'-map','[picture]','-map','[audio]','-t','62','-r','24','-c:v','libx264','-preset','slow','-crf','16','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart','-metadata','title=A World in a Drop','-metadata','comment=Original procedural Blender film and original synthesized score.',output]
run(cmd)
print('MASTER',output)
