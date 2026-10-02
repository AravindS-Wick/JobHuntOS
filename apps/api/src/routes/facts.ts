import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  ErrorResponse,
  Fact,
  FactListQuery,
  FactListResponse,
  ResolveQuestionRequest,
  ResolveQuestionResponse,
} from '@jobhunt/contracts';
import { factsService } from '@jobhunt/services';

export const factRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = factsService(app.repos);

  app.get(
    '/facts',
    {
      schema: {
        tags: ['facts'],
        summary: 'List verified facts from the fact table',
        description: 'Returns the truth constraint facts used for screening answers and resume tailoring.',
        querystring: FactListQuery,
        response: { 200: FactListResponse, 500: ErrorResponse },
      },
    },
    async (req) => {
      const items = await service.list(req.query.category);
      return { items, total: items.length };
    },
  );

  app.post(
    '/facts',
    {
      schema: {
        tags: ['facts'],
        summary: 'Create or update a verified fact',
        description: 'Updates a fact or caches a newly confirmed answer from the Human Gate queue.',
        body: Fact,
        response: { 200: Fact, 500: ErrorResponse },
      },
    },
    async (req) => {
      return service.upsert(req.body);
    },
  );

  app.post(
    '/facts/resolve',
    {
      schema: {
        tags: ['facts'],
        summary: 'Resolve an ATS screening question',
        description:
          'Evaluates a screening question against the verified fact table. Returns answer (truthful), ask (queued for human), or abort (gap violation).',
        body: ResolveQuestionRequest,
        response: { 200: ResolveQuestionResponse, 500: ErrorResponse },
      },
    },
    async (req) => {
      return service.resolve(req.body.question, req.body.options);
    },
  );
};
