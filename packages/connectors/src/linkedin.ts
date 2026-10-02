import type { RawJob } from '@jobhunt/core';
import { safeFetchJson, safeFetchText } from './http.js';
import { stripHtml } from './html.js';

export interface LinkedInSearchOptions {
  query: string;
  location?: string;
  limit?: number;
  sessionCookie?: string;
  apifyToken?: string;
}

/**
 * Parse HTML job cards from LinkedIn's guest job search API.
 * Endpoint: https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?...
 */
export function parseLinkedInJobHtml(html: string): RawJob[] {
  const jobs: RawJob[] = [];
  if (!html || typeof html !== 'string') return jobs;

  // Split by individual job list items or base-cards
  const cardRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(html)) !== null) {
    const cardHtml = match[1] ?? '';
    if (!cardHtml.includes('base-card') && !cardHtml.includes('job-search-card')) {
      continue;
    }

    // Extract title
    const titleMatch = /<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i.exec(cardHtml)
      || /<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(cardHtml);
    const title = titleMatch ? stripHtml(titleMatch[1] ?? '').trim() : '';

    // Extract company
    const companyMatch = /<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/i.exec(cardHtml)
      || /<a[^>]*class="[^"]*hidden-nested-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(cardHtml);
    const company = companyMatch ? stripHtml(companyMatch[1] ?? '').trim() : '';

    // Extract location
    const locationMatch = /<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(cardHtml);
    const location = locationMatch ? stripHtml(locationMatch[1] ?? '').trim() : 'Remote';

    // Extract URL and job ID
    const urlMatch = /<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"/i.exec(cardHtml)
      || /<a[^>]*href="([^"]*linkedin\.com\/jobs\/view\/[^"]+)"/i.exec(cardHtml);
    const rawUrl = urlMatch ? (urlMatch[1] ?? '').trim() : '';
    const cleanUrl = rawUrl.split('?')[0] || rawUrl;

    const idMatch = /(\d{7,14})(?:\?|$|\/)/.exec(cleanUrl) || /urn:li:jobPosting:(\d+)/i.exec(cardHtml);
    const sourceId = idMatch ? idMatch[1]! : (cleanUrl || `li_${Math.random().toString(36).substring(2, 9)}`);

    // Extract posted time / date
    const timeMatch = /<time[^>]*datetime="([^"]+)"[^>]*>/i.exec(cardHtml);
    const postedAt = timeMatch && timeMatch[1] ? new Date(timeMatch[1]) : new Date();

    if (title && company) {
      jobs.push({
        source: 'linkedin',
        sourceId,
        company,
        companySlug: company.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title,
        url: cleanUrl || `https://www.linkedin.com/jobs/view/${sourceId}`,
        applyUrl: cleanUrl || undefined,
        locationRaw: location,
        descriptionText: `${title} at ${company}. Location: ${location}. Sourced via LinkedIn search.`,
        postedAt,
      });
    }
  }

  return jobs;
}

/**
 * Parse JSON payloads returned by Apify LinkedIn scraper actor (e.g. curious_coder/linkedin-jobs-scraper).
 */
export function parseLinkedInApify(items: unknown[]): RawJob[] {
  if (!Array.isArray(items)) return [];
  const jobs: RawJob[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, any>;
    const title = it.title || it.jobTitle || '';
    const company = it.companyName || it.company || '';
    const id = String(it.id || it.jobId || it.jobUrn || it.link || '');
    if (!title || !company) continue;

    const url = it.link || it.jobUrl || it.url || `https://www.linkedin.com/jobs/view/${id}`;
    const postedAt = it.postedDate || it.postedAt || it.timeAgo ? new Date() : undefined;

    jobs.push({
      source: 'linkedin',
      sourceId: id || url,
      company,
      companySlug: company.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title,
      url,
      applyUrl: it.applyUrl || url,
      locationRaw: it.location || it.jobLocation || 'India',
      descriptionText: it.description || it.descriptionText || `${title} at ${company}`,
      descriptionHtml: it.descriptionHtml,
      postedAt,
      compensationRaw: it.salary || it.compensation,
      employmentType: it.employmentType,
    });
  }

  return jobs;
}

/**
 * Fetch LinkedIn jobs using public guest search API or Apify actor fallback.
 */
export async function fetchLinkedInJobs(opts: LinkedInSearchOptions): Promise<RawJob[]> {
  const { query, location = 'India', limit = 25, apifyToken } = opts;

  // 1. If Apify token is provided, attempt Apify actor run
  if (apifyToken) {
    try {
      const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~linkedin-jobs-scraper/run-sync-get-dataset-items`;
      const apifyRes = await safeFetchJson<unknown[]>(apifyUrl, {
        method: 'POST',
        // Token goes in a header, never the URL, so it can't leak into logs or error messages.
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apifyToken}` },
        body: JSON.stringify({
          queries: [`${query} in ${location}`],
          maxItems: limit,
        }),
      });
      if (Array.isArray(apifyRes)) {
        const parsed = parseLinkedInApify(apifyRes);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('LinkedIn Apify fetch failed, falling back to direct search:', e instanceof Error ? e.message : 'unknown error');
    }
  }

  // 2. Direct LinkedIn Guest Search Endpoint
  try {
    const params = new URLSearchParams({
      keywords: query,
      location,
      start: '0',
      count: String(limit),
      f_TPR: 'r604800', // Past week
    });
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params.toString()}`;

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };

    if (opts.sessionCookie) {
      headers.Cookie = `li_at=${opts.sessionCookie};`;
    }

    const html = await safeFetchText(url, { headers });
    const parsed = parseLinkedInJobHtml(html);
    if (parsed.length > 0) return parsed;
  } catch (err) {
    console.warn('LinkedIn direct search error:', err);
  }

  return [];
}
