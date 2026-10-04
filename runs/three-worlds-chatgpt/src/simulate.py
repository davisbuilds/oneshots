from pathlib import Path
import numpy as np
from scipy.integrate import solve_ivp
from PIL import Image, ImageDraw, ImageFont
import json
from paths import OUTPUT as ROOT, RUN_ROOT
def f(t,p):
 x,y,z=p
 return [10*(y-x), x*(28-z)-y, x*y-8*z/3]
def project(p,angle=12):
 a=np.deg2rad(angle)
 return np.c_[p[:,0]*np.cos(a)+p[:,1]*np.sin(a), p[:,2],-p[:,0]*np.sin(a)+p[:,1]*np.cos(a)]
def main():
 sol=solve_ivp(f,(0,60),(1,1,1),method='DOP853',rtol=1e-11,atol=1e-13,dense_output=True,max_step=.01)
 sheet=Image.new('RGB',(1500,1260),'#e8e0d2'); d=ImageDraw.Draw(sheet)
 font=ImageFont.truetype(str(RUN_ROOT/'assets/fonts/DejaVuSans.ttf'),17)
 for j,start in enumerate([22,30,40]):
  for i,length in enumerate([5,7,9]):
   tt=np.arange(start,start+length+.0001,.002); p=project(sol.sol(tt).T)
   q=p[:,:2]; q-=np.array([0,25]); q*=7.2; q[:,1]*=-1; q+=np.array([i*500+250,j*420+216])
   d.line(list(map(tuple,q)),fill='#40332a',width=2)
   d.text((i*500+24,j*420+24),f't = {start}–{start+length}  /  yaw 12°',fill='#493e32',font=font)
 sheet.save(ROOT/'studies/01-segment-studies.jpg')
 # selection may be revised after inspection
 np.savez(ROOT/'checkpoints/integrated.npz',t=np.arange(0,60.0001,.002),xyz=sol.sol(np.arange(0,60.0001,.002)).T)
 meta={'equations':['dx/dt = 10(y-x)','dy/dt = x(28-z)-y','dz/dt = xy-(8/3)z'],'initial_condition':[1,1,1],'solver':'scipy.integrate.solve_ivp / DOP853','rtol':1e-11,'atol':1e-13,'max_step':.01,'integration_interval':[0,60],'transient_discarded':[0,20],'canonical_sample_step':.002}
 (ROOT/'data/integration.json').write_text(json.dumps(meta,indent=2))
if __name__=='__main__': main()
