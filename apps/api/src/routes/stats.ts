import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { StatsResponse } from '@jobhunt/contracts';

export const statsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/stats', {
    schema: {
      tags: ['stats'],
      summary: 'Dashboard counters',
      description: 'One call for the console header: registry size, job counts by tier/status/source, and the last ingest.',
      response: { 200: StatsResponse },
    },
  }, async () => {
    const [all, enabled, byTier, byStatus, bySource, lastRun] = await Promise.all([
      app.repos.companies.count(),
      app.repos.companies.list({ enabled: true }),
      app.repos.jobs.statsByTier(),
      app.repos.jobs.statsByStatus(),
      app.repos.jobs.statsBySource(),
      app.repos.runs.latest('ingest'),
    ]);

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const stats = (lastRun?.stats ?? null) as { fetched?: number; inserted?: number } | null;

    return {
      companies: { total: all, enabled: enabled.length },
      jobs: {
        total,
        byTier: Object.fromEntries(Object.entries(byTier).map(([k, v]) => [String(k), v])),
        byStatus,
        bySource,
      },
      lastIngest: {
        at: lastRun?.finishedAt ?? lastRun?.startedAt ?? null,
        status: lastRun?.status ?? null,
        fetched: stats?.fetched ?? null,
        inserted: stats?.inserted ?? null,
      },
    };
  });
};
