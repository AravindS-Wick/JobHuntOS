import type { RawJob } from '@jobhunt/core';
import { getText, mapWithConcurrency } from './http.js';
import { htmlToText, stripHtml } from './html.js';
import { slugify, stableId, toDate } from './util.js';

/**
 * LinkedIn job search through the logged-out "guest" endpoints.
 *
 * No session cookie is ever sent from here: anything authenticated on
 * LinkedIn (Easy Apply, messaging) runs only in the local browser worker,
 * in the user's own profile. This connector reads public listings only.
 */
export interface LinkedInSearchOptions {
  query: string;
  location?: string;
  limit?: number;
  /** Seconds back to search, e.g. 86400 = past 24h. Default: past week. */
  postedWithinSec?: number;
  apifyToken?: string;
  /** Fetch full descriptions for jobs this accepts (one request each). */
  wantDetail?: (title: string) => boolean;
}

export function parseLinkedInJobHtml(html: string): RawJob[] {
  const jobs: RawJob[] = [];
  if (!html || typeof html !== 'string') return jobs;

  const cardRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html)) !== null) {
    const cardHtml = match[1] ?? '';
    if (!cardHtml.includes('base-card') && !cardHtml.includes('job-search-card')) continue;

    const titleMatch = /<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i.exec(cardHtml)
      || /<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(cardHtml);
    const title = titleMatch ? stripHtml(titleMatch[1] ?? '').trim() : '';

    const companyMatch = /<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/i.exec(cardHtml)
      || /<a[^>]*class="[^"]*hidden-nested-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(cardHtml);
    const company = companyMatch ? stripHtml(companyMatch[1] ?? '').trim() : '';

    const locationMatch = /<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(cardHtml);
    const location = locationMatch ? stripHtml(locationMatch[1] ?? '').trim() : '';

    const urlMatch = /<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"/i.exec(cardHtml)
      || /<a[^>]*href="([^"]*linkedin\.com\/jobs\/view\/[^"]+)"/i.exec(cardHtml);
    const rawUrl = urlMatch ? (urlMatch[1] ?? '').trim() : '';
    const cleanUrl = rawUrl.split('?')[0] || rawUrl;

    const idMatch = /urn:li:jobPosting:(\d+)/i.exec(cardHtml) || /(\d{7,14})(?:\?|$|\/)/.exec(cleanUrl);
    const sourceId = idMatch?.[1] ?? (cleanUrl ? stableId(cleanUrl) : '');

    const timeMatch = /<time[^>]*datetime="([^"]+)"[^>]*>/i.exec(cardHtml);

    if (title && company && sourceId) {
      jobs.push({
        source: 'linkedin',
        sourceId,
        company,
        companySlug: slugify(company),
        title,
        url: cleanUrl || `https://www.linkedin.com/jobs/view/${sourceId}`,
        applyUrl: cleanUrl || undefined,
        locationRaw: location,
        descriptionText: '',
        // Unknown age stays unknown; never default to "now" (it fakes recency).
        postedAt: toDate(timeMatch?.[1]),
      });
    }
  }
  return jobs;
}

/** Guest job-detail page → description + seniority/employment criteria. */
export function parseLinkedInJobDetail(html: string): Partial<RawJob> {
  const desc = /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)
    ?? /<section[^>]*class="[^"]*show-more-less-html[^"]*"[^>]*>([\s\S]*?)<\/section>/i.exec(html);
  const criteria = [...html.matchAll(
    /<h3[^>]*description__job-criteria-subheader[^>]*>([\s\S]*?)<\/h3>\s*<span[^>]*>([\s\S]*?)<\/span>/gi,
  )].map((m) => `${stripHtml(m[1] ?? '').trim()}: ${stripHtml(m[2] ?? '').trim()}`);
  const body = htmlToText(desc?.[1] ?? '');
  return {
    descriptionText: [body, ...criteria].filter(Boolean).join('\n'),
    descriptionHtml: desc?.[1],
    employmentType: criteria.find((c) => c.startsWith('Employment type'))?.split(': ')[1],
  };
}

/** Apify actor output (e.g. curious_coder/linkedin-jobs-scraper). */
export function parseLinkedInApify(items: unknown[]): RawJob[] {
  if (!Array.isArray(items)) return [];
  const jobs: RawJob[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, any>;
    const title = it.title || it.jobTitle || '';
    const company = it.companyName || it.company || '';
    const url = it.link || it.jobUrl || it.url || '';
    const id = String(it.id || it.jobId || it.jobUrn || '') || (url ? stableId(url) : '');
    if (!title || !company || !id) continue;

    jobs.push({
      source: 'linkedin',
      sourceId: id,
      company,
      companySlug: slugify(company),
      title,
      url: url || `https://www.linkedin.com/jobs/view/${id}`,
      applyUrl: it.applyUrl || url || undefined,
      locationRaw: it.location || it.jobLocation || '',
      descriptionText: it.description || it.descriptionText || '',
      descriptionHtml: it.descriptionHtml,
      postedAt: toDate(it.postedAt ?? it.postedDate ?? it.listedAt),
      compensationRaw: it.salary || it.compensation,
      employmentType: it.employmentType,
    });
  }
  return jobs;
}

export const linkedInSearchUrl = (opts: LinkedInSearchOptions, start = 0) =>
  `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${new URLSearchParams({
    keywords: opts.query,
    location: opts.location ?? 'India',
    start: String(start),
    f_TPR: `r${opts.postedWithinSec ?? 604800}`,
  })}`;
export const linkedInDetailUrl = (id: string) => `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`;

export async function fetchLinkedInJobs(opts: LinkedInSearchOptions): Promise<RawJob[]> {
  const { limit = 25, apifyToken, wantDetail = () => true } = opts;

  if (apifyToken) {
    try {
      const res = await fetch(
        'https://api.apify.com/v2/acts/curious_coder~linkedin-jobs-scraper/run-sync-get-dataset-items',
        {
          method: 'POST',
          // Token in a header, never the URL, so it can't leak into logs.
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apifyToken}` },
          body: JSON.stringify({ urls: [linkedInSearchUrl(opts).replace('/jobs-guest/jobs/api/seeMoreJobPostings', '/jobs')], count: limit }),
        },
      );
      if (res.ok) {
        const parsed = parseLinkedInApify((await res.json()) as unknown[]);
        if (parsed.length > 0) return parsed.slice(0, limit);
      }
    } catch {
      // fall through to guest search
    }
  }

  const jobs: RawJob[] = [];
  const seen = new Set<string>();
  for (let start = 0; jobs.length < limit && start < 250; start += 25) {
    const page = parseLinkedInJobHtml(await getText(linkedInSearchUrl(opts, start), { browserUa: true }))
      .filter((j) => !seen.has(j.sourceId));
    if (page.length === 0) break;
    for (const j of page) seen.add(j.sourceId);
    jobs.push(...page);
  }
  const out = jobs.slice(0, limit);

  // Guest cards carry no description; without one the stack match is blind.
  await mapWithConcurrency(out.filter((j) => wantDetail(j.title)), 2, async (job) => {
    try {
      Object.assign(job, parseLinkedInJobDetail(await getText(linkedInDetailUrl(job.sourceId), { browserUa: true })));
    } catch {
      // keep the card
    }
  }, 700);
  return out;
}
