import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeJob, scoreJob, PROFILE, type RawJob } from '@jobhunt/core';
import { createRepos, createTestDb, type Repos } from './index.js';

const raw = (over: Partial<RawJob> = {}): RawJob => ({
  source: 'greenhouse', sourceId: '1', company: 'Acme Cloud Pvt Ltd', companySlug: 'acme',
  title: 'Senior Full Stack Engineer (React / Node.js)', url: 'https://x/1',
  locationRaw: 'Remote - India',
  descriptionText: 'React Redux TypeScript Node.js REST API design GCP Cloud Run Docker Jest. Compensation ₹28 - 38 LPA',
  postedAt: new Date(Date.now() - 2 * 36e5), ...over,
});
const scored = (over: Partial<RawJob> = {}) => scoreJob(normalizeJob(raw(over)), PROFILE);

let repos: Repos;
let close: () => Promise<void>;

beforeAll(async () => {
  const t = await createTestDb();
  close = t.close;
  repos = createRepos(t.db);
});
afterAll(async () => { await close(); });

describe('companies repo', () => {
  it('upserts idempotently on (ats, token)', async () => {
    const a = await repos.companies.upsert({ name: 'Acme', ats: 'greenhouse', token: 'acme', tags: ['india'] });
    const b = await repos.companies.upsert({ name: 'Acme Cloud', ats: 'greenhouse', token: 'acme', tags: ['india', 'product'] });
    expect(b.id).toBe(a.id);
    expect(b.name).toBe('Acme Cloud');
    expect(await repos.companies.count()).toBe(1);
  });

  it('filters by enabled and tag', async () => {
    await repos.companies.upsert({ name: 'Globex', ats: 'lever', token: 'globex', tags: ['remote-global'], enabled: false });
    expect(await repos.companies.list({ enabled: true })).toHaveLength(1);
    expect(await repos.companies.list({ tag: 'remote-global' })).toHaveLength(1);
    expect(await repos.companies.list({ ats: 'lever' })).toHaveLength(1);
  });
});

describe('jobs repo', () => {
  it('inserts new postings and reports counts', async () => {
    const stats = await repos.jobs.upsertMany([scored(), scored({ title: 'Senior Backend Engineer', sourceId: '2' })]);
    expect(stats).toEqual({ inserted: 2, updated: 0 });
  });

  it('treats a re-published posting as an update, not a duplicate', async () => {
    const stats = await repos.jobs.upsertMany([scored()]);
    expect(stats).toEqual({ inserted: 0, updated: 1 });
  });

  it('never resets the status of a job you already actioned', async () => {
    const { items } = await repos.jobs.list({}, {}, { limit: 1, offset: 0 });
    const job = items[0]!;
    await repos.jobs.setStatus(job.id, 'applied');
    await repos.jobs.upsertMany([scored()]);
    const after = await repos.jobs.byId(job.id);
    expect(after?.status).toBe('applied');
  });

  it('accumulates every source a role was seen on', async () => {
    await repos.jobs.upsertMany([scored({ source: 'linkedin', sourceId: 'li-1' })]);
    const row = await repos.jobs.byDedupHash(scored().dedupHash);
    expect(row?.seenOn).toEqual(expect.arrayContaining(['greenhouse', 'linkedin']));
  });

  it('filters, sorts and paginates', async () => {
    const page = await repos.jobs.list({ minScore: 1 }, { by: 'score', dir: 'desc' }, { limit: 1, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBeGreaterThanOrEqual(2);
    expect(page.limit).toBe(1);
  });

  it('searches title and company case-insensitively', async () => {
    const r = await repos.jobs.list({ q: 'ACME' });
    expect(r.total).toBeGreaterThan(0);
    const none = await repos.jobs.list({ q: 'zzzz-no-match' });
    expect(none.total).toBe(0);
  });

  it('reports tier, status and source breakdowns', async () => {
    expect(Object.values(await repos.jobs.statsByTier()).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(await repos.jobs.statsByStatus()).toHaveProperty('applied');
    expect(await repos.jobs.statsBySource()).toHaveProperty('greenhouse');
  });
});

describe('runs repo', () => {
  it('records a lifecycle', async () => {
    const run = await repos.runs.start('ingest');
    expect(run.status).toBe('running');
    const done = await repos.runs.finish(run.id, 'succeeded', { fetched: 10 });
    expect(done?.status).toBe('succeeded');
    expect(done?.finishedAt).toBeInstanceOf(Date);
    expect((await repos.runs.latest('ingest'))?.id).toBe(run.id);
  });
});

describe('events repo', () => {
  it('records and filters audit entries', async () => {
    await repos.events.record({ entityType: 'job', entityId: 'j1', action: 'status_changed', actor: 'user', payload: { to: 'applied' } });
    await repos.events.record({ entityType: 'run', entityId: 'r1', action: 'ingest_started' });
    expect(await repos.events.list({ entityType: 'job' })).toHaveLength(1);
    expect(await repos.events.list()).toHaveLength(2);
  });
});

describe('settings repo', () => {
  it('round-trips arbitrary json', async () => {
    await repos.settings.set('profile.overrides', { minSalaryInrLpa: 30 });
    expect(await repos.settings.get('profile.overrides')).toEqual({ minSalaryInrLpa: 30 });
    await repos.settings.set('profile.overrides', { minSalaryInrLpa: 26 });
    expect(await repos.settings.get('profile.overrides')).toEqual({ minSalaryInrLpa: 26 });
    expect(await repos.settings.get('nope')).toBeUndefined();
  });
});

describe('inbox repo', () => {
  it('upserts and lists classified email messages', async () => {
    const res = await repos.inbox.upsertMany([
      {
        id: 'msg-1',
        threadId: 'th-1',
        sender: 'recruiter@stripe.com',
        senderName: 'Stripe Recruiting',
        subject: 'Invitation to Technical Screen - Senior Platform Engineer',
        snippet: 'We would like to invite you for a 45 min technical chat.',
        bodyText: 'Please select a slot via https://meet.google.com/xyz',
        category: 'interview_invite',
        companyMentioned: 'Stripe',
        interviewUrl: 'https://meet.google.com/xyz',
        receivedAt: new Date(),
        actionRequired: true,
        suggestedAction: 'Select time slot',
      },
    ]);
    expect(res.inserted).toBe(1);

    const list = await repos.inbox.list({ category: 'interview_invite' });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.subject).toContain('Invitation to Technical Screen');

    const stats = await repos.inbox.getStats();
    expect(stats.total).toBe(1);
    expect(stats.actionRequiredCount).toBe(1);
  });
});

