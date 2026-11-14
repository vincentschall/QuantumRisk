import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PoolFileProvider } from "../src/node/bitPool.js";
import { bitAt, CoinTossProvider, CometProvider, MothClient, MothError, QuantumSource, type BitProvider, type FetchLike } from "../src/quantum/index.js";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** Fake Moth API: routes by method + path prefix, records calls. */
function fakeMoth(routes: [string, (init?: RequestInit) => Response][]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const key = `${init?.method ?? "GET"} ${url.replace("https://api.mothquantum.com/api/v1", "")}`;
    const i = routes.findIndex(([k]) => key.startsWith(k));
    if (i < 0) return json(404, { title: "Not Found" });
    const [, handler] = routes[i]!;
    return handler(init);
  };
  return { fetch, calls };
}
const noSleep = async () => {};
const cometResult = (hex: string) => ({
  result: { output: { random: { hex, bits: hex.length * 4, bytes: hex.length / 2 }, provenance: { backend: "ibm_test", mode: "qpu" }, entropy_report: { entropy_accounted: true, health_passed: true, grade: "hardware-accounted" } } },
});

test("bits are read most significant bit first", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => bitAt("a5", i)), [1, 0, 1, 0, 0, 1, 0, 1]);
});

test("client submits, long-polls and fetches the result; key only in the header", async () => {
  let polls = 0;
  const { fetch, calls } = fakeMoth([
    ["POST /engines/comet-qrng-v1/process", () => json(202, { job_id: "j1", status: "queued" })],
    ["GET /jobs/j1/status", () => json(200, { job_id: "j1", status: ++polls < 3 ? "running" : "completed" })],
    ["GET /jobs/j1/result", () => json(200, cometResult("ff"))],
  ]);
  const client = new MothClient({ apiKey: "secret-key", fetch, sleep: noSleep });
  const { jobId, result } = await client.run("comet-qrng-v1", { mode: "emu" });
  assert.equal(jobId, "j1");
  assert.equal((result as { output: { random: { hex: string } } }).output.random.hex, "ff");
  assert.equal(polls, 3);
  assert.ok(calls.every((c) => !c.url.includes("secret-key")));
  assert.equal((calls[0]!.init!.headers as Record<string, string>).Authorization, "Bearer secret-key");
  assert.deepEqual(JSON.parse(String(calls[0]!.init!.body)), { params: { mode: "emu" } });
});

test("client retries 429 and reports failed jobs without leaking the key", async () => {
  let tries = 0;
  const { fetch } = fakeMoth([
    ["POST /engines/x/process", () => (++tries < 3 ? json(429, { title: "Too Many Requests" }) : json(202, { job_id: "j2" }))],
    ["GET /jobs/j2/status", () => json(200, { job_id: "j2", status: "failed", error: { message: "backend down" } })],
  ]);
  const client = new MothClient({ apiKey: "secret-key", fetch, sleep: noSleep });
  await assert.rejects(client.run("x", {}), (e: Error) => e instanceof MothError && /backend down/.test(e.message) && !e.message.includes("secret-key"));
  assert.equal(tries, 3);
  const { fetch: f401 } = fakeMoth([["GET /me", () => json(401, { detail: "invalid key" })]]);
  await assert.rejects(new MothClient({ apiKey: "k", fetch: f401, sleep: noSleep }).me(), (e: MothError) => e.status === 401);
});

test("comet provider labels QPU bits with the backend", async () => {
  const { fetch, calls } = fakeMoth([
    ["POST /engines/comet-qrng-v1/process", () => json(202, { job_id: "j3" })],
    ["GET /jobs/j3/status", () => json(200, { job_id: "j3", status: "completed" })],
    ["GET /jobs/j3/result", () => json(200, cometResult("0f".repeat(600)))],
  ]);
  const batch = await new CometProvider(new MothClient({ apiKey: "k", fetch, sleep: noSleep }), { mode: "qpu" }).fetch(100);
  assert.equal(batch.source, "moth-qpu:ibm_test");
  assert.equal(batch.meta?.certified, true);
  const params = JSON.parse(String(calls[0]!.init!.body)).params;
  assert.equal(params.mode, "qpu");
  assert.equal(params.bell_witness, true);
});

test("quantum source uses providers in order and labels every bit", async () => {
  const failing: BitProvider = { name: "pool", fetch: async () => { throw new Error("empty"); } };
  const fixed: BitProvider = { name: "moth-emu", fetch: async () => ({ source: "moth-emu", hex: "a", used: 0 }) };
  const errors: string[] = [];
  const src = new QuantumSource({ providers: [failing, fixed], lowWater: 0, onProviderError: (p) => errors.push(p) });
  await src.ready(4);
  assert.deepEqual(errors, ["pool"]);
  const out = [src.measure(), src.measure(), src.measure(), src.measure()];
  assert.deepEqual(out, [1, 0, 1, 0]);
  assert.equal(src.measurementSource, "moth-emu");
  // Buffer exhausted and no refill yet: still answers, honestly labelled.
  src.measure();
  assert.equal(src.measurementSource, "local-crypto (buffer empty)");
});

test("quantum source falls back to local crypto when every provider fails", async () => {
  const slow: BitProvider = { name: "moth-emu", fetch: () => new Promise(() => {}) };
  const src = new QuantumSource({ providers: [slow], providerTimeoutMs: 10, lowWater: 0 });
  await src.ready(8);
  assert.ok(src.buffered >= 8);
  src.measure();
  assert.equal(src.measurementSource, "local-crypto");
});

test("pool file hands out every bit exactly once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qr-pool-"));
  try {
    const pool = new PoolFileProvider(join(dir, "pool.json"));
    pool.add({ source: "moth-qpu:ibm_test", hex: "f0f0", used: 0 });
    pool.add({ source: "moth-qpu:ibm_other", hex: "aa", used: 0 });
    assert.equal(pool.available(), 24);
    const a = await pool.fetch(5); // rounds up to 8 bits
    assert.deepEqual([a.hex, a.source], ["f0", "moth-qpu:ibm_test"]);
    const b = await pool.fetch(100); // only the rest of the first batch
    assert.equal(b.hex, "f0");
    const c = await pool.fetch(8);
    assert.deepEqual([c.hex, c.source], ["aa", "moth-qpu:ibm_other"]);
    assert.equal(pool.available(), 0);
    await assert.rejects(pool.fetch(1), /empty/);
    // A fresh provider on the same file sees the same (empty) state.
    assert.equal(new PoolFileProvider(join(dir, "pool.json")).available(), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("coin-toss provider turns single shots into bits (tails = 1)", async () => {
  const shots = [{ heads: 0, tails: 1 }, { heads: 1, tails: 0 }, { heads: 0, tails: 1 }];
  let n = 0;
  const { fetch } = fakeMoth([
    ["POST /engines/coin-toss-v1/process", () => json(202, { job_id: `c${n}` })],
    ["GET /jobs/", () => json(200, { job_id: "c", status: "completed" })],
  ]);
  const wrapped: FetchLike = (url, init) => (url.endsWith("/result") ? Promise.resolve(json(200, { result: { ...shots[n++]!, backend: "aer" } })) : fetch(url, init));
  const batch = await new CoinTossProvider(new MothClient({ apiKey: "k", fetch: wrapped, sleep: noSleep }), { mode: "emu" }).fetch(3);
  const src = new QuantumSource({ providers: [], lowWater: 0 });
  src.add(batch);
  assert.deepEqual([src.measure(), src.measure(), src.measure()], [1, 0, 1]);
  assert.equal(src.measurementSource, "moth-coin-emu");
  assert.equal(src.buffered, 0);
});
