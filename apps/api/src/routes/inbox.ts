import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  InboxListQuery,
  InboxListResponse,
  InboxMessage,
  InboxSyncRequest,
  InboxSyncResponse,
  DraftReplyRequest,
  DraftReplyResponse,
  InboxStatsResponse,
  ErrorResponse,
} from '@jobhunt/contracts';
import { ApiError } from '../errors.js';

const IdParam = z.object({ id: z.string().min(1) });

export const inboxRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/inbox/messages', {
    schema: {
      tags: ['inbox'],
      summary: 'List email communications and auto-classified messages',
      description: 'Filter by category (interview_invite, assessment_link, application_ack, rejection, recruiter_outreach), actionRequired, or query.',
      querystring: InboxListQuery,
      response: { 200: InboxListResponse },
    },
  }, async (req) => {
    const q = req.query;
    const res = await app.repos.inbox.list(
      {
        category: q.category,
        linkedJobId: q.linkedJobId,
        actionRequired: q.actionRequired,
        processed: q.processed,
        q: q.q,
      },
      { limit: q.limit, offset: q.offset },
    );
    return {
      items: res.items,
      total: res.total,
      limit: q.limit,
      offset: q.offset,
    };
  });

  app.get('/inbox/messages/:id', {
    schema: {
      tags: ['inbox'],
      summary: 'Get single inbox message details',
      params: IdParam,
      response: { 200: InboxMessage, 404: ErrorResponse },
    },
  }, async (req) => {
    const msg = await app.repos.inbox.byId(req.params.id);
    if (!msg) throw ApiError.notFound('inbox message', req.params.id);
    return msg;
  });

  app.post('/inbox/sync', {
    schema: {
      tags: ['inbox'],
      summary: 'Synchronize emails from Gmail API and auto-classify',
      body: InboxSyncRequest,
      response: { 200: InboxSyncResponse },
    },
  }, async (req) => {
    return app.services.inbox.sync(req.body);
  });

  app.post('/inbox/messages/:id/draft', {
    schema: {
      tags: ['inbox'],
      summary: 'Generate an AI-powered truthful draft reply to an email',
      params: IdParam,
      body: z.object({ instructions: z.string().optional() }),
      response: { 200: DraftReplyResponse, 404: ErrorResponse },
    },
  }, async (req) => {
    const before = await app.repos.inbox.byId(req.params.id);
    if (!before) throw ApiError.notFound('inbox message', req.params.id);

    return app.services.inbox.generateDraftReply(req.params.id, req.body.instructions);
  });

  app.patch('/inbox/messages/:id', {
    schema: {
      tags: ['inbox'],
      summary: 'Update message action status or linked job',
      params: IdParam,
      body: z.object({
        processed: z.boolean().optional(),
        actionRequired: z.boolean().optional(),
        linkedJobId: z.string().nullable().optional(),
        draftReply: z.string().optional(),
      }),
      response: { 200: InboxMessage, 404: ErrorResponse },
    },
  }, async (req) => {
    const row = await app.repos.inbox.update(req.params.id, req.body as any);
    if (!row) throw ApiError.notFound('inbox message', req.params.id);
    return row;
  });

  app.get('/inbox/stats', {
    schema: {
      tags: ['inbox'],
      summary: 'Inbox summary statistics and actionable counts',
      response: { 200: InboxStatsResponse },
    },
  }, async () => {
    return app.repos.inbox.getStats();
  });
};
