import { and, asc, eq, sql } from 'drizzle-orm';
import { normalizeCompany, type CompanyEntry } from '@jobhunt/core';
import type { Db } from '../client.js';
import { companies } from '../schema.js';

export type CompanyRow = typeof companies.$inferSelect;

export interface CompanyFilter { enabled?: boolean; ats?: string; tag?: string }

export function companiesRepo(db: Db) {
  return {
    async list(filter: CompanyFilter = {}): Promise<CompanyRow[]> {
      const where = [];
      if (filter.enabled !== undefined) where.push(eq(companies.enabled, filter.enabled));
      if (filter.ats) where.push(eq(companies.ats, filter.ats));
      if (filter.tag) where.push(sql`${companies.tags} @> ${JSON.stringify([filter.tag])}::jsonb`);
      return db.select().from(companies).where(where.length ? and(...where) : undefined).orderBy(asc(companies.name));
    },

    async byId(id: string): Promise<CompanyRow | undefined> {
      const [row] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
      return row;
    },

    async byAtsToken(ats: string, token: string): Promise<CompanyRow | undefined> {
      const [row] = await db.select().from(companies)
        .where(and(eq(companies.ats, ats), eq(companies.token, token))).limit(1);
      return row;
    },

    /** Idempotent on (ats, token) — safe to call repeatedly from a registry sync. */
    async upsert(entry: CompanyEntry & { enabled?: boolean }): Promise<CompanyRow> {
      const [row] = await db.insert(companies).values({
        name: entry.name,
        normalizedName: normalizeCompany(entry.name),
        ats: entry.ats,
        token: entry.token,
        careersUrl: entry.careersUrl ?? null,
        signal: entry.signal ?? 0,
        tags: entry.tags ?? [],
        enabled: entry.enabled ?? true,
      }).onConflictDoUpdate({
        target: [companies.ats, companies.token],
        set: {
          name: entry.name,
          normalizedName: normalizeCompany(entry.name),
          careersUrl: entry.careersUrl ?? null,
          signal: entry.signal ?? 0,
          tags: entry.tags ?? [],
          enabled: entry.enabled ?? true,
        },
      }).returning();
      return row!;
    },

    async update(id: string, patch: Partial<CompanyRow>): Promise<CompanyRow | undefined> {
      const next: Partial<CompanyRow> = { ...patch };
      if (patch.name) next.normalizedName = normalizeCompany(patch.name);
      const [row] = await db.update(companies).set(next).where(eq(companies.id, id)).returning();
      return row;
    },

    async remove(id: string): Promise<boolean> {
      const rows = await db.delete(companies).where(eq(companies.id, id)).returning({ id: companies.id });
      return rows.length > 0;
    },

    async count(): Promise<number> {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(companies);
      return row?.n ?? 0;
    },
  };
}

export type CompaniesRepo = ReturnType<typeof companiesRepo>;
