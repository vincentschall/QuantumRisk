import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BitBatch } from "../quantum/bits.js";
import type { BitProvider } from "../quantum/providers.js";

/** Default budget file, next to the bit pool so it survives container restarts. */
export const DEFAULT_BUDGET_PATH = fileURLToPath(new URL("../../quantum-pool/budget.json", import.meta.url));

interface BudgetFile {
  day: string;
  credits: number;
}

/**
 * Daily Moth credit budget (UTC days), kept on disk so a crash loop can't reset it. Credits are
 * counted when a job is submitted, whether or not it succeeds.
 */
export class DailyBudget {
  constructor(
    readonly limit: number,
    readonly path = DEFAULT_BUDGET_PATH,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private today(): string {
    return this.now().toISOString().slice(0, 10);
  }

  /** Credits spent today. */
  spent(): number {
    try {
      const f = JSON.parse(readFileSync(this.path, "utf8")) as BudgetFile;
      return f.day === this.today() ? f.credits : 0;
    } catch {
      return 0;
    }
  }

  /** Records `credits` and returns true, or returns false if that would exceed today's limit. */
  trySpend(credits: number): boolean {
    const spent = this.spent();
    if (spent + credits > this.limit) return false;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ day: this.today(), credits: spent + credits } satisfies BudgetFile));
    renameSync(tmp, this.path);
    return true;
  }
}

/** Wraps a paid provider: each fetch costs `credits`, and once the day's budget is used up it refuses. */
export class BudgetedProvider implements BitProvider {
  readonly name: string;
  constructor(
    private readonly inner: BitProvider,
    private readonly budget: DailyBudget,
    private readonly credits: number,
  ) {
    this.name = inner.name;
  }

  fetch(minBits: number): Promise<BitBatch> {
    if (!this.budget.trySpend(this.credits)) return Promise.reject(new Error(`daily Moth credit budget (${this.budget.limit}) reached`));
    return this.inner.fetch(minBits);
  }
}
