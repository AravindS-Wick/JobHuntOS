import type { FactMap, FormAnswer, RawJob, ResumeDoc } from '@jobhunt/core';

/**
 * The worker talks to the API over HTTP only, the same way it will when the
 * API runs on a server and the worker on the user's laptop.
 */
export interface ApplyBundle {
  task: { id: string; platform: string; attempts: number };
  application: { id: string; platform: string; applyUrl: string; coverLetter: string | null; answers: FormAnswer[] };
  job: { id: string; title: string; company: string; url: string; locationRaw: string | null };
  resume: { doc: ResumeDoc; pdfPath: string | null; docxPath: string | null };
  facts: FactMap;
}

export interface ScrapeBundle {
  task: { id: string; platform: string };
  board: string;
  url: string;
  query: { keywords: string; location?: string; limit?: number };
}

export type Claimed = { kind: 'apply'; bundle: ApplyBundle } | { kind: 'scrape'; bundle: ScrapeBundle };

export type Report =
  | { status: 'submitted'; fields?: Record<string, string>; screenshotPath?: string; confirmation?: string }
  | { status: 'scraped'; jobs: RawJob[] }
  | { status: 'needs_human'; reason: string; question?: string; options?: string[]; screenshotPath?: string }
  | { status: 'failed'; error: string; retryable?: boolean; screenshotPath?: string };

export class ApiClient {
  constructor(private baseUrl: string, private apiKey?: string) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  health() { return this.call<{ status: string }>('GET', '/health'); }
  claim(workerId: string, kinds?: ('apply' | 'scrape')[]) {
    return this.call<{ task: Claimed | null }>('POST', '/agent/claim', { workerId, kinds });
  }
  report(taskId: string, r: Report) { return this.call<{ ok: boolean }>('POST', `/agent/tasks/${taskId}/report`, r); }
  task(taskId: string) { return this.call<{ status: string; humanPrompt: unknown }>('GET', `/agent/tasks/${taskId}`); }
  continueTask(taskId: string, workerId: string) {
    return this.call<{ answers: FormAnswer[] }>('POST', `/agent/tasks/${taskId}/continue`, { workerId });
  }
}
