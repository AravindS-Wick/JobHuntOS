import { PROFILE, type Profile } from './profile.js';
import type { NormalizedJob, ScoreBreakdown, ScoredJob, Tier } from './types.js';

const WEIGHTS = {
  stackMatch: 40,
  seniority: 15,
  workMode: 15,
  recency: 10,
  compensation: 10,
  titleRelevance: 5,
  companySignal: 5,
} as const;

/** Word-boundary match so "go" doesn't match "google" and "java" doesn't match "javascript". */
function mentions(haystack: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${esc}([^a-z0-9+#]|$)`, 'i').test(haystack);
}

export function matchSkills(job: NormalizedJob, profile: Profile = PROFILE) {
  const hay = `${job.title} ${job.descriptionText}`.toLowerCase();
  const matched: string[] = [];
  let earned = 0;
  let possible = 0;

  for (const [skill, weight] of Object.entries(profile.skills)) {
    if (mentions(hay, skill)) {
      matched.push(skill);
      earned += weight;
    }
  }
  // Gaps are requirements the JD asks for that the candidate does not have.
  const gaps = profile.gaps.filter((g) => mentions(hay, g));
  possible = earned + gaps.length * 4;

  // Collapse near-duplicate skill aliases so "react" + "react.js" isn't double credit.
  const dedupedMatched = Array.from(
    new Set(matched.map((m) => m.replace(/\.js$|js$/, '').replace(/\s+/g, ' ').trim())),
  ).filter(Boolean);

  return { matched: dedupedMatched, gaps, earned, possible };
}

function scoreStack(earned: number, possible: number): number {
  if (possible === 0) return 0;
  // Saturating curve: strong match plateaus rather than rewarding keyword spam.
  const ratio = earned / possible;
  return Math.min(1, ratio * 1.15);
}

function scoreSeniority(job: NormalizedJob, profile: Profile): number {
  if (job.seniority === 'unknown') return 0.6;
  if (profile.acceptableSeniority.includes(job.seniority)) {
    return job.seniority === 'senior' || job.seniority === 'lead' ? 1 : 0.8;
  }
  if (job.seniority === 'staff') return 0.5;
  if (job.seniority === 'manager') return 0.2;
  return 0; // intern / junior
}

function scoreWorkMode(job: NormalizedJob, profile: Profile): number {
  const idx = profile.workModePriority.indexOf(job.workMode);
  if (job.workMode === 'unknown') return 0.5;
  if (idx === -1) return 0.3;
  const base = 1 - idx * (1 / Math.max(1, profile.workModePriority.length));
  if (job.workMode === 'onsite' || job.workMode === 'hybrid') {
    const inAcceptableCity = job.locations.some((l) =>
      profile.acceptableCities.some((c) => l.toLowerCase().includes(c)),
    );
    return inAcceptableCity ? base : 0.05;
  }
  return base;
}

function scoreRecency(job: NormalizedJob, now: Date): number {
  const ts = job.postedAt ?? job.updatedAt;
  if (!ts) return 0.5;
  const hours = (now.getTime() - ts.getTime()) / 36e5;
  if (hours <= 6) return 1;      // the window that actually converts
  if (hours <= 24) return 0.9;
  if (hours <= 72) return 0.7;
  if (hours <= 24 * 7) return 0.5;
  if (hours <= 24 * 21) return 0.3;
  return 0.1;
}

function scoreCompensation(job: NormalizedJob, profile: Profile): number {
  const lpa = job.salaryInrLpaEquivalent;
  if (lpa === undefined) return 0.5; // undisclosed is the norm in India; don't punish hard
  if (lpa >= profile.minSalaryInrLpa * 1.5) return 1;
  if (lpa >= profile.minSalaryInrLpa) return 0.85;
  if (lpa >= profile.flexSalaryInrLpa) return 0.5;
  return 0;
}

function scoreTitleRelevance(job: NormalizedJob, profile: Profile): number {
  const t = job.titleNormalized;
  if (profile.excludeTitles.some((x) => t.includes(x.trim()))) return 0;
  const hit = profile.targetTitles.find((x) => t.includes(x));
  if (!hit) return 0.2;
  return hit.startsWith('senior') || hit.includes('lead') ? 1 : 0.8;
}

export function ghostSignals(job: NormalizedJob, now: Date) {
  const reasons: string[] = [];
  let score = 0;
  const ts = job.postedAt ?? job.updatedAt;
  if (ts) {
    const days = (now.getTime() - ts.getTime()) / 864e5;
    if (days > 60) { score += 0.4; reasons.push(`open ${Math.round(days)} days`); }
    else if (days > 30) { score += 0.2; reasons.push(`open ${Math.round(days)} days`); }
  }
  if (/\b(evergreen|talent (pool|community|network)|future opening|general application|pipeline|spontaneous)\b/i.test(job.title)) {
    score += 0.5;
    reasons.push('evergreen/talent-pool posting');
  }
  if (job.descriptionText.length < 250) { score += 0.2; reasons.push('very thin description'); }
  return { ghostScore: Math.min(1, score), ghostReasons: reasons };
}

export function tierFor(score: number): Tier {
  if (score >= 70) return 1;
  if (score >= 50) return 2;
  if (score >= 30) return 3;
  return 4;
}

export function scoreJob(job: NormalizedJob, profile: Profile = PROFILE, now = new Date()): ScoredJob {
  const { matched, gaps, earned, possible } = matchSkills(job, profile);

  const norm = {
    stackMatch: scoreStack(earned, possible),
    seniority: scoreSeniority(job, profile),
    workMode: scoreWorkMode(job, profile),
    recency: scoreRecency(job, now),
    compensation: scoreCompensation(job, profile),
    titleRelevance: scoreTitleRelevance(job, profile),
    companySignal: 0.5,
  };

  const breakdown = Object.fromEntries(
    Object.entries(norm).map(([k, v]) => [k, Math.round(v * WEIGHTS[k as keyof typeof WEIGHTS] * 10) / 10]),
  ) as unknown as ScoreBreakdown;

  let score = Math.round(Object.values(breakdown).reduce((a, b) => a + b, 0));

  let disqualified: string | undefined;
  if (norm.titleRelevance === 0) disqualified = 'title excluded (wrong discipline or seniority)';
  else if (norm.seniority === 0) disqualified = 'seniority below target';
  else if (norm.compensation === 0 && job.salaryInrLpaEquivalent !== undefined) {
    disqualified = `disclosed comp below floor (${job.salaryInrLpaEquivalent.toFixed(1)} LPA equiv)`;
  } else if (norm.workMode <= 0.05) disqualified = 'onsite/hybrid outside acceptable cities';
  else if (matched.length === 0 && gaps.length >= 3) {
    disqualified = `wrong stack (0 profile matches, ${gaps.length} gap technologies)`;
  }

  if (disqualified) score = Math.min(score, 25);

  const { ghostScore, ghostReasons } = ghostSignals(job, now);
  if (ghostScore >= 0.5) score = Math.round(score * 0.7);

  return {
    ...job,
    score: Math.max(0, Math.min(100, score)),
    tier: tierFor(Math.max(0, Math.min(100, score))),
    breakdown,
    matchedSkills: matched,
    gaps,
    ghostScore,
    ghostReasons,
    disqualified,
  };
}
