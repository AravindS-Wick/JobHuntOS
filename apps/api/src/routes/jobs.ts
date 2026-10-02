import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { JobStatus } from '@jobhunt/db';
import { ApiError } from '../errors.js';
import { BulkStatusUpdate, ErrorResponse, Job, JobListQuery, JobListResponse, StatusUpdate } from '@jobhunt/contracts';

const IdParam = z.object({ id: z.string().min(1) });

export const jobRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/jobs', {
    schema: {
      tags: ['jobs'],
      summary: 'List scored jobs',
      description:
        'The approval-inbox feed. Filters compose: `?tier=1,2&status=to_apply&excludeDisqualified=true&sortBy=score`. Every item carries `gaps` — the JD requirements the candidate does not have. Render them; never hide them.',
      querystring: JobListQuery,
      response: { 200: JobListResponse },
    },
  }, async (req) => {
    const q = req.query;
    return app.repos.jobs.list(
      {
        tier: q.tier,
        status: q.status as JobStatus[] | undefined,
        source: q.source,
        workMode: q.workMode,
        minScore: q.minScore,
        maxScore: q.maxScore,
        q: q.q,
        since: q.since,
        excludeDisqualified: q.excludeDisqualified,
        maxGhostScore: q.maxGhostScore,
      },
      { by: q.sortBy, dir: q.sortDir },
      { limit: q.limit, offset: q.offset },
    );
  });

  app.get('/jobs/:id', {
    schema: {
      tags: ['jobs'],
      summary: 'Get one job, including the full description text',
      params: IdParam,
      response: { 200: Job, 404: ErrorResponse },
    },
  }, async (req) => {
    const row = await app.repos.jobs.byId(req.params.id);
    if (!row) throw ApiError.notFound('job', req.params.id);
    return row;
  });

  app.patch('/jobs/:id/status', {
    schema: {
      tags: ['jobs'],
      summary: 'Move a job through the pipeline',
      params: IdParam,
      body: StatusUpdate,
      response: { 200: Job, 404: ErrorResponse },
    },
  }, async (req) => {
    const before = await app.repos.jobs.byId(req.params.id);
    if (!before) throw ApiError.notFound('job', req.params.id);

    const row = await app.repos.jobs.setStatus(req.params.id, req.body.status);
    await app.repos.events.record({
      entityType: 'job', entityId: req.params.id, action: 'status_changed', actor: 'user',
      payload: { from: before.status, to: req.body.status },
    });
    return row!;
  });

  app.post('/jobs/status', {
    schema: {
      tags: ['jobs'],
      summary: 'Bulk status change',
      description: 'Used by the approval inbox to clear a batch of decisions in one call.',
      body: BulkStatusUpdate,
      response: { 200: z.object({ updated: z.number() }) },
    },
  }, async (req) => {
    const updated = await app.repos.jobs.setStatusMany(req.body.ids, req.body.status);
    await app.repos.events.record({
      entityType: 'job', action: 'bulk_status_changed', actor: 'user',
      payload: { count: updated, to: req.body.status },
    });
    return { updated };
  });

  app.post('/jobs/ingest-batch', {
    schema: {
      tags: ['jobs'],
      summary: 'Ingest raw jobs from Chrome Extension or external scraper',
      description: 'Used by the Manifest V3 Chrome extension to ingest live LinkedIn / Naukri postings directly into the scoring pipeline.',
      body: z.object({
        source: z.string().default('linkedin'),
        jobs: z.array(z.object({
          sourceId: z.string().min(1),
          company: z.string().min(1),
          title: z.string().min(1),
          url: z.string().min(1),
          locationRaw: z.string().optional(),
          descriptionText: z.string().default(''),
          compensationRaw: z.string().optional(),
          postedAt: z.coerce.date().optional(),
        })),
      }),
      response: {
        200: z.object({
          received: z.number(),
          unique: z.number(),
          duplicatesCollapsed: z.number(),
          inserted: z.number(),
          updated: z.number(),
          tiers: z.record(z.string(), z.number()),
        }),
      },
    },
  }, async (req) => {
    const rawJobs = req.body.jobs.map((j) => ({
      source: (req.body.source as any) || 'linkedin',
      sourceId: j.sourceId,
      company: j.company,
      companySlug: j.company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'company',
      title: j.title,
      url: j.url,
      locationRaw: j.locationRaw ?? 'Remote - India',
      descriptionText: j.descriptionText,
      compensationRaw: j.compensationRaw,
      postedAt: j.postedAt ?? new Date(),
    }));

    return app.services.ingest.ingestBatch(rawJobs, 'agent');
  });
};
