import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, NEUTRAL, RuleError, makeConfig, mulberry32, setKind, type GameConfig, type RandomSource } from "../src/engine/index.js";
import { loadMap } from "../src/node/loadMap.js";

const map = loadMap();

/** Random source whose measurement results are scripted. */
function scripted(results: (0 | 1)[] = [], seed = 1): RandomSource {
  const rng = mulberry32(seed);
  return {
    rng,
    measure: () => {
      const r = results.shift();
      if (r === undefined) throw new Error("No scripted measurement left");
      return r;
    },
    measurementSource: "test",
  };
}

/** A game past setup where player 0 owns `mine`, player 1 owns everything else, with given troops. */
function arena(mine: Record<string, number>, theirs: Record<string, number> = {}, measurements: (0 | 1)[] = [], cfg: Partial<GameConfig> = {}) {
  const g = new Game(makeConfig(2, { mode: "domination", startingTroops: { 2: 8 }, seatBonus: { 2: [0, 0] }, ...cfg }), map, scripted(measurements));
  assert.equal(g.phase, "reinforce");
  for (const s of map.sectors) g.sectors.set(s, { owner: 1, troops: theirs[s] ?? 1 });
  for (const [s, n] of Object.entries(mine)) g.sectors.set(s, { owner: 0, troops: n });
  g.reinforcementsLeft = 0;
  g.endPhase(); // -> quantum
  return g;
}

test("map: 24 sectors, 37 connections, 3 strongholds", () => {
  assert.equal(map.sectors.length, 24);
  assert.equal(map.def.connections.length, 37);
  assert.deepEqual([...map.strongholds].sort(), ["Memory Controller", "PCIe x16", "VRM"]);
  assert.equal(map.bonus.get("Power"), 3);
});

test("setup: dealing and starting troops", () => {
  for (const n of [2, 3, 4] as const) {
    const g = new Game(makeConfig(n), map, scripted());
    const per = n === 2 ? 8 : 24 / n;
    for (let p = 0; p < n; p++) assert.equal(g.ownedSectors(p).length, per);
    if (n === 2) {
      assert.equal(g.ownedSectors(NEUTRAL).length, 8);
      assert.ok(g.ownedSectors(NEUTRAL).every((s) => g.troops(s) === 2));
    }
    assert.equal(g.setupRemaining[0], g.config.startingTroops[n]! - per);
    if (n === 2) assert.equal(g.setupRemaining[1], g.config.startingTroops[n]! + 2 - per);
    if (n === 3) assert.equal(g.setupRemaining[2], g.config.startingTroops[n]! + 2 - per);
  }
});

test("setup placement rotates in chunks of 3, then turn 1 starts", () => {
  const g = new Game(makeConfig(3, { seatBonus: { 3: [0, 0, 0] } }), map, scripted());
  while (g.phase === "setup") {
    const p = g.current;
    const s = g.ownedSectors(p)[0]!;
    g.setupPlace({ [s]: Math.min(3, g.setupRemaining[p]!) });
  }
  assert.equal(g.phase, "reinforce");
  assert.equal(g.current, 0);
  assert.equal(g.round, 1);
  const total = g.ownedSectors(0).reduce((a, s) => a + g.troops(s), 0);
  assert.equal(total, 20);
});

test("combat: attacker wins with N > D, loses D, moves N - D in", () => {
  const g = arena({ "Core 0": 9 }, { "Core 1": 5 });
  g.endPhase();
  const r = g.attack("Core 0", "Core 1", 8);
  assert.equal(r.won, true);
  assert.equal(g.owner("Core 1"), 0);
  assert.equal(g.troops("Core 1"), 3);
  assert.equal(g.troops("Core 0"), 1);
});

test("combat: ties go to the defender; defender loses N - 1", () => {
  const g = arena({ "Core 0": 6 }, { "Core 1": 5 });
  g.endPhase();
  const r = g.attack("Core 0", "Core 1", 5);
  assert.equal(r.won, false);
  assert.equal(g.troops("Core 0"), 1);
  assert.equal(g.troops("Core 1"), 1);
});

test("combat: stronghold counts +1, defender never loses its last troop", () => {
  const g = arena({ "Core 0": 10 }, { VRM: 6 });
  g.endPhase();
  const r = g.attack("Core 0", "VRM", 7);
  assert.equal(r.won, false);
  assert.equal(r.effectiveDefence, 7);
  assert.equal(g.troops("VRM"), 1); // 6 - (7 - 2)
  const g3 = arena({ "Core 0": 10 }, { VRM: 6 });
  g3.endPhase();
  g3.attack("Core 0", "VRM", 5);
  assert.equal(g3.troops("VRM"), 3); // 6 - (5 - 2)
  const g2 = arena({ "Core 0": 10 }, { VRM: 6 });
  g2.endPhase();
  const r2 = g2.attack("Core 0", "VRM", 8);
  assert.equal(r2.won, true);
  assert.equal(g2.troops("VRM"), 1);
});

test("combat: minimum attack and source must keep 1", () => {
  const g = arena({ "Core 0": 10 }, { "Core 1": 1 });
  g.endPhase();
  assert.throws(() => g.attack("Core 0", "Core 1", 2), RuleError);
  assert.throws(() => g.attack("Core 0", "Core 1", 10), RuleError);
  assert.throws(() => g.attack("Core 0", "NAND", 5), RuleError); // not adjacent
});

test("split: needs an owned chain, keeps 1 real troop, max one branch per sector", () => {
  const g = arena({ "Core 0": 10, "Core 1": 1, "Core 2": 1, "Core 3": 1 });
  assert.throws(() => g.split("Core 0", 5, "Core 1", "Core 2"), RuleError); // not in Quantum phase any more
  g.endPhase(); // -> attack; splitting moves on to Fortify
  assert.throws(() => g.split("Core 0", 10, "Core 1", "Core 2"), RuleError);
  assert.throws(() => g.split("Core 0", 5, "Core 1", "NAND"), RuleError);
  const st = g.split("Core 0", 6, "Core 1", "Core 2");
  assert.equal(g.troops("Core 0"), 4);
  assert.equal(st.size, 6);
  assert.equal(g.phase, "fortify");
  assert.throws(() => g.split("Core 0", 1, "Core 3", "Core 0"), RuleError); // 1 split per turn
});

test("measurement by attack: stack present -> defends; absent -> collapses elsewhere", () => {
  // Player 1 owns everything except Core 0; player 1's stack sits on Core 1 / Core 3.
  for (const [result, expectWin] of [[0, false], [1, true]] as const) {
    const g = new Game(makeConfig(2, { mode: "domination", startingTroops: { 2: 8 }, seatBonus: { 2: [0, 0] } }), map, scripted([result]));
    for (const s of map.sectors) g.sectors.set(s, { owner: 1, troops: 2 });
    g.sectors.set("Core 0", { owner: 0, troops: 12 });
    g.stacks.push({ id: 99, owner: 1, size: 7, branches: ["Core 1", "Core 3"] });
    g.reinforcementsLeft = 0;
    g.endPhase();
    g.endPhase();
    // Probe rule: must commit at least the stack size.
    assert.throws(() => g.attack("Core 0", "Core 1", 5), /at least 7/);
    const r = g.attack("Core 0", "Core 1", 8);
    assert.equal(r.won, expectWin);
    assert.equal(g.stacks.length, 0);
    if (result === 1) assert.equal(g.troops("Core 3"), 9);
    else assert.equal(r.defenders, 9);
  }
});

test("self-measure and forced measurement", () => {
  const g = arena({ "Core 0": 10, "Core 1": 1, "Core 2": 1 }, {}, [1, 0]);
  const st = { id: 7, owner: 0, size: 5, branches: ["Core 1", "Core 2"] as [string, string] };
  g.stacks.push(st);
  const m = g.selfMeasure(st.id);
  assert.throws(() => g.selfMeasure(st.id), RuleError); // once per turn
  assert.equal(m.sector, "Core 2");
  assert.equal(m.source, "test");
  assert.equal(g.troops("Core 2"), 6);
  assert.deepEqual(g.log.at(-1), { type: "measure", stack: 7, owner: 0, cause: "selfMeasure", result: 1, sector: "Core 2", size: 5, source: "test" });

  g.stacks.push({ id: 50, owner: 1, size: 4, branches: ["NAND", "DRAM Cache"] });
  assert.throws(() => g.playForcedMeasurement(50), RuleError); // no card
  g.players[0]!.quantumCards.push("forcedMeasurement");
  const fm = g.playForcedMeasurement(50);
  assert.equal(fm.sector, "NAND");
});

test("cards: set kinds, owned-sector bonus, escalation", () => {
  assert.equal(setKind([{ sector: null, particle: "proton" }, { sector: null, particle: "neutron" }, { sector: null, particle: "electron" }]), "fullAtom");
  assert.equal(setKind([{ sector: null, particle: "proton" }, { sector: null, particle: "proton" }, { sector: null, particle: "photon" }]), "threeOfAKind");
  assert.equal(setKind([{ sector: null, particle: "proton" }, { sector: null, particle: "proton" }, { sector: null, particle: "neutron" }]), null);

  const g = new Game(makeConfig(2, { mode: "domination", startingTroops: { 2: 8 }, seatBonus: { 2: [0, 0] } }), map, scripted());
  g.sectors.set("Core 0", { owner: 0, troops: 1 });
  g.sectors.set("Core 1", { owner: 0, troops: 1 });
  g.players[0]!.cards = [
    { sector: "Core 0", particle: "proton" },
    { sector: "Core 1", particle: "neutron" },
    { sector: "NAND", particle: "electron" },
  ];
  if (g.owner("NAND") === 0) g.sectors.set("NAND", { owner: 1, troops: 1 });
  const before = g.reinforcementsLeft;
  const total = g.tradeSet([0, 1, 2]);
  assert.equal(total, 6 + 4);
  assert.equal(g.reinforcementsLeft, before + 6);
  assert.equal(g.troops("Core 0"), 3);

  const esc = new Game(makeConfig(2, { escalation: [4, 6, 8] }), map, scripted());
  const cards = [{ sector: null, particle: "proton" as const }, { sector: null, particle: "neutron" as const }, { sector: null, particle: "electron" as const }];
  esc.setsTraded = 4;
  assert.equal(esc.setValue(cards), 18);
});

test("missions: cluster pair completes and wins immediately", () => {
  const g = arena({ "Core 0": 9 }, {}, [], { mode: "missions" });
  g.players[1]!.mission = { kind: "sectors", count: 99 };
  g.players[0]!.mission = { kind: "clusters", clusters: ["SSD", "Power"] };
  for (const s of [...map.clusterSectors.get("SSD")!, ...map.clusterSectors.get("Power")!]) g.sectors.set(s, { owner: 0, troops: 1 });
  g.sectors.set("VRM", { owner: 1, troops: 1 });
  g.endPhase();
  g.attack("Core 0", "VRM", 5);
  assert.equal(g.winner, 0);
  assert.equal(g.phase, "gameOver");
});

test("missions: rival eliminated by someone else turns into expansion", () => {
  const g = new Game(makeConfig(3, { startingTroops: { 3: 8 }, seatBonus: { 3: [0, 0, 0] } }), map, scripted());
  g.players[2]!.mission = { kind: "rival", target: 1 };
  for (const s of map.sectors) g.sectors.set(s, { owner: 0, troops: 1 });
  g.sectors.set("Core 1", { owner: 1, troops: 1 });
  g.sectors.set("Core 0", { owner: 0, troops: 9 });
  g.players[0]!.mission = { kind: "sectors", count: 99 };
  g.reinforcementsLeft = 0;
  g.players[0]!.cards = [];
  g.endPhase();
  g.endPhase();
  const r = g.attack("Core 0", "Core 1", 5);
  assert.equal(r.eliminated, 1);
  assert.deepEqual(g.players[2]!.mission, { kind: "sectors", count: 16 });
});

test("fortify along owned chains only", () => {
  const g = arena({ "Core 0": 5, "Core 1": 1, "Core 3": 1 });
  g.endPhase();
  g.fortify("Core 0", "Core 3", 4);
  assert.equal(g.troops("Core 3"), 5);
  assert.throws(() => g.fortify("Core 3", "NAND", 1), RuleError);
});
