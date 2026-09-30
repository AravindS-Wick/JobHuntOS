import type { CompanyEntry, RawJob } from '@jobhunt/core';
import { fetchGreenhouse } from './greenhouse.js';
import { fetchLever } from './lever.js';
import { fetchAshby } from './ashby.js';

export * from './greenhouse.js';
export * from './lever.js';
export * from './ashby.js';
export * from './linkedin.js';
export * from './naukri.js';
export * from './indeed.js';
export * from './gmail.js';
export * from './detect.js';
export * from './registry.js';
export * from './http.js';
export * from './html.js';

export interface FetchResult {
  company: CompanyEntry;
  jobs: RawJob[];
  error?: string;
}

/** Dispatch to the right connector. Unsupported ATS types resolve to an empty, explained result. */
export async function fetchCompany(company: CompanyEntry): Promise<FetchResult> {
  try {
    switch (company.ats) {
      case 'greenhouse':
        return { company, jobs: await fetchGreenhouse(company.token, company.name) };
      case 'lever':
        return { company, jobs: await fetchLever(company.token, company.name) };
      case 'ashby':
        return { company, jobs: await fetchAshby(company.token, company.name) };
      case 'workday':
        return { company, jobs: [], error: 'workday connector not implemented (Phase 5 — semi-automatic)' };
      case 'smartrecruiters':
        return { company, jobs: [], error: 'smartrecruiters connector not implemented (Phase 3)' };
      default:
        return { company, jobs: [], error: `no connector for ats "${company.ats}"` };
    }
  } catch (err) {
    return { company, jobs: [], error: err instanceof Error ? err.message : String(err) };
  }
}
