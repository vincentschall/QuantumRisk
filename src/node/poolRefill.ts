import { remaining } from "../quantum/bits.js";
import type { BitProvider } from "../quantum/providers.js";
import type { PoolFileProvider } from "./bitPool.js";
import type { DailyBudget } from "./budget.js";

export interface PoolRefillOptions {
  pool: PoolFileProvider;
  /** A QPU provider with a long timeout (hardware queues can take hours). */
  qpu: BitProvider;
  budget: DailyBudget;
  /** Credits one QPU job costs. */
  credits: number;
  /** Start a job when the pool has fewer unused bits than this. */
  minBits: number;
  /** Wait at least this long after a failed job before trying again. Default 1 hour. */
  retryMs?: number;
  log?: (msg: string) => void;
  now?: () => number;
}

/**
 * Keeps the QPU bit pool topped up from inside the server: when the pool runs low it starts one
 * QPU job in the background and adds the bits when it finishes. Games never wait for it; until the
 * job is done, measurements come from the pool's remaining bits or live emulator jobs.
 */
export class PoolRefiller {
  private running: Promise<void> | null = null;
  private runningSince = 0;
  private lastFailure = -Infinity;

  constructor(private readonly opts: PoolRefillOptions) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** Short status for the health check. */
  status(): string {
    if (this.running) return `QPU job running for ${Math.round((this.now() - this.runningSince) / 60_000)} min`;
    if (this.now() - this.lastFailure < (this.opts.retryMs ?? 3600_000)) return "waiting after a failed QPU job";
    return "idle";
  }

  /** Start a refill if the pool is low and none is running. Returns the running job, if any. */
  check(): Promise<void> | null {
    if (this.running) return this.running;
    if (this.now() - this.lastFailure < (this.opts.retryMs ?? 3600_000)) return null;
    const available = this.opts.pool.available();
    if (available >= this.opts.minBits) return null;
    if (!this.opts.budget.trySpend(this.opts.credits)) return null;
    const log = this.opts.log ?? (() => {});
    log(`bit pool low (${available} bits): starting a QPU job`);
    this.runningSince = this.now();
    this.running = this.opts.qpu
      .fetch(1024)
      .then((batch) => {
        this.opts.pool.add(batch);
        log(`bit pool +${remaining(batch)} bits from ${batch.source} after ${Math.round((this.now() - this.runningSince) / 60_000)} min`);
      })
      .catch((e: unknown) => {
        this.lastFailure = this.now();
        log(`QPU pool refill failed: ${(e as Error).message}`);
      })
      .finally(() => (this.running = null));
    return this.running;
  }
}
