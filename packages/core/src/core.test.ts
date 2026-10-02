import { describe, expect, it } from 'vitest';
import { dedupHash, extractSalary, inferSeniority, inferWorkMode, normalizeCompany, normalizeJob, normalizeTitle } from './normalize.js';
import { matchSkills, scoreJob, tierFor } from './score.js';
import { dedupe } from './dedup.js';
import { PROFILE } from './profile.js';
import type { RawJob } from './types.js';

const base = (over: Partial<RawJob> = {}): RawJob => ({
  source: 'greenhouse', sourceId: '1', company: 'Acme Cloud Pvt Ltd', companySlug: 'acme',
  title: 'Senior Full Stack Engineer (React / Node.js)', url: 'https://x/1',
  locationRaw: 'Remote - India', descriptionText: 'React Redux TypeScript Node.js REST API GCP Docker Jest',
  postedAt: new Date(Date.now() - 2 * 36e5), ...over,
});

describe('normalizeCompany', () => {
  it('strips legal suffixes so the same company matches across boards', () => {
    expect(normalizeCompany('Acme Cloud Pvt Ltd')).toBe('acme cloud');
    expect(normalizeCompany('Acme Cloud Technologies, Inc.')).toBe('acme cloud');
  });
});

describe('normalizeTitle', () => {
  it('removes parentheticals, seniority noise and separators', () => {
    expect(normalizeTitle('Senior Full Stack Engineer (React / Node.js) - Remote')).toBe('senior full stack engineer');
    expect(normalizeTitle('React Developer | 5+ Years | Immediate Joiner')).toBe('react developer');
  });
});

describe('inferWorkMode', () => {
  it('trusts an explicit workplaceType above prose', () => {
    expect(inferWorkMode({ title: 'X', locationRaw: 'Chennai', descriptionText: 'remote friendly', workplaceTypeRaw: 'hybrid' })).toBe('hybrid');
  });
  it('reads location before description', () => {
    expect(inferWorkMode({ title: 'X', locationRaw: 'Remote - India', descriptionText: 'office in Chennai' })).toBe('remote');
  });
  it('does not call a role remote just because the JD mentions remote work culture late on', () => {
    expect(inferWorkMode({ title: 'Engineer', locationRaw: 'Chennai, India', descriptionText: 'a'.repeat(2000) + ' we support remote' })).toBe('unknown');
  });
});

describe('inferSeniority', () => {
  it.each([
    ['Senior Software Engineer', 'senior'],
    ['Junior Frontend Developer', 'junior'],
    ['Staff Backend Engineer', 'staff'],
    ['Engineering Manager, Platform', 'manager'],
    ['Tech Lead', 'lead'],
  ])('%s -> %s', (title, expected) => expect(inferSeniority(title)).toBe(expected));

  it('falls back to years-of-experience in the description', () => {
    expect(inferSeniority('Software Engineer', 'We want 6+ years of experience')).toBe('senior');
  });
});

describe('extractSalary', () => {
  it('reads Indian LPA ranges', () => {
    const s = extractSalary('Compensation: ₹28 - 38 LPA');
    expect(s.salaryCurrency).toBe('INR');
    expect(s.salaryInrLpaEquivalent).toBe(33);
  });
  it('reads USD ranges and converts for ranking only', () => {
    const s = extractSalary('$120,000 - $160,000 per year');
    expect(s.salaryCurrency).toBe('USD');
    expect(s.salaryInrLpaEquivalent).toBeGreaterThan(100);
  });
  it('returns nothing when undisclosed', () => expect(extractSalary('Competitive salary')).toEqual({}));
});

describe('dedupHash', () => {
  it('is stable across cosmetic company/title differences', () => {
    expect(dedupHash('Acme Cloud Pvt Ltd', 'Senior Full Stack Engineer (React)', 'Remote - India'))
      .toBe(dedupHash('Acme Cloud, Inc.', 'Senior Full Stack Engineer - React', 'Remote India'));
  });
});

describe('matchSkills', () => {
  it('never counts a gap technology as a match', () => {
    const job = normalizeJob(base({ descriptionText: 'React and Node.js. Must have Kubernetes and AWS Lambda.' }));
    const { matched, gaps } = matchSkills(job, PROFILE);
    expect(matched).toContain('react');
    expect(gaps).toEqual(expect.arrayContaining(['kubernetes', 'aws', 'lambda']));
    expect(matched).not.toContain('kubernetes');
  });
  it('respects word boundaries — "java" must not match "javascript"', () => {
    const job = normalizeJob(base({ descriptionText: 'Strong JavaScript and TypeScript.' }));
    const { gaps } = matchSkills(job, PROFILE);
    expect(gaps).not.toContain('java');
  });
  it('does not match "go" inside "Google"', () => {
    const job = normalizeJob(base({ descriptionText: 'We run on Google Cloud.' }));
    expect(matchSkills(job, PROFILE).gaps).not.toContain('go');
  });
});

describe('scoreJob', () => {
  it('ranks a matching senior remote React/Node role in Tier 1', () => {
    const job = normalizeJob(base({ descriptionText: 'React Redux TypeScript Node.js REST API design GCP Cloud Run Pub/Sub Docker CI/CD Jest. ₹28 - 38 LPA' }));
    const s = scoreJob(job, PROFILE);
    expect(s.tier).toBe(1);
    expect(s.score).toBeGreaterThanOrEqual(70);
    expect(s.disqualified).toBeUndefined();
  });

  it('disqualifies a junior role', () => {
    const s = scoreJob(normalizeJob(base({ title: 'Junior Frontend Developer' })), PROFILE);
    expect(s.disqualified).toBe('seniority below target');
    expect(s.tier).toBe(4);
  });

  it('disqualifies a wrong-discipline role', () => {
    const s = scoreJob(normalizeJob(base({ title: 'Senior Data Scientist' })), PROFILE);
    expect(s.disqualified).toContain('title excluded');
  });

  it('penalises an onsite role outside acceptable cities', () => {
    const s = scoreJob(normalizeJob(base({ title: 'Senior Software Engineer', locationRaw: 'London, United Kingdom', workplaceTypeRaw: 'Onsite' })), PROFILE);
    expect(s.disqualified).toBe('onsite/hybrid outside acceptable cities');
  });

  it('flags disclosed pay below the floor', () => {
    const s = scoreJob(normalizeJob(base({ descriptionText: 'React Node. Compensation ₹12 - 15 LPA' })), PROFILE);
    expect(s.disqualified).toContain('below floor');
  });

  it('discounts evergreen talent-pool postings', () => {
    const fresh = scoreJob(normalizeJob(base({ title: 'Senior Full Stack Engineer' })), PROFILE);
    const ghost = scoreJob(normalizeJob(base({ title: 'Senior Full Stack Engineer — Talent Community (General Application)' })), PROFILE);
    expect(ghost.ghostScore).toBeGreaterThanOrEqual(0.5);
    expect(ghost.score).toBeLessThan(fresh.score);
  });

  it('rewards a posting published in the last few hours', () => {
    const fresh = scoreJob(normalizeJob(base({ postedAt: new Date(Date.now() - 2 * 36e5) })), PROFILE);
    const stale = scoreJob(normalizeJob(base({ postedAt: new Date(Date.now() - 30 * 864e5) })), PROFILE);
    expect(fresh.score).toBeGreaterThan(stale.score);
  });

  it('always surfaces gaps rather than hiding them', () => {
    const s = scoreJob(normalizeJob(base({ descriptionText: 'React, Node.js, AWS, Kubernetes, GraphQL' })), PROFILE);
    expect(s.gaps).toEqual(expect.arrayContaining(['aws', 'kubernetes', 'graphql']));
  });
});

describe('tierFor', () => {
  it.each([[85, 1], [70, 1], [69, 2], [50, 2], [49, 3], [30, 3], [29, 4]])('%i -> tier %i', (s, t) => {
    expect(tierFor(s)).toBe(t);
  });
});

describe('dedupe', () => {
  it('collapses the same role seen on two boards and prefers the company ATS', () => {
    const a = normalizeJob(base({ source: 'linkedin', sourceId: 'li-1' }));
    const b = normalizeJob(base({ source: 'greenhouse', sourceId: 'gh-1' }));
    const { unique, duplicatesRemoved, seenOn } = dedupe([a, b]);
    expect(unique).toHaveLength(1);
    expect(duplicatesRemoved).toBe(1);
    expect(unique[0]!.source).toBe('greenhouse');
    expect(seenOn.get(unique[0]!.dedupHash)).toEqual(expect.arrayContaining(['linkedin', 'greenhouse']));
  });

  it('keeps genuinely different roles at the same company', () => {
    const a = normalizeJob(base({ title: 'Senior Full Stack Engineer' }));
    const b = normalizeJob(base({ title: 'Senior Backend Engineer', sourceId: '2' }));
    expect(dedupe([a, b]).unique).toHaveLength(2);
  });
});

describe('regressions', () => {
  it('does not split "Chennai, India" into two locations', () => {
    const j = normalizeJob(base({ locationRaw: 'Chennai, India' }));
    expect(j.locations).toEqual(['Chennai, India']);
  });
  it('does split a genuine multi-location string', () => {
    const j = normalizeJob(base({ locationRaw: 'Chennai, India / Bengaluru, India' }));
    expect(j.locations).toEqual(['Chennai, India', 'Bengaluru, India']);
  });
  it('disqualifies a role with zero profile matches and several gap technologies', () => {
    const s = scoreJob(normalizeJob(base({
      title: 'Staff Backend Engineer, Java & Kafka',
      descriptionText: 'Deep Java, Spring Boot, Kafka and Cassandra experience required. Kubernetes on AWS.',
    })), PROFILE);
    expect(s.disqualified).toContain('wrong stack');
    expect(s.tier).toBe(4);
  });
});
