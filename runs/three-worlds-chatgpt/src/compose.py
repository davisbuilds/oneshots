"""Exhibition typography and a precisely matched triptych."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from paths import OUTPUT as R, RUN_ROOT
FONTDIR=RUN_ROOT/'assets/fonts'
def font(size,serif=False):
 local=FONTDIR/('NimbusRoman-Regular.otf' if serif else 'DejaVuSans.ttf')
 path=local if local.exists() else Path('/usr/share/fonts/opentype/urw-base35/NimbusRoman-Regular.otf' if serif else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
 return ImageFont.truetype(str(path),size)
def track(draw,xy,text,f,fill,spacing=3):
 x,y=xy
 for c in text:
  draw.text((x,y),c,font=f,fill=fill);x+=draw.textlength(c,font=f)+spacing
 return x

def triptych(provisional=False):
 W,H=4200,2120;im=Image.new('RGB',(W,H),'#eae5dc');d=ImageDraw.Draw(im)
 d.text((126,102),'One Equation, Three Worlds.',font=font(126,True),fill='#252e2e')
 track(d,(136,272),'ONE TRAJECTORY   /   THREE MATERIAL STATES',font(24),'#66716d',4)
 # Uniform crop in every panel: the geometry, scale, and position match exactly.
 names=['Matter','Trace','Energy'];descs=['Copper / suspended filament','Ink / pigment on warm paper','Light / time made visible']
 for k,name in enumerate(names):
  p=R/f'{name}.png'
  if provisional and not p.exists():p=R/'studies/04-matter-dark.png'
  src=Image.open(p).convert('RGB').resize((3200,1800),Image.Resampling.LANCZOS)
  panel=src.crop((575,0,2625,1800)).resize((1260,1106),Image.Resampling.LANCZOS)
  x=126+k*1344;y=408;im.paste(panel,(x,y))
  d.text((x,1557),f'0{k+1}',font=font(25),fill='#777e76')
  d.text((x+83,1535),name,font=font(76,True),fill='#293330')
  d.text((x+85,1634),descs[k],font=font(27),fill='#68726c')
  d.line((x,1748,x+1260,1748),fill='#c8c9bf',width=2)
 d.text((136,1841),'dx/dt = σ(y − x)      dy/dt = x(ρ − z) − y      dz/dt = xy − βz',font=font(33),fill='#45554e')
 track(d,(136,1960),'σ 10     ρ 28     β 8/3     •     t 40–47',font(23),'#778177',2)
 track(d,(3200,1960),'LORENZ   /   2026',font(23),'#778177',3)
 return im
if __name__=='__main__':
 import sys
 im=triptych('--provisional' in sys.argv);im.save(R/('studies/07-triptych-layout.jpg' if '--provisional' in sys.argv else 'One-Equation-Three-Worlds.png'))
