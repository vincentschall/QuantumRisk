/** Abuse limits for the public game server. Pure (time is injected), so they are easy to test. */

export type Clock = () => number;

/** Token bucket: `burst` messages at once, refilled at `perSecond`. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private readonly perSecond: number,
    private readonly burst: number,
    private readonly now: Clock = Date.now,
  ) {
    this.tokens = burst;
    this.last = now();
  }

  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** At most `max` events per key within a sliding window of `windowMs`. */
export class WindowLimit {
  private readonly events = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: Clock = Date.now,
  ) {}

  /** Records the event and returns true, or returns false if the key is over its limit. */
  hit(key: string): boolean {
    const t = this.now();
    const recent = (this.events.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.max) {
      this.events.set(key, recent);
      return false;
    }
    recent.push(t);
    this.events.set(key, recent);
    return true;
  }

  /** Forget keys with no recent events (call now and then to bound memory). */
  prune(): void {
    const t = this.now();
    for (const [k, v] of this.events) if (!v.some((x) => t - x < this.windowMs)) this.events.delete(k);
  }
}

/** Counts open connections per key. */
export class ConnectionCounter {
  private readonly open = new Map<string, number>();
  constructor(private readonly max: number) {}

  /** Returns true and counts the connection, or false if the key already has `max` open. */
  add(key: string): boolean {
    const n = this.open.get(key) ?? 0;
    if (n >= this.max) return false;
    this.open.set(key, n + 1);
    return true;
  }

  remove(key: string): void {
    const n = (this.open.get(key) ?? 1) - 1;
    if (n <= 0) this.open.delete(key);
    else this.open.set(key, n);
  }
}

/**
 * The client's IP address. Behind a reverse proxy (TRUST_PROXY), the proxy appends the real client
 * address as the last X-Forwarded-For entry; earlier entries come from the client and can be forged.
 */
export function clientIp(remoteAddress: string | undefined, forwardedFor: string | string[] | undefined, trustProxy: boolean): string {
  if (trustProxy && forwardedFor) {
    const header = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor;
    const last = header.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
    if (last) return last;
  }
  return remoteAddress ?? "unknown";
}
