import { desc, eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { runs } from '../schema.js';

export type RunRow = typeof runs.$inferSelect;
export type RunStatus = 'running' | 'succeeded' | 'failed';

export function runsRepo(db: Db) {
  return {
    async start(module: string): Promise<RunRow> {
      const [row] = await db.insert(runs).values({ module, status: 'running' }).returning();
      return row!;
    },
    async finish(id: string, status: RunStatus, stats?: Record<string, unknown>, error?: string): Promise<RunRow | undefined> {
      const [row] = await db.update(runs)
        .set({ status, stats: stats ?? null, error: error ?? null, finishedAt: new Date() })
        .where(eq(runs.id, id)).returning();
      return row;
    },
    async byId(id: string): Promise<RunRow | undefined> {
      const [row] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
      return row;
    },
    async list(limit = 20): Promise<RunRow[]> {
      return db.select().from(runs).orderBy(desc(runs.startedAt)).limit(limit);
    },
    async latest(module: string): Promise<RunRow | undefined> {
      const [row] = await db.select().from(runs).where(eq(runs.module, module)).orderBy(desc(runs.startedAt)).limit(1);
      return row;
    },
  };
}
export type RunsRepo = ReturnType<typeof runsRepo>;
