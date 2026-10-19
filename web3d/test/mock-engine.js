// A stand-in for the wasm engine, in JS, for developing the table before the real
// engine lands and for the page's tests: the same shapes as docs/PROTOCOL.md
// (classic rules only: home, build, redeal, undo, hint). Not the rules' authority.

const RANKS = "A23456789TJQK";
const SUITS = "SHDC".split("");
const SUIT_ORDER = ["S", "H", "D", "C"];

function shuffle(cards, seed) {
  let x = seed >>> 0 || 1;
  const rnd = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

const deal = (cards) => {
  const fans = [];
  for (let i = 0; i < cards.length; i += 3) fans.push(cards.slice(i, i + 3));
  return fans;
};

export function createMockEngine() {
  let seed = 0;
  let rules = 4;
  let g = null;
  let log = [];
  let hint = null;
  let layoutGame = null; // a lesson's layout: { fans, home } the replay starts from

  const fresh = () => layoutGame ? { fans: layoutGame.fans.map((f) => [...f]), home: [...layoutGame.home], redeals: (rules >> 1) & 3, moves: 0 } : ({ fans: deal(shuffle(SUITS.flatMap((s) => [...RANKS].map((r) => r + s)), seed)), home: [0, 0, 0, 0], redeals: (rules >> 1) & 3, moves: 0 });
  const rankOf = (c) => RANKS.indexOf(c[0]);
  const legal = () => {
    const out = [];
    g.fans.forEach((f, i) => {
      const c = f.at(-1);
      if (!c) return;
      if (g.home[SUIT_ORDER.indexOf(c[1])] === rankOf(c)) out.push(`f${i}>h`);
      g.fans.forEach((t, j) => {
        const d = t.at(-1);
        if (i !== j && d && d[1] === c[1] && rankOf(d) === rankOf(c) + 1) out.push(`f${i}>f${j}`);
      });
    });
    if (!out.length && g.redeals > 0 && g.home.some((n) => n < 13)) out.push("redeal");
    return out;
  };
  function apply(cmd) {
    const m = /^(?:move )?f(\d+)>(h|f(\d+))$/.exec(cmd);
    if (cmd === "redeal") {
      if (!legal().includes("redeal")) return false;
      const rest = g.fans.flat();
      g.fans = deal(shuffle(rest, seed + g.redeals * 7919)).filter((f) => f.length);
      g.redeals -= 1;
      g.moves += 1;
      return true;
    }
    if (!m || !legal().includes(`f${m[1]}>${m[2]}`)) return false;
    const card = g.fans[Number(m[1])].pop();
    if (m[2] === "h") g.home[SUIT_ORDER.indexOf(card[1])] += 1;
    else g.fans[Number(m[3])].push(card);
    g.moves += 1;
    return true;
  }
  const state = () => {
    const l = legal();
    const total = g.home.reduce((a, b) => a + b, 0);
    return {
      protocol: 2, prompt: total === 52 ? "won" : l.length ? "play" : "lost", seed, rules,
      options: { inorder: false, redeals: (rules >> 1) & 3, draw: false, king: false, trefoil: false },
      fans: g.fans.map((f) => [...f]), home: [...g.home], redeals_left: g.redeals, draw: "off", moves: g.moves,
      legal: l, undoable: log.length > 0, hint,
    };
  };
  return {
    // "<fans> ; <home S H D C>", as the engine's `lesson` reads it; null if refused.
    lesson: ({ layout, rules: r = 4 }) => {
      const [fansText, homeText] = String(layout).split(";").map((t) => t.trim());
      const home = (homeText ?? "").split(/\s+/).map(Number);
      if (home.length !== 4 || home.some((n) => !Number.isInteger(n))) return null;
      const fans = fansText.split("/").map((f) => (f.trim() === "-" ? [] : f.trim().split(/\s+/)));
      seed = 0;
      rules = r;
      layoutGame = { fans, home };
      g = fresh();
      log = [];
      hint = null;
      return state();
    },
    new: (opts) => {
      layoutGame = null;
      seed = opts.seed >>> 0;
      rules = opts.rules ?? 4;
      g = fresh();
      log = [];
      hint = null;
      return state();
    },
    send(cmd) {
      if (cmd === "undo") {
        if (!log.length) return { ok: false, state: state() };
        log.pop();
        g = fresh();
        for (const c of log) apply(c);
        hint = null;
        return { ok: true, state: state() };
      }
      if (cmd === "hint") {
        const l = legal();
        const pick = l.find((m) => m.endsWith(">h")) ?? l[0];
        if (!pick) return { ok: false, state: state() };
        hint = null;
        if (pick === "redeal") hint = { rule: "redeal", move: "redeal", card: "AS", onto: null, uncovers: null };
        else {
          const [, a, b] = /^f(\d+)>(h|f\d+)$/.exec(pick);
          const card = g.fans[Number(a)].at(-1);
          hint = { rule: b === "h" ? "home" : "build", move: pick, card, onto: b === "h" ? null : g.fans[Number(b.slice(1))].at(-1), uncovers: g.fans[Number(a)].at(-2) ?? null };
        }
        return { ok: true, state: state() };
      }
      hint = null;
      const ok = apply(cmd);
      if (ok) log.push(cmd.replace(/^move /, ""));
      return { ok, state: state() };
    },
    state,
  };
}
