import { eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { facts } from '../schema.js';
import type { Fact } from '@jobhunt/core';

export function factsRepo(db: Db) {
  return {
    async list(category?: string): Promise<Fact[]> {
      const query = category
        ? db.select().from(facts).where(eq(facts.category, category))
        : db.select().from(facts);

      const rows = await query;
      return rows.map((r) => ({
        key: r.key,
        category: r.category as Fact['category'],
        label: r.label,
        value: r.value as Fact['value'],
        evidence: r.evidence ?? undefined,
        verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : new Date().toISOString(),
        notes: r.notes ?? undefined,
      }));
    },

    async getByKey(key: string): Promise<Fact | undefined> {
      const [row] = await db.select().from(facts).where(eq(facts.key, key)).limit(1);
      if (!row) return undefined;
      return {
        key: row.key,
        category: row.category as Fact['category'],
        label: row.label,
        value: row.value as Fact['value'],
        evidence: row.evidence ?? undefined,
        verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : new Date().toISOString(),
        notes: row.notes ?? undefined,
      };
    },

    async upsert(fact: Fact): Promise<Fact> {
      const verifiedAtDate = fact.verifiedAt ? new Date(fact.verifiedAt) : new Date();
      await db
        .insert(facts)
        .values({
          key: fact.key,
          category: fact.category,
          label: fact.label,
          value: fact.value as never,
          evidence: fact.evidence,
          verifiedAt: verifiedAtDate,
          notes: fact.notes,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: facts.key,
          set: {
            category: fact.category,
            label: fact.label,
            value: fact.value as never,
            evidence: fact.evidence,
            verifiedAt: verifiedAtDate,
            notes: fact.notes,
            updatedAt: new Date(),
          },
        });

      return fact;
    },

    async seedDefaults(defaultFacts: Fact[]): Promise<number> {
      let count = 0;
      for (const fact of defaultFacts) {
        await this.upsert(fact);
        count++;
      }
      return count;
    },

    async delete(key: string): Promise<boolean> {
      const rows = await db.delete(facts).where(eq(facts.key, key)).returning({ key: facts.key });
      return rows.length > 0;
    },
  };
}

export type FactsRepo = ReturnType<typeof factsRepo>;
