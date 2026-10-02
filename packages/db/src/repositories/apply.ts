import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../client.js';
import { agentTasks, applications, resumeVariants, resumes } from '../schema-apply.js';
import { jobs } from '../schema.js';

export type ResumeRow = typeof resumes.$inferSelect;
export type ResumeVariantRow = typeof resumeVariants.$inferSelect;
export type ApplicationRow = typeof applications.$inferSelect;
export type AgentTaskRow = typeof agentTasks.$inferSelect;

export type ApplicationStatus =
  | 'prepared' | 'approved' | 'queued' | 'submitting' | 'submitted'
  | 'needs_human' | 'failed' | 'skipped' | 'blocked' | 'manual';
export type AgentTaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'needs_human' | 'cancelled';

export function resumesRepo(db: Db) {
  return {
    async create(v: typeof resumes.$inferInsert): Promise<ResumeRow> {
      const [row] = await db.insert(resumes).values(v).returning();
      return row!;
    },
    async byId(id: string) {
      const [row] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
      return row;
    },
    async list() {
      return db.select().from(resumes).orderBy(desc(resumes.createdAt));
    },
    async master(): Promise<ResumeRow | undefined> {
      const [row] = await db.select().from(resumes).where(eq(resumes.isMaster, true)).limit(1);
      return row;
    },
    /** Exactly one master at a time. */
    async setMaster(id: string): Promise<ResumeRow | undefined> {
      await db.update(resumes).set({ isMaster: false }).where(eq(resumes.isMaster, true));
      const [row] = await db.update(resumes).set({ isMaster: true, updatedAt: new Date() }).where(eq(resumes.id, id)).returning();
      return row;
    },
    async updateDoc(id: string, doc: unknown) {
      const [row] = await db.update(resumes).set({ doc, updatedAt: new Date() }).where(eq(resumes.id, id)).returning();
      return row;
    },
    async remove(id: string) {
      const r = await db.delete(resumes).where(eq(resumes.id, id)).returning({ id: resumes.id });
      return r.length > 0;
    },
  };
}

export function resumeVariantsRepo(db: Db) {
  return {
    /** One variant per (resume, job): re-tailoring replaces it. */
    async upsert(v: typeof resumeVariants.$inferInsert): Promise<ResumeVariantRow> {
      const [row] = await db.insert(resumeVariants).values(v)
        .onConflictDoUpdate({
          target: [resumeVariants.resumeId, resumeVariants.jobId],
          set: { doc: v.doc, changes: v.changes, validation: v.validation, docxPath: v.docxPath, pdfPath: v.pdfPath, createdAt: new Date() },
        })
        .returning();
      return row!;
    },
    async byId(id: string) {
      const [row] = await db.select().from(resumeVariants).where(eq(resumeVariants.id, id)).limit(1);
      return row;
    },
  };
}

export interface ApplicationFilter {
  status?: ApplicationStatus[];
  platform?: string[];
}

export function applicationsRepo(db: Db) {
  const where = (f: ApplicationFilter): SQL | undefined => {
    const w: SQL[] = [];
    if (f.status?.length) w.push(inArray(applications.status, f.status));
    if (f.platform?.length) w.push(inArray(applications.platform, f.platform));
    return w.length ? and(...w) : undefined;
  };

  return {
    /** Re-preparing a job resets its application unless it was already submitted. */
    async upsertPrepared(v: typeof applications.$inferInsert): Promise<ApplicationRow | undefined> {
      const [row] = await db.insert(applications).values(v)
        .onConflictDoUpdate({
          target: applications.jobId,
          set: {
            platform: v.platform, applyUrl: v.applyUrl, status: v.status ?? 'prepared',
            resumeVariantId: v.resumeVariantId, coverLetter: v.coverLetter, answers: v.answers,
            blockedReason: v.blockedReason ?? null, lastError: null, updatedAt: new Date(),
          },
          setWhere: sql`${applications.status} not in ('submitted', 'submitting')`,
        })
        .returning();
      return row;
    },
    async byId(id: string) {
      const [row] = await db.select().from(applications).where(eq(applications.id, id)).limit(1);
      return row;
    },
    async byJob(jobId: string) {
      const [row] = await db.select().from(applications).where(eq(applications.jobId, jobId)).limit(1);
      return row;
    },
    /** Applications joined with the job fields the review card needs. */
    async list(f: ApplicationFilter = {}, page = { limit: 50, offset: 0 }) {
      const w = where(f);
      const items = await db
        .select({
          application: applications,
          job: {
            id: jobs.id, title: jobs.title, company: jobs.company, url: jobs.url, source: jobs.source,
            score: jobs.score, tier: jobs.tier, gaps: jobs.gaps, matchedSkills: jobs.matchedSkills,
            locationRaw: jobs.locationRaw, workMode: jobs.workMode,
          },
        })
        .from(applications)
        .innerJoin(jobs, eq(applications.jobId, jobs.id))
        .where(w)
        .orderBy(desc(jobs.score), asc(applications.createdAt))
        .limit(page.limit)
        .offset(page.offset);
      const [{ count } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(applications).where(w);
      return { items, total: count };
    },
    async update(id: string, patch: Partial<typeof applications.$inferInsert>) {
      const [row] = await db.update(applications).set({ ...patch, updatedAt: new Date() }).where(eq(applications.id, id)).returning();
      return row;
    },
    async setStatusMany(ids: string[], from: ApplicationStatus[], to: ApplicationStatus, extra: Partial<typeof applications.$inferInsert> = {}) {
      if (!ids.length) return [];
      return db.update(applications).set({ ...extra, status: to, updatedAt: new Date() })
        .where(and(inArray(applications.id, ids), inArray(applications.status, from)))
        .returning();
    },
    /** Submitted on a platform since `since` — what the rate governor counts. */
    async submittedSince(platform: string, since: Date): Promise<number> {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(applications)
        .where(and(eq(applications.platform, platform), eq(applications.status, 'submitted'), gte(applications.submittedAt, since)));
      return r?.n ?? 0;
    },
    async countByStatus(): Promise<Record<string, number>> {
      const rows = await db.select({ status: applications.status, n: sql<number>`count(*)::int` }).from(applications).groupBy(applications.status);
      return Object.fromEntries(rows.map((r) => [r.status, r.n]));
    },
  };
}

export function agentTasksRepo(db: Db) {
  return {
    async enqueue(v: typeof agentTasks.$inferInsert): Promise<AgentTaskRow> {
      const [row] = await db.insert(agentTasks).values(v).returning();
      return row!;
    },
    async byId(id: string) {
      const [row] = await db.select().from(agentTasks).where(eq(agentTasks.id, id)).limit(1);
      return row;
    },
    /**
     * Atomically claim the next runnable task. `skip locked` lets several
     * workers (or a restarted one) drain the queue without double-running.
     */
    async claim(workerId: string, kinds: string[] = ['scrape', 'apply'], now = new Date()): Promise<AgentTaskRow | undefined> {
      const kindList = sql.join(kinds.map((k) => sql`${k}`), sql`, `);
      const rows = await db.execute<Record<string, unknown>>(sql`
        update agent_tasks set status = 'running', locked_by = ${workerId}, locked_at = ${now.toISOString()}::timestamptz,
          attempts = attempts + 1, updated_at = ${now.toISOString()}::timestamptz
        where id = (
          select id from agent_tasks
          where status = 'queued' and run_after <= ${now.toISOString()}::timestamptz and kind in (${kindList})
          order by run_after asc, created_at asc
          limit 1
          for update skip locked
        )
        returning id`);
      const list = Array.isArray(rows) ? rows : ((rows as { rows?: Record<string, unknown>[] }).rows ?? []);
      const id = list[0]?.id as string | undefined;
      return id ? this.byId(id) : undefined;
    },
    /** Re-claim one specific queued task: the worker continuing on the page it paused at. */
    async claimById(id: string, workerId: string): Promise<AgentTaskRow | undefined> {
      const [row] = await db.update(agentTasks)
        .set({ status: 'running', lockedBy: workerId, lockedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(agentTasks.id, id), eq(agentTasks.status, 'queued')))
        .returning();
      return row;
    },
    async finish(id: string, status: AgentTaskStatus, patch: Partial<typeof agentTasks.$inferInsert> = {}) {
      const done = status === 'done' || status === 'failed' || status === 'cancelled';
      const [row] = await db.update(agentTasks)
        .set({ ...patch, status, updatedAt: new Date(), ...(done ? { finishedAt: new Date() } : {}), lockedBy: null, lockedAt: null })
        .where(eq(agentTasks.id, id)).returning();
      return row;
    },
    async requeue(id: string, runAfter = new Date(), patch: Partial<typeof agentTasks.$inferInsert> = {}) {
      const [row] = await db.update(agentTasks)
        .set({ ...patch, status: 'queued', runAfter, lockedBy: null, lockedAt: null, updatedAt: new Date() })
        .where(eq(agentTasks.id, id)).returning();
      return row;
    },
    async list(f: { status?: AgentTaskStatus[]; kind?: string[] } = {}, limit = 100) {
      const w: SQL[] = [];
      if (f.status?.length) w.push(inArray(agentTasks.status, f.status));
      if (f.kind?.length) w.push(inArray(agentTasks.kind, f.kind));
      return db.select().from(agentTasks).where(w.length ? and(...w) : undefined).orderBy(desc(agentTasks.updatedAt)).limit(limit);
    },
    /** Latest scheduled run per platform, so the governor can space new tasks after it. */
    async lastScheduled(platform: string, kind = 'apply'): Promise<Date | undefined> {
      const [r] = await db.select({ at: agentTasks.runAfter }).from(agentTasks)
        .where(and(eq(agentTasks.platform, platform), eq(agentTasks.kind, kind), inArray(agentTasks.status, ['queued', 'running', 'done'])))
        .orderBy(desc(agentTasks.runAfter)).limit(1);
      return r?.at;
    },
    async countScheduledBetween(platform: string, from: Date, to: Date, kind = 'apply'): Promise<number> {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(agentTasks)
        .where(and(eq(agentTasks.platform, platform), eq(agentTasks.kind, kind),
          inArray(agentTasks.status, ['queued', 'running', 'done', 'needs_human']),
          gte(agentTasks.runAfter, from), lte(agentTasks.runAfter, to)));
      return r?.n ?? 0;
    },
    /** Tasks stuck in `running` (worker crashed) go back to the queue. */
    async releaseStale(olderThan: Date) {
      return db.update(agentTasks).set({ status: 'queued', lockedBy: null, lockedAt: null, updatedAt: new Date() })
        .where(and(eq(agentTasks.status, 'running'), lte(agentTasks.lockedAt, olderThan))).returning({ id: agentTasks.id });
    },
  };
}
