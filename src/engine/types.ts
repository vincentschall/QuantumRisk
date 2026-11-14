/** Core types for the QuantumRisk rules engine. The engine is pure TypeScript with no Node or DOM APIs. */

/** Player seats are 0..n-1. The neutral army (2-player games) is NEUTRAL. */
export type PlayerId = number;
export const NEUTRAL: PlayerId = -1;

export type Particle = "proton" | "neutron" | "electron" | "photon";

export interface SectorCard {
  /** Sector shown on the card; null for photon (wild) cards. */
  sector: string | null;
  particle: Particle;
}

export type QuantumCardKind = "forcedMeasurement" | "extraSplit";

/** Raw map definition, as stored in design/map.yaml. */
export interface MapDef {
  name: string;
  version?: number | string;
  clusters: Record<string, { bonus: number; sectors: string[] }>;
  strongholds: string[];
  /** [a, b, kind] with kind = trace | bus | cable. Undirected. */
  connections: [string, string, string][];
}

export type Mission =
  | { kind: "clusters"; clusters: [string, string] }
  | { kind: "sectors"; count: number }
  | { kind: "fortress"; count: number; minTroops: number }
  | { kind: "rival"; target: PlayerId };

export interface SectorState {
  owner: PlayerId;
  /** Real troops. Always >= 1 while owned. */
  troops: number;
}

/** A quantum stack: `size` troops that are entirely in branches[0] OR branches[1], 50/50. */
export interface QuantumStack {
  id: number;
  owner: PlayerId;
  size: number;
  branches: [string, string];
}

export interface PlayerState {
  id: PlayerId;
  alive: boolean;
  cards: SectorCard[];
  quantumCards: QuantumCardKind[];
  mission: Mission | null;
  /** Set when this player eliminated their own Rival target. */
  eliminatedRivalTarget: boolean;
}

export type Phase = "setup" | "reinforce" | "quantum" | "attack" | "fortify" | "gameOver";

export type MeasurementCause = "attack" | "selfMeasure" | "forcedMeasurement";

export type LogEvent =
  | { type: "turnStart"; player: PlayerId; round: number; reinforcements: number }
  | { type: "trade"; player: PlayerId; troops: number; ownedSectorBonus: number; quantumCard: QuantumCardKind | null }
  | { type: "split"; player: PlayerId; stack: number; source: string; size: number; branches: [string, string] }
  | { type: "measure"; stack: number; owner: PlayerId; cause: MeasurementCause; result: 0 | 1; sector: string; size: number; source: string }
  | {
      type: "attack";
      player: PlayerId;
      from: string;
      to: string;
      committed: number;
      defenders: number;
      effectiveDefence: number;
      won: boolean;
      attackerLosses: number;
      defenderLosses: number;
    }
  | { type: "eliminated"; player: PlayerId; by: PlayerId }
  | { type: "missionChanged"; player: PlayerId; mission: Mission }
  | { type: "win"; player: PlayerId; reason: "mission" | "domination" };

/** Thrown when an action breaks the rules. The game state is unchanged when this is thrown. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}
