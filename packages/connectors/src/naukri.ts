import type { RawJob } from '@jobhunt/core';
import { safeFetchJson, safeFetchText } from './http.js';
import { stripHtml } from './html.js';

export interface NaukriSearchOptions {
  query: string;
  location?: string;
  experience?: number;
  limit?: number;
  apifyToken?: string;
}

/**
 * Parse Naukri Job API v3 or embedded search JSON structure.
 */
export function parseNaukriPayload(data: unknown): RawJob[] {
  if (!data || typeof data !== 'object') return [];
  const payload = data as Record<string, any>;
  const rawList: any[] = payload.jobDetails || payload.jobs || (Array.isArray(payload) ? payload : []);
  const jobs: RawJob[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const title = item.title || item.jobTitle || '';
    const company = item.companyName || item.company || '';
    const jobId = String(item.jobId || item.id || item.groupId || '');
    if (!title || !company) continue;

    // Location parsing
    let location = 'India';
    if (Array.isArray(item.placeholders)) {
      const locPlaceholder = item.placeholders.find((p: any) => p.type === 'location');
      if (locPlaceholder?.label) location = locPlaceholder.label;
    } else if (item.location) {
      location = typeof item.location === 'string' ? item.location : (item.location.label || 'India');
    }

    // Salary parsing
    let salaryRaw: string | undefined;
    if (Array.isArray(item.placeholders)) {
      const salaryPlaceholder = item.placeholders.find((p: any) => p.type === 'salary');
      if (salaryPlaceholder?.label && !salaryPlaceholder.label.toLowerCase().includes('not disclosed')) {
        salaryRaw = salaryPlaceholder.label;
      }
    } else if (item.salary) {
      salaryRaw = typeof item.salary === 'string' ? item.salary : item.salary.label;
    }

    // URL
    const url = item.jdURL
      ? (item.jdURL.startsWith('http') ? item.jdURL : `https://www.naukri.com${item.jdURL}`)
      : `https://www.naukri.com/job-listings-${jobId}`;

    // Description & tags
    const tags = Array.isArray(item.tagsAndSkills) ? item.tagsAndSkills.map((t: any) => (typeof t === 'string' ? t : t.label || t)).join(', ') : '';
    const desc = item.jobDescription || item.description || tags || `${title} at ${company}. Experience: ${item.experience || '3-8 yrs'}`;

    // Date
    let postedAt: Date | undefined;
    if (item.createdDate) {
      const parsed = new Date(item.createdDate);
      if (!isNaN(parsed.getTime())) postedAt = parsed;
    }

    jobs.push({
      source: 'naukri',
      sourceId: jobId || url,
      company,
      companySlug: company.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title,
      url,
      applyUrl: url,
      locationRaw: location,
      descriptionText: stripHtml(desc),
      compensationRaw: salaryRaw,
      postedAt: postedAt || new Date(),
    });
  }

  return jobs;
}

/**
 * Parse Apify Naukri Scraper output (e.g. muhammetakkurtt/naukri-job-scraper).
 */
export function parseNaukriApify(items: unknown[]): RawJob[] {
  if (!Array.isArray(items)) return [];
  const jobs: RawJob[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, any>;
    const title = it.title || it.jobTitle || '';
    const company = it.company || it.companyName || '';
    const id = String(it.jobId || it.id || it.url || '');
    if (!title || !company) continue;

    const url = it.url || it.applyUrl || `https://www.naukri.com/job-listings-${id}`;

    jobs.push({
      source: 'naukri',
      sourceId: id || url,
      company,
      companySlug: company.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title,
      url,
      applyUrl: url,
      locationRaw: it.location || 'India',
      descriptionText: stripHtml(it.jobDescription || it.description || it.skills?.join(', ') || `${title} at ${company}`),
      compensationRaw: it.salary || it.salaryPackage,
      postedAt: it.postedAt ? new Date(it.postedAt) : new Date(),
    });
  }

  return jobs;
}

/**
 * Fetch Naukri jobs via search API or Apify actor fallback.
 */
export async function fetchNaukriJobs(opts: NaukriSearchOptions): Promise<RawJob[]> {
  const { query, location = 'Chennai, Bangalore, Remote', experience, limit = 20, apifyToken } = opts;

  // 1. Apify actor fallback
  if (apifyToken) {
    try {
      const apifyUrl = `https://api.apify.com/v2/acts/muhammetakkurtt~naukri-job-scraper/run-sync-get-dataset-items?token=${apifyToken}`;
      const apifyRes = await safeFetchJson<unknown[]>(apifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: query,
          location,
          maxJobs: limit,
        }),
      });
      if (Array.isArray(apifyRes)) {
        const parsed = parseNaukriApify(apifyRes);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Naukri Apify fetch failed, trying direct search:', e);
    }
  }

  // 2. Direct Naukri Search API
  try {
    const encodedKeyword = encodeURIComponent(query);
    const encodedLoc = encodeURIComponent(location);
    const expParam = experience !== undefined ? `&experience=${experience}` : '';
    const url = `https://www.naukri.com/jobapi/v3/search?noOfResults=${limit}&urlType=search_by_keyword&searchType=adv&keyword=${encodedKeyword}&location=${encodedLoc}${expParam}&pageNo=1`;

    const headers = {
      appid: '109',
      systemid: 'naukri',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json',
      'clientid': 'd3skt0p',
    };

    const res = await safeFetchJson<any>(url, { headers });
    const parsed = parseNaukriPayload(res);
    if (parsed.length > 0) return parsed;
  } catch (err) {
    console.warn('Naukri direct API fetch error:', err);
  }

  return [];
}
