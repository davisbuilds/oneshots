"""Procedural paper and ink. No image textures or generated assets."""
from pathlib import Path
import numpy as np
from scipy.ndimage import gaussian_filter, gaussian_filter1d
from PIL import Image, ImageDraw, ImageFilter
from paths import OUTPUT as R, RUN_ROOT
def noise(w,h,scale,seed):
 rng=np.random.default_rng(seed);a=rng.random((max(2,int(h/scale)),max(2,int(w/scale))),dtype=np.float32)
 return np.asarray(Image.fromarray(a,'F').resize((w,h),Image.Resampling.BICUBIC))-.5
def paper(w,h):
 rng=np.random.default_rng(77)
 n=noise(w,h,220,17)*.07+noise(w,h,43,18)*.028+noise(w,h,7,19)*.018+rng.normal(0,.005,(h,w)).astype('float32')
 y,x=np.mgrid[:h,:w];v=((x-w*.49)/w)**2+((y-h*.43)/h)**2
 p=np.empty((h,w,3),np.float32)
 for c,vv in enumerate([.913,.878,.804]):p[:,:,c]=vv+n-.04*v
 # Fibrous inclusions, intentionally subtle and deterministic.
 fibers=Image.new('L',(w,h));d=ImageDraw.Draw(fibers)
 for j in range(int(w*h/280)):
  x0=rng.integers(0,w);y0=rng.integers(0,h);ln=rng.uniform(2,14)*w/3200
  d.line((x0,y0,x0+ln,y0+rng.normal(0,ln*.2)),fill=int(rng.uniform(6,30)),width=1)
 f=np.array(fibers)/255
 p-=f[:,:,None]*.12
 return np.clip(p,0,1)
def painting(w=3200,h=1800,strength=1):
 q=np.loadtxt(R/'data/camera-projection.csv',delimiter=',',skiprows=1)[:,:2]*[w,h]
 xyz=np.load(R/'data/lorenz-canonical.npz')['xyz'];speed=np.linalg.norm(np.gradient(xyz,axis=0),axis=1)
 tang=np.gradient(q,axis=0);norm=np.linalg.norm(tang,axis=1);normals=np.c_[-tang[:,1],tang[:,0]]/norm[:,None]
 rng=np.random.default_rng(42);variation=gaussian_filter1d(rng.normal(size=len(q)),35);variation/=variation.std()
 ph=np.linspace(0,1,len(q));pressure=np.clip(.55+.26*np.sin(ph*11*np.pi+.4)+.16*variation+.35*(1-speed/speed.max()),.22,1.4)
 width=(2.3+7.4*pressure)*w/3200*strength
 taper=np.minimum(np.clip(ph/.016,0,1),np.clip((1-ph)/.024,0,1))**.55;width*=.20+.8*taper
 left=q+normals*width[:,None]/2;right=q-normals*width[:,None]/2
 mask=Image.new('L',(w,h));d=ImageDraw.Draw(mask)
 deposit=Image.new('L',(w,h));dd=ImageDraw.Draw(deposit)
 for i in range(len(q)-1):
  polygon=[tuple(left[i]),tuple(left[i+1]),tuple(right[i+1]),tuple(right[i])]
  d.polygon(polygon,fill=255)
  dd.polygon(polygon,fill=int(np.clip(70+pressure[i]*160,0,255)))
 a=np.asarray(mask,dtype='float32')/255
 # Narrow bristle channels follow the trajectory tangent, not random screen scratches.
 dry=Image.new('L',(w,h));d=ImageDraw.Draw(dry)
 for k in range(9):
  frac=(k-4)/9
  qq=q+normals*(width*frac)[:,None]
  for i in range(0,len(q)-2,2):
   if np.sin(i*.071+k*7)+np.sin(i*.019-k*1.3)>.30 and pressure[i]<1.05:
    d.line([tuple(qq[i]),tuple(qq[i+2])],fill=int(65+110*(1-pressure[i]/1.4)),width=max(1,round(w/3200)))
 grain=noise(w,h,3.4,47);dry=np.array(dry,dtype='float32')/255
 absorb=np.clip(1+grain*.63-dry*1.65,.14,1.3)
 tau=a*absorb*(.5+np.asarray(deposit,dtype="float32")/180)*(1.2+noise(w,h,120,8)*1.5)
 # Capillary feathering and a dark pigment rim.
 soft=gaussian_filter(a,.9*w/3200);wide=gaussian_filter(a,2.2*w/3200)
 edge=np.maximum(a-gaussian_filter(a,1.5*w/3200),0)
 tau+=.6*edge+.34*soft+.14*wide
 # Random microscopic pinholes, tied to paper texture.
 tau*=np.clip(1+noise(w,h,1.8,314)*.35,.3,1.3)
 p=paper(w,h);pigment=np.array([.063,.082,.081],dtype='float32')
 out=p*np.exp(-tau[:,:,None]*1.8)+pigment*(1-np.exp(-tau[:,:,None]*1.8))
 return Image.fromarray(np.uint8(np.clip(out,0,1)*255))
if __name__=='__main__':
 import sys
 if '--study' in sys.argv:
  sheet=Image.new('RGB',(1920,1080))
  for i,st in enumerate([.72,1.1,1.65]):
   im=painting(1600,900,st);im.save(R/f'studies/03-ink-{i+1}.png')
   im=im.crop((430,75,1160,835)).resize((640,666),Image.Resampling.LANCZOS);sheet.paste(im,(i*640,150))
  sheet.save(R/'studies/03-ink-studies.jpg')
 else:painting(strength=1.4).save(R/'Trace.png')
