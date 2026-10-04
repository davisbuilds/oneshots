from pathlib import Path
import json, hashlib, numpy as np
from paths import OUTPUT as R, RUN_ROOT
f=np.load(R/'checkpoints/integrated.npz'); mask=(f['t']>=40)&(f['t']<=47)
t=f['t'][mask]; xyz=f['xyz'][mask]
np.savez(R/'data/lorenz-canonical.npz',t=t,xyz=xyz)
np.savetxt(R/'data/lorenz-canonical.csv',np.c_[t,xyz],delimiter=',',header='t,x,y,z',comments='',fmt='%.12g')
m=json.loads((R/'data/integration.json').read_text()); m.update(selected_segment=[40,47],samples=len(t),dataset_sha256=hashlib.sha256((R/'data/lorenz-canonical.npz').read_bytes()).hexdigest())
(R/'data/integration.json').write_text(json.dumps(m,indent=2))
(R/'checkpoints/progress.md').write_text('01 — Environment: Python 3.12, NumPy/SciPy/Pillow/FFmpeg. 9 CPU threads, ~10 GB RAM, no GPU. bpy package unavailable; system Blender installation in progress.\n02 — Inspected nine trajectory studies. Selected t=40–47: balanced lobes, strong central crossing, legible negative space. One canonical dataset: 3501 samples at dt=.002.\n')
