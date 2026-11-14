import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { remaining, type BitBatch } from "../quantum/bits.js";
import type { BitProvider } from "../quantum/providers.js";

/** Default pool file (gitignored). Holds pre-fetched QPU bits so games don't wait for hardware queues. */
export const DEFAULT_POOL_PATH = fileURLToPath(new URL("../../quantum-pool/pool.json", import.meta.url));

interface PoolFile {
  batches: BitBatch[];
}

/**
 * File-backed pool of measurement bits. Bits handed out are marked used on disk before they are
 * returned, so no bit is ever used twice, even after a crash.
 */
export class PoolFileProvider implements BitProvider {
  constructor(
    readonly path = DEFAULT_POOL_PATH,
    readonly name = "pool",
  ) {}

  read(): PoolFile {
    try {
      return JSON.parse(readFileSync(this.path, "utf8")) as PoolFile;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { batches: [] };
      throw e;
    }
  }

  available(): number {
    return this.read().batches.reduce((n, b) => n + remaining(b), 0);
  }

  add(batch: BitBatch): void {
    const pool = this.read();
    pool.batches.push({ ...batch, used: Math.ceil(batch.used / 4) * 4 });
    this.write(pool);
  }

  async fetch(minBits: number): Promise<BitBatch> {
    const pool = this.read();
    const b = pool.batches.find((x) => remaining(x) > 0);
    if (!b) throw new Error("Bit pool is empty");
    // The pool only reserves whole hex digits (4 bits), so `used` stays nibble-aligned and the
    // returned slice never overlaps bits that remain in the pool.
    const take = Math.min(Math.ceil(Math.max(minBits, 1) / 4) * 4, remaining(b));
    const start = b.used;
    b.used += take;
    pool.batches = pool.batches.filter((x) => remaining(x) > 0);
    this.write(pool);
    return { source: b.source, hex: b.hex.slice(start / 4, (start + take) / 4), used: 0, meta: b.meta };
  }

  private write(pool: PoolFile): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(pool));
    renameSync(tmp, this.path);
  }
}
