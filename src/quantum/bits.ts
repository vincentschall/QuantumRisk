/** A batch of measurement bits from one source, stored compactly as hex and consumed front to back. */
export interface BitBatch {
  /** Label written to the game log for every bit of this batch, e.g. "moth-qpu:ibm_fez". */
  source: string;
  hex: string;
  /** Bits already consumed. Bits are never reused. */
  used: number;
  /** Optional provenance (job id, backend, certificate grade, fetch time). */
  meta?: Record<string, unknown>;
}

export const batchSize = (b: BitBatch) => b.hex.length * 4;
export const remaining = (b: BitBatch) => batchSize(b) - b.used;

/** Bit i of a hex string, most significant bit of each nibble first. */
export function bitAt(hex: string, i: number): 0 | 1 {
  const nibble = parseInt(hex[i >> 2]!, 16);
  if (Number.isNaN(nibble)) throw new Error(`Invalid hex at bit ${i}`);
  return ((nibble >> (3 - (i & 3))) & 1) as 0 | 1;
}

/** Take the next bit from a batch, advancing `used`. */
export function takeBit(b: BitBatch): 0 | 1 {
  if (remaining(b) <= 0) throw new Error(`Batch from ${b.source} is empty`);
  return bitAt(b.hex, b.used++);
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (const x of bytes) s += x.toString(16).padStart(2, "0");
  return s;
}
