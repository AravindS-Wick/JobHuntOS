import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeJob, scoreJob, PROFILE } from '@jobhunt/core';
import { createRepos, createTestDb, type Repos } from '@jobhunt/db';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const API_KEY = 'test-key-0123456789abcdef';
const auth = { 'x-api-key': API_KEY };
let app: FastifyInstance;
let repos: Repos;
let close: () => Promise<void>;

beforeAll(async () => {
  process.env.JOBHUNT_DATA_DIR = mkdtempSync(join(tmpdir(), 'jobhunt-api-'));
  const t = await createTestDb();
  close = t.close;
  repos = createRepos(t.db);
  app = await buildApp({ config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', API_KEY } as NodeJS.ProcessEnv), repos });
  await app.ready();
  await repos.jobs.upsertMany([scoreJob(normalizeJob({
    source: 'lever', sourceId: 'L1', company: 'Globex', companySlug: 'globex', title: 'Senior Frontend Engineer',
    url: 'https://jobs.lever.co/globex/L1', locationRaw: 'Remote - India', postedAt: new Date(),
    descriptionText: 'React TypeScript Next.js GitHub Actions. GraphQL a plus. ₹30 - 40 LPA',
  }), PROFILE)]);
});
afterAll(async () => { await app.close(); await close(); });

describe('apply API', () => {
  let resumeId = '';
  let applicationId = '';

  it('refuses to prepare before a resume exists', async () => {
    const r = await app.inject({ method: 'POST', url: '/applications/prepare', headers: auth, payload: { auto: {} } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.message).toMatch(/Upload your resume/);
  });

  it('uploads and parses a resume', async () => {
    const data = readFileSync(resolve(process.cwd(), 'fixtures/resume.sample.txt')).toString('base64');
    const r = await app.inject({ method: 'POST', url: '/resumes', headers: auth, payload: { fileName: 'resume.txt', dataBase64: data } });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    resumeId = body.id;
    expect(body).toMatchObject({ isMaster: true, readiness: { ready: true, missing: [] } });
    expect(body.doc.experience).toHaveLength(2);
  });

  it('rejects unsupported formats', async () => {
    const r = await app.inject({ method: 'POST', url: '/resumes', headers: auth, payload: { fileName: 'resume.exe', dataBase64: 'AA==' } });
    expect(r.statusCode).toBe(400);
  });

  it('accepts a corrected resume structure', async () => {
    const master = (await app.inject({ method: 'GET', url: '/resumes/master', headers: auth })).json();
    master.doc.summary = 'Corrected summary.';
    const r = await app.inject({ method: 'PUT', url: `/resumes/${resumeId}/doc`, headers: auth, payload: master.doc });
    expect(r.statusCode).toBe(200);
    expect(r.json().doc.summary).toBe('Corrected summary.');
  });

  it('prepares an application with a real tailored PDF', async () => {
    const r = await app.inject({ method: 'POST', url: '/applications/prepare', headers: auth, payload: { auto: { tiers: [1, 2, 3] } } });
    expect(r.statusCode).toBe(200);
    expect(r.json().prepared).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/applications?status=prepared', headers: auth })).json();
    expect(list.total).toBe(1);
    const item = list.items[0];
    applicationId = item.application.id;
    expect(item.job.gaps).toContain('graphql');
    expect(item.variant.validation.ok).toBe(true);
    expect(item.variant.changes.gaps).toContain('graphql');

    const pdf = await app.inject({ method: 'GET', url: `/applications/${applicationId}/resume.pdf`, headers: auth });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  }, 60_000);

  it('approves, and the worker claims and reports', async () => {
    const r = await app.inject({ method: 'POST', url: '/applications/approve', headers: auth, payload: { ids: [applicationId] } });
    expect(r.json().approved).toBe(1);

    const [task] = await repos.agentTasks.list({ status: ['queued'] });
    await repos.agentTasks.requeue(task!.id, new Date(0));
    const claim = (await app.inject({ method: 'POST', url: '/agent/claim', headers: auth, payload: { workerId: 'test', kinds: ['apply'] } })).json();
    expect(claim.task.kind).toBe('apply');
    const id = claim.task.bundle.task.id;

    const gate = await app.inject({ method: 'POST', url: `/agent/tasks/${id}/report`, headers: auth, payload: { status: 'needs_human', reason: 'CAPTCHA' } });
    expect(gate.statusCode).toBe(200);
    const human = (await app.inject({ method: 'GET', url: '/agent/tasks?status=needs_human', headers: auth })).json();
    expect(human.items[0].humanPrompt.reason).toBe('CAPTCHA');

    expect((await app.inject({ method: 'POST', url: `/agent/tasks/${id}/resume`, headers: auth, payload: {} })).statusCode).toBe(200);
    await repos.agentTasks.requeue(id, new Date(0));
    await app.inject({ method: 'POST', url: '/agent/claim', headers: auth, payload: { workerId: 'test', kinds: ['apply'] } });
    const done = await app.inject({ method: 'POST', url: `/agent/tasks/${id}/report`, headers: auth, payload: { status: 'submitted', confirmation: 'Application received' } });
    expect(done.statusCode).toBe(200);

    const usage = (await app.inject({ method: 'GET', url: '/applications/usage', headers: auth })).json();
    expect(usage.ats).toEqual({ used: 1, cap: 15 });
  });

  it('validates worker reports', async () => {
    const r = await app.inject({ method: 'POST', url: '/agent/tasks/x/report', headers: auth, payload: { status: 'teleported' } });
    expect(r.statusCode).toBe(400);
  });

  it('lists the board catalog with how each is reached', async () => {
    const r = (await app.inject({ method: 'GET', url: '/boards', headers: auth })).json();
    const naukri = r.items.find((b: { id: string }) => b.id === 'naukri');
    expect(naukri).toMatchObject({ mode: 'browser' });
    expect(r.items.length).toBe(14);
  });

  it('rejects an unknown board in the search config', async () => {
    const r = await app.inject({ method: 'PUT', url: '/boards/config', headers: auth, payload: { keywords: ['react'], locations: [], boards: ['myspace'], limitPerQuery: 10 } });
    expect(r.statusCode).toBe(400);
  });
});
