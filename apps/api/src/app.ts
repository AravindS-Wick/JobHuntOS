import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  serializerCompiler, validatorCompiler, jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Repos } from '@jobhunt/db';
import type { Config } from './config.js';
import { registerErrorHandler } from './errors.js';
import authPlugin from './plugins/auth.js';
import contextPlugin from './plugins/context.js';
import { healthRoutes } from './routes/health.js';
import { companyRoutes } from './routes/companies.js';
import { jobRoutes } from './routes/jobs.js';
import { runRoutes } from './routes/runs.js';
import { profileRoutes } from './routes/profile.js';
import { statsRoutes } from './routes/stats.js';
import { eventRoutes } from './routes/events.js';
import { inboxRoutes } from './routes/inbox.js';
import { connectorRoutes } from './routes/connectors.js';
import { applyRoutes } from './routes/apply.js';
import { factRoutes } from './routes/facts.js';
import { outreachRoutes } from './routes/outreach.js';

export interface BuildOptions {
  config: Config;
  repos: Repos;
}

export async function buildApp({ config, repos }: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            transport: config.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
              : undefined,
          },
    genReqId: () => globalThis.crypto.randomUUID(),
    ajv: { customOptions: { coerceTypes: false } },
  }).withTypeProvider<ZodTypeProvider>();

  // Zod drives both request validation and response serialization.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandler(app);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ['content-type', 'x-api-key'],
  });
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    // Single-user: the limiter exists to stop a runaway UI loop, not to police tenants.
    keyGenerator: (req) => req.ip,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'JobHunt OS API',
        version: '0.1.0',
        description: [
          'Backend for JobHunt OS. Single-tenant.',
          '',
          '**Two invariants the UI must respect:**',
          '1. Every job carries `gaps` — JD requirements the candidate does *not* have. Always render them. Never let the UI imply the candidate has a gap technology.',
          '2. Nothing in this API sends anything to another human. Outbound actions (Phase 4) will be draft-and-approve only.',
        ].join('\n'),
      },
      servers: [{ url: `http://${config.API_HOST}:${config.API_PORT}` }],
      tags: [
        { name: 'health', description: 'Liveness and readiness' },
        { name: 'companies', description: 'Target company registry and ATS detection' },
        { name: 'jobs', description: 'Scored jobs — the approval inbox feed' },
        { name: 'runs', description: 'Ingest runs' },
        { name: 'profile', description: 'Scoring profile and rescoring' },
        { name: 'stats', description: 'Dashboard counters' },
        { name: 'events', description: 'Audit log' },
        { name: 'inbox', description: 'Gmail and communication intelligence' },
        { name: 'connectors', description: 'Live search and platform integrations' },
        { name: 'facts', description: 'Verified fact table and screening question resolver' },
        { name: 'resumes', description: 'Master resume: the only source tailoring may draw from' },
        { name: 'applications', description: 'Prepare → batch approve → submitted by the local browser worker' },
        { name: 'agent', description: 'Protocol for the local browser worker, and the Human Gate' },
        { name: 'boards', description: 'Job boards and big-company careers sites' },
      ],
      components: {
        securitySchemes: {
          apiKey: { type: 'apiKey', name: 'x-api-key', in: 'header' },
        },
      },
      security: config.API_KEY ? [{ apiKey: [] }] : [],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  await app.register(contextPlugin, { repos, config });
  await app.register(authPlugin, { apiKey: config.API_KEY });

  await app.register(healthRoutes);
  await app.register(companyRoutes);
  await app.register(jobRoutes);
  await app.register(runRoutes);
  await app.register(profileRoutes);
  await app.register(statsRoutes);
  await app.register(eventRoutes);
  await app.register(inboxRoutes);
  await app.register(connectorRoutes);
  await app.register(factRoutes);
  await app.register(outreachRoutes);
  await app.register(applyRoutes);

  return app;
}
