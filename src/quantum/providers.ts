import { bytesToHex, type BitBatch } from "./bits.js";
import { MothClient, MothError } from "./moth.js";

/** Something that can deliver fresh measurement bits. */
export interface BitProvider {
  readonly name: string;
  /** Deliver fresh bits, ideally at least `minBits`. A smaller batch is allowed (the next provider tops up). Throws if none. */
  fetch(minBits: number): Promise<BitBatch>;
}

interface CometOutput {
  random: { hex: string; bits: number; bytes: number };
  /** Entropy accounting: grade "hardware-accounted" on a QPU, "simulator-baseline" on emu. */
  entropy_report?: { entropy_accounted?: boolean; grade?: string; health_passed?: boolean };
  certificate?: { certified?: boolean; grade?: string };
  bell_witness?: { S?: number; violates_classical_3sigma?: boolean };
  provenance?: { backend?: string; mode?: string; qpu_seconds?: number | null };
}

export interface CometOptions {
  mode: "emu" | "qpu";
  /** Bytes requested per job. Credits are per run, so the default is the most one job can extract (8192). */
  outputBytes?: number;
  timeoutMs?: number;
  backendName?: string;
}

/**
 * Moth `comet-qrng-v1`: qubits prepared in |+⟩ and measured, then entropy-checked and extracted.
 * One job (5 credits) yields tens of thousands of bits, so one job covers many games.
 * Requests 20 qubits × 10,000 shots (the emu cap), which yields about 65,000 bits after extraction.
 */
export class CometProvider implements BitProvider {
  readonly name: string;
  constructor(
    private readonly client: MothClient,
    private readonly opts: CometOptions,
  ) {
    this.name = `moth-${opts.mode}`;
  }

  async fetch(minBits: number): Promise<BitBatch> {
    const { jobId, result } = await this.client.run<{ output: CometOutput }>(
      "comet-qrng-v1",
      {
        mode: this.opts.mode,
        num_qubits: 20,
        shots: 10_000,
        output_bytes: Math.max(this.opts.outputBytes ?? 8192, Math.ceil(minBits / 8)),
        bell_witness: this.opts.mode === "qpu",
        include_raw_counts: false,
        ...(this.opts.backendName ? { backend_name: this.opts.backendName } : {}),
      },
      this.opts.timeoutMs,
    );
    const out = result.output;
    const hex = out?.random?.hex ?? "";
    if (hex.length * 4 < minBits) throw new MothError(`comet-qrng-v1 returned ${hex.length * 4} bits, needed ${minBits}`);
    const backend = out.provenance?.backend;
    return {
      source: backend && this.opts.mode === "qpu" ? `${this.name}:${backend}` : this.name,
      hex,
      used: 0,
      meta: {
        engine: "comet-qrng-v1",
        jobId,
        backend,
        certified: (out.entropy_report?.entropy_accounted && out.entropy_report?.health_passed) ?? out.certificate?.certified ?? false,
        grade: out.entropy_report?.grade ?? out.certificate?.grade,
        bellS: out.bell_witness?.S,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}

/** Last-resort fallback: the platform's cryptographic RNG (Web Crypto, available in Node and browsers). */
export class LocalCryptoProvider implements BitProvider {
  readonly name = "local-crypto";
  async fetch(minBits: number): Promise<BitBatch> {
    const bytes = new Uint8Array(Math.ceil(minBits / 8));
    globalThis.crypto.getRandomValues(bytes);
    return { source: this.name, hex: bytesToHex(bytes), used: 0 };
  }
}

/**
 * Moth `coin-toss-v1`: literally one qubit, Hadamard, measure, run at the moment it is needed.
 * One job per bit (2 credits, a few seconds on emu), so use it only where that literalness matters.
 * heads = 0, tails = 1.
 */
export class CoinTossProvider implements BitProvider {
  readonly name: string;
  constructor(
    private readonly client: MothClient,
    private readonly opts: { mode: "emu" | "qpu"; timeoutMs?: number; backendName?: string },
  ) {
    this.name = `moth-coin-${opts.mode}`;
  }

  async fetch(minBits: number): Promise<BitBatch> {
    const bits: (0 | 1)[] = [];
    let backend: string | undefined;
    for (let i = 0; i < Math.max(1, minBits); i++) {
      const { result } = await this.client.run<{ heads: number; tails: number; backend?: string }>(
        "coin-toss-v1",
        { mode: this.opts.mode, shots: 1, ...(this.opts.backendName ? { backend_name: this.opts.backendName } : {}) },
        this.opts.timeoutMs,
      );
      if (result.heads + result.tails !== 1) throw new MothError("coin-toss-v1 did not return exactly one shot");
      bits.push(result.tails === 1 ? 1 : 0);
      backend = result.backend;
    }
    // Pad to whole hex digits; padding bits are marked used so they are never handed out.
    const pad = (4 - (bits.length % 4)) % 4;
    const all = [...Array<0>(pad).fill(0), ...bits];
    let hex = "";
    for (let i = 0; i < all.length; i += 4) hex += ((all[i]! << 3) | (all[i + 1]! << 2) | (all[i + 2]! << 1) | all[i + 3]!).toString(16);
    return { source: this.opts.mode === "qpu" && backend ? `${this.name}:${backend}` : this.name, hex, used: pad };
  }
}
