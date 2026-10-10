"""Original stereo electroacoustic score. Pure synthesis; no sample libraries."""
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile
ROOT=Path(__file__).resolve().parents[1]
SR=48000;DURATION=62.0
rng=np.random.default_rng(89131)
t=np.arange(int(SR*DURATION))/SR
mix=np.zeros((len(t),2),dtype=np.float64)

def filt(x,hz,kind='lowpass',order=3):
    return sosfilt(butter(order,hz,fs=SR,btype=kind,output='sos'),x)
def smooth(a,b):
    u=np.clip((t-a)/(b-a),0,1);return u*u*(3-2*u)
def window(a,b,attack=2,release=3):return smooth(a,a+attack)*(1-smooth(b-release,b))
def add(x,gain=1,pan=0):
    mix[:,0]+=x*gain*np.sqrt((1-pan)/2);mix[:,1]+=x*gain*np.sqrt((1+pan)/2)
def tone(freq,a,b,gain,pan=0):
    tt=np.maximum(t-a,0);env=window(a,b,min(3,(b-a)/4),min(5,(b-a)/3))
    v=np.zeros(len(t))
    for k,amp in [(1,1),(2,.18),(3,.07),(4,.022)]:
        v+=amp*np.sin(2*np.pi*freq*k*tt+.012*k*np.sin(2*np.pi*.13*t))
    add(v*env,gain,pan)
def bell(at,freq,gain,pan=0,dur=8):
    tt=t-at;env=(tt>=0)*np.exp(-np.maximum(tt,0)/(dur/4))*(1-np.exp(-np.maximum(tt,0)*85))
    v=sum(amp*np.sin(2*np.pi*freq*ratio*tt)*np.exp(-np.maximum(tt,0)*decay) for ratio,amp,decay in [(1,1,.05),(2.01,.26,.18),(3.92,.09,.5),(6.1,.025,1)])
    add(v*env,gain,pan)

# Sea: independent stereo pressure, wave wash and fine spray.
storm=(1-.84*smooth(9,20))*(1-smooth(55,61))+.50*(smooth(46,53)-smooth(56,61))
for channel in range(2):
    n=rng.normal(0,1,len(t));low=filt(n,190);wash=filt(n,[250,2200],'bandpass')
    swell=.48+.23*np.sin(2*np.pi*.10*t+channel*.7)+.12*np.sin(2*np.pi*.173*t+.3)
    mix[:,channel]+=(low*1.15+wash*.20)*swell*storm*.25
    rain=filt(rng.normal(0,1,len(t)),[3000,11000],'bandpass')
    mix[:,channel]+=rain*.014*window(0,19,.7,7)
# Far thunder, opening only: low energy with an irregular envelope.
th=filt(rng.normal(0,1,len(t)),[24,95],'bandpass')
add(th*.18*window(1,9,2.5,4))
# A sparse D-minor/add-nine field, widening as we descend.
for freq,pan,gain in [(73.416,-.3,.055),(110,.3,.027),(146.832,-.1,.021)]:tone(freq,3,58,gain,pan)
for freq,a,b,gain,pan in [(174.614,15,35,.024,-.6),(220,20,45,.018,.55),(293.665,24,52,.018,-.35),(329.628,32,50,.013,.4),(440,40,56,.009,-.6),(146.832,49,61,.034,0)]:tone(freq,a,b,gain,pan)
# The drop falls; the pitch contracts, then a small wet impact.
tt=np.clip(t-9,0,3);fall=np.sin(2*np.pi*(1150*tt-125*tt*tt))*window(9,12,.3,.2)
add(fall,.009,.12)
bell(11.45,587.33,.105,-.08,5)
imp=filt(rng.normal(0,1,len(t)),[400,2400],'bandpass')*np.exp(-np.maximum(t-11.45,0)*16)*(t>=11.45)
add(imp,.12,0)
# Suspended flecks: a restrained, original sequence of inharmonic glass notes.
for at,f,p,g in [(17.8,880,-.65,.031),(20.7,1174.66,.5,.026),(24.8,698.46,-.25,.034),(29.0,587.33,.65,.030),(32.1,440,-.4,.026),(37.5,659.25,.2,.025),(42.0,880,-.5,.022),(46.5,587.33,.5,.028),(51.2,293.665,0,.035)]:bell(at,f,g,p,9)
# A soft breath at each boundary, no trailer-style impacts.
for at in [8.5,18.0,28.5,37.0,45.5]:
    env=np.exp(-((t-at)/1.05)**2);n=filt(rng.normal(0,1,len(t)),[450,1700],'bandpass')
    add(n*env,.035,-.2 if at<30 else .2)
# Original cross-channel reverberation, gradually darker taps.
dry=mix.copy()
for delay,gain in [(.127,.15),(.293,.13),(.487,.10),(.811,.075),(1.307,.055),(2.113,.035)]:
    d=int(delay*SR)
    for ch in range(2):mix[d:,ch]+=filt(dry[:-d,1-ch],2800)*gain
mix*= (smooth(0,1.3)*(1-smooth(57,61.5)))[:,None]
mix=np.tanh(mix*1.2)
peak=np.max(np.abs(mix));mix*=.72/max(peak,1e-9)
(ROOT/'audio').mkdir(exist_ok=True)
wavfile.write(ROOT/'audio'/'original_score.wav',SR,(mix*2147483647).astype(np.int32))
print('Original score:',DURATION,'seconds; stereo 48 kHz; peak',np.max(np.abs(mix)))
