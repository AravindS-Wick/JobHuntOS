import { z } from 'zod';
import { isTitleCandidate, type BoardId, type RawJob } from '@jobhunt/core';
import { BOARDS, BrowserOnlyError, browserSearchUrl, searchBoard, type BoardQuery } from '@jobhunt/connectors';
import type { Repos } from '@jobhunt/db';
import { ingestService } from './ingest.js';
import { profileService } from './profile.js';

export const SEARCH_KEY = 'search.config';

const BoardIdSchema = z.enum(Object.keys(BOARDS) as [BoardId, ...BoardId[]]);

/** What to search for on job boards and big-company careers sites. */
export const SearchConfig = z.object({
  keywords: z.array(z.string().min(2)).min(1).max(10),
  locations: z.array(z.string()).max(6),
  boards: z.array(BoardIdSchema).min(1),
  limitPerQuery: z.number().int().min(5).max(100),
}).strict();
export type SearchConfig = z.infer<typeof SearchConfig>;

export const DEFAULT_SEARCH: SearchConfig = {
  keywords: ['react developer', 'full stack engineer', 'senior frontend engineer'],
  locations: ['Chennai', 'Bangalore', 'Remote'],
  boards: ['linkedin', 'naukri', 'indeed', 'foundit', 'instahyre', 'cutshort', 'wellfound', 'glassdoor', 'yc', 'hn', 'remoteok', 'amazon', 'microsoft', 'google'],
  limitPerQuery: 25,
};

export interface BoardRunResult {
  boards: { board: BoardId; mode: 'direct' | 'browser'; fetched: number; queued: number; errors: string[] }[];
  received: number;
  inserted: number;
  updated: number;
  queuedForBrowser: number;
}

export interface BoardRunOptions {
  boards?: BoardId[];
  /** Injectable for tests. */
  search?: (board: BoardId, q: BoardQuery, wantDetail: (t: string) => boolean) => Promise<RawJob[]>;
}

/** Boards whose results don't depend on location (one query per keyword is enough). */
const LOCATIONLESS = new Set<BoardId>(['instahyre', 'hn', 'remoteok', 'yc']);

export function boardService(repos: Repos) {
  const ingest = ingestService(repos);
  const profiles = profileService(repos);

  return {
    async config(): Promise<SearchConfig> {
      const raw = await repos.settings.get<unknown>(SEARCH_KEY);
      const parsed = raw ? SearchConfig.safeParse(raw) : undefined;
      return parsed?.success ? parsed.data : DEFAULT_SEARCH;
    },

    async setConfig(next: SearchConfig): Promise<SearchConfig> {
      await repos.settings.set(SEARCH_KEY, next);
      await repos.events.record({ entityType: 'search', action: 'config_updated', actor: 'user', payload: next });
      return next;
    },

    /**
     * Search every configured board. Public ones are fetched now and ingested;
     * blocked ones become scrape tasks for the local browser worker.
     */
    async run(opts: BoardRunOptions = {}): Promise<BoardRunResult> {
      const cfg = await this.config();
      const profile = await profiles.resolve();
      const wantDetail = (t: string) => isTitleCandidate(t, profile);
      const search = opts.search ?? ((b, q, w) => searchBoard(b, q, { wantDetail: w }));
      const boards = (opts.boards ?? cfg.boards).filter((b) => cfg.boards.includes(b) || opts.boards?.includes(b));
      const result: BoardRunResult = { boards: [], received: 0, inserted: 0, updated: 0, queuedForBrowser: 0 };
      const collected: RawJob[] = [];

      for (const board of boards) {
        const info = BOARDS[board];
        const stat = { board, mode: info.mode, fetched: 0, queued: 0, errors: [] as string[] };
        const locations = LOCATIONLESS.has(board) || cfg.locations.length === 0 ? [undefined] : cfg.locations;

        for (const keywords of cfg.keywords) {
          for (const location of locations) {
            const q: BoardQuery = { keywords, location, limit: cfg.limitPerQuery };
            try {
              if (info.mode === 'browser') throw new BrowserOnlyError(board, browserSearchUrl(board, q));
              const jobs = await search(board, q, wantDetail);
              stat.fetched += jobs.length;
              collected.push(...jobs);
            } catch (err) {
              if (err instanceof BrowserOnlyError) {
                await repos.agentTasks.enqueue({ kind: 'scrape', platform: board, payload: { board, url: err.pageUrl, query: q } });
                stat.queued++;
              } else {
                stat.errors.push(`${keywords}${location ? ` @ ${location}` : ''}: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
              }
            }
          }
          // Locationless boards return the same feed for every keyword; one fetch is enough.
          if (board === 'remoteok' || board === 'hn') break;
        }
        result.queuedForBrowser += stat.queued;
        result.boards.push(stat);
      }

      if (collected.length) {
        const res = await ingest.ingestBatch(collected, 'agent');
        result.received = res.received;
        result.inserted = res.inserted;
        result.updated = res.updated;
      }
      await repos.events.record({
        entityType: 'run', action: 'boards_searched', actor: 'system',
        payload: { boards: result.boards.map((b) => ({ board: b.board, fetched: b.fetched, queued: b.queued, errors: b.errors.length })), inserted: result.inserted },
      });
      return result;
    },
  };
}
export type BoardService = ReturnType<typeof boardService>;
