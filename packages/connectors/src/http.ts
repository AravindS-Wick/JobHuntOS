export class HttpError extends Error {
  constructor(public status: number, public url: string, message?: string) {
    super(message ?? `HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

const UA = 'jobhunt-os/0.1 (personal job search tool)';

export interface FetchOpts { timeoutMs?: number; retries?: number; }

export async function getJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const { timeoutMs = 20_000, retries = 2 } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { accept: 'application/json', 'user-agent': UA },
      });
      if (res.status === 404) throw new HttpError(404, url, `Board not found: ${url}`);
      if (res.status === 429 || res.status >= 500) throw new HttpError(res.status, url);
      if (!res.ok) throw new HttpError(res.status, url);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof HttpError && err.status === 404) throw err;
      if (attempt < retries) await sleep(600 * 2 ** attempt + Math.random() * 400);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
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

