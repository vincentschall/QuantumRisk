/**
 * Pure helpers shared by the game server and the in-browser tutorial: build what one seat may see,
 * and apply a client action to the engine. No Node or DOM APIs.
 */
import { RuleError, type Game, type LogEvent, type PlayerId } from "../engine/index.js";
import { LOG_TAIL, type Action, type GameView, type PlayerView } from "./protocol.js";

export interface SeatInfo {
  name: string;
  kind: "human" | "bot";
  claimed: boolean;
}

export function buildView(g: Game, o: { room: string; mode: "missions" | "domination"; seats: SeatInfo[]; you: Set<PlayerId>; connected: Set<PlayerId> }): GameView {
  const { you } = o;
  const over = g.isOver;
  const players: PlayerView[] = g.players.map((p) => {
    const seat = o.seats[p.id]!;
    const owned = g.ownedSectors(p.id);
    const v: PlayerView = {
      id: p.id,
      name: seat.name,
      kind: seat.kind,
      open: !seat.claimed,
      connected: seat.kind === "bot" || o.connected.has(p.id),
      alive: p.alive,
      sectors: owned.length,
      troops: owned.reduce((n, s) => n + g.troops(s), 0) + g.stacksOf(p.id).reduce((n, st) => n + st.size, 0),
      cardCount: p.cards.length,
      quantumCardCount: p.quantumCards.length,
      reinforcement: g.reinforcementFor(p.id),
    };
    if (you.has(p.id) || over) {
      v.cards = p.cards;
      v.quantumCards = p.quantumCards;
      v.mission = p.mission;
      v.sets = g.findSets(p.id);
    }
    return v;
  });
  const sectors: GameView["sectors"] = {};
  for (const [s, st] of g.sectors) sectors[s] = { owner: st.owner, troops: st.troops };
  return {
    room: o.room,
    mode: o.mode,
    you: [...you],
    phase: g.phase,
    current: g.current,
    round: g.round,
    setupChunk: g.config.setupChunk,
    setupRemaining: [...g.setupRemaining],
    reinforcementsLeft: g.reinforcementsLeft,
    quantumActionUsed: g.quantumActionUsed,
    canSplit: g.config.splitPhase === "fortify" ? g.splitsUsed < g.config.splitsPerTurn + g.extraSplits : g.canSplit(),
    splitsLeft: Math.max(0, g.config.splitsPerTurn + g.extraSplits - g.splitsUsed),
    conqueredThisTurn: g.conqueredThisTurn,
    minAttack: g.config.minAttack,
    handLimit: g.config.handLimit,
    strongholdBonus: g.config.strongholdBonus,
    sectors,
    stacks: g.stacks.map((s) => ({ ...s, branches: [...s.branches] as [string, string] })),
    players,
    winner: g.winner,
    logLength: g.log.length,
    log: g.log.slice(-LOG_TAIL).map((e) => (over ? e : hidePrivate(e, you))),
  };
}

/** Hide other players' secrets in the log: which Quantum card they drew, and their new mission. */
function hidePrivate(e: LogEvent, you: Set<PlayerId>): LogEvent {
  if (e.type === "trade" && !you.has(e.player) && e.quantumCard) return { ...e, quantumCard: null };
  if (e.type === "missionChanged" && !you.has(e.player)) return { ...e, mission: { kind: "sectors", count: 0 } };
  return e;
}

export function applyAction(g: Game, a: Action): void {
  switch (a.type) {
    case "setupPlace": return g.setupPlace(a.placements);
    case "trade": g.tradeSet(a.indices); return;
    case "place": return g.place(a.placements);
    case "split": g.split(a.source, a.size, a.branches[0], a.branches[1]); return;
    case "selfMeasure": g.selfMeasure(a.stack); return;
    case "forcedMeasurement": g.playForcedMeasurement(a.stack); return;
    case "extraSplit": return g.playExtraSplit();
    case "attack": g.attack(a.from, a.to, a.committed, a.moveExtra); return;
    case "fortify": return g.fortify(a.from, a.to, a.n);
    case "endPhase": return g.endPhase();
    case "endTurn": return g.endTurn();
    default: throw new RuleError("Unknown action");
  }
}
