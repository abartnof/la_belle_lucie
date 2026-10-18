// Classic card faces and a card back, drawn on a canvas (the kit has no vector
// art for a pack: its jumbo faces are all it draws). Corner indices top left
// and, turned about, bottom right; the number cards carry their pips in the
// usual places, the aces one large pip, the court cards a framed letter. The
// pips are paths, so no symbol font decides how a suit looks.
//
// Not owned by anyone else: the table agent's, with table.js.

import { CanvasTexture } from "three";
import { JUMBO, rankAndSuit } from "../../kit/js/faces.js";
import { cardTexture } from "../../kit/js/materials.js";

const RANK_FONT = "Georgia, 'Times New Roman', serif";
const COLOUR = { S: JUMBO.ink, C: JUMBO.ink, H: JUMBO.red, D: JUMBO.red };

// A suit's pip centred on (0, 0) in a box `s` wide, as a path on `g`.
function pipPath(g, suit, s) {
  const r = s / 2;
  g.beginPath();
  if (suit === "D") {
    g.moveTo(0, -r);
    g.quadraticCurveTo(r * 0.25, -r * 0.35, r * 0.72, 0);
    g.quadraticCurveTo(r * 0.25, r * 0.35, 0, r);
    g.quadraticCurveTo(-r * 0.25, r * 0.35, -r * 0.72, 0);
    g.quadraticCurveTo(-r * 0.25, -r * 0.35, 0, -r);
  } else if (suit === "H") {
    g.moveTo(0, r * 0.95);
    g.bezierCurveTo(-r * 1.25, r * 0.1, -r * 1.0, -r * 0.95, -r * 0.5, -r * 0.82);
    g.bezierCurveTo(-r * 0.2, -r * 0.75, 0, -r * 0.5, 0, -r * 0.28);
    g.bezierCurveTo(0, -r * 0.5, r * 0.2, -r * 0.75, r * 0.5, -r * 0.82);
    g.bezierCurveTo(r * 1.0, -r * 0.95, r * 1.25, r * 0.1, 0, r * 0.95);
  } else if (suit === "S") {
    g.moveTo(0, -r);
    g.bezierCurveTo(r * 0.5, -r * 0.55, r * 1.15, -r * 0.1, r * 0.95, r * 0.28);
    g.bezierCurveTo(r * 0.8, r * 0.58, r * 0.3, r * 0.6, r * 0.12, r * 0.3);
    g.bezierCurveTo(r * 0.14, r * 0.65, r * 0.25, r * 0.85, r * 0.42, r);
    g.lineTo(-r * 0.42, r);
    g.bezierCurveTo(-r * 0.25, r * 0.85, -r * 0.14, r * 0.65, -r * 0.12, r * 0.3);
    g.bezierCurveTo(-r * 0.3, r * 0.6, -r * 0.8, r * 0.58, -r * 0.95, r * 0.28);
    g.bezierCurveTo(-r * 1.15, -r * 0.1, -r * 0.5, -r * 0.55, 0, -r);
  } else {
    const b = r * 0.5; // the three lobes
    g.arc(0, -r * 0.5, b, 0, Math.PI * 2);
    g.moveTo(-r * 0.45 + b, r * 0.2);
    g.arc(-r * 0.45, r * 0.2, b, 0, Math.PI * 2);
    g.moveTo(r * 0.45 + b, r * 0.2);
    g.arc(r * 0.45, r * 0.2, b, 0, Math.PI * 2);
    g.moveTo(0, 0);
    g.lineTo(r * 0.3, r);
    g.lineTo(-r * 0.3, r);
  }
  g.closePath();
}

function pip(g, suit, x, y, s, turned = false) {
  g.save();
  g.translate(x, y);
  if (turned) g.rotate(Math.PI);
  g.fillStyle = COLOUR[suit];
  pipPath(g, suit, s);
  g.fill();
  g.restore();
}

// Pip places: column 0, 1, 2 (left, middle, right) and row 0..1 down the card.
const PIPS = {
  A: [[1, 0.5]],
  2: [[1, 0], [1, 1]],
  3: [[1, 0], [1, 0.5], [1, 1]],
  4: [[0, 0], [2, 0], [0, 1], [2, 1]],
  5: [[0, 0], [2, 0], [1, 0.5], [0, 1], [2, 1]],
  6: [[0, 0], [2, 0], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
  7: [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [0, 1], [2, 1]],
  8: [[0, 0], [2, 0], [1, 0.25], [0, 0.5], [2, 0.5], [1, 0.75], [0, 1], [2, 1]],
  9: [[0, 0], [2, 0], [0, 1 / 3], [2, 1 / 3], [1, 0.5], [0, 2 / 3], [2, 2 / 3], [0, 1], [2, 1]],
  10: [[0, 0], [2, 0], [1, 1 / 6], [0, 1 / 3], [2, 1 / 3], [0, 2 / 3], [2, 2 / 3], [1, 5 / 6], [0, 1], [2, 1]],
};

export function drawClassic(g, width, code) {
  const [rank, suit] = rankAndSuit(code);
  const u = width / JUMBO.w;
  const height = JUMBO.h * u;
  g.fillStyle = JUMBO.paper;
  g.fillRect(0, 0, width, height);
  g.fillStyle = COLOUR[suit];
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  const corner = (turned) => {
    g.save();
    if (turned) {
      g.translate(width, height);
      g.rotate(Math.PI);
    }
    g.fillStyle = COLOUR[suit];
    g.font = `700 ${1.55 * u}px ${RANK_FONT}`;
    const wide = rank === "10";
    g.save();
    if (wide) {
      g.translate(0.8 * u, 1.55 * u);
      g.scale(0.78, 1);
      g.fillText(rank, 0, 0);
    } else g.fillText(rank, 0.8 * u, 1.55 * u);
    g.restore();
    pip(g, suit, 0.8 * u, 2.35 * u, 1.0 * u);
    g.restore();
  };
  corner(false);
  corner(true);
  const key = rank === "10" ? 10 : rank;
  if (PIPS[key]) {
    const xs = [2.25 * u, 3.5 * u, 4.75 * u];
    const top = 1.75 * u;
    const span = 6.3 * u;
    const size = key === "A" ? 3.4 * u : 1.35 * u;
    for (const [c, r] of PIPS[key]) pip(g, suit, xs[c], top + r * span, size, r > 0.5);
  } else {
    // A court card: a framed panel, the letter large, a pip at two corners.
    g.strokeStyle = COLOUR[suit];
    g.lineWidth = 0.12 * u;
    g.strokeRect(1.7 * u, 1.5 * u, 3.6 * u, 6.8 * u);
    g.fillStyle = COLOUR[suit];
    g.font = `700 ${3.4 * u}px ${RANK_FONT}`;
    g.fillText(rank, 3.5 * u, 5.6 * u);
    pip(g, suit, 3.5 * u, 3.0 * u, 1.3 * u);
    pip(g, suit, 3.5 * u, 6.8 * u, 1.3 * u, true);
  }
}

export function classicTextures(codes, { width, anisotropy = 1 }) {
  return Object.fromEntries(
    codes.map((code) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.round((width * JUMBO.h) / JUMBO.w);
      drawClassic(canvas.getContext("2d"), width, code);
      return [code, cardTexture(new CanvasTexture(canvas), anisotropy)];
    }),
  );
}

// The back: a deep blue with a fine lattice of diamonds in a pale border.
export function backTexture({ width, anisotropy = 1 }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((width * JUMBO.h) / JUMBO.w);
  const g = canvas.getContext("2d");
  const u = width / JUMBO.w;
  g.fillStyle = "#fbfaf6";
  g.fillRect(0, 0, canvas.width, canvas.height);
  const m = 0.45 * u;
  g.fillStyle = "#2d4f86";
  g.fillRect(m, m, canvas.width - 2 * m, canvas.height - 2 * m);
  g.save();
  g.beginPath();
  g.rect(m, m, canvas.width - 2 * m, canvas.height - 2 * m);
  g.clip();
  g.strokeStyle = "rgba(255,255,255,0.55)";
  g.lineWidth = Math.max(1, 0.06 * u);
  const gap = 0.7 * u;
  for (let k = -canvas.height; k < canvas.width + canvas.height; k += gap) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + canvas.height, canvas.height);
    g.moveTo(k, canvas.height);
    g.lineTo(k + canvas.height, 0);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = "#fbfaf6";
  g.lineWidth = 0.18 * u;
  g.strokeRect(m * 1.8, m * 1.8, canvas.width - 3.6 * m, canvas.height - 3.6 * m);
  return cardTexture(new CanvasTexture(canvas), anisotropy);
}
