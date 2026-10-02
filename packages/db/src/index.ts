import type { Db } from './client.js';
import { companiesRepo } from './repositories/companies.js';
import { jobsRepo } from './repositories/jobs.js';
import { runsRepo } from './repositories/runs.js';
import { eventsRepo } from './repositories/events.js';
import { settingsRepo } from './repositories/settings.js';
import { inboxRepo } from './repositories/inbox.js';

export * from './schema.js';
export * from './client.js';
export * from './repositories/companies.js';
export * from './repositories/jobs.js';
export * from './repositories/runs.js';
export * from './repositories/events.js';
export * from './repositories/settings.js';
export * from './repositories/inbox.js';
export { createTestDb } from './testing.js';

/** One object holding every repository — what services and routes receive. */
export function createRepos(db: Db) {
  return {
    db,
    companies: companiesRepo(db),
    jobs: jobsRepo(db),
    runs: runsRepo(db),
    events: eventsRepo(db),
    settings: settingsRepo(db),
    inbox: inboxRepo(db),
  };
}

export type Repos = ReturnType<typeof createRepos>;
