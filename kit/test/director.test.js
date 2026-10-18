// The director as the kit has it: the choreography, the zones and the number
// of cards are the game's, handed in. Stage, deck and choreography are
// doubles; the clock is the director's own manual one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { createDirector } from "../js/director.js";

function setup({ cards = 4, zones = null, view = {}, defaultCards = false } = {}) {
  const log = { renders: 0, reveals: [], choreographed: [], opened: [] };
  const camera = new PerspectiveCamera(30, 1, 1, 1000);
  camera.position.set(0, 100, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const stage = {
    render: () => log.renders++,
    camera,
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }) } },
  };
  const deck = {
    card: () => ({ position: new Vector3(), quaternion: new Quaternion(), userData: {} }),
    reveal: (mesh, code) => log.reveals.push(code),
    decorate: () => {},
  };
  const placed = (state) =>
    state.cards.map((code, id) => ({ id, code, zone: "your-hand", pose: { position: new Vector3(id, 0, 0), quaternion: new Quaternion() } }));
  const choreography = {
    opening: (s) => {
      log.opened.push(s);
      return { cards: [] };
    },
    initialPlacement: (state) => placed(state),
    choreograph: (prev, next, placement) => {
      log.choreographed.push([prev, next]);
      return {
        placement: placed(next),
        motions: next.cards.map((code, id) => ({ id, delay: 0, duration: 100, path: () => ({ position: new Vector3(9, 9, 9), quaternion: new Quaternion() }) })),
        beats: { 0: 40 },
        ...(next.landed ? { landed: { 0: 400 } } : {}),
      };
    },
  };
  const director = createDirector({ stage, deck, view: () => view, choreography, zones, ...(defaultCards ? {} : { cards }), manual: true });
  return { director, log };
}

test("it holds as many meshes as the game says", () => {
  assert.equal(setup({ cards: 4 }).director.meshes.length, 4);
  assert.equal(setup({ cards: 54 }).director.meshes.length, 54);
});

test("without a count it holds 52, cassino's pack", () => {
  const { director } = setup({ defaultCards: true });
  assert.equal(director.meshes.length, 52);
});

test("restart lays the game's placement on the meshes and draws once", () => {
  const { director, log } = setup();
  director.restart({ cards: ["AS", "KH"] });
  assert.deepEqual(log.reveals, ["AS", "KH"]);
  assert.equal(director.meshes[1].position.x, 1);
  assert.equal(director.placement().length, 2);
  assert.ok(log.renders >= 1);
});

test("advance hands the old and new state to the game's choreograph, and plays its motions", () => {
  const { director, log } = setup();
  director.restart({ cards: ["AS"] });
  const next = { cards: ["AS", "2C"] };
  const { beats } = director.advance(next);
  assert.equal(log.choreographed.length, 1);
  assert.equal(log.choreographed[0][1], next);
  assert.deepEqual(beats, { 0: 40 });
  director.tick(1000);
  assert.equal(director.meshes[0].position.x, 9, "the motion landed");
  assert.equal(director.state(), next);
});

test("a choreography may also say when an event's cards have landed; advance hands it back on the table's clock", () => {
  const { director } = setup();
  director.restart({ cards: ["AS"] });
  assert.deepEqual(director.advance({ cards: ["AS", "2C"] }).landed, {}, "none unless the game gives them");
  const { landed } = director.advance({ cards: ["AS", "2C", "3C"], landed: true });
  assert.deepEqual(landed, { 0: 400 });
});

test("a dealt restart asks the game for its opening", () => {
  const { director, log } = setup();
  director.restart({ cards: ["AS"] }, { dealt: true });
  assert.equal(log.opened.length, 1);
});

test("handEdge of an empty hand falls back on the game's zones, or the view's", () => {
  const zones = { yourHand: { centre: [0, 0, 0] }, theirHand: { centre: [0, 0, 0] } };
  const { director } = setup({ zones });
  director.restart({ cards: [] });
  const edge = director.handEdge("you");
  assert.equal(edge.empty, true);
  assert.ok(Number.isFinite(edge.x) && Number.isFinite(edge.y));
  const viewZones = { yourHand: { centre: [5, 0, 0] }, theirHand: { centre: [0, 0, 0] } };
  const other = setup({ zones, view: { zones: viewZones } });
  other.director.restart({ cards: [] });
  assert.notEqual(other.director.handEdge("you").x, edge.x, "view().zones wins");
});

test("a choreography missing a function is refused at construction, naming it", () => {
  const stage = { render() {}, camera: new PerspectiveCamera(30, 1, 1, 1000), renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }) } } };
  const deck = { card: () => ({ position: new Vector3(), quaternion: new Quaternion(), userData: {} }), reveal() {}, decorate() {} };
  const ok = { choreograph() {}, initialPlacement() {}, opening() {} };
  const make = (choreography) => () => createDirector({ stage, deck, view: () => ({}), choreography, manual: true });
  assert.throws(make(undefined), /choreography\.choreograph/);
  assert.throws(make({ ...ok, opening: null }), /choreography\.opening/);
  assert.doesNotThrow(make(ok));
});

test("handEdge of an empty hand with no zones anywhere says what is missing", () => {
  const { director } = setup();
  director.restart({ cards: [] });
  assert.throws(() => director.handEdge("you"), /zones/);
});
