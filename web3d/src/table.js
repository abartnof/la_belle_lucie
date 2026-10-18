// The three.js table for La Belle Lucie (docs/UI.md `table.js`).
//
// `createTable(canvas, hooks)` draws a state (docs/PROTOCOL.md) with the kit's
// scene, deck and ink language; where each card lies is layout.js. It holds no
// rules: it tells its listener what was clicked, as { fan, home, card, action }.
//
//   show(state, { instant })       tween every card to where the state puts it
//   highlight({ select, targets, hint })
//        select   a card code, drawn in the chosen (blue) ink
//        targets  [{ fan } | { home: true, suit }]: where the chosen card may go
//        hint     { cards: [code], targets: [...], move?, card?, onto? } in the hint
//                 (blue) ink; with the engine's hint (move, card, onto) it also
//                 draws the animated arrow from the card to where it goes
//   setSettings(s)                 table pattern, faces, speed
//   onClick(cb)                    cb({ fan, home, card, suit?, action })
//                                  action: "click" | "dblclick" | "home" | "clear"
//   announce(text)                 into the visually hidden live region
//   setMargins({ top, bottom, side })  the share of the window the overlay keeps
//
// Hooks: `hooks.margins()` may give the margins; `hooks.focus(fan)` is told as the
// keyboard moves between fans.

import { BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, Plane, Raycaster, SRGBColorSpace, Vector2, Vector3, Quaternion, PointLight, RingGeometry } from "three";
import { EFFECTS, createRedeal } from "./redeal-fx.js";
import { createDeck, INKS } from "../../kit/js/deck.js";
import { M3 } from "../../kit/js/easing.js";
import { jumboTextures, largeTextHere } from "../../kit/js/faces.js";
import { lying, slide } from "../../kit/js/kinematics.js";
import { createScene } from "../../kit/js/scene.js";
import { CARD as UNITS_CARD } from "../../kit/js/units.js";
import { CYCLE_MS, arrowEnds, arrowShape, phase } from "./arrow.js";
import { backTexture, classicTextures } from "./classic.js";
import { CARD, LIFT, MARGINS, SUITS, cardName, hitSlot, layout } from "./layout.js";
import { CONTRAST_BG, FOCUS_BLUE, dimLevels, faceKind as faceKindFor, invertPixels } from "./look.js";

const CODES = [...SUITS].flatMap((s) => [..."A23456789TJQK"].map((r) => r + s));
const RANKS = "A23456789TJQK";
const MOVE_MS = 420;
const CAMERA_MS = 380;
const SPREAD_MS = 170;
const DOUBLE_MS = 380;
// Colour is semantic and the rest is grey: one gentle blue says "look here, act
// here" (a hint, the chosen card, a place it may go, the keyboard's place), told
// apart by weight, thickest for a hint; a hover is the grey ink.
// The kit is vendored, so its ink language is overridden here, before any deck.
const BLUE = FOCUS_BLUE;
const GREY_INK = "#1a1a1a";
Object.assign(INKS, {
  plain: { color: GREY_INK },
  hover: { color: GREY_INK, heavier: 1.5 },
  focus: { color: BLUE, heavier: 2.2 },
  hint: { color: BLUE, heavier: 3.4 },
  chosen: { color: BLUE, heavier: 2.6 },
  target: { color: BLUE, heavier: 1.4 },
});
const SLOT_COLOUR = { plain: "#8c8c8c", chosen: BLUE, target: BLUE, hint: BLUE, focus: BLUE };

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
  let settings = { table: "plain", faces: "auto", speed: "normal", redealFx: "random" };
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
  function contrastTextures() {
    const base = jumboTextures(CODES, { width, anisotropy });
    for (const code of CODES) {
      const bg = CONTRAST_BG[code[1]];
      if (!bg) continue;
      const canvas = base[code].image;
      const g = canvas.getContext("2d");
      const img = g.getImageData(0, 0, canvas.width, canvas.height);
      invertPixels(img.data, bg);
      g.putImageData(img, 0, 0);
      base[code].needsUpdate = true;
    }
    return base;
  }
  const faceSet = (kind) => (sets[kind] ??= (kind === "classic" ? classicTextures(CODES, { width, anisotropy }) : kind === "contrast" ? contrastTextures() : jumboTextures(CODES, { width, anisotropy })));
  let faceKind = faceKindFor(settings.faces);
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

  // ---- the hint arrow ------------------------------------------------------
  // Two flat meshes (a white halo under the blue arrow) above the cards, drawn
  // on top of everything, never hit by a click (the picker only tests cards).
  const ARROW_Y = LIFT + 1;
  const ARROW_TRIS = 40;
  function arrowMesh(color, order, y) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(ARROW_TRIS * 9), 3));
    geometry.setDrawRange(0, 0);
    const material = new MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false, fog: false, side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.raycast = () => {};
    mesh.userData.y = y;
    scene.add(mesh);
    return mesh;
  }
  const arrowHalo = arrowMesh("#ffffff", 20, ARROW_Y);
  const arrowFill = arrowMesh(BLUE, 21, ARROW_Y + 0.02);
  let arrow = null; // { ends, start } while a hint with a move shows

  function fillArrow(mesh, shape) {
    const a = mesh.geometry.attributes.position;
    const n = Math.min(shape.triangles.length, ARROW_TRIS * 3);
    for (let i = 0; i < n; i++) a.setXYZ(i, shape.triangles[i][0], mesh.userData.y, shape.triangles[i][1]);
    a.needsUpdate = true;
    mesh.geometry.setDrawRange(0, n);
  }
  function drawArrow(now) {
    if (!arrow) return false;
    const still = speedInstant();
    const { t, alpha } = still ? { t: 1, alpha: 1 } : phase(now - arrow.start);
    const opts = still ? { tail: 1 } : {};
    fillArrow(arrowHalo, arrowShape(arrow.ends, t, { ...opts, inflate: 0.55 }));
    fillArrow(arrowFill, arrowShape(arrow.ends, t, opts));
    arrowHalo.material.opacity = arrowFill.material.opacity = alpha;
    arrowHalo.visible = arrowFill.visible = alpha > 0;
    dirty = true;
    return !still;
  }
  function setArrow(hint) {
    const ends = hint?.move && lay ? arrowEnds(lay, hint) : null;
    if (!ends) {
      arrow = null;
      arrowHalo.visible = arrowFill.visible = false;
      dirty = true;
      return;
    }
    const same = arrow && arrow.key === hint.move + hint.card;
    arrow = { ends, start: same ? arrow.start : performance.now(), key: hint.move + hint.card };
    drawArrow(performance.now());
  }

  // ---- state ---------------------------------------------------------------
  let state = null;
  let lay = null;
  let margins = { ...MARGINS };
  let cam = null; // { eye, at, fov } as drawn
  let camAnim = null;
  let marks = { select: null, targets: [], hint: null };
  let hover = null;
  let hoverFan = null; // the fan under the pointer (or last tapped), spread to read
  let spreadNow = null; // the fan laid out spread
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
    lay = layout(state, aspect(), { margins: wantMargins(), spread: spreadNow });
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
    if (arrow) setArrow(marks.hint);
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

  const wantSpread = () => hoverFan ?? (typeof kb === "number" ? kb : null);

  // ---- the redeal animation (redeal-fx.js) ----------------------------------------
  // The cards in the engine's new order fly on the physics of one effect and end
  // on exactly the poses show() would have given them. A light and a ring
  // (neutral white) belong to two of the effects.
  let fx = null; // { sim, codes, targets, last }
  let fxManual = false; // tests step the clock themselves
  let fxLight = null;
  let fxRing = null;
  const fxPos = new Vector3();
  const fxQuat = new Quaternion();

  function fxProps() {
    if (!fxLight) {
      fxLight = new PointLight("#ffffff", 0, 0, 2);
      fxRing = new Mesh(new RingGeometry(0.96, 1, 96), new MeshBasicMaterial({ color: "#e6e6e6", transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }));
      fxRing.rotation.x = -Math.PI / 2;
      fxRing.position.y = 0.05;
      fxRing.visible = false;
      fxRing.raycast = () => {};
      scene.add(fxLight, fxRing);
    }
  }
  function chooseEffect() {
    const want = settings.redealFx;
    if (want === "simple" || !state?.fans) return null;
    return EFFECTS.includes(want) ? want : EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
  }
  function startFx(name) {
    const codes = state.fans.flat();
    if (!codes.length || codes.some((c) => !lay.poses[c] || !entries.get(c).placed)) return false;
    const targets = codes.map((c) => poseOf(lay.poses[c]));
    const from = codes.map((c) => {
      const e = entries.get(c);
      e.anim = null;
      return { x: e.mesh.position.x, y: e.mesh.position.y, z: e.mesh.position.z, yaw: 0 };
    });
    const slots = targets.map((t, j) => ({ x: t.position.x, y: t.position.y, z: t.position.z, yaw: lay.poses[codes[j]].yaw, fan: lay.poses[codes[j]].fan }));
    fxProps();
    fx = { sim: createRedeal(name, { from, slots, rng: Math.random }), codes, targets, last: null };
    const moving = new Set(codes);
    for (const [code, e] of entries) if (!moving.has(code)) e.mesh.visible = !!lay.poses[code];
    hooks.busy?.(true);
    return true;
  }
  function writeFx() {
    fx.codes.forEach((c, j) => {
      fx.sim.write(j, fxPos, fxQuat);
      const m = entries.get(c).mesh;
      m.position.copy(fxPos);
      m.quaternion.copy(fxQuat);
    });
    const { light, ring } = fx.sim;
    fxLight.position.set(light.x, light.y, light.z);
    fxLight.intensity = 6000 * light.intensity;
    fxRing.visible = ring.on;
    fxRing.position.x = ring.x;
    fxRing.position.z = ring.z;
    fxRing.scale.setScalar(Math.max(ring.radius, 0.01));
    fxRing.material.opacity = ring.opacity;
    dirty = true;
  }
  // Advance the effect by dt seconds; false once it is over.
  function stepFx(dt) {
    if (!fx) return false;
    fx.sim.step(dt);
    if (fx.sim.done() || !fx.sim.valid()) {
      endFx();
      return false;
    }
    writeFx();
    return true;
  }
  // Snap every card to the pose the layout gives it, and say if the physics was off.
  function endFx() {
    if (!fx) return;
    const f = fx;
    fx = null;
    const err = f.sim.finish();
    if (err > 1e-3 || !Number.isFinite(err)) console.error(`redeal animation ended ${err} cm from its slots`);
    f.codes.forEach((c) => put(entries.get(c).mesh, poseOf(lay.poses[c])));
    fxLight.intensity = 0;
    fxRing.visible = false;
    dirty = true;
    hooks.busy?.(false);
    decorate();
    respread();
    kickoff();
  }

  function show(next, { instant = false, redeal = false } = {}) {
    endFx();
    const first = !state;
    state = next;
    const quick = instant || first || speedInstant();
    const effect = redeal && !quick ? chooseEffect() : null;
    spreadNow = effect ? null : wantSpread();
    relayout({ instant: quick });
    if (!(effect && startFx(effect))) movePoses(quick, false);
    decorate();
    kickoff();
  }

  // The hovered, tapped or keyboard-focused fan spreads to be read: a short tween.
  function respread() {
    const want = state ? wantSpread() : null;
    if (!state || fx || want === spreadNow) return;
    spreadNow = want;
    lay = layout(state, aspect(), { margins: wantMargins(), spread: spreadNow });
    movePoses(speedInstant(), true);
    if (arrow) setArrow(marks.hint);
    kickoff();
  }

  // Take every card to where the layout puts it (at once, or tweened).
  function movePoses(quick, gentle) {
    const now = performance.now();
    // Many cards moving at once is a redeal: stagger them in reading order.
    const moving = CODES.filter((c) => {
      const p = lay.poses[c];
      const e = entries.get(c);
      if (!p || !e.placed) return false;
      const to = poseOf(p);
      return e.mesh.position.distanceToSquared(to.position) > 1e-4;
    });
    const staggered = !gentle && moving.length > 4;
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
      const lift = gentle ? 0 : staggered ? LIFT * 0.6 : LIFT;
      e.anim = { start: now + delay, dur: gentle ? SPREAD_MS : MOVE_MS + (staggered ? 120 : 0), fn: slide(from, to, { ease: M3.standard, lift }), to, from };
    }
    dirty = true;
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
    set(kbCard, "focus");
    for (const t of marks.targets) set(targetCard(t), "target");
    for (const t of marks.hint?.targets ?? []) set(targetCard(t), "hint");
    for (const c of marks.hint?.cards ?? []) set(c, "hint");
    set(marks.select, "chosen");
    // A card under another is dimmed so the top cards stand clear (every top
    // card is bright); any card inked for attention is shown as printed.
    const dims = dimLevels(state);
    for (const [code, e] of entries) {
      const line = lines.get(code) ?? "plain";
      deck.decorate(e.mesh, { line });
      if (Array.isArray(e.mesh.material)) e.mesh.material[0].color.setScalar(line === "plain" ? dims.get(code) ?? 1 : 1);
    }
    // The empty places.
    const tinted = new Map();
    const tint = (m, k) => m && tinted.set(m, k);
    for (const t of marks.targets) tint(placeMesh(t), "target");
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
    setArrow(marks.hint);
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
    if (drawArrow(now)) busy = true;
    if (fx) {
      const dt = fx.last === null ? 0 : Math.min((now - fx.last) / 1000, 0.05);
      fx.last = now;
      if (fxManual || stepFx(dt)) busy = true;
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
    if (e.pointerType && e.pointerType !== "mouse") {
      hoverFan = hit && !hit.home ? hit.fan : null;
      respread();
    }
    if (!hit) {
      lastClick = null;
      emit({ fan: null, home: false, card: null, action: "clear" });
      return;
    }
    kb = null;
    respread();
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
    if (hit && !hit.home && hit.fan !== null) hoverFan = hit.fan;
    else hoverFan = null;
    respread();
  });
  canvas.addEventListener("pointerleave", () => {
    hoverFan = null;
    respread();
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
    respread();
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
      const kind = faceKindFor(settings.faces);
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
    // The hint arrow on show, for tests: its ends and whether it is drawn.
    arrow: () => (arrow ? { ...arrow.ends, visible: arrowFill.visible, cycle: CYCLE_MS } : null),
    // Whether anything is still moving, and the frames drawn.
    busy: () => [...entries.values()].some((e) => e.anim) || !!camAnim || !!fx,
    // For tests: take the redeal animation's clock (true), then step it by seconds
    // and draw; false gives the clock back.
    redealClock: {
      manual: (on) => (fxManual = !!on),
      step(seconds) {
        const live = stepFx(seconds);
        stage.render();
        dirty = false;
        return live;
      },
      active: () => !!fx,
    },
    stage,
    layout: () => lay,
    cardSize: UNITS_CARD,
  };
}
