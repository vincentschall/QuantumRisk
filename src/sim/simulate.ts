import { Game, NEUTRAL, seededSource, type GameConfig, type GameMap, type LogEvent, type PlayerId, type RandomSource } from "../engine/index.js";
import { makeBot } from "./bots.js";

export interface GameResult {
  winner: PlayerId | null;
  winnerBot: string | null;
  reason: "mission" | "domination" | "timeout";
  rounds: number;
  trades: number;
  splits: number;
  measurements: number;
  attacks: number;
  gambles: number;
  maxSetValue: number;
  errors: string[];
  log: LogEvent[];
}

/** Play one bot game. `bots[i]` is the bot style for seat i. `rand` overrides the seeded source. */
export function playGame(config: GameConfig, map: GameMap, bots: string[], seed: number, maxRounds: number, rand?: RandomSource): GameResult {
  const g = new Game(config, map, rand ?? seededSource(seed));
  const players = bots.map(makeBot);
  const errors: string[] = [];

  let guard = 0;
  while (g.phase === "setup" && guard++ < 1000) players[g.current]!.setup(g);

  while (!g.isOver && g.round <= maxRounds) {
    const before = { player: g.current, round: g.round };
    try {
      players[g.current]!.turn(g);
    } catch (e) {
      errors.push(`${players[g.current]!.name}@r${g.round}: ${(e as Error).message}`);
      // Recover: skip the rest of this turn.
      try {
        if (g.phase === "reinforce") {
          g.reinforcementsLeft = 0;
          g.players[g.current]!.cards.length = Math.min(g.players[g.current]!.cards.length, g.config.handLimit - 1);
          g.endPhase();
        }
        if (g.phase === "quantum") g.endPhase();
        if (g.phase === "attack" || g.phase === "fortify") g.endTurn();
      } catch {
        break;
      }
    }
    if (!g.isOver && g.current === before.player && g.round === before.round) {
      errors.push("turn did not advance");
      break;
    }
  }

  let trades = 0, splits = 0, measurements = 0, attacks = 0, gambles = 0, maxSetValue = 0;
  for (const e of g.log) {
    if (e.type === "trade") { trades++; maxSetValue = Math.max(maxSetValue, e.troops); }
    else if (e.type === "split") splits++;
    else if (e.type === "measure") measurements++;
    else if (e.type === "attack") attacks++;
  }
  // A gamble = attack where a stack was measured and the attacker could not have known the outcome.
  for (let i = 1; i < g.log.length; i++) {
    const e = g.log[i]!;
    const prev = g.log[i - 1]!;
    if (e.type === "attack" && prev.type === "measure" && prev.cause === "attack") gambles++;
  }
  const win = g.log.find((e) => e.type === "win");
  return {
    winner: g.winner,
    winnerBot: g.winner !== null && g.winner !== NEUTRAL ? bots[g.winner]! : null,
    reason: win?.type === "win" ? win.reason : "timeout",
    rounds: Math.min(g.round, maxRounds),
    trades,
    splits,
    measurements,
    attacks,
    gambles,
    maxSetValue,
    errors,
    log: g.log,
  };
}

export interface Summary {
  label: string;
  games: number;
  timeoutRate: number;
  rounds: { mean: number; p10: number; p50: number; p90: number };
  seatWinRate: number[];
  botWinRate: Record<string, number>;
  missionWins: number;
  perGame: { trades: number; splits: number; measurements: number; attacks: number; maxSetValue: number };
  errors: number;
  sampleErrors: string[];
}

/**
 * Run `games` games. When `rotate` is true the bot line-up is rotated through the seats
 * so that seat effects and bot effects can be separated.
 */
export function runBatch(label: string, config: GameConfig, map: GameMap, bots: string[], games: number, opts: { seed?: number; maxRounds?: number; rotate?: boolean } = {}): Summary {
  const seed0 = opts.seed ?? 1;
  const maxRounds = opts.maxRounds ?? 30;
  const n = bots.length;
  const results: GameResult[] = [];
  const seatWins = new Array(n).fill(0);
  const botWins: Record<string, number> = {};
  const botSeats: Record<string, number> = {};
  for (let i = 0; i < games; i++) {
    const shift = opts.rotate ? i % n : 0;
    const lineup = bots.map((_, s) => bots[(s + shift) % n]!);
    for (const b of lineup) botSeats[b] = (botSeats[b] ?? 0) + 1;
    const r = playGame(config, map, lineup, seed0 + i * 7919, maxRounds);
    results.push(r);
    if (r.winner !== null && r.winner >= 0) {
      seatWins[r.winner]++;
      botWins[r.winnerBot!] = (botWins[r.winnerBot!] ?? 0) + 1;
    }
  }
  const finished = results.filter((r) => r.reason !== "timeout");
  const rounds = finished.map((r) => r.rounds).sort((a, b) => a - b);
  const q = (p: number) => rounds[Math.min(rounds.length - 1, Math.floor(p * rounds.length))] ?? NaN;
  const avg = (f: (r: GameResult) => number) => results.reduce((a, r) => a + f(r), 0) / results.length;
  const botWinRate: Record<string, number> = {};
  // Win rate per seat occupied (a bot appearing twice in a lineup is counted per seat).
  for (const b of Object.keys(botSeats)) botWinRate[b] = (botWins[b] ?? 0) / botSeats[b]!;
  const errs = results.flatMap((r) => r.errors);
  return {
    label,
    games,
    timeoutRate: 1 - finished.length / games,
    rounds: { mean: rounds.reduce((a, b) => a + b, 0) / (rounds.length || 1), p10: q(0.1), p50: q(0.5), p90: q(0.9) },
    seatWinRate: seatWins.map((w) => w / games),
    botWinRate,
    missionWins: results.filter((r) => r.reason === "mission").length / games,
    perGame: {
      trades: avg((r) => r.trades),
      splits: avg((r) => r.splits),
      measurements: avg((r) => r.measurements),
      attacks: avg((r) => r.attacks),
      maxSetValue: avg((r) => r.maxSetValue),
    },
    errors: errs.length,
    sampleErrors: [...new Set(errs)].slice(0, 5),
  };
}
