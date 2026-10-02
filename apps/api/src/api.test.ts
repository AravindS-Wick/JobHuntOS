import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeJob, scoreJob, PROFILE, type RawJob } from '@jobhunt/core';
import { createRepos, createTestDb, type Repos } from '@jobhunt/db';
import { buildApp } from './app.js';
import { loadConfig, type Config } from './config.js';

const API_KEY = 'test-key-0123456789abcdef';

const raw = (over: Partial<RawJob> = {}): RawJob => ({
  source: 'greenhouse', sourceId: '1', company: 'Acme Cloud', companySlug: 'acme',
  title: 'Senior Full Stack Engineer (React / Node.js)', url: 'https://x/1',
  locationRaw: 'Remote - India',
  descriptionText: 'React Redux TypeScript Node.js REST API design GCP Cloud Run Docker Jest. Bonus Kubernetes. ₹28 - 38 LPA',
  postedAt: new Date(Date.now() - 2 * 36e5), ...over,
});

let app: FastifyInstance;
let repos: Repos;
let close: () => Promise<void>;
const auth = { 'x-api-key': API_KEY };

beforeAll(async () => {
  const t = await createTestDb();
  close = t.close;
  repos = createRepos(t.db);
  const config: Config = loadConfig({
    NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', API_KEY,
  } as NodeJS.ProcessEnv);
  app = await buildApp({ config, repos });
  await app.ready();

  await repos.companies.upsert({ name: 'Acme Cloud', ats: 'greenhouse', token: 'acme', tags: ['india'] });
  await repos.companies.upsert({ name: 'Globex', ats: 'lever', token: 'globex', tags: ['remote-global'], enabled: false });
  await repos.jobs.upsertMany([
    scoreJob(normalizeJob(raw()), PROFILE),
    scoreJob(normalizeJob(raw({ sourceId: '2', title: 'Junior Frontend Developer' })), PROFILE),
    scoreJob(normalizeJob(raw({ sourceId: '3', title: 'Senior React Developer', company: 'Globex', companySlug: 'globex', source: 'lever' })), PROFILE),
  ]);
});

afterAll(async () => { await app.close(); await close(); });

describe('auth', () => {
  it('rejects a request with no API key', async () => {
    const res = await app.inject({ method: 'GET', url: '/jobs' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
  });
  it('rejects a wrong key', async () => {
    const res = await app.inject({ method: 'GET', url: '/jobs', headers: { 'x-api-key': 'nope' } });
    expect(res.statusCode).toBe(401);
  });
  it('leaves health and docs open for probes', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(200);
  });
});

describe('health', () => {
  it('reports liveness', async () => {
    const body = (await app.inject({ method: 'GET', url: '/health' })).json();
    expect(body.status).toBe('ok');
    expect(body.checks.process).toBe(true);
  });
  it('reports readiness including the database', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json().checks.database).toBe(true);
  });
});

describe('companies', () => {
  it('lists and filters', async () => {
    expect((await app.inject({ method: 'GET', url: '/companies', headers: auth })).json()).toHaveLength(2);
    expect((await app.inject({ method: 'GET', url: '/companies?enabled=true', headers: auth })).json()).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: '/companies?tag=india', headers: auth })).json()).toHaveLength(1);
  });

  it('creates idempotently on ats + token', async () => {
    const first = await app.inject({ method: 'POST', url: '/companies', headers: auth, payload: { name: 'Initech', ats: 'ashby', token: 'initech' } });
    expect(first.statusCode).toBe(201);
    const again = await app.inject({ method: 'POST', url: '/companies', headers: auth, payload: { name: 'Initech Inc', ats: 'ashby', token: 'initech' } });
    expect(again.json().id).toBe(first.json().id);
    expect(again.json().name).toBe('Initech Inc');
  });

  it('rejects an unknown ats with a validation error', async () => {
    const res = await app.inject({ method: 'POST', url: '/companies', headers: auth, payload: { name: 'X', ats: 'taleo', token: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_failed');
    expect(res.json().error.details).toBeInstanceOf(Array);
  });

  it('patches and deletes', async () => {
    const created = (await app.inject({ method: 'POST', url: '/companies', headers: auth, payload: { name: 'Temp', ats: 'lever', token: 'temp' } })).json();
    const patched = await app.inject({ method: 'PATCH', url: `/companies/${created.id}`, headers: auth, payload: { signal: 4 } });
    expect(patched.json().signal).toBe(4);
    expect((await app.inject({ method: 'DELETE', url: `/companies/${created.id}`, headers: auth })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/companies/${created.id}`, headers: auth })).statusCode).toBe(404);
  });

  it('returns a structured 404 with a request id', async () => {
    const res = await app.inject({ method: 'GET', url: '/companies/00000000-0000-0000-0000-000000000000', headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({ code: 'not_found' });
    expect(res.json().error.requestId).toBeTruthy();
  });

  it('detects an ATS from a careers URL and hands back a ready-to-post suggestion', async () => {
    const res = await app.inject({ method: 'POST', url: '/companies/detect', headers: auth, payload: { url: 'https://jobs.ashbyhq.com/openai/8fb1615c' } });
    expect(res.json()).toMatchObject({ ats: 'ashby', token: 'openai' });
    expect(res.json().suggestion).toMatchObject({ ats: 'ashby', token: 'openai' });
  });

  it('reports unknown for a plain careers page', async () => {
    const res = await app.inject({ method: 'POST', url: '/companies/detect', headers: auth, payload: { url: 'https://example.com/careers' } });
    expect(res.json().ats).toBe('unknown');
    expect(res.json().suggestion).toBeUndefined();
  });
});

describe('jobs', () => {
  it('lists with pagination envelope', async () => {
    const body = (await app.inject({ method: 'GET', url: '/jobs?limit=2', headers: auth })).json();
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(3);
    expect(body).toMatchObject({ limit: 2, offset: 0 });
  });

  it('filters by tier as a comma list', async () => {
    const body = (await app.inject({ method: 'GET', url: '/jobs?tier=1', headers: auth })).json();
    expect(body.items.every((j: { tier: number }) => j.tier === 1)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
  });

  it('excludes disqualified jobs when asked', async () => {
    const all = (await app.inject({ method: 'GET', url: '/jobs', headers: auth })).json();
    const clean = (await app.inject({ method: 'GET', url: '/jobs?excludeDisqualified=true', headers: auth })).json();
    expect(clean.total).toBeLessThan(all.total);
    expect(clean.items.every((j: { disqualified: string | null }) => j.disqualified === null)).toBe(true);
  });

  it('always exposes gaps on every job card', async () => {
    const body = (await app.inject({ method: 'GET', url: '/jobs?tier=1', headers: auth })).json();
    expect(body.items[0].gaps).toEqual(expect.arrayContaining(['kubernetes']));
  });

  it('omits the description from list items but includes it on the detail route', async () => {
    const list = (await app.inject({ method: 'GET', url: '/jobs?limit=1', headers: auth })).json();
    expect(list.items[0].descriptionText).toBeUndefined();
    const one = (await app.inject({ method: 'GET', url: `/jobs/${list.items[0].id}`, headers: auth })).json();
    expect(one.descriptionText).toContain('React');
  });

  it('searches by company', async () => {
    const body = (await app.inject({ method: 'GET', url: '/jobs?q=globex', headers: auth })).json();
    expect(body.total).toBe(1);
  });

  it('rejects an out-of-range limit', async () => {
    const res = await app.inject({ method: 'GET', url: '/jobs?limit=9999', headers: auth });
    expect(res.statusCode).toBe(400);
  });

  it('moves a job through the pipeline and records an audit event', async () => {
    const list = (await app.inject({ method: 'GET', url: '/jobs?limit=1', headers: auth })).json();
    const id = list.items[0].id;
    const res = await app.inject({ method: 'PATCH', url: `/jobs/${id}/status`, headers: auth, payload: { status: 'applied' } });
    expect(res.json().status).toBe('applied');

    const events = (await app.inject({ method: 'GET', url: `/events?entityType=job&entityId=${id}`, headers: auth })).json();
    expect(events[0]).toMatchObject({ action: 'status_changed', actor: 'user' });
    expect(events[0].payload).toMatchObject({ to: 'applied' });
  });

  it('rejects an unknown status', async () => {
    const list = (await app.inject({ method: 'GET', url: '/jobs?limit=1', headers: auth })).json();
    const res = await app.inject({ method: 'PATCH', url: `/jobs/${list.items[0].id}/status`, headers: auth, payload: { status: 'ghosted' } });
    expect(res.statusCode).toBe(400);
  });

  it('bulk-updates status', async () => {
    const list = (await app.inject({ method: 'GET', url: '/jobs?limit=2', headers: auth })).json();
    const ids = list.items.map((j: { id: string }) => j.id);
    const res = await app.inject({ method: 'POST', url: '/jobs/status', headers: auth, payload: { ids, status: 'skipped' } });
    expect(res.json().updated).toBe(2);
  });
});

describe('profile', () => {
  it('returns the effective profile merged from code defaults', async () => {
    const body = (await app.inject({ method: 'GET', url: '/profile', headers: auth })).json();
    expect(body.effective.minSalaryInrLpa).toBe(PROFILE.minSalaryInrLpa);
    expect(body.effective.gaps).toEqual(expect.arrayContaining(['kubernetes']));
    expect(body.overrides).toEqual({});
  });

  it('merges skill overrides rather than replacing the whole map', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/profile/overrides', headers: auth,
      payload: { minSalaryInrLpa: 30, skills: { rust: 3 } },
    });
    expect(res.json().effective.minSalaryInrLpa).toBe(30);
    expect(res.json().effective.skills.rust).toBe(3);
    expect(res.json().effective.skills.react).toBe(PROFILE.skills.react);
  });

  it('rejects an unknown override field', async () => {
    const res = await app.inject({ method: 'PUT', url: '/profile/overrides', headers: auth, payload: { nonsense: true } });
    expect(res.statusCode).toBe(400);
  });

  it('rescores stored jobs against the new profile', async () => {
    const res = await app.inject({ method: 'POST', url: '/profile/rescore', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().scanned).toBe(3);
  });

  it('resets back to the code default', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/profile/overrides', headers: auth });
    expect(res.json().overrides).toEqual({});
    expect(res.json().effective.minSalaryInrLpa).toBe(PROFILE.minSalaryInrLpa);
  });
});

describe('runs', () => {
  it('runs a dry ingest without writing', async () => {
    // Disable every board so the route needs no network. The pipeline itself is
    // covered end-to-end with a stubbed fetcher in packages/services.
    for (const c of await repos.companies.list({ enabled: true })) {
      await repos.companies.update(c.id, { enabled: false });
    }
    const before = (await app.inject({ method: 'GET', url: '/jobs', headers: auth })).json().total;
    const res = await app.inject({
      method: 'POST', url: '/runs/ingest', headers: auth,
      payload: { dryRun: true, concurrency: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ runId: null, fetched: 0, inserted: 0 });
    expect((await app.inject({ method: 'GET', url: '/jobs', headers: auth })).json().total).toBe(before);
  });

  it('lists runs', async () => {
    const res = await app.inject({ method: 'GET', url: '/runs', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});

describe('stats', () => {
  it('returns the dashboard counters in one call', async () => {
    const body = (await app.inject({ method: 'GET', url: '/stats', headers: auth })).json();
    expect(body.companies.total).toBeGreaterThanOrEqual(2);
    expect(body.jobs.total).toBe(3);
    expect(body.jobs.bySource).toHaveProperty('greenhouse');
    expect(body.jobs.byStatus).toBeTruthy();
  });
});

describe('errors', () => {
  it('returns a structured 404 for an unknown route', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope', headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });
});

describe('openapi', () => {
  it('publishes a spec covering every route group', async () => {
    const spec = (await app.inject({ method: 'GET', url: '/docs/json' })).json();
    const paths = Object.keys(spec.paths);
    for (const p of ['/jobs', '/companies', '/runs/ingest', '/profile', '/stats', '/events', '/health', '/inbox/messages', '/connectors/test']) {
      expect(paths).toContain(p);
    }
    expect(spec.components.securitySchemes.apiKey.name).toBe('x-api-key');
  });
});

describe('inbox & connectors endpoints', () => {
  it('lists inbox messages with pagination', async () => {
    const res = await app.inject({ method: 'GET', url: '/inbox/messages', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('items');
    expect(res.json()).toHaveProperty('total');
  });

  it('tests platform connector health', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/connectors/test',
      headers: auth,
      payload: { platform: 'linkedin' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().platform).toBe('linkedin');
  });
});


describe('config safety', () => {
  it('refuses to bind a non-loopback host without an API key', () => {
    expect(() => loadConfig({ API_HOST: '0.0.0.0' })).toThrow(/API_KEY/);
  });
  it('refuses production without an API key', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/API_KEY/);
  });
  it('allows loopback without a key in development', () => {
    expect(() => loadConfig({})).not.toThrow();
  });
  it('allows a non-loopback host when a key is set', () => {
    expect(() => loadConfig({ API_HOST: '0.0.0.0', API_KEY: API_KEY })).not.toThrow();
  });
});

describe('POST /jobs/ingest-batch', () => {
  const post = (payload: unknown) =>
    app.inject({ method: 'POST', url: '/jobs/ingest-batch', headers: { 'x-api-key': API_KEY }, payload: payload as object });

  it('rejects an unknown source and a non-URL url', async () => {
    expect((await post({ source: 'bogus', jobs: [] })).statusCode).toBe(400);
    const bad = await post({ source: 'linkedin', jobs: [{ sourceId: 'x', company: 'C', title: 'T', url: 'not-a-url' }] });
    expect(bad.statusCode).toBe(400);
  });

  it('does not invent a location or a posted date when the scraper has none', async () => {
    const res = await post({
      source: 'linkedin',
      jobs: [{ sourceId: 'nofacts-1', company: 'Mystery Co', title: 'Senior React Engineer', url: 'https://example.com/j/1' }],
    });
    expect(res.statusCode).toBe(200);
    const list = await app.inject({ method: 'GET', url: '/jobs?limit=100', headers: { 'x-api-key': API_KEY } });
    const job = (list.json().items as { sourceId: string; locationRaw: string | null; postedAt: string | null }[])
      .find((j) => j.sourceId === 'nofacts-1');
    expect(job).toBeDefined();
    expect(job!.locationRaw ?? '').not.toContain('Remote - India');
    expect(job!.postedAt).toBeNull();
  });
});

describe('facts and screening question resolver API', () => {
  it('GET /facts lists verified facts', async () => {
    const res = await app.inject({ method: 'GET', url: '/facts', headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThanOrEqual(25);
    expect(body.items.some((f: { key: string }) => f.key === 'full_name')).toBe(true);
  });

  it('POST /facts updates or creates a verified fact', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/facts',
      headers: auth,
      payload: {
        key: 'preferred_editor',
        category: 'preferences',
        label: 'Preferred Code Editor',
        value: 'VS Code & Cursor',
        verifiedAt: new Date().toISOString(),
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().key).toBe('preferred_editor');

    const verify = await app.inject({ method: 'GET', url: '/facts?category=preferences', headers: auth });
    expect(verify.json().items.some((f: { key: string }) => f.key === 'preferred_editor')).toBe(true);
  });

  it('POST /facts/resolve evaluates screening questions with truth constraint', async () => {
    // 1. Notice period
    const noticeRes = await app.inject({
      method: 'POST',
      url: '/facts/resolve',
      headers: auth,
      payload: { question: 'What is your current notice period in days?' },
    });
    expect(noticeRes.statusCode).toBe(200);
    expect(noticeRes.json().outcome).toBe('answer');
    expect(noticeRes.json().answer).toBe(60);

    // 2. Truth constraint on gap
    const gapRes = await app.inject({
      method: 'POST',
      url: '/facts/resolve',
      headers: auth,
      payload: {
        question: 'Do you have production experience with AWS?',
        options: ['Yes', 'No'],
      },
    });
    expect(gapRes.statusCode).toBe(200);
    expect(gapRes.json().outcome).toBe('answer');
    expect(gapRes.json().formattedAnswer).toBe('No');
    expect(gapRes.json().reason).toContain('Truth constraint');

    // 3. Mandatory gap requirement aborts
    const abortRes = await app.inject({
      method: 'POST',
      url: '/facts/resolve',
      headers: auth,
      payload: {
        question: 'This role has a mandatory requirement: Do you have at least 3 years Kubernetes experience?',
      },
    });
    expect(abortRes.statusCode).toBe(200);
    expect(abortRes.json().outcome).toBe('abort');
  });

  it('GET /outreach/templates returns available archetypes', async () => {
    const res = await app.inject({ method: 'GET', url: '/outreach/templates', headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.templates).toBeDefined();
    expect(body.templates.direct_hiring_manager).toBeDefined();
    expect(body.templates.internal_referral).toBeDefined();
    expect(body.templates.recruiter_pitch).toBeDefined();
  });

  it('POST /outreach/generate creates customized outreach with tags and web compose url', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/outreach/generate',
      headers: auth,
      payload: {
        recipientName: 'David Miller',
        recipientEmail: 'david@enterprise.io',
        company: 'Enterprise AI Corp',
        role: 'Staff Full-Stack Engineer',
        archetype: 'internal_referral',
        customNote: 'Loved your keynote on async agent workflows.',
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.subject).toContain('Enterprise AI Corp');
    expect(data.bodyText).toContain('Hi David,');
    expect(data.bodyText).toContain('Enterprise AI Corp');
    expect(data.bodyText).toContain('internal referral');
    expect(data.webComposeUrl).toContain('mail.google.com');
    expect(data.wordCount).toBeGreaterThan(20);
    expect(data.tags.candidate_name).toBeDefined();
    expect(data.tags.company).toBe('Enterprise AI Corp');
  });

  it('POST /outreach/send records audit event and handles missing credentials safely', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/outreach/send',
      headers: auth,
      payload: {
        to: 'recruiter@techventures.co',
        subject: 'Application: Senior Engineer',
        bodyText: 'Hello recruiter, please find my resume attached.',
        mode: 'smtp',
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('credentials missing');

    // Audit event must be recorded
    const eventRes = await app.inject({ method: 'GET', url: '/events?entityType=outreach', headers: auth });
    expect(eventRes.statusCode).toBe(200);
    const events = eventRes.json();
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].entityId).toBe('recruiter@techventures.co');
  });
});
