/// <reference types="vite/client" />
import type { z } from 'zod';
import type {
  AgentTask, ApplicationItem, ApproveResponse, BoardInfo, BoardRunResponse, PrepareResponse, Resume, ResumeDoc,
  SearchConfigSchema, UsageResponse,
} from '@jobhunt/contracts';

/**
 * Real API only. Unlike the demo store in ./api.ts this never falls back to
 * simulated data: if the API is down, the caller shows that.
 */
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const KEY = import.meta.env.VITE_API_KEY || '';

export class ApplyApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(KEY ? { 'x-api-key': KEY } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApplyApiError(0, `API not reachable at ${BASE}. Start it with: pnpm api`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
    throw new ApplyApiError(res.status, err?.error?.message ?? `${method} ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export type ResumeT = z.infer<typeof Resume>;
export type ResumeDocT = z.infer<typeof ResumeDoc>;
export type ApplicationItemT = z.infer<typeof ApplicationItem>;
export type AgentTaskT = z.infer<typeof AgentTask>;
export type BoardInfoT = z.infer<typeof BoardInfo>;
export type SearchConfigT = z.infer<typeof SearchConfigSchema>;

/** Files need the API key header, so they're fetched and shown via a blob URL (never a key in the URL). */
export async function blobUrl(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, { headers: KEY ? { 'x-api-key': KEY } : {} });
  if (!res.ok) throw new ApplyApiError(res.status, `could not load ${path}`);
  return URL.createObjectURL(await res.blob());
}

export const applyApi = {
  master: () => call<ResumeT>('GET', '/resumes/master'),
  uploadResume: async (file: File) => {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return call<ResumeT>('POST', '/resumes', { fileName: file.name, dataBase64: btoa(bin) });
  },
  saveResumeDoc: (id: string, doc: ResumeDocT) => call<ResumeT>('PUT', `/resumes/${id}/doc`, doc),

  boards: () => call<{ items: BoardInfoT[] }>('GET', '/boards'),
  searchConfig: () => call<SearchConfigT>('GET', '/boards/config'),
  saveSearchConfig: (c: SearchConfigT) => call<SearchConfigT>('PUT', '/boards/config', c),
  runBoards: () => call<z.infer<typeof BoardRunResponse>>('POST', '/boards/run', {}),
  ingestCompanies: () => call<{ inserted: number; fetched: number }>('POST', '/runs/ingest', {}),

  prepare: (limit: number) => call<z.infer<typeof PrepareResponse>>('POST', '/applications/prepare', { auto: { tiers: [1, 2], limit } }),
  applications: (status: string) => call<{ items: ApplicationItemT[]; total: number }>('GET', `/applications?status=${status}&limit=100`),
  approve: (ids: string[]) => call<z.infer<typeof ApproveResponse>>('POST', '/applications/approve', { ids }),
  skip: (ids: string[]) => call<{ skipped: number }>('POST', '/applications/skip', { ids }),
  answer: (id: string, question: string, answer: string, remember?: string) =>
    call<{ ok: boolean }>('POST', `/applications/${id}/answer`, { question, answer, ...(remember ? { saveAsFact: { key: remember } } : {}) }),
  markSubmitted: (id: string) => call<{ ok: boolean }>('POST', `/applications/${id}/submitted`),
  usage: () => call<z.infer<typeof UsageResponse>>('GET', '/applications/usage'),

  humanGate: () => call<{ items: AgentTaskT[] }>('GET', '/agent/tasks?status=needs_human'),
  queue: () => call<{ items: AgentTaskT[] }>('GET', '/agent/tasks?status=queued,running'),
  resumeTask: (id: string, question?: string, answer?: string, remember?: string) =>
    call<{ ok: boolean }>('POST', `/agent/tasks/${id}/resume`, { question, answer, ...(remember ? { saveAsFact: { key: remember } } : {}) }),
  cancelTask: (id: string) => call<{ ok: boolean }>('POST', `/agent/tasks/${id}/cancel`),
};

export const resumeFilePath = (applicationId: string, ext: 'pdf' | 'docx') => `/applications/${applicationId}/resume.${ext}`;
export const screenshotPath = (path: string) => `/agent/${path}`;

/** A fact key from a question: "How did you hear about us?" → "how_did_you_hear_about_us". */
export const factKeyFor = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'answer';
