import {
  DEFAULT_FACTS,
  resolveScreeningQuestion,
  type Fact,
  type QuestionResolution,
} from '@jobhunt/core';
import type { Repos } from '@jobhunt/db';

export function factsService(repos: Repos) {
  return {
    async list(category?: string): Promise<Fact[]> {
      const stored = await repos.facts.list(category);
      if (stored.length === 0) {
        // Seed default facts on first access
        await repos.facts.seedDefaults(DEFAULT_FACTS);
        return repos.facts.list(category);
      }
      return stored;
    },

    async getByKey(key: string): Promise<Fact | undefined> {
      return repos.facts.getByKey(key);
    },

    async upsert(fact: Fact): Promise<Fact> {
      const updated = await repos.facts.upsert(fact);
      await repos.events.record({
        entityType: 'fact',
        entityId: fact.key,
        action: 'upsert',
        actor: 'user',
        payload: { key: fact.key, value: fact.value },
      });
      return updated;
    },

    async resolve(question: string, options?: string[]): Promise<QuestionResolution> {
      const stored = await this.list();
      const factMap = Object.fromEntries(stored.map((f) => [f.key, f]));

      const resolution = resolveScreeningQuestion(question, {
        options,
        facts: factMap,
      });

      return resolution;
    },
  };
}

export type FactsService = ReturnType<typeof factsService>;
