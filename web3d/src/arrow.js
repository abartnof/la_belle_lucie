// The hint arrow's geometry and timing (pure: no three.js, so Node tests it).
//
// An arrowhead glides along a gently bowed path from the card to move to the
// place it goes, with a tail behind it. Everything is in the table's plane
// (x, z in cm); table.js lifts it above the cards and draws it.

import { M3, M3_MS } from "../../kit/js/easing.js";
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

// How big the arrow is for a path this long (cm): whole on a long run, smaller on
// a short hop to the next pile, where a full-size head would be most of the path.
export function sizeFor(len) {
  return Math.min(1, Math.max(0.5, len / 24));
}

// The height (cm) the arrow reaches at the top of a hop of this length: a short
// hop is a low one, and the climb stays gentle along the arrow's own length.
export function hopPeak(len, base = 0.9, top = 5.2) {
  return Math.min(top, base + 0.12 * len);
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

// One loop, in Material 3's motion tokens (kit/js/easing.js): the arrow grows
// in (emphasized decelerate, short4) while it travels (emphasized decelerate,
// extra-long2), rests at the target, then shrinks away (emphasized accelerate,
// medium1), and a beat is clear. `alpha` is how grown it is, 0 to 1: the arrow is
// solid and casts a shadow, so it scales in and out instead of fading.
export const CYCLE_MS = 2200;
const GROW = M3_MS.short4;
const TRAVEL = M3_MS.extraLong2;
const HOLD_END = 1500;
const SHRINK = M3_MS.medium1;
export function phase(ms) {
  const m = ((ms % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const t = M3.emphasizedDecelerate(m / TRAVEL);
  let alpha = 1;
  if (m < GROW) alpha = M3.emphasizedDecelerate(m / GROW);
  else if (m > HOLD_END) alpha = 1 - M3.emphasizedAccelerate(Math.min(1, (m - HOLD_END) / SHRINK));
  return { t, alpha };
}

// The arrow as one closed outline ([x, z] points, a single polygon: the shaft
// and the head are one piece, so nothing can gap between them). The head's tip
// is at t along the path; behind it a shaft of even width, `tail` of the path long. `scale` shrinks it all about its tip.
export function arrowOutline(ends, t, { tail = 0.4, scale = 1, steps = 14 } = {}) {
  const { from, to } = ends;
  const headLen = 3.6 * scale;
  const headHalf = 2.6 * scale;
  const shaft = 0.85 * scale;
  const len = Math.hypot(to.x - from.x, to.z - from.z) || 1;
  const tipAt = curveAt(from, to, t);
  const tip = { x: tipAt.x, z: tipAt.z };
  const side = (p, nx, nz, w) => [p.x + nx * w, p.z + nz * w];
  // The head's base is on the path, a head's length behind the tip.
  const t1 = Math.max(0, t - headLen / len);
  const base = curveAt(from, to, t1);
  const t0 = Math.max(0, t - tail);
  const left = [];
  const right = [];
  const along = []; // each shaft point's place on the path, for its height
  if (t1 - t0 > 1e-3) {
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const c = curveAt(from, to, t0 + (t1 - t0) * u);
      left.push(side(c, -c.dz, c.dx, shaft));
      right.push(side(c, -c.dz, c.dx, -shaft));
      along.push(t0 + (t1 - t0) * u);
    }
  } else {
    along.push(t1);
    left.push(side(base, -base.dz, base.dx, shaft));
    right.push(side(base, -base.dz, base.dx, -shaft));
  }
  const wingL = side(base, -tipAt.dz, tipAt.dx, headHalf);
  const wingR = side(base, -tipAt.dz, tipAt.dx, -headHalf);
  const outline = [...left, wingL, [tip.x, tip.z], wingR, ...right.reverse()];
  // `params`: where on the path (0 to 1) each outline point lies, so the arrow can
  // lie along the flight's arc, its tip lower than its tail as it comes down.
  const params = [...along, t1, t, t1, ...[...along].reverse()];
  return { tip, dir: { x: tipAt.dx, z: tipAt.dz }, outline, params };
}
