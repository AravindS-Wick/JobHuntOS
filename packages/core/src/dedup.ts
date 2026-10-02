import type { NormalizedJob } from './types.js';

function tokens(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter((t) => t.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Source preference when collapsing duplicates: the company's own board wins. */
const SOURCE_RANK: Record<string, number> = {
  greenhouse: 0, lever: 0, ashby: 0, workday: 1, smartrecruiters: 1, zohorecruit: 1,
  amazon: 0, microsoft: 0, google: 0,
  linkedin: 2, naukri: 2, instahyre: 2, cutshort: 2, wellfound: 2, yc: 2,
  indeed: 3, glassdoor: 3, foundit: 3, hn: 4, remoteok: 4, manual: 5, unknown: 6,
};

export interface DedupResult {
  unique: NormalizedJob[];
  duplicatesRemoved: number;
  /** dedupHash -> every source the role was seen on. */
  seenOn: Map<string, string[]>;
}

/**
 * Two passes: exact dedupHash, then fuzzy title match within the same
 * normalized company. Prefers the posting from the company's own ATS,
 * because that's where the apply flow actually works.
 */
export function dedupe(jobs: NormalizedJob[], titleSimilarity = 0.8): DedupResult {
  const byHash = new Map<string, NormalizedJob>();
  const seenOn = new Map<string, string[]>();

  for (const job of jobs) {
    const existing = byHash.get(job.dedupHash);
    const sources = seenOn.get(job.dedupHash) ?? [];
    if (!sources.includes(job.source)) sources.push(job.source);
    seenOn.set(job.dedupHash, sources);

    if (!existing) { byHash.set(job.dedupHash, job); continue; }
    const better = (SOURCE_RANK[job.source] ?? 9) < (SOURCE_RANK[existing.source] ?? 9);
    if (better) byHash.set(job.dedupHash, job);
  }

  const byCompany = new Map<string, NormalizedJob[]>();
  for (const job of byHash.values()) {
    const arr = byCompany.get(job.companyNormalized) ?? [];
    arr.push(job);
    byCompany.set(job.companyNormalized, arr);
  }

  const unique: NormalizedJob[] = [];
  for (const group of byCompany.values()) {
    const kept: { job: NormalizedJob; toks: Set<string> }[] = [];
    for (const job of group) {
      const toks = tokens(job.titleNormalized);
      const dup = kept.find((k) => jaccard(k.toks, toks) >= titleSimilarity);
      if (dup) {
        const merged = seenOn.get(dup.job.dedupHash) ?? [];
        for (const s of seenOn.get(job.dedupHash) ?? []) if (!merged.includes(s)) merged.push(s);
        seenOn.set(dup.job.dedupHash, merged);
        if ((SOURCE_RANK[job.source] ?? 9) < (SOURCE_RANK[dup.job.source] ?? 9)) dup.job = job;
        continue;
      }
      kept.push({ job, toks });
    }
    unique.push(...kept.map((k) => k.job));
  }

  return { unique, duplicatesRemoved: jobs.length - unique.length, seenOn };
}
