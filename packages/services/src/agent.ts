import type { FactMap, FormAnswer, RawJob, ResumeDoc } from '@jobhunt/core';
import type { AgentTaskRow, Repos } from '@jobhunt/db';
import { factsService } from './facts.js';
import { ingestService } from './ingest.js';
import { absPath } from './storage.js';

/**
 * Protocol between the API and the local browser worker.
 *
 * The worker claims a task, does the browser work in the user's own Chrome
 * profile, and reports exactly one outcome. The API never drives a browser.
 */

export interface ApplyBundle {
  task: AgentTaskRow;
  application: { id: string; platform: string; applyUrl: string; coverLetter: string | null; answers: FormAnswer[] };
  job: { id: string; title: string; company: string; url: string; locationRaw: string | null };
  resume: { doc: ResumeDoc; pdfPath: string | null; docxPath: string | null };
  facts: FactMap;
}

export interface ScrapeBundle {
  task: AgentTaskRow;
  board: string;
  url: string;
  query: { keywords: string; location?: string; limit?: number };
}

export type TaskReport =
  | { status: 'submitted'; fields?: Record<string, string>; screenshotPath?: string; confirmation?: string }
  | { status: 'scraped'; jobs: RawJob[] }
  | { status: 'needs_human'; reason: string; question?: string; options?: string[]; screenshotPath?: string }
  | { status: 'failed'; error: string; retryable?: boolean; screenshotPath?: string };

const MAX_ATTEMPTS = 3;

export function agentService(repos: Repos) {
  const facts = factsService(repos);
  const ingest = ingestService(repos);

  return {
    /** Next runnable task with everything the worker needs, or nothing. */
    async claim(workerId: string, kinds?: string[]): Promise<{ kind: 'apply'; bundle: ApplyBundle } | { kind: 'scrape'; bundle: ScrapeBundle } | undefined> {
      // Anything a crashed worker held for >15 min goes back in the queue.
      await repos.agentTasks.releaseStale(new Date(Date.now() - 15 * 6e4));
      const task = await repos.agentTasks.claim(workerId, kinds);
      if (!task) return undefined;

      if (task.kind === 'scrape') {
        const p = task.payload as { board: string; url: string; query: ScrapeBundle['query'] };
        return { kind: 'scrape', bundle: { task, board: p.board, url: p.url, query: p.query } };
      }

      const app = task.applicationId ? await repos.applications.byId(task.applicationId) : undefined;
      const job = app ? await repos.jobs.byId(app.jobId) : undefined;
      const variant = app?.resumeVariantId ? await repos.resumeVariants.byId(app.resumeVariantId) : undefined;
      if (!app || !job || !variant) {
        await repos.agentTasks.finish(task.id, 'failed', { error: 'application, job or resume variant is missing' });
        return undefined;
      }
      if (app.status !== 'queued' && app.status !== 'submitting') {
        // Skipped or edited after approval: don't submit.
        await repos.agentTasks.finish(task.id, 'cancelled', { error: `application is ${app.status}` });
        return undefined;
      }
      await repos.applications.update(app.id, { status: 'submitting', attempts: app.attempts + 1 });
      const factMap = Object.fromEntries((await facts.list()).map((f) => [f.key, f]));
      return {
        kind: 'apply',
        bundle: {
          task,
          application: { id: app.id, platform: app.platform, applyUrl: app.applyUrl, coverLetter: app.coverLetter, answers: app.answers as FormAnswer[] },
          job: { id: job.id, title: job.title, company: job.company, url: job.url, locationRaw: job.locationRaw },
          resume: {
            doc: variant.doc as ResumeDoc,
            pdfPath: variant.pdfPath ? absPath(variant.pdfPath) : null,
            docxPath: variant.docxPath ? absPath(variant.docxPath) : null,
          },
          facts: factMap,
        },
      };
    },

    async report(taskId: string, r: TaskReport) {
      const task = await repos.agentTasks.byId(taskId);
      if (!task) return undefined;
      const appId = task.applicationId;

      switch (r.status) {
        case 'submitted': {
          await repos.agentTasks.finish(taskId, 'done', { result: r });
          if (appId) {
            const app = await repos.applications.update(appId, {
              status: 'submitted', submittedAt: new Date(), submittedFields: r.fields ?? null, screenshotPath: r.screenshotPath ?? null, lastError: null,
            });
            if (app) await repos.jobs.setStatus(app.jobId, 'applied');
          }
          await repos.events.record({
            entityType: 'application', entityId: appId, action: 'submitted', actor: 'agent',
            payload: { platform: task.platform, confirmation: r.confirmation, fields: Object.keys(r.fields ?? {}) },
            screenshotPath: r.screenshotPath,
          });
          return { ok: true };
        }
        case 'scraped': {
          const res = await ingest.ingestBatch(r.jobs, 'agent');
          await repos.agentTasks.finish(taskId, 'done', { result: { received: res.received, inserted: res.inserted, updated: res.updated } });
          await repos.events.record({ entityType: 'run', entityId: taskId, action: 'browser_scrape_ingested', actor: 'agent', payload: { board: task.platform, received: res.received, inserted: res.inserted } });
          return { ok: true, inserted: res.inserted };
        }
        case 'needs_human': {
          await repos.agentTasks.finish(taskId, 'needs_human', { humanPrompt: { reason: r.reason, question: r.question, options: r.options, screenshotPath: r.screenshotPath } });
          if (appId) await repos.applications.update(appId, { status: 'needs_human', lastError: r.reason, screenshotPath: r.screenshotPath ?? null });
          await repos.events.record({ entityType: 'application', entityId: appId, action: 'human_gate', actor: 'agent', payload: { reason: r.reason, question: r.question }, screenshotPath: r.screenshotPath });
          return { ok: true };
        }
        case 'failed': {
          const retry = r.retryable !== false && task.attempts < MAX_ATTEMPTS;
          if (retry) {
            await repos.agentTasks.requeue(taskId, new Date(Date.now() + 2 ** task.attempts * 5 * 6e4), { error: r.error });
            if (appId) await repos.applications.update(appId, { status: 'queued', lastError: r.error });
          } else {
            await repos.agentTasks.finish(taskId, 'failed', { error: r.error });
            if (appId) await repos.applications.update(appId, { status: 'failed', lastError: r.error, screenshotPath: r.screenshotPath ?? null });
          }
          await repos.events.record({ entityType: task.kind === 'apply' ? 'application' : 'run', entityId: appId ?? taskId, action: retry ? 'attempt_failed' : 'failed', actor: 'agent', payload: { error: r.error, attempt: task.attempts }, screenshotPath: r.screenshotPath });
          return { ok: true, retry };
        }
      }
    },

    /** The human cleared a gate (answered a question, solved a CAPTCHA, logged in): run it again. */
    async resume(taskId: string, input: { question?: string; answer?: string; saveAsFact?: { key: string; label?: string } } = {}) {
      const task = await repos.agentTasks.byId(taskId);
      if (!task || task.status !== 'needs_human') return undefined;
      if (task.applicationId && input.question && input.answer !== undefined) {
        const app = await repos.applications.byId(task.applicationId);
        if (app) {
          const answers = (app.answers as FormAnswer[]).filter((a) => a.question !== input.question);
          answers.push({ question: input.question, outcome: 'answer', answer: input.answer, formattedAnswer: input.answer, confidence: 1, reason: 'Answered by you at the Human Gate' });
          await repos.applications.update(app.id, { answers });
        }
        if (input.saveAsFact) {
          await facts.upsert({
            key: input.saveAsFact.key, category: 'preferences', label: input.saveAsFact.label ?? input.question,
            value: input.answer, evidence: `Confirmed by you for: "${input.question}"`, verifiedAt: new Date().toISOString(),
          });
        }
      }
      if (task.applicationId) await repos.applications.update(task.applicationId, { status: 'queued', lastError: null });
      const row = await repos.agentTasks.requeue(taskId, new Date(), { humanPrompt: null });
      await repos.events.record({ entityType: 'agent_task', entityId: taskId, action: 'human_gate_cleared', actor: 'user', payload: { question: input.question } });
      return row;
    },

    /**
     * The worker waited on the page while the human cleared the gate. Once the
     * task is back in the queue, take it again without re-opening the browser,
     * with the latest answers.
     */
    async continueTask(taskId: string, workerId: string) {
      const row = await repos.agentTasks.claimById(taskId, workerId);
      if (!row) return undefined;
      const app = row.applicationId ? await repos.applications.byId(row.applicationId) : undefined;
      if (app) await repos.applications.update(app.id, { status: 'submitting' });
      return { task: row, answers: (app?.answers ?? []) as FormAnswer[] };
    },

    async get(taskId: string) {
      return repos.agentTasks.byId(taskId);
    },

    async cancel(taskId: string) {
      const row = await repos.agentTasks.finish(taskId, 'cancelled');
      if (row?.applicationId) await repos.applications.update(row.applicationId, { status: 'skipped' });
      return row;
    },

    async list(filter: { status?: ('queued' | 'running' | 'done' | 'failed' | 'needs_human' | 'cancelled')[]; kind?: string[] } = {}) {
      return repos.agentTasks.list(filter);
    },
  };
}
export type AgentService = ReturnType<typeof agentService>;
