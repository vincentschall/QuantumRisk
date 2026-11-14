/**
 * Moth Quantum tools. Usage:
 *   npm run moth -- check                      key, latency and bit yield of one emu job (5 credits)
 *   npm run moth -- pool                       show the local bit pool
 *   npm run moth -- fill [--mode qpu|emu] [--jobs 1] [--backend ibm_x]
 *                                              run comet-qrng-v1 jobs and add the bits to the pool (5 credits each)
 *   npm run moth -- game [--players 4] [--pool]   one bot game measured through Moth (live emu; --pool spends pool bits)
 */
import { CometProvider, QuantumSource, remaining } from "../quantum/index.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeConfig } from "../engine/index.js";
import { playGame } from "../sim/simulate.js";
import { PoolFileProvider } from "./bitPool.js";
import { loadMap } from "./loadMap.js";
import { createHybridSource, mothClient } from "./quantumSource.js";

const [cmd = "check", ...args] = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const pool = new PoolFileProvider();
const secs = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

function showPool() {
  const { batches } = pool.read();
  console.log(`Pool ${pool.path}: ${pool.available()} unused bits in ${batches.length} batch(es)`);
  for (const b of batches) console.log(`  ${b.source}  ${remaining(b)} bits  job ${String(b.meta?.jobId ?? "?")}  certified ${String(b.meta?.certified ?? false)}`);
}

async function check() {
  const client = mothClient();
  let t0 = Date.now();
  const me = await client.me();
  console.log(`API key OK (role ${me.platform_role ?? "?"}), ${secs(t0)}`);
  t0 = Date.now();
  const batch = await new CometProvider(client, { mode: "emu" }).fetch(1024);
  console.log(`comet-qrng-v1 emu: ${remaining(batch)} bits in ${secs(t0)} (job ${String(batch.meta?.jobId)})`);
  const src = new QuantumSource({ providers: [] });
  src.add(batch);
  const bits = Array.from({ length: 16 }, () => src.measure()).join("");
  console.log(`16 measurements: ${bits} (source ${src.measurementSource})`);
  showPool();
}

async function fill() {
  const mode = arg("mode", "qpu") as "qpu" | "emu";
  const jobs = Number(arg("jobs", "1"));
  const backend = args.includes("--backend") ? arg("backend", "") : undefined;
  const provider = new CometProvider(mothClient(), { mode, backendName: backend, timeoutMs: mode === "qpu" ? 6 * 3600_000 : 120_000 });
  for (let i = 0; i < jobs; i++) {
    const t0 = Date.now();
    console.log(`Job ${i + 1}/${jobs}: comet-qrng-v1 ${mode}${mode === "qpu" ? " (hardware queues can take minutes to hours)" : ""}…`);
    const batch = await provider.fetch(1024);
    pool.add(batch);
    console.log(`  +${remaining(batch)} bits from ${batch.source} in ${secs(t0)} (certified ${String(batch.meta?.certified)})`);
  }
  showPool();
}

async function game() {
  const n = Number(arg("players", "4")) as 2 | 3 | 4;
  const errors: string[] = [];
  const src = createHybridSource({
    pool: args.includes("--pool") ? pool : new PoolFileProvider(join(tmpdir(), "quantumrisk-empty-pool.json")),
    onProviderError: (p, e) => errors.push(`${p}: ${(e as Error).message}`),
  });
  const t0 = Date.now();
  await src.ready(256);
  console.log(`Buffered ${src.buffered} bits in ${secs(t0)}: ${JSON.stringify(src.bufferedBySource())}`);
  const bots = ["quantum", "qturtle", "quantum", "qturtle"].slice(0, n);
  const r = playGame(makeConfig(n), loadMap(), bots, 1, 30, src);
  const measures = r.log.filter((e) => e.type === "measure");
  const bySource: Record<string, number> = {};
  for (const m of measures) bySource[m.source] = (bySource[m.source] ?? 0) + 1;
  console.log(`${n}p game: ${r.reason} by seat ${r.winner} after ${r.rounds} rounds; ${r.splits} splits, ${measures.length} measurements`);
  console.log(`Measurement sources: ${JSON.stringify(bySource)}`);
  for (const m of measures.slice(0, 5)) console.log(`  stack ${m.stack} (${m.size} troops, ${m.cause}) -> ${m.sector}  [${m.source}]`);
  if (errors.length) console.log(`Provider errors: ${errors.join("; ")}`);
}

const commands: Record<string, () => Promise<void> | void> = { check, pool: showPool, fill, game };
const run = commands[cmd];
if (!run) {
  console.error(`Unknown command "${cmd}". Use check, pool or fill.`);
  process.exit(1);
}
await Promise.resolve(run()).catch((e: unknown) => {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
});
