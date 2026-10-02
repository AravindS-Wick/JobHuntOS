export class HttpError extends Error {
  constructor(public status: number, public url: string, message?: string) {
    super(message ?? `HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

const UA = 'jobhunt-os/0.1 (personal job search tool)';
/** Some public job sites reject non-browser clients outright. */
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

export interface FetchOpts {
  timeoutMs?: number;
  retries?: number;
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  /** Send a desktop-browser user agent instead of identifying as jobhunt-os. */
  browserUa?: boolean;
}

async function request(url: string, accept: string, opts: FetchOpts): Promise<Response> {
  const { timeoutMs = 20_000, retries = 2 } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        accept,
        'user-agent': opts.browserUa ? BROWSER_UA : UA,
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...opts.headers,
      };
      const res = await fetch(url, {
        method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
        signal: ac.signal,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
      if (res.status === 404) throw new HttpError(404, url, `Board not found: ${url}`);
      if (res.status === 429 || res.status >= 500) throw new HttpError(res.status, url);
      if (!res.ok) throw new HttpError(res.status, url);
      return res;
    } catch (err) {
      lastErr = err;
      // 4xx other than 429 won't change on retry.
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err;
      if (attempt < retries) await sleep(600 * 2 ** attempt + Math.random() * 400);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export async function getJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  return (await (await request(url, 'application/json', opts)).json()) as T;
}

export async function getText(url: string, opts: FetchOpts = {}): Promise<string> {
  return (await request(url, 'text/html,application/xhtml+xml,*/*;q=0.8', opts)).text();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function safeFetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as T;
}

export async function safeFetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  if (!res.ok) throw new HttpError(res.status, url);
  return await res.text();
}

/** Politeness gate. These are public endpoints; do not hammer them. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
  delayMs = 250,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]!, i);
      if (delayMs) await sleep(delayMs);
    }
  });
  await Promise.all(workers);
  return out;
}

