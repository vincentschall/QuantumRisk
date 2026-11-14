/**
 * Balance experiments. Usage:
 *   npm run sim -- [--games 1000] [--only baseline,escalation,...] [--maxRounds 30]
 * Prints markdown tables and writes sim-results/<timestamp>.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { CLASSIC_ESCALATION, makeConfig, type GameConfig } from "../engine/index.js";
import { loadMap } from "../node/loadMap.js";
import { runBatch, type Summary } from "./simulate.js";

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const GAMES = Number(arg("games", "1000"));
const MAX_ROUNDS = Number(arg("maxRounds", "30"));
const ONLY = arg("only", "").split(",").filter(Boolean);

const map = loadMap();

interface Experiment {
  group: string;
  label: string;
  config: GameConfig;
  bots: string[];
  rotate: boolean;
}

const cfg = (n: 2 | 3 | 4, o: Partial<GameConfig> = {}) => makeConfig(n, o);
const experiments: Experiment[] = [];
const add = (group: string, label: string, config: GameConfig, bots: string[], rotate = false) =>
  experiments.push({ group, label, config, bots, rotate });

const noSeatBonus = { seatBonus: { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] } };
const flatExpansion = { ...makeConfig(2).missions, expansionSectors: { 2: 14, 3: 14, 4: 14 } };

// 1. Current rules (DEFAULT_CONFIG) with identical bots: seat differences are pure seat advantage.
for (const n of [2, 3, 4] as const)
  for (const mode of ["missions", "domination"] as const)
    add("baseline", `${n}p ${mode} greedy`, cfg(n, { mode }), Array(n).fill("greedy"));

// 2. Missions alternative: Expansion 14 for every player count, no seat compensation.
for (const n of [2, 3, 4] as const)
  add("missions-alt", `${n}p missions, expansion 14, no seat bonus`, cfg(n, { missions: flatExpansion, ...noSeatBonus }), Array(n).fill("greedy"));

// 3. First-player compensation alternatives.
for (const n of [2, 3, 4] as const) {
  add("seat", `${n}p no seat bonus`, cfg(n, noSeatBonus), Array(n).fill("greedy"));
  add("seat", `${n}p no seat bonus, no attacks in round 1`, cfg(n, { ...noSeatBonus, noAttacksFirstRound: true }), Array(n).fill("greedy"));
  add("seat", `${n}p seat bonus +0/+2/+4/+6`, cfg(n, { seatBonus: { 2: [0, 2], 3: [0, 2, 4], 4: [0, 2, 4, 6] } }), Array(n).fill("greedy"));
}

// 4. Card escalation alternative.
for (const n of [3, 4] as const)
  for (const mode of ["missions", "domination"] as const)
    add("escalation", `${n}p ${mode} escalation`, cfg(n, { mode, escalation: CLASSIC_ESCALATION }), Array(n).fill("greedy"));

// 5. Superposition: bots identical except for splitting, under the current rule and alternatives.
const splitRules: [string, Partial<GameConfig>][] = [
  ["split in Fortify, 1/turn (current)", {}],
  ["split in Fortify, unlimited", { splitsPerTurn: Infinity }],
  ["split in Quantum phase", { splitPhase: "quantum" }],
];
for (const [name, v] of splitRules) {
  add("superposition", `2p quantum vs greedy · ${name}`, cfg(2, v), ["quantum", "greedy"], true);
  add("superposition", `4p quantum vs 3×greedy · ${name}`, cfg(4, v), ["quantum", "greedy", "greedy", "greedy"], true);
  add("superposition", `2p qturtle vs turtle · ${name}`, cfg(2, v), ["qturtle", "turtle"], true);
  add("superposition", `4p 2×qturtle vs 2×turtle · ${name}`, cfg(4, v), ["qturtle", "turtle", "qturtle", "turtle"], true);
}

// 6. Probe rule alternative.
add("probe", "4p quantum vs 3×greedy, probe=stackSize (current)", cfg(4), ["quantum", "greedy", "greedy", "greedy"], true);
add("probe", "4p quantum vs 3×greedy, probe=none", cfg(4, { probeRule: "none" }), ["quantum", "greedy", "greedy", "greedy"], true);

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const results: (Summary & { group: string })[] = [];
let lastGroup = "";
for (const e of experiments) {
  if (ONLY.length && !ONLY.includes(e.group)) continue;
  const t0 = Date.now();
  const s = runBatch(e.label, e.config, map, e.bots, GAMES, { maxRounds: MAX_ROUNDS, rotate: e.rotate });
  results.push({ ...s, group: e.group });
  if (e.group !== lastGroup) {
    console.log(`\n### ${e.group}\n`);
    console.log("| experiment | timeouts | rounds mean (p10/p50/p90) | seat win % | bot win % (per seat) | mission wins | trades | splits | measures | max set | errors | s |");
    console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
    lastGroup = e.group;
  }
  const bots = Object.entries(s.botWinRate).map(([b, w]) => `${b} ${pct(w)}`).join(", ");
  console.log(
    `| ${s.label} | ${pct(s.timeoutRate)} | ${s.rounds.mean.toFixed(1)} (${s.rounds.p10}/${s.rounds.p50}/${s.rounds.p90}) | ${s.seatWinRate.map(pct).join(" / ")} | ${bots} | ${pct(s.missionWins)} | ${s.perGame.trades.toFixed(1)} | ${s.perGame.splits.toFixed(1)} | ${s.perGame.measurements.toFixed(1)} | ${s.perGame.maxSetValue.toFixed(1)} | ${s.errors} | ${((Date.now() - t0) / 1000).toFixed(1)} |`,
  );
  if (s.sampleErrors.length) console.log(`  errors: ${s.sampleErrors.join(" · ")}`);
}

mkdirSync("sim-results", { recursive: true });
const file = `sim-results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify({ games: GAMES, maxRounds: MAX_ROUNDS, results }, null, 2));
console.log(`\nSaved ${file}`);
