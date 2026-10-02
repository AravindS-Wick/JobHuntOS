import { z } from 'zod';
import type { RawJob } from '@jobhunt/core';
import { getJson } from './http.js';
import { htmlToText } from './html.js';
import { slugify, toDate } from './util.js';
import type { BoardQuery } from './boards.js';

// ------------------------------------------------------------ Instahyre ----
// Public job search API. Ignores location filters; the scorer handles location.

const IhJob = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string().nullish(),
  candidate_title: z.string().nullish(),
  employer: z.object({ company_name: z.string(), instahyre_note: z.string().nullish() }),
  locations: z.string().nullish(),
  keywords: z.array(z.string()).nullish(),
  public_url: z.string(),
});

export const instahyreSearchUrl = (q: BoardQuery, offset = 0) =>
  `https://www.instahyre.com/api/v1/job_search?${new URLSearchParams({
    skills: q.keywords, limit: '35', offset: String(offset),
  })}`;

export function parseInstahyre(payload: unknown): RawJob[] {
  return z.object({ objects: z.array(IhJob) }).parse(payload).objects.map((j): RawJob => {
    const title = j.candidate_title ?? j.title ?? 'Untitled role';
    const locations = (j.locations ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return {
      source: 'instahyre',
      sourceId: String(j.id),
      company: j.employer.company_name,
      companySlug: slugify(j.employer.company_name),
      title,
      url: j.public_url,
      applyUrl: j.public_url,
      locationRaw: locations[0] ?? '',
      allLocations: locations.length > 1 ? locations : undefined,
      // The search API returns skills, not the full JD; skills are what the scorer needs.
      descriptionText: [`Skills: ${(j.keywords ?? []).join(', ')}`, j.employer.instahyre_note ?? ''].join('\n'),
    };
  });
}

export async function fetchInstahyre(q: BoardQuery): Promise<RawJob[]> {
  const limit = q.limit ?? 35;
  const jobs: RawJob[] = [];
  for (let offset = 0; jobs.length < limit; offset += 35) {
    const page = parseInstahyre(await getJson(instahyreSearchUrl(q, offset), { browserUa: true }));
    jobs.push(...page);
    if (page.length < 35) break;
  }
  return jobs.slice(0, limit);
}

// -------------------------------------------------------------- Foundit ----
// foundit.in (Monster India) middleware API. Needs a browser UA, a JSON accept
// header and a referer, otherwise it answers 400 "content negotiation failed".

const FdJob = z.object({
  jobId: z.union([z.number(), z.string()]),
  title: z.string(),
  companyName: z.string().nullish(),
  locations: z.string().nullish(),
  exp: z.string().nullish(),
  minimumExperience: z.object({ years: z.number().nullish() }).nullish(),
  skills: z.string().nullish(),
  createdAt: z.number().nullish(),
  salary: z.string().nullish(),
  hideSalary: z.union([z.number(), z.boolean()]).nullish(),
  seoJdUrl: z.string().nullish(),
  jdUrl: z.string().nullish(),
  redirectUrl: z.string().nullish(),
  employmentTypes: z.array(z.string()).nullish(),
});

export const founditSearchUrl = (q: BoardQuery) =>
  `https://www.foundit.in/middleware/jobsearch?${new URLSearchParams({
    sort: '1', limit: String(q.limit ?? 50), query: q.keywords, ...(q.location ? { locations: q.location } : {}),
  })}`;

export function parseFoundit(payload: unknown): RawJob[] {
  const rows = z.object({ jobSearchResponse: z.object({ data: z.array(z.unknown()) }) }).parse(payload).jobSearchResponse.data;
  // The result list interleaves ad/promo slots that carry no job; skip them.
  const data = rows.flatMap((r) => {
    const p = FdJob.safeParse(r);
    return p.success ? [p.data] : [];
  });
  return data.map((j): RawJob => {
    const company = j.companyName || 'Confidential';
    const path = j.seoJdUrl || j.jdUrl || `/job/${j.jobId}`;
    const url = `https://www.foundit.in${path}`;
    const locations = (j.locations ?? '').split(',').map((s) => s.trim()).filter((s) => s && s !== 'India');
    // "0-0 INR" means undisclosed.
    const salary = j.salary && !/^0-0/.test(j.salary) && !j.hideSalary ? j.salary : undefined;
    return {
      source: 'foundit',
      sourceId: String(j.jobId),
      company,
      companySlug: slugify(company),
      title: j.title,
      url,
      applyUrl: j.redirectUrl || url,
      locationRaw: locations.join(' / ') || (j.locations ?? ''),
      descriptionText: [
        j.exp ? `Experience: ${j.exp}` : '',
        j.skills ? `Skills: ${htmlToText(j.skills)}` : '',
      ].filter(Boolean).join('\n'),
      compensationRaw: salary ? salary.replace(/INR$/, 'INR per annum') : undefined,
      postedAt: toDate(j.createdAt),
      employmentType: j.employmentTypes?.[0],
    };
  });
}

export async function fetchFoundit(q: BoardQuery): Promise<RawJob[]> {
  return parseFoundit(await getJson(founditSearchUrl(q), {
    browserUa: true,
    headers: { referer: 'https://www.foundit.in/' },
  }));
}
