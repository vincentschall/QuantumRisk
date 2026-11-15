/**
 * Hand-built board states for the tutorial. Each chapter starts from a fresh Game with a fixed
 * position, so the lessons are reproducible. Measurements still use real randomness (the browser's),
 * so the text reacts to whichever branch comes up.
 */
import { Game, makeConfig, NEUTRAL, type GameMap, type Phase, type QuantumCardKind, type QuantumStack, type RandomSource, type SectorCard } from "../../../src/engine/index.js";

export const YOU = 0;
export const RIVAL = 1;

const browserRandom: RandomSource = {
  rng: Math.random,
  measure: () => ((crypto.getRandomValues(new Uint8Array(1))[0]! & 1) as 0 | 1),
  measurementSource: "tutorial",
};

type Own = Record<string, [owner: number, troops: number]>;

const POWER: Own = { "EPS 8-Pin": [NEUTRAL, 2], VRM: [NEUTRAL, 2], "ATX 24-Pin": [NEUTRAL, 2], "PCIe Power Cable": [NEUTRAL, 2] };
const SSD = (n = 1): Own => ({ "M.2 Slot": [YOU, 2], "Flash Controller": [YOU, n], NAND: [YOU, 1], "DRAM Cache": [YOU, 1] });

/** Chapters 1–3: you around the CPU and SSD, your rival in RAM and GPU, the Power cluster neutral. */
const FIRST: Own = {
  ...POWER,
  ...SSD(),
  "Core 0": [YOU, 2],
  "Core 1": [YOU, 2],
  "Core 3": [YOU, 2],
  "Root Complex": [YOU, 2],
  "Core 2": [RIVAL, 2],
  "Memory Controller": [RIVAL, 3],
  "Memory Bus": [RIVAL, 2],
  "DIMM A1": [RIVAL, 1],
  "DIMM A2": [RIVAL, 1],
  "DIMM B1": [RIVAL, 1],
  "DIMM B2": [RIVAL, 2],
  "PCIe x16": [RIVAL, 2],
  "Shader Array": [RIVAL, 2],
  VRAM: [RIVAL, 1],
  "Display Out": [RIVAL, 1],
  "Power Connector": [RIVAL, 1],
};

const RIVAL_RAM_GPU = (pcie: number): Own => ({
  "Memory Bus": [RIVAL, 2],
  "DIMM A1": [RIVAL, 2],
  "DIMM A2": [RIVAL, 1],
  "DIMM B1": [RIVAL, 1],
  "DIMM B2": [RIVAL, 2],
  "PCIe x16": [RIVAL, pcie],
  "Shader Array": [RIVAL, 2],
  VRAM: [RIVAL, 1],
  "Display Out": [RIVAL, 1],
  "Power Connector": [RIVAL, 1],
});

interface Spec {
  own: Own;
  phase: Phase;
  round?: number;
  setupRemaining?: [number, number];
  cards?: SectorCard[];
  quantumCards?: QuantumCardKind[];
  stacks?: QuantumStack[];
  quantumDeck?: QuantumCardKind[];
}

function build(MAP: GameMap, spec: Spec): Game {
  const g = new Game(makeConfig(2, { mode: "missions" }), MAP, browserRandom);
  for (const [s, [owner, troops]] of Object.entries(spec.own)) g.sectors.set(s, { owner, troops });
  if (g.sectors.size !== MAP.sectors.length || Object.keys(spec.own).length !== MAP.sectors.length) throw new Error("Tutorial scenario must cover every sector");
  for (const p of g.players) {
    p.mission = { kind: "sectors", count: 18 };
    p.cards = [];
    p.quantumCards = [];
  }
  g.players[YOU]!.cards = spec.cards ?? [];
  g.players[YOU]!.quantumCards = spec.quantumCards ?? [];
  g.stacks = spec.stacks ?? [];
  if (spec.quantumDeck) g.quantumDeck = spec.quantumDeck;
  g.setupRemaining = spec.setupRemaining ?? [0, 0];
  g.current = YOU;
  g.phase = spec.phase;
  g.round = spec.round ?? 1;
  g.reinforcementsLeft = spec.phase === "reinforce" ? g.reinforcementFor(YOU) : 0;
  g.log.length = 0;
  return g;
}

export const makeScenarios = (MAP: GameMap) => ({
  /** Setup: three troops left to place, then the first turn begins. */
  first: () => build(MAP, { own: FIRST, phase: "setup", round: 0, setupRemaining: [3, 0] }),
  /** A later turn: four sector cards in hand. */
  cards: () =>
    build(MAP, {
      own: { ...FIRST, "Core 2": [YOU, 3] },
      phase: "reinforce",
      round: 3,
      cards: [
        { particle: "proton", sector: "Core 0" },
        { particle: "neutron", sector: "Root Complex" },
        { particle: "electron", sector: "DIMM A1" },
        { particle: "photon", sector: null },
      ],
      quantumDeck: ["extraSplit", "extraSplit", "extraSplit"],
    }),
  /** Fortify phase with a big army on Core 3, ready to split. */
  superposition: () =>
    build(MAP, {
      own: { ...POWER, ...SSD(), ...RIVAL_RAM_GPU(8), "Core 0": [YOU, 2], "Core 1": [YOU, 2], "Core 2": [YOU, 2], "Core 3": [YOU, 8], "Root Complex": [YOU, 2], "Memory Controller": [YOU, 4] },
      phase: "fortify",
      round: 4,
    }),
  /** Quantum phase: your stack, two rival stacks and a Forced Measurement card. */
  measurement: () =>
    build(MAP, {
      own: { ...POWER, ...SSD(), ...RIVAL_RAM_GPU(3), "Core 0": [YOU, 2], "Core 1": [YOU, 2], "Core 2": [YOU, 2], "Core 3": [YOU, 4], "Root Complex": [YOU, 2], "Memory Controller": [YOU, 8] },
      phase: "quantum",
      round: 5,
      quantumCards: ["forcedMeasurement"],
      stacks: [
        { id: 101, owner: YOU, size: 4, branches: ["Core 1", "Root Complex"] },
        { id: 102, owner: RIVAL, size: 3, branches: ["Memory Bus", "DIMM A1"] },
        { id: 103, owner: RIVAL, size: 4, branches: ["PCIe x16", "Shader Array"] },
      ],
    }),
});
