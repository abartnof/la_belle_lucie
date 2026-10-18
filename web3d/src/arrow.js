// The hint arrow's geometry and timing (pure: no three.js, so Node tests it).
//
// An arrowhead glides along a gently bowed path from the card to move to the
// place it goes, with a tail behind it. Everything is in the table's plane
// (x, z in cm); table.js lifts it above the cards and draws it.

import { SUITS } from "./layout.js";

// Where a hint's arrow runs: { from, to } as { x, z } points, or null (a redeal
// and anything unknown have none). The source is the hint's card (for a draw,
// the buried one); the target is the card it goes onto, else the empty fan's
// slot (a king), else the foundation of the card's suit.
export function arrowEnds(lay, hint) {
  const m = /^(?:draw f\d+:\d+|f\d+)>(h|f(\d+))$/.exec(hint?.move ?? "");
  const src = lay?.poses?.[hint?.card];
  if (!m || !src) return null;
  let to = null;
  if (m[1] === "h") {
    const h = lay.home[SUITS.indexOf(hint.card[1])];
    if (h) to = { x: h.cx, z: h.cz };
  } else if (hint.onto && lay.poses[hint.onto]) {
    to = { x: lay.poses[hint.onto].x, z: lay.poses[hint.onto].z };
  } else {
    const s = lay.slots[Number(m[2])];
    if (s) to = { x: s.cx, z: s.cz };
  }
  if (!to) return null;
  const from = { x: src.x, z: src.z };
  return Math.hypot(to.x - from.x, to.z - from.z) < 0.5 ? null : { from, to };
}

const BOW = 0.14; // of the length

// The point (and unit direction) at t along the quadratic bow from a to b. The
// bow leans towards the far side of the screen (-z) so the path reads as a hop.
export function curveAt(a, b, t) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  let nx = -dz / len;
  let nz = dx / len;
  if (nz > 0 || (Math.abs(nz) < 1e-9 && nx < 0)) [nx, nz] = [-nx, -nz];
  const c = { x: (a.x + b.x) / 2 + nx * BOW * len * 2, z: (a.z + b.z) / 2 + nz * BOW * len * 2 };
  const u = 1 - t;
  const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
  const z = u * u * a.z + 2 * u * t * c.z + t * t * b.z;
  const tx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x);
  const tz = 2 * u * (c.z - a.z) + 2 * t * (b.z - c.z);
  const tl = Math.hypot(tx, tz) || 1;
  return { x, z, dx: tx / tl, dz: tz / tl };
}

// One loop: fade in and glide (ease out), rest at the target, fade, a beat clear.
export const CYCLE_MS = 2200;
const FADE_IN = 150;
const TRAVEL = 1100;
const HOLD_END = 1500;
const FADE_END = 1900;
export function phase(ms) {
  const m = ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const k = Math.min(1, m / TRAVEL);
  const t = m >= TRAVEL ? 1 : 1 - (1 - k) ** 3;
  let alpha = 1;
  if (m < FADE_IN) alpha = m / FADE_IN;
  else if (m > HOLD_END) alpha = Math.max(0, 1 - (m - HOLD_END) / (FADE_END - HOLD_END));
  return { t, alpha };
}

// The arrow as triangles ([x, z] vertices, three to a triangle) with its head's
// tip at t along the path and a tail `tail` of the path long behind it. `inflate`
// (cm) grows it all round, for the halo.
export function arrowShape(ends, t, { tail = 0.4, inflate = 0, scale = 1, steps = 14 } = {}) {
  const { from, to } = ends;
  const headLen = 3.4 * scale + inflate * 1.6;
  const headHalf = 2.5 * scale + inflate;
  const shaft = 0.8 * scale + inflate;
  const tipAt = curveAt(from, to, t);
  const tip = { x: tipAt.x + tipAt.dx * inflate * 0.9, z: tipAt.z + tipAt.dz * inflate * 0.9 };
  const tri = [];
  // The chevron: tip, two wings, and a notch behind the tip.
  const back = (d) => ({ x: tip.x - tipAt.dx * d, z: tip.z - tipAt.dz * d });
  const side = (p, w) => ({ x: p.x - tipAt.dz * w, z: p.z + tipAt.dx * w });
  const wingBase = back(headLen);
  const wl = side(wingBase, headHalf);
  const wr = side(wingBase, -headHalf);
  const notch = back(headLen * 0.5);
  const v = (p) => [p.x, p.z];
  tri.push(v(tip), v(wl), v(notch), v(tip), v(notch), v(wr));
  // The tail: a ribbon along the path up to the notch.
  const t0 = Math.max(0, t - tail);
  const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  const t1 = Math.max(t0, t - (headLen * 0.5) / len);
  if (t1 - t0 > 1e-3) {
    let prev = null;
    for (let i = 0; i <= steps; i++) {
      const c = curveAt(from, to, t0 + ((t1 - t0) * i) / steps);
      const cur = { l: side(c, shaft), r: side(c, -shaft) };
      if (prev) tri.push(v(prev.l), v(prev.r), v(cur.l), v(prev.r), v(cur.r), v(cur.l));
      prev = cur;
    }
  }
  return { tip, dir: { x: tipAt.dx, z: tipAt.dz }, triangles: tri };
}
