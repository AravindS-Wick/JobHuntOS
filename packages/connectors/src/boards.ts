import type { BoardId, RawJob } from '@jobhunt/core';
import { fetchAmazon, fetchGoogle, fetchMicrosoft } from './bigtech.js';
import { fetchFoundit, fetchInstahyre } from './indiaboards.js';
import { fetchHnWhoIsHiring, fetchRemoteOk, fetchYc } from './startupboards.js';
import { fetchLinkedInJobs } from './linkedin.js';
import { naukriSearchPageUrl } from './naukri.js';
import { indeedSearchPageUrl } from './indeed.js';

export interface BoardQuery {
  keywords: string;
  location?: string;
  limit?: number;
}

/**
 * How a board is reached.
 * - `direct`: public endpoint, fetched from this process.
 * - `browser`: blocks non-browser clients (reCAPTCHA / Cloudflare); the local
 *   browser worker loads it in the user's own Chrome profile.
 */
export type BoardMode = 'direct' | 'browser';

export interface BoardInfo {
  id: BoardId;
  name: string;
  mode: BoardMode;
  /** Can the worker submit applications here (beyond scraping)? */
  apply: 'supported' | 'beta' | 'external';
  note?: string;
}

export const BOARDS: Record<BoardId, BoardInfo> = {
  linkedin: { id: 'linkedin', name: 'LinkedIn', mode: 'direct', apply: 'beta', note: 'Search via guest API; Easy Apply in your browser, max 12/day' },
  naukri: { id: 'naukri', name: 'Naukri', mode: 'browser', apply: 'beta', note: 'Search and apply in your browser (reCAPTCHA blocks direct requests)' },
  indeed: { id: 'indeed', name: 'Indeed', mode: 'browser', apply: 'beta', note: 'Search and Indeed Apply in your browser' },
  foundit: { id: 'foundit', name: 'Foundit', mode: 'direct', apply: 'beta' },
  instahyre: { id: 'instahyre', name: 'Instahyre', mode: 'direct', apply: 'beta' },
  cutshort: { id: 'cutshort', name: 'Cutshort', mode: 'browser', apply: 'beta' },
  wellfound: { id: 'wellfound', name: 'Wellfound', mode: 'browser', apply: 'beta', note: 'Cloudflare-protected; browser only' },
  glassdoor: { id: 'glassdoor', name: 'Glassdoor', mode: 'browser', apply: 'external', note: 'Most listings redirect to the company ATS' },
  yc: { id: 'yc', name: 'Y Combinator', mode: 'direct', apply: 'beta', note: 'Apply needs a Work at a Startup login' },
  hn: { id: 'hn', name: 'HN Who is hiring', mode: 'direct', apply: 'external', note: 'Apply by email or the posted link' },
  remoteok: { id: 'remoteok', name: 'RemoteOK', mode: 'direct', apply: 'external' },
  amazon: { id: 'amazon', name: 'Amazon', mode: 'direct', apply: 'beta', note: 'Apply needs an Amazon Jobs login' },
  microsoft: { id: 'microsoft', name: 'Microsoft', mode: 'direct', apply: 'beta' },
  google: { id: 'google', name: 'Google', mode: 'direct', apply: 'beta', note: 'Apply needs a Google account sign-in' },
};

export class BrowserOnlyError extends Error {
  constructor(public board: BoardId, public pageUrl: string) {
    super(`${BOARDS[board].name} blocks direct requests; queue it for the local browser worker.`);
    this.name = 'BrowserOnlyError';
  }
}

/** Search page the browser worker opens for a browser-only board. */
export function browserSearchUrl(board: BoardId, q: BoardQuery): string {
  const kw = encodeURIComponent(q.keywords);
  const loc = encodeURIComponent(q.location ?? '');
  switch (board) {
    case 'naukri': return naukriSearchPageUrl({ query: q.keywords, location: q.location });
    case 'indeed': return indeedSearchPageUrl({ query: q.keywords, location: q.location });
    case 'glassdoor': return `https://www.glassdoor.co.in/Job/jobs.htm?sc.keyword=${kw}&locKeyword=${loc}&fromAge=7`;
    case 'wellfound': return `https://wellfound.com/role/r/${encodeURIComponent(q.keywords.toLowerCase().replace(/\s+/g, '-'))}`;
    case 'cutshort': return `https://cutshort.io/jobs?q=${kw}${q.location ? `&location=${loc}` : ''}`;
    default: return '';
  }
}

export interface BoardSearchOptions {
  /** Fetch descriptions only for titles this accepts (saves requests). */
  wantDetail?: (title: string) => boolean;
}

/** Search one board. Throws `BrowserOnlyError` for boards the worker must handle. */
export async function searchBoard(board: BoardId, q: BoardQuery, opts: BoardSearchOptions = {}): Promise<RawJob[]> {
  switch (board) {
    case 'linkedin':
      return fetchLinkedInJobs({ query: q.keywords, location: q.location, limit: q.limit, wantDetail: opts.wantDetail });
    case 'amazon': return fetchAmazon(q);
    case 'microsoft': return fetchMicrosoft(q, opts.wantDetail);
    case 'google': return fetchGoogle(q);
    case 'instahyre': return fetchInstahyre(q);
    case 'foundit': return fetchFoundit(q);
    case 'yc': return fetchYc(q);
    case 'hn': return fetchHnWhoIsHiring(q);
    case 'remoteok': return fetchRemoteOk(q);
    case 'naukri':
    case 'indeed':
    case 'glassdoor':
    case 'wellfound':
    case 'cutshort':
      throw new BrowserOnlyError(board, browserSearchUrl(board, q));
  }
}
