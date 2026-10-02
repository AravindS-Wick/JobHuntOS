import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { events } from '../schema.js';

export type EventRow = typeof events.$inferSelect;

export interface NewEvent {
  entityType: string;
  entityId?: string | null;
  action: string;
  actor?: 'agent' | 'user' | 'system';
  payload?: unknown;
  screenshotPath?: string | null;
}

/**
 * The audit log. Every state change worth explaining later goes here. Phase 3+
 * attaches a screenshot path so a failed application can be inspected.
 */
export function eventsRepo(db: Db) {
  return {
    async record(e: NewEvent): Promise<EventRow> {
      const [row] = await db.insert(events).values({
        entityType: e.entityType,
        entityId: e.entityId ?? null,
        action: e.action,
        actor: e.actor ?? 'agent',
        payload: (e.payload ?? null) as never,
        screenshotPath: e.screenshotPath ?? null,
      }).returning();
      return row!;
    },
    async list(filter: { entityType?: string; entityId?: string } = {}, limit = 100): Promise<EventRow[]> {
      const w = [];
      if (filter.entityType) w.push(eq(events.entityType, filter.entityType));
      if (filter.entityId) w.push(eq(events.entityId, filter.entityId));
      return db.select().from(events).where(w.length ? and(...w) : undefined)
        .orderBy(desc(events.createdAt)).limit(limit);
    },
  };
}
export type EventsRepo = ReturnType<typeof eventsRepo>;
