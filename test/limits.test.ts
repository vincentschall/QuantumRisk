import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PoolFileProvider } from "../src/node/bitPool.js";
import { BudgetedProvider, DailyBudget } from "../src/node/budget.js";
import { PoolRefiller } from "../src/node/poolRefill.js";
import { LocalCryptoProvider } from "../src/quantum/index.js";
import { clientIp, ConnectionCounter, TokenBucket, WindowLimit } from "../src/server/limits.js";

test("token bucket allows a burst, then the refill rate", () => {
  let t = 0;
  const b = new TokenBucket(2, 3, () => t);
  assert.deepEqual([b.take(), b.take(), b.take(), b.take()], [true, true, true, false]);
  t = 500; // half a second refills one token
  assert.deepEqual([b.take(), b.take()], [true, false]);
});

test("window limit counts per key and forgets old events", () => {
  let t = 0;
  const w = new WindowLimit(2, 1000, () => t);
  assert.deepEqual([w.hit("a"), w.hit("a"), w.hit("a"), w.hit("b")], [true, true, false, true]);
  t = 1000;
  assert.equal(w.hit("a"), true);
});

test("connection counter caps open connections per key", () => {
  const c = new ConnectionCounter(2);
  assert.deepEqual([c.add("a"), c.add("a"), c.add("a")], [true, true, false]);
  c.remove("a");
  assert.equal(c.add("a"), true);
});

test("client IP trusts only the proxy's last X-Forwarded-For entry", () => {
  assert.equal(clientIp("10.0.0.2", "6.6.6.6, 1.2.3.4", true), "1.2.3.4");
  assert.equal(clientIp("10.0.0.2", "1.2.3.4", false), "10.0.0.2");
  assert.equal(clientIp("10.0.0.2", undefined, true), "10.0.0.2");
});

test("daily credit budget stops a paid provider and resets the next day", async () => {
  let now = new Date("2026-11-16T23:00:00Z");
  const budget = new DailyBudget(10, join(mkdtempSync(join(tmpdir(), "qr-budget-")), "budget.json"), () => now);
  const p = new BudgetedProvider(new LocalCryptoProvider(), budget, 5);
  await p.fetch(8);
  await p.fetch(8);
  assert.equal(budget.spent(), 10);
  await assert.rejects(p.fetch(8), /budget/);
  now = new Date("2026-11-17T00:00:01Z");
  assert.equal(budget.spent(), 0);
  await p.fetch(8);
  assert.equal(budget.spent(), 5);
});

test("pool refiller starts one QPU job when the pool is low, and backs off after a failure", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qr-refill-"));
  const pool = new PoolFileProvider(join(dir, "pool.json"));
  const budget = new DailyBudget(100, join(dir, "budget.json"));
  let t = 0;
  let calls = 0;
  let fail = false;
  const qpu = {
    name: "fake-qpu",
    fetch: async () => {
      calls++;
      if (fail) throw new Error("queue timeout");
      return { source: "moth-qpu:fake", hex: "ab".repeat(1000), used: 0 };
    },
  };
  const r = new PoolRefiller({ pool, qpu, budget, credits: 5, minBits: 5000, retryMs: 1000, now: () => t });
  const job = r.check();
  assert.equal(r.check(), job); // only one job at a time
  await job;
  assert.equal(calls, 1);
  assert.equal(pool.available(), 8000);
  assert.equal(budget.spent(), 5);
  assert.equal(r.check(), null); // pool is full enough now
  await pool.fetch(4000); // drain below the threshold
  fail = true;
  await r.check();
  assert.equal(calls, 2);
  assert.equal(r.check(), null); // waiting after the failure
  t = 1000;
  await r.check();
  assert.equal(calls, 3);
});
