import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ErrorResponse,
  GenerateOutreachRequest,
  GenerateOutreachResponse,
  SendOutreachEmailRequest,
  SendOutreachEmailResponse,
} from '@jobhunt/contracts';
import { outreachService } from '@jobhunt/services';

export const outreachRoutes: FastifyPluginAsyncZod = async (app) => {
  const service = outreachService(app.repos);

  app.get(
    '/outreach/templates',
    {
      schema: {
        tags: ['outreach'],
        summary: 'List available outreach and referral email templates',
        description: 'Returns available archetypes (hiring manager, peer referral, recruiter) and placeholders.',
        response: {
          200: z.object({
            templates: z.record(
              z.string(),
              z.object({
                name: z.string(),
                description: z.string(),
                subjectTemplate: z.string(),
                bodyTemplate: z.string(),
              })
            ),
          }),
          500: ErrorResponse,
        },
      },
    },
    async () => {
      return { templates: service.getTemplates() };
    }
  );

  app.post(
    '/outreach/generate',
    {
      schema: {
        tags: ['outreach'],
        summary: 'Generate customized cold pitch or referral email',
        description:
          'Dynamically synthesizes email subject and body using candidate profile, verified facts, and 1-click Gmail web compose links.',
        body: GenerateOutreachRequest,
        response: { 200: GenerateOutreachResponse, 500: ErrorResponse },
      },
    },
    async (req) => {
      return service.generate(req.body);
    }
  );

  app.post(
    '/outreach/send',
    {
      schema: {
        tags: ['outreach'],
        summary: 'Send outreach email via Gmail SMTP or API or create draft',
        description:
          'Sends the customized email using direct Gmail SMTP (Google App Password), Gmail REST API, or saves as draft.',
        body: SendOutreachEmailRequest,
        response: { 200: SendOutreachEmailResponse, 500: ErrorResponse },
      },
    },
    async (req) => {
      return service.send(req.body);
    }
  );
};
