/**
 * Simple heuristic bots for balance testing. They are not meant to play well, only consistently,
 * so that differences between rule variants show up in the statistics.
 */
import { NEUTRAL, type Game, type PlayerId } from "../engine/index.js";

export interface Bot {
  name: string;
  setup(g: Game): void;
  turn(g: Game): void;
}

interface Style {
  name: string;
  /** Commit everything (true) or only what's needed plus a margin (false). */
  allIn: boolean;
  /** Attack a quantum branch when it can only win if the stack is absent (50/50). */
  gamble: boolean;
  /** Max attacks per turn that don't complete a cluster or serve the mission. */
  opportunisticAttacks: number;
  /** Use splits / self-measure / quantum cards. */
  quantum: boolean;
  /** Share of reinforcements spread over threatened borders before staging an attack. */
  defensiveShare: number;
  /** "half": split half of the biggest stack; "interior": superpose idle interior troops over two borders. */
  splitMode?: "half" | "interior";
}

export const STYLES: Record<string, Style> = {
  greedy: { name: "greedy", allIn: true, gamble: true, opportunisticAttacks: 99, quantum: false, defensiveShare: 0 },
  turtle: { name: "turtle", allIn: false, gamble: false, opportunisticAttacks: 1, quantum: false, defensiveShare: 0.6 },
  quantum: { name: "quantum", allIn: true, gamble: true, opportunisticAttacks: 99, quantum: true, defensiveShare: 0, splitMode: "half" },
  qturtle: { name: "qturtle", allIn: false, gamble: false, opportunisticAttacks: 1, quantum: true, defensiveShare: 0.6, splitMode: "interior" },
};

export function makeBot(style: string): Bot {
  const s = STYLES[style];
  if (!s) throw new Error(`Unknown bot style ${style}`);
  return new HeuristicBot(s);
}

// ───────────────────────────── helpers ─────────────────────────────

function enemyNeighbors(g: Game, s: string, me: PlayerId): string[] {
  return g.neighbors(s).filter((n) => g.owner(n) !== me);
}

/** Largest attack an active enemy could launch into `s` (neutral never attacks). */
function threat(g: Game, s: string, me: PlayerId): number {
  let t = 0;
  for (const n of g.neighbors(s)) {
    const o = g.owner(n);
    if (o !== me && o !== NEUTRAL) t = Math.max(t, g.troops(n) - 1);
  }
  return t;
}

function defence(g: Game, to: string): { best: number; worst: number } {
  const best = g.troops(to) + (g.map.strongholds.has(to) ? g.config.strongholdBonus : 0);
  const worst = best + g.stacksAt(to).reduce((a, st) => a + st.size, 0);
  return { best, worst };
}

function missionClusters(g: Game, me: PlayerId): string[] {
  const m = g.players[me]!.mission;
  return m?.kind === "clusters" ? [...m.clusters] : [];
}

function rivalTarget(g: Game, me: PlayerId): PlayerId | null {
  const m = g.players[me]!.mission;
  return m?.kind === "rival" ? m.target : null;
}

/** The cluster this player should focus on now. */
function focusCluster(g: Game, me: PlayerId): string {
  const mission = missionClusters(g, me);
  let best = g.map.clusters[0]!;
  let bestScore = -Infinity;
  for (const c of g.map.clusters) {
    const secs = g.map.clusterSectors.get(c)!;
    const owned = secs.filter((s) => g.owner(s) === me).length;
    if (owned === secs.length && !mission.includes(c)) continue;
    const enemy = secs.filter((s) => g.owner(s) !== me).reduce((a, s) => a + g.troops(s), 0);
    const score =
      (owned / secs.length) * 3 + (g.map.bonus.get(c)! / secs.length) * 2 - enemy / 8 + (mission.includes(c) ? 3 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function completesCluster(g: Game, me: PlayerId, to: string): boolean {
  const c = g.map.clusterOf.get(to)!;
  return g.map.clusterSectors.get(c)!.every((s) => s === to || g.owner(s) === me);
}

function targetScore(g: Game, me: PlayerId, to: string, focus: string, cost: number): number {
  let score = -cost * 0.35;
  const c = g.map.clusterOf.get(to)!;
  if (c === focus) score += 3;
  if (completesCluster(g, me, to)) score += 6;
  if (missionClusters(g, me).includes(c)) score += 2;
  const owner = g.owner(to);
  if (owner !== NEUTRAL && owner === rivalTarget(g, me)) score += 3;
  // Breaking an enemy's full cluster is valuable.
  if (owner !== NEUTRAL && g.ownsCluster(owner, c)) score += 3;
  return score;
}

// ───────────────────────────── bot ─────────────────────────────

class HeuristicBot implements Bot {
  readonly name: string;
  constructor(private readonly style: Style) {
    this.name = style.name;
  }

  setup(g: Game): void {
    const me = g.current;
    const n = Math.min(g.config.setupChunk, g.setupRemaining[me]!);
    g.setupPlace({ [this.stagingSector(g, me)]: n });
  }

  turn(g: Game): void {
    const me = g.current;
    this.reinforce(g, me);
    if (g.isOver) return;
    g.endPhase(); // -> quantum
    if (this.style.quantum) this.quantumPhase(g, me);
    if (g.isOver) return;
    g.endPhase(); // -> attack
    this.attackPhase(g, me);
    if (g.isOver) return;
    g.endPhase(); // -> fortify
    this.fortifyPhase(g, me);
    if (g.isOver) return;
    g.endTurn();
  }

  // Sector that should receive troops: next to the best attack target, else the most threatened border.
  private stagingSector(g: Game, me: PlayerId): string {
    const focus = focusCluster(g, me);
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const s of g.ownedSectors(me)) {
      for (const to of enemyNeighbors(g, s, me)) {
        const { worst } = defence(g, to);
        const score = targetScore(g, me, to, focus, worst) + g.troops(s) * 0.05;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
    }
    return best ?? g.ownedSectors(me)[0]!;
  }

  private reinforce(g: Game, me: PlayerId): void {
    // Trade whenever possible (mandatory at the hand limit anyway).
    for (let sets = g.findSets(me); sets.length; sets = g.findSets(me)) {
      // Prefer the set with the most owned sectors shown.
      const cards = g.players[me]!.cards;
      sets.sort(
        (a, b) =>
          b.filter((i) => cards[i]!.sector && g.owner(cards[i]!.sector!) === me).length -
          a.filter((i) => cards[i]!.sector && g.owner(cards[i]!.sector!) === me).length,
      );
      g.tradeSet(sets[0] as [number, number, number]);
      if (g.isOver) return;
    }
    let left = g.reinforcementsLeft;
    const placements: Record<string, number> = {};
    const add = (s: string, n: number) => {
      placements[s] = (placements[s] ?? 0) + n;
      left -= n;
    };
    let defensive = Math.floor(left * this.style.defensiveShare);
    if (defensive > 0) {
      const borders = g
        .ownedSectors(me)
        .map((s) => ({ s, deficit: threat(g, s, me) - g.troops(s) }))
        .filter((b) => b.deficit >= 0)
        .sort((a, b) => b.deficit - a.deficit);
      for (const b of borders) {
        if (defensive <= 0) break;
        const n = Math.min(defensive, b.deficit + 1);
        add(b.s, n);
        defensive -= n;
      }
    }
    if (left > 0) add(this.stagingSector(g, me), left);
    g.place(placements);
  }

  private quantumPhase(g: Game, me: PlayerId): void {
    const pl = g.players[me]!;
    // Forced Measurement on enemy stacks next to our sectors removes uncertainty before attacking.
    while (pl.quantumCards.includes("forcedMeasurement")) {
      const target = g.stacks.find(
        (st) => st.owner !== me && st.branches.some((b) => g.neighbors(b).some((n) => g.owner(n) === me && g.troops(n) > 3)),
      );
      if (!target) break;
      g.playForcedMeasurement(target.id);
      if (g.isOver) return;
    }
    if (pl.quantumCards.includes("extraSplit")) g.playExtraSplit();

    // Self-measure a stack that no longer protects anything.
    const idle = g.stacksOf(me).find((st) => st.branches.every((b) => threat(g, b, me) < g.troops(b)));
    if (idle && !g.quantumActionUsed) {
      g.selfMeasure(idle.id);
      if (g.isOver) return;
    }

    while (g.config.splitPhase === "quantum" && g.canSplit()) {
      const borders = g
        .ownedSectors(me)
        .filter((s) => g.stacksAt(s).length === 0 && threat(g, s, me) > 0)
        .map((s) => ({ s, deficit: threat(g, s, me) - g.troops(s) }))
        .sort((a, b) => b.deficit - a.deficit);
      const interior = this.style.splitMode === "interior";
      const sources = g
        .ownedSectors(me)
        .filter((s) => (interior ? enemyNeighbors(g, s, me).length === 0 && g.troops(s) >= 3 : g.troops(s) >= 6))
        .sort((a, b) => g.troops(b) - g.troops(a));
      let done = false;
      for (const src of sources) {
        const reach = g.reachableOwned(src, me);
        const cands = borders.filter((b) => reach.has(b.s));
        if (cands.length < 2 || (!interior && cands[0]!.deficit < 0)) continue;
        const size = interior ? g.troops(src) - 1 : Math.floor((g.troops(src) - 1) / 2);
        if (size < 2) continue;
        g.split(src, size, cands[0]!.s, cands[1]!.s);
        done = true;
        break;
      }
      if (!done || g.isOver) break;
    }
  }

  private attackPhase(g: Game, me: PlayerId): void {
    if (g.config.noAttacksFirstRound && g.round === 1) return;
    let opportunistic = 0;
    for (let guard = 0; guard < 60 && g.phase === "attack"; guard++) {
      const focus = focusCluster(g, me);
      let best: { from: string; to: string; commit: number; score: number; key: boolean } | null = null;
      for (const from of g.ownedSectors(me)) {
        const avail = g.troops(from) - 1;
        if (avail < g.config.minAttack) continue;
        for (const to of enemyNeighbors(g, from, me)) {
          const min = g.minCommit(to);
          if (avail < min) continue;
          const { best: bestCase, worst } = defence(g, to);
          let commit: number;
          if (avail > worst) commit = this.style.allIn ? avail : Math.min(avail, Math.max(min, worst + 3));
          else if (this.style.gamble && avail > bestCase && worst > bestCase) commit = avail;
          else continue;
          const key = completesCluster(g, me, to) || missionClusters(g, me).includes(g.map.clusterOf.get(to)!) || g.owner(to) === rivalTarget(g, me);
          const certain = avail > worst;
          const score = targetScore(g, me, to, focus, worst) - (certain ? 0 : 2);
          if (!best || score > best.score) best = { from, to, commit, score, key };
        }
      }
      if (!best) return;
      if (!best.key) {
        if (opportunistic >= this.style.opportunisticAttacks) return;
        opportunistic++;
      }
      g.attack(best.from, best.to, best.commit);
    }
  }

  /**
   * Split during Fortify: superpose idle troops (interior sectors, or a border's surplus over its threat)
   * across the two most exposed reachable borders.
   */
  private fortifySplits(g: Game, me: PlayerId): void {
    for (let guard = 0; guard < 24 && g.canSplit() && !g.isOver; guard++) {
      const sources = g
        .ownedSectors(me)
        .map((s) => {
          const interior = enemyNeighbors(g, s, me).length === 0;
          const spare = interior ? g.troops(s) - 1 : g.troops(s) - 1 - threat(g, s, me) - 1;
          return { s, spare };
        })
        .filter((x) => x.spare >= 2)
        .sort((a, b) => b.spare - a.spare);
      let done = false;
      for (const { s: src, spare } of sources) {
        const reach = g.reachableOwned(src, me);
        const cands = [...reach]
          .filter((b) => g.stacksAt(b).length === 0 && threat(g, b, me) > 0)
          .map((b) => ({ b, need: threat(g, b, me) - g.troops(b) }))
          .sort((x, y) => y.need - x.need);
        if (cands.length < 2) continue;
        g.split(src, spare, cands[0]!.b, cands[1]!.b);
        done = true;
        break;
      }
      if (!done) break;
    }
  }

  private fortifyPhase(g: Game, me: PlayerId): void {
    if (this.style.quantum && g.config.splitPhase === "fortify") this.fortifySplits(g, me);
    if (g.isOver) return;
    const owned = g.ownedSectors(me);
    const interior = owned.filter((s) => enemyNeighbors(g, s, me).length === 0 && g.troops(s) > 1);
    for (const s of interior) {
      const reach = g.reachableOwned(s, me);
      let best: string | null = null;
      let bestNeed = -Infinity;
      for (const b of reach) {
        if (b === s || enemyNeighbors(g, b, me).length === 0) continue;
        const need = threat(g, b, me) - g.troops(b) + (g.map.clusterOf.get(b) === focusCluster(g, me) ? 2 : 0);
        if (need > bestNeed) {
          bestNeed = need;
          best = b;
        }
      }
      if (best) g.fortify(s, best, g.troops(s) - 1);
      if (g.isOver) return;
    }
  }
}
