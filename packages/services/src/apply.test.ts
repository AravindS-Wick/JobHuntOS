import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseGreenhouse, parseGreenhouseQuestions } from '@jobhunt/connectors';
import type { RawJob } from '@jobhunt/core';
import { createRepos, createTestDb, type Repos } from '@jobhunt/db';
import { ingestService } from './ingest.js';
import { resumeService } from './resumes.js';
import { applicationService, applyPlatform } from './applications.js';
import { agentService } from './agent.js';
import { boardService } from './boards.js';

const fixture = (n: string) => readFileSync(resolve(process.cwd(), 'fixtures', n));
const ghForm = parseGreenhouseQuestions(JSON.parse(fixture('greenhouse.questions.json').toString()));

/** Rendering needs Chrome; the pipeline logic doesn't. documents.test.ts covers real rendering. */
const render = { pdf: async () => Buffer.from('%PDF-stub'), docx: async () => Buffer.from('PK-stub') };

let repos: Repos;
let close: () => Promise<void>;

beforeAll(async () => {
  process.env.JOBHUNT_DATA_DIR = mkdtempSync(join(tmpdir(), 'jobhunt-'));
  const t = await createTestDb();
  close = t.close;
  repos = createRepos(t.db);
  const acme = await repos.companies.upsert({ name: 'Acme Cloud', ats: 'greenhouse', token: 'acme' });
  const jobs = parseGreenhouse(JSON.parse(fixture('greenhouse.acme.json').toString()), 'acme', 'Acme Cloud');
  await ingestService(repos).run({ fetcher: async (company) => ({ company, jobs }), delayMs: 0 });
  void acme;
});
afterAll(async () => { await close(); });

describe('resumeService', () => {
  it('imports a resume, parses it and makes it the master', async () => {
    const row = await resumeService(repos).import({ fileName: 'resume.txt', data: fixture('resume.sample.txt') });
    expect(row.isMaster).toBe(true);
    const master = await resumeService(repos).master();
    expect(master?.doc.name).toBe('Sample Candidate');
  });
});

describe('applyPlatform', () => {
  it('routes a board listing to the ATS it links to', () => {
    expect(applyPlatform({ source: 'linkedin', url: 'https://linkedin.com/jobs/view/1', applyUrl: 'https://boards.greenhouse.io/acme/jobs/9' }))
      .toEqual({ platform: 'greenhouse', applyUrl: 'https://boards.greenhouse.io/acme/jobs/9' });
    expect(applyPlatform({ source: 'naukri', url: 'https://www.naukri.com/job-listings-1', applyUrl: null }).platform).toBe('naukri');
  });
});

describe('application pipeline', () => {
  let appIds: string[] = [];

  it('prepares tailored, truth-checked applications for the best jobs', async () => {
    const svc = applicationService(repos);
    const s = await svc.prepare({ auto: { tiers: [1, 2, 3], limit: 10 }, render, fetchQuestions: async () => ghForm });
    expect(s.prepared).toBeGreaterThan(0);
    expect(s.blocked).toBe(0);
    const list = await svc.list({ status: ['prepared'] });
    appIds = list.items.map((i) => i.application.id);
    const first = list.items[0]!;
    expect(first.variant?.validation).toEqual({ ok: true, issues: [] });
    expect(existsSync(join(process.env.JOBHUNT_DATA_DIR!, first.variant!.pdfPath!))).toBe(true);
    expect(first.variant!.pdfPath).toMatch(/Sample_Candidate_Acme_Cloud\.pdf$/);
    // Form answers resolved up front; the consent question waits for the human.
    const answers = first.application.answers as { question: string; outcome: string }[];
    expect(answers.find((a) => a.question === 'First Name')?.outcome).toBe('answer');
    expect(answers.some((a) => a.outcome === 'ask')).toBe(true);
  });

  it('re-preparing is idempotent and never touches submitted applications', async () => {
    const before = (await repos.applications.list()).total;
    await applicationService(repos).prepare({ auto: { tiers: [1, 2, 3], limit: 10 }, render, fetchQuestions: async () => ghForm });
    expect((await repos.applications.list()).total).toBe(before);
  });

  it('batch approval schedules through the governor and submits nothing', async () => {
    const r = await applicationService(repos).approve(appIds, new Date('2026-10-05T10:00:00+05:30'));
    expect(r.approved).toBe(appIds.length);
    const times = r.scheduled.map((s) => new Date(s.runAfter).getTime()).sort();
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(45_000);
    const queued = await repos.applications.list({ status: ['queued'] });
    expect(queued.total).toBe(appIds.length);
    expect((await repos.applications.list({ status: ['submitted'] })).total).toBe(0);
  });

  it('the worker claims a bundle with everything it needs', async () => {
    // Make the first task runnable now.
    const [task] = await repos.agentTasks.list({ status: ['queued'], kind: ['apply'] });
    await repos.agentTasks.requeue(task!.id, new Date(0));
    const claimed = await agentService(repos).claim('test-worker', ['apply']);
    expect(claimed?.kind).toBe('apply');
    if (claimed?.kind !== 'apply') return;
    expect(claimed.bundle.resume.pdfPath).toMatch(/\.pdf$/);
    expect(claimed.bundle.resume.doc.name).toBe('Sample Candidate');
    expect(claimed.bundle.facts.notice_period_days).toBeDefined();
    expect((await repos.applications.byId(claimed.bundle.application.id))?.status).toBe('submitting');

    // Human gate: unknown question → user answers → saved as fact → re-queued.
    const agent = agentService(repos);
    await agent.report(claimed.bundle.task.id, { status: 'needs_human', reason: 'Unrecognised question', question: 'Years of experience with Vue?' });
    expect((await repos.applications.byId(claimed.bundle.application.id))?.status).toBe('needs_human');
    await agent.resume(claimed.bundle.task.id, { question: 'Years of experience with Vue?', answer: '0', saveAsFact: { key: 'vue_experience_years' } });
    expect(String((await repos.facts.getByKey('vue_experience_years'))?.value)).toBe('0');

    await repos.agentTasks.requeue(claimed.bundle.task.id, new Date(0));
    const again = await agent.claim('test-worker', ['apply']);
    expect(again?.bundle.task.id).toBe(claimed.bundle.task.id);
    if (again?.kind !== 'apply') return;
    expect(again.bundle.application.answers.find((a) => a.question === 'Years of experience with Vue?')?.formattedAnswer).toBe('0');

    await agent.report(again.bundle.task.id, { status: 'submitted', fields: { first_name: 'Sample' }, confirmation: 'Thank you for applying' });
    const app = await repos.applications.byId(again.bundle.application.id);
    expect(app?.status).toBe('submitted');
    expect((await repos.jobs.byId(app!.jobId))?.status).toBe('applied');
    const events = await repos.events.list({ entityType: 'application', entityId: app!.id });
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(['prepared', 'approved', 'human_gate', 'submitted']));
  });

  /** A fresh approved application with its apply task runnable right now. */
  async function queuedTask(n: string) {
    await ingestService(repos).ingestBatch([{ source: 'lever', sourceId: n, company: `Retry ${n}`, companySlug: `retry-${n}`, title: 'Frontend Engineer', url: `https://jobs.lever.co/retry-${n}/1`, locationRaw: 'Remote - India', descriptionText: 'React TypeScript' }]);
    const job = (await repos.jobs.list({ q: `Retry ${n}` }, {}, { limit: 1, offset: 0 })).items[0]!;
    const svc = applicationService(repos);
    await svc.prepare({ jobIds: [job.id], render, fetchQuestions: async () => undefined });
    await svc.approve([(await repos.applications.byJob(job.id))!.id]);
    const [task] = (await repos.agentTasks.list({ status: ['queued'], kind: ['apply'] })).filter((t) => t.platform === 'lever');
    await repos.agentTasks.requeue(task!.id, new Date(0));
    return task!;
  }

  it('retries a failed attempt with backoff, then gives up', async () => {
    const task = await queuedTask('a');
    const agent = agentService(repos);
    for (let i = 0; i < 3; i++) {
      await repos.agentTasks.requeue(task.id, new Date(0));
      const c = await agent.claim('w', ['apply']);
      expect(c?.bundle.task.id).toBe(task.id);
      const r = await agent.report(task.id, { status: 'failed', error: 'selector not found' });
      expect(r?.retry).toBe(i < 2);
    }
    expect((await repos.agentTasks.byId(task.id))?.status).toBe('failed');
    expect((await repos.applications.byId(task.applicationId!))?.status).toBe('failed');
  });

  it('skipped applications are never submitted even if a task was queued', async () => {
    const task = await queuedTask('b');
    await repos.applications.update(task.applicationId!, { status: 'skipped' });
    await repos.agentTasks.requeue(task.id, new Date(0));
    expect(await agentService(repos).claim('w', ['apply'])).toBeUndefined();
    expect((await repos.agentTasks.byId(task.id))?.status).toBe('cancelled');
  });
});

describe('daily ceilings', () => {
  it('pushes the 13th LinkedIn application of the day to the next weekday', async () => {
    const svc = applicationService(repos);
    const job = (await repos.jobs.list({}, {}, { limit: 1, offset: 0 })).items[0]!;
    const ids: string[] = [];
    for (let i = 0; i < 13; i++) {
      const raw: RawJob = { ...{ source: 'linkedin', sourceId: `li-${i}`, company: `Co ${i}`, companySlug: `co-${i}`, title: 'Frontend Engineer', url: `https://www.linkedin.com/jobs/view/${1000 + i}`, locationRaw: 'Chennai', descriptionText: 'React TypeScript' } };
      await ingestService(repos).ingestBatch([raw]);
    }
    const li = (await repos.jobs.list({ source: ['linkedin'] }, {}, { limit: 50, offset: 0 })).items;
    await svc.prepare({ jobIds: li.map((j) => j.id), render, fetchQuestions: async () => undefined });
    for (const j of li) {
      const a = await repos.applications.byJob(j.id);
      if (a?.status === 'prepared') ids.push(a.id);
    }
    expect(ids.length).toBe(13);
    const monday10 = new Date('2026-10-05T10:00:00+05:30');
    const r = await svc.approve(ids, monday10);
    const days = r.scheduled.map((s) => new Date(new Date(s.runAfter).getTime() + 5.5 * 36e5).toISOString().slice(0, 10));
    expect(days.filter((d) => d === '2026-10-05')).toHaveLength(12);
    expect(days.filter((d) => d === '2026-10-06')).toHaveLength(1);
    void job;
  });
});

describe('boardService', () => {
  it('fetches direct boards and queues blocked ones for the browser worker', async () => {
    const svc = boardService(repos);
    await svc.setConfig({ keywords: ['react developer'], locations: ['Chennai'], boards: ['instahyre', 'naukri', 'glassdoor'], limitPerQuery: 10 });
    const r = await svc.run({
      search: async (board) => [{ source: board, sourceId: `${board}-1`, company: 'Zeta', companySlug: 'zeta', title: 'Senior React Developer', url: `https://example.com/${board}/1`, locationRaw: 'Chennai', descriptionText: 'React TypeScript Node.js' }],
    });
    expect(r.boards.find((b) => b.board === 'instahyre')).toMatchObject({ mode: 'direct', fetched: 1, queued: 0 });
    expect(r.boards.find((b) => b.board === 'naukri')).toMatchObject({ mode: 'browser', queued: 1 });
    expect(r.queuedForBrowser).toBe(2);
    expect(r.inserted).toBe(1);

    const scrape = await agentService(repos).claim('w', ['scrape']);
    expect(scrape?.kind).toBe('scrape');
    if (scrape?.kind !== 'scrape') return;
    expect(scrape.bundle.url).toMatch(/naukri\.com|glassdoor/);
    const res = await agentService(repos).report(scrape.bundle.task.id, {
      status: 'scraped',
      jobs: [{ source: 'naukri', sourceId: 'n1', company: 'Freshworks', companySlug: 'freshworks', title: 'Lead Frontend Engineer', url: 'https://www.naukri.com/job-listings-n1', locationRaw: 'Chennai', descriptionText: 'React' }],
    });
    expect(res).toMatchObject({ ok: true, inserted: 1 });
  });
});
