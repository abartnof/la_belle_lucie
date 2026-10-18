// Where every card lies (pure: no three.js, so the tests run it in Node).
//
// Centimetres, y up, the table top at y = 0, the human at +z, x to their right
// (kit/js/units.js). A card face up reads upright with its top toward -z.
//
//   landscape  a foundation row (S H D C) over a grid of fan slots, 6 a row
//   portrait   the same, 4 a row (aspect below PORTRAIT_BELOW)
//
// A fan is a cascade to the right: the first (bottom) card at the slot's left,
// each next one `step` further right, so the left strip of every card, where
// its corner index is, stays in view and the top card (rightmost) is whole.
// The step shrinks for a long run so the cascade never leaves its slot.

export const CARD = Object.freeze({ width: 6.35, height: 8.89 });
export const PORTRAIT_BELOW = 0.85;
export const SUITS = ["S", "H", "D", "C"];
const RANKS = "A23456789TJQK";
const SUIT_NAMES = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };
const RANK_NAMES = {
  A: "ace", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight",
  9: "nine", T: "ten", J: "jack", Q: "queen", K: "king",
};

export const cardName = (code) => `${RANK_NAMES[code[0]]} of ${SUIT_NAMES[code[1]]}`;
export const rankOf = (code) => RANKS.indexOf(code[0]);
export const suitOf = (code) => SUITS.indexOf(code[1]);

// How far above the one beneath each card in a pile lies (cm): enough that the
// ink line and the shadows tell them apart, little enough to look flat.
export const RISE = 0.05;
// How high a card in motion or chosen rides (cm); the view keeps it in.
export const LIFT = 3;

const STEP = 0.42; // of a card's width: the strip a corner index needs
const GAP_X = 0.24; // of a card's width, between two slots (a phone's: less)
const GAP_X_PORTRAIT = 0.14;
const GAP_Z = 0.16; // of a card's height, between two rows (at least)
const HOME_GAP = 0.3; // of a card's height, extra, between the foundations and the fans

export function columnsFor(aspect) {
  return aspect < PORTRAIT_BELOW ? 4 : 6;
}

// What the camera must keep in view, as fractions of the window's height /
// width (the overlay's strips; main.js passes what the ui leaves).
export const MARGINS = Object.freeze({ top: 0.07, bottom: 0.05, side: 0.02 });

// The poses and slots for a state's fans and the foundations, for a window of
// this aspect (width / height).
export function layout(state, aspect, { margins = MARGINS } = {}) {
  const fans = state.fans ?? [];
  const cols = columnsFor(aspect);
  const rows = Math.max(1, Math.ceil(fans.length / cols));
  const { width: W, height: H } = CARD;
  const inner = W + 2 * STEP * W; // a slot: a fan of three
  const gapX = (cols === 4 ? GAP_X_PORTRAIT : GAP_X) * W;
  const pitchX = inner + gapX;
  const contentW = cols * pitchX - gapX;
  // Spread the rows to the window's shape, within reason.
  const wantH = (contentW / aspect) * (1 - margins.top - margins.bottom) * 0.9;
  const pitchZ = Math.max(H * (1 + GAP_Z), Math.min(H * 1.8, (wantH - HOME_GAP * H) / (rows + 1)));
  const x0 = -contentW / 2;
  const z0 = -(HOME_GAP * H + rows * pitchZ) / 2; // centre of the foundation row
  const homeZ = z0;
  const fanZ = (row) => z0 + HOME_GAP * H + (row + 1) * pitchZ;

  const poses = {};
  const slots = fans.map((cards, fan) => {
    const row = Math.floor(fan / cols);
    const col = fan % cols;
    const left = x0 + col * pitchX;
    const n = cards.length;
    const step = n > 1 ? Math.min(STEP * W, (inner - W) / (n - 1)) : 0;
    cards.forEach((code, i) => {
      poses[code] = { x: left + W / 2 + i * step, z: fanZ(row), y: i * RISE, faceUp: true, yaw: 0, fan, home: false, index: i };
    });
    return { fan, x0: left, x1: left + pitchX - gapX / 2, cx: left + W / 2, cz: fanZ(row), step, count: n, width: W, height: H, row, col, inner };
  });

  // The foundations, centred over the grid.
  const homeCols = SUITS.length;
  const first = (cols - homeCols) / 2;
  const home = SUITS.map((suit, s) => {
    const left = x0 + (first + s) * pitchX;
    const count = state.home?.[s] ?? 0;
    for (let r = 0; r < count; r++) {
      const code = RANKS[r] + suit;
      poses[code] = { x: left + W / 2, z: homeZ, y: r * RISE, faceUp: true, yaw: 0, fan: null, home: true, index: r };
    }
    return { suit, x0: left, x1: left + W, cx: left + W / 2, cz: homeZ, width: W, height: H, count };
  });

  const points = [];
  const addRect = (x0_, x1_, cz) => {
    for (const x of [x0_, x1_]) for (const z of [cz - H / 2, cz + H / 2]) for (const y of [0, LIFT]) points.push([x, y, z]);
  };
  for (const s of slots) addRect(s.x0, s.x0 + s.inner, s.cz);
  for (const h of home) addRect(h.x0, h.x1, h.cz);
  // The lifted card in hand (see table.js) rises a little: keep it in view too.
  const camera = fitCamera(points, aspect, margins);

  return { portrait: cols === 4, cols, rows, poses, slots, home, camera, pitchX, pitchZ, points };
}

// Which slot rectangle (in the table's plane) holds this point: a fan's, or a
// foundation's. Fan slots take the whole cell, the gap to the next included.
export function hitSlot(lay, x, z) {
  const H = CARD.height;
  for (const s of lay.slots) {
    if (x >= s.x0 - 0.0 && x < s.x1 && Math.abs(z - s.cz) <= H / 2 + (lay.pitchZ - H) / 2) return { fan: s.fan, home: false };
  }
  for (const h of lay.home) {
    if (x >= h.x0 && x <= h.x1 && Math.abs(z - h.cz) <= H / 2 + 0.6) return { fan: null, home: true, suit: h.suit };
  }
  return null;
}

// ---- the camera --------------------------------------------------------------

// Where a point lands in the window (-1..1 each way) from this camera
// ({ eye, at, fov }), for a window of this aspect.
export function project(camera, aspect, p) {
  const { f, r, u } = basis(camera);
  const v = [p[0] - camera.eye[0], p[1] - camera.eye[1], p[2] - camera.eye[2]];
  const zc = dot(v, f);
  const t = Math.tan((camera.fov * Math.PI) / 360);
  return [dot(v, r) / (zc * t * aspect), dot(v, u) / (zc * t), zc];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((x) => x / l);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function basis({ eye, at }) {
  const f = norm([at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]]);
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  return { f, r, u };
}

// The eye that looks down on `points` at this pitch and takes them whole
// between the margins: as near as the margins allow, the aim moved until the
// points are centred in what the margins leave.
export function fitCamera(points, aspect, margins = MARGINS, { pitch = 80, maxDistance = 150 } = {}) {
  const pr = (pitch * Math.PI) / 180;
  const dir = [0, Math.sin(pr), Math.cos(pr)];
  const winLo = -1 + 2 * margins.bottom;
  const winHi = 1 - 2 * margins.top;
  const winX = 1 - 2 * margins.side;
  const centre = (winLo + winHi) / 2;
  const put = (d, fov, tx, tz) => ({ eye: [tx + d * dir[0], d * dir[1], tz + d * dir[2]], at: [tx, 0, tz], fov });
  function at(d, fov) {
    let tx = 0;
    let tz = 0;
    for (let k = 0; k < 12; k++) {
      const cam = put(d, fov, tx, tz);
      let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
      let zc = 0;
      for (const p of points) {
        const [x, y, z] = project(cam, aspect, p);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        zc = z;
      }
      const t = Math.tan((fov * Math.PI) / 360);
      tx += ((minX + maxX) / 2) * zc * t * aspect;
      tz -= (((minY + maxY) / 2 - centre) * zc * t) / Math.sin(pr);
      if (k === 11) return { cam: put(d, fov, tx, tz), fits: maxX - minX <= 2 * winX && maxY - minY <= winHi - winLo, spanX: maxX - minX, spanY: maxY - minY };
    }
    return null;
  }
  let best = null;
  for (const fov of [26, 34, 42, 50]) {
    let lo = 20;
    let hi = 900;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid, fov).fits) hi = mid;
      else lo = mid;
    }
    best = { ...at(hi, fov).cam, distance: hi };
    if (hi <= maxDistance) break;
  }
  return best;
}
