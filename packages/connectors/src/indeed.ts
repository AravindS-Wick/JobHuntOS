import type { RawJob } from '@jobhunt/core';
import { stripHtml } from './html.js';
import { parseRelativeAge, slugify, toDate } from './util.js';

/**
 * Indeed.
 *
 * Indeed retired its public RSS feeds (in.indeed.com/rss returns 404, verified
 * 2026-10-02) and blocks direct search requests, so jobs come from the local
 * browser worker, which reads the job-card JSON Indeed embeds in its search
 * page (`window.mosaic.providerData["mosaic-provider-jobcards"]`).
 */
export interface IndeedSearchOptions {
  query: string;
  location?: string;
  country?: 'in' | 'us' | 'uk' | 'ca';
  limit?: number;
}

export const indeedSearchPageUrl = (o: IndeedSearchOptions) => {
  const host = o.country === 'in' || !o.country ? 'in.indeed.com' : o.country === 'us' ? 'www.indeed.com' : `${o.country}.indeed.com`;
  return `https://${host}/jobs?${new URLSearchParams({ q: o.query, l: o.location ?? '', sort: 'date', fromage: '7' })}`;
};

/** Parse `mosaic-provider-jobcards` results (as captured by the browser worker). */
export function parseIndeedMosaic(results: unknown[], host = 'in.indeed.com', now = new Date()): RawJob[] {
  if (!Array.isArray(results)) return [];
  return results.flatMap((r): RawJob[] => {
    if (!r || typeof r !== 'object') return [];
    const it = r as Record<string, any>;
    const jobKey = it.jobkey || it.jobKey;
    const title = it.displayTitle || it.title;
    const company = it.company || it.truncatedCompany;
    if (!jobKey || !title || !company) return [];
    const url = `https://${host}/viewjob?jk=${jobKey}`;
    const snippet = stripHtml(it.snippet ?? '');
    const attributes = Array.isArray(it.taxonomyAttributes)
      ? it.taxonomyAttributes.flatMap((a: any) => (a?.attributes ?? []).map((x: any) => x?.label)).filter(Boolean)
      : [];
    return [{
      source: 'indeed',
      sourceId: String(jobKey),
      company,
      companySlug: slugify(company),
      title,
      url,
      applyUrl: url,
      locationRaw: it.formattedLocation || it.jobLocationCity || '',
      descriptionText: [snippet, attributes.length ? `Attributes: ${attributes.join(', ')}` : ''].filter(Boolean).join('\n'),
      compensationRaw: it.salarySnippet?.text || it.extractedSalary?.text || undefined,
      workplaceTypeRaw: it.remoteLocation ? 'remote' : undefined,
      postedAt: toDate(it.pubDate) ?? parseRelativeAge(it.formattedRelativeTime, now),
    }];
  });
}

/** Parse Indeed JSON results from MCP / API wrappers. */
export function parseIndeedJson(data: unknown): RawJob[] {
  if (!data || typeof data !== 'object') return [];
  const payload = data as Record<string, any>;
  const list = payload.results || payload.data || payload.jobs || (Array.isArray(payload) ? payload : []);
  return (list as unknown[]).flatMap((item): RawJob[] => {
    if (!item || typeof item !== 'object') return [];
    const it = item as Record<string, any>;
    const title = it.jobTitle || it.title || '';
    const id = String(it.jobKey || it.id || it.key || '');
    const url = it.link || it.url || (id ? `https://www.indeed.com/viewjob?jk=${id}` : '');
    if (!title || !url) return [];
    const company = it.company || it.companyName || 'Unknown employer';
    return [{
      source: 'indeed',
      sourceId: id || url,
      company,
      companySlug: slugify(company),
      title,
      url,
      applyUrl: it.applyUrl || url,
      locationRaw: it.location || it.formattedLocation || '',
      descriptionText: stripHtml(it.snippet || it.description || ''),
      postedAt: toDate(it.date),
      compensationRaw: it.salary || it.estimatedSalary,
    }];
  });
}

/** Kept for archived feeds and tests; Indeed's live RSS endpoint is gone. */
export function parseIndeedRss(xmlText: string): RawJob[] {
  const jobs: RawJob[] = [];
  if (!xmlText || typeof xmlText !== 'string') return jobs;
  const tag = (s: string, name: string) =>
    new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`, 'i').exec(s)?.[1]?.trim() ?? '';

  for (const m of xmlText.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = m[1] ?? '';
    const link = tag(item, 'link');
    let title = stripHtml(tag(item, 'title'));
    let company = stripHtml(tag(item, 'source'));
    if (!company && title.includes(' - ')) {
      const parts = title.split(' - ');
      title = parts[0]!.trim();
      company = parts[1]?.trim() ?? '';
    } else if (company && title.endsWith(` - ${company}`)) {
      title = title.slice(0, -(company.length + 3)).trim();
    }
    if (!title || !link || !company) continue;
    const desc = stripHtml(tag(item, 'description'));
    jobs.push({
      source: 'indeed',
      sourceId: tag(item, 'guid') || link,
      company,
      companySlug: slugify(company),
      title,
      url: link,
      applyUrl: link,
      locationRaw: /location[:\s]+([^.\n]+)/i.exec(desc)?.[1]?.trim() ?? '',
      descriptionText: desc,
      postedAt: toDate(tag(item, 'pubDate')),
    });
  }
  return jobs;
}

export async function fetchIndeedJobs(_opts: IndeedSearchOptions): Promise<RawJob[]> {
  throw new Error('Indeed blocks direct requests and retired its RSS feed. Run it through the local browser worker.');
}
