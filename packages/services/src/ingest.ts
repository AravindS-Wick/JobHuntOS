import { dedupe, normalizeJob, scoreJob, type CompanyEntry, type ScoredJob, type RawJob } from '@jobhunt/core';
import {
  fetchCompany,
  mapWithConcurrency,
  fetchLinkedInJobs,
  fetchNaukriJobs,
  browserSearchUrl,
  type FetchResult,
  type LinkedInSearchOptions,
  type NaukriSearchOptions,
  type IndeedSearchOptions,
} from '@jobhunt/connectors';
import type { Repos } from '@jobhunt/db';
import { profileService } from './profile.js';

export interface IngestOptions {
  /** Poll only these company ids. Defaults to every enabled company. */
  companyIds?: string[];
  concurrency?: number;
  maxAgeDays?: number;
  /** Delay between requests per worker. Keep this polite — these are free public APIs. */
  delayMs?: number;
  /** Don't write anything; used by a dry-run from the UI. */
  dryRun?: boolean;
  /**
   * Board fetcher. Defaults to the real HTTP connectors. Injectable so the
   * pipeline can be tested end-to-end without touching the network.
   */
  fetcher?: (company: CompanyEntry) => Promise<FetchResult>;
}

export interface BoardResult {
  companyId: string;
  company: string;
  ats: string;
  token: string;
  fetched: number;
  error?: string;
}

export interface IngestResult {
  runId: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  boards: BoardResult[];
  fetched: number;
  afterAgeFilter: number;
  unique: number;
  duplicatesCollapsed: number;
  inserted: number;
  updated: number;
  tiers: Record<number, number>;
  errors: { company: string; error: string }[];
}

export function ingestService(repos: Repos) {
  const profiles = profileService(repos);

  return {
    async run(opts: IngestOptions = {}): Promise<IngestResult> {
      const { concurrency = 4, maxAgeDays = 45, delayMs = 250, dryRun = false, fetcher = fetchCompany } = opts;
      const startedAt = new Date();

      const all = await repos.companies.list({ enabled: true });
      const targets = opts.companyIds?.length ? all.filter((c) => opts.companyIds!.includes(c.id)) : all;

      const run = dryRun ? null : await repos.runs.start('ingest');
      if (run) {
        await repos.events.record({
          entityType: 'run', entityId: run.id, action: 'ingest_started', actor: 'system',
          payload: { boards: targets.length },
        });
      }

      try {
        const results = await mapWithConcurrency(targets, concurrency, async (c) => {
          const entry: CompanyEntry = {
            name: c.name, ats: c.ats as CompanyEntry['ats'], token: c.token,
            careersUrl: c.careersUrl ?? undefined, signal: c.signal ?? 0, tags: c.tags ?? [],
          };
          const r = await fetcher(entry);
          return { row: c, ...r };
        }, delayMs);

        const boards: BoardResult[] = results.map((r) => ({
          companyId: r.row.id, company: r.row.name, ats: r.row.ats, token: r.row.token,
          fetched: r.jobs.length, error: r.error,
        }));

        const raw = results.flatMap((r) => r.jobs);
        const now = new Date();
        const maxAgeMs = maxAgeDays * 864e5;

        const normalized = raw.map((j) => normalizeJob(j, now)).filter((j) => {
          const ts = j.postedAt ?? j.updatedAt;
          return !ts || now.getTime() - ts.getTime() <= maxAgeMs;
        });

        const { unique, duplicatesRemoved } = dedupe(normalized);
        const profile = await profiles.resolve();
        const signalByToken = new Map(targets.map((c) => [`${c.ats}:${c.token}`, c.signal ?? 0]));
        const scored: ScoredJob[] = unique.map((j) =>
          scoreJob(j, profile, now, signalByToken.get(`${j.source}:${j.companySlug}`)),
        );

        const companyIdByToken = new Map(targets.map((c) => [`${c.ats}:${c.token}`, c.id]));
        const persist = dryRun ? { inserted: 0, updated: 0 } : await repos.jobs.upsertMany(scored, companyIdByToken);

        const tiers: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
        for (const j of scored) tiers[j.tier] = (tiers[j.tier] ?? 0) + 1;

        const finishedAt = new Date();
        const result: IngestResult = {
          runId: run?.id ?? null,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          boards,
          fetched: raw.length,
          afterAgeFilter: normalized.length,
          unique: unique.length,
          duplicatesCollapsed: duplicatesRemoved,
          inserted: persist.inserted,
          updated: persist.updated,
          tiers,
          errors: boards.filter((b) => b.error).map((b) => ({ company: b.company, error: b.error! })),
        };

        if (run) {
          await repos.runs.finish(run.id, 'succeeded', result as unknown as Record<string, unknown>);
          await repos.events.record({
            entityType: 'run', entityId: run.id, action: 'ingest_finished', actor: 'system',
            payload: { fetched: result.fetched, inserted: result.inserted, updated: result.updated },
          });
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (run) {
          await repos.runs.finish(run.id, 'failed', undefined, message);
          await repos.events.record({
            entityType: 'run', entityId: run.id, action: 'ingest_failed', actor: 'system',
            payload: { error: message },
          });
        }
        throw err;
      }
    },

    async ingestBatch(rawJobs: RawJob[], actor: 'user' | 'agent' | 'system' = 'agent') {
      const now = new Date();
      const normalized = rawJobs.map((j) => normalizeJob(j, now));
      const { unique, duplicatesRemoved } = dedupe(normalized);
      const profile = await profiles.resolve();
      const scored: ScoredJob[] = unique.map((j) => scoreJob(j, profile, now));

      const persist = await repos.jobs.upsertMany(scored, new Map());
      const tiers: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
      for (const j of scored) tiers[j.tier] = (tiers[j.tier] ?? 0) + 1;

      await repos.events.record({
        entityType: 'job', action: 'batch_ingested', actor,
        payload: { received: rawJobs.length, unique: unique.length, duplicatesCollapsed: duplicatesRemoved, inserted: persist.inserted, updated: persist.updated, tiers },
      });

      return {
        received: rawJobs.length,
        unique: unique.length,
        duplicatesCollapsed: duplicatesRemoved,
        inserted: persist.inserted,
        updated: persist.updated,
        tiers,
        jobs: scored,
      };
    },

    async searchAndIngest(
      source: 'linkedin' | 'naukri' | 'indeed',
      options: LinkedInSearchOptions | NaukriSearchOptions | IndeedSearchOptions,
    ) {
      let rawJobs: RawJob[] = [];

      if (source === 'linkedin') {
        rawJobs = await fetchLinkedInJobs(options as LinkedInSearchOptions);
      } else if (source === 'naukri' && (options as NaukriSearchOptions).apifyToken) {
        rawJobs = await fetchNaukriJobs(options as NaukriSearchOptions);
      } else {
        // Naukri and Indeed block direct requests: hand the search to the local browser worker.
        const q = { keywords: options.query, location: options.location, limit: options.limit };
        await repos.agentTasks.enqueue({ kind: 'scrape', platform: source, payload: { board: source, url: browserSearchUrl(source, q), query: q } });
        await repos.events.record({ entityType: 'run', action: 'browser_search_queued', actor: 'system', payload: { board: source, query: q } });
        return { source, fetched: 0, inserted: 0, updated: 0, tiers: {}, jobs: [], queuedForBrowser: true };
      }

      const batchResult = await this.ingestBatch(rawJobs, 'agent');
      return {
        source,
        fetched: rawJobs.length,
        inserted: batchResult.inserted,
        updated: batchResult.updated,
        tiers: batchResult.tiers,
        jobs: batchResult.jobs,
      };
    },
  };
}
export type IngestService = ReturnType<typeof ingestService>;

