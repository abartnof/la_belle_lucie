/* La Belle Lucie simulator / solver.  ORIGINAL COMPUTATION.
 * Rules implemented (see research/03-strategy-and-odds.md):
 *  - 52 cards, 17 fans of 3 + 1 single card, all face up. Only top card of a fan is playable.
 *  - Top card -> foundation if same suit and rank = foundation height (A up to K).
 *  - Top card -> top of another fan if same suit and one rank lower. Never to an empty fan (empty fans stay empty).
 *  - When stuck, up to 2 redeals (3 deals total). Redeal mode:
 *      gather : fans picked up left to right, each bottom->top, concatenated, re-dealt in threes WITHOUT shuffle
 *      gatherrev : same but the gathered stack is turned over (reversed) before dealing
 *      shuffle: all remaining cards picked up, shuffled, re-dealt in threes
 *  Usage: lbl <mode: gather|gatherrev|shuffle> <solver: greedy|dfs> <ndeals> <seed> <nodecap> [redeals=2]
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#define MAXP 18
#define MAXL 20
typedef struct { uint8_t p[MAXP][MAXL]; uint8_t len[MAXP]; uint8_t np; uint8_t f[4]; } St;
static int MODE, RELAX; /* 0 gather,1 gatherrev,2 shuffle */
static uint64_t rs;
static uint64_t rnd(void){ rs += 0x9E3779B97F4A7C15ULL; uint64_t z=rs; z=(z^(z>>30))*0xBF58476D1CE4E5B9ULL; z=(z^(z>>27))*0x94D049BB133111EBULL; return z^(z>>31);}
#define SU(c) ((c)/13)
#define RK(c) ((c)%13)
static void deal(St*s,uint8_t*cards,int n){
  memset(s,0,sizeof(*s)); int k=0;
  for(int i=0;i<n;i+=3){ int m=n-i<3?n-i:3; for(int j=0;j<m;j++) s->p[k][j]=cards[i+j]; s->len[k]=m; k++; }
  s->np=k; }
static int remaining(St*s){int n=0;for(int i=0;i<s->np;i++)n+=s->len[i];return n;}
static void redeal(St*s){
  uint8_t c[52]; int n=0;
  for(int i=0;i<s->np;i++) for(int j=0;j<s->len[i];j++) c[n++]=s->p[i][j];
  if(MODE==1) for(int i=0;i<n/2;i++){uint8_t t=c[i];c[i]=c[n-1-i];c[n-1-i]=t;}
  if(MODE==2) for(int i=n-1;i>0;i--){int j=rnd()%(i+1);uint8_t t=c[i];c[i]=c[j];c[j]=t;}
  uint8_t f[4]; memcpy(f,s->f,4); deal(s,c,n); memcpy(s->f,f,4); }
static void compact(St*s){ /* drop empty fans, keep order (they never refill) */
  int k=0; for(int i=0;i<s->np;i++) if(s->len[i]){ if(k!=i){memcpy(s->p[k],s->p[i],MAXL);s->len[k]=s->len[i];} k++; }
  s->np=k; }
static void autofound(St*s){
  int ch=1; while(ch){ ch=0; for(int i=0;i<s->np;i++) if(s->len[i]){ int c=s->p[i][s->len[i]-1]; if(RK(c)==s->f[SU(c)]){ s->f[SU(c)]++; s->len[i]--; ch=1; } } } }
static int found(St*s){return s->f[0]+s->f[1]+s->f[2]+s->f[3];}
typedef struct { uint8_t a,b; int sc; } Mv;
static int gen(St*s, Mv*m){
  int n=0;
  for(int i=0;i<s->np;i++) if(s->len[i]){
    int c=s->p[i][s->len[i]-1];
    for(int j=0;j<s->np;j++) if(j!=i&&s->len[j]){
      int d=s->p[j][s->len[j]-1];
      if(SU(d)==SU(c)&&RK(d)==RK(c)+1){
        int sc=0, bad=0;
        for(int k=0;k<s->len[j]-1;k++){int x=s->p[j][k]; if(SU(x)==SU(c)&&RK(x)<RK(c)) bad=1;}
        if(!bad) sc+=100;
        if(s->len[i]==1) sc+=20;
        else { int e=s->p[i][s->len[i]-2]; if(RK(e)==s->f[SU(e)]) sc+=50; else if(SU(e)==SU(c)&&RK(e)<RK(c)) sc-=30; }
        m[n].a=i;m[n].b=j;m[n].sc=sc;n++; } } }
  for(int i=1;i<n;i++){Mv t=m[i];int j=i-1;while(j>=0&&m[j].sc<t.sc){m[j+1]=m[j];j--;}m[j+1]=t;}
  return n; }
static void domove(St*s,int a,int b){ int c=s->p[a][--s->len[a]]; s->p[b][s->len[b]++]=c; }
/* ---- greedy ---- */
static int greedy(St s,int redeals){
  for(;;){
    for(;;){ autofound(&s); if(found(&s)==52) return 1; Mv m[200]; int n=gen(&s,m);
      if(n==0) break;
      if(RELAX && m[0].sc<20) break; /* prudent: voluntarily redeal rather than make a blocking move */
      domove(&s,m[0].a,m[0].b); }
    if(redeals<=0) return 0; redeals--; compact(&s); redeal(&s); } }
/* ---- dfs ---- */
#define HB 22
static uint64_t *tk; static uint32_t *ts; static uint32_t stamp;
static long nodes, cap; static int path[2000], pl; static int TRACE; static int phasemode; static int bestf; static St bests;
static uint64_t hs(St*s,int r){ uint64_t h=1469598103934665603ULL^r;
  for(int i=0;i<s->np;i++){ h=(h^(0xFF+s->len[i]))*1099511628211ULL; for(int j=0;j<s->len[i];j++) h=(h^s->p[i][j])*1099511628211ULL; }
  for(int k=0;k<4;k++) h=(h^s->f[k])*1099511628211ULL; return h?h:1; }
static int seen(uint64_t h){ uint64_t i=h&((1ULL<<HB)-1); while(ts[i]==stamp){ if(tk[i]==h) return 1; i=(i+1)&((1ULL<<HB)-1);} ts[i]=stamp;tk[i]=h;return 0; }
static int dfs(St s,int redeals){
  if(++nodes>cap) return 0;
  autofound(&s); int f=found(&s); if(f==52) return 1;
  compact(&s);
  if(seen(hs(&s,redeals))) return 0;
  Mv m[200]; int n=gen(&s,m);
  for(int i=0;i<n;i++){ St t=s; domove(&t,m[i].a,m[i].b); path[pl++]=m[i].a*32+m[i].b; if(dfs(t,redeals)) return 1; pl--; if(nodes>cap) return 0; }
  if(phasemode && (n==0||RELAX)){ if(f>bestf){bestf=f;bests=s;} return 0; }
  if(redeals>0 && (n==0||RELAX)){ St t=s; redeal(&t); path[pl++]=-1; if(dfs(t,redeals-1)) return 1; pl--; return 0; }
  return 0; }
/* returns 1 win, 0 lose(proved or capped); *capped set if cap hit */
static int solve(St s,int R,int*capped){
  *capped=0;
  if(MODE!=2){ stamp++; nodes=0; phasemode=0; int w=dfs(s,R); if(!w&&nodes>cap)*capped=1; return w; }
  for(int r=R;r>=0;r--){ stamp++; nodes=0; phasemode=1; bestf=-1;
    if(dfs(s,0)) return 1; if(nodes>cap)*capped=1;
    if(bestf<0) return 0; s=bests; if(r==0) return 0; compact(&s); redeal(&s); }
  return 0; }
int main(int argc,char**argv){
  if(argc<6){fprintf(stderr,"usage: lbl gather|gatherrev|shuffle greedy|dfs ndeals seed nodecap [redeals]\n");return 1;}
  MODE=!strcmp(argv[1],"gather")?0:!strcmp(argv[1],"gatherrev")?1:2;
  int dfsm=!strcmp(argv[2],"dfs"); long N=atol(argv[3]); uint64_t seed=strtoull(argv[4],0,10); cap=atol(argv[5]);
  int R=argc>6?atoi(argv[6]):2; RELAX=getenv("RELAX")!=0;
  tk=calloc(1ULL<<HB,8); ts=calloc(1ULL<<HB,4);
  long wins=0,capd=0,wins_by_deal[4]={0}; long sumf=0;
  for(long d=0;d<N;d++){
    rs=seed*1000003ULL+d; uint8_t c[52]; for(int i=0;i<52;i++)c[i]=i;
    for(int i=51;i>0;i--){int j=rnd()%(i+1);uint8_t t=c[i];c[i]=c[j];c[j]=t;}
    St s; deal(&s,c,52); int w, cp=0;
    pl=0; if(dfsm) w=solve(s,R,&cp);
    if(dfsm&&w&&MODE!=2&&getenv("TRACE")&&d<atol(getenv("TRACE"))){ printf("TRACE %llu %ld",(unsigned long long)seed,d); for(int i=0;i<pl;i++)printf(" %d",path[i]); printf("\n"); }
    wins+=w; capd+=(!w&&cp); }
  printf("relax=%d mode=%s solver=%s deals=%ld seed=%llu cap=%ld redeals=%d : wins=%ld (%.2f%%)  lost-but-capped/unknown=%ld  lost-otherwise=%ld\n",
    RELAX,argv[1],argv[2],N,(unsigned long long)seed,cap,R,wins,100.0*wins/N,capd,N-wins-capd);
  return 0; }
