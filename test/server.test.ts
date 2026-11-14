import assert from "node:assert/strict";
import { test } from "node:test";
import { RuleError } from "../src/engine/index.js";
import { loadMap } from "../src/node/loadMap.js";
import { QuantumSource } from "../src/quantum/index.js";
import type { GameView } from "../src/server/protocol.js";
import { Room } from "../src/server/room.js";

const map = loadMap();
const source = () => new QuantumSource({ providers: [] }); // local crypto only

function room(kinds: ("local" | "open" | "bot")[] = ["local", "open", "local"]) {
  return new Room("test", "missions", kinds.map((kind) => ({ kind, name: "" })), map, source());
}

test("views hide other players' cards, missions and Quantum cards", () => {
  const r = room();
  const v = r.view(new Set([0]));
  assert.ok(v.players[0]!.mission);
  assert.ok(Array.isArray(v.players[0]!.cards));
  for (const p of v.players.slice(1)) {
    assert.equal(p.mission, undefined);
    assert.equal(p.cards, undefined);
    assert.equal(p.quantumCards, undefined);
  }
  const spectator = r.view(new Set());
  assert.ok(spectator.players.every((p) => p.mission === undefined));
  // Log: a trade by someone else hides the drawn Quantum card.
  r.game.log.push({ type: "trade", player: 1, troops: 4, ownedSectorBonus: 0, quantumCard: "extraSplit" });
  const e = r.view(new Set([0])).log.at(-1)!;
  assert.equal(e.type === "trade" && e.quantumCard, null);
  const own = r.view(new Set([1])).log.at(-1)!;
  assert.equal(own.type === "trade" && own.quantumCard, "extraSplit");
});

test("seats, tokens and open seats", () => {
  const r = room();
  const tokens = r.localTokens(["local", "open", "local"]);
  assert.deepEqual(Object.keys(tokens).map(Number), [0, 2]);
  assert.deepEqual(r.seatsForTokens([tokens[2]!]), [2]);
  assert.equal(r.view(new Set()).players[1]!.open, true);
  assert.equal(r.claimOpenSeat("Ada"), 1);
  assert.equal(r.claimOpenSeat("Bob"), null);
  assert.equal(r.view(new Set()).players[1]!.name, "Ada");
});

test("only the current seat may act, and illegal moves are rejected", async () => {
  const r = room(["local", "local"]);
  const g = r.game;
  const other = (g.current + 1) % 2;
  await assert.rejects(r.act(other, { type: "endPhase" }), RuleError);
  await assert.rejects(r.act(g.current, { type: "setupPlace", placements: { "Core 0": 99 } }), RuleError);
});

test("a full game can be played through the room", async () => {
  const r = room(["local", "local"]);
  const g = r.game;
  let last: GameView | null = null;
  r.listeners.add({ seats: new Set([0, 1]), send: (v) => (last = v) });
  for (let i = 0; i < 5000 && !g.isOver; i++) {
    const p = g.current;
    const mine = g.ownedSectors(p);
    if (g.phase === "setup") await r.act(p, { type: "setupPlace", placements: { [mine[0]!]: Math.min(3, g.setupRemaining[p]!) } });
    else if (g.phase === "reinforce") {
      const sets = g.findSets(p);
      if (g.players[p]!.cards.length >= 5) await r.act(p, { type: "trade", indices: sets[0] as [number, number, number] });
      else if (g.reinforcementsLeft > 0) await r.act(p, { type: "place", placements: { [mine[0]!]: g.reinforcementsLeft } });
      else await r.act(p, { type: "endPhase" });
    } else if (g.phase === "quantum") await r.act(p, { type: "endPhase" });
    else {
      // Attack the weakest adjacent enemy from the strongest sector, else end the turn.
      const from = mine.reduce((a, b) => (g.troops(a) >= g.troops(b) ? a : b));
      const to = g.neighbors(from).filter((n) => g.owner(n) !== p).sort((a, b) => g.troops(a) - g.troops(b))[0];
      if (g.phase === "attack" && to && g.troops(from) - 1 >= g.minCommit(to) && g.troops(from) - 1 > g.troops(to) + 1)
        await r.act(p, { type: "attack", from, to, committed: g.troops(from) - 1, moveExtra: 0 });
      else await r.act(p, { type: "endTurn" });
    }
  }
  assert.ok(g.isOver, "game finished");
  assert.equal(last!.phase, "gameOver");
  assert.ok(last!.players.every((p) => p.mission !== undefined), "missions revealed at the end");
  r.stop();
});
