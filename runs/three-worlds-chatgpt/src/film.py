"""28 s / 24 fps / 1080p. Matched dissolves and an explicitly editorial ending."""
from pathlib import Path
import subprocess, numpy as np
from PIL import Image,ImageDraw
from compose import R,font,track,triptych
W,H=1920,1080;FPS=24;N=28*FPS

def ease(v):
 v=np.clip(v,0,1);return float(v*v*(3-2*v))
def fit(im):return im.convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
def overlay(im,text,opacity=1,dark=False,title=False):
 if opacity<=0:return im
 layer=Image.new('RGBA',im.size);d=ImageDraw.Draw(layer);color=(47,58,54) if dark else (224,222,211)
 if title:
  d.text((105,96),'One Equation,',font=font(49,True),fill=(*color,int(255*opacity)))
  d.text((105,151),'Three Worlds.',font=font(49,True),fill=(*color,int(255*opacity)))
 else:
  track(d,(108,956),text,font(16),(*color,int(255*opacity)),2)
 return Image.alpha_composite(im.convert('RGBA'),layer).convert('RGB')
def load_assets(provisional=False):
 p=R/'Matter.png'
 if provisional and not p.exists():p=R/'studies/04-matter-dark.png'
 matter=fit(Image.open(p));trace=fit(Image.open(R/'Trace.png'))
 guide=fit(Image.open(R/'checkpoints/energy-start.png'))
 tri=triptych(provisional).resize((1920,969),Image.Resampling.LANCZOS)
 end=Image.new('RGB',(W,H),'#eae5dc');end.paste(tri,(0,56))
 return matter,trace,guide,end

def frame(f,assets):
 matter,trace,guide,end=assets;t=f/FPS
 if t<4.7:
  im=matter.copy()
  im=overlay(im,'',ease((t-.6)/.7)*(1-ease((t-3.5)/.7)),title=True)
  im=overlay(im,'I  /  MATTER',ease((t-1.1)/.8))
  if t<.8:im=Image.blend(Image.new('RGB',(W,H)),im,ease(t/.8))
 elif t<6.7:
  v=ease((t-4.7)/2);im=Image.blend(matter,trace,v)
  im=overlay(im,'I  /  MATTER',1-ease((t-4.7)/.6))
  im=overlay(im,'II  /  TRACE',ease((t-6.1)/.6),dark=True)
 elif t<9.6:
  im=overlay(trace.copy(),'II  /  TRACE',1,dark=True)
 elif t<11.6:
  v=ease((t-9.6)/2);im=Image.blend(trace,guide,v)
  im=overlay(im,'II  /  TRACE',1-ease((t-9.6)/.6),dark=True)
  im=overlay(im,'III  /  ENERGY',ease((t-10.9)/.7))
 elif t<23.4:
  im=Image.open(R/f'checkpoints/energy-frames/{f:04d}.png').convert('RGB')
  im=overlay(im,'III  /  ENERGY',1-ease((t-22.4)/.7))
 elif t<24.7:
  old=Image.open(R/'checkpoints/energy-frames/0561.png').convert('RGB')
  im=Image.blend(old,end,ease((t-23.4)/1.3))
 else:im=end.copy()
 return im

def movie(provisional=False):
 assets=load_assets(provisional)
 output=R/('studies/08-film-draft.mp4' if provisional else 'One-Equation-Three-Worlds.mp4')
 temporary=output.with_name(output.stem+'.partial.mp4')
 cmd=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','slow','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',str(temporary)]
 with subprocess.Popen(cmd,stdin=subprocess.PIPE) as p:
  for f in range(N):
   im=frame(f,assets);p.stdin.write(im.tobytes())
   if f%48==0:print(f,flush=True)
  p.stdin.close();p.wait()
  if p.returncode:raise RuntimeError('FFmpeg failed')
 temporary.replace(output)
 return output
if __name__=='__main__':
 import sys
 if '--samples' in sys.argv:
  a=load_assets('--provisional' in sys.argv);times=[1.8,5.7,8.0,10.6,12.0,15.0,18.5,22.0,23.8,26.0]
  sheet=Image.new('RGB',(1920,1350))
  for i,t in enumerate(times):
   im=frame(round(t*FPS),a);im.save(R/f'checkpoints/frame-{t:04.1f}.jpg',quality=96)
   sheet.paste(im.resize((480,270)),((i%4)*480,(i//4)*450))
  sheet.save(R/'studies/09-film-contact-sheet.jpg')
 else:movie('--provisional' in sys.argv)
