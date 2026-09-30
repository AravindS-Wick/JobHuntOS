import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { Repos } from '@jobhunt/db';
import {
  ingestService,
  profileService,
  rescoreService,
  inboxService,
  type IngestService,
  type ProfileService,
  type RescoreService,
  type InboxService,
} from '@jobhunt/services';
import type { Config } from '../config.js';

declare module 'fastify' {
  interface FastifyInstance {
    repos: Repos;
    config: Config;
    services: {
      ingest: IngestService;
      profile: ProfileService;
      rescore: RescoreService;
      inbox: InboxService;
    };
  }
}

export interface ContextOptions { repos: Repos; config: Config }

/**
 * Everything the routes need, injected once. Routes never construct a database
 * connection or a service themselves, which is what makes them testable with
 * `app.inject()` against PGlite.
 */
export default fp<ContextOptions>(async (app: FastifyInstance, opts) => {
  app.decorate('repos', opts.repos);
  app.decorate('config', opts.config);
  app.decorate('services', {
    ingest: ingestService(opts.repos),
    profile: profileService(opts.repos),
    rescore: rescoreService(opts.repos),
    inbox: inboxService(opts.repos),
  });
});
