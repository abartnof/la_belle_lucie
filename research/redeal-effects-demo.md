# La Belle Lucie — redeal effects (three.js)

(Reference supplied by the maintainer, extracted from a working demo. Kept verbatim; our game adapts it, see web3d/src/redeal-fx.js.)

Seven "redeal" animations for a three.js card table, extracted from a working, tested demo.
Each one picks up all 52 cards and lays them out again as the 18 fans of La Belle Lucie (17 fans of three + 1 single),
using recognizable physics. Every effect finishes in under 3 seconds (measured 2.3–2.9 s) and ends with every card
**exactly** on its slot, so game state never drifts from what is on screen.

Effects included: **Tornado, Casino fling, Gravity well, Shockwave rain, Four piles, Riffle shuffle, Sprinkler dealer.**
(Rubber-band snap and Popcorn shaker exist in the demo but are intentionally not included here.)

Tested on three.js **r128** (`THREE` global). Nothing here needs more than core three.js.

---

## 1. Conventions the code assumes

- **Y is up; the table is the XZ plane at y = 0.** Camera looks from +Z toward −Z, so screen-up is −Z.
- A card is `BoxGeometry(W, T, D)` = 0.9 × 0.014 × 1.26 lying flat. Identity rotation = **face up** (front texture on +Y, back on −Y).
  `flip = π` (rotation about the card's X axis) = face down. `yaw` = rotation about Y.
- World units are roughly 7 cm per unit. `G = 32` is deliberately snappier than real gravity so 3-second budgets feel natural.
- **Slots** (`slots[i]`) are the 52 target poses: `{x, y, z, yaw, fan}`. `y` is the card-centre height when resting, already including
  the small stacking offset within a fan (`T/2 + k*T*1.5` for the k-th card of a fan, k = 0 bottom). Slots are ordered fan by fan, bottom card first.
  **If you change the layout, keep that ordering** — several effects rely on "within a fan, lower slot index lands first" so cards stack
  correctly instead of passing through each other.
- `assign[cardIndex] = slotIndex` is the new deal. Most effects ignore the old assignment and generate their own shuffle; Casino fling, Four piles,
  Riffle and Sprinkler set `assign` themselves from the order cards leave the pile. After an effect finishes, `slots[assign[c.i]]` is where card `c` is.
  **Read `assign` after the animation to update your game state.**
- Layout used by the demo: 3 rows (z = −2.5, 0, 2.5) × 6 fans, x spacing 2.0, fan = 3 cards fanned ±0.3 rad about the bottom edge.
  Effects that use piles (Casino, Four piles, Riffle, Sprinkler) hard-code pile positions just outside/inside this layout — adjust `PILES`, the
  Casino pile `{x:0,z:5.1}`, `LP/RP/M_ST` and `CEN` if your table is a different size.

## 2. How an effect is structured

```js
modes.name = {
  desc:  'human-readable description',
  start() { /* set card states, schedule events with at(time, fn) */ },
  update(h) { /* optional, called every fixed step with timestep h */ },
  cleanup() { /* optional, called once at the end */ }
};
```

- Time is simulated time `now` (seconds since `run()`). `at(t, fn)` schedules a callback; `step(h)` runs events, then `mode.update(h)`,
  then advances each card according to its `state`.
- A card's `state` is one of: `'rest'`, `'ball'` (analytic projectile to a slot), `'bounce'` (landing hop + wobble), `'slide'` (friction slide),
  `'riff'` (riffle flight), `'vor'` (tornado), `'orb'` (gravity well). Effects are finished when no events remain and every card is `'rest'`.
- Two primitives do the final placement, and both guarantee an exact landing:
  - `launch(card, slot, flightTime, tumble)` — solves the projectile launch velocity so the card lands exactly on the slot after `flightTime`
    (orientation slerps to the slot's flat pose, optional tumble axis/rate, optional in-flight card bending), then enters `'bounce'`.
  - `slide(card, x, z, yaw, y, flip, a, spins)` — Coulomb-friction slide with launch speed `v0 = sqrt(2*a*d)` so the card stops exactly on target
    (constant deceleration `a = mu*g`); also handles spinning and flipping.
- **Landing realism** (`landKick` / `bounceStep`): vertical restitution about 0.3 over a few hops, a damped rocking tilt about a random horizontal axis,
  and an impulse into the card-bend spring. The card's x/z stay fixed at the slot (impact friction kills sideways motion), only height/tilt/bend move.
- **Card bending** is a small vertex-shader patch (`bendable`) driven by a per-card damped spring (`bend` -> `bendT`), updated in `step()`.
  It is optional visual polish: if you drop it, delete the `bendable()` wrapping, the `c.bu.value=c.bend` line in `step()`, and the `bend*` terms still run harmlessly.
  Note the shadow depth pass does not see the bend (negligible).

## 3. Integrating

1. Create the 52 card meshes (shared `geo`, per-card materials wrapped with `bendable(mat, bu)`), a `slots` array for your layout, and the `cards` records below.
2. Paste the shared code, then the effect(s) you want, then `step`/`run`/`finish`.
3. Call `run('tornado')` etc. to start; call `frame(dt, 1)` every render frame (it sub-steps at <= 1/120 s).
4. When `finish()` fires, read `assign` to know the new order (card `i` is now in slot `assign[i]`).
5. Optional extras the demo has that are *not* in this file: the felt table plane, lights/shadows, orbit camera, UI. The gravity well's glow is a `PointLight`
   (`wellLight`) at the well position; the Shockwave rain's `ring` mesh is purely visual and can be removed without affecting the cards.

Known limits: no card–card collision (cards pass through each other mid-flight); final arcs in Tornado / Gravity well / Rain / Sprinkler are
solved parabolas rather than pure integration, which is what guarantees exact landings; the demo draws cards face-up in the layout and face-down in piles.

---

## 4. Code

### 4.1 Constants and helpers
```js
const V3=THREE.Vector3, Q=THREE.Quaternion;
const AX=new V3(1,0,0), AY=new V3(0,1,0);
const W=0.9, D=1.26, T=0.014, G=32;      // card width, depth(length), thickness; gravity in world units/s^2
const rand=(a,b)=>a+Math.random()*(b-a);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const wrapPi=a=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}return a;}
function randUnit(){let v;do{v=new V3(rand(-1,1),rand(-1,1),rand(-1,1));}while(v.lengthSq()<0.05||v.lengthSq()>1);return v.normalize();}
const sgn=()=>Math.random()<0.5?-1:1;
const _qa=new Q(),_qb=new Q(),_q=new Q(),_q2=new Q(),_e=new THREE.Euler(),_n=new V3();
```

### 4.2 Card bending (optional vertex-shader patch)
`uBend > 0` curls the card's ends up (cup), `uBend < 0` arches it (bridge), along the long axis.
```js
const HZ=(D/2).toFixed(4);
// uBend > 0 curls the card's ends up (cup), < 0 arches it (bridge). Along the card's long axis.
function bendable(mat,u){
  mat.onBeforeCompile=function(sh){
    sh.uniforms.uBend=u;
    sh.vertexShader=sh.vertexShader
      .replace('#include <common>','#include <common>\nuniform float uBend;')
      .replace('#include <beginnormal_vertex>',
        'vec3 objectNormal = vec3( normal );\n'+
        'float bsl = uBend * 2.0 * (position.z / '+HZ+') / '+HZ+';\n'+
        'objectNormal = normalize( objectNormal + vec3( 0.0, 0.0, -bsl * normal.y ) );\n'+
        '#ifdef USE_TANGENT\n vec3 objectTangent = vec3( tangent.xyz );\n#endif')
      .replace('#include <begin_vertex>',
        'vec3 transformed = vec3( position );\n'+
        'float bzz = position.z / '+HZ+';\n'+
        'transformed.y += uBend * bzz * bzz;');
  };
  return mat;
}
const geo=new THREE.BoxGeometry(W,T,D,1,1,14);   // 14 segments along the long axis so bending has something to deform
```

### 4.3 Slot layout (18 fans: 17 of three + 1 single)
```js
/* ---------- fan layout: 17 fans of three + 1 single = 18 fans (6 + 6 + 6) ---------- */
const slots=[];
(function(){
  const rows=[6,6,6], rowZ=[-2.5,0,2.5], gap=2.0; let fan=0;
  rows.forEach((n,r)=>{
    for(let f=0;f<n;f++){
      const cx=(f-(n-1)/2)*gap, cz=rowZ[r], cnt=(fan===17)?1:3;
      for(let k=0;k<cnt;k++){
        const th=cnt===1?0:(1-k)*0.3;
        const pivx=cx, pivz=cz+D/2;
        slots.push({x:pivx-Math.sin(th)*D/2, z:pivz-Math.cos(th)*D/2, yaw:th, y:T/2+k*T*1.5, fan:fan});
      }
      fan++;
    }
  });
})();
```

### 4.4 Card records
```js
// Per-card state the effects rely on. Build one per card; `m` is the THREE.Mesh, `bu` is the uBend uniform object
// shared by that card's 3 materials (side/face/back, all passed through bendable()).
const cards=[];
for(let i=0;i<52;i++){
  const bu={value:0};
  // ... create materials (wrap each with bendable(mat,bu)) and mesh m = new THREE.Mesh(geo,[side,side,face,back,side,side]) ...
  cards.push({i:i,m:m,p:m.position,q:m.quaternion,v:new V3(),state:'rest',yaw:0,flip:0,
    bend:0,bendV:0,bendT:0,bu:bu,tilt:0,tiltV:0,tax:new V3(1,0,0),by:0,bv:0,tq:new Q()});
}
let assign=shuffle(cards.map((c,i)=>i));   // card i -> slot index assign[i]; each mode overwrites/uses this
```

### 4.5 Orientation helpers
```js
function setOrient(c,yaw,flip){
  c.yaw=yaw;c.flip=flip;
  _qa.setFromAxisAngle(AY,yaw);_qb.setFromAxisAngle(AX,flip);
  c.q.copy(_qa).multiply(_qb);
}
function place(c,s){c.p.set(s.x,s.y,s.z);setOrient(c,s.yaw,0);c.state='rest';c.v.set(0,0,0);}
```

### 4.6 Shared motion primitives
(`landKick`/`bounceStep` landing, `launch`/`ballStep` projectile, `slide`/`slideStep` friction, `floorHit`, `flatten`, `gatherTo`.)
```js
/* ---------- shared motion primitives ---------- */
let now=0, events=[], mode=null, running=false, paused=false, lastDur=0;
function at(t,fn){events.push({at:t,fn:fn});events.sort((a,b)=>a.at-b.at);}
function slotOrderCards(){const arr=[];cards.forEach(c=>{arr[assign[c.i]]=c;});return arr;}
function settle(c){ // finish an in-progress friction slide instantly
  if(c.state==='slide'){c.state='rest';c.p.set(c.sx+c.dx*c.d,c.y1,c.sz+c.dz*c.d);setOrient(c,c.tyaw,c.fl1);}
}

// Real landing: vertical restitution + a rocking wobble + a flex of the card itself.
function landKick(c,vyAbs){
  c.by=0;c.bv=Math.min(0.3*vyAbs,6.5);
  c.tax=new V3(rand(-1,1),0,rand(-1,1)).normalize();c.tilt=0;
  c.tiltV=clamp(vyAbs*0.14,0,3.2)*sgn();
  c.bendT=0;c.bendV+=clamp(vyAbs*0.2,0,4)*sgn();
  c.state='bounce';
}
function bounceStep(c,h){
  c.by+=c.bv*h;c.bv-=G*h;
  if(c.by<=0){
    c.by=0;const imp=-c.bv;
    if(imp>1.2){c.bv=imp*0.3;c.tiltV+=clamp(imp*0.08,0,1.2)*sgn();c.bendV+=clamp(imp*0.1,0,2)*sgn();}
    else c.bv=0;
  }
  c.tiltV+=(-260*c.tilt-14*c.tiltV)*h;c.tilt+=c.tiltV*h;
  c.p.y=c.tgt.y+c.by+0.6*Math.abs(Math.sin(c.tilt));
  _qa.setFromAxisAngle(c.tax,c.tilt);c.q.copy(_qa).multiply(c.qT);
  if(c.bv===0&&c.by===0&&Math.abs(c.tilt)<0.004&&Math.abs(c.tiltV)<0.15){
    c.state='rest';c.tilt=0;c.tiltV=0;c.q.copy(c.qT);c.p.y=c.tgt.y;
  }
}

// Projectile motion: choose the launch velocity that lands on the slot after Tf seconds.
function launch(c,slot,Tf,tumble){
  settle(c);
  c.state='ball';c.t0=now;c.Tf=Tf;c.p0=c.p.clone();c.q0=c.q.clone();c.tgt=slot;c.tb=tumble||null;
  c.v0=new V3((slot.x-c.p.x)/Tf,(slot.y-c.p.y+0.5*G*Tf*Tf)/Tf,(slot.z-c.p.z)/Tf);
  c.qT=new Q().setFromAxisAngle(AY,slot.yaw);
}
function ballStep(c){
  const s=now-c.t0;
  if(s<c.Tf){
    c.p.set(c.p0.x+c.v0.x*s, c.p0.y+c.v0.y*s-0.5*G*s*s, c.p0.z+c.v0.z*s);
    const u=s/c.Tf;
    if(c.tb){
      _qa.setFromAxisAngle(c.tb.axis,c.tb.w*s);_qa.multiply(c.q0);
      c.q.copy(_qa).slerp(c.qT,smooth((u-0.4)/0.5));
      c.bendT=0.22*Math.sin(s*16+c.i*1.7)*(1-u);
    }else{
      c.q.copy(c.q0).slerp(c.qT,smooth(u));
    }
  }else{
    const vy=c.v0.y-G*c.Tf;
    c.p.set(c.tgt.x,c.tgt.y,c.tgt.z);c.q.copy(c.qT);c.yaw=c.tgt.yaw;c.flip=0;
    landKick(c,Math.abs(vy));
  }
}

// Coulomb friction slide: launch speed v0 = sqrt(2*a*d), a = mu*g, so the card stops exactly on target.
function slide(c,tx,tz,tyaw,ty,tflip,a,spins){
  settle(c);
  const dx=tx-c.p.x,dz=tz-c.p.z,d=Math.hypot(dx,dz)||1e-4;
  c.state='slide';c.t0=now;c.sx=c.p.x;c.sz=c.p.z;c.dx=dx/d;c.dz=dz/d;c.d=d;c.ts=Math.max(Math.sqrt(2*d/a),0.02);
  c.yaw0=c.yaw;c.dyaw=wrapPi(tyaw-c.yaw)+sgn()*2*Math.PI*spins;
  c.fl0=c.flip;c.fl1=tflip;c.y0=c.p.y;c.y1=ty;c.tyaw=tyaw;
}
function slideStep(c){
  const u=clamp((now-c.t0)/c.ts,0,1), e=1-(1-u)*(1-u);
  c.p.x=c.sx+c.dx*c.d*e;c.p.z=c.sz+c.dz*c.d*e;
  const fl=c.fl0+(c.fl1-c.fl0)*e;
  c.p.y=c.y0+(c.y1-c.y0)*e+Math.sin(Math.PI*u)*(0.05+c.i*0.0004)+(D/2)*Math.abs(Math.sin(fl));
  setOrient(c,c.yaw0+c.dyaw*e,fl);
  if(u>=1){settle(c);}
}

// felt: bounce + kinetic friction
function floorHit(c,h,res){
  const p=c.p,v=c.v;
  if(p.y<T/2){
    p.y=T/2;
    if(v.y<0)v.y=-v.y*res;
    if(v.y<0.8)v.y=0;
    const sp=Math.hypot(v.x,v.z);
    if(sp>0){const k=Math.max(0,sp-0.4*G*h)/sp;v.x*=k;v.z*=k;}
  }
}
function flatten(c,h,rate){
  _e.setFromQuaternion(c.q,'YXZ');_q2.setFromAxisAngle(AY,_e.y);
  c.q.slerp(_q2,1-Math.exp(-rate*h));
}

// Quick gather: every card slides (friction) to a pile, face-down. Returns nothing; schedules events.
function gatherTo(list,pileOf,a,stagger,t0,spins){
  const counts={};
  list.forEach((c,n)=>{
    const P=pileOf(c,n);counts[P.id]=(counts[P.id]||0);const idx=counts[P.id]++;
    c.pileIdx=idx;c.pile=P;
    at(t0+n*stagger,()=>slide(c,P.x+rand(-0.04,0.04),P.z+rand(-0.04,0.04),(P.yaw||0)+rand(-0.08,0.08),T/2+idx*0.0125,Math.PI,a,spins));
  });
}
```

### 4.7 Effects

#### Tornado + Casino fling
```js
const modes={};
const CEN={x:0,z:0.3};

/* 1. TORNADO */
const TOR={cx:0,cz:0.3};
modes.tornado={
  desc:'Linear air drag toward a vortex wind field — swirl, ground inflow and a funnel-shaped updraft carry the cards. Then each is released on a projectile arc to its fan.',
  start(){
    cards.forEach(c=>{c.state='vor';c.v.set(0,0,0);c.tw={axis:randUnit(),w:rand(7,13)};c.k=rand(3.0,4.2);});
    slotOrderCards().forEach((c,j)=>at(1.1+j*0.011,()=>launch(c,slots[j],0.6,{axis:randUnit(),w:rand(3,7)})));
  },
  update(h){
    const s=smooth(now/0.4)*(1-smooth((now-1.1)/0.8));
    for(const c of cards){
      if(c.state!=='vor')continue;
      const p=c.p,v=c.v,x=p.x-TOR.cx,z=p.z-TOR.cz,r=Math.hypot(x,z)+1e-3,y=p.y;
      const rf=0.9+0.5*y, rc=1.1+0.42*y, q=r/rc;
      const vt=12*2*q/(1+q*q);
      const gf=clamp(1-y/0.8,0,1);
      const ur=gf*(-12*r/(r+1.2))+(1-gf)*(-3.5*(r-rf));
      const uy=28*Math.exp(-Math.pow(r/(rf+0.6),2))*clamp((6.4-y)/2,0,1);
      const ex=x/r,ez=z/r,k=c.k;
      const ufx=(ur*ex-vt*ez)*s,ufz=(ur*ez+vt*ex)*s,ufy=uy*s;
      v.x+=k*(ufx-v.x)*h;v.z+=k*(ufz-v.z)*h;v.y+=(k*(ufy-v.y)-G)*h;
      const sp=v.length();if(sp>30)v.multiplyScalar(30/sp);
      p.addScaledVector(v,h);
      floorHit(c,h,0.3);
      if(p.y>0.5){
        const af=smooth((p.y-0.5)/0.8)*s;
        if(af>0){_q.setFromAxisAngle(c.tw.axis,c.tw.w*h*af);c.q.premultiply(_q).normalize();}
        c.bendT=0.22*Math.sin(now*14+c.i)*af;
      }else{flatten(c,h,12);c.bendT=0;}
    }
  }
};

/* 2. CASINO FLING */
modes.casino={
  desc:'Pure Coulomb friction. Each card is flicked at v₀ = √(2μgd), so it decelerates and stops exactly on target — into a face-down pile, then dealt out and flipped in order.',
  start(){
    const g=shuffle(cards.slice());
    gatherTo(g,()=>({id:0,x:0,z:5.1,yaw:0}),70,0.011,0.05,1);
    const tDeal=1.3;
    for(let j=0;j<52;j++){
      const c=g[51-j];assign[c.i]=j;
      at(tDeal+j*0.014,()=>{const s=slots[j];slide(c,s.x,s.z,s.yaw,s.y,0,64,1);});
    }
  }
};
```

#### Gravity well
```js
/* 3. GRAVITY WELL */
const WELL=new V3(0,3.4,0.3), GM=900, EPS=1.0;
const wellLight=new THREE.PointLight(0xffd9a0,0,22);wellLight.position.copy(WELL);scene.add(wellLight);
modes.well={
  desc:'Inverse-square attraction (a = GM/r²) toward a point above the felt, plus a little swirl torque and air drag. Cards slide in, lift off, fall into orbit — then are released on projectile arcs.',
  start(){
    cards.forEach(c=>{c.state='orb';c.v.set(0,0,0);c.sp0=rand(0,6.28);c.sw=rand(5,10)*sgn();});
    slotOrderCards().forEach((c,j)=>at(1.2+j*0.009,()=>launch(c,slots[j],0.5,{axis:randUnit(),w:rand(3,7)})));
  },
  update(h){
    const ramp=smooth(now/0.3), swirl=12*(1-smooth((now-0.3)/0.7)), gm=GM*ramp;
    const vis=ramp*(1-smooth((now-1.15)/0.5));
    wellLight.intensity=1.8*vis;
    for(const c of cards){
      if(c.state!=='orb')continue;
      const p=c.p,v=c.v;
      const dx=WELL.x-p.x,dy=WELL.y-p.y,dz=WELL.z-p.z;
      const d2=dx*dx+dy*dy+dz*dz+EPS, inv=gm/(d2*Math.sqrt(d2));
      let ax=dx*inv,ay=dy*inv-G,az=dz*inv;
      const hx=p.x-WELL.x,hz=p.z-WELL.z,hr=Math.hypot(hx,hz)+1e-3;
      const sf=swirl*Math.min(1,hr/1.5)/hr;
      ax+=-hz*sf;az+=hx*sf;
      ax-=v.x*0.12;ay-=v.y*0.12;az-=v.z*0.12;
      v.x+=ax*h;v.y+=ay*h;v.z+=az*h;
      const sp=v.length();if(sp>34)v.multiplyScalar(34/sp);
      p.addScaledVector(v,h);
      floorHit(c,h,0.55);
      if(p.y>0.9){
        _n.set(dx,dy,dz).normalize();
        _q.setFromUnitVectors(AY,_n);_q2.setFromAxisAngle(_n,c.sp0+c.sw*now);_q2.multiply(_q);
        c.q.slerp(_q2,1-Math.exp(-9*h));
        c.bendT=0.18*Math.sin(now*13+c.i);
      }else{flatten(c,h,10);c.bendT=0;}
    }
  },
  cleanup(){wellLight.intensity=0;}
};
```

#### Shockwave rain
```js
/* 4. SHOCKWAVE RAIN */
const ring=new THREE.Mesh(new THREE.RingGeometry(0.96,1,96),new THREE.MeshBasicMaterial({color:0xcff7df,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
ring.rotation.x=-Math.PI/2;ring.position.y=0.02;ring.visible=false;scene.add(ring);
const WAVE=14;
modes.rain={
  desc:'A radial shockwave (14 units/s) pops each card off the felt as it passes. Every card is lobbed on the parabola that brings it home about a second later — tumbling and flexing in the air.',
  start(){
    ring.visible=true;
    const bySlot=slotOrderCards(),landOf=[];
    bySlot.forEach((c,si)=>{
      const s=slots[si],r=Math.hypot(c.p.x,c.p.z-0.3);
      const tp=0.05+r/WAVE+rand(0,0.05);
      let land=tp+1.05+rand(0,0.3);
      if(si>0&&slots[si-1].fan===s.fan)land=Math.max(land,landOf[si-1]+0.08);
      landOf[si]=land;
      at(tp,()=>launch(c,s,land-tp,{axis:randUnit(),w:rand(5,13)}));
    });
  },
  update(){
    const r=WAVE*now;
    ring.visible=r<10;ring.scale.setScalar(Math.max(r,0.01));ring.position.z=0.3;
    ring.material.opacity=0.8*(1-clamp(r/10,0,1));
  },
  cleanup(){ring.visible=false;}
};
```

#### Four piles
```js
/* 5. FOUR PILES — slide to four piles (up/down/left/right), then back out */
const PILES=[
  {id:0,x:0,z:-5.0,yaw:0},   // up
  {id:1,x:7.4,z:0.3,yaw:0},  // right
  {id:2,x:0,z:5.6,yaw:0},    // down
  {id:3,x:-7.4,z:0.3,yaw:0}  // left
];
modes.piles={
  desc:'Friction slides: every card goes to the nearest of four piles (up, down, left, right), face-down. Then the piles take turns dealing their top card out to the fans, flipping as they slide.',
  start(){
    const g=shuffle(cards.slice());
    gatherTo(g,c=>{let best=PILES[0],bd=1e9;for(const P of PILES){const d=Math.hypot(c.p.x-P.x,c.p.z-P.z);if(d<bd){bd=d;best=P;}}return best;},70,0.007,0.05,1);
    const stacks=PILES.map(()=>[]);
    g.forEach(c=>{const P=PILES.reduce((b,P)=>Math.hypot(c.p.x-P.x,c.p.z-P.z)<Math.hypot(c.p.x-b.x,c.p.z-b.z)?P:b,PILES[0]);stacks[P.id].push(c);});
    let ptr=0;
    for(let j=0;j<52;j++){
      let guard=0;while(!stacks[ptr%4].length&&guard++<4)ptr++;
      const c=stacks[ptr%4].pop();ptr++;assign[c.i]=j;
      at(1.05+j*0.014,()=>{const s=slots[j];slide(c,s.x,s.z,s.yaw,s.y,0,64,1);});
    }
  }
};
```

#### Riffle shuffle (with card bending)
```js
/* 6. RIFFLE SHUFFLE — with real card bending */
const M_ST={x:0,z:1.9}, LP={id:0,x:-1.25,z:1.9,yaw:0.35}, RP={id:1,x:1.25,z:1.9,yaw:-0.35};
function riffleStart(c,mm){
  settle(c);
  c.state='riff';c.t0=now;c.Tr=0.17;c.rp0=c.p.clone();c.ry0=c.yaw;
  c.y1=T/2+mm*0.0125;c.mx=M_ST.x+rand(-0.03,0.03);c.mz=M_ST.z+rand(-0.03,0.03);
}
function riffStep(c){
  const u=clamp((now-c.t0)/c.Tr,0,1),e=smooth(u);
  c.p.x=c.rp0.x+(c.mx-c.rp0.x)*e;c.p.z=c.rp0.z+(c.mz-c.rp0.z)*e;
  c.p.y=c.rp0.y+(c.y1-c.rp0.y)*e+0.8*Math.sin(Math.PI*u);
  setOrient(c,c.ry0*(1-e),Math.PI);
  c.bendT=-0.34*Math.sin(Math.PI*u);       // thumbs bow the card into a bridge
  if(u>=1){
    c.p.set(c.mx,c.y1,c.mz);
    c.tgt={y:c.y1};c.qT=new Q().setFromAxisAngle(AX,Math.PI);setOrient(c,0,Math.PI);
    landKick(c,5);
  }
}
modes.riffle={
  desc:'Two half-decks are bowed by the thumbs and released alternately; each card arches (bends), drops onto the merged stack and slaps down flexing. Then the stack is dealt out face-up.',
  start(){
    const g=shuffle(cards.slice()),L=[],R=[];
    g.forEach((c,n)=>{
      const left=(n%2===0),arr=left?L:R,P=left?LP:RP,idx=arr.length;arr.push(c);
      at(0.05+n*0.005,()=>slide(c,P.x+rand(-0.04,0.04),P.z+rand(-0.04,0.04),P.yaw+rand(-0.04,0.04),T/2+idx*0.0125,Math.PI,70,0));
    });
    const t0=0.95,dt=0.009,merged=[];let m=0,side=Math.random()<0.5?0:1;
    while(L.length||R.length){
      const take=1+(Math.random()<0.3?1:0);
      for(let k=0;k<take;k++){
        const arr=(side===0)?(L.length?L:R):(R.length?R:L);
        if(!arr.length)break;
        const c=arr.pop(),mm=m++;merged.push(c);
        at(t0+mm*dt,()=>riffleStart(c,mm));
      }
      side^=1;
    }
    const tDeal=t0+52*dt+0.17+0.1;
    for(let j=0;j<52;j++){
      const c=merged[51-j];assign[c.i]=j;
      at(tDeal+j*0.0075,()=>{const s=slots[j];slide(c,s.x,s.z,s.yaw,s.y,0,64,0.5);});
    }
  }
};
```

#### Sprinkler dealer
```js
/* 9. SPRINKLER DEALER — a rotating arm fires each card as it points at the fan */
const S_T0=0.78,S_ROT=0.9;
modes.sprinkler={
  desc:'Cards are gathered into a central pile. An invisible dealing arm then sweeps around at a constant angular velocity (≈7 rad/s); as it points at a fan, the top card is fired on a projectile arc, flipping in flight.',
  start(){
    const g=shuffle(cards.slice());
    gatherTo(g,()=>({id:0,x:CEN.x,z:CEN.z,yaw:0}),80,0.005,0.05,1);
    const tf=slots.map(s=>S_T0+(Math.atan2(s.z-CEN.z,s.x-CEN.x)+Math.PI)/(2*Math.PI)*S_ROT);
    for(let j=1;j<slots.length;j++)if(slots[j].fan===slots[j-1].fan)tf[j]=Math.max(tf[j],tf[j-1]+0.012);
    const order=slots.map((s,j)=>j).sort((a,b)=>tf[a]-tf[b]);
    order.forEach((j,m)=>{
      const c=g[51-m];assign[c.i]=j;
      at(tf[j],()=>launch(c,slots[j],0.48,{axis:randUnit(),w:rand(2,6)}));
    });
  },
};
```

### 4.8 Stepping and running
```js
function step(h){
  now+=h;
  while(events.length&&events[0].at<=now)events.shift().fn();
  if(mode&&mode.update)mode.update(h);
  for(const c of cards){
    if(c.state==='ball')ballStep(c);
    else if(c.state==='bounce')bounceStep(c,h);
    else if(c.state==='slide')slideStep(c);
    else if(c.state==='riff')riffStep(c);
    // card flex: a damped spring toward the target bend
    c.bendV+=(-420*(c.bend-c.bendT)-16*c.bendV)*h;c.bend+=c.bendV*h;
    if(c.bendT===0&&Math.abs(c.bend)<1e-4&&Math.abs(c.bendV)<1e-3){c.bend=0;c.bendV=0;}
    c.bu.value=c.bend;
  }
}
function allRest(){return events.length===0&&cards.every(c=>c.state==='rest');}
function run(name){
  if(running)return;
  mode=modes[name];running=true;now=0;events=[];
  cards.forEach(c=>{c.bendT=0;});
  assign=shuffle(cards.map((c,i)=>i));
  mode.start();
}
function finish(){ running=false; lastDur=now; if(mode&&mode.cleanup)mode.cleanup(); }
// Drive it from your render loop with a FIXED small timestep (<= 1/120 s); the physics is tuned for that:
function frame(realDt,timeScale){
  if(!running)return;
  const dt=Math.min(realDt,1/20)*timeScale, n=Math.max(1,Math.ceil(dt/(1/120))), h=dt/n;
  for(let i=0;i<n;i++)step(h);
  if(allRest())finish();
}
```
