import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  AgentTask, AgentTaskListQuery, AnswerRequest, ApplicationListQuery, ApplicationListResponse, ApproveResponse,
  BoardInfo, BoardRunRequest, BoardRunResponse, ClaimRequest, ClaimResponse, ErrorResponse, HumanResolution,
  IdsRequest, PrepareRequest, PrepareResponse, Resume, ResumeDoc, ResumeImportRequest, SearchConfigSchema,
  TaskReport, UsageResponse,
} from '@jobhunt/contracts';
import { BOARDS } from '@jobhunt/connectors';
import type { BoardId, ResumeDoc as ResumeDocT } from '@jobhunt/core';
import type { ResumeRow } from '@jobhunt/db';
import {
  agentService, applicationService, boardService, loadFile, resumeReadiness, resumeService, SearchConfig,
} from '@jobhunt/services';
import { ApiError } from '../errors.js';

const IdParam = z.object({ id: z.string().min(1) });

const toResume = (r: ResumeRow) => ({
  id: r.id, label: r.label, fileName: r.fileName, isMaster: r.isMaster, doc: r.doc as ResumeDocT,
  readiness: resumeReadiness(r.doc as ResumeDocT), createdAt: r.createdAt, updatedAt: r.updatedAt,
});

/**
 * Resumes, the application pipeline (prepare → batch approve → worker), the
 * worker protocol, and multi-board search.
 */
export const applyRoutes: FastifyPluginAsyncZod = async (app) => {
  const resumes = resumeService(app.repos);
  const applications = applicationService(app.repos);
  const agent = agentService(app.repos);
  const boards = boardService(app.repos);

  // ------------------------------------------------------------- resumes ----
  app.post('/resumes', {
    bodyLimit: 15 * 1024 * 1024,
    schema: {
      tags: ['resumes'],
      summary: 'Upload a resume (PDF, DOCX, TXT or JSON Resume)',
      description: 'Parsed into a structured resume. The first upload becomes the master: the only source tailoring may draw from. Check `readiness.missing` and correct the parse with PUT /resumes/:id/doc.',
      body: ResumeImportRequest,
      response: { 201: Resume, 400: ErrorResponse },
    },
  }, async (req, reply) => {
    let row: ResumeRow;
    try {
      row = await resumes.import({
        fileName: req.body.fileName, data: Buffer.from(req.body.dataBase64, 'base64'),
        label: req.body.label, makeMaster: req.body.makeMaster,
      });
    } catch (err) {
      throw ApiError.badRequest(err instanceof Error ? err.message : 'could not read the resume');
    }
    reply.status(201);
    return toResume(row);
  });

  app.get('/resumes', {
    schema: { tags: ['resumes'], summary: 'List uploaded resumes', response: { 200: z.object({ items: z.array(Resume) }) } },
  }, async () => ({ items: (await app.repos.resumes.list()).map(toResume) }));

  app.get('/resumes/master', {
    schema: { tags: ['resumes'], summary: 'The master resume', response: { 200: Resume, 404: ErrorResponse } },
  }, async () => {
    const row = await app.repos.resumes.master();
    if (!row) throw ApiError.notFound('master resume');
    return toResume(row);
  });

  app.put('/resumes/:id/doc', {
    schema: {
      tags: ['resumes'], summary: 'Correct the parsed resume structure',
      description: 'What you save here is the truth source for every tailored resume and form answer.',
      params: IdParam, body: ResumeDoc, response: { 200: Resume, 404: ErrorResponse },
    },
  }, async (req) => {
    const row = await resumes.updateDoc(req.params.id, req.body as ResumeDocT);
    if (!row) throw ApiError.notFound('resume', req.params.id);
    return toResume(row);
  });

  app.post('/resumes/:id/master', {
    schema: { tags: ['resumes'], summary: 'Make this the master resume', params: IdParam, response: { 200: Resume, 404: ErrorResponse } },
  }, async (req) => {
    const row = await resumes.setMaster(req.params.id);
    if (!row) throw ApiError.notFound('resume', req.params.id);
    return toResume(row);
  });

  // -------------------------------------------------------- applications ----
  app.post('/applications/prepare', {
    schema: {
      tags: ['applications'],
      summary: 'Tailor resumes and pre-answer forms for a batch of jobs',
      description: 'For each job: reorder the master resume for the JD (never adding anything), truth-check it, render DOCX + PDF, write a cover letter for Tier 1, and resolve the form questions it can see against your facts. Nothing is submitted.',
      body: PrepareRequest, response: { 200: PrepareResponse, 400: ErrorResponse },
    },
  }, async (req) => {
    try {
      return await applications.prepare(req.body);
    } catch (err) {
      if (err instanceof Error && /Upload your resume/.test(err.message)) throw ApiError.badRequest(err.message);
      throw err;
    }
  });

  app.get('/applications', {
    schema: {
      tags: ['applications'], summary: 'Review queue and history',
      description: 'Each item has the job (with gaps), what changed in the resume, the truth-check result and every form answer with its reason.',
      querystring: ApplicationListQuery, response: { 200: ApplicationListResponse },
    },
  }, async (req) => applications.list({ status: req.query.status, platform: req.query.platform }, { limit: req.query.limit, offset: req.query.offset }) as never);

  app.post('/applications/approve', {
    schema: {
      tags: ['applications'], summary: 'Batch approve: schedule submissions through the rate governor',
      description: 'Approved applications are spaced 45–180 s apart, kept inside 08:00–23:00 IST and per-platform daily caps, then submitted by the local browser worker.',
      body: IdsRequest, response: { 200: ApproveResponse },
    },
  }, async (req) => applications.approve(req.body.ids));

  app.post('/applications/skip', {
    schema: { tags: ['applications'], summary: 'Skip applications', body: IdsRequest, response: { 200: z.object({ skipped: z.number() }) } },
  }, async (req) => applications.skip(req.body.ids));

  app.post('/applications/:id/answer', {
    schema: {
      tags: ['applications'], summary: 'Answer a question the system would not guess',
      params: IdParam, body: AnswerRequest, response: { 200: z.object({ ok: z.boolean() }), 404: ErrorResponse },
    },
  }, async (req) => {
    const row = await applications.answer(req.params.id, req.body);
    if (!row) throw ApiError.notFound('application', req.params.id);
    return { ok: true };
  });

  app.post('/applications/:id/submitted', {
    schema: {
      tags: ['applications'], summary: 'Record a manual application you submitted yourself',
      params: IdParam, response: { 200: z.object({ ok: z.boolean() }), 404: ErrorResponse },
    },
  }, async (req) => {
    const row = await applications.markSubmitted(req.params.id);
    if (!row) throw ApiError.notFound('application', req.params.id);
    return { ok: true };
  });

  app.get('/applications/usage', {
    schema: { tags: ['applications'], summary: "Today's submissions against each daily cap", response: { 200: UsageResponse } },
  }, async () => applications.todayUsage());

  app.get('/applications/:id/resume.:ext', {
    schema: {
      tags: ['applications'], summary: 'Download the tailored resume (pdf or docx)',
      params: z.object({ id: z.string(), ext: z.enum(['pdf', 'docx']) }),
    },
  }, async (req, reply) => {
    const appRow = await app.repos.applications.byId(req.params.id);
    const variant = appRow?.resumeVariantId ? await app.repos.resumeVariants.byId(appRow.resumeVariantId) : undefined;
    const path = req.params.ext === 'pdf' ? variant?.pdfPath : variant?.docxPath;
    if (!path) throw ApiError.notFound('tailored resume for application', req.params.id);
    const file = await loadFile(path);
    const name = path.split('/').pop()!;
    reply.header('content-type', req.params.ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    reply.header('content-disposition', `inline; filename="${name}"`);
    return reply.send(file);
  });

  // --------------------------------------------------------------- agent ----
  app.post('/agent/claim', {
    schema: {
      tags: ['agent'], summary: 'Local browser worker: claim the next runnable task',
      description: 'Returns null when nothing is due. Only the worker on your own machine calls this.',
      body: ClaimRequest, response: { 200: ClaimResponse },
    },
  }, async (req) => ({ task: ((await agent.claim(req.body.workerId, req.body.kinds)) ?? null) as never }));

  app.post('/agent/tasks/:id/report', {
    schema: {
      tags: ['agent'], summary: 'Local browser worker: report the outcome of a task',
      params: IdParam, body: TaskReport, response: { 200: z.object({ ok: z.boolean() }).passthrough(), 404: ErrorResponse },
    },
  }, async (req) => {
    const r = await agent.report(req.params.id, req.body as never);
    if (!r) throw ApiError.notFound('task', req.params.id);
    return r;
  });

  app.get('/agent/tasks', {
    schema: {
      tags: ['agent'], summary: 'Worker queue: the Human Gate is `?status=needs_human`',
      querystring: AgentTaskListQuery, response: { 200: z.object({ items: z.array(AgentTask) }) },
    },
  }, async (req) => ({ items: (await agent.list(req.query)) as never }));

  app.post('/agent/tasks/:id/resume', {
    schema: {
      tags: ['agent'], summary: 'Clear a Human Gate and re-queue the task',
      description: 'Answer the question (optionally saving it as a fact) or confirm you solved the CAPTCHA / logged in.',
      params: IdParam, body: HumanResolution, response: { 200: z.object({ ok: z.boolean() }), 404: ErrorResponse },
    },
  }, async (req) => {
    const row = await agent.resume(req.params.id, req.body);
    if (!row) throw ApiError.notFound('task waiting for a human', req.params.id);
    return { ok: true };
  });

  app.get('/agent/tasks/:id', {
    schema: { tags: ['agent'], summary: 'One task (the worker polls this while waiting at a Human Gate)', params: IdParam, response: { 200: AgentTask, 404: ErrorResponse } },
  }, async (req) => {
    const row = await agent.get(req.params.id);
    if (!row) throw ApiError.notFound('task', req.params.id);
    return row as never;
  });

  app.post('/agent/tasks/:id/continue', {
    schema: {
      tags: ['agent'], summary: 'Local browser worker: take back a task after its Human Gate was cleared',
      params: IdParam, body: z.object({ workerId: z.string().min(1) }),
      response: { 200: z.object({ answers: z.array(z.record(z.string(), z.unknown())) }), 409: ErrorResponse },
    },
  }, async (req) => {
    const r = await agent.continueTask(req.params.id, req.body.workerId);
    if (!r) throw ApiError.conflict('task is not waiting to continue');
    return { answers: r.answers as never };
  });

  app.post('/agent/tasks/:id/cancel', {
    schema: { tags: ['agent'], summary: 'Cancel a task', params: IdParam, response: { 200: z.object({ ok: z.boolean() }) } },
  }, async (req) => ({ ok: Boolean(await agent.cancel(req.params.id)) }));

  app.get('/agent/screenshots/*', {
    schema: { tags: ['agent'], summary: 'A screenshot the worker captured', params: z.object({ '*': z.string() }) },
  }, async (req, reply) => {
    const rel = req.params['*'];
    if (!/^screenshots\/[\w./-]+\.png$/.test(rel) || rel.includes('..')) throw ApiError.badRequest('bad screenshot path');
    reply.header('content-type', 'image/png');
    return reply.send(await loadFile(rel));
  });

  // -------------------------------------------------------------- boards ----
  app.get('/boards', {
    schema: { tags: ['boards'], summary: 'Every job board and careers site, and how each is reached', response: { 200: z.object({ items: z.array(BoardInfo) }) } },
  }, async () => ({ items: Object.values(BOARDS) }));

  app.get('/boards/config', {
    schema: { tags: ['boards'], summary: 'Search keywords, locations and boards', response: { 200: SearchConfigSchema } },
  }, async () => boards.config());

  app.put('/boards/config', {
    schema: { tags: ['boards'], summary: 'Change what to search for', body: SearchConfigSchema, response: { 200: SearchConfigSchema, 400: ErrorResponse } },
  }, async (req) => {
    const parsed = SearchConfig.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest('invalid search config', parsed.error.issues);
    return boards.setConfig(parsed.data);
  });

  app.post('/boards/run', {
    config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    schema: {
      tags: ['boards'], summary: 'Search all boards now',
      description: 'Public boards are fetched and ingested immediately. Naukri, Indeed, Glassdoor, Wellfound and Cutshort block direct requests, so they are queued for the local browser worker.',
      body: BoardRunRequest, response: { 200: BoardRunResponse },
    },
  }, async (req) => boards.run({ boards: req.body.boards as BoardId[] | undefined }));
};
