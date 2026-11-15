import { randomBytes } from "node:crypto";
import { Game, makeConfig, RuleError, type GameMap, type LogEvent, type PlayerId } from "../engine/index.js";
import type { QuantumSource } from "../quantum/index.js";
import { makeBot, type Bot } from "../sim/bots.js";
import type { Action, GameView, SeatKind } from "./protocol.js";
import { applyAction as apply, buildView } from "./view.js";

/** Measurement bits buffered before any action, so the synchronous engine never runs dry. */
const BITS_BEFORE_ACTION = 64;
/** Pause between bot moves so humans can follow them. */
export const BOT_DELAY_MS = Number(process.env.QR_BOT_DELAY_MS ?? 900);
/** Bot turns are replayed to the browsers one log event at a time, this far apart. */
export const FRAME_MS = Number(process.env.QR_FRAME_MS ?? 420);

interface Seat {
  name: string;
  kind: "human" | "bot";
  token: string;
  claimed: boolean;
  bot?: Bot;
}

export interface Listener {
  /** Seats this listener controls. */
  seats: Set<PlayerId>;
  send(view: GameView): void;
}

const token = () => randomBytes(16).toString("hex");
export const roomId = () => randomBytes(4).toString("hex");

/** One game: the engine instance, its seats, connected listeners and the bot driver. */
export class Room {
  readonly game: Game;
  readonly seats: Seat[];
  readonly listeners = new Set<Listener>();
  lastActivity = Date.now();
  private botTimer: NodeJS.Timeout | null = null;
  private botsStalled = false;
  private busy = false;

  constructor(
    readonly id: string,
    readonly mode: "missions" | "domination",
    seats: { kind: SeatKind; name: string }[],
    map: GameMap,
    private readonly source: QuantumSource,
    private readonly log: (msg: string) => void = () => {},
  ) {
    if (seats.length < 2 || seats.length > 4) throw new RuleError("A game needs 2 to 4 seats");
    this.seats = seats.map((s, i) => ({
      name: s.name.trim().slice(0, 20) || (s.kind === "bot" ? `Bot ${i + 1}` : `Player ${i + 1}`),
      kind: s.kind === "bot" ? "bot" : "human",
      token: token(),
      claimed: s.kind !== "open",
      bot: s.kind === "bot" ? makeBot("quantum") : undefined,
    }));
    this.game = new Game(makeConfig(seats.length as 2 | 3 | 4, { mode }), map, source);
  }

  /** Tokens for the seats the creator plays at this screen. */
  localTokens(kinds: SeatKind[]): Record<number, string> {
    const out: Record<number, string> = {};
    kinds.forEach((k, i) => {
      if (k === "local") out[i] = this.seats[i]!.token;
    });
    return out;
  }

  /** Claim the first open seat. Returns its index, or null if the room is full. */
  claimOpenSeat(name: string): number | null {
    const i = this.seats.findIndex((s) => !s.claimed);
    if (i < 0) return null;
    const seat = this.seats[i]!;
    seat.claimed = true;
    if (name.trim()) seat.name = name.trim().slice(0, 20);
    return i;
  }

  seatsForTokens(tokens: string[]): PlayerId[] {
    return this.seats.flatMap((s, i) => (tokens.includes(s.token) ? [i] : []));
  }

  async act(seat: PlayerId, action: Action): Promise<void> {
    const g = this.game;
    if (seat !== g.current) throw new RuleError("It is not your turn");
    if (this.busy) throw new RuleError("The previous action is still being resolved");
    this.busy = true;
    try {
      await this.source.ready(BITS_BEFORE_ACTION);
      apply(g, action);
    } finally {
      this.busy = false;
    }
    this.lastActivity = Date.now();
    this.broadcast();
    this.scheduleBots();
  }

  /** Run bot seats one move (setup chunk or whole turn) at a time, with a pause in between. */
  scheduleBots(): void {
    const g = this.game;
    if (this.botTimer || this.botsStalled || g.isOver) return;
    const seat = this.seats[g.current];
    if (!seat?.bot) return;
    this.botTimer = setTimeout(async () => {
      await this.source.ready(BITS_BEFORE_ACTION);
      // Record what each listener sees after every log event, then play it back at a readable pace.
      const frames = new Map<Listener, GameView[]>();
      const log = g.log;
      const push = log.push.bind(log);
      log.push = (...events: LogEvent[]) => {
        const n = push(...events);
        for (const l of this.listeners) {
          const list = frames.get(l) ?? [];
          list.push(this.view(l.seats));
          frames.set(l, list);
        }
        return n;
      };
      try {
        this.playBotMove(seat.bot!);
      } finally {
        log.push = push;
      }
      this.lastActivity = Date.now();
      const steps = Math.max(0, ...[...frames.values()].map((f) => f.length));
      for (let i = 0; i < steps; i++)
        setTimeout(() => {
          for (const [l, f] of frames) if (this.listeners.has(l) && f[i]) l.send(f[i]!);
        }, i * FRAME_MS);
      this.botTimer = setTimeout(() => {
        this.botTimer = null;
        this.broadcast();
        this.scheduleBots();
      }, steps * FRAME_MS);
    }, BOT_DELAY_MS);
  }

  private playBotMove(bot: Bot): void {
    const g = this.game;
    const before = { player: g.current, round: g.round, phase: g.phase };
    try {
      if (g.phase === "setup") bot.setup(g);
      else bot.turn(g);
    } catch (e) {
      this.log(`room ${this.id}: bot error (${(e as Error).message}); ending its turn`);
      try {
        if (g.phase === "reinforce") {
          g.reinforcementsLeft = 0;
          const cards = g.players[g.current]!.cards;
          cards.length = Math.min(cards.length, g.config.handLimit - 1);
          g.endPhase();
        }
        if (g.phase === "quantum") g.endPhase();
        if (g.phase === "attack" || g.phase === "fortify") g.endTurn();
      } catch {
        /* nothing more to do */
      }
    }
    if (!g.isOver && g.current === before.player && g.round === before.round && g.phase === before.phase) {
      this.log(`room ${this.id}: bot did not advance; stopping bots`);
      this.botsStalled = true;
    }
  }

  broadcast(): void {
    for (const l of this.listeners) l.send(this.view(l.seats));
  }

  view(you: Set<PlayerId>): GameView {
    const connected = new Set<PlayerId>();
    for (const l of this.listeners) for (const s of l.seats) connected.add(s);
    return buildView(this.game, { room: this.id, mode: this.mode, seats: this.seats, you, connected });
  }

  stop(): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = null;
  }
}
