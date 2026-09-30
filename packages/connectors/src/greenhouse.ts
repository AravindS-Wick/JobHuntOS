import { z } from 'zod';
import type { RawJob } from '@jobhunt/core';
import { getJson } from './http.js';
import { htmlToText } from './html.js';

/** Verified against https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true */
const GhJob = z.object({
  id: z.number(),
  internal_job_id: z.number().optional(),
  title: z.string(),
  company_name: z.string().optional(),
  absolute_url: z.string(),
  location: z.object({ name: z.string() }).nullish(),
  requisition_id: z.string().nullish(),
  updated_at: z.string().nullish(),
  first_published: z.string().nullish(),
  content: z.string().nullish(),
  departments: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  offices: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  metadata: z.unknown().nullish(),
});

const GhResponse = z.object({ jobs: z.array(GhJob) });

export const greenhouseBoardUrl = (token: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;

/** Pure parse step — kept separate from IO so it can be unit-tested against fixtures. */
export function parseGreenhouse(payload: unknown, token: string, companyName?: string): RawJob[] {
  const data = GhResponse.parse(payload);

  return data.jobs.map((j): RawJob => {
    const offices = (j.offices ?? []).map((o) => o.name).filter((n) => n && n !== 'No Office');
    const locationRaw = j.location?.name ?? offices[0] ?? '';
    return {
      source: 'greenhouse',
      sourceId: String(j.id),
      company: companyName ?? j.company_name ?? token,
      companySlug: token,
      title: j.title,
      url: j.absolute_url,
      applyUrl: j.absolute_url,
      locationRaw,
      allLocations: offices.length > 1 ? offices : undefined,
      descriptionText: htmlToText(j.content ?? ''),
      descriptionHtml: j.content ?? undefined,
      postedAt: j.first_published ? new Date(j.first_published) : undefined,
      updatedAt: j.updated_at ? new Date(j.updated_at) : undefined,
      department: j.departments?.[0]?.name,
    };
  });
}

export async function fetchGreenhouse(token: string, companyName?: string): Promise<RawJob[]> {
  return parseGreenhouse(await getJson(greenhouseBoardUrl(token)), token, companyName);
}
