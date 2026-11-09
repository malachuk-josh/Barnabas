/**
 * A small Planning Center API client over fetch, for a Personal Access Token (HTTP Basic: app id and secret).
 * Follows JSON:API `links.next` pagination and keeps under Planning Center's rate limit (100 requests per
 * 20 seconds per user) with a sliding window, honoring 429 Retry-After with exponential backoff.
 * https://developer.planning.center/docs/#/overview/authentication
 * https://developer.planning.center/docs/#/overview/rate-limiting
 */

export type Fetch = typeof fetch;

export type Resource = { id: string; type: string; attributes: Record<string, unknown>; relationships?: Record<string, { data: { id: string; type: string } | { id: string; type: string }[] | null }> };
export type Page = { data: Resource[]; included?: Resource[]; links?: { next?: string }; meta?: { total_count?: number } };

export class PcoError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export const PCO_BASE = "https://api.planningcenteronline.com";

export type PcoOptions = {
  appId: string;
  secret: string;
  fetchImpl?: Fetch;
  /** Requests allowed per window (Planning Center: 100 per 20 s). */
  limit?: number;
  windowMs?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export class PcoClient {
  private readonly stamps: number[] = [];
  requests = 0;
  retries = 0;
  private readonly f: Fetch;
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly auth: string;

  constructor(opts: PcoOptions) {
    this.f = opts.fetchImpl ?? fetch;
    this.limit = opts.limit ?? 100;
    this.windowMs = opts.windowMs ?? 20_000;
    this.maxRetries = opts.maxRetries ?? 5;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.auth = `Basic ${Buffer.from(`${opts.appId}:${opts.secret}`).toString("base64")}`;
  }

  /** Waits until another request fits in the window. */
  private async slot() {
    for (;;) {
      const t = this.now();
      while (this.stamps.length && t - this.stamps[0] >= this.windowMs) this.stamps.shift();
      if (this.stamps.length < this.limit) {
        this.stamps.push(t);
        return;
      }
      await this.sleep(this.windowMs - (t - this.stamps[0]) + 5);
    }
  }

  async get(pathOrUrl: string): Promise<Page> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${PCO_BASE}${pathOrUrl}`;
    if (!url.startsWith(PCO_BASE)) throw new PcoError("Refusing to follow a link outside Planning Center.");
    for (let attempt = 0; ; attempt++) {
      await this.slot();
      this.requests++;
      let res: Response;
      try {
        res = await this.f(url, { headers: { Authorization: this.auth, Accept: "application/json" } });
      } catch {
        if (attempt >= this.maxRetries) throw new PcoError("Couldn't reach Planning Center.");
        this.retries++;
        await this.sleep(backoff(attempt));
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= this.maxRetries) throw new PcoError(res.status === 429 ? "Planning Center is rate-limiting us. Try again in a minute." : "Planning Center had a problem. Try again later.", res.status);
        this.retries++;
        const retryAfter = Number(res.headers.get("retry-after"));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new PcoError("Planning Center didn't accept the token. Check PCO_APP_ID and PCO_SECRET.", res.status);
      if (!res.ok) throw new PcoError(`Planning Center returned ${res.status}.`, res.status);
      return (await res.json()) as Page;
    }
  }

  /** Every page of a list, following links.next. */
  async all(path: string, maxPages = 200): Promise<{ data: Resource[]; included: Resource[] }> {
    const data: Resource[] = [];
    const included: Resource[] = [];
    let next: string | undefined = path;
    for (let i = 0; next && i < maxPages; i++) {
      const page = await this.get(next);
      data.push(...page.data);
      included.push(...(page.included ?? []));
      next = page.links?.next;
    }
    return { data, included };
  }
}

/** 1 s, 2 s, 4 s, 8 s ... capped at 30 s. */
export const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);

export function rel(r: Resource, name: string): { id: string; type: string }[] {
  const d = r.relationships?.[name]?.data;
  return !d ? [] : Array.isArray(d) ? d : [d];
}
