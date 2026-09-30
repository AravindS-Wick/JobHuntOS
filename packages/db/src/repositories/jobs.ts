import { and, asc, desc, eq, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { ScoredJob } from '@jobhunt/core';
import type { Db } from '../client.js';
import { jobs } from '../schema.js';

export type JobRow = typeof jobs.$inferSelect;
export type JobStatus = 'to_apply' | 'queued' | 'applied' | 'skipped' | 'expired';

export const JOB_STATUSES: JobStatus[] = ['to_apply', 'queued', 'applied', 'skipped', 'expired'];

export interface JobFilter {
  tier?: number[];
  status?: JobStatus[];
  source?: string[];
  workMode?: string[];
  minScore?: number;
  maxScore?: number;
  /** Free-text over title and company. */
  q?: string;
  /** Only jobs first seen at or after this instant. */
  since?: Date;
  /** Hide the ones the scorer rejected outright. */
  excludeDisqualified?: boolean;
  /** Hide likely ghost postings. */
  maxGhostScore?: number;
}

export interface JobSort {
  by?: 'score' | 'postedAt' | 'firstSeenAt' | 'company';
  dir?: 'asc' | 'desc';
}

export interface Page { limit: number; offset: number }

function buildWhere(f: JobFilter): SQL | undefined {
  const w: SQL[] = [];
  if (f.tier?.length) w.push(inArray(jobs.tier, f.tier));
  if (f.status?.length) w.push(inArray(jobs.status, f.status));
  if (f.source?.length) w.push(inArray(jobs.source, f.source));
  if (f.workMode?.length) w.push(inArray(jobs.workMode, f.workMode));
  if (f.minScore !== undefined) w.push(gte(jobs.score, f.minScore));
  if (f.maxScore !== undefined) w.push(lte(jobs.score, f.maxScore));
  if (f.since) w.push(gte(jobs.firstSeenAt, f.since));
  if (f.excludeDisqualified) w.push(sql`${jobs.disqualified} is null`);
  if (f.maxGhostScore !== undefined) w.push(lte(jobs.ghostScore, f.maxGhostScore));
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    w.push(
      or(
        sql`lower(${jobs.title}) like ${like}`,
        sql`lower(${jobs.company}) like ${like}`,
      )!,
    );
  }
  return w.length ? and(...w) : undefined;
}

function orderBy(sort: JobSort) {
  const dir = sort.dir === 'asc' ? asc : desc;
  switch (sort.by) {
    case 'postedAt': return [dir(jobs.postedAt)];
    case 'firstSeenAt': return [dir(jobs.firstSeenAt)];
    case 'company': return [dir(jobs.company), desc(jobs.score)];
    default: return [dir(jobs.score), desc(jobs.postedAt)];
  }
}

export interface UpsertStats { inserted: number; updated: number }

export function jobsRepo(db: Db) {
  return {
    async list(filter: JobFilter = {}, sort: JobSort = {}, page: Page = { limit: 50, offset: 0 }) {
      const where = buildWhere(filter);
      const [rows, [countRow]] = await Promise.all([
        db.select().from(jobs).where(where).orderBy(...orderBy(sort)).limit(page.limit).offset(page.offset),
        db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(where),
      ]);
      return { items: rows, total: countRow?.n ?? 0, limit: page.limit, offset: page.offset };
    },

    async byId(id: string): Promise<JobRow | undefined> {
      const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
      return row;
    },

    async byDedupHash(hash: string): Promise<JobRow | undefined> {
      const [row] = await db.select().from(jobs).where(eq(jobs.dedupHash, hash)).limit(1);
      return row;
    },

    /**
     * Insert new postings, refresh scoring on ones we've seen before.
     *
     * `firstSeenAt` and `status` are deliberately NOT overwritten: a role you
     * already applied to must not silently revert to `to_apply` because the
     * board re-published it.
     */
    async upsertMany(scored: ScoredJob[], companyIdByToken?: Map<string, string>): Promise<UpsertStats> {
      if (!scored.length) return { inserted: 0, updated: 0 };

      const existing = new Set(
        (await db.select({ h: jobs.dedupHash }).from(jobs)
          .where(inArray(jobs.dedupHash, scored.map((j) => j.dedupHash)))).map((r) => r.h),
      );

      const values = scored.map((j) => ({
        dedupHash: j.dedupHash,
        companyId: companyIdByToken?.get(`${j.source}:${j.companySlug}`) ?? null,
        source: j.source,
        sourceId: j.sourceId,
        company: j.company,
        companyNormalized: j.companyNormalized,
        title: j.title,
        titleNormalized: j.titleNormalized,
        url: j.url,
        applyUrl: j.applyUrl ?? null,
        locationRaw: j.locationRaw,
        locations: j.locations,
        workMode: j.workMode,
        seniority: j.seniority,
        descriptionText: j.descriptionText,
        salaryMin: j.salaryMin ?? null,
        salaryMax: j.salaryMax ?? null,
        salaryCurrency: j.salaryCurrency ?? null,
        salaryInrLpa: j.salaryInrLpaEquivalent ?? null,
        postedAt: j.postedAt ?? null,
        updatedAt: j.updatedAt ?? null,
        firstSeenAt: j.firstSeenAt,
        score: j.score,
        tier: j.tier,
        breakdown: j.breakdown as unknown as Record<string, number>,
        matchedSkills: j.matchedSkills,
        gaps: j.gaps,
        ghostScore: j.ghostScore,
        ghostReasons: j.ghostReasons,
        disqualified: j.disqualified ?? null,
        seenOn: [j.source],
      }));

      await db.insert(jobs).values(values).onConflictDoUpdate({
        target: jobs.dedupHash,
        set: {
          title: sql`excluded.title`,
          url: sql`excluded.url`,
          applyUrl: sql`excluded.apply_url`,
          descriptionText: sql`excluded.description_text`,
          locations: sql`excluded.locations`,
          workMode: sql`excluded.work_mode`,
          seniority: sql`excluded.seniority`,
          salaryMin: sql`excluded.salary_min`,
          salaryMax: sql`excluded.salary_max`,
          salaryCurrency: sql`excluded.salary_currency`,
          salaryInrLpa: sql`excluded.salary_inr_lpa`,
          updatedAt: sql`excluded.updated_at`,
          score: sql`excluded.score`,
          tier: sql`excluded.tier`,
          breakdown: sql`excluded.breakdown`,
          matchedSkills: sql`excluded.matched_skills`,
          gaps: sql`excluded.gaps`,
          ghostScore: sql`excluded.ghost_score`,
          ghostReasons: sql`excluded.ghost_reasons`,
          disqualified: sql`excluded.disqualified`,
          // union of sources this role has been seen on
          seenOn: sql`(
            select coalesce(jsonb_agg(distinct s), '[]'::jsonb)
            from jsonb_array_elements(${jobs.seenOn} || excluded.seen_on) as s
          )`,
        },
      });

      const inserted = values.filter((v) => !existing.has(v.dedupHash)).length;
      return { inserted, updated: values.length - inserted };
    },

    async setStatus(id: string, status: JobStatus): Promise<JobRow | undefined> {
      const [row] = await db.update(jobs).set({ status }).where(eq(jobs.id, id)).returning();
      return row;
    },

    async setStatusMany(ids: string[], status: JobStatus): Promise<number> {
      if (!ids.length) return 0;
      const rows = await db.update(jobs).set({ status }).where(inArray(jobs.id, ids)).returning({ id: jobs.id });
      return rows.length;
    },

    /** Used after a profile change — rescoring rewrites score/tier/gaps in place. */
    async allForRescore(): Promise<JobRow[]> {
      return db.select().from(jobs);
    },

    async applyRescore(updates: { id: string; score: number; tier: number; breakdown: Record<string, number>; matchedSkills: string[]; gaps: string[]; disqualified: string | null }[]): Promise<number> {
      let n = 0;
      for (const u of updates) {
        await db.update(jobs).set({
          score: u.score, tier: u.tier, breakdown: u.breakdown,
          matchedSkills: u.matchedSkills, gaps: u.gaps, disqualified: u.disqualified,
        }).where(eq(jobs.id, u.id));
        n++;
      }
      return n;
    },

    async statsByTier(): Promise<Record<number, number>> {
      const rows = await db.select({ tier: jobs.tier, n: sql<number>`count(*)::int` }).from(jobs).groupBy(jobs.tier);
      return Object.fromEntries(rows.map((r) => [r.tier ?? 0, r.n]));
    },

    async statsByStatus(): Promise<Record<string, number>> {
      const rows = await db.select({ status: jobs.status, n: sql<number>`count(*)::int` }).from(jobs).groupBy(jobs.status);
      return Object.fromEntries(rows.map((r) => [r.status, r.n]));
    },

    async statsBySource(): Promise<Record<string, number>> {
      const rows = await db.select({ source: jobs.source, n: sql<number>`count(*)::int` }).from(jobs).groupBy(jobs.source);
      return Object.fromEntries(rows.map((r) => [r.source, r.n]));
    },
  };
}

export type JobsRepo = ReturnType<typeof jobsRepo>;
