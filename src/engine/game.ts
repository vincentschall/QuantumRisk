import type { GameConfig } from "./config.js";
import type { GameMap } from "./map.js";
import { shuffle, type RandomSource } from "./random.js";
import {
  NEUTRAL,
  RuleError,
  type LogEvent,
  type MeasurementCause,
  type Mission,
  type Particle,
  type Phase,
  type PlayerId,
  type PlayerState,
  type QuantumCardKind,
  type QuantumStack,
  type SectorCard,
  type SectorState,
} from "./types.js";

export interface Measurement {
  stack: number;
  owner: PlayerId;
  size: number;
  result: 0 | 1;
  sector: string;
}

export interface AttackResult {
  won: boolean;
  committed: number;
  /** Real defenders after any measurement (stack included if it collapsed into the target). */
  defenders: number;
  /** Defenders plus Stronghold bonus. */
  effectiveDefence: number;
  attackerLosses: number;
  defenderLosses: number;
  measurements: Measurement[];
  eliminated: PlayerId | null;
}

const PARTICLES: Particle[] = ["proton", "neutron", "electron"];

/**
 * The full rules of QuantumRisk (RULEBOOK.md). One instance = one game.
 * Every action validates first and throws RuleError without changing state if it is illegal.
 */
export class Game {
  readonly config: GameConfig;
  readonly map: GameMap;
  private readonly rand: RandomSource;

  readonly sectors = new Map<string, SectorState>();
  stacks: QuantumStack[] = [];
  readonly players: PlayerState[] = [];

  phase: Phase = "setup";
  current: PlayerId = 0;
  round = 0;
  setupRemaining: number[] = [];
  reinforcementsLeft = 0;
  quantumActionUsed = false;
  extraSplits = 0;
  splitsUsed = 0;
  conqueredThisTurn = false;

  deck: SectorCard[] = [];
  discard: SectorCard[] = [];
  quantumDeck: QuantumCardKind[] = [];
  quantumDiscard: QuantumCardKind[] = [];
  setsTraded = 0;

  winner: PlayerId | null = null;
  readonly log: LogEvent[] = [];
  private nextStackId = 1;

  constructor(config: GameConfig, map: GameMap, rand: RandomSource) {
    this.config = config;
    this.map = map;
    this.rand = rand;
    const n = config.numPlayers;

    // Deal sectors evenly. With 2 players the neutral army gets an equal share.
    const groups = n === 2 ? 3 : n;
    if (map.sectors.length % groups !== 0) throw new Error("Sectors cannot be dealt evenly");
    const per = map.sectors.length / groups;
    const order = shuffle([...map.sectors], rand.rng);
    order.forEach((s, i) => {
      const g = Math.floor(i / per);
      const owner = g < n ? g : NEUTRAL;
      this.sectors.set(s, { owner, troops: owner === NEUTRAL ? config.neutralTroopsPerSector : 1 });
    });

    for (let p = 0; p < n; p++) {
      this.players.push({ id: p, alive: true, cards: [], quantumCards: [], mission: null, eliminatedRivalTarget: false });
      const start = (config.startingTroops[n] ?? 0) + (config.seatBonus[n]?.[p] ?? 0);
      this.setupRemaining.push(Math.max(0, start - per));
    }

    // Sector cards: particles cycle through the sectors (8 of each on 24 sectors) plus photon wild cards.
    this.deck = map.sectors.map((s, i) => ({ sector: s, particle: PARTICLES[i % 3]! }));
    for (let i = 0; i < config.photonCards; i++) this.deck.push({ sector: null, particle: "photon" });
    shuffle(this.deck, rand.rng);

    for (let i = 0; i < config.quantumDeck.forcedMeasurement; i++) this.quantumDeck.push("forcedMeasurement");
    for (let i = 0; i < config.quantumDeck.extraSplit; i++) this.quantumDeck.push("extraSplit");
    shuffle(this.quantumDeck, rand.rng);

    if (config.mode === "missions") this.dealMissions();

    if (this.setupRemaining.every((r) => r === 0)) this.beginTurn(0);
  }

  // ───────────────────────────── queries ─────────────────────────────

  get isOver(): boolean {
    return this.phase === "gameOver";
  }

  sector(s: string): SectorState {
    const st = this.sectors.get(s);
    if (!st) throw new RuleError(`Unknown sector "${s}"`);
    return st;
  }

  owner(s: string): PlayerId {
    return this.sector(s).owner;
  }

  troops(s: string): number {
    return this.sector(s).troops;
  }

  neighbors(s: string): string[] {
    return [...(this.map.adjacency.get(s) ?? [])];
  }

  ownedSectors(p: PlayerId): string[] {
    return this.map.sectors.filter((s) => this.sectors.get(s)!.owner === p);
  }

  stacksAt(s: string): QuantumStack[] {
    return this.stacks.filter((st) => st.branches[0] === s || st.branches[1] === s);
  }

  stacksOf(p: PlayerId): QuantumStack[] {
    return this.stacks.filter((st) => st.owner === p);
  }

  /** Sectors reachable from `from` through an unbroken chain of sectors owned by `p` (includes `from`). */
  reachableOwned(from: string, p: PlayerId): Set<string> {
    const seen = new Set<string>();
    if (this.owner(from) !== p) return seen;
    const queue = [from];
    seen.add(from);
    while (queue.length) {
      const s = queue.pop()!;
      for (const n of this.map.adjacency.get(s) ?? []) {
        if (!seen.has(n) && this.sectors.get(n)!.owner === p) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return seen;
  }

  ownsCluster(p: PlayerId, cluster: string): boolean {
    return (this.map.clusterSectors.get(cluster) ?? []).every((s) => this.sectors.get(s)!.owner === p);
  }

  clustersOwned(p: PlayerId): string[] {
    return this.map.clusters.filter((c) => this.ownsCluster(p, c));
  }

  reinforcementFor(p: PlayerId): number {
    const base = Math.max(3, Math.floor(this.ownedSectors(p).length / 3));
    const bonus = this.clustersOwned(p).reduce((sum, c) => sum + (this.map.bonus.get(c) ?? 0), 0);
    return base + bonus;
  }

  /** Value of the next set trade, ignoring the owned-sector bonus. */
  setValue(cards: SectorCard[]): number | null {
    const kind = setKind(cards);
    if (!kind) return null;
    const esc = this.config.escalation;
    if (esc) {
      const i = this.setsTraded;
      return i < esc.length ? esc[i]! : esc[esc.length - 1]! + 5 * (i - esc.length + 1);
    }
    return kind === "fullAtom" ? this.config.cardRewards.fullAtom : this.config.cardRewards.threeOfAKind;
  }

  /** All valid 3-card sets in a hand, as index triples. */
  findSets(p: PlayerId): number[][] {
    const cards = this.players[p]!.cards;
    const out: number[][] = [];
    for (let a = 0; a < cards.length; a++)
      for (let b = a + 1; b < cards.length; b++)
        for (let c = b + 1; c < cards.length; c++)
          if (setKind([cards[a]!, cards[b]!, cards[c]!])) out.push([a, b, c]);
    return out;
  }

  missionComplete(p: PlayerId): boolean {
    const pl = this.players[p];
    if (!pl || !pl.alive || !pl.mission) return false;
    const m = pl.mission;
    switch (m.kind) {
      case "clusters":
        return this.ownsCluster(p, m.clusters[0]) && this.ownsCluster(p, m.clusters[1]);
      case "sectors":
        return this.ownedSectors(p).length >= m.count;
      case "fortress":
        return this.ownedSectors(p).filter((s) => this.troops(s) >= m.minTroops).length >= m.count;
      case "rival":
        return pl.eliminatedRivalTarget;
    }
  }

  alivePlayers(): PlayerId[] {
    return this.players.filter((p) => p.alive).map((p) => p.id);
  }

  // ───────────────────────────── setup ─────────────────────────────

  /** Place this setup turn's troops (min(setupChunk, remaining)), split over own sectors as wanted. */
  setupPlace(placements: Record<string, number>): void {
    this.requirePhase("setup");
    const p = this.current;
    const expected = Math.min(this.config.setupChunk, this.setupRemaining[p]!);
    const total = this.validatePlacements(placements, p);
    if (total !== expected) throw new RuleError(`Place exactly ${expected} troops this setup turn`);
    for (const [s, n] of Object.entries(placements)) this.sector(s).troops += n;
    this.setupRemaining[p]! -= total;

    const n = this.config.numPlayers;
    for (let i = 1; i <= n; i++) {
      const next = (p + i) % n;
      if (this.setupRemaining[next]! > 0) {
        this.current = next;
        return;
      }
    }
    this.beginTurn(0);
  }

  // ───────────────────────────── reinforce ─────────────────────────────

  tradeSet(indices: [number, number, number]): number {
    this.requirePhase("reinforce");
    const p = this.current;
    const pl = this.players[p]!;
    if (new Set(indices).size !== 3) throw new RuleError("Choose three different cards");
    const cards = indices.map((i) => {
      const c = pl.cards[i];
      if (!c) throw new RuleError(`No card at index ${i}`);
      return c;
    });
    const value = this.setValue(cards);
    if (value === null) throw new RuleError("Not a valid set");

    let ownedBonus = 0;
    for (const c of cards) {
      if (c.sector && this.owner(c.sector) === p) {
        this.sector(c.sector).troops += this.config.cardRewards.ownedSector;
        ownedBonus += this.config.cardRewards.ownedSector;
      }
    }
    pl.cards = pl.cards.filter((_, i) => !indices.includes(i));
    this.discard.push(...cards);
    this.setsTraded++;
    this.reinforcementsLeft += value;
    const q = this.drawQuantumCard();
    if (q) pl.quantumCards.push(q);
    this.log.push({ type: "trade", player: p, troops: value, ownedSectorBonus: ownedBonus, quantumCard: q });
    this.checkWin();
    return value + ownedBonus;
  }

  place(placements: Record<string, number>): void {
    this.requirePhase("reinforce");
    const p = this.current;
    if (this.players[p]!.cards.length >= this.config.handLimit)
      throw new RuleError(`You hold ${this.config.handLimit}+ cards and must trade a set first`);
    const total = this.validatePlacements(placements, p);
    if (total > this.reinforcementsLeft) throw new RuleError(`Only ${this.reinforcementsLeft} troops left to place`);
    for (const [s, n] of Object.entries(placements)) this.sector(s).troops += n;
    this.reinforcementsLeft -= total;
    this.checkWin();
  }

  // ───────────────────────────── quantum ─────────────────────────────

  canSplit(): boolean {
    if (this.config.splitPhase === "quantum")
      return this.phase === "quantum" && (!this.quantumActionUsed || this.extraSplits > 0);
    return (
      (this.phase === "fortify" || this.phase === "attack") &&
      this.splitsUsed < this.config.splitsPerTurn + this.extraSplits
    );
  }

  split(source: string, size: number, branchA: string, branchB: string): QuantumStack {
    if (this.config.splitPhase === "fortify" && this.phase === "attack") this.phase = "fortify";
    this.requirePhase(this.config.splitPhase);
    const p = this.current;
    if (!this.canSplit()) throw new RuleError("No split left this turn");
    if (this.owner(source) !== p) throw new RuleError("Source must be your sector");
    if (!Number.isInteger(size) || size < 1) throw new RuleError("Stack size must be at least 1");
    if (size > this.troops(source) - 1) throw new RuleError("Source must keep at least 1 real troop");
    if (branchA === branchB) throw new RuleError("Branches must be two different sectors");
    if (!this.config.sourceCanBeBranch && (branchA === source || branchB === source))
      throw new RuleError("The source cannot be a branch");
    const reach = this.reachableOwned(source, p);
    for (const b of [branchA, branchB]) {
      if (this.owner(b) !== p) throw new RuleError(`${b} is not your sector`);
      if (!reach.has(b)) throw new RuleError(`${b} is not connected to ${source} through your sectors`);
      if (this.stacksAt(b).length >= this.config.maxBranchesPerSector)
        throw new RuleError(`${b} already holds a quantum branch`);
    }

    this.sector(source).troops -= size;
    const stack: QuantumStack = { id: this.nextStackId++, owner: p, size, branches: [branchA, branchB] };
    this.stacks.push(stack);
    if (this.config.splitPhase === "fortify") this.splitsUsed++;
    else if (!this.quantumActionUsed) this.quantumActionUsed = true;
    else this.extraSplits--;
    this.log.push({ type: "split", player: p, stack: stack.id, source, size, branches: [branchA, branchB] });
    this.checkWin();
    return stack;
  }

  selfMeasure(stackId: number): Measurement {
    this.requirePhase("quantum");
    if (this.quantumActionUsed) throw new RuleError("Quantum action already used this turn");
    const st = this.findStack(stackId);
    if (st.owner !== this.current) throw new RuleError("You can only self-measure your own stacks");
    this.quantumActionUsed = true;
    const m = this.measureStack(st, "selfMeasure");
    this.checkWin();
    return m;
  }

  playForcedMeasurement(stackId: number): Measurement {
    this.requirePhase("quantum");
    const st = this.findStack(stackId);
    if (st.owner === this.current) throw new RuleError("Forced Measurement targets an enemy stack");
    this.useQuantumCard("forcedMeasurement");
    const m = this.measureStack(st, "forcedMeasurement");
    this.checkWin();
    return m;
  }

  playExtraSplit(): void {
    this.requirePhase("quantum");
    this.useQuantumCard("extraSplit");
    this.extraSplits++;
  }

  // ───────────────────────────── attack ─────────────────────────────

  /** Smallest legal commitment against `to` (minimum attack and probe rule). */
  minCommit(to: string): number {
    let min = this.config.minAttack;
    if (this.config.probeRule === "stackSize") for (const st of this.stacksAt(to)) min = Math.max(min, st.size);
    return min;
  }

  attack(from: string, to: string, committed: number, moveExtra = 0): AttackResult {
    this.requirePhase("attack");
    const p = this.current;
    if (this.config.noAttacksFirstRound && this.round === 1) throw new RuleError("No attacks in round 1");
    if (this.owner(from) !== p) throw new RuleError("Attack from your own sector");
    if (!this.map.adjacency.get(from)?.has(to)) throw new RuleError(`${to} is not adjacent to ${from}`);
    if (this.owner(to) === p) throw new RuleError("You cannot attack your own sector");
    if (!Number.isInteger(committed)) throw new RuleError("Commit a whole number of troops");
    const min = this.minCommit(to);
    if (committed < min) throw new RuleError(`Commit at least ${min} troops`);
    if (committed > this.troops(from) - 1) throw new RuleError("The source must keep at least 1 real troop");
    if (!Number.isInteger(moveExtra) || moveExtra < 0 || moveExtra > this.troops(from) - committed - 1)
      throw new RuleError("Invalid number of extra troops to move in");

    const measurements = this.stacksAt(to).map((st) => this.measureStack(st, "attack"));
    const target = this.sector(to);
    const src = this.sector(from);
    const defender = target.owner;
    const defenders = target.troops;
    const effective = defenders + (this.map.strongholds.has(to) ? this.config.strongholdBonus : 0);

    let result: AttackResult;
    if (committed > effective) {
      src.troops -= committed + moveExtra;
      target.owner = p;
      target.troops = committed - effective + moveExtra;
      this.conqueredThisTurn = true;
      result = {
        won: true,
        committed,
        defenders,
        effectiveDefence: effective,
        attackerLosses: effective,
        defenderLosses: defenders,
        measurements,
        eliminated: null,
      };
      if (defender !== NEUTRAL && this.ownedSectors(defender).length === 0) {
        this.eliminate(defender, p);
        result.eliminated = defender;
      }
    } else {
      // Failed attack: attacker loses everything committed; defender loses N - 1 (N - 2 on a Stronghold).
      const shield = this.map.strongholds.has(to) ? this.config.strongholdBonus : 0;
      const loss = Math.max(0, Math.min(committed - 1 - shield, defenders - 1));
      src.troops -= committed;
      target.troops -= loss;
      result = {
        won: false,
        committed,
        defenders,
        effectiveDefence: effective,
        attackerLosses: committed,
        defenderLosses: loss,
        measurements,
        eliminated: null,
      };
    }
    this.log.push({
      type: "attack",
      player: p,
      from,
      to,
      committed,
      defenders,
      effectiveDefence: effective,
      won: result.won,
      attackerLosses: result.attackerLosses,
      defenderLosses: result.defenderLosses,
    });
    this.checkWin();
    return result;
  }

  // ───────────────────────────── fortify ─────────────────────────────

  fortify(from: string, to: string, n: number): void {
    if (this.phase === "attack") this.phase = "fortify";
    this.requirePhase("fortify");
    const p = this.current;
    if (from === to) throw new RuleError("Choose two different sectors");
    if (this.owner(from) !== p || this.owner(to) !== p) throw new RuleError("Both sectors must be yours");
    if (!this.reachableOwned(from, p).has(to)) throw new RuleError("No chain of your sectors connects them");
    if (!Number.isInteger(n) || n < 1 || n > this.troops(from) - 1)
      throw new RuleError("Move at least 1 troop and leave at least 1 behind");
    this.sector(from).troops -= n;
    this.sector(to).troops += n;
    this.checkWin();
  }

  // ───────────────────────────── flow ─────────────────────────────

  endPhase(): void {
    switch (this.phase) {
      case "reinforce":
        if (this.players[this.current]!.cards.length >= this.config.handLimit)
          throw new RuleError("You must trade a set first");
        if (this.reinforcementsLeft > 0) throw new RuleError("Place all reinforcements first");
        this.phase = "quantum";
        return;
      case "quantum":
        this.phase = "attack";
        return;
      case "attack":
        this.phase = "fortify";
        return;
      case "fortify":
        this.endTurn();
        return;
      default:
        throw new RuleError(`Cannot end phase ${this.phase}`);
    }
  }

  endTurn(): void {
    if (this.phase !== "attack" && this.phase !== "fortify") throw new RuleError("Finish reinforcing first");
    const p = this.current;
    if (this.conqueredThisTurn) {
      const card = this.drawSectorCard();
      if (card) this.players[p]!.cards.push(card);
    }
    const n = this.config.numPlayers;
    for (let i = 1; i <= n; i++) {
      const next = (p + i) % n;
      if (this.players[next]!.alive) {
        this.beginTurn(next);
        return;
      }
    }
  }

  // ───────────────────────────── internals ─────────────────────────────

  private beginTurn(p: PlayerId): void {
    if (p <= this.current || this.round === 0) this.round++;
    this.current = p;
    this.phase = "reinforce";
    this.reinforcementsLeft = this.reinforcementFor(p);
    this.quantumActionUsed = false;
    this.extraSplits = 0;
    this.splitsUsed = 0;
    this.conqueredThisTurn = false;
    this.log.push({ type: "turnStart", player: p, round: this.round, reinforcements: this.reinforcementsLeft });
  }

  private requirePhase(phase: Phase): void {
    if (this.phase === "gameOver") throw new RuleError("The game is over");
    if (this.phase !== phase) throw new RuleError(`Not allowed in phase ${this.phase} (needs ${phase})`);
  }

  private validatePlacements(placements: Record<string, number>, p: PlayerId): number {
    let total = 0;
    for (const [s, n] of Object.entries(placements)) {
      if (this.owner(s) !== p) throw new RuleError(`${s} is not your sector`);
      if (!Number.isInteger(n) || n < 0) throw new RuleError("Place whole, positive numbers of troops");
      total += n;
    }
    return total;
  }

  private findStack(id: number): QuantumStack {
    const st = this.stacks.find((s) => s.id === id);
    if (!st) throw new RuleError(`No quantum stack ${id}`);
    return st;
  }

  private useQuantumCard(kind: QuantumCardKind): void {
    const pl = this.players[this.current]!;
    const i = pl.quantumCards.indexOf(kind);
    if (i < 0) throw new RuleError(`You have no ${kind} card`);
    pl.quantumCards.splice(i, 1);
    this.quantumDiscard.push(kind);
  }

  private measureStack(st: QuantumStack, cause: MeasurementCause): Measurement {
    const result = this.rand.measure();
    const sector = st.branches[result];
    this.sector(sector).troops += st.size;
    this.stacks = this.stacks.filter((s) => s.id !== st.id);
    this.log.push({ type: "measure", stack: st.id, owner: st.owner, cause, result, sector, size: st.size });
    return { stack: st.id, owner: st.owner, size: st.size, result, sector };
  }

  private drawSectorCard(): SectorCard | null {
    if (this.deck.length === 0) {
      this.deck = shuffle(this.discard, this.rand.rng);
      this.discard = [];
    }
    return this.deck.pop() ?? null;
  }

  private drawQuantumCard(): QuantumCardKind | null {
    if (this.quantumDeck.length === 0) {
      this.quantumDeck = shuffle(this.quantumDiscard, this.rand.rng);
      this.quantumDiscard = [];
    }
    return this.quantumDeck.pop() ?? null;
  }

  private eliminate(loser: PlayerId, by: PlayerId): void {
    const l = this.players[loser]!;
    const w = this.players[by]!;
    l.alive = false;
    w.cards.push(...l.cards);
    w.quantumCards.push(...l.quantumCards);
    l.cards = [];
    l.quantumCards = [];
    this.stacks = this.stacks.filter((s) => s.owner !== loser);
    this.log.push({ type: "eliminated", player: loser, by });

    for (const pl of this.players) {
      if (pl.mission?.kind === "rival" && pl.mission.target === loser) {
        if (pl.id === by) pl.eliminatedRivalTarget = true;
        else this.setMission(pl, this.expansionMission());
      }
    }
  }

  private dealMissions(): void {
    const m = this.config.missions;
    const deck: Mission[] = [
      ...m.clusterPairs.map((c): Mission => ({ kind: "clusters", clusters: c })),
      this.expansionMission(),
      { kind: "fortress", count: m.fortress.count, minTroops: m.fortress.minTroops },
      ...[0, 1, 2, 3].map((t): Mission => ({ kind: "rival", target: t })),
    ];
    shuffle(deck, this.rand.rng);
    for (const pl of this.players) {
      let mission = deck.pop()!;
      if (mission.kind === "rival" && (mission.target === pl.id || mission.target >= this.config.numPlayers))
        mission = this.expansionMission();
      pl.mission = mission;
    }
  }

  private expansionMission(): Mission {
    return { kind: "sectors", count: this.config.missions.expansionSectors[this.config.numPlayers] ?? 14 };
  }

  private setMission(pl: PlayerState, mission: Mission): void {
    pl.mission = mission;
    this.log.push({ type: "missionChanged", player: pl.id, mission });
  }

  private checkWin(): void {
    if (this.winner !== null) return;
    if (this.config.mode === "domination") {
      const alive = this.alivePlayers();
      if (alive.length === 1) this.declareWinner(alive[0]!, "domination");
      return;
    }
    const n = this.config.numPlayers;
    for (let i = 0; i < n; i++) {
      const p = (this.current + i) % n;
      if (this.missionComplete(p)) {
        this.declareWinner(p, "mission");
        return;
      }
    }
    const alive = this.alivePlayers();
    if (alive.length === 1) this.declareWinner(alive[0]!, "domination");
  }

  private declareWinner(p: PlayerId, reason: "mission" | "domination"): void {
    this.winner = p;
    this.phase = "gameOver";
    this.log.push({ type: "win", player: p, reason });
  }
}

/** "fullAtom" if the non-wild particles are all different, "threeOfAKind" if all the same, else null. */
export function setKind(cards: SectorCard[]): "fullAtom" | "threeOfAKind" | null {
  if (cards.length !== 3) return null;
  const real = cards.filter((c) => c.particle !== "photon").map((c) => c.particle);
  if (new Set(real).size === real.length) return "fullAtom";
  if (new Set(real).size === 1) return "threeOfAKind";
  return null;
}
