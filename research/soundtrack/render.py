"""Renders the soundtrack's MIDI (research/soundtrack/midi) to web3d/audio/*.m4a.

    python3 research/soundtrack/render.py

The synth is the draft soundtrack's own (square, narrow-square and triangle voices, a
noise kit; a 2-pole low-pass), softened for the page: 14-bit instead of 10-bit
quantisation, a gentler limiter and a 5 kHz tonal low-pass, peak-normalised. It is
resampled to 22.05 kHz (nothing above 6.5 kHz is left to keep) and encoded as 40 kbps mono
AAC, which measures about 12 dB cleaner than 32 kbps at 44.1 kHz. Needs numpy, scipy, ffmpeg.
"""
import os, struct, sys, subprocess, numpy as np
from scipy.signal import butter, sosfilt, resample_poly
from scipy.io import wavfile
HERE=os.path.dirname(os.path.abspath(__file__))
def parse(path):
    b=open(path,'rb').read(); ppq=struct.unpack('>H',b[12:14])[0]; ntr=struct.unpack('>H',b[10:12])[0]
    i=14; bpm=120; ev=[]
    for _ in range(ntr):
        assert b[i:i+4]==b'MTrk'; n=struct.unpack('>I',b[i+4:i+8])[0]; d=b[i+8:i+8+n]; i+=8+n
        j=0; t=0; run=None; on={}
        def vlq():
            nonlocal j
            v=0
            while True:
                c=d[j]; j+=1; v=(v<<7)|(c&0x7f)
                if not c&0x80: return v
        while j<len(d):
            t+=vlq(); s=d[j]
            if s==0xff:
                typ=d[j+1]; ln=d[j+2]; 
                if typ==0x51: bpm=60_000_000/int.from_bytes(d[j+3:j+6],'big')
                j+=3+ln; continue
            if s&0x80: run=s; j+=1
            st=run; hi=st&0xf0; ch=st&0xf
            if hi in (0x80,0x90):
                p,v=d[j],d[j+1]; j+=2
                if hi==0x90 and v>0: on[(ch,p)]=(t,v)
                else:
                    if (ch,p) in on:
                        t0,v0=on.pop((ch,p)); ev.append((t0/ppq,(t-t0)/ppq,p,v0,{0:'p1',1:'p2',2:'tri',9:'noise'}[ch]))
            elif hi in (0xC0,0xD0): j+=1
            else: j+=2
    return ev,bpm
def render(events,bpm,sr=44100,bits=10,drive=1.1,tonal_lp=5500):
    total=max(s+d for s,d,*_ in events)
    spb=60/bpm; L=int((total*spb+1.0)*sr)
    tonal=np.zeros(L); noise=np.zeros(L); rng=np.random.default_rng(1)
    for (s,d,pit,vel,v) in events:
        i0=int(s*spb*sr); n=int(d*spb*sr)
        if v=='noise': n=int({36:.16,38:.11,42:.035}[pit]*sr)
        if n<=0 or i0>=L: continue
        t=np.arange(n)/sr; f=440*2**((pit-69)/12); ph=(t*f)%1.0
        if v=='p1': w=np.where(ph<.5,1.,-1.)
        elif v=='p2': w=np.where(ph<.25,1.,-1.)
        elif v=='tri': w=4*np.abs(ph-.5)-1
        else:
            if pit==36: w=np.sin(2*np.pi*(110*t-380*t*t))*np.exp(-t*26)
            else:
                w=rng.standard_normal(n)
                if pit==42: w=np.diff(w,prepend=0)*.5
                w*=np.exp(-t*(70 if pit==42 else 30))
        if v=='noise': env=np.minimum(1,t*800)
        else:
            dur=n/sr; env=np.minimum(1,t/.004)*np.minimum(1,np.maximum(0,dur-t)/.02)
            if v in('p1','p2'): env=env*(0.8+0.2*np.exp(-t*8))
        amp=(vel/127)*{'p1':.26,'p2':.15,'tri':.34,'noise':.13}[v]
        seg=(w*env*amp)[:L-i0]
        (noise if v=='noise' else tonal)[i0:i0+len(seg)]+=seg
    mix=sosfilt(butter(2,tonal_lp,btype='low',fs=sr,output='sos'),tonal)+sosfilt(butter(2,6500,btype='low',fs=sr,output='sos'),noise)
    mix=np.tanh(mix*drive)/np.tanh(drive)
    if bits: q=2**(bits-1); mix=np.round(mix*q)/q
    return mix

def main():
    import glob
    from scipy.io import wavfile
    from scipy.signal import resample_poly
    import tempfile
    out_dir = os.path.join(HERE, "..", "..", "web3d", "audio")
    os.makedirs(out_dir, exist_ok=True)
    for mid in sorted(glob.glob(os.path.join(HERE, "midi", "*.mid"))):
        stem = os.path.basename(mid)[:-4]
        ev, bpm = parse(mid)
        mix = render(ev, bpm, bits=14, drive=0.9, tonal_lp=5000)
        mix = resample_poly(mix / np.abs(mix).max() * 0.72, 1, 2)
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, stem + ".wav")
            wavfile.write(wav, 22050, (mix * 32767).astype(np.int16))
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ac", "1", "-c:a", "aac", "-b:a", "40k", "-movflags", "+faststart", os.path.join(out_dir, stem + ".m4a")], check=True)
        print(stem)

if __name__ == "__main__":
    main()
