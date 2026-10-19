// How high a card in flight rides (pure: no three.js, so Node tests it).
//
// A card played from one pile to another must clear every card on the way, the
// spread fans (SPREAD_RISE) included, so it climbs soon after it leaves, stays
// up, and drops only at the end: a plateau, where a plain parabola would skim
// the cards near either end.

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The height (cm) at u (0 to 1 through the move) for a hop whose top is `lift`.
export function hopHeight(u, lift) {
  if (u <= 0 || u >= 1) return 0;
  return lift * smooth(0, 0.2, u) * (1 - smooth(0.8, 1, u));
}
