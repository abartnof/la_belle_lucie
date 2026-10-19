// The soundtrack: ten French folk songs (CREDITS.md), arranged in the style of an
// 8-bit game, played one after another from the page's own embedded copies. On by
// default; the player turns it off in the bar or in Settings.
//
// A browser lets a page make sound only after a gesture, so "on" can be asked
// before it can be done: the controller keeps being on, and plays at the first
// click, tap or key. Pure of the page (an audio element and a document are passed
// in), so Node tests it.

// The tracks in the order they play (web3d/audio/<stem>.m4a).
export const TRACKS = Object.freeze([
  { stem: "01_la_verdi_la_verdon", title: "La Verdi, la Verdon" },
  { stem: "02_ratapataplan", title: "Ratapataplan" },
  { stem: "03_margoton_va_t_a_liau", title: "Margoton va-t-à l'iau" },
  { stem: "04_chanson_du_matelot", title: "Chanson du matelot" },
  { stem: "05_cendrillon", title: "Cendrillon" },
  { stem: "06_compere_guilleri", title: "Compère Guilleri" },
  { stem: "07_monsieur_dumollet", title: "Monsieur Dumollet" },
  { stem: "08_gentil_coqlicot", title: "Gentil Coq'licot" },
  { stem: "09_tremp_ton_pain_marie", title: "Tremp' ton pain, Marie" },
  { stem: "10_le_31_du_mois_daout", title: "Le 31 du mois d'août" },
]);

// The order of play: all of the soundtrack, from the track at `start`.
export function playlist(count, start = 0) {
  return Array.from({ length: count }, (_, i) => (start + i) % count);
}

const VOLUME = 0.4;
const GESTURES = ["pointerdown", "keydown", "touchstart"];

// sources: { stem: data URI }. start: which track opens (a page picks one at random).
export function createMusic({ sources = {}, doc = globalThis.document, makeAudio = () => new Audio(), start = 0 } = {}) {
  const tracks = TRACKS.filter((t) => sources[t.stem]);
  const listeners = new Set();
  let on = false;
  let audio = null;
  let at = tracks.length ? start % tracks.length : 0;
  let waiting = false; // refused for want of a gesture

  const state = () => (tracks.length ? { on, title: tracks[at].title } : null);
  const tell = () => listeners.forEach((fn) => fn(state()));

  function ensure() {
    if (audio || !tracks.length) return audio;
    audio = makeAudio();
    if (!audio) return null;
    audio.volume = VOLUME;
    audio.preload = "auto";
    audio.addEventListener("ended", () => {
      at = (at + 1) % tracks.length;
      load();
      if (on) play();
      tell();
    });
    load();
    return audio;
  }
  const load = () => {
    audio.src = sources[tracks[at].stem];
  };

  function wake() {
    for (const g of GESTURES) doc?.removeEventListener(g, wake, true);
    waiting = false;
    if (on) play();
  }
  function play() {
    const a = ensure();
    if (!a || !on || doc?.visibilityState === "hidden") return;
    let result;
    try {
      result = a.play();
    } catch {
      result = Promise.reject(new Error("play threw"));
    }
    result?.catch?.(() => {
      // Refused (no gesture yet): stay on, and try at the next one.
      if (waiting || !doc) return;
      waiting = true;
      for (const g of GESTURES) doc.addEventListener(g, wake, { capture: true, once: true });
    });
  }

  doc?.addEventListener?.("visibilitychange", () => {
    if (!audio) return;
    if (doc.visibilityState === "hidden") audio.pause();
    else if (on) play();
  });

  return {
    setOn(next) {
      on = !!next;
      if (on) play();
      else audio?.pause();
      tell();
    },
    isOn: () => on,
    nowPlaying: state,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
