import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseGreenhouse, parseLever, type FetchResult } from '@jobhunt/connectors';
import type { CompanyEntry } from '@jobhunt/core';
import { createRepos, createTestDb, type Repos } from '@jobhunt/db';
import { ingestService } from './ingest.js';
import { profileService } from './profile.js';
import { rescoreService } from './rescore.js';

const fx = (n: string) => JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures', n), 'utf8'));

/** Stands in for the HTTP connectors — the pipeline never touches the network in tests. */
function stubFetcher(overrides: Record<string, Partial<FetchResult>> = {}) {
  return async (company: CompanyEntry): Promise<FetchResult> => {
    if (overrides[company.token]) return { company, jobs: [], ...overrides[company.token] } as FetchResult;
    if (company.ats === 'greenhouse') return { company, jobs: parseGreenhouse(fx('greenhouse.acme.json'), company.token, company.name) };
    if (company.ats === 'lever') return { company, jobs: parseLever(fx('lever.globex.json'), company.token, company.name) };
    return { company, jobs: [], error: 'unsupported in stub' };
  };
}

let repos: Repos;
let close: () => Promise<void>;

beforeAll(async () => {
  const t = await createTestDb();
  close = t.close;
  repos = createRepos(t.db);
  await repos.companies.upsert({ name: 'Acme Cloud', ats: 'greenhouse', token: 'acme' });
  await repos.companies.upsert({ name: 'Globex', ats: 'lever', token: 'globex' });
});
afterAll(async () => { await close(); });

describe('ingestService', () => {
  it('fetches, dedupes, scores and persists in one pass', async () => {
    const r = await ingestService(repos).run({ fetcher: stubFetcher(), delayMs: 0, concurrency: 2 });

    expect(r.boards).toHaveLength(2);
    expect(r.fetched).toBe(6);              // 4 greenhouse + 2 lever
    expect(r.afterAgeFilter).toBe(5);       // the January "Talent Community" post ages out
    expect(r.duplicatesCollapsed).toBe(1);  // two near-identical Globex titles collapse
    expect(r.unique).toBe(4);
    expect(r.inserted).toBe(4);
    expect(r.updated).toBe(0);
    expect(r.runId).toBeTruthy();
    expect(r.tiers[1]).toBeGreaterThan(0);
  });

  it('is idempotent — a second run updates rather than duplicates', async () => {
    const r = await ingestService(repos).run({ fetcher: stubFetcher(), delayMs: 0 });
    expect(r.inserted).toBe(0);
    expect(r.updated).toBe(4);
    const { total } = await repos.jobs.list();
    expect(total).toBe(4);
  });

  it('reports a dead board as an error instead of failing the whole run', async () => {
    const r = await ingestService(repos).run({
      fetcher: stubFetcher({ globex: { error: 'HTTP 404 for board globex' } }),
      delayMs: 0,
    });
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.company).toBe('Globex');
    expect(r.boards.find((b) => b.token === 'acme')?.fetched).toBe(4);
  });

  it('honours dryRun — nothing is written and no run row is created', async () => {
    const runsBefore = (await repos.runs.list(100)).length;
    const r = await ingestService(repos).run({ fetcher: stubFetcher(), delayMs: 0, dryRun: true });
    expect(r.runId).toBeNull();
    expect(r.inserted).toBe(0);
    expect((await repos.runs.list(100)).length).toBe(runsBefore);
  });

  it('drops postings older than maxAgeDays', async () => {
    const r = await ingestService(repos).run({ fetcher: stubFetcher(), delayMs: 0, maxAgeDays: 1, dryRun: true });
    expect(r.afterAgeFilter).toBeLessThan(r.fetched);
  });

  it('records start and finish in the audit log', async () => {
    const events = await repos.events.list({ entityType: 'run' });
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(['ingest_started', 'ingest_finished']));
  });
});

describe('profileService', () => {
  it('falls back to the code default when nothing is overridden', async () => {
    const p = await profileService(repos).resolve();
    expect(p.minSalaryInrLpa).toBe(24);
  });

  it('merges overrides over the default and keeps unlisted skills', async () => {
    const svc = profileService(repos);
    await svc.setOverrides({ minSalaryInrLpa: 35, skills: { rust: 4 } });
    const p = await svc.resolve();
    expect(p.minSalaryInrLpa).toBe(35);
    expect(p.skills.rust).toBe(4);
    expect(p.skills.react).toBe(5);
  });

  it('ignores a corrupted overrides blob rather than crashing the scorer', async () => {
    await repos.settings.set('profile.overrides', { minSalaryInrLpa: 'not a number' });
    const p = await profileService(repos).resolve();
    expect(p.minSalaryInrLpa).toBe(24);
  });
});

describe('rescoreService', () => {
  it('re-scores stored jobs when the profile changes, with no network calls', async () => {
    await profileService(repos).reset();
    const baseline = await rescoreService(repos).run();
    expect(baseline.scanned).toBe(4);

    // Raise the floor well above every fixture's disclosed pay.
    await profileService(repos).setOverrides({ minSalaryInrLpa: 200, flexSalaryInrLpa: 199 });
    const after = await rescoreService(repos).run();
    expect(after.changed).toBeGreaterThan(0);

    const { items } = await repos.jobs.list({ q: 'acme' });
    const withPay = items.find((j) => j.salaryInrLpa !== null);
    expect(withPay?.disqualified).toContain('below floor');
  });

  it('leaves scores alone when nothing changed', async () => {
    const r = await rescoreService(repos).run();
    expect(r.changed).toBe(0);
    expect(r.scanned).toBe(4);
  });
});

describe('inboxService', () => {
  it('syncs messages and auto-links company matches and generates draft replies', async () => {
    const { inboxService } = await import('./inbox.js');
    const svc = inboxService(repos);

    const mockFetcher = async () => [
      {
        id: 'gmail-101',
        threadId: 'th-101',
        sender: 'talent@acme.com',
        senderName: 'Acme Talent Team',
        subject: 'Acme Cloud - Technical Screen Invitation',
        snippet: 'We would love to schedule a 45 min discussion',
        bodyText: 'Please pick a time slot via https://meet.google.com/acme-interview',
        category: 'interview_invite' as const,
        companyMentioned: 'Acme Cloud',
        interviewUrl: 'https://meet.google.com/acme-interview',
        receivedAt: new Date(),
        actionRequired: true,
        suggestedAction: 'Select interview slot',
      },
    ];

    const syncRes = await svc.sync({ fetcher: mockFetcher });
    expect(syncRes.synced).toBe(1);
    expect(syncRes.linkedToJobs).toBe(1);
    expect(syncRes.actionRequired).toBe(1);

    const msg = await repos.inbox.byMessageId('gmail-101');
    expect(msg).not.toBeNull();

    const draft = await svc.generateDraftReply(msg!.id);
    expect(draft.draftBody).toContain('Aravindhan Sivaraman');
    expect(draft.draftBody).toContain('Acme Cloud');
    expect(draft.actionCategory).toBe('interview_invite');
    // Draft replies must never carry contact details or claims that are not in PROFILE.
    expect(draft.draftBody).not.toMatch(/\+?\d[\d\s-]{8,}\d/);
    expect(draft.draftBody).not.toContain('linkedin.com/in/');
    expect(draft.draftBody).toContain('[add your availability]');
  });
});

