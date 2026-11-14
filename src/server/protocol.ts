/**
 * Messages between the browser and the game server (JSON over one WebSocket).
 * Types only, so the web client can import this file without pulling in server code.
 */
import type { LogEvent, MapDef, Mission, Phase, PlayerId, QuantumCardKind, QuantumStack, SectorCard } from "../engine/types.js";

export type SeatKind = "local" | "open" | "bot";

export type Action =
  | { type: "setupPlace"; placements: Record<string, number> }
  | { type: "trade"; indices: [number, number, number] }
  | { type: "place"; placements: Record<string, number> }
  | { type: "split"; source: string; size: number; branches: [string, string] }
  | { type: "selfMeasure"; stack: number }
  | { type: "forcedMeasurement"; stack: number }
  | { type: "extraSplit" }
  | { type: "attack"; from: string; to: string; committed: number; moveExtra: number }
  | { type: "fortify"; from: string; to: string; n: number }
  | { type: "endPhase" }
  | { type: "endTurn" };

export type ClientMessage =
  | { t: "create"; mode: "missions" | "domination"; seats: { kind: SeatKind; name: string }[] }
  /** Join an open seat (name) or resume seats you hold (tokens). */
  | { t: "join"; room: string; name?: string; tokens?: string[] }
  | { t: "act"; room: string; token: string; action: Action };

export type ServerMessage =
  | { t: "joined"; room: string; tokens: Record<number, string>; map: MapDef & { positions: Record<string, [number, number]> } }
  | { t: "state"; view: GameView }
  | { t: "error"; message: string };

export interface PlayerView {
  id: PlayerId;
  name: string;
  kind: "human" | "bot";
  /** A human seat that nobody has claimed yet (waiting for someone to open the invite link). */
  open: boolean;
  connected: boolean;
  alive: boolean;
  sectors: number;
  troops: number;
  cardCount: number;
  quantumCardCount: number;
  reinforcement: number;
  /** Only for seats you control (or everyone once the game is over). */
  cards?: SectorCard[];
  quantumCards?: QuantumCardKind[];
  mission?: Mission | null;
  sets?: number[][];
}

export interface GameView {
  room: string;
  mode: "missions" | "domination";
  /** Seats this connection controls. */
  you: PlayerId[];
  phase: Phase;
  current: PlayerId;
  round: number;
  setupChunk: number;
  setupRemaining: number[];
  reinforcementsLeft: number;
  quantumActionUsed: boolean;
  canSplit: boolean;
  splitsLeft: number;
  conqueredThisTurn: boolean;
  minAttack: number;
  handLimit: number;
  strongholdBonus: number;
  sectors: Record<string, { owner: PlayerId; troops: number }>;
  stacks: QuantumStack[];
  players: PlayerView[];
  winner: PlayerId | null;
  /** Total number of log events so far. */
  logLength: number;
  /** The most recent log events (at most LOG_TAIL). */
  log: LogEvent[];
}

export const LOG_TAIL = 80;
