import { PROFILE, type Profile } from './profile.js';
import { allSkills, resumeText, type ResumeDoc } from './resume.js';
import { mentions, mentionsTech } from './terms.js';
import { getFact, formatFactValue, type FactMap } from './facts.js';

/**
 * Deterministic resume tailoring. It may reorder, select and trim what is in
 * the master resume. It never writes a new claim: no new skill, no new bullet
 * text, no new number. An optional LLM pass may rephrase bullets, but every
 * rephrase must pass `rephraseIsSafe`, and `validateVariant` re-checks the
 * whole result before it can be approved.
 */

export type ChangeKind =
  | 'headline' | 'skills_reordered' | 'bullets_reordered' | 'bullets_trimmed'
  | 'projects_selected' | 'bullet_rephrased';

export interface TailorChange {
  kind: ChangeKind;
  section: string;
  detail: string;
  before?: string;
  after?: string;
}

export interface TailoredResume {
  doc: ResumeDoc;
  changes: TailorChange[];
  /** JD terms the candidate genuinely has (drove the ordering). */
  matched: string[];
  /** JD terms the candidate does not have (PROFILE.gaps or unknown). Shown, never added. */
  gaps: string[];
  /**
   * JD terms the profile says you have but your master resume doesn't mention.
   * Never added automatically: add them to the master resume yourself if true.
   */
  notOnResume: string[];
}

export interface TailorJob {
  title: string;
  company: string;
  descriptionText: string;
}

export interface TailorOptions {
  maxBulletsPerRole?: number;
  minBulletsPerRole?: number;
  maxProjects?: number;
  profile?: Profile;
}

const STOP = new Set(('a an and are as at be by for from has have in is it of on or our that the this to we will with you your ' +
  'team work working experience years strong ability across using build building role who what').split(' '));

/** Technology words we check for when deciding if text introduces a new claim. */
export function techVocabulary(profile: Profile = PROFILE): string[] {
  return Array.from(new Set([...Object.keys(profile.skills), ...profile.gaps, ...EXTRA_TECH]));
}
const EXTRA_TECH = [
  'vue', 'svelte', 'django', 'fastapi', 'spring', 'rails', 'laravel', 'redis', 'elasticsearch', 'mysql',
  'oracle', 'azure', 'openshift', 'ansible', 'chef', 'puppet', 'hadoop', 'spark', 'airflow', 'snowflake',
  'tensorflow', 'pytorch', 'kotlin', 'swift', 'flutter', 'react native', 'c++', 'scala', 'elixir', 'rabbitmq',
  'nats', 'grpc', 'websocket', 'webrtc', 'three.js', 'd3', 'jquery', 'bootstrap', 'figma', 'jira', 'linux',
];

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t.length > 2 && !STOP.has(t)));
}

function relevance(text: string, jdTech: string[], jdTokens: Set<string>): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const t of jdTech) if (mentionsTech(lower, t)) score += 3;
  for (const t of tokens(text)) if (jdTokens.has(t)) score += 0.5;
  if (/\d+%|\d+x|\$\d|₹\d|\d{2,}/.test(text)) score += 1; // quantified impact reads better
  return score;
}

function stableSort<T>(items: T[], key: (t: T) => number): T[] {
  return items.map((item, i) => ({ item, i, k: key(item) }))
    .sort((a, b) => b.k - a.k || a.i - b.i)
    .map((x) => x.item);
}

export function tailorResume(master: ResumeDoc, job: TailorJob, opts: TailorOptions = {}): TailoredResume {
  const profile = opts.profile ?? PROFILE;
  const { maxBulletsPerRole = 6, minBulletsPerRole = 3, maxProjects = 2 } = opts;
  const jd = `${job.title}\n${job.descriptionText}`.toLowerCase();
  const jdTokens = tokens(jd);
  const masterSkills = allSkills(master);
  const masterLower = resumeText(master).toLowerCase();

  const vocab = techVocabulary(profile);
  // "react.js" on the JD and "React" on the resume are the same skill.
  const onResume = (t: string) => mentionsTech(masterLower, t) || mentionsTech(masterLower, t.replace(/\.?js$/, ''));
  const jdTech = Array.from(new Set(vocab.filter((t) => mentionsTech(jd, t)).map((t) => (onResume(t) ? t.replace(/\.?js$/, '') || t : t))));
  const matched = jdTech.filter((t) => onResume(t) && !profile.gaps.includes(t));
  const hasSkill = (t: string) => t in profile.skills || `${t}.js` in profile.skills || `${t}js` in profile.skills;
  const notOnResume = jdTech.filter((t) => !onResume(t) && hasSkill(t) && !profile.gaps.includes(t));
  const gaps = jdTech.filter((t) => profile.gaps.includes(t) || (!onResume(t) && !hasSkill(t)));
  const changes: TailorChange[] = [];

  // Skills: matched first inside each group, groups with more matches first. Nothing added.
  const isMatched = (s: string) => matched.some((m) => mentionsTech(s.toLowerCase(), m) || mentions(m, s.toLowerCase()));
  const skills = stableSort(
    master.skills.map((g) => ({ ...g, items: stableSort(g.items, (s) => (isMatched(s) ? 1 : 0)) })),
    (g) => g.items.filter(isMatched).length,
  );
  if (JSON.stringify(skills) !== JSON.stringify(master.skills)) {
    changes.push({ kind: 'skills_reordered', section: 'skills', detail: `Moved ${masterSkills.filter(isMatched).length} JD-relevant skills to the front` });
  }

  // Experience: most relevant bullets first; trim older roles' long tails.
  const experience = master.experience.map((role) => {
    const ordered = stableSort(role.bullets, (b) => relevance(b, jdTech, jdTokens));
    const kept = ordered.slice(0, Math.max(minBulletsPerRole, maxBulletsPerRole));
    if (ordered.some((b, i) => b !== role.bullets[i])) {
      changes.push({ kind: 'bullets_reordered', section: `${role.title} @ ${role.company}`, detail: 'Most JD-relevant achievements moved to the top' });
    }
    if (kept.length < role.bullets.length) {
      changes.push({
        kind: 'bullets_trimmed', section: `${role.title} @ ${role.company}`,
        detail: `Kept ${kept.length} of ${role.bullets.length} bullets`,
        before: ordered.slice(kept.length).join(' | '),
      });
    }
    return { ...role, bullets: kept };
  });

  // Projects: the most relevant few.
  const rankedProjects = stableSort(master.projects, (p) => relevance([p.name, ...p.tech, ...p.bullets].join(' '), jdTech, jdTokens));
  const projects = rankedProjects.slice(0, maxProjects);
  if (master.projects.length > projects.length || projects.some((p, i) => p !== master.projects[i])) {
    changes.push({ kind: 'projects_selected', section: 'projects', detail: `Selected ${projects.map((p) => p.name).join(', ') || 'none'}` });
  }

  // Headline: the candidate's own title + JD skills they genuinely have (PRD C3/C4).
  const ownTitle = master.headline?.split('|')[0]?.trim() || master.experience[0]?.title || '';
  const headlineSkills = masterSkills.filter(isMatched).slice(0, 5);
  const headline = headlineSkills.length && ownTitle ? `${ownTitle} | ${headlineSkills.join(' · ')}` : master.headline;
  if (headline !== master.headline) {
    changes.push({ kind: 'headline', section: 'header', detail: 'Headline lists only JD skills present in the master resume', before: master.headline, after: headline });
  }

  return {
    doc: { ...master, headline, skills, experience, projects },
    changes,
    matched,
    gaps,
    notOnResume,
  };
}

// ------------------------------------------------------------ validation ----

/** Numbers and technology terms in `after` must already be in `before`. */
export function rephraseIsSafe(before: string, after: string, profile: Profile = PROFILE): { ok: boolean; reason?: string } {
  const nums = (s: string) => (s.match(/\d+(?:[.,]\d+)?\s*(?:%|x|k|m|\+)?/gi) ?? []).map((n) => n.replace(/\s/g, '').toLowerCase());
  const beforeNums = new Set(nums(before));
  const newNum = nums(after).find((n) => !beforeNums.has(n));
  if (newNum) return { ok: false, reason: `introduces the number "${newNum}"` };
  const b = before.toLowerCase();
  const a = after.toLowerCase();
  const newTech = techVocabulary(profile).find((t) => mentionsTech(a, t) && !mentionsTech(b, t));
  if (newTech) return { ok: false, reason: `introduces "${newTech}"` };
  if (after.length > before.length * 1.6 + 20) return { ok: false, reason: 'grew too much to be a rephrase' };
  return { ok: true };
}

export interface ValidationResult { ok: boolean; issues: string[] }

/**
 * The gate before approval. A variant fails if it contains anything the
 * master does not: a skill, a bullet (unless a safe recorded rephrase), a
 * gap technology, or different identity/contact details.
 */
export function validateVariant(variant: TailoredResume, master: ResumeDoc, profile: Profile = PROFILE): ValidationResult {
  const issues: string[] = [];
  const v = variant.doc;
  const masterSkills = new Set(allSkills(master).map((s) => s.toLowerCase()));
  for (const s of allSkills(v)) if (!masterSkills.has(s.toLowerCase())) issues.push(`skill not in master resume: "${s}"`);

  const masterBullets = new Set([
    ...master.experience.flatMap((r) => r.bullets),
    ...master.projects.flatMap((p) => p.bullets),
  ]);
  const rephrased = new Map(variant.changes.filter((c) => c.kind === 'bullet_rephrased' && c.before && c.after).map((c) => [c.after!, c.before!]));
  for (const b of [...v.experience.flatMap((r) => r.bullets), ...v.projects.flatMap((p) => p.bullets)]) {
    if (masterBullets.has(b)) continue;
    const before = rephrased.get(b);
    if (!before || !masterBullets.has(before)) { issues.push(`bullet not in master resume: "${b.slice(0, 80)}"`); continue; }
    const safe = rephraseIsSafe(before, b, profile);
    if (!safe.ok) issues.push(`unsafe rephrase (${safe.reason}): "${b.slice(0, 80)}"`);
  }

  const masterRoles = new Set(master.experience.map((r) => `${r.company}|${r.title}|${r.start}|${r.end}`));
  for (const r of v.experience) {
    if (!masterRoles.has(`${r.company}|${r.title}|${r.start}|${r.end}`)) issues.push(`role changed: ${r.title} @ ${r.company}`);
  }

  // Catches anything the checks above miss, including the headline.
  const masterLower = resumeText(master).toLowerCase();
  const variantLower = resumeText(v).toLowerCase();
  for (const t of techVocabulary(profile)) {
    if (mentionsTech(variantLower, t) && !mentionsTech(masterLower, t)) {
      issues.push(profile.gaps.includes(t) ? `gap technology claimed: "${t}"` : `technology not in master resume: "${t}"`);
    }
  }

  if (v.name !== master.name || JSON.stringify(v.contact) !== JSON.stringify(master.contact)) {
    issues.push('name or contact details differ from the master resume');
  }
  if (v.summary !== master.summary) issues.push('summary differs from the master resume');
  if (JSON.stringify(v.education) !== JSON.stringify(master.education)) issues.push('education differs from the master resume');

  return { ok: issues.length === 0, issues };
}

// ---------------------------------------------------------- cover letter ----

/**
 * Short, factual cover letter built only from master-resume bullets and
 * verified facts. Generated for Tier 1 roles or when a form requires one.
 */
export function coverLetter(master: ResumeDoc, job: TailorJob, tailored: TailoredResume, facts?: FactMap): string {
  const best = tailored.doc.experience.flatMap((r) => r.bullets.slice(0, 2).map((b) => ({ b, r }))).slice(0, 2);
  const notice = getFact('notice_period_text', facts);
  const role = master.experience[0];
  const skills = tailored.matched.slice(0, 4).join(', ');
  return [
    `Dear ${job.company} hiring team,`,
    '',
    `I'm applying for the ${job.title} role.${role ? ` I'm currently ${/^[aeiou]/i.test(role.title) ? 'an' : 'a'} ${role.title} at ${role.company}` : ''}${skills ? `, working day to day with ${skills}` : ''}.`,
    '',
    ...(best.length ? ['A couple of things I have delivered:', ...best.map(({ b }) => `- ${b.replace(/\.$/, '')}.`), ''] : []),
    `I'd welcome a conversation about how I can contribute to ${job.company}.${notice ? ` My notice period is ${formatFactValue(notice.value)}.` : ''}`,
    '',
    'Regards,',
    master.name,
    [master.contact.email, master.contact.phone].filter(Boolean).join(' · '),
  ].join('\n');
}
