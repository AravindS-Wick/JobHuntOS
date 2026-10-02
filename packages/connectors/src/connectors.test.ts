import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGreenhouse } from './greenhouse.js';
import { parseLever } from './lever.js';
import { parseAshby } from './ashby.js';
import { detectAts } from './detect.js';
import { htmlToText, decodeEntities } from './html.js';

const fx = (n: string) => JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures', n), 'utf8'));

describe('html', () => {
  it('decodes numeric and named entities', () => {
    expect(decodeEntities('&#8377;28 &amp; more &nbsp;')).toBe('₹28 & more  ');
  });
  it('strips double-encoded greenhouse html into readable text', () => {
    const t = htmlToText('&lt;p&gt;Hello&lt;/p&gt;&lt;ul&gt;&lt;li&gt;React&lt;/li&gt;&lt;/ul&gt;');
    expect(t).toContain('Hello');
    expect(t).toContain('React');
    expect(t).not.toContain('<');
  });
});

describe('parseGreenhouse', () => {
  const jobs = parseGreenhouse(fx('greenhouse.acme.json'), 'acme', 'Acme Cloud');
  it('maps every posting', () => expect(jobs).toHaveLength(4));
  it('decodes the description', () => {
    expect(jobs[0]!.descriptionText).toContain('React');
    expect(jobs[0]!.descriptionText).toContain('₹28 - 38 LPA');
  });
  it('carries source identity and dates', () => {
    expect(jobs[0]!.source).toBe('greenhouse');
    expect(jobs[0]!.sourceId).toBe('8077887');
    expect(jobs[0]!.postedAt).toBeInstanceOf(Date);
  });
});

describe('parseLever', () => {
  const jobs = parseLever(fx('lever.globex.json'), 'globex', 'Globex');
  it('parses a bare array response', () => expect(jobs).toHaveLength(2));
  it('folds `lists` into the description (Lever hides requirements there)', () => {
    expect(jobs[0]!.descriptionText).toContain('5+ years with React');
    expect(jobs[0]!.descriptionText).toContain('Terraform');
  });
  it('reads workplaceType and allLocations', () => {
    expect(jobs[0]!.workplaceTypeRaw).toBe('hybrid');
    expect(jobs[0]!.allLocations).toEqual(['Bengaluru, India', 'Remote - India']);
  });
});

describe('parseAshby', () => {
  const jobs = parseAshby(fx('ashby.initech.json'), 'initech', 'Initech');
  it('maps listed jobs', () => expect(jobs).toHaveLength(2));
  it('prefers descriptionPlain', () => expect(jobs[0]!.descriptionText).toContain('Cloud Run'));
  it('derives applyUrl when absent', () => expect(jobs[1]!.applyUrl).toContain('/application'));
});

describe('detectAts', () => {
  const cases: [string, string, string | null][] = [
    ['https://boards.greenhouse.io/stripe', 'greenhouse', 'stripe'],
    ['https://job-boards.greenhouse.io/postman/jobs/123', 'greenhouse', 'postman'],
    ['https://jobs.lever.co/palantir/abc', 'lever', 'palantir'],
    ['https://jobs.ashbyhq.com/openai/xyz', 'ashby', 'openai'],
    ['https://freshworks.wd1.myworkdayjobs.com/en-US/Freshworks/job/X', 'workday', 'freshworks/wd1/Freshworks'],
    ['https://example.com/careers', 'unknown', null],
  ];
  for (const [url, ats, token] of cases) {
    it(`detects ${ats} from ${url}`, () => {
      const d = detectAts(url);
      expect(d.ats).toBe(ats);
      expect(d.token).toBe(token);
    });
  }
});

describe('LinkedIn connector', () => {
  it('parses HTML job cards from guest search', async () => {
    const { parseLinkedInJobHtml } = await import('./linkedin.js');
    const mockHtml = `
      <ul class="jobs-search__results-list">
        <li>
          <div class="base-card job-search-card">
            <h3 class="base-search-card__title">Senior Staff Engineer</h3>
            <h4 class="base-search-card__subtitle">Cred</h4>
            <span class="job-search-card__location">Bengaluru, India</span>
            <a class="base-card__full-link" href="https://in.linkedin.com/jobs/view/senior-staff-engineer-at-cred-3891029381?refId=xyz">View</a>
            <time datetime="2026-08-28">3 days ago</time>
          </div>
        </li>
      </ul>
    `;
    const jobs = parseLinkedInJobHtml(mockHtml);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.title).toBe('Senior Staff Engineer');
    expect(jobs[0]!.company).toBe('Cred');
    expect(jobs[0]!.source).toBe('linkedin');
    expect(jobs[0]!.locationRaw).toBe('Bengaluru, India');
    expect(jobs[0]!.sourceId).toBe('3891029381');
  });

  it('parses Apify LinkedIn actor items', async () => {
    const { parseLinkedInApify } = await import('./linkedin.js');
    const items = [
      {
        id: '123456',
        title: 'Lead Frontend Developer',
        companyName: 'Razorpay',
        location: 'Remote - India',
        link: 'https://www.linkedin.com/jobs/view/123456',
        description: 'React, TypeScript, Next.js leadership role',
        salary: '₹35 - 45 LPA',
      },
    ];
    const jobs = parseLinkedInApify(items);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.company).toBe('Razorpay');
    expect(jobs[0]!.compensationRaw).toBe('₹35 - 45 LPA');
  });
});

describe('Naukri connector', () => {
  it('parses Naukri JSON payload with placeholders', async () => {
    const { parseNaukriPayload } = await import('./naukri.js');
    const payload = {
      jobDetails: [
        {
          jobId: '987654321',
          title: 'Principal Backend Engineer (Go / Distributed Systems)',
          companyName: 'Swiggy',
          jdURL: '/job-listings-swiggy-987654321',
          placeholders: [
            { type: 'location', label: 'Chennai, Bangalore (Remote)' },
            { type: 'salary', label: '30-45 Lacs PA' },
          ],
          jobDescription: 'Seeking expert Go and Postgres architect for core platform team.',
          createdDate: '2026-08-25T10:00:00.000Z',
        },
      ],
    };
    const jobs = parseNaukriPayload(payload);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.title).toContain('Principal Backend Engineer');
    expect(jobs[0]!.company).toBe('Swiggy');
    expect(jobs[0]!.locationRaw).toBe('Chennai, Bangalore (Remote)');
    expect(jobs[0]!.compensationRaw).toBe('30-45 Lacs PA');
    expect(jobs[0]!.source).toBe('naukri');
  });
});

describe('Indeed connector', () => {
  it('parses Indeed RSS XML feed', async () => {
    const { parseIndeedRss } = await import('./indeed.js');
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <rss version="2.0">
        <channel>
          <title>Indeed Jobs</title>
          <item>
            <title><![CDATA[Staff Software Engineer - Browser Automation - BrowserStack]]></title>
            <link>https://in.indeed.com/viewjob?jk=abc123456</link>
            <description><![CDATA[Location: Remote, India. Required skills: TypeScript, Node.js, Web Architecture.]]></description>
            <pubDate>Mon, 28 Aug 2026 12:00:00 GMT</pubDate>
            <guid>abc123456</guid>
            <source>BrowserStack</source>
          </item>
        </channel>
      </rss>`;
    const jobs = parseIndeedRss(xml);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.company).toBe('BrowserStack');
    expect(jobs[0]!.source).toBe('indeed');
    expect(jobs[0]!.sourceId).toBe('abc123456');
  });
});

describe('Gmail connector & classifier', () => {
  it('classifies interview invitations and extracts meeting links', async () => {
    const { classifyEmail } = await import('./gmail.js');
    const result = classifyEmail(
      'Interview Invitation: Senior Engineering Lead at Postman',
      'Please select your slot for technical discussion',
      'Hi Aravindhan, we would love to invite you to interview with our engineering team. Please join via https://meet.google.com/abc-defg-hij on Tuesday.',
      'recruiter@postman.com',
    );
    expect(result.category).toBe('interview_invite');
    expect(result.interviewUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(result.actionRequired).toBe(true);
  });

  it('classifies online assessment links and flags action', async () => {
    const { classifyEmail } = await import('./gmail.js');
    const result = classifyEmail(
      'HackerRank Assessment - Stripe Engineering',
      'You have been invited to complete a coding challenge',
      'Please complete your technical assessment at https://hackerrank.com/tests/stripe-lead-eng within 48 hours.',
      'talent@stripe.com',
    );
    expect(result.category).toBe('assessment_link');
    expect(result.assessmentUrl).toBe('https://hackerrank.com/tests/stripe-lead-eng');
    expect(result.actionRequired).toBe(true);
  });

  it('classifies polite rejections without noise', async () => {
    const { classifyEmail } = await import('./gmail.js');
    const result = classifyEmail(
      'Update on your application at Canva',
      'Thank you for your time and interest',
      'Unfortunately, after careful consideration, we have decided to pursue other candidates whose experience more closely aligns with our current requirements.',
      'no-reply@canva.com',
    );
    expect(result.category).toBe('rejection');
    expect(result.actionRequired).toBe(false);
  });
});

