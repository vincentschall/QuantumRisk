/**
 * Minimal client for the Moth Quantum platform (https://docs.mothquantum.com).
 * Server-side only: it needs MOTH_API_KEY, which must never reach a browser.
 * The key is never put into error messages or logs.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface MothClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Retries for 429 / 5xx responses. */
  retries?: number;
}

export interface JobStatus {
  job_id: string;
  status: string;
  error?: { type?: string; message?: string; retryable?: boolean } | null;
}

export class MothError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MothError";
  }
}

const TERMINAL = new Set(["completed", "failed", "cancelled", "canceled"]);
export const DEFAULT_BASE_URL = "https://api.mothquantum.com/api/v1";

export class MothClient {
  private readonly key: string;
  private readonly base: string;
  private readonly fetch: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retries: number;

  constructor(opts: MothClientOptions) {
    if (!opts.apiKey) throw new MothError("MOTH_API_KEY is missing");
    this.key = opts.apiKey;
    this.base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.retries = opts.retries ?? 4;
  }

  /** Account info; a cheap way to check that the key works. */
  me(): Promise<{ id: string; platform_role?: string }> {
    return this.request("GET", "/me");
  }

  async submit(engine: string, params: Record<string, unknown>): Promise<string> {
    const body = await this.request<{ job_id: string }>("POST", `/engines/${encodeURIComponent(engine)}/process`, { params });
    return body.job_id;
  }

  /** Long-polls the job status until it is terminal. Throws on failure, cancellation or timeout. */
  async wait(jobId: string, timeoutMs = 300_000): Promise<JobStatus> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const st = await this.request<JobStatus>("GET", `/jobs/${encodeURIComponent(jobId)}/status?wait=10s`);
      if (TERMINAL.has(st.status)) {
        if (st.status !== "completed") throw new MothError(`Job ${jobId} ${st.status}: ${st.error?.message ?? "no detail"}`);
        return st;
      }
      if (Date.now() >= deadline) throw new MothError(`Job ${jobId} still ${st.status} after ${timeoutMs / 1000}s`);
    }
  }

  async result<T = unknown>(jobId: string): Promise<T> {
    const body = await this.request<{ result?: T }>("GET", `/jobs/${encodeURIComponent(jobId)}/result`);
    if (body.result === undefined) throw new MothError(`Job ${jobId} has no inline result`);
    return body.result;
  }

  /** Submit, wait and fetch the inline result. */
  async run<T = unknown>(engine: string, params: Record<string, unknown>, timeoutMs?: number): Promise<{ jobId: string; result: T }> {
    const jobId = await this.submit(engine, params);
    await this.wait(jobId, timeoutMs);
    return { jobId, result: await this.result<T>(jobId) };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetch(this.base + path, {
          method,
          headers: { Authorization: `Bearer ${this.key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (attempt < this.retries) {
          await this.sleep(backoff(attempt));
          continue;
        }
        throw new MothError(`${method} ${path}: network error (${(e as Error).message})`);
      }
      if (res.ok) return (await res.json()) as T;
      const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
      if (retryable && attempt < this.retries) {
        const after = Number(res.headers.get("retry-after"));
        await this.sleep(after > 0 ? after * 1000 : backoff(attempt));
        continue;
      }
      let detail = "";
      try {
        const j = (await res.json()) as { detail?: string; title?: string };
        detail = j.detail ?? j.title ?? "";
      } catch {
        /* no body */
      }
      throw new MothError(`${method} ${path}: HTTP ${res.status}${detail ? ` (${detail})` : ""}`, res.status);
    }
  }
}

const backoff = (attempt: number) => Math.min(1000 * 2 ** attempt, 15_000);
