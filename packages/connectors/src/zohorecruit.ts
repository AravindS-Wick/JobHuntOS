import { z } from 'zod';
import type { RawJob } from '@jobhunt/core';
import { getText } from './http.js';
import { decodeEntities, htmlToText } from './html.js';
import { slugify, toDate } from './util.js';

/**
 * Zoho Recruit public careers pages (Zoho itself, and many Indian companies).
 * The page embeds every open job as JSON in `<input type="hidden" id="jobs">`.
 *
 * Board token = careers page URL without the scheme, e.g.
 * `careers.zohocorp.com/jobs/Careers` or `acme.zohorecruit.in/jobs/Careers`.
 */
const ZohoJob = z.object({
  id: z.string(),
  Posting_Title: z.string().nullish(),
  Job_Opening_Name: z.string().nullish(),
  Job_Description: z.string().nullish(),
  Job_Type: z.string().nullish(),
  Remote_Job: z.boolean().nullish(),
  City: z.string().nullish(),
  State: z.string().nullish(),
  Country1: z.string().nullish(),
  Industry: z.string().nullish(),
  Date_Opened: z.string().nullish(),
});

export const zohoCareersUrl = (token: string) => `https://${token.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

export function parseZohoRecruit(html: string, token: string, companyName: string): RawJob[] {
  const m = html.match(/<input[^>]*value="(\[[^"]*)"[^>]*id="jobs"/) ?? html.match(/id="jobs"[^>]*value="(\[[^"]*)"/);
  if (!m?.[1]) return [];
  const rows = z.array(ZohoJob).parse(JSON.parse(decodeEntities(m[1])));
  const base = zohoCareersUrl(token);

  return rows.map((j): RawJob => {
    const title = j.Posting_Title ?? j.Job_Opening_Name ?? 'Untitled role';
    const location = [j.City, j.State, j.Country1].filter(Boolean).join(', ');
    const url = `${base}/${j.id}/${slugify(title)}`;
    return {
      source: 'zohorecruit',
      sourceId: j.id,
      company: companyName,
      companySlug: token,
      title,
      url,
      applyUrl: url,
      locationRaw: location,
      // The list carries a truncated description; enough to score the stack.
      descriptionText: htmlToText(j.Job_Description ?? ''),
      employmentType: j.Job_Type ?? undefined,
      workplaceTypeRaw: j.Remote_Job ? 'remote' : undefined,
      postedAt: toDate(j.Date_Opened),
    };
  });
}

export async function fetchZohoRecruit(token: string, companyName: string): Promise<RawJob[]> {
  return parseZohoRecruit(await getText(zohoCareersUrl(token), { browserUa: true }), token, companyName);
}
