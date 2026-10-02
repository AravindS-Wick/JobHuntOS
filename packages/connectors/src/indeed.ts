import type { RawJob } from '@jobhunt/core';
import { safeFetchText, safeFetchJson } from './http.js';
import { stripHtml } from './html.js';

export interface IndeedSearchOptions {
  query: string;
  location?: string;
  country?: 'in' | 'us' | 'uk' | 'ca';
  limit?: number;
}

/**
 * Parse Indeed RSS XML feed into canonical RawJob format.
 */
export function parseIndeedRss(xmlText: string): RawJob[] {
  const jobs: RawJob[] = [];
  if (!xmlText || typeof xmlText !== 'string') return jobs;

  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1] ?? '';

    // Title
    const titleMatch = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(itemContent);
    const rawTitle = titleMatch ? titleMatch[1] ?? '' : '';

    // Link
    const linkMatch = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i.exec(itemContent);
    const link = linkMatch ? (linkMatch[1] ?? '').trim() : '';

    // GUID / Source ID
    const guidMatch = /<guid[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/i.exec(itemContent);
    const guid = guidMatch ? (guidMatch[1] ?? '').trim() : link;

    // Description
    const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(itemContent);
    const desc = descMatch ? stripHtml(descMatch[1] ?? '').trim() : '';

    // PubDate
    const pubDateMatch = /<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i.exec(itemContent);
    let postedAt: Date | undefined;
    if (pubDateMatch && pubDateMatch[1]) {
      const parsed = new Date(pubDateMatch[1]);
      if (!isNaN(parsed.getTime())) postedAt = parsed;
    }

    // Source (Company name is often in <source> or part of title "Title - Company - Location")
    const sourceMatch = /<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/i.exec(itemContent);
    let company = sourceMatch ? stripHtml(sourceMatch[1] ?? '').trim() : '';

    let cleanTitle = stripHtml(rawTitle).trim();
    if (!company && cleanTitle.includes(' - ')) {
      const parts = cleanTitle.split(' - ');
      if (parts.length >= 2) {
        cleanTitle = parts[0]!.trim();
        company = parts[1]!.trim();
      }
    }

    if (!company) company = 'Indeed Employer';

    // Location extraction from description or title
    let location = 'India';
    const locMatch = /location[:\s]+([^<\n]+)/i.exec(desc) || /in\s+([A-Za-z\s,]+)$/i.exec(cleanTitle);
    if (locMatch && locMatch[1]) {
      location = locMatch[1].trim();
    }

    if (cleanTitle && link) {
      jobs.push({
        source: 'indeed',
        sourceId: guid || link,
        company,
        companySlug: company.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        title: cleanTitle,
        url: link,
        applyUrl: link,
        locationRaw: location,
        descriptionText: desc || `${cleanTitle} at ${company}`,
        postedAt: postedAt || new Date(),
      });
    }
  }

  return jobs;
}

/**
 * Parse Indeed JSON results (from MCP, API or rapidapi wrappers).
 */
export function parseIndeedJson(data: unknown): RawJob[] {
  if (!data || typeof data !== 'object') return [];
  const payload = data as Record<string, any>;
  const list = payload.results || payload.data || payload.jobs || (Array.isArray(payload) ? payload : []);
  const jobs: RawJob[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, any>;
    const title = it.jobTitle || it.title || '';
    const company = it.company || it.companyName || '';
    const id = String(it.jobKey || it.id || it.key || it.link || '');
    if (!title) continue;

    const compName = company || 'Indeed Employer';
    const url = it.link || it.url || (id ? `https://www.indeed.com/viewjob?jk=${id}` : '');

    jobs.push({
      source: 'indeed',
      sourceId: id || url,
      company: compName,
      companySlug: compName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title,
      url: url || `https://www.indeed.com/jobs?q=${encodeURIComponent(title)}`,
      applyUrl: it.applyUrl || url,
      locationRaw: it.location || it.formattedLocation || 'India',
      descriptionText: stripHtml(it.snippet || it.description || `${title} at ${compName}`),
      postedAt: it.date ? new Date(it.date) : new Date(),
      compensationRaw: it.salary || it.estimatedSalary,
    });
  }

  return jobs;
}

/**
 * Fetch jobs from Indeed public RSS feeds.
 */
export async function fetchIndeedJobs(opts: IndeedSearchOptions): Promise<RawJob[]> {
  const { query, location = 'India', country = 'in', limit = 25 } = opts;

  const domain = country === 'in' ? 'in.indeed.com' : 'www.indeed.com';
  const url = `https://${domain}/rss?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&limit=${limit}&sort=date`;

  try {
    const xml = await safeFetchText(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
      },
    });

    const jobs = parseIndeedRss(xml);
    if (jobs.length > 0) return jobs;
  } catch (err) {
    console.warn(`Indeed RSS fetch error (${url}):`, err);
  }

  return [];
}
