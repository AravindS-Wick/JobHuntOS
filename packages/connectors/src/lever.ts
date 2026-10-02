import { z } from 'zod';
import type { RawJob } from '@jobhunt/core';
import { getJson } from './http.js';
import { htmlToText } from './html.js';

/** Verified against https://api.lever.co/v0/postings/{token}?mode=json (returns a bare array) */
const LeverPost = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  applyUrl: z.string().optional(),
  createdAt: z.number().optional(),
  categories: z
    .object({
      commitment: z.string().nullish(),
      department: z.string().nullish(),
      location: z.string().nullish(),
      team: z.string().nullish(),
      allLocations: z.array(z.string()).nullish(),
    })
    .optional(),
  descriptionPlain: z.string().optional(),
  description: z.string().optional(),
  lists: z.array(z.object({ text: z.string(), content: z.string() })).optional(),
  additionalPlain: z.string().optional(),
  additional: z.string().optional(),
  workplaceType: z.string().nullish(),
  country: z.string().nullish(),
});

const LeverResponse = z.array(LeverPost);

export const leverBoardUrl = (token: string) =>
  `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;

/** Pure parse step — kept separate from IO so it can be unit-tested against fixtures. */
export function parseLever(payload: unknown, token: string, companyName?: string): RawJob[] {
  const posts = LeverResponse.parse(payload);

  return posts.map((p): RawJob => {
    // Lever splits requirements into `lists`; the JD is incomplete without them.
    const listText = (p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join('\n\n');
    const body = [p.descriptionPlain ?? htmlToText(p.description ?? ''), listText, p.additionalPlain ?? '']
      .filter(Boolean)
      .join('\n\n');

    const all = p.categories?.allLocations ?? undefined;
    return {
      source: 'lever',
      sourceId: p.id,
      company: companyName ?? token,
      companySlug: token,
      title: p.text,
      url: p.hostedUrl,
      applyUrl: p.applyUrl ?? `${p.hostedUrl}/apply`,
      locationRaw: p.categories?.location ?? all?.[0] ?? '',
      allLocations: all && all.length > 1 ? all : undefined,
      descriptionText: body,
      descriptionHtml: p.description ?? undefined,
      postedAt: p.createdAt ? new Date(p.createdAt) : undefined,
      employmentType: p.categories?.commitment ?? undefined,
      workplaceTypeRaw: p.workplaceType ?? undefined,
      country: p.country ?? undefined,
      compensationRaw: p.additionalPlain ?? undefined,
      department: p.categories?.department ?? undefined,
      team: p.categories?.team ?? undefined,
    };
  });
}

export async function fetchLever(token: string, companyName?: string): Promise<RawJob[]> {
  return parseLever(await getJson(leverBoardUrl(token)), token, companyName);
}
