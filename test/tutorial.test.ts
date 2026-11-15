/**
 * The tutorial (web/src/tutorial) scripts specific moves on hand-built positions. Replay that script
 * on the real engine, so a rules or map change can't silently break the tutorial.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { loadMap } from "../src/node/loadMap.js";
import { applyAction } from "../src/server/view.js";
import { makeScenarios, RIVAL, YOU } from "../web/src/tutorial/scenarios.js";

const scenarios = makeScenarios(loadMap());

test("tutorial chapter 3: setup, reinforce, attack, fortify", () => {
  const g = scenarios.first();
  assert.equal(g.phase, "setup");
  applyAction(g, { type: "setupPlace", placements: { "Core 3": 3 } });
  assert.equal(g.phase, "reinforce");
  assert.equal(g.reinforcementsLeft, 5, "8 sectors (3) + SSD bonus (2), as the text says");
  applyAction(g, { type: "place", placements: { "Core 3": 5 } });
  applyAction(g, { type: "endPhase" });
  applyAction(g, { type: "endPhase" });
  applyAction(g, { type: "attack", from: "Core 3", to: "Core 2", committed: 3, moveExtra: 0 });
  assert.equal(g.owner("Core 2"), YOU);
  assert.equal(g.troops("Memory Controller"), 3, "the Stronghold lesson describes 3 troops");
  applyAction(g, { type: "endPhase" });
  applyAction(g, { type: "fortify", from: "Core 0", to: "Core 2", n: 1 });
  applyAction(g, { type: "endTurn" });
  assert.equal(g.players[YOU]!.cards.length, 1, "a conquest earns a card");
  assert.equal(g.isOver, false);
});

test("tutorial chapter 4: trading a full atom", () => {
  const g = scenarios.cards();
  assert.equal(g.phase, "reinforce");
  const before = g.reinforcementsLeft;
  applyAction(g, { type: "trade", indices: [0, 1, 2] });
  assert.equal(g.reinforcementsLeft, before + 6);
  assert.deepEqual(g.players[YOU]!.quantumCards, ["extraSplit"]);
  applyAction(g, { type: "place", placements: { "Core 2": g.reinforcementsLeft } });
  assert.equal(g.reinforcementsLeft, 0);
});

test("tutorial chapter 5: every allowed split size leads to a legal Rival attack", () => {
  for (let size = 2; size <= 5; size++) {
    for (let i = 0; i < 10; i++) {
      const g = scenarios.superposition();
      applyAction(g, { type: "split", source: "Core 3", size, branches: ["Core 1", "Root Complex"] });
      applyAction(g, { type: "endTurn" });
      assert.equal(g.current, RIVAL);
      g.place({ "PCIe x16": g.reinforcementsLeft });
      g.endPhase();
      g.endPhase();
      const r = g.attack("PCIe x16", "Root Complex", size + 2, 0);
      assert.equal(r.won, r.measurements[0]!.sector !== "Root Complex", "the tie holds only when the stack is there");
      g.endTurn();
      assert.equal(g.current, YOU);
    }
  }
});

test("tutorial chapter 6: self-measure, Forced Measurement, attack into a stack", () => {
  for (let i = 0; i < 10; i++) {
    const g = scenarios.measurement();
    applyAction(g, { type: "selfMeasure", stack: 101 });
    applyAction(g, { type: "forcedMeasurement", stack: 103 });
    applyAction(g, { type: "endPhase" });
    applyAction(g, { type: "attack", from: "Memory Controller", to: "Memory Bus", committed: 7, moveExtra: 0 });
    assert.equal(g.owner("Memory Bus"), YOU, "7 attackers win against 2 or 5, as the lesson says");
    assert.equal(g.isOver, false);
  }
});
