"""Independent replay-verifier for lbl.c traces (gather mode, TRACE env). Re-implements the deal (splitmix64 shuffle) and rules from scratch."""
import sys
M=(1<<64)-1
def mk(seed,d):
    rs=(seed*1000003+d)&M
    def rnd():
        nonlocal rs
        rs=(rs+0x9E3779B97F4A7C15)&M; z=rs
        z=((z^(z>>30))*0xBF58476D1CE4E5B9)&M; z=((z^(z>>27))*0x94D049BB133111EB)&M
        return z^(z>>31)
    c=list(range(52))
    for i in range(51,0,-1):
        j=rnd()%(i+1); c[i],c[j]=c[j],c[i]
    return c
def dealp(c): return [c[i:i+3] for i in range(0,len(c),3)]
import os
STRICT=not os.environ.get('RELAX')
ok=bad=0
for line in sys.stdin:
    if not line.startswith('TRACE'): continue
    t=line.split(); seed=int(t[1]); d=int(t[2]); path=list(map(int,t[3:]))
    piles=dealp(mk(seed,d)); f=[0]*4; idx=0
    def settle():
        ch=True
        while ch:
            ch=False
            for p in piles:
                if p and p[-1]%13==f[p[-1]//13]: f[p[-1]//13]+=1; p.pop(); ch=True
    legal=True
    for mv in path:
        settle(); piles=[p for p in piles if p]
        if mv==-1:
            if STRICT and any(len(a)>0 and len(b)>0 and a is not b and a[-1]//13==b[-1]//13 and a[-1]%13+1==b[-1]%13 for a in piles for b in piles): legal=False;break
            flat=[x for p in piles for x in p]; piles=dealp(flat); continue
        a,b=mv//32,mv%32
        c=piles[a][-1]; dd=piles[b][-1]
        if not(a!=b and c//13==dd//13 and c%13+1==dd%13): legal=False;break
        piles[b].append(piles[a].pop())
    settle()
    won=sum(f)==52
    ok+=legal and won; bad+=not(legal and won)
print('verified',ok,'failed',bad)
