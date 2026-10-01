from pathlib import Path
import numpy as np, time, io, os
from PIL import Image
from energy import Energy,R
FPS=24;START=11.6;END=22.4
out=R/'checkpoints/energy-frames';out.mkdir(exist_ok=True)
e=Energy(2880,1620)
for f in range(278,565):
 p=out/f'{f:04d}.png'
 if p.exists():
  try:
   with Image.open(p) as existing:existing.verify()
   continue
  except (OSError,SyntaxError):p.unlink()
 seconds=f/FPS
 ht=40+7*np.clip((seconds-START)/(END-START),0,1)
 fade=1 if seconds<=END else max(.1,1-(seconds-END)*.62)
 im=e.frame(float(ht),fade=fade).resize((1920,1080),Image.Resampling.LANCZOS)
 tmp=p.with_suffix(".tmp.png")
 buffer=io.BytesIO(); im.save(buffer,format='PNG',compress_level=2)
 with open(tmp,'wb') as handle:
  handle.write(buffer.getvalue());handle.flush();os.fsync(handle.fileno())
 with Image.open(tmp) as check:check.load()
 tmp.replace(p)
 if f%24==0:print(f,round(seconds,3),round(float(ht),4),flush=True)
# Stable dim guide during the medium transition, and a final still at the true endpoint.
e.frame(40).resize((1920,1080),Image.Resampling.LANCZOS).save(R/'checkpoints/energy-start.png')
print('complete',flush=True)
