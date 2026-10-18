// La Belle Lucie in the browser.
//
// A client of the wasm module (docs/PROTOCOL.md): it draws `state` and sends
// commands back, and holds no rules. What may be played is `state.legal`.
//
// This is the placeholder page: text and buttons, to prove the loop from the
// seed through the engine to the page. The kit has the three.js table
// (kit/js/scene.js, deck.js, director.js, kinematics.js); a real game wires
// them up here with a choreography.js of its own. Cassino's web3d/src/main.js
// is the reference for how.

import { decodeBase64 } from "../../kit/js/engine.js";
import { loadEngine } from "./engine.js";

export function render(root, state, send) {
  root.replaceChildren();
  const hand = document.createElement("div");
  hand.className = "hand";
  for (const code of state.hand) {
    const card = document.createElement("span");
    card.className = "card" + (/[HD]$/.test(code) ? " red" : "");
    card.textContent = code;
    hand.append(card);
  }
  const draw = document.createElement("button");
  draw.textContent = `Draw (${state.stock} left)`;
  draw.disabled = !state.legal.includes("draw");
  draw.onclick = () => send("draw");
  const again = document.createElement("button");
  again.textContent = "New game";
  again.onclick = () => send("new");
  root.append(hand, draw, again);
}

async function main() {
  const root = document.getElementById("app");
  const engine = await loadEngine(decodeBase64(WASM_BASE64), () => {
    root.textContent = "The table has stopped. Reload the page.";
  });
  const seedOf = () => Math.floor(Math.random() * 2 ** 32);
  let state = engine.new({ seed: seedOf() });
  const send = (command) => {
    state = command === "new" ? engine.new({ seed: seedOf() }) : engine.send(command).state;
    render(root, state, send);
  };
  render(root, state, send);
}

if (typeof document !== "undefined" && typeof WASM_BASE64 !== "undefined") main();
