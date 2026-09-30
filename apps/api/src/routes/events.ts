import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { Event, EventListQuery } from '@jobhunt/contracts';

export const eventRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/events', {
    schema: {
      tags: ['events'],
      summary: 'Audit log',
      description: 'Every state change, newest first. Phase 3+ attaches a screenshot path to browser actions.',
      querystring: EventListQuery,
      response: { 200: z.array(Event) },
    },
  }, async (req) => {
    const { limit, ...filter } = req.query;
    return app.repos.events.list(filter, limit);
  });
};
