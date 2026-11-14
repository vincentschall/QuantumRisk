/**
 * Sources of randomness. The engine never calls Math.random directly:
 * - `rng` is used for setup (dealing, missions, card shuffles),
 * - `measure` decides every quantum measurement (0 = first branch, 1 = second branch).
 * In the real game `measure` is fed by the Moth Quantum backend (src/quantum/); in simulations both are
 * seeded PRNGs. `measure` is synchronous: async sources buffer bits ahead of time.
 */
export interface RandomSource {
  rng: () => number;
  measure: () => 0 | 1;
  /** Source of the bit returned by the most recent `measure()` call. The engine reads it right after each call. */
  readonly measurementSource: string;
}

/** Small, fast, seedable PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededSource(seed: number): RandomSource {
  const rng = mulberry32(seed);
  const q = mulberry32(seed ^ 0x9e3779b9);
  return { rng, measure: () => (q() < 0.5 ? 0 : 1), measurementSource: "local-prng" };
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
