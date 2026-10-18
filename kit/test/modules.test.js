// Every module of the kit loads: its relative imports all resolve inside the
// kit (nothing reaches for a cassino file the kit left out), and its bare
// `three` resolves through kit/node_modules -> ../web3d/node_modules (the
// problem RC reproduced with submodules, kit/README.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

const files = readdirSync(new URL("../js/", import.meta.url)).filter((f) => f.endsWith(".js"));

test("the kit has its modules", () => {
  assert.ok(files.length >= 17, files.join(" "));
});

for (const file of files) {
  test(`kit/js/${file} loads`, async () => {
    const module = await import(`../js/${file}`);
    assert.ok(Object.keys(module).length > 0, "it exports something");
  });
}

test("no kit module imports a file the kit lacks, or reaches outside it", async () => {
  const { readFileSync } = await import("node:fs");
  for (const file of files) {
    const text = readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8");
    for (const [, from] of text.matchAll(/^(?:import|export)[^;]*?from\s+"(\.[^"]+)"/gm)) {
      assert.ok(from.startsWith("./") && files.includes(from.slice(2)), `${file} imports ${from}`);
    }
  }
});
