import { scoreJob, type NormalizedJob, type Seniority, type WorkMode } from '@jobhunt/core';
import type { JobRow, Repos } from '@jobhunt/db';
import { profileService } from './profile.js';

/**
 * Rebuild the minimum NormalizedJob the scorer needs from a stored row.
 * Scoring is a pure function of (job, profile, now), so this is safe and cheap
 * — no re-fetching from the board.
 */
function toNormalized(row: JobRow): NormalizedJob {
  return {
    source: row.source as NormalizedJob['source'],
    sourceId: row.sourceId,
    company: row.company,
    companySlug: row.company,
    title: row.title,
    url: row.url,
    applyUrl: row.applyUrl ?? undefined,
    locationRaw: row.locationRaw ?? '',
    descriptionText: row.descriptionText ?? '',
    postedAt: row.postedAt ?? undefined,
    updatedAt: row.updatedAt ?? undefined,
    dedupHash: row.dedupHash,
    titleNormalized: row.titleNormalized,
    companyNormalized: row.companyNormalized,
    locations: row.locations ?? [],
    workMode: (row.workMode ?? 'unknown') as WorkMode,
    seniority: (row.seniority ?? 'unknown') as Seniority,
    salaryMin: row.salaryMin ?? undefined,
    salaryMax: row.salaryMax ?? undefined,
    salaryCurrency: (row.salaryCurrency ?? undefined) as NormalizedJob['salaryCurrency'],
    salaryInrLpaEquivalent: row.salaryInrLpa ?? undefined,
    firstSeenAt: row.firstSeenAt,
  };
}

export interface RescoreResult {
  scanned: number;
  changed: number;
  tiers: Record<number, number>;
  durationMs: number;
}

export function rescoreService(repos: Repos) {
  const profiles = profileService(repos);

  return {
    /** Run after any profile change so stored jobs reflect the new weights. */
    async run(): Promise<RescoreResult> {
      const started = Date.now();
      const profile = await profiles.resolve();
      const rows = await repos.jobs.allForRescore();
      const signalByCompany = new Map((await repos.companies.list({})).map((c) => [c.id, c.signal ?? 0]));
      const now = new Date();

      const updates = [];
      const tiers: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

      for (const row of rows) {
        const signal = row.companyId ? signalByCompany.get(row.companyId) : undefined;
        const s = scoreJob(toNormalized(row), profile, now, signal);
        tiers[s.tier] = (tiers[s.tier] ?? 0) + 1;
        const unchanged =
          row.score === s.score &&
          row.tier === s.tier &&
          (row.disqualified ?? null) === (s.disqualified ?? null);
        if (unchanged) continue;
        updates.push({
          id: row.id, score: s.score, tier: s.tier,
          breakdown: s.breakdown as unknown as Record<string, number>,
          matchedSkills: s.matchedSkills, gaps: s.gaps,
          disqualified: s.disqualified ?? null,
        });
      }

      const changed = await repos.jobs.applyRescore(updates);
      await repos.events.record({
        entityType: 'jobs', action: 'rescored', actor: 'system',
        payload: { scanned: rows.length, changed },
      });

      return { scanned: rows.length, changed, tiers, durationMs: Date.now() - started };
    },
  };
}
export type RescoreService = ReturnType<typeof rescoreService>;
