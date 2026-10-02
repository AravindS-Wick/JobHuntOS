import pc from 'picocolors';
import type { ScoredJob } from '@jobhunt/core';

const tierColor = (t: number) =>
  t === 1 ? pc.green : t === 2 ? pc.yellow : t === 3 ? pc.blue : pc.dim;

export function ago(d?: Date): string {
  if (!d) return 'unknown';
  const h = (Date.now() - d.getTime()) / 36e5;
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function renderDigest(jobs: ScoredJob[], opts: { top?: number; showTier4?: boolean } = {}): string {
  const out: string[] = [];
  const buckets: Record<number, ScoredJob[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const j of jobs) buckets[j.tier]!.push(j);

  const caps: Record<number, number> = { 1: opts.top ?? 5, 2: 7, 3: 8, 4: 0 };
  const labels: Record<number, string> = {
    1: 'TIER 1  — apply today, with outreach',
    2: 'TIER 2  — apply if time permits',
    3: 'TIER 3  — worth a look',
    4: 'TIER 4  — filtered out',
  };

  for (const tier of [1, 2, 3] as const) {
    const list = buckets[tier]!.sort((a, b) => b.score - a.score);
    const shown = list.slice(0, caps[tier]);
    const c = tierColor(tier);
    out.push('');
    out.push(c(`${labels[tier]}  (${list.length} found, showing ${shown.length})`));
    out.push(c('─'.repeat(78)));
    if (!shown.length) { out.push(pc.dim('  nothing here today')); continue; }

    for (const j of shown) {
      const loc = j.locations.slice(0, 2).join(' / ') || '—';
      const sal = j.salaryInrLpaEquivalent ? `~${j.salaryInrLpaEquivalent.toFixed(0)} LPA eq` : 'undisclosed';
      out.push(`  ${pc.bold(String(j.score).padStart(3))}  ${pc.bold(j.title)}`);
      out.push(`       ${pc.cyan(j.company)} · ${loc} · ${j.workMode} · ${sal} · ${ago(j.postedAt ?? j.updatedAt)}`);
      if (j.matchedSkills.length) {
        out.push(`       ${pc.green('match')}  ${j.matchedSkills.slice(0, 10).join(', ')}`);
      }
      if (j.gaps.length) {
        out.push(`       ${pc.red('gaps')}   ${j.gaps.slice(0, 8).join(', ')}  ${pc.dim('(flag these honestly — never claim them)')}`);
      }
      if (j.ghostScore >= 0.3) out.push(`       ${pc.yellow('ghost?')} ${j.ghostReasons.join('; ')}`);
      out.push(`       ${pc.dim(j.url)}`);
      out.push('');
    }
  }

  if (opts.showTier4 && buckets[4]!.length) {
    out.push(pc.dim(`\nTIER 4 — ${buckets[4]!.length} filtered out`));
    for (const j of buckets[4]!.slice(0, 20)) {
      out.push(pc.dim(`  ${String(j.score).padStart(3)}  ${j.title} @ ${j.company} — ${j.disqualified ?? 'low score'}`));
    }
  }
  return out.join('\n');
}

export function renderSummary(stats: {
  companies: number; fetched: number; unique: number; duplicates: number;
  errors: { company: string; error: string }[]; tiers: Record<number, number>; ms: number;
}): string {
  const lines = [
    '',
    pc.bold('SUMMARY'),
    '─'.repeat(78),
    `  companies polled   ${stats.companies}`,
    `  postings fetched   ${stats.fetched}`,
    `  after dedup        ${stats.unique}  ${pc.dim(`(${stats.duplicates} duplicates collapsed)`)}`,
    `  tier 1 / 2 / 3     ${stats.tiers[1] ?? 0} / ${stats.tiers[2] ?? 0} / ${stats.tiers[3] ?? 0}`,
    `  elapsed            ${(stats.ms / 1000).toFixed(1)}s`,
  ];
  if (stats.errors.length) {
    lines.push('', pc.yellow(`  ${stats.errors.length} board(s) failed:`));
    for (const e of stats.errors) lines.push(pc.dim(`    ${e.company}: ${e.error}`));
  }
  return lines.join('\n');
}
