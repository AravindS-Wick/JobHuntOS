import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeJob, type RawJob } from '@jobhunt/core';
import { parseWorkdayDetail, parseWorkdayList, parseWorkdayToken } from './workday.js';
import { parseSmartRecruitersDetail, parseSmartRecruitersList } from './smartrecruiters.js';
import { parseZohoRecruit } from './zohorecruit.js';
import { parseAmazon, parseGoogleResults, parseMicrosoftDetail, parseMicrosoftSearch } from './bigtech.js';
import { parseFoundit, parseInstahyre } from './indiaboards.js';
import { parseHnWhoIsHiring, parseRemoteOk, parseYcJobs } from './startupboards.js';
import { parseLinkedInJobDetail, parseLinkedInJobHtml } from './linkedin.js';
import { parseIndeedMosaic } from './indeed.js';
import { BrowserOnlyError, searchBoard } from './boards.js';
import { detectAts } from './detect.js';
import { parseRelativeAge } from './util.js';

// Fixtures are real responses captured 2026-10-02, trimmed to a few items.
const fx = (name: string) => readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8');
const json = (name: string) => JSON.parse(fx(name)) as unknown;

/** Every connector must produce records the normalizer accepts. */
function expectValid(jobs: RawJob[], source: string) {
  expect(jobs.length).toBeGreaterThan(0);
  for (const j of jobs) {
    expect(j.source).toBe(source);
    expect(j.sourceId).toBeTruthy();
    expect(j.title).toBeTruthy();
    expect(j.company).toBeTruthy();
    expect(j.url).toMatch(/^https:\/\//);
    if (j.postedAt) expect(Number.isNaN(j.postedAt.getTime())).toBe(false);
    expect(() => normalizeJob(j)).not.toThrow();
  }
}

describe('Workday', () => {
  const token = 'nvidia/wd5/NVIDIAExternalCareerSite';

  it('parses the list and builds public URLs', () => {
    const jobs = parseWorkdayList(json('workday.nvidia.list.json'), token, 'NVIDIA');
    expectValid(jobs, 'workday');
    expect(jobs[0]!.url).toMatch(/^https:\/\/nvidia\.wd5\.myworkdayjobs\.com\/en-US\/NVIDIAExternalCareerSite\/job\//);
  });

  it('parses the detail into a description', () => {
    const d = parseWorkdayDetail(json('workday.nvidia.detail.json'));
    expect(d.descriptionText!.length).toBeGreaterThan(200);
  });

  it('rejects malformed tokens', () => {
    expect(() => parseWorkdayToken('nvidia')).toThrow(/tenant\/wdN\/site/);
  });

  it('is detected from a careers URL with the full token', () => {
    const d = detectAts('https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Israel/SWE_JR1');
    expect(d).toMatchObject({ ats: 'workday', token: token });
  });
});

describe('SmartRecruiters', () => {
  it('parses list and detail', () => {
    const jobs = parseSmartRecruitersList(json('smartrecruiters.list.json'), 'BoschGroup');
    expectValid(jobs, 'smartrecruiters');
    expect(parseSmartRecruitersDetail(json('smartrecruiters.detail.json')).descriptionText!.length).toBeGreaterThan(100);
  });
});

describe('Zoho Recruit', () => {
  it('reads the embedded jobs JSON', () => {
    const jobs = parseZohoRecruit(fx('zohorecruit.careers.html'), 'careers.zohocorp.com/jobs/Careers', 'Zoho');
    expectValid(jobs, 'zohorecruit');
    expect(jobs[0]!.url).toMatch(/^https:\/\/careers\.zohocorp\.com\/jobs\/Careers\/\d+\//);
  });

  it('is detected', () => {
    expect(detectAts('https://careers.zohocorp.com/jobs/Careers').ats).toBe('zohorecruit');
    expect(detectAts('https://acme.zohorecruit.in/jobs/Careers').token).toBe('acme.zohorecruit.in/jobs/Careers');
  });
});

describe('big-tech careers sites', () => {
  it('Amazon', () => {
    const jobs = parseAmazon(json('amazon.search.json'));
    expectValid(jobs, 'amazon');
    expect(jobs[0]!.descriptionText.length).toBeGreaterThan(100);
  });

  it('Microsoft search + detail', () => {
    const jobs = parseMicrosoftSearch(json('microsoft.search.json'));
    expectValid(jobs, 'microsoft');
    expect(jobs[0]!.postedAt).toBeInstanceOf(Date);
    expect(parseMicrosoftDetail(json('microsoft.detail.json')).descriptionText!.length).toBeGreaterThan(200);
  });

  it('Google', () => {
    const jobs = parseGoogleResults(fx('google.results.html'));
    expectValid(jobs, 'google');
    expect(jobs[0]!.locationRaw).toMatch(/India/);
    expect(jobs[0]!.descriptionText).toMatch(/qualifications/i);
  });
});

describe('Indian boards', () => {
  it('Instahyre', () => expectValid(parseInstahyre(json('instahyre.search.json')), 'instahyre'));

  it('Foundit treats 0-0 INR as undisclosed and keeps skills', () => {
    const jobs = parseFoundit(json('foundit.search.json'));
    expectValid(jobs, 'foundit');
    expect(jobs[0]!.descriptionText).toMatch(/Skills:/);
    expect(jobs.every((j) => j.compensationRaw === undefined || !/^0-0/.test(j.compensationRaw))).toBe(true);
  });
});

describe('startup and remote boards', () => {
  it('YC Work at a Startup', () => {
    const jobs = parseYcJobs(fx('yc.jobs.html'));
    expectValid(jobs, 'yc');
    const withSalary = jobs.find((j) => j.compensationRaw);
    if (withSalary) expect(withSalary.compensationRaw).toMatch(/\$\d{2,3},\d{3}/);
  });

  it('HN Who is hiring splits "Company | Role | Location"', () => {
    const jobs = parseHnWhoIsHiring(json('hn.whoishiring.json'));
    expectValid(jobs, 'hn');
    expect(jobs[0]!.company).not.toMatch(/\|/);
  });

  it('HN filters by query keywords', () => {
    const all = parseHnWhoIsHiring(json('hn.whoishiring.json'));
    const react = parseHnWhoIsHiring(json('hn.whoishiring.json'), { keywords: 'react' });
    expect(react.length).toBeLessThanOrEqual(all.length);
    for (const j of react) expect(j.descriptionText.toLowerCase()).toContain('react');
  });

  it('RemoteOK skips the legal notice row', () => expectValid(parseRemoteOk(json('remoteok.json')), 'remoteok'));
});

describe('LinkedIn guest', () => {
  it('parses real search cards and never invents a posted date', () => {
    const jobs = parseLinkedInJobHtml(fx('linkedin.search.html'));
    expectValid(jobs, 'linkedin');
    const noTime = parseLinkedInJobHtml('<li><div class="base-card"><h3 class="base-search-card__title">SWE</h3><h4 class="base-search-card__subtitle">Acme</h4><a class="base-card__full-link" href="https://in.linkedin.com/jobs/view/swe-1234567890"></a></div></li>');
    expect(noTime[0]!.postedAt).toBeUndefined();
  });

  it('parses the detail description', () => {
    expect(parseLinkedInJobDetail(fx('linkedin.detail.html')).descriptionText!.length).toBeGreaterThan(200);
  });
});

describe('Indeed (browser-captured mosaic JSON)', () => {
  it('maps job cards', () => {
    const jobs = parseIndeedMosaic([
      { jobkey: 'abc123', displayTitle: 'React Developer', company: 'Acme', formattedLocation: 'Chennai, Tamil Nadu', snippet: '<ul><li>React, TypeScript</li></ul>', pubDate: 1790000000000 },
      { displayTitle: 'missing key' },
    ]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.url).toBe('https://in.indeed.com/viewjob?jk=abc123');
  });
});

describe('board dispatcher', () => {
  it('routes blocked boards to the browser worker', async () => {
    await expect(searchBoard('naukri', { keywords: 'react developer', location: 'Chennai' })).rejects.toBeInstanceOf(BrowserOnlyError);
    await expect(searchBoard('glassdoor', { keywords: 'react' })).rejects.toThrow(/browser worker/);
  });
});

describe('relative ages', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  it.each([
    ['Posted Today', 0],
    ['Posted Yesterday', 1],
    ['Posted 3 Days Ago', 3],
    ['Posted 30+ Days Ago', 30],
    ['about 24 hours ago', 1],
  ])('%s', (text, days) => {
    const d = parseRelativeAge(text, now)!;
    expect(Math.round((now.getTime() - d.getTime()) / 864e5)).toBe(days);
  });

  it('returns undefined when there is no age', () => {
    expect(parseRelativeAge('Hiring now', now)).toBeUndefined();
  });
});

describe('registry tokens with a search filter', () => {
  it('Workday reads ?q= and keeps the board path', () => {
    expect(parseWorkdayToken('nvidia/wd5/NVIDIAExternalCareerSite?q=India')).toMatchObject({ tenant: 'nvidia', site: 'NVIDIAExternalCareerSite', search: 'India' });
  });

  it('Workday skips a malformed posting instead of failing the board', () => {
    const jobs = parseWorkdayList({ total: 2, jobPostings: [{ title: null }, { title: 'SWE', externalPath: '/job/x/SWE_1' }] }, 'nvidia/wd5/S', 'NVIDIA');
    expect(jobs).toHaveLength(1);
  });
});
