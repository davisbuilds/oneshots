"""Depth-aware emissive trajectory, procedural bloom and a temporal fading trail."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter
from paths import OUTPUT as R, RUN_ROOT
class Energy:
 def __init__(self,w=1920,h=1080):
  self.w=w;self.h=h
  self.q=np.loadtxt(R/'data/camera-projection.csv',delimiter=',',skiprows=1)
  self.xy=self.q[:,:2]*[w,h];self.t=np.load(R/'data/lorenz-canonical.npz')['t']
  self.depth=(self.q[:,2]-self.q[:,2].min())/np.ptp(self.q[:,2]);self.base=self.background()
  self.guide=self.path_layer(47,guide=True)
  self.dither=np.random.default_rng(25).uniform(-.5,.5,(h,w,1)).astype("float32")/255
 def background(self):
  w,h=self.w,self.h;y,x=np.mgrid[:h,:w].astype('float32');x/=w;y/=h
  a=np.empty((h,w,3),np.float32);a[:]=[.006,.010,.014]
  glow=np.exp(-((x-.54)/.24)**2-((y-.40)/.43)**2)
  a+=glow[:,:,None]*np.array([.008,.024,.030])
  floor=np.exp(-((x-.50)/.23)**2-((y-.87)/.035)**2)
  a+=floor[:,:,None]*np.array([.018,.031,.028])
  return a
 def path_layer(self,head_t,guide=False):
  w,h=self.w,self.h;im=Image.new('RGB',(w,h));d=ImageDraw.Draw(im)
  xy=self.xy;age=head_t-self.t
  for i in range(len(xy)-1):
   if guide:
    col=np.array([.12,.27,.28])*(.42-.2*self.depth[i])
   else:
    if age[i]<0 or age[i]>6:continue
    a=age[i];mix=np.clip(a/.9,0,1)
    col=(np.array([1,.44,.12])*(1-mix)+np.array([.09,.61,.70])*mix)
    bright=np.exp(-a/1.7)*(.91-.30*self.depth[i]);col*=bright
   c=tuple(np.uint8(np.clip(col,0,1)*255))
   d.line([tuple(xy[i]),tuple(xy[i+1])],fill=c,width=max(1,round(w/1500)))
  return im
 def frame(self,head_t,fade=1):
  w,h=self.w,self.h;trail=self.path_layer(head_t)
  # Guide is a faint view of the complete installed curve. Only the moving head emits strongly.
  a=np.asarray(trail,dtype='float32')/255
  guide=np.asarray(self.guide,dtype='float32')/255
  small=trail.resize((w//2,h//2),Image.Resampling.BILINEAR)
  def floatblur(radius):
   z=gaussian_filter(np.asarray(small,dtype='float32')/255,(radius,radius,0))
   return np.stack([np.asarray(Image.fromarray(z[:,:,c],'F').resize((w,h),Image.Resampling.BILINEAR)) for c in range(3)],axis=2)
  bloom=floatblur(3*w/1920)
  halo=floatblur(13*w/1920)
  lin=self.base+guide*.30+(a*2.1+bloom*5+halo*7)*fade
  # Exact temporal interpolation of the head; never a jump between lobes or endpoint wrap.
  if head_t<=47:
   x=np.interp(head_t,self.t,self.xy[:,0]);y=np.interp(head_t,self.t,self.xy[:,1])
   rad=32*w/1920;x0=max(0,int(x-rad*2));x1=min(w,int(x+rad*2+1));y0=max(0,int(y-rad*2));y1=min(h,int(y+rad*2+1))
   yy,xx=np.mgrid[y0:y1,x0:x1];rr=(xx-x)**2+(yy-y)**2
   hot=np.exp(-rr/(2*(1.5*w/1920)**2))*6+np.exp(-rr/(2*(8*w/1920)**2))*.28
   lin[y0:y1,x0:x1]+=hot[:,:,None]*np.array([1,.63,.28])*fade
  # Smooth filmic shoulder, no clipped white disks.
  out=1-np.exp(-lin)
  out=np.clip(out,0,1)**.78
  return Image.fromarray(np.uint8(np.clip(out+self.dither,0,1)*255))
if __name__=='__main__':
 import sys
 if '--study' in sys.argv:
  e=Energy(960,540);ims=[e.frame(t) for t in [42.4,44.8,46.5]]
  sheet=Image.new('RGB',(1920,1080),(8,12,16))
  for i,im in enumerate(ims): im.save(R/f'studies/05-energy-{i+1}.png');sheet.paste(im,((i%2)*960,(i//2)*540))
  sheet.save(R/'studies/05-energy-studies.jpg')
 else:Energy(4800,2700).frame(46.5).resize((3200,1800),Image.Resampling.LANCZOS).save(R/'Energy.png')
