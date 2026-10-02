import { z } from 'zod';
import type { RawJob } from '@jobhunt/core';
import { getJson } from './http.js';
import { htmlToText } from './html.js';

/** Verified against https://api.ashbyhq.com/posting-api/job-board/{token} */
const AshbyJob = z.object({
  id: z.string(),
  title: z.string(),
  department: z.string().nullish(),
  team: z.string().nullish(),
  employmentType: z.string().nullish(),
  location: z.string().nullish(),
  secondaryLocations: z
    .array(z.union([z.string(), z.object({ location: z.string().nullish() }).passthrough()]))
    .nullish(),
  publishedAt: z.string().nullish(),
  isListed: z.boolean().nullish(),
  isRemote: z.boolean().nullish(),
  workplaceType: z.string().nullish(),
  address: z.unknown().nullish(),
  jobUrl: z.string(),
  applyUrl: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  compensation: z.unknown().nullish(),
});

const AshbyResponse = z.object({ jobs: z.array(AshbyJob) });

export const ashbyBoardUrl = (token: string) =>
  `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`;

function secondaryToStrings(v: z.infer<typeof AshbyJob>['secondaryLocations']): string[] {
  if (!v) return [];
  return v
    .map((s) => (typeof s === 'string' ? s : (s.location ?? '')))
    .filter((s): s is string => Boolean(s));
}

/** Pure parse step — kept separate from IO so it can be unit-tested against fixtures. */
export function parseAshby(payload: unknown, token: string, companyName?: string): RawJob[] {
  const data = AshbyResponse.parse(payload);

  return data.jobs
    .filter((j) => j.isListed !== false)
    .map((j): RawJob => {
      const secondary = secondaryToStrings(j.secondaryLocations);
      const all = [j.location, ...secondary].filter((s): s is string => Boolean(s));
      return {
        source: 'ashby',
        sourceId: j.id,
        company: companyName ?? token,
        companySlug: token,
        title: j.title,
        url: j.jobUrl,
        applyUrl: j.applyUrl ?? `${j.jobUrl}/application`,
        locationRaw: j.location ?? all[0] ?? '',
        allLocations: all.length > 1 ? all : undefined,
        descriptionText: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ''),
        descriptionHtml: j.descriptionHtml ?? undefined,
        postedAt: j.publishedAt ? new Date(j.publishedAt) : undefined,
        employmentType: j.employmentType ?? undefined,
        workplaceTypeRaw: j.workplaceType ?? (j.isRemote ? 'Remote' : undefined),
        compensationRaw: j.compensation ? JSON.stringify(j.compensation) : undefined,
        department: j.department ?? undefined,
        team: j.team ?? undefined,
      };
    });
}

export async function fetchAshby(token: string, companyName?: string): Promise<RawJob[]> {
  return parseAshby(await getJson(ashbyBoardUrl(token)), token, companyName);
}
