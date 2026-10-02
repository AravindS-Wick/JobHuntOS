import type { RawJob } from '@jobhunt/core';
import { stripHtml } from './html.js';
import { slugify, stableId, toDate } from './util.js';

/**
 * Naukri.
 *
 * Naukri's search API answers direct requests with `406 recaptcha required`
 * (verified 2026-10-02), so there is no server-side fetch here. The local
 * browser worker opens the search page in the user's own Chrome profile and
 * captures the same `jobapi/v3/search` JSON the page loads; that JSON goes
 * through `parseNaukriPayload` below.
 */
export interface NaukriSearchOptions {
  query: string;
  location?: string;
  experience?: number;
  limit?: number;
  apifyToken?: string;
}

export const naukriSearchPageUrl = (o: NaukriSearchOptions) => {
  const kw = slugify(o.query);
  const loc = o.location ? `-in-${slugify(o.location.split(',')[0] ?? '')}` : '';
  const exp = o.experience !== undefined ? `&experience=${o.experience}` : '';
  return `https://www.naukri.com/${kw}-jobs${loc}?k=${encodeURIComponent(o.query)}${o.location ? `&l=${encodeURIComponent(o.location)}` : ''}${exp}`;
};

/** Parse Naukri's jobapi/v3 search JSON (as captured by the browser worker). */
export function parseNaukriPayload(data: unknown): RawJob[] {
  if (!data || typeof data !== 'object') return [];
  const payload = data as Record<string, any>;
  const rawList: any[] = payload.jobDetails || payload.jobs || (Array.isArray(payload) ? payload : []);
  const jobs: RawJob[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const title = item.title || item.jobTitle || '';
    const company = item.companyName || item.company || '';
    if (!title || !company) continue;

    let location = '';
    let salaryRaw: string | undefined;
    let experience: string | undefined;
    if (Array.isArray(item.placeholders)) {
      for (const p of item.placeholders) {
        if (p?.type === 'location' && p.label) location = p.label;
        if (p?.type === 'salary' && p.label && !/not disclosed/i.test(p.label)) salaryRaw = p.label;
        if (p?.type === 'experience' && p.label) experience = p.label;
      }
    } else {
      if (item.location) location = typeof item.location === 'string' ? item.location : (item.location.label ?? '');
      if (item.salary) salaryRaw = typeof item.salary === 'string' ? item.salary : item.salary.label;
    }

    const url = item.jdURL
      ? (String(item.jdURL).startsWith('http') ? item.jdURL : `https://www.naukri.com${item.jdURL}`)
      : '';
    const jobId = String(item.jobId || item.id || item.groupId || '') || (url ? stableId(url) : '');
    if (!jobId) continue;

    const tags = Array.isArray(item.tagsAndSkills)
      ? item.tagsAndSkills.map((t: any) => (typeof t === 'string' ? t : t.label || '')).join(', ')
      : typeof item.tagsAndSkills === 'string' ? item.tagsAndSkills : '';
    const desc = [
      item.jobDescription || item.description || '',
      tags && `Skills: ${tags}`,
      experience && `Experience: ${experience}`,
    ].filter(Boolean).join('\n');

    jobs.push({
      source: 'naukri',
      sourceId: jobId,
      company,
      companySlug: slugify(company),
      title,
      url: url || `https://www.naukri.com/job-listings-${jobId}`,
      applyUrl: url || undefined,
      locationRaw: location,
      descriptionText: stripHtml(desc),
      compensationRaw: salaryRaw,
      postedAt: toDate(item.createdDate ?? item.footerPlaceholderLabel),
    });
  }
  return jobs;
}

/** Apify actor output (e.g. muhammetakkurtt/naukri-job-scraper). */
export function parseNaukriApify(items: unknown[]): RawJob[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item): RawJob[] => {
    if (!item || typeof item !== 'object') return [];
    const it = item as Record<string, any>;
    const title = it.title || it.jobTitle || '';
    const company = it.company || it.companyName || '';
    const url = it.url || it.applyUrl || '';
    const id = String(it.jobId || it.id || '') || (url ? stableId(url) : '');
    if (!title || !company || !id) return [];
    return [{
      source: 'naukri',
      sourceId: id,
      company,
      companySlug: slugify(company),
      title,
      url: url || `https://www.naukri.com/job-listings-${id}`,
      applyUrl: url || undefined,
      locationRaw: it.location || '',
      descriptionText: stripHtml(it.jobDescription || it.description || (it.skills ?? []).join(', ')),
      compensationRaw: it.salary || it.salaryPackage,
      postedAt: toDate(it.postedAt),
    }];
  });
}

/** Server-side Naukri is only possible through a paid Apify actor; otherwise use the browser worker. */
export async function fetchNaukriJobs(opts: NaukriSearchOptions): Promise<RawJob[]> {
  if (!opts.apifyToken) {
    throw new Error('Naukri blocks direct requests (reCAPTCHA). Run it through the local browser worker, or set an Apify token.');
  }
  const res = await fetch('https://api.apify.com/v2/acts/muhammetakkurtt~naukri-job-scraper/run-sync-get-dataset-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apifyToken}` },
    body: JSON.stringify({ keyword: opts.query, location: opts.location, maxJobs: opts.limit ?? 20 }),
  });
  if (!res.ok) throw new Error(`Apify Naukri actor failed: HTTP ${res.status}`);
  return parseNaukriApify((await res.json()) as unknown[]);
}
