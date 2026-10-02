import { z } from 'zod';
import type { RawJob } from '@jobhunt/core';
import { getJson, getText, mapWithConcurrency } from './http.js';
import { htmlToText } from './html.js';
import { toDate } from './util.js';
import type { BoardQuery } from './boards.js';

// --------------------------------------------------------------- Amazon ----
// https://www.amazon.jobs/en/search.json — public, returns full descriptions.

const AmazonJob = z.object({
  id_icims: z.string(),
  title: z.string(),
  company_name: z.string().nullish(),
  location: z.string().nullish(),
  city: z.string().nullish(),
  posted_date: z.string().nullish(),
  job_path: z.string(),
  description: z.string().nullish(),
  basic_qualifications: z.string().nullish(),
  preferred_qualifications: z.string().nullish(),
  url_next_step: z.string().nullish(),
  job_schedule_type: z.string().nullish(),
  team: z.object({ label: z.string().nullish() }).nullish(),
});

const INDIA_RE = /\b(india|bangalore|bengaluru|chennai|hyderabad|pune|mumbai|delhi|gurgaon|gurugram|noida|kolkata|remote india)\b/i;

/**
 * amazon.jobs ignores `loc_query` and matches `base_query` as a phrase, so
 * location goes through the country filter and keywords are retried narrower.
 */
export const amazonSearchUrl = (q: BoardQuery) => {
  const p = new URLSearchParams({ base_query: q.keywords, result_limit: String(q.limit ?? 50), sort: 'recent' });
  if (q.location && INDIA_RE.test(q.location)) p.append('normalized_country_code[]', 'IND');
  // Amazon's keyword match is fuzzy ("react" hits payroll roles); pin engineering searches to the category.
  if (/\b(engineer|developer|software|frontend|backend|full ?stack|react|node|typescript|javascript|python|sde)\b/i.test(q.keywords)) {
    p.append('category[]', 'software-development');
  }
  return `https://www.amazon.jobs/en/search.json?${p}`;
};

/** "senior react developer" → "react": the role words rarely appear verbatim in Amazon titles. */
function amazonCoreKeywords(keywords: string): string {
  const core = keywords.toLowerCase().split(/\s+/)
    .filter((w) => !/^(senior|sr|lead|staff|principal|developer|engineer|software|jobs?)$/.test(w));
  return core.join(' ') || 'software development engineer';
}

export function parseAmazon(payload: unknown): RawJob[] {
  const jobs = z.object({ jobs: z.array(AmazonJob) }).parse(payload).jobs;
  return jobs.map((j): RawJob => {
    const url = `https://www.amazon.jobs${j.job_path}`;
    return {
      source: 'amazon',
      sourceId: j.id_icims,
      company: 'Amazon',
      companySlug: 'amazon',
      title: j.title,
      url,
      applyUrl: j.url_next_step ?? url,
      locationRaw: j.location ?? j.city ?? '',
      descriptionText: htmlToText(
        [j.description, j.basic_qualifications, j.preferred_qualifications].filter(Boolean).join('\n'),
      ),
      postedAt: toDate(j.posted_date),
      employmentType: j.job_schedule_type ?? undefined,
      team: j.team?.label ?? undefined,
    };
  });
}

export async function fetchAmazon(q: BoardQuery): Promise<RawJob[]> {
  const jobs = parseAmazon(await getJson(amazonSearchUrl(q), { browserUa: true }));
  if (jobs.length > 0) return jobs;
  const narrower = amazonCoreKeywords(q.keywords);
  if (narrower === q.keywords.toLowerCase()) return jobs;
  return parseAmazon(await getJson(amazonSearchUrl({ ...q, keywords: narrower }), { browserUa: true }));
}

// ------------------------------------------------------------ Microsoft ----
// apply.careers.microsoft.com (Eightfold) — search, then one detail call per job.

const MsPosition = z.object({
  id: z.number(),
  name: z.string(),
  locations: z.array(z.string()).nullish(),
  postedTs: z.number().nullish(),
  department: z.string().nullish(),
  workLocationOption: z.string().nullish(),
  positionUrl: z.string().nullish(),
});
const MsSearch = z.object({ data: z.object({ positions: z.array(MsPosition) }) });
const MsDetail = z.object({
  data: MsPosition.extend({ jobDescription: z.string().nullish(), publicUrl: z.string().nullish() }),
});

const MS_BASE = 'https://apply.careers.microsoft.com';
export const microsoftSearchUrl = (q: BoardQuery, start = 0) =>
  `${MS_BASE}/api/pcsx/search?${new URLSearchParams({
    domain: 'microsoft.com', query: q.keywords, location: q.location ?? '', start: String(start), sort_by: 'timestamp',
  })}`;
export const microsoftDetailUrl = (id: number | string) =>
  `${MS_BASE}/api/pcsx/position_details?position_id=${id}&domain=microsoft.com&hl=en`;

export function parseMicrosoftSearch(payload: unknown): RawJob[] {
  return MsSearch.parse(payload).data.positions.map((p): RawJob => {
    const url = `${MS_BASE}/careers/job/${p.id}`;
    const locations = p.locations ?? [];
    return {
      source: 'microsoft',
      sourceId: String(p.id),
      company: 'Microsoft',
      companySlug: 'microsoft',
      title: p.name,
      url,
      applyUrl: url,
      locationRaw: locations[0] ?? '',
      allLocations: locations.length > 1 ? locations : undefined,
      descriptionText: '',
      postedAt: toDate(p.postedTs),
      workplaceTypeRaw: p.workLocationOption ?? undefined,
      department: p.department ?? undefined,
    };
  });
}

export function parseMicrosoftDetail(payload: unknown): Partial<RawJob> {
  const d = MsDetail.parse(payload).data;
  return {
    descriptionText: htmlToText(d.jobDescription ?? ''),
    descriptionHtml: d.jobDescription ?? undefined,
    ...(d.publicUrl ? { url: d.publicUrl, applyUrl: d.publicUrl } : {}),
  };
}

export async function fetchMicrosoft(q: BoardQuery, wantDetail: (t: string) => boolean = () => true): Promise<RawJob[]> {
  const limit = q.limit ?? 30;
  const jobs: RawJob[] = [];
  const seen = new Set<string>();
  for (let start = 0; jobs.length < limit && start < 200; start += 10) {
    const page = parseMicrosoftSearch(await getJson(microsoftSearchUrl(q, start), { browserUa: true }))
      .filter((j) => !seen.has(j.sourceId));
    if (page.length === 0) break;
    for (const j of page) seen.add(j.sourceId);
    jobs.push(...page);
  }
  const out = jobs.slice(0, limit);
  await mapWithConcurrency(out.filter((j) => wantDetail(j.title)), 2, async (job) => {
    try {
      Object.assign(job, parseMicrosoftDetail(await getJson(microsoftDetailUrl(job.sourceId), { browserUa: true })));
    } catch {
      // keep the list-level record
    }
  }, 300);
  return out;
}

// --------------------------------------------------------------- Google ----
// google.com/about/careers renders server-side; the jobs ride in an
// AF_initDataCallback('ds:1') payload. Positional arrays, verified 2026-10-02:
// [0]=id [1]=title [2]=apply url [3]=[,responsibilities] [4]=[,qualifications]
// [7]=company [9]=[[location,...]] [10]=[,about] [12]=[epochSec,nanos] posted

export const googleSearchUrl = (q: BoardQuery, page = 1) =>
  `https://www.google.com/about/careers/applications/jobs/results/?${new URLSearchParams({
    q: q.keywords, ...(q.location ? { location: q.location } : {}), sort_by: 'date', page: String(page),
  })}`;

export function parseGoogleResults(html: string): RawJob[] {
  const m = html.match(/AF_initDataCallback\(\{key: 'ds:1'.*?data:(\[[\s\S]*?\]), sideChannel/);
  if (!m?.[1]) return [];
  const data = JSON.parse(m[1]) as unknown[];
  const rows = Array.isArray(data[0]) ? (data[0] as unknown[][]) : [];

  return rows.flatMap((r): RawJob[] => {
    const id = r[0];
    const title = r[1];
    if (typeof id !== 'string' || typeof title !== 'string') return [];
    const html = (i: number) => {
      const cell = r[i];
      return Array.isArray(cell) && typeof cell[1] === 'string' ? cell[1] : '';
    };
    const locs = Array.isArray(r[9]) ? (r[9] as unknown[][]).map((l) => String(l[0] ?? '')).filter(Boolean) : [];
    const posted = Array.isArray(r[12]) ? toDate(r[12][0]) : undefined;
    const company = typeof r[7] === 'string' ? r[7] : 'Google';
    return [{
      source: 'google',
      sourceId: id,
      company,
      companySlug: 'google',
      title,
      url: `https://www.google.com/about/careers/applications/jobs/results/${id}`,
      applyUrl: typeof r[2] === 'string' ? r[2] : undefined,
      locationRaw: locs[0] ?? '',
      allLocations: locs.length > 1 ? locs : undefined,
      descriptionText: htmlToText([html(10), html(3), html(4)].join('\n')),
      postedAt: posted,
    }];
  });
}

export async function fetchGoogle(q: BoardQuery): Promise<RawJob[]> {
  const limit = q.limit ?? 40;
  const jobs: RawJob[] = [];
  for (let page = 1; jobs.length < limit && page <= 5; page++) {
    const batch = parseGoogleResults(await getText(googleSearchUrl(q, page), { browserUa: true }));
    jobs.push(...batch);
    if (batch.length < 20) break;
  }
  return jobs.slice(0, limit);
}
