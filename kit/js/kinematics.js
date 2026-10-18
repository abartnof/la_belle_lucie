// From cassino web3d/src/kinematics.js @ 73f0cd7
// From piquet web3d/src/kinematics.js @ 254cb3c.
// The motion primitives: every path a card takes, as a function of t in [0, 1]
// returning a pose { position, quaternion } (docs/TABLE3D.md section 7.2).
//
// Cards are rigid, thin and light, and almost always moved by a hand, so most
// motion is the smooth start and stop of a guided movement rather than flight.
// Nothing passes through the table: every path here keeps every corner of the
// card at or above it, and the tests hold each one to that.

import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { evenly, flick, friction, minimumJerk, snap } from "./easing.js";
import { CARD } from "./units.js";

const UP = new Vector3(0, 1, 0);
const HALF_PI = Math.PI / 2;

export function pose(position, quaternion = new Quaternion()) {
  return {
    position: position instanceof Vector3 ? position.clone() : new Vector3(...position),
    quaternion: quaternion.clone(),
  };
}

// A card lying flat on the table, its lowest face at `height` (the top of
// whatever it lies on). Face up it reads upright to the human -- its top
// points away from them -- and `yaw` turns it about the vertical.
export function lying({ x = 0, z = 0, height = 0, faceUp = true, yaw = 0 } = {}) {
  const quaternion = new Quaternion().setFromEuler(new Euler(faceUp ? -HALF_PI : HALF_PI, yaw, 0, "YXZ"));
  return { position: new Vector3(x, height + CARD.thickness / 2, z), quaternion };
}

// The eight corners of the card's slab, in a fixed order. The real card's
// corners are rounded inside these, so a test on them is conservative.
const CORNERS = [];
for (const sx of [-1, 1]) {
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      CORNERS.push(new Vector3((sx * CARD.width) / 2, (sy * CARD.height) / 2, (sz * CARD.thickness) / 2));
    }
  }
}

// A pose may carry a `scale`: on a phone the face-down cards are drawn
// smaller and the face-up ones larger (layout.js).
export function cardCorners(p) {
  const k = p.scale ?? 1;
  return CORNERS.map((c) => c.clone().multiplyScalar(k).applyQuaternion(p.quaternion).add(p.position));
}

function rotateAbout(p, pivot, axis, angle) {
  const turn = new Quaternion().setFromAxisAngle(axis, angle);
  return {
    position: p.position.clone().sub(pivot).applyQuaternion(turn).add(pivot),
    quaternion: turn.multiply(p.quaternion),
  };
}

// Of a flat card's four edges, the one lying furthest in `toward` (a
// horizontal direction): its outward direction, and its distance from the
// centre.
function edgeToward(p, toward) {
  const want = new Vector3(toward.x, 0, toward.z).normalize();
  const across = new Vector3(1, 0, 0).applyQuaternion(p.quaternion).setY(0).normalize();
  const along = new Vector3(0, 1, 0).applyQuaternion(p.quaternion).setY(0).normalize();
  const edges = [
    [across, CARD.width / 2],
    [across.clone().negate(), CARD.width / 2],
    [along, CARD.height / 2],
    [along.clone().negate(), CARD.height / 2],
  ];
  const [side, half] = edges.reduce((best, e) => (e[0].dot(want) > best[0].dot(want) ? e : best));
  return { side, half };
}

// Turning about a card's edge as it lies on the table: the hinge line, and the
// axis whose positive turn lifts the rest of the card off the table.
function hingeOf(p, side, half) {
  const pivot = p.position.clone().addScaledVector(side, half);
  pivot.y = p.position.y - CARD.thickness / 2;
  const axis = new Vector3().crossVectors(side.clone().negate(), UP).normalize();
  return { pivot, axis };
}

function quadratic(a, c, b, s) {
  const u = 1 - s;
  return a.clone().multiplyScalar(u * u).addScaledVector(c, 2 * u * s).addScaledVector(b, s * s);
}

function cubic(a, c1, c2, b, s) {
  const u = 1 - s;
  return a
    .clone()
    .multiplyScalar(u * u * u)
    .addScaledVector(c1, 3 * u * u * s)
    .addScaledVector(c2, 3 * u * s * s)
    .addScaledVector(b, s * s * s);
}

// How high a carried card arcs over the chord between its two ends: enough to
// clear whatever lies between, never less than three centimetres.
const clearanceFor = (a, b) => Math.max(3, 0.25 * a.distanceTo(b));

// Hand-guided, from one pose to another, along an arc. Both the travel and the
// turn start with a jerk and ease into place (snap: play-testing asked for
// it of every movement, where piquet's followed minimum jerk), and the turn
// is finished by `turnBy` of the time, so the card arrives already at its
// final attitude and is set down rather than rotated into place.
export function transfer(from, to, { clearance, ease = snap, turnBy = 0.85 } = {}) {
  const a = from.position.clone();
  const b = to.position.clone();
  const h = clearance ?? clearanceFor(a, b);
  const control = a.clone().add(b).multiplyScalar(0.5).addScaledVector(UP, 2 * h); // apex h above the chord
  return (t) => ({
    position: quadratic(a, control, b, ease(t)),
    quaternion: from.quaternion.clone().slerp(to.quaternion, ease(Math.min(1, t / turnBy))),
  });
}

// From the hand to the table: a transfer that leaves up and out of the hand
// and finishes with a vertical drop, so the card meets the table
// face-parallel. Paper does not bounce.
export function layDown(from, to, { clearance, ease = minimumJerk, turnBy = 0.85 } = {}) {
  const a = from.position.clone();
  const b = to.position.clone();
  const h = clearance ?? clearanceFor(a, b);
  const outward = b.clone().sub(a).setY(0).multiplyScalar(0.35);
  const c1 = a.clone().add(outward).addScaledVector(UP, 0.6 * h);
  const c2 = b.clone().addScaledVector(UP, h);
  return (t) => ({
    position: cubic(a, c1, c2, b, ease(t)),
    quaternion: from.quaternion.clone().slerp(to.quaternion, ease(Math.min(1, t / turnBy))),
  });
}

// A card played from a held hand. The user, watching the first build: "there's
// sort of a sharp tug pulling the card from the deck, and then it's placed on
// the table". So two beats: the fingers snap it out along its own length,
// clear of its neighbours and still at the hand's angle -- fast from the
// first instant, slowing as it comes free -- and then it is tossed onto its
// spot (toss). The toss begins a little before the tug has finished, so the
// card never stops dead between the two.
//
// Cassino's change: `clearance` is handed on to the toss, for a table whose
// middle lies further from the hand than piquet's trick did.
export function pull(from, to, { tug = 0.6 * CARD.height, tugShare = 0.3, overlap = 0.1, clearance } = {}) {
  const out = new Vector3(0, 1, 0).applyQuaternion(from.quaternion).multiplyScalar(tug);
  const clear = { position: from.position.clone().add(out), quaternion: from.quaternion.clone() };
  const carry = toss(clear, to, { clearance });
  const carryFrom = tugShare - overlap;
  const snap = (u) => 1 - (1 - u) ** 3; // at full speed at once, easing as it comes clear
  return (t) => {
    const a = snap(Math.min(1, Math.max(0, t / tugShare)));
    const c = carry(Math.min(1, Math.max(0, (t - carryFrom) / (1 - carryFrom))));
    return {
      position: from.position.clone().addScaledVector(out, a).add(c.position).sub(clear.position),
      quaternion: c.quaternion,
    };
  };
}

// A card tossed onto the table. The user: "moving cards should start with
// strong jerks, then end with gravity-like acceleration. that means a lot of
// motion-easing." So it is thrown, not guided: it leaves at full speed,
// rises and falls on a parabola -- a cartoon's gravity, strong enough that
// the arc is only `clearance` high -- turning on the way, lands with the
// speed of its fall, and slides the last little way to a dead stop against
// friction, its speed along the table unbroken at the touch.
//
// It touches down on its leading edge, tilted by `settle` (play-testing
// asked for the peel of a card meeting the table), and as it slides its
// trailing edge falls flat under gravity, faster and faster, hinged on the
// leading edge, which stays on the table.
//
// The arc is solved exactly: with the top `clearance` above the higher end,
// in the flight's own time the fall is g = 2(√a + √b)² and the launch
// 2√a(√a + √b), a and b the drops from the top to each end.
export function toss(from, to, { clearance, flight = 0.86, turnBy = 0.8, settle = (10 * Math.PI) / 180 } = {}) {
  const a = from.position.clone();
  const b = to.position.clone();
  // A card that turns over on the way needs the room to turn in.
  const over = new Vector3(0, 0, 1).applyQuaternion(from.quaternion).dot(new Vector3(0, 0, 1).applyQuaternion(to.quaternion)) < 0;
  // Where the slide begins, short of its spot by as far as it then slides:
  // a slide under friction starts at twice its mean speed, so matching the
  // flight's speed along the table fixes the distance.
  const along = new Vector3(b.x - a.x, 0, b.z - a.z);
  const reach = along.length();
  const slid = (reach * (1 - flight)) / (1 + flight);
  if (reach > 0) along.divideScalar(reach);
  // The card on the table, `s` of the way along its slide, tilted `angle`
  // about its leading edge (none for a card dropped straight down).
  const tilt = reach > 1e-6 ? settle : 0;
  const { side, half } = tilt ? edgeToward(to, along) : { side: along, half: 0 };
  const landed = (s, angle) => {
    const flat = { position: b.clone().addScaledVector(along, -slid * (1 - s)), quaternion: to.quaternion.clone() };
    if (!angle) return flat;
    const { pivot, axis } = hingeOf(flat, side, half);
    return rotateAbout(flat, pivot, axis, angle);
  };
  const touch = landed(0, tilt);
  const c = touch.position;
  const h = Math.max(clearance ?? clearanceFor(a, b), over ? 0.6 * CARD.height : 0);
  const top = Math.max(a.y, c.y) + h;
  const [up, down] = [Math.sqrt(top - a.y), Math.sqrt(top - c.y)];
  const g = 2 * (up + down) ** 2;
  const launch = 2 * up * (up + down);
  // The flight carries the jerk; the turn eases in once the card is on its
  // way and out before it lands, so no edge swings into the table.
  const turn = (u) => minimumJerk((u - 0.05) / (turnBy - 0.05));
  return (t) => {
    if (t < flight) {
      const u = t / flight;
      const position = new Vector3(a.x + (c.x - a.x) * u, a.y + launch * u - (g * u * u) / 2, a.z + (c.z - a.z) * u);
      return { position, quaternion: from.quaternion.clone().slerp(touch.quaternion, turn(u)) };
    }
    const u = Math.min(1, (t - flight) / (1 - flight));
    return landed(friction(u), tilt * (1 - u * u));
  };
}

// A card taken up into a hand: flicked up at full speed and slowing under
// gravity to rest in the grip, as anything thrown upward slows at the top of
// its rise -- the toss's own curve, with the hand at the top of the arc.
//
// Cassino's change: `clearance` adds a hop over the way, for a hand held low
// (a phone's upright table), where a card turning up from the table would
// otherwise dip a corner through it (the table review's T12). And a hand
// lying lower than the card starts (a row just off the table on a phone or
// a tablet, below a tall stock: the seventh play-testing) is come down to
// on the same curve, the hop carrying it over the way.
export function rise(from, to, { clearance = 0 } = {}) {
  const a = from.position.clone();
  const b = to.position.clone();
  const lift = b.y - a.y;
  // It turns once it is clear of the table, not before.
  const turn = (u) => minimumJerk((u - 0.15) / 0.7);
  return (t) => {
    const u = Math.min(1, Math.max(0, t));
    const across = friction(u); // along the table too: fast away, easing in
    const hop = 4 * clearance * u * (1 - u);
    const position = new Vector3(a.x + (b.x - a.x) * across, a.y + lift * (2 * u - u * u) + hop, a.z + (b.z - a.z) * across);
    return { position, quaternion: from.quaternion.clone().slerp(to.quaternion, turn(u)) };
  };
}

// A held card bobbed up out of its hand along its own length and back --
// what a player's hand does as they call a holding (the user: "the cards
// should rise from the deck a bit"). Flicked up, held a moment, and let
// fall back into place, faster and faster.
export function bob(held, lift, { riseShare = 0.28, holdShare = 0.4 } = {}) {
  const up = new Vector3(0, 1, 0).applyQuaternion(held.quaternion);
  const height = (t) => {
    if (t < riseShare) return 1 - (1 - t / riseShare) ** 3;
    if (t < riseShare + holdShare) return 1;
    const u = (t - riseShare - holdShare) / (1 - riseShare - holdShare);
    return 1 - Math.min(1, u) ** 2;
  };
  return (t) => ({
    position: held.position.clone().addScaledVector(up, lift * height(Math.min(1, Math.max(0, t)))),
    quaternion: held.quaternion.clone(),
  });
}

// Off the table, peeled: the near edge lifted first, hinged on the far one,
// the way a fingertip gets under a card, in `share` of the time; then
// `then(lifted)` takes it on its way. `toward` points from the card to
// whoever is taking it.
export function peelOff(from, then, { toward, lift = (16 * Math.PI) / 180, share = 0.18 } = {}) {
  const { side, half } = edgeToward(from, toward.clone().negate()); // the far edge
  const { pivot, axis } = hingeOf(from, side, half);
  const rest = then(rotateAbout(from, pivot, axis, lift));
  return (t) => (t < share ? rotateAbout(from, pivot, axis, lift * snap(t / share)) : rest((t - share) / (1 - share)));
}

// From the table to a hand: peeled off, then carried up into the grip.
export function pickUp(from, to, { toward, lift = (20 * Math.PI) / 180, liftShare = 0.25 } = {}) {
  return peelOff(from, (lifted) => rise(lifted, to), { toward, lift, share: liftShare });
}

// Turning a card over on the table (the user: "one side must be constrained by
// the table"). It turns about its edge lying furthest in `toward` and ends one
// width over, the other side up. A flip is a pile of one; see flipPile.
export function flip(from, options = {}) {
  return flipPile([from], options)[0];
}

// A squared pile turned over on the table as one rigid block, about its
// bottom card's edge lying furthest in `toward`.
//
// A block rolls over its own thickness: it pivots on one bottom corner of the
// edge until it stands upright, then on the other as it falls, so it never
// sinks into the table and lands exactly at its height, its order reversed.
// Rising, a finger's push dies away and it slows, evenly, to `crest` times its
// mean rising speed as it passes upright -- slowest there, but never stopped,
// or it would hang; falling, gravity speeds it evenly from that same speed, so
// there is no jolt at the top. The fall takes `1 - riseShare` of the time.
export function flipPile(poses, { toward, riseShare = 1 / 1.6, crest = 0.3 } = {}) {
  const bottom = poses.reduce((low, p) => (p.position.y < low.position.y ? p : low));
  const { side, half } = edgeToward(bottom, toward);
  const { pivot, axis } = hingeOf(bottom, side, half);
  const top = Math.max(...poses.map((p) => p.position.y)) + CARD.thickness / 2;
  const secondPivot = pivot.clone().addScaledVector(side, top - pivot.y);
  const rise = evenly(2 - crest);
  const fall = evenly((crest * (1 - riseShare)) / riseShare); // the same angular speed at the crest
  return poses.map((from) => {
    const upright = rotateAbout(from, pivot, axis, HALF_PI);
    return (t) => {
      if (t < riseShare) return rotateAbout(from, pivot, axis, HALF_PI * rise(t / riseShare));
      return rotateAbout(upright, secondPivot, axis, HALF_PI * fall((t - riseShare) / (1 - riseShare)));
    };
  });
}

// Slid across the table by a finger: flicked off at speed, and gliding to a
// dead stop (`flick`; piquet's slowed evenly under friction). It rides `lift` above the table at the middle of its way and
// settles onto its place, so it passes over whatever it crosses rather than
// through it -- two cards at one height fight over which is drawn, and the
// ink and the shading break up (the user: "one card should always be on top").
export function slide(from, to, { ease = flick, lift = 0 } = {}) {
  return (t) => {
    const s = ease(t);
    const u = Math.min(1, Math.max(0, t));
    return {
      position: from.position.clone().lerp(to.position, s).addScaledVector(UP, 4 * lift * u * (1 - u)),
      quaternion: from.quaternion.clone().slerp(to.quaternion, s),
    };
  };
}

// A hand held up and fanned toward `facing` (its holder's eye, or a point in
// front of them): the cards turn about a pivot `radius` below the hand's
// centre, `spread` apart -- or at the given `angles` -- each `step` in front
// of the one before so every corner index shows; the whole hand leans back by
// `tilt`.
export function fan({
  count,
  angles,
  centre,
  facing,
  radius = 16,
  spread = (6.2 * Math.PI) / 180,
  tilt = (14 * Math.PI) / 180,
  step = 0.06,
}) {
  const turns = angles ?? Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * spread);
  const forward = facing.clone().sub(centre).normalize();
  const right = new Vector3().crossVectors(UP, forward).normalize();
  const up = new Vector3().crossVectors(forward, right);
  const frame = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, forward));
  frame.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -tilt));
  const poses = [];
  for (let i = 0; i < turns.length; i++) {
    const theta = turns[i];
    const local = new Vector3(radius * Math.sin(theta), radius * Math.cos(theta) - radius, i * step);
    poses.push({
      position: local.applyQuaternion(frame).add(centre),
      quaternion: frame.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -theta)),
    });
  }
  return poses;
}

// A hand laid out in a row (the seventh play-testing: "On mobile and ipad,
// don't bother fanning the cards in the player's hand, just space them
// wide"): side by side, `gap` apart, all turned alike, facing `facing` and
// leaning back by `tilt`, as `fan` turns its cards.
export function row({ count, centre, facing, gap = 1.2, tilt = 0 }) {
  const forward = facing.clone().sub(centre).normalize();
  const right = new Vector3().crossVectors(UP, forward).normalize();
  const up = new Vector3().crossVectors(forward, right);
  const frame = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, up, forward));
  frame.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -tilt));
  const pitch = CARD.width + gap;
  return Array.from({ length: count }, (_, i) => ({
    position: new Vector3((i - (count - 1) / 2) * pitch, 0, 0).applyQuaternion(frame).add(centre),
    quaternion: frame.clone(),
  }));
}

// A pose held: the path of a card that waits its turn.
export function still(p) {
  return () => ({ position: p.position.clone(), quaternion: p.quaternion.clone() });
}

// Paths one after another: chain([path, weight], ...), each running for its
// weight's share of the time.
export function chain(...parts) {
  const total = parts.reduce((sum, [, w]) => sum + w, 0);
  return (t) => {
    let start = 0;
    for (let i = 0; i < parts.length; i++) {
      const [path, w] = parts[i];
      const end = start + w / total;
      if (t <= end || i === parts.length - 1) return path(Math.min(1, Math.max(0, (t - start) / (end - start))));
      start = end;
    }
    return parts[parts.length - 1][0](1);
  };
}

// Where a card must lie, the other side up, for flip(_, { toward }) to land
// it exactly on `target`: one extent plus a thickness back from it, turned
// half over about the hinge's direction. (A half turn is its own inverse.)
export function beforeFlip(target, toward) {
  const { side, half } = edgeToward(target, toward.clone().negate());
  const outward = side.clone().negate(); // the direction the flip will travel
  const axis = new Vector3().crossVectors(outward.clone().negate(), UP).normalize();
  const turn = new Quaternion().setFromAxisAngle(axis, Math.PI);
  return {
    position: target.position.clone().addScaledVector(outward, -(2 * half + CARD.thickness)),
    quaternion: turn.multiply(target.quaternion.clone()),
  };
}

// Cassino's own (not in piquet): a squared heap of cards carried as one rigid
// block and set down on `tos` -- a capture gathered and turned over into its
// taker's pile. The block flies as the bottom card is tossed (toss), turning
// over on the way, every other card held to it where it lay; over the whole
// flight each card eases onto its own place, so the block lands on the pile
// exactly, small turns and all. A block turned over lands with its order
// reversed, so `tos` should be too.
//
// With `peel` (the direction toward whoever takes it), the block is first
// peeled up off the table, hinged on its bottom card's far edge.
export function carryBlock(froms, tos, { peel, ...options } = {}) {
  if (peel) {
    const lift = (14 * Math.PI) / 180;
    const share = 0.16;
    const { side, half } = edgeToward(froms[0], peel.clone().negate());
    const { pivot, axis } = hingeOf(froms[0], side, half);
    const carried = carryBlock(
      froms.map((p) => rotateAbout(p, pivot, axis, lift)),
      tos,
      options,
    );
    return froms.map((from, i) => (t) => (t < share ? rotateAbout(from, pivot, axis, lift * snap(t / share)) : carried[i]((t - share) / (1 - share))));
  }
  const base = froms[0];
  const lead = toss(base, tos[0], options);
  const inverse = base.quaternion.clone().invert();
  return froms.map((from, i) => {
    const offset = from.position.clone().sub(base.position).applyQuaternion(inverse); // in the bottom card's frame
    const turn = inverse.clone().multiply(from.quaternion); // its attitude relative to the bottom card
    const rigid = {
      position: tos[0].position.clone().add(offset.clone().applyQuaternion(tos[0].quaternion)),
      quaternion: tos[0].quaternion.clone().multiply(turn),
    };
    const shift = tos[i].position.clone().sub(rigid.position);
    const settle = rigid.quaternion.clone().invert().multiply(tos[i].quaternion);
    return (t) => {
      const p = lead(t);
      const s = minimumJerk(Math.min(1, Math.max(0, t)));
      return {
        position: p.position.clone().add(offset.clone().applyQuaternion(p.quaternion)).addScaledVector(shift, s),
        quaternion: p.quaternion.clone().multiply(turn).multiply(new Quaternion().slerp(settle, s)),
      };
    };
  });
}
