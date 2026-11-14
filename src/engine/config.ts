/** Tunable rule values. Defaults match RULEBOOK.md; the simulator overrides them to test variants. */

export interface GameConfig {
  numPlayers: 2 | 3 | 4;
  mode: "missions" | "domination";

  /** Starting troops per player, by player count (includes the 1 troop per dealt sector). */
  startingTroops: Record<number, number>;
  /** Extra starting troops per seat (seat 0 first), by player count. Compensates for moving later. */
  seatBonus: Record<number, number[]>;
  neutralTroopsPerSector: number;
  /** Troops placed per setup placement turn. */
  setupChunk: number;

  minAttack: number;
  /** "stackSize": attacks on a sector holding a quantum branch must commit at least the stack size. */
  probeRule: "stackSize" | "none";
  strongholdBonus: number;

  cardRewards: { threeOfAKind: number; fullAtom: number; ownedSector: number };
  /**
   * Escalating set values, by number of sets traded so far in the game (any player).
   * When set, replaces threeOfAKind/fullAtom. After the list ends, each set is worth 5 more.
   * null = fixed rewards.
   */
  escalation: number[] | null;
  handLimit: number;
  photonCards: number;
  quantumDeck: { forcedMeasurement: number; extraSplit: number };

  /** Forbid attacks during round 1 (first-player compensation). */
  noAttacksFirstRound: boolean;

  /**
   * When splits happen. "quantum": in the Quantum phase, sharing the one quantum action with
   * self-measurement. "fortify": in the Fortify phase, up to `splitsPerTurn` per turn.
   */
  splitPhase: "quantum" | "fortify";
  /** Splits per turn when splitPhase is "fortify" (Extra Split cards add one each). Infinity = unlimited. */
  splitsPerTurn: number;

  sourceCanBeBranch: boolean;
  maxBranchesPerSector: number;

  missions: {
    clusterPairs: [string, string][];
    /** Sectors needed for the Expansion mission, by player count. */
    expansionSectors: Record<number, number>;
    fortress: { count: number; minTroops: number };
  };
}

export const DEFAULT_CONFIG: Omit<GameConfig, "numPlayers"> = {
  mode: "missions",
  startingTroops: { 2: 22, 3: 20, 4: 18 },
  seatBonus: { 2: [0, 2], 3: [0, 1, 2], 4: [0, 0, 0, 0] },
  neutralTroopsPerSector: 2,
  setupChunk: 3,
  minAttack: 3,
  probeRule: "stackSize",
  strongholdBonus: 1,
  cardRewards: { threeOfAKind: 4, fullAtom: 6, ownedSector: 2 },
  escalation: null,
  handLimit: 5,
  photonCards: 2,
  quantumDeck: { forcedMeasurement: 6, extraSplit: 4 },
  noAttacksFirstRound: false,
  splitPhase: "fortify",
  splitsPerTurn: 1,
  sourceCanBeBranch: true,
  maxBranchesPerSector: 1,
  missions: {
    clusterPairs: [
      ["CPU", "SSD"],
      ["GPU", "PSU"],
      ["RAM", "SSD"],
    ],
    expansionSectors: { 2: 18, 3: 16, 4: 14 },
    fortress: { count: 11, minTroops: 3 },
  },
};

/** Classic Risk-style escalation: 4, 6, 8, 10, 12, 15, then +5 each. */
export const CLASSIC_ESCALATION = [4, 6, 8, 10, 12, 15];

export function makeConfig(numPlayers: 2 | 3 | 4, overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...structuredClone(DEFAULT_CONFIG), ...overrides, numPlayers };
}
