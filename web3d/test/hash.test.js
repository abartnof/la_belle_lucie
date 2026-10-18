import assert from "node:assert/strict";
import { test } from "node:test";
import { hashFor, parseHash } from "../src/hash.js";

const P = (h) => parseHash(h);

test("a valid hash gives seed and rules", () => {
  assert.deepEqual(P("#seed=12&rules=4"), { seed: 12, rules: 4, badSeed: null });
  assert.deepEqual(P("seed=0&rules=63"), { seed: 0, rules: 63, badSeed: null });
  assert.deepEqual(P("#seed=4294967295&rules=0"), { seed: 4294967295, rules: 0, badSeed: null });
});
test("empty or unrelated hashes give nothing", () => {
  assert.deepEqual(P(""), { seed: null, rules: null, badSeed: null });
  assert.deepEqual(P("#"), { seed: null, rules: null, badSeed: null });
  assert.deepEqual(P("#section-2"), { seed: null, rules: null, badSeed: null });
  assert.deepEqual(P(undefined), { seed: null, rules: null, badSeed: null });
});
test("a repeated key: the first wins", () => {
  assert.equal(P("#seed=1&seed=2").seed, 1);
  assert.equal(P("#rules=4&rules=16").rules, 4);
});
test("out of range, negative, non-numeric and huge values are refused, and a bad seed is remembered", () => {
  assert.equal(P("#seed=4294967296").seed, null);
  assert.equal(P("#seed=4294967296").badSeed, "4294967296");
  assert.equal(P("#seed=-1").seed, null);
  assert.equal(P("#seed=abc").badSeed, "abc");
  assert.equal(P("#seed=1.5").seed, null);
  assert.equal(P("#seed=99999999999999999999").seed, null);
  assert.equal(P("#seed=").badSeed, null);
  assert.equal(P("#rules=64").rules, null);
  assert.equal(P("#rules=-4").rules, null);
  assert.equal(P("#rules=x").rules, null);
  assert.equal(P("#rules=").rules, null);
  assert.equal(P("#rules=99999999999").rules, null);
});
test("hashFor round trips", () => {
  assert.deepEqual(P(hashFor(7, 37)), { seed: 7, rules: 37, badSeed: null });
});
