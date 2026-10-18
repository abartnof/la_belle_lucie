// How the table looks, as pure decisions (the tests run it in Node).

// Automatic is the high-visibility (Jumbo Index) faces on every device; the
// classic art stays a choice in Settings.
export const faceKind = (choice) => (choice === "classic" || choice === "contrast" ? choice : "jumbo");

// The brightness a card's face is drawn at (1 = as printed). A card under
// another is dimmed so the top cards stand clear; a top card with nowhere to
// go is dimmed a little. The strip of a buried card keeps its index legible.
export const DIM = Object.freeze({ buried: 0.66, stuck: 0.86 });

// -> Map code -> level, for every card in a fan.
export function dimLevels(state) {
  const levels = new Map();
  const legal = state.legal ?? [];
  (state.fans ?? []).forEach((cards, fan) => {
    cards.forEach((code, i) => {
      const top = i === cards.length - 1;
      let level = 1;
      if (top) {
        if (state.prompt === "play" && !legal.some((m) => m.startsWith(`f${fan}>`))) level = DIM.stuck;
      } else if (!(state.draw === "ready" && legal.some((m) => m.startsWith(`draw f${fan}:${i}>`)))) {
        level = DIM.buried;
      }
      levels.set(code, level);
    });
  });
  return levels;
}

// "Suit contrast" faces: spades black on white and hearts red on white as in
// high-visibility; clubs white on black and diamonds white on red.
export const CONTRAST_BG = Object.freeze({ C: [21, 23, 28], D: [200, 32, 44] });
export const isInverted = (code) => code[1] in CONTRAST_BG;

// Recolour RGBA pixels drawn as ink on paper (#fbfaf6) so the paper becomes
// `bg` and the ink white, keeping the anti-aliasing. Reads the green channel:
// paper is bright in it, both inks dark.
export function invertPixels(data, bg) {
  const paperG = 250;
  const inkG = 28;
  for (let i = 0; i < data.length; i += 4) {
    const t = Math.min(1, Math.max(0, (paperG - data[i + 1]) / (paperG - inkG)));
    for (let k = 0; k < 3; k++) data[i + k] = Math.round(bg[k] + (255 - bg[k]) * t);
  }
  return data;
}
