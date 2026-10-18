// The three.js table for La Belle Lucie (docs/UI.md `table.js`).
//
// `createTable(canvas, hooks)` draws a state (docs/PROTOCOL.md) with the kit's
// scene, deck and ink language; where each card lies is layout.js. It holds no
// rules: it tells its listener what was clicked, as { fan, home, card, action }.
//
//   show(state, { instant })       tween every card to where the state puts it
//   highlight({ select, targets, hint })
//        select   a card code, drawn in the chosen (amber) ink
//        targets  [{ fan } | { home: true, suit }]: where the chosen card may go
//        hint     { cards: [code], targets: [...] } in the hint (cyan) ink
//   setSettings(s)                 table pattern, faces, speed
//   onClick(cb)                    cb({ fan, home, card, suit?, action })
//                                  action: "click" | "dblclick" | "home" | "clear"
//   announce(text)                 into the visually hidden live region
//   setMargins({ top, bottom, side })  the share of the window the overlay keeps
//
// Hooks: `hooks.margins()` may give the margins; `hooks.focus(fan)` is told as the
// keyboard moves between fans.

import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, Plane, Raycaster, SRGBColorSpace, Vector2, Vector3 } from "three";
import { createDeck } from "../../kit/js/deck.js";
import { M3 } from "../../kit/js/easing.js";
import { facesFor, jumboTextures, largeTextHere } from "../../kit/js/faces.js";
import { lying, slide } from "../../kit/js/kinematics.js";
import { createScene } from "../../kit/js/scene.js";
import { CARD as UNITS_CARD } from "../../kit/js/units.js";
import { backTexture, classicTextures } from "./classic.js";
import { CARD, LIFT, MARGINS, SUITS, cardName, hitSlot, layout } from "./layout.js";

const CODES = [...SUITS].flatMap((s) => [..."A23456789TJQK"].map((r) => r + s));
const RANKS = "A23456789TJQK";
const MOVE_MS = 420;
const CAMERA_MS = 380;
const DOUBLE_MS = 380;
const SLOT_COLOUR = { plain: "#8a93a3", chosen: "#e8900c", hint: "#009fb7", focus: "#1d2433" };

const reducedMotion = () => {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

const pow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

// The outline (and for a foundation, the suit) of an empty place, white on
// clear so the material's colour tints it.
function slotTexture(suit) {
  const w = 160;
  const h = Math.round((w * CARD.height) / CARD.width);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  g.strokeStyle = "#fff";
  g.lineWidth = 5;
  g.setLineDash(suit ? [] : [14, 9]);
  const r = 12;
  const [x, y, X, Y] = [6, 6, w - 6, h - 6];
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(X, y, X, Y, r);
  g.arcTo(X, Y, x, Y, r);
  g.arcTo(x, Y, x, y, r);
  g.arcTo(x, y, X, y, r);
  g.closePath();
  g.stroke();
  if (suit) {
    g.fillStyle = "#fff";
    g.globalAlpha = 0.55;
    g.font = `${w * 0.5}px "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", "DejaVu Sans", system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText({ S: "♠︎", H: "♥︎", D: "♦︎", C: "♣︎" }[suit], w / 2, h / 2 + 4);
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function createTable(canvas, hooks = {}) {
  let settings = { table: "plain", faces: "auto", speed: "normal" };
  const touch = largeTextHere();
  const stage = createScene(canvas, { table: settings.table, shadowMap: 512, touch });
  const { scene, camera, renderer } = stage;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute(
    "aria-label",
    "La Belle Lucie table. Arrow keys move between fans, Enter selects a card or moves it, H sends a card home, Escape clears.",
  );
  canvas.style.touchAction = "none";
  canvas.style.outline = "none";
  const live = document.createElement("div");
  live.id = "table-live";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap";
  (canvas.parentNode ?? document.body).append(live);
  const announce = (text) => {
    live.textContent = "";
    // A tick later, so a repeated sentence is read again.
    setTimeout(() => (live.textContent = text), 20);
  };

  // ---- faces ------------------------------------------------------------
  // A card's width on the screen, in device pixels, picks the texture size.
  function faceWidth() {
    const cols = canvas.clientWidth / Math.max(1, canvas.clientHeight) < 0.85 ? 4 : 6;
    const px = ((canvas.clientWidth || 800) / (cols * 2.09)) * Math.min(window.devicePixelRatio || 1, 2);
    return Math.min(512, Math.max(128, pow2(px * 1.5)));
  }
  const width = faceWidth();
  const back = backTexture({ width: Math.min(width, 256), anisotropy });
  const sets = {};
  const faceSet = (kind) => (sets[kind] ??= (kind === "jumbo" ? jumboTextures : classicTextures)(CODES, { width, anisotropy }));
  let faceKind = facesFor(settings.faces, touch);
  const textures = { faces: { ...faceSet(faceKind) }, back };
  const deck = createDeck(stage, textures);

  // ---- the cards ----------------------------------------------------------
  const entries = new Map(); // code -> { mesh, anim }
  for (const code of CODES) {
    const mesh = deck.card(code);
    mesh.visible = false;
    entries.set(code, { mesh, anim: null, placed: false });
  }
  const put = (mesh, p) => {
    mesh.position.copy(p.position);
    mesh.quaternion.copy(p.quaternion);
  };
  const poseOf = (p) => lying({ x: p.x, z: p.z, height: p.y, faceUp: p.faceUp, yaw: p.yaw });

  // ---- the places ----------------------------------------------------------
  const plane = new PlaneGeometry(CARD.width + 0.5, CARD.height + 0.5);
  const slotMeshes = [];
  const homeMeshes = SUITS.map((suit) => makePlace(slotTexture(suit)));
  function makePlace(map) {
    const material = new MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0.8 });
    material.color.set(SLOT_COLOUR.plain);
    const mesh = new Mesh(plane, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.visible = false;
    mesh.renderOrder = -1;
    scene.add(mesh);
    return mesh;
  }
  const fanTexture = slotTexture(null);
  const slotMesh = (i) => (slotMeshes[i] ??= makePlace(fanTexture));

  // ---- state ---------------------------------------------------------------
  let state = null;
  let lay = null;
  let margins = { ...MARGINS };
  let cam = null; // { eye, at, fov } as drawn
  let camAnim = null;
  let marks = { select: null, targets: [], hint: null };
  let hover = null;
  let kb = null; // the fan the keyboard is on (a number), or "home"
  let dirty = true;
  let looping = false;
  const listeners = new Set();
  const aspect = () => (canvas.clientWidth || 1) / (canvas.clientHeight || 1);
  const speedInstant = () => settings.speed === "instant" || reducedMotion();

  function applyCamera(c) {
    cam = c;
    camera.position.set(...c.eye);
    camera.fov = c.fov;
    camera.aspect = aspect();
    camera.near = 20;
    camera.far = 900;
    // The scene frames the camera for its own play (offsets and all): ours is
    // set whole, every time.
    camera.clearViewOffset();
    camera.filmOffset = 0;
    camera.lookAt(...c.at);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const d = Math.hypot(c.eye[0] - c.at[0], c.eye[1] - c.at[1], c.eye[2] - c.at[2]);
    scene.fog.near = d + 120;
    scene.fog.far = d + 420;
    dirty = true;
  }

  function wantMargins() {
    return { ...margins, ...(hooks.margins?.() ?? {}) };
  }

  function relayout({ instant = false } = {}) {
    if (!state) return;
    lay = layout(state, aspect(), { margins: wantMargins() });
    const to = lay.camera;
    const same = cam && [...to.eye, ...to.at, to.fov].every((v, i) => Math.abs(v - [...cam.eye, ...cam.at, cam.fov][i]) < 0.01);
    if (same && !camAnim) {
      // already there
    } else if (!cam || instant || speedInstant()) {
      camAnim = null;
      applyCamera({ eye: to.eye, at: to.at, fov: to.fov });
    } else {
      camAnim = { from: cam, to, start: performance.now() };
    }
    placeSlots();
  }

  function placeSlots() {
    slotMeshes.forEach((m, i) => {
      const s = lay.slots[i];
      m.visible = !!s && s.count === 0;
      if (s) m.position.set(s.cx, 0.02, s.cz);
    });
    lay.slots.forEach((s, i) => {
      const m = slotMesh(i);
      m.visible = s.count === 0;
      m.position.set(s.cx, 0.02, s.cz);
    });
    lay.home.forEach((h, i) => {
      homeMeshes[i].visible = true;
      homeMeshes[i].position.set(h.cx, 0.02, h.cz);
    });
  }

  function show(next, { instant = false } = {}) {
    const first = !state;
    state = next;
    const quick = instant || first || speedInstant();
    relayout({ instant: quick });
    const now = performance.now();
    // Many cards moving at once is a redeal: stagger them in reading order.
    const moving = CODES.filter((c) => {
      const p = lay.poses[c];
      const e = entries.get(c);
      if (!p || !e.placed) return false;
      const to = poseOf(p);
      return e.mesh.position.distanceToSquared(to.position) > 1e-4;
    });
    const staggered = moving.length > 4;
    const order = Object.keys(lay.poses).sort((a, b) => lay.poses[a].z - lay.poses[b].z || lay.poses[a].x - lay.poses[b].x);
    const rank = new Map(order.map((c, i) => [c, i]));
    for (const code of CODES) {
      const e = entries.get(code);
      const p = lay.poses[code];
      e.mesh.visible = !!p;
      if (!p) continue;
      const to = poseOf(p);
      if (quick || !e.placed) {
        put(e.mesh, to);
        e.anim = null;
        e.placed = true;
        continue;
      }
      if (e.mesh.position.distanceToSquared(to.position) < 1e-4 && !e.anim) continue;
      const from = { position: e.mesh.position.clone(), quaternion: e.mesh.quaternion.clone() };
      const delay = staggered ? Math.min(700, (rank.get(code) ?? 0) * 14) : 0;
      e.anim = { start: now + delay, dur: MOVE_MS + (staggered ? 120 : 0), fn: slide(from, to, { ease: M3.standard, lift: staggered ? LIFT * 0.6 : LIFT }), to, from };
    }
    decorate();
    kickoff();
  }

  // ---- ink ----------------------------------------------------------------
  const topOfFan = (i) => state?.fans?.[i]?.[state.fans[i].length - 1] ?? null;
  const topOfHome = (suit) => {
    const n = state?.home?.[SUITS.indexOf(suit)] ?? 0;
    return n ? RANKS[n - 1] + suit : null;
  };
  function targetCard(t) {
    if (t.home) return t.suit ? topOfHome(t.suit) : null;
    return topOfFan(t.fan);
  }
  function placeMesh(t) {
    if (t.home) return t.suit ? homeMeshes[SUITS.indexOf(t.suit)] : null;
    return slotMeshes[t.fan] ?? null;
  }
  function decorate() {
    if (!state) return;
    const lines = new Map();
    const set = (code, line) => code && lines.set(code, line);
    const kbCard = kb === "home" ? null : kb !== null ? topOfFan(kb) : null;
    set(hover, "hover");
    set(kbCard, "hover");
    for (const t of marks.targets) set(targetCard(t), "hint");
    for (const t of marks.hint?.targets ?? []) set(targetCard(t), "hint");
    for (const c of marks.hint?.cards ?? []) set(c, "hint");
    set(marks.select, "chosen");
    for (const [code, e] of entries) deck.decorate(e.mesh, { line: lines.get(code) ?? "plain" });
    // The empty places.
    const tinted = new Map();
    const tint = (m, k) => m && tinted.set(m, k);
    for (const t of marks.targets) tint(placeMesh(t), "hint");
    for (const t of marks.hint?.targets ?? []) tint(placeMesh(t), "hint");
    if (kb === "home") homeMeshes.forEach((m) => tint(m, "focus"));
    else if (kb !== null) tint(slotMeshes[kb], "focus");
    for (const m of [...slotMeshes, ...homeMeshes]) {
      m.material.color.set(SLOT_COLOUR[tinted.get(m) ?? "plain"]);
      m.material.opacity = tinted.has(m) ? 1 : 0.8;
    }
    dirty = true;
  }

  function highlight(next = {}) {
    marks = { select: next.select ?? null, targets: next.targets ?? [], hint: next.hint ?? null };
    decorate();
    kickoff();
  }

  // ---- drawing ------------------------------------------------------------
  function frame(now) {
    let busy = false;
    for (const e of entries.values()) {
      const a = e.anim;
      if (!a) continue;
      const t = (now - a.start) / a.dur;
      if (t < 0) {
        busy = true;
      } else if (t >= 1) {
        put(e.mesh, a.to);
        e.anim = null;
        dirty = true;
      } else {
        put(e.mesh, a.fn(t));
        busy = true;
        dirty = true;
      }
    }
    if (camAnim) {
      const t = Math.min(1, (now - camAnim.start) / CAMERA_MS);
      const u = M3.standard(t);
      const mix = (a, b) => a.map((v, i) => v + (b[i] - v) * u);
      applyCamera({ eye: mix(camAnim.from.eye, camAnim.to.eye), at: mix(camAnim.from.at, camAnim.to.at), fov: camAnim.from.fov + (camAnim.to.fov - camAnim.from.fov) * u });
      if (t >= 1) camAnim = null;
      else busy = true;
    }
    if (dirty) {
      dirty = false;
      stage.render();
    }
    return busy;
  }
  function kickoff() {
    dirty = true;
    if (looping) return;
    looping = true;
    const step = (now) => {
      const busy = frame(now);
      if (busy || dirty) requestAnimationFrame(step);
      else looping = false;
    };
    requestAnimationFrame(step);
  }

  // The scene frames itself on a resize with its own idea of the table; ours
  // follows (registered after, so it runs after) and is the picture kept.
  window.addEventListener("resize", () => {
    if (!state) return;
    relayout({ instant: true });
    stage.render();
  });

  // ---- input --------------------------------------------------------------
  const ray = new Raycaster();
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const pointer = new Vector2();
  function pick(clientX, clientY) {
    if (!state || !lay) return null;
    const r = canvas.getBoundingClientRect();
    pointer.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
    camera.updateMatrixWorld();
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects([...entries.values()].filter((e) => e.mesh.visible).map((e) => e.mesh), false)[0];
    if (hit) {
      const code = hit.object.userData.code;
      const p = lay.poses[code];
      if (p) return p.home ? { fan: null, home: true, card: code, suit: code[1] } : { fan: p.fan, home: false, card: code };
    }
    const at = ray.ray.intersectPlane(ground, new Vector3());
    if (!at) return null;
    const slot = hitSlot(lay, at.x, at.z);
    if (!slot) return null;
    if (slot.home) return { fan: null, home: true, card: topOfHome(slot.suit), suit: slot.suit };
    return { fan: slot.fan, home: false, card: topOfFan(slot.fan) };
  }

  const emit = (what) => {
    for (const cb of listeners) cb(what);
  };
  let down = null;
  let lastClick = null;
  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!down || down.id !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 10) return;
    const hit = pick(e.clientX, e.clientY);
    const now = performance.now();
    if (!hit) {
      lastClick = null;
      emit({ fan: null, home: false, card: null, action: "clear" });
      return;
    }
    kb = null;
    const twice = lastClick && hit.card && lastClick.card === hit.card && now - lastClick.time < DOUBLE_MS;
    lastClick = { card: hit.card, time: now };
    emit({ ...hit, action: twice ? "dblclick" : "click" });
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const hit = pick(e.clientX, e.clientY);
    const next = hit?.card ?? null;
    canvas.style.cursor = hit ? "pointer" : "default";
    if (next !== hover) {
      hover = next;
      decorate();
      kickoff();
    }
  });
  canvas.addEventListener("pointerleave", () => {
    if (hover) {
      hover = null;
      decorate();
      kickoff();
    }
  });

  // ---- the keyboard ---------------------------------------------------------
  function describeFan(i) {
    const cards = state.fans[i] ?? [];
    if (!cards.length) return `Fan ${i + 1}, empty`;
    const n = cards.length;
    return `Fan ${i + 1}, ${cardName(cards[n - 1])} on top, ${n} ${n === 1 ? "card" : "cards"}`;
  }
  function describeHome() {
    const parts = SUITS.map((s, k) => {
      const n = state.home[k];
      return `${{ S: "spades", H: "hearts", D: "diamonds", C: "clubs" }[s]} ${n ? `to the ${cardName(RANKS[n - 1] + s).split(" of ")[0]}` : "empty"}`;
    });
    return `Foundations: ${parts.join(", ")}`;
  }
  function focusAt(next) {
    kb = next;
    hooks.focus?.(next);
    announce(next === "home" ? describeHome() : describeFan(next));
    decorate();
    kickoff();
  }
  canvas.addEventListener("keydown", (e) => {
    if (!state || e.altKey || e.ctrlKey || e.metaKey) return;
    const n = state.fans.length;
    const cols = lay?.cols ?? 6;
    const cur = kb === null ? -1 : kb === "home" ? -2 : kb;
    let handled = true;
    switch (e.key) {
      case "ArrowRight": focusAt(cur < 0 ? 0 : Math.min(n - 1, cur + 1)); break;
      case "ArrowLeft": focusAt(cur < 0 ? 0 : Math.max(0, cur - 1)); break;
      case "ArrowDown": focusAt(cur < 0 ? 0 : Math.min(n - 1, cur + cols)); break;
      case "ArrowUp": if (cur >= 0 && cur - cols < 0) focusAt("home"); else focusAt(cur < 0 ? 0 : cur - cols); break;
      case "f": case "F": focusAt("home"); break;
      case "Enter": case " ":
        if (kb === "home") emit({ fan: null, home: true, card: null, suit: null, action: "click" });
        else if (kb !== null) emit({ fan: kb, home: false, card: topOfFan(kb), action: "click" });
        else focusAt(0);
        break;
      case "h": case "H":
        if (kb !== null && kb !== "home") emit({ fan: kb, home: false, card: topOfFan(kb), action: "home" });
        break;
      case "Escape": emit({ fan: null, home: false, card: null, action: "clear" }); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });

  // ---- tests and the page's own use ---------------------------------------
  function screenOfPoint(x, y, z) {
    const v = new Vector3(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  return {
    show,
    highlight,
    announce,
    onClick(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setSettings(s = {}) {
      const was = settings;
      settings = { ...settings, ...s };
      if (settings.table !== was.table) stage.setSurface(settings.table);
      const kind = facesFor(settings.faces, touch);
      if (kind !== faceKind) {
        faceKind = kind;
        deck.setFaces(faceSet(kind));
      }
      dirty = true;
      kickoff();
    },
    setMargins(m) {
      margins = { ...margins, ...m };
      relayout();
      kickoff();
    },
    focusFan: (i) => focusAt(i),
    // Where on the screen (CSS pixels) a card, a fan's place or a foundation lies.
    screenOf(what) {
      if (!lay) return null;
      if (typeof what === "string") {
        const p = lay.poses[what];
        return p && screenOfPoint(p.x, p.y, p.z);
      }
      if (what.home) {
        const h = lay.home[SUITS.indexOf(what.suit ?? "S")];
        return screenOfPoint(h.cx, 0, h.cz);
      }
      const s = lay.slots[what.fan];
      return s && screenOfPoint(s.cx, 0, s.cz);
    },
    // Whether anything is still moving, and the frames drawn.
    busy: () => [...entries.values()].some((e) => e.anim) || !!camAnim,
    stage,
    layout: () => lay,
    cardSize: UNITS_CARD,
  };
}
