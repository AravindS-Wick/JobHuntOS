/// <reference lib="dom" />
import type { Page } from 'playwright-core';
import { parseIndeedMosaic, parseNaukriPayload, slugify, stableId } from '@jobhunt/connectors';
import type { RawJob } from '@jobhunt/core';
import { pause } from '../browser.js';
import { detectBlocker, ensurePageHelpers } from '../form.js';

/**
 * Search pages for boards that block direct requests, loaded in the user's
 * own browser. Where the page loads structured JSON we read that (Naukri,
 * Indeed); otherwise JSON-LD, then the visible job cards.
 */
export type ScrapeOutcome = { ok: true; jobs: RawJob[] } | { ok: false; reason: string; human?: boolean };

async function naukri(page: Page, url: string): Promise<ScrapeOutcome> {
  const payloads: unknown[] = [];
  page.on('response', async (res) => {
    if (/jobapi\/v\d+\/search/.test(res.url()) && res.ok()) payloads.push(await res.json().catch(() => undefined));
  });
  await page.goto(url);
  await page.waitForResponse((r) => /jobapi\/v\d+\/search/.test(r.url()), { timeout: 20_000 }).catch(() => undefined);
  await pause(1500, 2500);
  const jobs = payloads.flatMap((p) => parseNaukriPayload(p));
  return jobs.length ? { ok: true, jobs } : { ok: false, reason: 'Naukri returned no search results (blocked or no matches)' };
}

async function indeed(page: Page, url: string): Promise<ScrapeOutcome> {
  await page.goto(url);
  await pause(2000, 3500);
  await ensurePageHelpers(page);
  const results = await page.evaluate(() => {
    const w = window as unknown as { mosaic?: { providerData?: Record<string, any> } };
    return w.mosaic?.providerData?.['mosaic-provider-jobcards']?.metaData?.mosaicProviderJobCardsModel?.results ?? null;
  });
  if (!results) return { ok: false, reason: 'Indeed job cards not found on the page' };
  return { ok: true, jobs: parseIndeedMosaic(results, new URL(page.url()).host) };
}

/** JSON-LD JobPosting blocks and job-card links: works on most other boards. */
async function generic(page: Page, url: string, board: string, linkPattern: RegExp, companyLink?: RegExp): Promise<ScrapeOutcome> {
  await page.goto(url);
  await pause(2500, 4000);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 2500); await pause(800, 1500); }
  await ensurePageHelpers(page);
  const cards = await page.evaluate(({ pattern, companyPattern }) => {
    const re = new RegExp(pattern);
    const companyRe = companyPattern ? new RegExp(companyPattern) : null;
    const NOT_COMPANY = /^(full[- ]?time|part[- ]?time|contract|internship|remote|hybrid|onsite|new|easy apply|promoted|featured|actively hiring)$/i;
    const MONEY = /[₹$€£]|\d{1,3},\d{3}|per (hour|month|annum|year)|lpa\b/i;
    /** Boards that group jobs under a company block (Wellfound) name it in a /company/ link above the card. */
    const companyFromLink = (from: Element): string => {
      if (!companyRe) return '';
      for (let el: Element | null = from, d = 0; el && d < 10; el = el.parentElement, d++) {
        const link = Array.from(el.querySelectorAll('a[href]')).find((x) => companyRe.test((x as HTMLAnchorElement).href) && (x as HTMLElement).innerText.trim());
        if (link) return (link as HTMLElement).innerText.trim().split('\n')[0] ?? '';
      }
      return '';
    };
    const out: { title: string; href: string; company: string; location: string; text: string }[] = [];
    const seen = new Set<string>();
    for (const a of Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
      if (!re.test(a.href) || seen.has(a.href)) continue;
      const title = (a.innerText || a.getAttribute('aria-label') || '').trim().split('\n')[0] ?? '';
      if (title.length < 4 || title.length > 140) continue;
      seen.add(a.href);
      let card: HTMLElement | null = a;
      for (let d = 0; card && d < 6 && (card.innerText?.length ?? 0) < 120; d++) card = card.parentElement;
      const lines = (card?.innerText ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
      const company = (companyFromLink(a) || lines.find((l) => l !== title && l.length < 60 && !NOT_COMPANY.test(l) && !MONEY.test(l) && !/\d+ (days?|hours?) ago|apply|save/i.test(l)) || '')
        .replace(/^at\s+/i, '').trim();
      const location = lines.find((l) => /remote|india|bengaluru|bangalore|chennai|hyderabad|pune|mumbai|delhi|gurgaon|noida|,/i.test(l) && !MONEY.test(l) && l !== company && l !== title) ?? '';
      out.push({ title, href: a.href.split('?')[0]!, company, location, text: lines.slice(0, 12).join('\n') });
    }
    return out;
  }, { pattern: linkPattern.source, companyPattern: companyLink?.source });
  if (!cards.length) {
    const blocker = await detectBlocker(page);
    return { ok: false, reason: blocker ? `${blocker.detail} on ${board}` : `No job cards found on ${board}`, human: Boolean(blocker) };
  }
  return {
    ok: true,
    jobs: cards.filter((c) => c.company).map((c): RawJob => ({
      source: board as RawJob['source'], sourceId: stableId(c.href), company: c.company, companySlug: slugify(c.company),
      title: c.title, url: c.href, applyUrl: c.href, locationRaw: c.location, descriptionText: c.text,
    })),
  };
}

export async function scrapeBoard(page: Page, board: string, url: string): Promise<ScrapeOutcome> {
  switch (board) {
    case 'naukri': return naukri(page, url);
    case 'indeed': return indeed(page, url);
    case 'glassdoor': return generic(page, url, board, /glassdoor\.[a-z.]+\/(job-listing|partner\/jobListing)/);
    case 'wellfound': return generic(page, url, board, /wellfound\.com\/jobs\/\d+/, /wellfound\.com\/company\/[^/]+\/?$/);
    case 'cutshort': return generic(page, url, board, /cutshort\.io\/job\//);
    default: return { ok: false, reason: `No browser scraper for ${board}` };
  }
}
