import { z } from 'zod';
import type { RawJob } from '@jobhunt/core';
import { mentions } from '@jobhunt/core';
import { getJson, getText } from './http.js';
import { decodeEntities, htmlToText } from './html.js';
import { parseRelativeAge, slugify, toDate } from './util.js';
import type { BoardQuery } from './boards.js';

/** Keep items whose text mentions any query keyword. For feeds with no server-side search. */
function matchesQuery(text: string, q: BoardQuery): boolean {
  const words = q.keywords.toLowerCase().split(/[,\s]+/).filter((w) => w.length > 2 && !STOP.has(w));
  return words.length === 0 || words.some((w) => mentions(text.toLowerCase(), w));
}
const STOP = new Set(['developer', 'engineer', 'senior', 'software', 'the', 'and', 'lead']);

/** "$225K - $255K" → "$225,000 - $255,000" so the core salary parser can read it. */
function expandK(s: string | null | undefined): string | undefined {
  if (!s) return undefined;
  return s.replace(/\$(\d+(?:\.\d+)?)K/gi, (_, n) => `$${Math.round(Number(n) * 1000).toLocaleString('en-US')}`);
}

// ------------------------------------------------------- YC (WaaS) ----
// ycombinator.com/jobs/role/... renders an Inertia `data-page` JSON blob.

const YcJob = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  applyUrl: z.string().nullish(),
  location: z.string().nullish(),
  type: z.string().nullish(),
  roleSpecificType: z.string().nullish(),
  salaryRange: z.string().nullish(),
  minExperience: z.string().nullish(),
  visa: z.string().nullish(),
  skills: z.array(z.union([z.string(), z.object({ name: z.string() })])).nullish(),
  companyName: z.string(),
  companyBatchName: z.string().nullish(),
  companyOneLiner: z.string().nullish(),
  createdAt: z.string().nullish(),
});

export const ycSearchUrl = (q: BoardQuery) => {
  const role = /front|react|ui/i.test(q.keywords) ? 'software-engineer/frontend'
    : /back|node|api/i.test(q.keywords) ? 'software-engineer/backend'
      : /full/i.test(q.keywords) ? 'software-engineer/full-stack' : 'software-engineer';
  const remote = /remote/i.test(q.location ?? '') ? '/remote' : '';
  return `https://www.ycombinator.com/jobs/role/${role}${remote}`;
};

export function parseYcJobs(html: string, now = new Date()): RawJob[] {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m?.[1]) return [];
  const page = JSON.parse(decodeEntities(m[1])) as { props?: { jobPostings?: unknown } };
  const jobs = z.array(YcJob).parse(page.props?.jobPostings ?? []);
  return jobs.map((j): RawJob => {
    const url = `https://www.ycombinator.com${j.url}`;
    const skills = (j.skills ?? []).map((s) => (typeof s === 'string' ? s : s.name));
    return {
      source: 'yc',
      sourceId: String(j.id),
      company: j.companyName,
      companySlug: slugify(j.companyName),
      title: j.title,
      url,
      applyUrl: url,
      locationRaw: j.location ?? '',
      descriptionText: [
        j.companyOneLiner && `${j.companyName} (YC ${j.companyBatchName ?? ''}): ${j.companyOneLiner}`,
        j.roleSpecificType && `Role: ${j.roleSpecificType}`,
        j.minExperience && `Experience: ${j.minExperience}`,
        j.visa && `Visa: ${j.visa}`,
        skills.length > 0 && `Skills: ${skills.join(', ')}`,
      ].filter(Boolean).join('\n'),
      compensationRaw: expandK(j.salaryRange),
      employmentType: j.type ?? undefined,
      postedAt: parseRelativeAge(j.createdAt ? `${j.createdAt} ago` : undefined, now),
    };
  });
}

export async function fetchYc(q: BoardQuery): Promise<RawJob[]> {
  return parseYcJobs(await getText(ycSearchUrl(q), { browserUa: true })).slice(0, q.limit ?? 50);
}

// ------------------------------------------- HN "Who is hiring?" ----
// Monthly thread by `whoishiring`. Each top-level comment is one company post,
// first line conventionally "Company | Role | Location | ...".

const HnComment = z.object({
  id: z.number(),
  author: z.string().nullish(),
  created_at: z.string().nullish(),
  text: z.string().nullish(),
});
const HnItem = z.object({ id: z.number(), title: z.string().nullish(), children: z.array(HnComment) });

export const hnLatestThreadUrl =
  'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5';
export const hnItemUrl = (id: number | string) => `https://hn.algolia.com/api/v1/items/${id}`;

const ROLE_RE = /\b(engineer|developer|swe|sde|programmer|architect|full[- ]?stack|front[- ]?end|back[- ]?end)\b/i;
const LOC_RE = /\b(remote|onsite|on-site|hybrid|india|bangalore|bengaluru|chennai|hyderabad|usa?|uk|europe|eu|[A-Z][a-z]+,\s*[A-Z]{2})\b/i;

export function parseHnWhoIsHiring(payload: unknown, q?: BoardQuery): RawJob[] {
  const item = HnItem.parse(payload);
  return item.children.flatMap((c): RawJob[] => {
    if (!c.text) return [];
    const text = htmlToText(c.text);
    const firstLine = decodeEntities(c.text.split(/<p>/i)[0] ?? '').replace(/<[^>]+>/g, '').trim();
    const parts = firstLine.split(/\s+[|•—–]\s+|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return [];
    if (q && !matchesQuery(text, q)) return [];

    const company = parts[0]!.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    const title = parts.find((p, i) => i > 0 && ROLE_RE.test(p)) ?? 'Software Engineer';
    const location = parts.find((p, i) => i > 0 && p !== title && LOC_RE.test(p)) ?? '';
    const url = `https://news.ycombinator.com/item?id=${c.id}`;
    return [{
      source: 'hn',
      sourceId: String(c.id),
      company,
      companySlug: slugify(company),
      title,
      url,
      applyUrl: url,
      locationRaw: location,
      descriptionText: text,
      postedAt: toDate(c.created_at),
    }];
  });
}

export async function fetchHnWhoIsHiring(q: BoardQuery): Promise<RawJob[]> {
  const threads = await getJson<{ hits: { objectID: string; title: string }[] }>(hnLatestThreadUrl);
  const thread = threads.hits.find((h) => /who is hiring/i.test(h.title));
  if (!thread) return [];
  return parseHnWhoIsHiring(await getJson(hnItemUrl(thread.objectID)), q).slice(0, q.limit ?? 100);
}

// --------------------------------------------------------------- RemoteOK ----
// Public API; terms require linking back to RemoteOK, which `url` does.

const RoJob = z.object({
  id: z.union([z.string(), z.number()]),
  company: z.string().nullish(),
  position: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  location: z.string().nullish(),
  description: z.string().nullish(),
  date: z.string().nullish(),
  salary_min: z.number().nullish(),
  salary_max: z.number().nullish(),
  url: z.string().nullish(),
  apply_url: z.string().nullish(),
});

export const remoteOkUrl = 'https://remoteok.com/api';

export function parseRemoteOk(payload: unknown, q?: BoardQuery): RawJob[] {
  const rows = z.array(z.unknown()).parse(payload).slice(1); // first element is the legal notice
  return rows.flatMap((row): RawJob[] => {
    const r = RoJob.safeParse(row);
    if (!r.success || !r.data.position || !r.data.company || !r.data.url) return [];
    const j = r.data;
    const text = `${j.position} ${(j.tags ?? []).join(' ')} ${htmlToText(j.description ?? '')}`;
    if (q && !matchesQuery(text, q)) return [];
    return [{
      source: 'remoteok',
      sourceId: String(j.id),
      company: j.company!,
      companySlug: slugify(j.company!),
      title: j.position!,
      url: j.url!,
      applyUrl: j.apply_url ?? j.url!,
      locationRaw: j.location || 'Remote',
      workplaceTypeRaw: 'remote',
      descriptionText: `Tags: ${(j.tags ?? []).join(', ')}\n${htmlToText(j.description ?? '')}`,
      compensationRaw: j.salary_min && j.salary_max
        ? `$${j.salary_min.toLocaleString('en-US')} - $${j.salary_max.toLocaleString('en-US')}`
        : undefined,
      postedAt: toDate(j.date),
    }];
  });
}

export async function fetchRemoteOk(q: BoardQuery): Promise<RawJob[]> {
  return parseRemoteOk(await getJson(remoteOkUrl, { browserUa: true }), q).slice(0, q.limit ?? 50);
}
