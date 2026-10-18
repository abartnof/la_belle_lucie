// From cassino web3d/src/reveal.js @ 73f0cd7
// Kit change: without the courts and the figure (COURTS, courtName, courtFor,
// FIGURE, figureHead, figureSides), which are cassino's end of game. What
// scene.js needs stays: the table's edges, the fog and the camera's way back.
//
// The game's end (play-testing: "the camera pulls back, and you see that just
// beyond the camera was the edge of a table, and your opponent was one of
// these cards"). Pure, so tested on paper; scene.js draws it and the page
// times it.

import { PORTRAIT_BELOW } from "./units.js";

// The table as the reveal shows it, in centimetres (units.js): its near edge
// just behind your seat, out of the play's view; its far edge and sides out
// of it too, or so far off that they are lost in the air (FOG), so in play
// the table still has no edge.
export const TABLE_EDGES = Object.freeze({ near: 70, far: -200, half: 150, thickness: 5 });

// The far clipping plane at the reveal: the play's (units.js CAMERA.far,
// 400 cm) would cut the figure off.
export const REVEAL_FAR = 1200;

// How long the camera takes to pull back.
export const REVEAL_MS = 2600;
// In play the table fades into the air, beyond everything on it (the eye
// high over the table is some 115 cm from your opponent's hand); at the
// reveal the air clears, so the figure and the table's far edge are seen.
export const FOG = Object.freeze({ play: Object.freeze([140, 300]), reveal: Object.freeze([520, 1200]) });

// The camera at the end: back past the near edge and up, looking down the
// table to the figure. On a window narrower than PORTRAIT_BELOW (a phone
// held upright, units.js), further back and aimed higher, so the figure
// sits whole in the short band between the score and the controls; and
// aimed to its right, so it stands left of the middle with room beside it
// for its words.
export function revealPose(aspect = 1.6) {
  if (aspect < PORTRAIT_BELOW) return { position: [27, 130, 270], target: [27, 50, -90], fov: 46 };
  return { position: [0, 105, 215], target: [0, 28, -80], fov: 46 };
}

// The camera on its way: `u` from 0 (the play's eye) to 1 (the reveal's).
export function poseAt(from, to, u) {
  const mix = (a, b) => a.map((v, i) => v + (b[i] - v) * u);
  return { position: mix(from.position, to.position), target: mix(from.target, to.target), fov: from.fov + (to.fov - from.fov) * u };
}
