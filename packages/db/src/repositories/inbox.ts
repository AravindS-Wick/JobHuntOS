import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { inboxMessages, type EmailCategoryType } from '../schema.js';
import type { ParsedEmailMessage } from '@jobhunt/connectors';

export type InboxMessageRow = typeof inboxMessages.$inferSelect;

export interface InboxListFilter {
  category?: EmailCategoryType | string;
  linkedJobId?: string;
  actionRequired?: boolean;
  processed?: boolean;
  q?: string;
}

export interface Pagination {
  limit?: number;
  offset?: number;
}

export function inboxRepo(db: Db) {
  return {
    async upsertMany(msgs: ParsedEmailMessage[]): Promise<{ inserted: number; updated: number }> {
      if (!msgs.length) return { inserted: 0, updated: 0 };

      let inserted = 0;
      let updated = 0;

      for (const m of msgs) {
        const compNorm = m.companyMentioned?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || null;

        const res = await db
          .insert(inboxMessages)
          .values({
            messageId: m.id,
            threadId: m.threadId,
            sender: m.sender,
            senderName: m.senderName ?? null,
            recipient: m.recipient ?? null,
            subject: m.subject,
            snippet: m.snippet ?? null,
            bodyText: m.bodyText ?? null,
            category: m.category,
            companyMentioned: m.companyMentioned ?? null,
            companyNormalized: compNorm,
            jobTitleMentioned: m.jobTitleMentioned ?? null,
            assessmentUrl: m.assessmentUrl ?? null,
            interviewUrl: m.interviewUrl ?? null,
            receivedAt: m.receivedAt,
            actionRequired: m.actionRequired,
            suggestedAction: m.suggestedAction ?? null,
          })
          .onConflictDoUpdate({
            target: inboxMessages.messageId,
            set: {
              subject: m.subject,
              snippet: m.snippet ?? null,
              category: m.category,
              companyMentioned: m.companyMentioned ?? null,
              companyNormalized: compNorm,
              jobTitleMentioned: m.jobTitleMentioned ?? null,
              assessmentUrl: m.assessmentUrl ?? null,
              interviewUrl: m.interviewUrl ?? null,
              actionRequired: m.actionRequired,
              suggestedAction: m.suggestedAction ?? null,
            },
          })
          .returning();

        if (res.length) {
          inserted++;
        }
      }

      return { inserted, updated };
    },

    async list(
      filter: InboxListFilter = {},
      pagination: Pagination = { limit: 50, offset: 0 },
    ): Promise<{ items: InboxMessageRow[]; total: number }> {
      const w = [];
      if (filter.category) w.push(eq(inboxMessages.category, filter.category as EmailCategoryType));
      if (filter.linkedJobId) w.push(eq(inboxMessages.linkedJobId, filter.linkedJobId));
      if (filter.actionRequired !== undefined) w.push(eq(inboxMessages.actionRequired, filter.actionRequired));
      if (filter.processed !== undefined) w.push(eq(inboxMessages.processed, filter.processed));
      if (filter.q) {
        const pattern = `%${filter.q}%`;
        w.push(
          or(
            ilike(inboxMessages.subject, pattern),
            ilike(inboxMessages.sender, pattern),
            ilike(inboxMessages.companyMentioned, pattern),
            ilike(inboxMessages.bodyText, pattern),
          ),
        );
      }

      const whereClause = w.length ? and(...w) : undefined;

      const [items, [countRow]] = await Promise.all([
        db
          .select()
          .from(inboxMessages)
          .where(whereClause)
          .orderBy(desc(inboxMessages.receivedAt))
          .limit(pagination.limit ?? 50)
          .offset(pagination.offset ?? 0),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(inboxMessages)
          .where(whereClause),
      ]);

      return { items, total: countRow?.count ?? 0 };
    },

    async byId(id: string): Promise<InboxMessageRow | null> {
      const [row] = await db.select().from(inboxMessages).where(eq(inboxMessages.id, id)).limit(1);
      return row ?? null;
    },

    async byMessageId(messageId: string): Promise<InboxMessageRow | null> {
      const [row] = await db.select().from(inboxMessages).where(eq(inboxMessages.messageId, messageId)).limit(1);
      return row ?? null;
    },

    async update(id: string, updates: Partial<InboxMessageRow>): Promise<InboxMessageRow | null> {
      const [row] = await db
        .update(inboxMessages)
        .set(updates)
        .where(eq(inboxMessages.id, id))
        .returning();
      return row ?? null;
    },

    async linkJob(id: string, linkedJobId: string | null): Promise<InboxMessageRow | null> {
      const [row] = await db
        .update(inboxMessages)
        .set({ linkedJobId })
        .where(eq(inboxMessages.id, id))
        .returning();
      return row ?? null;
    },

    async getStats(): Promise<{
      total: number;
      byCategory: Record<string, number>;
      actionRequiredCount: number;
      processedCount: number;
    }> {
      const rows = await db.select().from(inboxMessages);
      const byCategory: Record<string, number> = {};
      let actionRequiredCount = 0;
      let processedCount = 0;

      for (const r of rows) {
        byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
        if (r.actionRequired) actionRequiredCount++;
        if (r.processed) processedCount++;
      }

      return {
        total: rows.length,
        byCategory,
        actionRequiredCount,
        processedCount,
      };
    },
  };
}

export type InboxRepo = ReturnType<typeof inboxRepo>;
