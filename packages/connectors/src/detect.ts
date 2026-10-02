import type { AtsType } from '@jobhunt/core';

export interface AtsDetection {
  ats: AtsType;
  token: string | null;
  /** Extra bits needed to actually query (Workday needs tenant+site+host). */
  meta?: Record<string, string>;
  note?: string;
}

/**
 * Work out which ATS a careers URL belongs to, and the board token needed to
 * query its public API. Feed this the URL you land on after clicking
 * "Careers" on a company site.
 */
export function detectAts(rawUrl: string): AtsDetection {
  let u: URL;
  try {
    u = new URL(rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`);
  } catch {
    return { ats: 'unknown', token: null, note: 'unparseable URL' };
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const segs = u.pathname.split('/').filter(Boolean);

  // --- Greenhouse ---
  // boards.greenhouse.io/{token} | job-boards.greenhouse.io/{token} | {co}.greenhouse.io
  if (host.endsWith('greenhouse.io')) {
    if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
      return { ats: 'greenhouse', token: segs[0] ?? null };
    }
    const sub = host.replace('.greenhouse.io', '');
    if (sub && sub !== 'boards' && sub !== 'my') return { ats: 'greenhouse', token: sub };
    return { ats: 'greenhouse', token: segs[0] ?? null };
  }
  // Embedded board: ?gh_jid= or /embed/job_board?for={token}
  const ghFor = u.searchParams.get('for');
  if (ghFor && u.pathname.includes('job_board')) return { ats: 'greenhouse', token: ghFor };

  // --- Lever ---
  if (host.endsWith('lever.co')) {
    if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') {
      return { ats: 'lever', token: segs[0] ?? null };
    }
    return { ats: 'lever', token: segs[0] ?? null };
  }

  // --- Ashby ---
  if (host.endsWith('ashbyhq.com')) {
    // jobs.ashbyhq.com/{token}
    return { ats: 'ashby', token: segs[0] ?? null };
  }

  // --- Workday ---
  // {tenant}.wd{n}.myworkdayjobs.com/{locale?}/{site}
  const wd = host.match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);
  if (wd) {
    // Path is /{locale?}/{site}/job/...; the site is the first non-locale segment.
    const site = segs.find((s) => !/^[a-z]{2}-[A-Z]{2}$/.test(s) && s !== 'details' && s !== 'job') ?? '';
    return {
      ats: 'workday',
      token: site ? `${wd[1]}/${wd[2]}/${site}` : null,
      meta: { tenant: wd[1] ?? '', dc: wd[2] ?? '', site, host },
      note: site ? undefined : 'Workday URL is missing the site segment (…/en-US/{site}).',
    };
  }

  // --- SmartRecruiters ---
  // careers.smartrecruiters.com/{company} | jobs.smartrecruiters.com/{company}/{id}
  if (host.endsWith('smartrecruiters.com')) {
    return { ats: 'smartrecruiters', token: segs[0] ?? null };
  }

  // --- Zoho Recruit ---
  // {co}.zohorecruit.com|in/jobs/Careers, careers.zohocorp.com/jobs/Careers
  if (/\.zohorecruit\.(com|in|eu)$/.test(host) || host === 'careers.zohocorp.com') {
    return { ats: 'zohorecruit', token: `${host}/jobs/Careers` };
  }

  return {
    ats: 'unknown',
    token: null,
    note: 'No public board API detected. Open the careers page and look for a greenhouse/lever/ashby/myworkdayjobs URL behind the job links.',
  };
}
