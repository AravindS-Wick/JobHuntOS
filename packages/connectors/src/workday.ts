import { z } from 'zod';
import type { RawJob } from '@jobhunt/core';
import { getJson, mapWithConcurrency } from './http.js';
import { htmlToText } from './html.js';
import { parseRelativeAge, toDate } from './util.js';

/**
 * Workday's public candidate API (CXS). Used by Nvidia, Salesforce, Adobe,
 * Walmart, Intel, Cisco and most large enterprises.
 *
 * Board token format: `{tenant}/{dc}/{site}`, e.g. `nvidia/wd5/NVIDIAExternalCareerSite`
 * (from https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite). `detectAts` produces it.
 */
export interface WorkdayBoard { tenant: string; dc: string; site: string; host: string; search?: string }

/**
 * `tenant/wdN/site`, optionally `?q=India`: big employers list thousands of
 * global roles, and Workday caps paging, so the query narrows to the ones you
 * can take.
 */
export function parseWorkdayToken(token: string): WorkdayBoard {
  const [path = '', query] = token.split('?q=');
  const [tenant, dc, site] = path.split('/');
  if (!tenant || !dc || !site) {
    throw new Error(`Workday token must be "tenant/wdN/site", got "${token}"`);
  }
  return { tenant, dc, site, host: `${tenant}.${dc}.myworkdayjobs.com`, search: query ? decodeURIComponent(query) : undefined };
}

const WdListItem = z.object({
  title: z.string(),
  externalPath: z.string(),
  locationsText: z.string().nullish(),
  postedOn: z.string().nullish(),
  bulletFields: z.array(z.string()).nullish(),
  remoteType: z.string().nullish(),
});

const WdDetail = z.object({
  jobPostingInfo: z.object({
    id: z.string().optional(),
    title: z.string(),
    jobDescription: z.string().nullish(),
    location: z.string().nullish(),
    additionalLocations: z.array(z.string()).nullish(),
    postedOn: z.string().nullish(),
    startDate: z.string().nullish(),
    timeType: z.string().nullish(),
    jobReqId: z.string().nullish(),
    country: z.object({ descriptor: z.string().nullish() }).nullish(),
    remoteType: z.string().nullish(),
    externalUrl: z.string().nullish(),
  }),
});

export const workdayJobsUrl = (b: WorkdayBoard) => `https://${b.host}/wday/cxs/${b.tenant}/${b.site}/jobs`;
export const workdayDetailUrl = (b: WorkdayBoard, externalPath: string) =>
  `https://${b.host}/wday/cxs/${b.tenant}/${b.site}${externalPath}`;
export const workdayPublicUrl = (b: WorkdayBoard, externalPath: string) =>
  `https://${b.host}/en-US/${b.site}${externalPath}`;

/** List page → jobs without descriptions. `postedOn` is relative ("Posted 3 Days Ago"). */
export function parseWorkdayList(payload: unknown, token: string, companyName: string, now = new Date()): RawJob[] {
  const b = parseWorkdayToken(token);
  const rows = z.object({ jobPostings: z.array(z.unknown()) }).parse(payload).jobPostings;
  // One malformed posting shouldn't sink the whole board.
  const items = rows.flatMap((r) => { const p = WdListItem.safeParse(r); return p.success ? [p.data] : []; });
  return items.map((j): RawJob => ({
    source: 'workday',
    sourceId: j.bulletFields?.[0] ?? j.externalPath,
    company: companyName,
    companySlug: token,
    title: j.title,
    url: workdayPublicUrl(b, j.externalPath),
    applyUrl: `${workdayPublicUrl(b, j.externalPath)}/apply`,
    locationRaw: j.locationsText ?? '',
    descriptionText: '',
    postedAt: parseRelativeAge(j.postedOn, now),
    workplaceTypeRaw: j.remoteType ?? undefined,
  }));
}

/** Detail page → fields to merge into the list job. */
export function parseWorkdayDetail(payload: unknown): Partial<RawJob> {
  const p = WdDetail.parse(payload).jobPostingInfo;
  const locations = [p.location, ...(p.additionalLocations ?? [])].filter((l): l is string => Boolean(l));
  return {
    descriptionText: htmlToText(p.jobDescription ?? ''),
    descriptionHtml: p.jobDescription ?? undefined,
    locationRaw: p.location ?? undefined,
    allLocations: locations.length > 1 ? locations : undefined,
    postedAt: toDate(p.startDate),
    employmentType: p.timeType ?? undefined,
    workplaceTypeRaw: p.remoteType ?? undefined,
    country: p.country?.descriptor ?? undefined,
  };
}

export interface WorkdayFetchOptions {
  searchText?: string;
  /** Total postings to list (Workday pages 20 at a time). */
  maxJobs?: number;
  /** Fetch the description only for jobs this accepts; descriptions cost one request each. */
  wantDetail?: (title: string) => boolean;
  detailLimit?: number;
}

export async function fetchWorkday(token: string, companyName: string, opts: WorkdayFetchOptions = {}): Promise<RawJob[]> {
  const b = parseWorkdayToken(token);
  const { searchText = b.search ?? '', maxJobs = 100, wantDetail = () => true, detailLimit = 40 } = opts;
  const jobs: RawJob[] = [];

  // Workday only reports `total` on the first page; later pages say 0.
  let total = Infinity;
  for (let offset = 0; offset < maxJobs && offset < total; offset += 20) {
    const page = await getJson(workdayJobsUrl(b), {
      body: { appliedFacets: {}, limit: 20, offset, searchText },
      browserUa: true,
    });
    if (offset === 0) total = (page as { total?: number }).total ?? Infinity;
    const parsed = parseWorkdayList(page, token, companyName);
    jobs.push(...parsed);
    if ((page as { jobPostings?: unknown[] }).jobPostings?.length !== 20) break;
  }

  const detailed = jobs.filter((j) => wantDetail(j.title)).slice(0, detailLimit);
  await mapWithConcurrency(detailed, 2, async (job) => {
    const externalPath = job.url.slice(workdayPublicUrl(b, '').length);
    try {
      Object.assign(job, stripUndefined(parseWorkdayDetail(await getJson(workdayDetailUrl(b, externalPath), { browserUa: true }))));
    } catch {
      // Keep the list-level job; a missing description only weakens its score.
    }
  }, 300);

  return jobs;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
