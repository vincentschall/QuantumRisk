import type { RandomSource } from "../engine/random.js";
import { remaining, takeBit, type BitBatch } from "./bits.js";
import { LocalCryptoProvider, type BitProvider } from "./providers.js";

export interface QuantumSourceOptions {
  /** Tried in order until one delivers, e.g. [qpu pool, live emu]. Local crypto is always the final fallback. */
  providers: BitProvider[];
  /** Per-provider time limit for one fetch. Default 60 s. */
  providerTimeoutMs?: number;
  /** Start a background refill when fewer bits than this are buffered. Default 64. */
  lowWater?: number;
  /** Called when a provider fails (for server logs). */
  onProviderError?: (provider: string, error: unknown) => void;
  /** RNG for setup and card shuffles (not quantum). Default: Web Crypto. */
  rng?: () => number;
}

/**
 * RandomSource for real games. The engine is synchronous, so measurement bits are buffered ahead:
 * call `await ready(n)` before an action that measures n stacks (or once at game start; one Moth job
 * buffers thousands of bits). `measure()` never blocks: if the buffer is somehow empty it falls back
 * to local crypto and labels the bit "local-crypto (buffer empty)", so the log stays honest.
 */
export class QuantumSource implements RandomSource {
  readonly rng: () => number;
  private batches: BitBatch[] = [];
  private lastSource = "none";
  private refilling: Promise<void> | null = null;
  private readonly fallback = new LocalCryptoProvider();

  constructor(private readonly opts: QuantumSourceOptions) {
    this.rng = opts.rng ?? cryptoRng;
  }

  get measurementSource(): string {
    return this.lastSource;
  }

  get buffered(): number {
    return this.batches.reduce((n, b) => n + remaining(b), 0);
  }

  /** Bits buffered per source label. */
  bufferedBySource(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const b of this.batches) out[b.source] = (out[b.source] ?? 0) + remaining(b);
    return out;
  }

  /** Buffer a batch directly (e.g. one fetched elsewhere). */
  add(batch: BitBatch): void {
    if (remaining(batch) > 0) this.batches.push(batch);
  }

  measure(): 0 | 1 {
    while (this.batches.length && remaining(this.batches[0]!) <= 0) this.batches.shift();
    const b = this.batches[0];
    let bit: 0 | 1;
    if (b) {
      bit = takeBit(b);
      this.lastSource = b.source;
    } else {
      const x = new Uint8Array(1);
      globalThis.crypto.getRandomValues(x);
      bit = (x[0]! & 1) as 0 | 1;
      this.lastSource = "local-crypto (buffer empty)";
    }
    if (this.buffered < (this.opts.lowWater ?? 64)) void this.refill(0).catch(() => {});
    return bit;
  }

  /** Make sure at least `n` bits are buffered. Never rejects: falls back to local crypto. */
  async ready(n: number): Promise<void> {
    if (this.buffered >= n) return;
    await this.refill(n);
    if (this.buffered < n) await this.refill(n); // a background refill may have been too small
  }

  private refill(n: number): Promise<void> {
    if (!this.refilling) {
      this.refilling = this.fetchFromProviders(Math.max(n - this.buffered, 1)).finally(() => (this.refilling = null));
    }
    return this.refilling;
  }

  private async fetchFromProviders(minBits: number): Promise<void> {
    const timeout = this.opts.providerTimeoutMs ?? 60_000;
    for (const p of this.opts.providers) {
      try {
        const batch = await withTimeout(p.fetch(minBits), timeout, p.name);
        if (remaining(batch) > 0) {
          this.batches.push(batch);
          if (this.buffered >= minBits) return;
        }
      } catch (e) {
        this.opts.onProviderError?.(p.name, e);
      }
    }
    // Final fallback, labelled as such in the log.
    this.batches.push(await this.fallback.fetch(minBits - this.buffered));
  }
}

function cryptoRng(): number {
  const x = new Uint32Array(1);
  globalThis.crypto.getRandomValues(x);
  return x[0]! / 4294967296;
}

function withTimeout<T>(p: Promise<T>, ms: number, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${name} timed out after ${ms} ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}
