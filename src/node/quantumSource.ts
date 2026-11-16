import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CometProvider, MothClient, QuantumSource, type BitProvider } from "../quantum/index.js";
import { PoolFileProvider } from "./bitPool.js";
import { BudgetedProvider, type DailyBudget } from "./budget.js";

const ENV_PATH = fileURLToPath(new URL("../../.env", import.meta.url));

/** Read MOTH_API_KEY from the environment or the repo's .env. Returns "" if it is not set. */
export function mothApiKey(): string {
  if (!process.env.MOTH_API_KEY && existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);
  return process.env.MOTH_API_KEY ?? "";
}

export function mothClient(): MothClient {
  return new MothClient({ apiKey: mothApiKey() });
}

/** Credits one comet-qrng-v1 job costs. */
export const COMET_CREDITS = 5;

/**
 * The game's measurement source: pre-fetched QPU bits from the pool file first, then a live Moth
 * emulator job, then local crypto. Every bit is labelled with where it came from. With a `budget`,
 * live jobs stop for the day once it is used up.
 */
export function createHybridSource(
  opts: { pool?: PoolFileProvider; live?: boolean; budget?: DailyBudget; onProviderError?: (p: string, e: unknown) => void } = {},
): QuantumSource {
  const providers: BitProvider[] = [opts.pool ?? new PoolFileProvider()];
  const key = mothApiKey();
  if (key && opts.live !== false) {
    const comet = new CometProvider(new MothClient({ apiKey: key }), { mode: "emu", timeoutMs: 30_000 });
    providers.push(opts.budget ? new BudgetedProvider(comet, opts.budget, COMET_CREDITS) : comet);
  }
  return new QuantumSource({ providers, providerTimeoutMs: 45_000, onProviderError: opts.onProviderError });
}
