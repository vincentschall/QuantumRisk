/** Client-side helpers that mirror the engine, for highlighting and previews only. The server decides. */
import type { LogEvent, Mission, PlayerId, QuantumStack } from "../../src/engine/types.js";
import type { GameView, PlayerView } from "../../src/server/protocol.js";
import type { BoardMap } from "./net.js";

export const NEUTRAL = -1;
export const COLORS = ["#ff6b5e", "#4fa8ff", "#ffc53d", "#3fdc9a"];
export const NEUTRAL_COLOR = "#8b939c";
export const QUANTUM = "#b993ff";
export const colorOf = (p: PlayerId) => (p === NEUTRAL ? NEUTRAL_COLOR : (COLORS[p] ?? NEUTRAL_COLOR));

export interface Geometry {
  adjacency: Map<string, Set<string>>;
  clusterOf: Map<string, string>;
  strongholds: Set<string>;
}

export function geometry(map: BoardMap): Geometry {
  const adjacency = new Map<string, Set<string>>();
  const clusterOf = new Map<string, string>();
  for (const [c, def] of Object.entries(map.clusters))
    for (const s of def.sectors) {
      clusterOf.set(s, c);
      adjacency.set(s, new Set());
    }
  for (const [a, b] of map.connections) {
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }
  return { adjacency, clusterOf, strongholds: new Set(map.strongholds) };
}

export function reachableOwned(v: GameView, geo: Geometry, from: string, p: PlayerId): Set<string> {
  const seen = new Set<string>();
  if (v.sectors[from]?.owner !== p) return seen;
  const queue = [from];
  seen.add(from);
  while (queue.length) {
    const s = queue.pop()!;
    for (const n of geo.adjacency.get(s) ?? [])
      if (!seen.has(n) && v.sectors[n]?.owner === p) {
        seen.add(n);
        queue.push(n);
      }
  }
  return seen;
}

export const stacksAt = (v: GameView, s: string): QuantumStack[] => v.stacks.filter((st) => st.branches.includes(s));

export function minCommit(v: GameView, to: string): number {
  return stacksAt(v, to).reduce((m, st) => Math.max(m, st.size), v.minAttack);
}

export interface Outcome {
  won: boolean;
  attackerLosses: number;
  defenderLosses: number;
  movedIn: number;
}

/** Deterministic battle result for `committed` attackers against `defenders` real troops. */
export function battle(committed: number, defenders: number, stronghold: boolean, shield: number, moveExtra: number): Outcome {
  const eff = defenders + (stronghold ? shield : 0);
  if (committed > eff) return { won: true, attackerLosses: eff, defenderLosses: defenders, movedIn: committed - eff + moveExtra };
  const loss = Math.max(0, Math.min(committed - 1 - (stronghold ? shield : 0), defenders - 1));
  return { won: false, attackerLosses: committed, defenderLosses: loss, movedIn: 0 };
}

export function missionText(m: Mission | null | undefined, players: PlayerView[]): string {
  if (!m) return "Conquer every sector (Domination).";
  switch (m.kind) {
    case "clusters":
      return `Control the ${m.clusters[0]} and ${m.clusters[1]} clusters.`;
    case "sectors":
      return `Control ${m.count} sectors.`;
    case "fortress":
      return `Control ${m.count} sectors with at least ${m.minTroops} troops each.`;
    case "rival":
      return `Eliminate ${players[m.target]?.name ?? `player ${m.target + 1}`} yourself.`;
  }
}

export const PARTICLE = {
  proton: { symbol: "p⁺", name: "Proton", color: "#ff7a6b" },
  neutron: { symbol: "n⁰", name: "Neutron", color: "#b7c0c8" },
  electron: { symbol: "e⁻", name: "Electron", color: "#59b4ff" },
  photon: { symbol: "γ", name: "Photon (wild)", color: "#ffd84d" },
} as const;

export function sourceLabel(src: string): string {
  if (src.startsWith("moth-qpu")) return `quantum hardware${src.includes(":") ? ` (${src.split(":")[1]})` : ""}`;
  if (src.startsWith("moth-coin-qpu")) return "quantum hardware";
  if (src.startsWith("moth")) return "quantum emulator";
  if (src === "tutorial") return "browser randomness, tutorial only";
  return "local backup";
}

export function describe(e: LogEvent, name: (p: PlayerId) => string): string | null {
  switch (e.type) {
    case "turnStart":
      return `Round ${e.round}: ${name(e.player)}'s turn (+${e.reinforcements} troops)`;
    case "trade":
      return `${name(e.player)} traded a set for +${e.troops}${e.ownedSectorBonus ? ` and +${e.ownedSectorBonus} on owned sectors` : ""}${e.quantumCard ? ` and drew ${e.quantumCard === "forcedMeasurement" ? "Forced Measurement" : "Extra Split"}` : ""}`;
    case "split":
      return `${name(e.player)} split ${e.size} troops from ${e.source} into ${e.branches[0]} | ${e.branches[1]}`;
    case "measure":
      return `Measured: ${name(e.owner)}'s ${e.size} troops are in ${e.sector} (${e.cause === "attack" ? "attack" : e.cause === "selfMeasure" ? "self-measurement" : "Forced Measurement"}, ${sourceLabel(e.source)})`;
    case "attack":
      return e.won
        ? `${name(e.player)} took ${e.to} from ${e.from}: ${e.committed} vs ${e.effectiveDefence}, lost ${e.attackerLosses}`
        : `${name(e.player)} attacked ${e.to} from ${e.from} and failed: ${e.committed} vs ${e.effectiveDefence}, defender lost ${e.defenderLosses}`;
    case "eliminated":
      return `${name(e.player)} was eliminated by ${name(e.by)}`;
    case "missionChanged":
      return `${name(e.player)}'s mission changed`;
    case "win":
      return `${name(e.player)} wins by ${e.reason === "mission" ? "completing their mission" : "domination"}!`;
  }
}
