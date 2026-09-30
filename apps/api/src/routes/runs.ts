import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { ApiError } from '../errors.js';
import { ErrorResponse, IngestRequest, IngestResponse, Run } from '@jobhunt/contracts';

const IdParam = z.object({ id: z.string().min(1) });

export const runRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post('/runs/ingest', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      tags: ['runs'],
      summary: 'Poll every enabled board, dedupe, score and persist',
      description:
        'Synchronous today — it returns when the run completes. Boards are polled with bounded concurrency and a politeness delay. Pass `dryRun: true` to see what would land without writing.',
      body: IngestRequest,
      response: { 200: IngestResponse, 400: ErrorResponse },
    },
  }, async (req) => {
    const r = await app.services.ingest.run(req.body);
    return { ...r, tiers: Object.fromEntries(Object.entries(r.tiers).map(([k, v]) => [String(k), v])) };
  });

  app.get('/runs', {
    schema: {
      tags: ['runs'],
      summary: 'Recent runs',
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }),
      response: { 200: z.array(Run) },
    },
  }, async (req) => app.repos.runs.list(req.query.limit));

  app.get('/runs/:id', {
    schema: {
      tags: ['runs'],
      summary: 'One run, with its full stats payload',
      params: IdParam,
      response: { 200: Run, 404: ErrorResponse },
    },
  }, async (req) => {
    const row = await app.repos.runs.byId(req.params.id);
    if (!row) throw ApiError.notFound('run', req.params.id);
    return row;
  });
};
