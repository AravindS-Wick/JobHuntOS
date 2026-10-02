import {
  coverLetter, istDayStart, limitBucket, limitFor, nextSlot, planForm, tailorResume, validateVariant,
  type FactMap, type FormAnswer, type FormQuestion, type ResumeDoc,
} from '@jobhunt/core';
import { BOARDS, detectAts, fetchGreenhouseQuestions } from '@jobhunt/connectors';
import { renderDocx, renderPdf } from '@jobhunt/documents';
import type { ApplicationRow, ApplicationStatus, JobRow, Repos } from '@jobhunt/db';
import { factsService } from './facts.js';
import { profileService } from './profile.js';
import { resumeService } from './resumes.js';
import { documentName, saveFile } from './storage.js';

/** Platforms the browser worker has an adapter for. Everything else is applied to by hand. */
export const AUTOMATABLE = new Set([
  'greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters',
  'linkedin', 'naukri', 'indeed', 'foundit', 'instahyre', 'cutshort', 'wellfound',
]);

/**
 * Where the application is actually submitted. A LinkedIn listing that links
 * to the company's Greenhouse form is a Greenhouse application.
 */
export function applyPlatform(job: Pick<JobRow, 'source' | 'url' | 'applyUrl'>): { platform: string; applyUrl: string } {
  const url = job.applyUrl || job.url;
  if (['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'zohorecruit'].includes(job.source)) {
    return { platform: job.source, applyUrl: url };
  }
  const ats = detectAts(url).ats;
  if (ats !== 'unknown') return { platform: ats, applyUrl: url };
  return { platform: job.source, applyUrl: url };
}

export interface PrepareOptions {
  /** Explicit jobs, or pick the best unapplied ones. */
  jobIds?: string[];
  auto?: { tiers?: number[]; limit?: number; minScore?: number };
  /** Injectable for tests: renderers and the Greenhouse questions fetch. */
  render?: { pdf: (d: ResumeDoc) => Promise<Buffer>; docx: (d: ResumeDoc) => Promise<Buffer> };
  fetchQuestions?: (platform: string, job: JobRow) => Promise<FormQuestion[] | undefined>;
}

export interface PreparedSummary {
  prepared: number;
  blocked: number;
  manual: number;
  needsAnswers: number;
  items: { jobId: string; applicationId?: string; status: ApplicationStatus | 'skipped_existing'; reason?: string }[];
}

/**
 * Greenhouse publishes its forms, so their questions are answered before
 * approval. Other platforms' forms are read from the page by the worker.
 */
function greenhouseQuestions(repos: Repos) {
  return async (platform: string, job: JobRow): Promise<FormQuestion[] | undefined> => {
    if (platform !== 'greenhouse') return undefined;
    // Company job URLs are often on the company's own domain (stripe.com/jobs?gh_jid=…),
    // so the board token comes from the registry entry, not the URL.
    const company = job.companyId ? await repos.companies.byId(job.companyId) : undefined;
    const url = job.applyUrl || job.url;
    const token = company?.ats === 'greenhouse' ? company.token : detectAts(url).token;
    const id = job.source === 'greenhouse' ? job.sourceId : (url.match(/gh_jid=(\d+)/)?.[1] ?? url.match(/jobs\/(\d+)/)?.[1]);
    if (!token || !id) return undefined;
    try {
      return await fetchGreenhouseQuestions(token, id);
    } catch {
      return undefined;
    }
  };
}

export function applicationService(repos: Repos) {
  const profiles = profileService(repos);
  const facts = factsService(repos);
  const resumes = resumeService(repos);

  async function factMap(): Promise<FactMap> {
    return Object.fromEntries((await facts.list()).map((f) => [f.key, f]));
  }

  return {
    async prepare(opts: PrepareOptions = {}): Promise<PreparedSummary> {
      const master = await resumes.master();
      if (!master) throw new Error('Upload your resume first: tailoring only ever works from your master resume.');
      const render = opts.render ?? { pdf: renderPdf, docx: renderDocx };
      const fetchQuestions = opts.fetchQuestions ?? greenhouseQuestions(repos);
      const profile = await profiles.resolve();
      const fm = await factMap();

      let jobs: JobRow[];
      if (opts.jobIds?.length) {
        jobs = (await Promise.all(opts.jobIds.map((id) => repos.jobs.byId(id)))).filter((j): j is JobRow => Boolean(j));
      } else {
        const a = opts.auto ?? {};
        const res = await repos.jobs.list(
          { tier: a.tiers ?? [1, 2], status: ['to_apply'], excludeDisqualified: true, maxGhostScore: 0.5, minScore: a.minScore },
          { by: 'score', dir: 'desc' },
          { limit: a.limit ?? 20, offset: 0 },
        );
        jobs = (await Promise.all(res.items.map((j) => repos.jobs.byId(j.id)))).filter((j): j is JobRow => Boolean(j));
      }

      const summary: PreparedSummary = { prepared: 0, blocked: 0, manual: 0, needsAnswers: 0, items: [] };

      for (const job of jobs) {
        const existing = await repos.applications.byJob(job.id);
        if (existing && ['submitted', 'submitting', 'queued'].includes(existing.status)) {
          summary.items.push({ jobId: job.id, applicationId: existing.id, status: 'skipped_existing', reason: `already ${existing.status}` });
          continue;
        }

        const { platform, applyUrl } = applyPlatform(job);
        const tjob = { title: job.title, company: job.company, descriptionText: job.descriptionText ?? '' };
        const tailored = tailorResume(master.doc, tjob, { profile });
        const validation = validateVariant(tailored, master.doc, profile);

        const name = documentName(master.doc.name, job.company);
        const dir = `variants/${job.id}`;
        const [pdf, docx] = await Promise.all([render.pdf(tailored.doc), render.docx(tailored.doc)]);
        const pdfPath = await saveFile(`${dir}/${name}.pdf`, pdf);
        const docxPath = await saveFile(`${dir}/${name}.docx`, docx);
        const variant = await repos.resumeVariants.upsert({
          resumeId: master.row.id, jobId: job.id, doc: tailored.doc,
          changes: { changes: tailored.changes, matched: tailored.matched, gaps: tailored.gaps, notOnResume: tailored.notOnResume },
          validation, pdfPath, docxPath,
        });

        const letter = job.tier === 1 ? coverLetter(master.doc, tjob, tailored, fm) : undefined;
        const questions = await fetchQuestions(platform, job);
        const plan = questions
          ? planForm(questions, { facts: fm, profile, resume: master.doc, coverLetter: letter, jobLocation: job.locationRaw ?? undefined })
          : undefined;

        let status: ApplicationStatus = 'prepared';
        let blockedReason: string | undefined;
        if (!validation.ok) {
          status = 'blocked';
          blockedReason = `Tailored resume failed the truth check: ${validation.issues.join('; ')}`;
        } else if (plan?.aborts.length) {
          status = 'blocked';
          blockedReason = `Applying would require misrepresentation: ${plan.aborts.map((a) => a.reason).join('; ')}`;
        } else if (!AUTOMATABLE.has(platform)) {
          status = 'manual';
          blockedReason = `${BOARDS[platform as keyof typeof BOARDS]?.name ?? platform} has no automated apply; open the link and apply by hand with the generated resume.`;
        }

        const app = await repos.applications.upsertPrepared({
          jobId: job.id, platform, applyUrl, status, blockedReason,
          resumeVariantId: variant.id, coverLetter: letter, answers: plan?.answers ?? [],
        });
        if (!app) continue;

        if (status === 'blocked') summary.blocked++;
        else if (status === 'manual') summary.manual++;
        else summary.prepared++;
        if (plan?.asks.length) summary.needsAnswers++;
        summary.items.push({ jobId: job.id, applicationId: app.id, status, reason: blockedReason });

        await repos.events.record({
          entityType: 'application', entityId: app.id, action: 'prepared', actor: 'agent',
          payload: { jobId: job.id, platform, status, changes: tailored.changes.length, gaps: tailored.gaps, asks: plan?.asks.length ?? 0, blockedReason },
        });
      }
      return summary;
    },

    /**
     * Batch approval: each approved application is scheduled through the rate
     * governor and handed to the browser worker. Nothing is submitted here.
     */
    async approve(ids: string[], now = new Date()) {
      const approved = await repos.applications.setStatusMany(ids, ['prepared', 'needs_human'], 'approved', { approvedAt: now });
      const scheduled: { id: string; platform: string; runAfter: string }[] = [];

      for (const app of approved) {
        const bucket = limitBucket(app.platform);
        const runAfter = await nextSlot({
          platform: app.platform,
          now,
          lastScheduled: await repos.agentTasks.lastScheduled(app.platform),
          countOnDay: async (dayStart) => {
            const dayEnd = new Date(dayStart.getTime() + 864e5);
            // Count the whole bucket (all ATS forms share one ceiling).
            const platforms = bucket === 'ats' ? ['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'zohorecruit', 'amazon', 'microsoft', 'google'] : [app.platform];
            let n = 0;
            for (const p of platforms) n += await repos.agentTasks.countScheduledBetween(p, dayStart, dayEnd);
            return n;
          },
        });
        await repos.agentTasks.enqueue({
          kind: 'apply', platform: app.platform, applicationId: app.id, runAfter,
          payload: { applicationId: app.id },
        });
        await repos.applications.update(app.id, { status: 'queued' });
        await repos.jobs.setStatus(app.jobId, 'queued');
        await repos.events.record({
          entityType: 'application', entityId: app.id, action: 'approved', actor: 'user',
          payload: { platform: app.platform, runAfter: runAfter.toISOString(), dailyCap: limitFor(app.platform).perDay },
        });
        scheduled.push({ id: app.id, platform: app.platform, runAfter: runAfter.toISOString() });
      }
      return { approved: approved.length, scheduled };
    },

    async skip(ids: string[]) {
      const rows = await repos.applications.setStatusMany(ids, ['prepared', 'needs_human', 'blocked', 'manual', 'failed'], 'skipped');
      for (const r of rows) {
        await repos.jobs.setStatus(r.jobId, 'skipped');
        await repos.events.record({ entityType: 'application', entityId: r.id, action: 'skipped', actor: 'user' });
      }
      return { skipped: rows.length };
    },

    /** Mark a manual application as done by the user. */
    async markSubmitted(id: string, now = new Date()) {
      const row = await repos.applications.update(id, { status: 'submitted', submittedAt: now });
      if (row) {
        await repos.jobs.setStatus(row.jobId, 'applied');
        await repos.events.record({ entityType: 'application', entityId: id, action: 'submitted_manually', actor: 'user' });
      }
      return row;
    },

    /**
     * The human answers a question the system would not guess. The answer is
     * stored on the application and, if asked, becomes a verified fact so the
     * same question never has to be asked again.
     */
    async answer(id: string, input: { question: string; answer: string; saveAsFact?: { key: string; label?: string } }) {
      const app = await repos.applications.byId(id);
      if (!app) return undefined;
      const answers = (app.answers as FormAnswer[]).filter((a) => a.question !== input.question);
      answers.push({
        question: input.question, outcome: 'answer', answer: input.answer, formattedAnswer: input.answer,
        confidence: 1, reason: 'Answered by you',
        ...(input.saveAsFact ? { key: input.saveAsFact.key } : {}),
      });
      const row = await repos.applications.update(id, { answers });
      if (input.saveAsFact) {
        await facts.upsert({
          key: input.saveAsFact.key, category: 'preferences', label: input.saveAsFact.label ?? input.question,
          value: input.answer, evidence: `Confirmed by you for: "${input.question}"`, verifiedAt: new Date().toISOString(),
        });
      }
      await repos.events.record({ entityType: 'application', entityId: id, action: 'question_answered', actor: 'user', payload: { question: input.question, savedAsFact: Boolean(input.saveAsFact) } });
      return row;
    },

    async list(filter: { status?: ApplicationStatus[]; platform?: string[] } = {}, page = { limit: 50, offset: 0 }) {
      const res = await repos.applications.list(filter, page);
      const items = await Promise.all(res.items.map(async ({ application, job }) => {
        const variant = application.resumeVariantId ? await repos.resumeVariants.byId(application.resumeVariantId) : undefined;
        return { application, job, variant: variant && { id: variant.id, changes: variant.changes, validation: variant.validation, pdfPath: variant.pdfPath, docxPath: variant.docxPath } };
      }));
      return { items, total: res.total, limit: page.limit, offset: page.offset };
    },

    async todayUsage(now = new Date()) {
      const since = istDayStart(now);
      const out: Record<string, { used: number; cap: number }> = {};
      for (const p of AUTOMATABLE) {
        const bucket = limitBucket(p);
        const cur = out[bucket] ?? { used: 0, cap: limitFor(p).perDay };
        cur.used += await repos.applications.submittedSince(p, since);
        out[bucket] = cur;
      }
      return out;
    },

    async get(id: string): Promise<ApplicationRow | undefined> {
      return repos.applications.byId(id);
    },
  };
}
export type ApplicationService = ReturnType<typeof applicationService>;
