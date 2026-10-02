import { z } from 'zod';
import type { RawJob } from '@jobhunt/core';
import { getJson, mapWithConcurrency } from './http.js';
import { htmlToText } from './html.js';
import { toDate } from './util.js';

/** Board token = SmartRecruiters company identifier, e.g. `BoschGroup` (careers.smartrecruiters.com/BoschGroup). */
const SrLocation = z.object({
  city: z.string().nullish(),
  region: z.string().nullish(),
  country: z.string().nullish(),
  remote: z.boolean().nullish(),
  hybrid: z.boolean().nullish(),
  fullLocation: z.string().nullish(),
});
const SrPosting = z.object({
  id: z.string(),
  name: z.string(),
  company: z.object({ identifier: z.string(), name: z.string() }),
  releasedDate: z.string().nullish(),
  location: SrLocation.nullish(),
  typeOfEmployment: z.object({ label: z.string().nullish() }).nullish(),
  department: z.object({ label: z.string().nullish() }).nullish(),
});
const SrList = z.object({ totalFound: z.number().optional(), content: z.array(SrPosting) });
const SrDetail = SrPosting.extend({
  postingUrl: z.string().nullish(),
  applyUrl: z.string().nullish(),
  jobAd: z.object({
    sections: z.record(z.string(), z.object({ title: z.string().nullish(), text: z.string().nullish() })).optional(),
  }).nullish(),
});

export const smartRecruitersListUrl = (token: string, offset = 0, q = '') =>
  `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100&offset=${offset}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
export const smartRecruitersDetailUrl = (token: string, id: string) =>
  `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings/${id}`;

function workplace(loc: z.infer<typeof SrLocation> | null | undefined): string | undefined {
  if (loc?.remote) return 'remote';
  if (loc?.hybrid) return 'hybrid';
  return undefined;
}

export function parseSmartRecruitersList(payload: unknown, token: string, companyName?: string): RawJob[] {
  return SrList.parse(payload).content.map((p): RawJob => {
    const url = `https://jobs.smartrecruiters.com/${p.company.identifier}/${p.id}`;
    return {
      source: 'smartrecruiters',
      sourceId: p.id,
      company: companyName ?? p.company.name,
      companySlug: token,
      title: p.name,
      url,
      applyUrl: url,
      locationRaw: p.location?.fullLocation ?? [p.location?.city, p.location?.country].filter(Boolean).join(', '),
      descriptionText: '',
      postedAt: toDate(p.releasedDate),
      employmentType: p.typeOfEmployment?.label ?? undefined,
      workplaceTypeRaw: workplace(p.location),
      department: p.department?.label ?? undefined,
    };
  });
}

export function parseSmartRecruitersDetail(payload: unknown): Partial<RawJob> {
  const d = SrDetail.parse(payload);
  const sections = Object.values(d.jobAd?.sections ?? {})
    .filter((s) => s.text)
    .map((s) => `${s.title ?? ''}\n${s.text}`)
    .join('\n');
  return {
    descriptionText: htmlToText(sections),
    descriptionHtml: sections || undefined,
    ...(d.postingUrl ? { url: d.postingUrl } : {}),
    ...(d.applyUrl ? { applyUrl: d.applyUrl } : {}),
  };
}

export async function fetchSmartRecruiters(
  token: string,
  companyName?: string,
  opts: { searchText?: string; wantDetail?: (title: string) => boolean; detailLimit?: number } = {},
): Promise<RawJob[]> {
  // Token may carry a query like workday's: `BoschGroup?q=India`.
  const [company = token, q] = token.split('?q=');
  const { searchText = q ? decodeURIComponent(q) : '', wantDetail = () => true, detailLimit = 40 } = opts;
  const jobs = parseSmartRecruitersList(await getJson(smartRecruitersListUrl(company, 0, searchText)), token, companyName);
  const detailed = jobs.filter((j) => wantDetail(j.title)).slice(0, detailLimit);
  await mapWithConcurrency(detailed, 3, async (job) => {
    try {
      Object.assign(job, parseSmartRecruitersDetail(await getJson(smartRecruitersDetailUrl(company, job.sourceId))));
    } catch {
      // List-level data is still useful without the description.
    }
  }, 200);
  return jobs;
}
