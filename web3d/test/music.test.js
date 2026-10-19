import { test } from "node:test";
import assert from "node:assert/strict";
import { createMusic, playlist, TRACKS } from "../src/music.js";

// A stand-in for an <audio> element: plays when allowed, and rejects like a browser before any gesture.
function fakeAudio(world) {
  const a = new EventTarget();
  Object.assign(a, { src: "", volume: 1, paused: true, plays: 0 });
  a.play = () => {
    if (world.blocked) return Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
    a.paused = false;
    a.plays++;
    return Promise.resolve();
  };
  a.pause = () => (a.paused = true);
  world.audio = a;
  return a;
}
const rig = (over = {}) => {
  const world = { blocked: false, ...over };
  const doc = new EventTarget();
  doc.visibilityState = "visible";
  const sources = Object.fromEntries(TRACKS.map((t) => [t.stem, `data:audio/mp4;base64,${t.stem}`]));
  const music = createMusic({ sources, doc, makeAudio: () => fakeAudio(world), start: 0 });
  return { world, doc, music };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

test("ten tracks, each with a title and a source stem in order", () => {
  assert.equal(TRACKS.length, 10);
  assert.deepEqual(TRACKS.map((t) => t.stem.slice(0, 2)), ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
  assert.ok(TRACKS.every((t) => t.title.length > 2));
});

test("the playlist runs from the start track round the whole soundtrack", () => {
  assert.deepEqual(playlist(4, 2), [2, 3, 0, 1]);
  assert.deepEqual(playlist(3, 0), [0, 1, 2]);
});

test("turned on, it plays the first track at a gentle volume", async () => {
  const { world, music } = rig();
  music.setOn(true);
  await tick();
  assert.equal(world.audio.paused, false);
  assert.match(world.audio.src, /01_la_verdi/);
  assert.ok(world.audio.volume > 0 && world.audio.volume <= 0.6);
  assert.equal(music.nowPlaying().title, TRACKS[0].title);
});

test("a track's end brings the next; after the last, the first again", async () => {
  const { world, music } = rig();
  music.setOn(true);
  await tick();
  world.audio.dispatchEvent(new Event("ended"));
  await tick();
  assert.match(world.audio.src, /02_ratapataplan/);
  for (let i = 0; i < 9; i++) world.audio.dispatchEvent(new Event("ended"));
  await tick();
  assert.match(world.audio.src, /01_la_verdi/);
});

test("turned off it pauses and stays quiet when a track ends", async () => {
  const { world, music } = rig();
  music.setOn(true);
  await tick();
  music.setOn(false);
  assert.equal(world.audio.paused, true);
  const before = world.audio.plays;
  world.audio.dispatchEvent(new Event("ended"));
  await tick();
  assert.equal(world.audio.plays, before);
  assert.equal(music.isOn(), false);
});

test("a browser that refuses to play before a gesture is asked again at the first one", async () => {
  const { world, doc, music } = rig({ blocked: true });
  music.setOn(true);
  await tick();
  assert.equal(world.audio.paused, true);
  assert.equal(music.isOn(), true, "still on: the setting is not lost");
  world.blocked = false;
  doc.dispatchEvent(new Event("pointerdown"));
  await tick();
  assert.equal(world.audio.paused, false);
});

test("it pauses while the page is hidden and resumes when it is shown, if on", async () => {
  const { world, doc, music } = rig();
  music.setOn(true);
  await tick();
  doc.visibilityState = "hidden";
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(world.audio.paused, true);
  doc.visibilityState = "visible";
  doc.dispatchEvent(new Event("visibilitychange"));
  await tick();
  assert.equal(world.audio.paused, false);
  music.setOn(false);
  doc.dispatchEvent(new Event("visibilitychange"));
  await tick();
  assert.equal(world.audio.paused, true);
});

test("listeners hear of a change in being on, and of the track", async () => {
  const { world, music } = rig();
  const heard = [];
  music.onChange((s) => heard.push([s.on, s.title]));
  music.setOn(true);
  await tick();
  world.audio.dispatchEvent(new Event("ended"));
  await tick();
  assert.deepEqual(heard[0], [true, TRACKS[0].title]);
  assert.deepEqual(heard.at(-1), [true, TRACKS[1].title]);
});

test("without any sources, or no audio element, it does nothing and never throws", () => {
  const music = createMusic({ sources: {}, doc: new EventTarget(), makeAudio: () => null });
  music.setOn(true);
  music.setOn(false);
  assert.equal(music.nowPlaying(), null);
});
