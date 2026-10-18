// The Redeal animations (docs/UI.md `table.js`).
//
// Provenance: the seven effects (tornado, casino fling, gravity well, shockwave
// rain, four piles, riffle shuffle, sprinkler dealer) and their physics
// primitives (launch, slide, landKick) are adapted from the maintainer's
// three.js demo, kept in research/redeal-effects-demo.md. Changes: ported to
// modules with a seeded RNG; card-for-slot assignment comes from the engine
// (card j ends on slot j, the pile is built so the dealing order is natural);
// pile and centre positions come from the layout's extent; card bending is
// dropped (the kit's cards carry an ink hull that would need it too).
//
// The simulation is pure: it needs only three's maths, no renderer or DOM, so
// the Node tests step it headless. It runs in the demo's own units internally
// (a card 0.9 wide, gravity 32) and reports centimetres. Orientation: the demo
// lies a card flat (identity = face up, rotation about X = flip); the kit's
// card stands up in its own frame, so a pose is demo-orientation * Rx(-90deg).
// A face-down card then shows the back, which is also what an unrevealed card
// shows, so no face needs swapping while cards are piled.
//
//   createRedeal(name, { from, slots, rng }) -> sim
//     from   [{ x, y, z, yaw }]  where card j lies now (cm; y the card's centre)
//     slots  [{ x, y, z, yaw, fan }]  where card j must end, fan by fan, bottom
//            card first (so within a fan a lower index must land first)
//     rng    () => [0, 1), seeded
//   sim.step(h), sim.done(), sim.time, sim.write(j, position, quaternion),
//   sim.light, sim.ring (the well's light and the shockwave's ring, in cm),
//   sim.error (the largest distance from a slot when the effect ended, cm).

import { Quaternion, Vector3 } from "three";
import { CARD } from "../../kit/js/units.js";

export const EFFECTS = Object.freeze(["tornado", "casino", "well", "rain", "piles", "riffle", "sprinkler"]);
export const EFFECT_NAMES = Object.freeze({
  tornado: "Tornado",
  casino: "Casino fling",
  well: "Gravity well",
  rain: "Shockwave rain",
  piles: "Four piles",
  riffle: "Riffle shuffle",
  sprinkler: "Sprinkler dealer",
});

// A centimetre length per demo unit: the demo's card is 0.9 wide.
export const K = CARD.width / 0.9;

const V3 = Vector3;
const Q = Quaternion;
const AX = new V3(1, 0, 0);
const AY = new V3(0, 1, 0);
const D = 1.26; // the demo card's length, in demo units
const T = CARD.thickness / K; // thickness, demo units
const G = 32;
const STACK = 0.0125; // rise of one card in a pile
const FLAT_TO_CARD = new Q().setFromAxisAngle(AX, -Math.PI / 2);

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (x) => {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};
const wrapPi = (a) => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

// A small seeded generator (mulberry32).
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRedeal(name, { from, slotsCm, slots: slotsIn, rng = Math.random }) {
  const mode = modes[name];
  if (!mode) throw new Error(`no redeal effect ${name}`);
  const given = slotsIn ?? slotsCm;
  const N = given.length;
  if (from.length !== N) throw new Error("one start pose per slot");

  const rand = (a, b) => a + rng() * (b - a);
  const sgn = () => (rng() < 0.5 ? -1 : 1);
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const randUnit = () => {
    let v;
    do v = new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
    while (v.lengthSq() < 0.05 || v.lengthSq() > 1);
    return v.normalize();
  };

  const slots = given.map((s) => ({ x: s.x / K, y: s.y / K, z: s.z / K, yaw: s.yaw ?? 0, fan: s.fan ?? 0 }));
  const _qa = new Q();
  const _qb = new Q();
  const _q = new Q();
  const _q2 = new Q();
  const _n = new V3();

  // ---- the table's extent, in demo units
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const s of slots) {
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x);
    minZ = Math.min(minZ, s.z);
    maxZ = Math.max(maxZ, s.z);
  }
  if (!N) [minX, maxX, minZ, maxZ] = [0, 0, 0, 0];
  const CEN = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const ROW = { x: CEN.x, z: maxZ }; // the last row: dealt last, so a pile there is gone by then
  let reach = 0.5;
  for (const f of from) reach = Math.max(reach, Math.hypot(f.x / K - CEN.x, f.z / K - CEN.z));
  for (const s of slots) reach = Math.max(reach, Math.hypot(s.x - CEN.x, s.z - CEN.z));

  // ---- cards
  const cards = from.map((f, j) => ({
    i: j,
    p: new V3(f.x / K, f.y / K, f.z / K),
    q: new Q().setFromAxisAngle(AY, f.yaw ?? 0),
    v: new V3(),
    state: "rest",
    yaw: f.yaw ?? 0,
    flip: 0,
    tilt: 0,
    tiltV: 0,
    tax: new V3(1, 0, 0),
    by: 0,
    bv: 0,
    tq: new Q(),
  }));

  let now = 0;
  let events = [];
  const sim = { time: 0, light: { x: 0, y: 0, z: 0, intensity: 0 }, ring: { on: false, x: 0, z: 0, radius: 0, opacity: 0 }, error: 0 };
  const at = (t, fn) => {
    events.push({ at: t, fn });
    events.sort((a, b) => a.at - b.at);
  };

  function setOrient(c, yaw, flip) {
    c.yaw = yaw;
    c.flip = flip;
    _qa.setFromAxisAngle(AY, yaw);
    _qb.setFromAxisAngle(AX, flip);
    c.q.copy(_qa).multiply(_qb);
  }

  function settle(c) {
    if (c.state === "slide") {
      c.state = "rest";
      c.p.set(c.sx + c.dx * c.d, c.y1, c.sz + c.dz * c.d);
      setOrient(c, c.tyaw, c.fl1);
    }
  }

  // A landing: vertical restitution, a rocking wobble about a random horizontal axis.
  function landKick(c, vyAbs) {
    c.by = 0;
    c.bv = Math.min(0.3 * vyAbs, 6.5);
    c.tax = new V3(rand(-1, 1), 0, rand(-1, 1)).normalize();
    c.tilt = 0;
    c.tiltV = clamp(vyAbs * 0.14, 0, 3.2) * sgn();
    c.state = "bounce";
  }
  function bounceStep(c, h) {
    c.by += c.bv * h;
    c.bv -= G * h;
    if (c.by <= 0) {
      c.by = 0;
      const imp = -c.bv;
      if (imp > 1.2) {
        c.bv = imp * 0.3;
        c.tiltV += clamp(imp * 0.08, 0, 1.2) * sgn();
      } else c.bv = 0;
    }
    c.tiltV += (-260 * c.tilt - 14 * c.tiltV) * h;
    c.tilt += c.tiltV * h;
    c.p.y = c.tgt.y + c.by + 0.6 * Math.abs(Math.sin(c.tilt));
    _qa.setFromAxisAngle(c.tax, c.tilt);
    c.q.copy(_qa).multiply(c.qT);
    if (c.bv === 0 && c.by === 0 && Math.abs(c.tilt) < 0.004 && Math.abs(c.tiltV) < 0.15) {
      c.state = "rest";
      c.tilt = 0;
      c.tiltV = 0;
      c.q.copy(c.qT);
      c.p.y = c.tgt.y;
    }
  }

  // Projectile: the launch velocity that lands on the slot after Tf seconds.
  function launch(c, slot, Tf, tumble) {
    settle(c);
    c.state = "ball";
    c.t0 = now;
    c.Tf = Tf;
    c.p0 = c.p.clone();
    c.q0 = c.q.clone();
    c.tgt = slot;
    c.tb = tumble || null;
    c.v0 = new V3((slot.x - c.p.x) / Tf, (slot.y - c.p.y + 0.5 * G * Tf * Tf) / Tf, (slot.z - c.p.z) / Tf);
    c.qT = new Q().setFromAxisAngle(AY, slot.yaw);
  }
  function ballStep(c) {
    const s = now - c.t0;
    if (s < c.Tf) {
      c.p.set(c.p0.x + c.v0.x * s, c.p0.y + c.v0.y * s - 0.5 * G * s * s, c.p0.z + c.v0.z * s);
      const u = s / c.Tf;
      if (c.tb) {
        _qa.setFromAxisAngle(c.tb.axis, c.tb.w * s);
        _qa.multiply(c.q0);
        c.q.copy(_qa).slerp(c.qT, smooth((u - 0.4) / 0.5));
      } else {
        c.q.copy(c.q0).slerp(c.qT, smooth(u));
      }
    } else {
      const vy = c.v0.y - G * c.Tf;
      c.p.set(c.tgt.x, c.tgt.y, c.tgt.z);
      c.q.copy(c.qT);
      c.yaw = c.tgt.yaw;
      c.flip = 0;
      landKick(c, Math.abs(vy));
    }
  }

  // Coulomb friction: launch speed sqrt(2 a d), so the card stops on target.
  function slide(c, tx, tz, tyaw, ty, tflip, a, spins) {
    settle(c);
    const dx = tx - c.p.x;
    const dz = tz - c.p.z;
    const d = Math.hypot(dx, dz) || 1e-4;
    c.state = "slide";
    c.t0 = now;
    c.sx = c.p.x;
    c.sz = c.p.z;
    c.dx = dx / d;
    c.dz = dz / d;
    c.d = d;
    c.ts = Math.max(Math.sqrt((2 * d) / a), 0.02);
    c.yaw0 = c.yaw;
    c.dyaw = wrapPi(tyaw - c.yaw) + sgn() * 2 * Math.PI * spins;
    c.fl0 = c.flip;
    c.fl1 = tflip;
    c.y0 = c.p.y;
    c.y1 = ty;
    c.tyaw = tyaw;
  }
  function slideStep(c) {
    const u = clamp((now - c.t0) / c.ts, 0, 1);
    const e = 1 - (1 - u) * (1 - u);
    c.p.x = c.sx + c.dx * c.d * e;
    c.p.z = c.sz + c.dz * c.d * e;
    const fl = c.fl0 + (c.fl1 - c.fl0) * e;
    c.p.y = c.y0 + (c.y1 - c.y0) * e + Math.sin(Math.PI * u) * (0.05 + c.i * 0.0004) + (D / 2) * Math.abs(Math.sin(fl));
    setOrient(c, c.yaw0 + c.dyaw * e, fl);
    if (u >= 1) settle(c);
  }

  function floorHit(c, h, res) {
    const { p, v } = c;
    if (p.y < T / 2) {
      p.y = T / 2;
      if (v.y < 0) v.y = -v.y * res;
      if (v.y < 0.8) v.y = 0;
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) {
        const k = Math.max(0, sp - 0.4 * G * h) / sp;
        v.x *= k;
        v.z *= k;
      }
    }
  }
  function flatten(c, h, rate) {
    const e = yawOf(c.q);
    _q2.setFromAxisAngle(AY, e);
    c.q.slerp(_q2, 1 - Math.exp(-rate * h));
  }
  const yawOf = (q) => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x)); // the YXZ euler's y

  // Every card slides to a pile, face down. `list` is in stack order (bottom
  // first). Returns when the last one stops.
  function gatherTo(list, pileOf, a, stagger, t0, spins) {
    const counts = {};
    let end = t0;
    list.forEach((c, n) => {
      const P = pileOf(c, n);
      const idx = (counts[P.id] = counts[P.id] ?? 0);
      counts[P.id]++;
      const jx = rand(-0.04, 0.04);
      const jz = rand(-0.04, 0.04);
      const jy = rand(-0.08, 0.08);
      const tx = P.x + jx;
      const tz = P.z + jz;
      const t = t0 + n * stagger;
      end = Math.max(end, t + Math.sqrt((2 * Math.hypot(tx - c.p.x, tz - c.p.z)) / a) + 0.02);
      at(t, () => slide(c, tx, tz, (P.yaw || 0) + jy, T / 2 + idx * STACK, Math.PI, a, spins));
    });
    return end;
  }

  const ctx = { cards, slots, N, CEN, ROW, reach, at, rand, rng, sgn, shuffle, randUnit, launch, slide, settle, gatherTo, landKick, floorHit, flatten, setOrient, smooth, from, sim, Q, V3, AX, AY, _q, _q2, _n, getNow: () => now };
  const state = mode(ctx);
  const update = state.update;

  function step(h) {
    now += h;
    sim.time = now;
    while (events.length && events[0].at <= now) events.shift().fn();
    update?.(h, now);
    for (const c of cards) {
      if (c.state === "ball") ballStep(c);
      else if (c.state === "bounce") bounceStep(c, h);
      else if (c.state === "slide") slideStep(c);
      else if (c.state === "riff") state.riffStep(c);
    }
  }
  sim.done = () => events.length === 0 && cards.every((c) => c.state === "rest");

  // Exactly on the slots, after the physics said they were there.
  sim.finish = () => {
    let err = 0;
    cards.forEach((c, j) => {
      const s = slots[j];
      err = Math.max(err, Math.hypot(c.p.x - s.x, c.p.y - s.y, c.p.z - s.z) * K);
      c.p.set(s.x, s.y, s.z);
      setOrient(c, s.yaw, 0);
      c.state = "rest";
    });
    sim.error = err;
    sim.light.intensity = 0;
    sim.ring.on = false;
    return err;
  };

  sim.step = (h) => {
    // Sub-steps of at most 1/120 s: the physics is tuned for that.
    const n = Math.max(1, Math.ceil(h / (1 / 120)));
    for (let i = 0; i < n; i++) step(h / n);
  };
  sim.count = N;
  sim.write = (j, position, quaternion) => {
    const c = cards[j];
    position.set(c.p.x * K, c.p.y * K, c.p.z * K);
    quaternion.copy(c.q).multiply(FLAT_TO_CARD);
  };
  sim.valid = () => cards.every((c) => [c.p.x, c.p.y, c.p.z, c.q.x, c.q.y, c.q.z, c.q.w].every(Number.isFinite));
  state.start?.();
  return sim;
}

// ---- the effects ---------------------------------------------------------------
// Each is given the shared context, schedules its events, and may return
// { update(h, now), riffStep(c) }.

const modes = {};

modes.tornado = (x) => {
  const { cards, CEN, at, rand, randUnit, launch, N, smooth: sm } = x;
  const TOR = { cx: CEN.x, cz: CEN.z };
  return {
    start() {
      cards.forEach((c) => {
        c.state = "vor";
        c.v.set(0, 0, 0);
        c.tw = { axis: randUnit(), w: rand(7, 13) };
        c.k = rand(3.0, 4.2);
      });
      cards.forEach((c, j) => at(1.1 + j * 0.011, () => launch(c, x.slots[j], 0.6, { axis: randUnit(), w: rand(3, 7) })));
    },
    update(h, now) {
      const s = sm(now / 0.4) * (1 - sm((now - 1.1) / 0.8));
      for (const c of cards) {
        if (c.state !== "vor") continue;
        const { p, v } = c;
        const px = p.x - TOR.cx;
        const pz = p.z - TOR.cz;
        const r = Math.hypot(px, pz) + 1e-3;
        const y = p.y;
        const rf = 0.9 + 0.5 * y;
        const rc = 1.1 + 0.42 * y;
        const q = r / rc;
        const vt = (12 * 2 * q) / (1 + q * q);
        const gf = clamp(1 - y / 0.8, 0, 1);
        const ur = gf * ((-12 * r) / (r + 1.2)) + (1 - gf) * (-3.5 * (r - rf));
        const uy = 28 * Math.exp(-Math.pow(r / (rf + 0.6), 2)) * clamp((6.4 - y) / 2, 0, 1);
        const ex = px / r;
        const ez = pz / r;
        const k = c.k;
        v.x += k * ((ur * ex - vt * ez) * s - v.x) * h;
        v.z += k * ((ur * ez + vt * ex) * s - v.z) * h;
        v.y += (k * (uy * s - v.y) - G) * h;
        const sp = v.length();
        if (sp > 30) v.multiplyScalar(30 / sp);
        p.addScaledVector(v, h);
        x.floorHit(c, h, 0.3);
        if (p.y > 0.5) {
          const af = sm((p.y - 0.5) / 0.8) * s;
          if (af > 0) {
            x._q.setFromAxisAngle(c.tw.axis, c.tw.w * h * af);
            c.q.premultiply(x._q).normalize();
          }
        } else x.flatten(c, h, 12);
      }
    },
  };
};

modes.casino = (x) => {
  const { cards, N, at, slide, slots, ROW, gatherTo } = x;
  return {
    start() {
      // The pile, bottom first, is the dealing order reversed.
      const g = cards.slice().reverse();
      const end = gatherTo(g, () => ({ id: 0, x: ROW.x, z: ROW.z, yaw: 0 }), 70, 0.011, 0.05, 1);
      const tDeal = Math.max(1.3, end + 0.1);
      for (let j = 0; j < N; j++) at(tDeal + j * 0.014, () => slide(cards[j], slots[j].x, slots[j].z, slots[j].yaw, slots[j].y, 0, 64, 1));
    },
  };
};

modes.well = (x) => {
  const { cards, CEN, at, rand, sgn, randUnit, launch, sim, smooth: sm, reach } = x;
  const WELL = new x.V3(CEN.x, 3.4, CEN.z);
  const GM = 900;
  const EPS = 1.0;
  return {
    start() {
      cards.forEach((c) => {
        c.state = "orb";
        c.v.set(0, 0, 0);
        c.sp0 = rand(0, 6.28);
        c.sw = rand(5, 10) * sgn();
      });
      cards.forEach((c, j) => at(1.2 + j * 0.009, () => launch(c, x.slots[j], 0.5, { axis: randUnit(), w: rand(3, 7) })));
    },
    update(h, now) {
      const ramp = sm(now / 0.3);
      const swirl = 12 * (1 - sm((now - 0.3) / 0.7));
      const gm = GM * ramp;
      const vis = ramp * (1 - sm((now - 1.15) / 0.5));
      sim.light.x = WELL.x * K;
      sim.light.y = WELL.y * K;
      sim.light.z = WELL.z * K;
      sim.light.intensity = vis;
      for (const c of cards) {
        if (c.state !== "orb") continue;
        const { p, v } = c;
        const dx = WELL.x - p.x;
        const dy = WELL.y - p.y;
        const dz = WELL.z - p.z;
        const d2 = dx * dx + dy * dy + dz * dz + EPS;
        const inv = gm / (d2 * Math.sqrt(d2));
        let ax = dx * inv;
        let ay = dy * inv - G;
        let az = dz * inv;
        const hx = p.x - WELL.x;
        const hz = p.z - WELL.z;
        const hr = Math.hypot(hx, hz) + 1e-3;
        const sf = (swirl * Math.min(1, hr / 1.5)) / hr;
        ax += -hz * sf;
        az += hx * sf;
        ax -= v.x * 0.12;
        ay -= v.y * 0.12;
        az -= v.z * 0.12;
        v.x += ax * h;
        v.y += ay * h;
        v.z += az * h;
        const sp = v.length();
        if (sp > 34) v.multiplyScalar(34 / sp);
        p.addScaledVector(v, h);
        x.floorHit(c, h, 0.55);
        if (p.y > 0.9) {
          x._n.set(dx, dy, dz).normalize();
          x._q.setFromUnitVectors(x.AY, x._n);
          x._q2.setFromAxisAngle(x._n, c.sp0 + c.sw * now);
          x._q2.multiply(x._q);
          c.q.slerp(x._q2, 1 - Math.exp(-9 * h));
        } else x.flatten(c, h, 10);
      }
    },
  };
};

modes.rain = (x) => {
  const { cards, slots, CEN, at, rand, randUnit, launch, sim, reach } = x;
  // The wave reaches the farthest card in about 0.45 s, as the demo's does.
  const WAVE = Math.max(14, reach / 0.45);
  const RMAX = reach + 0.5;
  return {
    start() {
      sim.ring.on = true;
      const landOf = [];
      cards.forEach((c, si) => {
        const s = slots[si];
        const r = Math.hypot(c.p.x - CEN.x, c.p.z - CEN.z);
        const tp = 0.05 + r / WAVE + rand(0, 0.05);
        let land = tp + 1.05 + rand(0, 0.3);
        if (si > 0 && slots[si - 1].fan === s.fan) land = Math.max(land, landOf[si - 1] + 0.08);
        landOf[si] = land;
        at(tp, () => launch(c, s, land - tp, { axis: randUnit(), w: rand(5, 13) }));
      });
    },
    update(h, now) {
      const r = WAVE * now;
      sim.ring.on = r < RMAX;
      sim.ring.x = CEN.x * K;
      sim.ring.z = CEN.z * K;
      sim.ring.radius = Math.max(r, 0.01) * K;
      sim.ring.opacity = 0.8 * (1 - clamp(r / RMAX, 0, 1));
    },
  };
};

modes.piles = (x) => {
  const { cards, slots, N, at, slide, from, gatherTo } = x;
  return {
    start() {
      // Four piles on the last four fans' places (dealt last, so clear by then);
      // card j is dealt from pile (j + r) % 4, with r the turn that shortens the trip.
      const fanStart = [];
      slots.forEach((s, j) => {
        if (j === 0 || s.fan !== slots[j - 1].fan) fanStart.push(s);
      });
      const spots = [0, 1, 2, 3].map((k) => {
        const s = fanStart[Math.max(0, fanStart.length - 4 + k) % fanStart.length] ?? { x: 0, z: 0 };
        return { x: s.x, z: s.z, yaw: 0 };
      });
      let bestR = 0;
      let best = Infinity;
      for (let r = 0; r < 4; r++) {
        let cost = 0;
        for (let j = 0; j < N; j++) cost += Math.hypot(from[j].x / K - spots[(j + r) % 4].x, from[j].z / K - spots[(j + r) % 4].z);
        if (cost < best) [best, bestR] = [cost, r];
      }
      const pileIndex = (j) => (j + bestR) % 4;
      const piles = spots.map((s, id) => ({ id, ...s }));
      // The top of each pile is its lowest j: gather from the highest down.
      const g = cards.slice().reverse();
      const end = gatherTo(g, (c) => piles[pileIndex(c.i)], 70, 0.007, 0.05, 1);
      const tDeal = Math.max(1.05, end + 0.1);
      for (let j = 0; j < N; j++) at(tDeal + j * 0.014, () => slide(cards[j], slots[j].x, slots[j].z, slots[j].yaw, slots[j].y, 0, 64, 1));
    },
  };
};

modes.riffle = (x) => {
  const { cards, slots, N, ROW, at, rand, rng, slide, gatherTo, landKick, setOrient, smooth: sm } = x;
  const M = { x: ROW.x, z: ROW.z };
  const LP = { id: 0, x: ROW.x - 1.25, z: ROW.z, yaw: 0.35 };
  const RP = { id: 1, x: ROW.x + 1.25, z: ROW.z, yaw: -0.35 };
  return {
    start() {
      // Merge order: the first card merged (bottom of the stack) is dealt last.
      const lc = Math.ceil(N / 2);
      let [L, R] = [lc, N - lc];
      let side = rng() < 0.5 ? 0 : 1;
      const merged = []; // merged[m] = { card, side }
      while (L || R) {
        const take = 1 + (rng() < 0.3 ? 1 : 0);
        for (let k = 0; k < take; k++) {
          if (!L && !R) break;
          const useL = side === 0 ? L > 0 : R === 0;
          if (useL) L--;
          else R--;
          merged.push({ c: cards[N - 1 - merged.length], left: useL });
        }
        side ^= 1;
      }
      merged.forEach((m, mm) => {
        m.c.side = m.left ? LP : RP;
        m.c.mm = mm;
      });
      // Each half, bottom first, is its merge order reversed (the top merges first).
      const ls = merged.filter((m) => m.left).map((m) => m.c).reverse();
      const rs = merged.filter((m) => !m.left).map((m) => m.c).reverse();
      const g = [];
      for (let n = 0; ls.length || rs.length; n++) {
        const c = n % 2 === 0 ? ls.shift() ?? rs.shift() : rs.shift() ?? ls.shift();
        g.push(c);
      }
      const end = gatherTo(g, (c) => c.side, 70, 0.005, 0.05, 0);
      const t0 = Math.max(0.95, end + 0.05);
      const dt = 0.009;
      merged.forEach((m, mm) => at(t0 + mm * dt, () => riffleStart(m.c, mm)));
      const tDeal = t0 + N * dt + 0.17 + 0.1;
      for (let j = 0; j < N; j++) at(tDeal + j * 0.0075, () => slide(cards[j], slots[j].x, slots[j].z, slots[j].yaw, slots[j].y, 0, 64, 0.5));
    },
    riffStep(c) {
      const u = clamp((x.getNow() - c.t0) / c.Tr, 0, 1);
      const e = sm(u);
      c.p.x = c.rp0.x + (c.mx - c.rp0.x) * e;
      c.p.z = c.rp0.z + (c.mz - c.rp0.z) * e;
      c.p.y = c.rp0.y + (c.y1 - c.rp0.y) * e + 0.8 * Math.sin(Math.PI * u);
      setOrient(c, c.ry0 * (1 - e), Math.PI);
      if (u >= 1) {
        c.p.set(c.mx, c.y1, c.mz);
        c.tgt = { y: c.y1 };
        c.qT = new x.Q().setFromAxisAngle(x.AX, Math.PI);
        setOrient(c, 0, Math.PI);
        landKick(c, 5);
      }
    },
  };
  function riffleStart(c, mm) {
    x.settle(c);
    c.state = "riff";
    c.t0 = x.getNow();
    c.Tr = 0.17;
    c.rp0 = c.p.clone();
    c.ry0 = c.yaw;
    c.y1 = T / 2 + mm * STACK;
    c.mx = M.x + rand(-0.03, 0.03);
    c.mz = M.z + rand(-0.03, 0.03);
  }
};

modes.sprinkler = (x) => {
  const { cards, slots, N, CEN, at, rand, randUnit, launch, gatherTo } = x;
  const ROT = 0.9;
  return {
    start() {
      // The arm sweeps once round; slot j is fired when it points at it (a
      // fan's cards in order, the lower one first so they stack).
      const off = slots.map((s) => ((Math.atan2(s.z - CEN.z, s.x - CEN.x) + Math.PI) / (2 * Math.PI)) * ROT);
      for (let j = 1; j < N; j++) if (slots[j].fan === slots[j - 1].fan) off[j] = Math.max(off[j], off[j - 1] + 0.012);
      const fired = slots.map((s, j) => j).sort((a, b) => off[a] - off[b]);
      // The pile's top is fired first.
      const pile = fired.slice().reverse().map((j) => cards[j]);
      const end = gatherTo(pile, () => ({ id: 0, x: CEN.x, z: CEN.z, yaw: 0 }), 80, 0.005, 0.05, 1);
      const t0 = Math.max(0.78, end + 0.05);
      const tf = off.map((b) => t0 + b);
      cards.forEach((c, j) => at(tf[j], () => launch(c, slots[j], 0.48, { axis: randUnit(), w: rand(2, 6) })));
    },
  };
};
