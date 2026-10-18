// From cassino web3d/src/director.js @ 73f0cd7
// The director: the engine's states, choreographed, played out on the cards.
//
// It holds the card meshes (52 at cassino) and where each one is; hands every change of
// state, or of how the person asks to see it, to the choreography; runs the
// motions on the timeline, turning faces up and down as they begin and land;
// has the cards decorated once they are still; and renders only while
// something moves, so a table at rest costs nothing.
//
// From piquet web3d/src/director.js @ 254cb3c: the clock that a gate can
// hold, the motions run on the timeline, picking and screen points. Cassino's
// takes states rather than an engine (the page sends the commands), and its
// decoration is the page's: `decorate(placement, deck, meshes)` runs whenever
// the cards come to rest or the view changes.

import { Raycaster, Vector2, Vector3 } from "three";
import { cardCorners } from "./kinematics.js";
import { Timeline } from "./timeline.js";
import { CARD } from "./units.js";

// Kit changes (the smallest that make it game-independent):
//  - `choreography` is the game's { choreograph, initialPlacement, opening },
//    passed in rather than imported from a choreography.js of cassino's;
//  - `zones` is the game's zones, used by handEdge when view().zones is unset;
//  - `cards` is the number of card meshes (cassino's 52);
//  - a missing choreography function, or missing zones where handEdge needs
//    them, is an error that names it.
//
// `view()` is how the person asks to see the state: { chosen, picked }.
// `advance` and `restart` return { beats, count } (`advance` also `landed`,
// from a choreography that gives it: when an event's cards come to rest): when each new event will
// be seen to happen, and each line of a hand's count said, in ms from now on
// the table's clock (for the dialogue and the score sheet; see `at`).
// `rested()` runs whenever the cards come to rest.
export function createDirector({ stage, deck, view, decorate, rested, choreography, zones = null, cards = 52, manual = false, speed = 1 }) {
  const { choreograph, initialPlacement, opening } = choreography ?? {};
  for (const [name, fn] of Object.entries({ choreograph, initialPlacement, opening })) {
    if (typeof fn !== "function") throw new TypeError(`createDirector needs choreography.${name}: the game's { choreograph, initialPlacement, opening }`);
  }
  const meshes = Array.from({ length: cards }, () => deck.card(null));
  meshes.forEach((mesh, id) => (mesh.userData.id = id));
  let state = null;
  let placement = [];

  const timeline = new Timeline({
    apply: (id, pose) => {
      meshes[id].position.copy(pose.position);
      meshes[id].quaternion.copy(pose.quaternion);
    },
    speed,
  });

  function dress() {
    decorate?.(timeline.busy() ? [] : placement, deck, meshes);
    if (timeline.busy()) for (const m of placement) deck.decorate(meshes[m.id], {});
  }

  // ---- the clock ----------------------------------------------------------

  // The table's clock can stop: at a gate (a tutorial page, later) the cards
  // hold still until the gate is released, and then carry on from where they
  // were. Held time is taken off the clock, so everything scheduled on it
  // simply waits. Each entry is { at, gate, fn }: at a gate the clock stops
  // and `fn(release)` is called; otherwise `fn()` runs when its time comes.
  let animations = 0; // each animation's token, for its rest
  let manualNow = 0;
  const wall = () => (manual ? manualNow : performance.now());
  let offset = 0;
  let heldAt = null;
  const queue = [];
  const now = () => heldAt ?? wall() - offset;
  let running = false;
  function schedule(entry) {
    queue.push(entry);
    queue.sort((a, b) => a.at - b.at || b.gate - a.gate);
    wake();
  }
  function release() {
    if (heldAt === null) return;
    offset = wall() - heldAt;
    heldAt = null;
    wake();
  }
  function due(until) {
    while (queue.length && queue[0].at <= until && heldAt === null) {
      const entry = queue.shift();
      if (entry.gate) {
        heldAt = entry.at;
        timeline.tick(entry.at);
        stage.render();
        entry.fn(release);
        return true;
      }
      entry.fn();
    }
    return heldAt !== null;
  }
  // A frame: what is due runs, the cards move, and the table is drawn if
  // anything moved. The loop runs while cards move or something is due.
  let moving = false;
  function frame() {
    if (heldAt === null) {
      const held = due(now());
      if (!held) {
        const busy = timeline.tick(now());
        if (timeline.moved || moving) stage.render();
        moving = false;
        if ((busy || queue.length) && !manual) {
          requestAnimationFrame(frame);
          return;
        }
      }
    }
    running = false;
  }
  function wake() {
    if (manual) return frame();
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function settle(s, from = s) {
    timeline.skip();
    placement = initialPlacement(from, view());
    for (const m of placement) {
      deck.reveal(meshes[m.id], m.code);
      meshes[m.id].position.copy(m.pose.position);
      meshes[m.id].quaternion.copy(m.pose.quaternion);
    }
    state = s;
    dress();
    stage.render();
  }

  // `pace`: the count paced by the score's popups (choreography.js count),
  // in ms; not at the Instant speed, where nothing waits for them.
  function animate(prev, next, waits = {}, pace = null) {
    timeline.skip(); // anything still moving lands first
    const scaled = Object.fromEntries(Object.entries(waits).map(([k, ms]) => [k, ms * timeline.speed]));
    const paced = pace && timeline.speed <= 10 ? { ...pace, busy: (pace.busy ?? 0) * timeline.speed } : null;
    const result = choreograph(prev, next, placement, view(), { waits: scaled, pace: paced });
    placement = result.placement;
    state = next;
    const start = now();
    for (const m of result.motions) {
      const mesh = meshes[m.id];
      const reveal = m.reveal;
      timeline.add(
        {
          target: m.id,
          path: m.path,
          delay: m.delay,
          duration: m.duration,
          onStart: reveal && !reveal.atEnd ? () => deck.reveal(mesh, reveal.code) : undefined,
          onDone: reveal && reveal.atEnd ? () => deck.reveal(mesh, reveal.code) : undefined,
        },
        start,
      );
    }
    // Cards lit a while, on the same clock: drawn again as they light and
    // as they go back.
    for (const mark of result.marks ?? []) {
      const light = (line) => () => {
        for (const id of mark.ids) deck.decorate(meshes[id], { line });
        moving = true;
        wake();
      };
      schedule({ at: start + mark.at / timeline.speed, gate: false, fn: light("hint") });
      schedule({ at: start + mark.until / timeline.speed, gate: false, fn: light("plain") });
    }
    const beats = {};
    for (const [k, ms] of Object.entries(result.beats)) beats[k] = ms / timeline.speed;
    const landed = {}; // optional: when an event's cards come to rest (Strohmandeln: the tally moves then)
    for (const [k, ms] of Object.entries(result.landed ?? {})) landed[k] = ms / timeline.speed;
    const count = result.count ? { at: result.count.at, lines: result.count.lines.map((ms) => ms / timeline.speed), end: result.count.end / timeline.speed } : null;
    // Once the cards are still: dressed, drawn once more, and the page told
    // -- once, and only for the latest animation (an earlier one's idle,
    // resolved by the skip that began this one, is stale: the table
    // review's T7 and T8).
    const token = ++animations;
    timeline.idle().then(() => {
      if (token !== animations) return;
      dress();
      rested?.();
      moving = true;
      wake();
    });
    dress();
    moving = true;
    if (manual) frame();
    else wake();
    return { beats, landed, count };
  }

  // ---- picking ------------------------------------------------------------

  const raycaster = new Raycaster();
  const pointer = new Vector2();
  // The card under a point on the canvas, as its place at the table.
  function pick(clientX, clientY) {
    const rect = stage.renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, stage.camera);
    const [hit] = raycaster.intersectObjects(meshes, false);
    // By id, not by position: a placement is not kept in mesh order.
    return hit ? placement.find((m) => m.id === hit.object.userData.id) ?? null : null;
  }

  // Where a point of the table is on the screen.
  function toScreen(p) {
    const q = p.clone().project(stage.camera);
    const rect = stage.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((q.x + 1) / 2) * rect.width, y: rect.top + ((1 - q.y) / 2) * rect.height };
  }

  // Where on the screen to point at a card so that it is the one hit: near
  // the index corner for a card in a fanned hand; on the table, the middle of
  // its far half, clear of a hand card standing up in front of it.
  function screenPoint(code) {
    const m = placement.find((x) => x.code === code);
    if (!m) return null;
    const mesh = meshes[m.id];
    const local = m.zone === "your-hand" ? new Vector3(-CARD.width / 2 + 0.8, CARD.height / 2 - 1.4, CARD.thickness / 2) : new Vector3(0, CARD.height / 4, CARD.thickness / 2);
    return toScreen(local.applyQuaternion(mesh.quaternion).add(mesh.position));
  }

  // Where to speak from, on the screen: just above your hand's top edge, or
  // just below your opponent's lowest, near the middle of the table where
  // the eye already is (after piquet's director.js). From where the hand
  // rests once the cards have moved (a line can be said before a dealt
  // hand arrives); with no cards in it, from where the hand would be.
  function handEdge(who) {
    const zone = who === "you" ? "your-hand" : "their-hand";
    const points = placement
      .filter((m) => m.zone === zone)
      .flatMap((m) => cardCorners(m.pose).map(toScreen));
    if (!points.length) {
      const where = view().zones ?? zones;
      if (!where) throw new Error("handEdge of an empty hand needs the game's zones: pass `zones` to createDirector or set view().zones");
      const centre = where[who === "you" ? "yourHand" : "theirHand"].centre; // T17
      return { ...toScreen(new Vector3(...centre)), empty: true };
    }
    const x = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const y = who === "you" ? Math.min(...points.map((p) => p.y)) : Math.max(...points.map((p) => p.y));
    return { x, y };
  }

  return {
    handEdge,
    // Where a point of the scene is on the screen, in CSS pixels.
    screenOf: (point) => toScreen(new Vector3(...point)),
    state: () => state,
    placement: () => placement,
    meshOf: (code) => {
      const m = placement.find((x) => x.code === code);
      return m ? meshes[m.id] : null;
    },
    busy: () => timeline.busy(),
    // The animation's speed, for what moves from now on.
    setSpeed(v) {
      timeline.speed = v;
    },
    idle: () => timeline.idle(),
    // Straight onto the table: a new game, a sitting restored. With
    // `dealt`, from the pack squared at the dealer's left, and the opening
    // deal played out.
    // `waits` (ms of the clock, by event index) holds events back.
    restart(s, { dealt = false, waits = {} } = {}) {
      queue.length = 0;
      release();
      if (!dealt) {
        settle(s);
        return { beats: {}, count: null };
      }
      const start = opening(s);
      settle(start);
      return animate(start, s, waits);
    },
    // The opening's moments on paper, in ms: what restart(s, { dealt: true })
    // would give, without playing it (for the length of the opening's talk).
    preview(s) {
      const start = opening(s);
      const { beats } = choreograph(start, s, initialPlacement(start, view()), view());
      return Object.fromEntries(Object.entries(beats).map(([k, ms]) => [k, ms / timeline.speed]));
    },
    // The same state laid out afresh, at once (the phone turned, the
    // zones changed), keeping what is timed to the moves.
    relayout() {
      settle(state);
    },
    // A change of state played again (the last move seen again): the cards
    // from `before`, keeping what is timed (the HUD's popups still playing:
    // the table's second review, S1).
    again(before, after) {
      settle(before);
      return animate(before, after);
    },
    // The next state, animated from this one; `pace`, the count's, if any.
    advance(next, { pace = null } = {}) {
      return animate(state, next, {}, pace);
    },
    // The same state seen differently: a card chosen, table cards picked.
    rearrange() {
      if (timeline.busy()) {
        dress();
        return;
      }
      animate(state, state);
    },
    redecorate() {
      dress();
      stage.render();
    },
    // Hold the table at `ms` from now on its clock: the cards stop, and
    // `open(release)` is called; they carry on when it calls release.
    gate(ms, open) {
      schedule({ at: now() + ms, gate: true, fn: open });
    },
    // Run `fn` at `ms` from now on the table's clock, which a gate stops.
    // `kind`: "hard" (what is timed to the moves: the score, the count),
    // "talk" (a line still to be said, which a skip drops) or "linger" (a box
    // coming down, which a skip leaves to its time).
    at(ms, fn, kind = "hard") {
      schedule({ at: now() + ms, gate: false, fn, kind });
    },
    // Forget what is queued of a kind (talk about moves already past).
    drop(kind) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === kind) queue.splice(i, 1);
    },
    held: () => heldAt !== null,
    // Whether a gate is waiting its moment (a tutorial page about to open).
    gatePending: () => queue.some((e) => e.gate),
    clock: () => now(),
    // What was timed to the moves is over: an undo, a new game.
    cancelTimed() {
      queue.length = 0;
      release();
    },
    // The cards landed at once, and what is timed to the moves comes now;
    // a line not yet said is dropped, and a box said comes down in its own
    // time (the table review's T4: a skip took every box down at once).
    skip() {
      timeline.skip();
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].kind === "talk") queue.splice(i, 1);
      // Only what is timed to the moves runs now: talk queued during the
      // skip waits its moment (the table's second review, S7).
      while (heldAt === null) {
        const k = queue.findIndex((e) => e.gate || e.kind === "hard");
        if (k < 0) break;
        const [entry] = queue.splice(k, 1);
        if (entry.gate) {
          heldAt = now();
          stage.render();
          entry.fn(release);
          break;
        }
        entry.fn();
      }
      dress();
      moving = true;
      wake();
    },
    // For stills: move the hand-driven clock and draw.
    tick(ms) {
      manualNow += ms;
      frame();
    },
    pick,
    screenPoint,
    toScreen,
    meshes,
    timeline,
  };
}
