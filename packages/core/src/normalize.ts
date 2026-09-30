import type { NormalizedJob, RawJob, Seniority, WorkMode } from './types.js';

const COMPANY_SUFFIXES =
  /\b(inc|llc|ltd|limited|pvt|private|plc|gmbh|corp|corporation|co|company|technologies|technology|tech|labs|solutions|services|systems|software|global|india|group|holdings)\b/g;

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,&'’`"()]/g, ' ')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITLE_NOISE =
  /\b(remote|hybrid|onsite|on-site|contract|full[- ]?time|part[- ]?time|urgent|hiring|immediate joiner|wfh|w2|c2c|m\/f\/d|f\/m\/d|all genders|\d+\+? ?yrs?|\d+\+? ?years?)\b/g;

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(/[-–—|/,]/g, ' ')
    .replace(TITLE_NOISE, ' ')
    .replace(/[^a-z0-9+# ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Technology qualifiers are decoration, not role identity. "Senior Engineer
 * (React)" and "Senior Engineer - React" are the same job; "Senior Engineer -
 * Payments" and "Senior Engineer - Growth" are not. Strip only the former.
 * Used for the dedup hash; `titleNormalized` keeps the full text for display.
 */
const TECH_QUALIFIERS = new Set([
  'react', 'reactjs', 'node', 'nodejs', 'typescript', 'javascript', 'js', 'ts',
  'angular', 'angularjs', 'vue', 'vuejs', 'next', 'nextjs', 'svelte', 'ember',
  'python', 'java', 'golang', 'go', 'ruby', 'rails', 'php', 'dotnet', 'csharp',
  'django', 'flask', 'spring', 'express', 'graphql', 'rest',
  'aws', 'gcp', 'azure', 'kubernetes', 'docker', 'mern', 'mean',
]);

export function hashTitle(title: string): string {
  return normalizeTitle(title)
    .split(' ')
    .filter((t) => t && !TECH_QUALIFIERS.has(t))
    .join(' ')
    .trim();
}

export function normalizeLocation(loc: string): string {
  return loc
    .toLowerCase()
    .replace(/\b(area|region|metropolitan|greater|district|state of)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitLocations(raw: string, all?: string[]): string[] {
  // Deliberately does NOT split on commas: "Chennai, India" and
  // "San Francisco, CA" are single locations, not two.
  const parts = all?.length ? all : raw.split(/\s*[;|]\s*|\s+\/\s+|\s+or\s+/i);
  const out = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/\s+/g, ' '));
  return out.length ? Array.from(new Set(out)) : [raw.trim()].filter(Boolean);
}

const REMOTE_RE = /\b(remote|work from home|wfh|distributed|anywhere|virtual)\b/i;
const HYBRID_RE = /\b(hybrid|flexible location|partially remote|\d\s*days?\s*(in|from)\s*office)\b/i;
const ONSITE_RE = /\b(on[- ]?site|in[- ]?office|in[- ]?person|onsite only)\b/i;

export function inferWorkMode(job: Pick<RawJob, 'locationRaw' | 'descriptionText' | 'workplaceTypeRaw' | 'title'>): WorkMode {
  const wt = job.workplaceTypeRaw?.toLowerCase();
  if (wt) {
    if (wt.includes('remote')) return 'remote';
    if (wt.includes('hybrid')) return 'hybrid';
    if (wt.includes('onsite') || wt.includes('on-site') || wt.includes('office')) return 'onsite';
  }
  // Title and location are stronger signals than a passing mention in prose.
  const strong = `${job.title} ${job.locationRaw}`;
  if (HYBRID_RE.test(strong)) return 'hybrid';
  if (REMOTE_RE.test(strong)) return 'remote';
  if (ONSITE_RE.test(strong)) return 'onsite';

  const head = job.descriptionText.slice(0, 1500);
  if (HYBRID_RE.test(head)) return 'hybrid';
  if (REMOTE_RE.test(head)) return 'remote';
  if (ONSITE_RE.test(head)) return 'onsite';
  return 'unknown';
}

export function inferSeniority(title: string, description = ''): Seniority {
  const t = title.toLowerCase();
  if (/\b(intern|internship)\b/.test(t)) return 'intern';
  if (/\b(junior|jr\.?|entry[- ]level|graduate|fresher|trainee|associate engineer)\b/.test(t)) return 'junior';
  if (/\b(staff|principal)\b/.test(t)) return 'staff';
  if (/\b(engineering manager|em|people manager|manager)\b/.test(t)) return 'manager';
  if (/\b(lead|tech lead|technical lead|team lead)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?|sde\s*(ii|iii|3|2)|iii|level 3)\b/.test(t)) return 'senior';
  if (/\b(mid|intermediate|ii|sde\s*1|level 2)\b/.test(t)) return 'mid';

  const yrs = description.match(/(\d+)\s*\+?\s*(?:-|to)?\s*(\d+)?\s*years?/i);
  if (yrs?.[1]) {
    const min = Number(yrs[1]);
    if (min >= 8) return 'staff';
    if (min >= 5) return 'senior';
    if (min >= 3) return 'mid';
    if (min >= 0) return 'junior';
  }
  return 'unknown';
}

const LPA_RE = /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:-|–|to)\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:lpa|lakhs?\s*(?:per\s*annum|p\.?a\.?)?|l\s*p\s*a)/i;
const LPA_SINGLE_RE = /(?:₹|rs\.?|inr)\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:lpa|lakhs?)/i;
const USD_RE = /\$\s?(\d{2,3}),?(\d{3})\s*(?:-|–|to)\s*\$?\s?(\d{2,3}),?(\d{3})/;

const USD_TO_INR = 88; // rough; used only to rank, never to quote

export function extractSalary(text: string): Pick<NormalizedJob, 'salaryMin' | 'salaryMax' | 'salaryCurrency' | 'salaryInrLpaEquivalent'> {
  const lpa = text.match(LPA_RE);
  if (lpa?.[1] && lpa[2]) {
    const min = Number(lpa[1]);
    const max = Number(lpa[2]);
    return { salaryMin: min, salaryMax: max, salaryCurrency: 'INR', salaryInrLpaEquivalent: (min + max) / 2 };
  }
  const usd = text.match(USD_RE);
  if (usd?.[1] && usd[2] && usd[3] && usd[4]) {
    const min = Number(`${usd[1]}${usd[2]}`);
    const max = Number(`${usd[3]}${usd[4]}`);
    if (min > 20000 && max < 1_000_000) {
      return {
        salaryMin: min,
        salaryMax: max,
        salaryCurrency: 'USD',
        salaryInrLpaEquivalent: (((min + max) / 2) * USD_TO_INR) / 100_000,
      };
    }
  }
  const single = text.match(LPA_SINGLE_RE);
  if (single?.[1]) {
    const v = Number(single[1]);
    return { salaryMin: v, salaryMax: v, salaryCurrency: 'INR', salaryInrLpaEquivalent: v };
  }
  return {};
}

/**
 * Pure deterministic 32-character hex hash, runs in Node, browser, and edge.
 */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  // Hash with a second seed to generate a full 32-char hex string
  let h3 = 0x85ebca6b ^ seed, h4 = 0xc2b2ae35 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h3 = Math.imul(h3 ^ ch, 2246822507);
    h4 = Math.imul(h4 ^ ch, 3266489909);
  }
  const part3 = (h3 >>> 0).toString(16).padStart(8, '0');
  const part4 = (h4 >>> 0).toString(16).padStart(8, '0');
  return `${part1}${part2}${part3}${part4}`;
}

/**
 * Stable identity for a posting across boards. Company + title + primary
 * location, all normalized. Same role on LinkedIn, Naukri and the company's
 * own Greenhouse board collapses to one hash.
 */
export function dedupHash(company: string, title: string, primaryLocation: string): string {
  const key = [normalizeCompany(company), hashTitle(title), normalizeLocation(primaryLocation)].join('::');
  return cyrb53(key);
}

export function normalizeJob(raw: RawJob, now = new Date()): NormalizedJob {
  const locations = splitLocations(raw.locationRaw, raw.allLocations);
  const primary = locations[0] ?? '';
  const salaryText = `${raw.compensationRaw ?? ''} ${raw.title} ${raw.descriptionText.slice(0, 4000)}`;
  return {
    ...raw,
    locations,
    titleNormalized: normalizeTitle(raw.title),
    companyNormalized: normalizeCompany(raw.company),
    dedupHash: dedupHash(raw.company, raw.title, primary),
    workMode: inferWorkMode(raw),
    seniority: inferSeniority(raw.title, raw.descriptionText),
    ...extractSalary(salaryText),
    firstSeenAt: now,
  };
}
