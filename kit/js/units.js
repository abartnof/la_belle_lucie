// From cassino web3d/src/units.js @ 73f0cd7, without ZONES, ZONES_PORTRAIT and ZONES_TOUCH
// (a game's own zones.js). The camera numbers below were measured for cassino's
// zones: they are starting values, and a game with another arrangement passes
// its own `eye` to framing.js (aim, framing, cameraFor).
// Space: units, the table, the camera, the zones -- one source of truth.
//
// Centimetres throughout. y is up and the table top is y = 0; the human sits
// at +z, the opponent at -z, and x runs to the human's right
// (docs/TABLE3D.md section 6).

// A poker-size card, 2.5 x 3.5 in: exactly the 5:7 of the face art.
export const CARD = Object.freeze({
  width: 6.35,
  height: 8.89,
  radius: 0.3175, // 5% of the width, as in the art
  thickness: 0.03,
});

// The implied table: a large pale slab whose edge falls away out of sight.
export const TABLE = Object.freeze({
  width: 140,
  depth: 100,
});

// The eye looks down at the table at PITCH degrees to it (90 would be
// straight down). Play-testing found the cards "too hard to see, esp. in
// mobile mode" from the old eyes, at 42 degrees across the table and 29 on a
// phone, and asked for the camera higher, at 70 or 80: at 70 a card on the
// table is foreshortened by only 6 per cent, against 32 and 52, and the
// table still has some depth. Both hands are turned square to the eye
// (`facingEye`, below), as the play-testing asked.
export const PITCH = 70;
const DEG = Math.PI / 180;
// The eye `distance` from `target`, back toward you and up, at PITCH.
const over = (target, distance) =>
  Object.freeze([target[0], target[1] + distance * Math.sin(PITCH * DEG), target[2] + distance * Math.cos(PITCH * DEG)]);
// The tilt, in degrees, that turns a hand held at `centre` square to the
// eye: how far it leans back from upright (layout.js, kinematics.js fan).
export const facingEye = (eye, centre) => Math.atan2(eye[1] - centre[1], eye[2] - centre[2]) / DEG;

// The human's eyes, high over the table and looking down at a point a
// little beyond its middle, so that your hand, your opponent's beyond the
// middle's last row, and the move bar between the table and your hand all
// fit between the window's top and the prompt (test/eye.test.js). The sixth
// play-testing found "too much white space on the screen (desktop mode)":
// the field is 31 degrees (from 40), the cards a third larger, and the
// room kept for a second row of the table is no longer kept empty (your
// opponent's hand draws back over it when it is needed, ZONES below).
const TARGET = Object.freeze([0, 0, -14]);
export const CAMERA = Object.freeze({
  position: over(TARGET, 102),
  target: TARGET,
  fov: 31, // vertical, degrees
  // Nothing comes nearer the eye than about 45 cm; a near plane at 20 keeps
  // the depth buffer fine enough to tell a card from the one it lies on.
  near: 20,
  far: 400,
  maxPixelRatio: 2,
  // The table's half-width the view must keep, as the tangent of half the
  // horizontal field: the piles' outer edges, with a little to spare
  // (test/eye.test.js), so a squarer window widens the field.
  widthTan: 0.4,
  // What must be in view, as tangents of the eye's axis: up, two fifths of
  // your opponent's hand drawn back over a second row; down (`foot`), your
  // hand's lowest corner. The field widens on a short window to keep them
  // between its top and the controls' strip, and the picture is lifted so
  // that your hand ends just above the strip (framing.js; test/eye.test.js
  // measures both).
  reach: Object.freeze({ up: 0.252, foot: 0.239 }),
});

// The eye across the table on a tablet (ZONES_TOUCH, below): where your
// hand lies in a row, the table's size, near the table (the seventh
// play-testing), and the piles have come in from the far edges, so the
// field closes in on the table: the cards about a tenth larger, as wide a
// view as the table needs (`widthTan`, the piles' outer edges and a sweep
// laid crosswise in them) and as tall (`reach`, your hand's lowest corner
// now near the table), the eye where it was (test/eye.test.js measures
// both).
export const CAMERA_TOUCH = Object.freeze({
  ...CAMERA,
  fov: 24,
  widthTan: 0.34,
  reach: Object.freeze({ up: 0.256, foot: 0.199 }),
});

// The eye for a phone held upright, over the stacked arrangement of
// ZONES_PORTRAIT (cassino's, below; the reach is measured for it). Its field is not fixed: framing.js fits it to the band the
// overlay leaves, from `reach` -- how far the table's cards reach from the
// eye's axis, up, down and to the side, as tangents, over whole parties
// (the staging test measures it, and holds it to the table).
const TARGET_PORTRAIT = Object.freeze([0, 0, -16]);
export const CAMERA_PORTRAIT = Object.freeze({
  position: over(TARGET_PORTRAIT, 90),
  target: TARGET_PORTRAIT,
  reach: Object.freeze({ up: 0.341, down: -0.345, across: 0.312 }),
  // Your hand's own reach across -- with its cards raised, and as it is held
  // in play -- and how much more it reaches for each unit its fan is
  // lengthened (layout.js `fill`): framing.js lengthens it to take whatever
  // width the window has to spare. Measured by the staging test; `perFill`
  // is the steepest rate, so the hand never overruns.
  // Cassino's hand is laid out at one length (no `fill`): its reach is
  // within the table's.
  hand: Object.freeze({ across: 0.2, still: 0.2, perFill: 0.2 }),
});

// Narrower than this, the table is laid out for a phone held upright.
export const PORTRAIT_BELOW = 0.85;
