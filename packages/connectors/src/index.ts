import type { CompanyEntry, RawJob } from '@jobhunt/core';
import { fetchGreenhouse } from './greenhouse.js';
import { fetchLever } from './lever.js';
import { fetchAshby } from './ashby.js';
import { fetchWorkday } from './workday.js';
import { fetchSmartRecruiters } from './smartrecruiters.js';
import { fetchZohoRecruit } from './zohorecruit.js';

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
export * from './util.js';
export * from './workday.js';
export * from './smartrecruiters.js';
export * from './zohorecruit.js';
export * from './bigtech.js';
export * from './indiaboards.js';
export * from './startupboards.js';
export * from './boards.js';

export interface FetchResult {
  company: CompanyEntry;
  jobs: RawJob[];
  error?: string;
}

export interface FetchCompanyOptions {
  /** Boards that need one request per description (Workday, SmartRecruiters) only fetch these titles. */
  wantDetail?: (title: string) => boolean;
}

/** Dispatch to the right connector. Unsupported ATS types resolve to an empty, explained result. */
export async function fetchCompany(company: CompanyEntry, opts: FetchCompanyOptions = {}): Promise<FetchResult> {
  try {
    switch (company.ats) {
      case 'greenhouse':
        return { company, jobs: await fetchGreenhouse(company.token, company.name) };
      case 'lever':
        return { company, jobs: await fetchLever(company.token, company.name) };
      case 'ashby':
        return { company, jobs: await fetchAshby(company.token, company.name) };
      case 'workday':
        return { company, jobs: await fetchWorkday(company.token, company.name, { wantDetail: opts.wantDetail }) };
      case 'smartrecruiters':
        return { company, jobs: await fetchSmartRecruiters(company.token, company.name, { wantDetail: opts.wantDetail }) };
      case 'zohorecruit':
        return { company, jobs: await fetchZohoRecruit(company.token, company.name) };
      default:
        return { company, jobs: [], error: `no connector for ats "${company.ats}"` };
    }
  } catch (err) {
    return { company, jobs: [], error: err instanceof Error ? err.message : String(err) };
  }
}
