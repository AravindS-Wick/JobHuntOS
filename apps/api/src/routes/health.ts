import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { pingDb } from '@jobhunt/db';
import { HealthResponse } from '@jobhunt/contracts';

const startedAt = Date.now();
const VERSION = '0.1.0';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/health', {
    schema: {
      tags: ['health'],
      summary: 'Liveness — is the process up',
      response: { 200: HealthResponse },
    },
  }, async () => ({
    status: 'ok' as const,
    version: VERSION,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    checks: { process: true },
  }));

  app.get('/health/ready', {
    schema: {
      tags: ['health'],
      summary: 'Readiness — is the database reachable',
      response: { 200: HealthResponse, 503: HealthResponse },
    },
  }, async (_req, reply) => {
    const database = await pingDb(app.repos.db);
    const body = {
      status: (database ? 'ok' : 'degraded') as 'ok' | 'degraded',
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      checks: { process: true, database },
    };
    return reply.status(database ? 200 : 503).send(body);
  });
};
