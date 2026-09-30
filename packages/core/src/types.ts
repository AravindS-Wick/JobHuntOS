export type AtsType = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'smartrecruiters' | 'unknown';
export type SourceType = AtsType | 'naukri' | 'linkedin' | 'indeed' | 'foundit' | 'manual';
export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export type Seniority = 'intern' | 'junior' | 'mid' | 'senior' | 'staff' | 'lead' | 'manager' | 'unknown';
export type Tier = 1 | 2 | 3 | 4;

/** What a connector returns. Deliberately close to the wire format. */
export interface RawJob {
  source: SourceType;
  /** Stable id within the source. */
  sourceId: string;
  company: string;
  companySlug: string;
  title: string;
  url: string;
  applyUrl?: string;
  locationRaw: string;
  allLocations?: string[];
  descriptionText: string;
  descriptionHtml?: string;
  postedAt?: Date;
  updatedAt?: Date;
  employmentType?: string;
  workplaceTypeRaw?: string;
  country?: string;
  compensationRaw?: string;
  department?: string;
  team?: string;
}

export interface NormalizedJob extends RawJob {
  dedupHash: string;
  titleNormalized: string;
  companyNormalized: string;
  locations: string[];
  workMode: WorkMode;
  seniority: Seniority;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: 'INR' | 'USD' | 'GBP' | 'EUR';
  /** Annualised INR-equivalent midpoint, for comparison only. */
  salaryInrLpaEquivalent?: number;
  firstSeenAt: Date;
}

export interface ScoreBreakdown {
  stackMatch: number;
  seniority: number;
  workMode: number;
  recency: number;
  compensation: number;
  titleRelevance: number;
  companySignal: number;
}

export interface ScoredJob extends NormalizedJob {
  score: number;
  tier: Tier;
  breakdown: ScoreBreakdown;
  /** Skills from the profile that the JD asks for and the candidate genuinely has. */
  matchedSkills: string[];
  /** JD requirements the candidate does NOT have. Surfaced honestly, never hidden. */
  gaps: string[];
  ghostScore: number;
  ghostReasons: string[];
  disqualified?: string;
}

export interface CompanyEntry {
  name: string;
  ats: AtsType;
  /** Board token / company slug used by the ATS API. */
  token: string;
  careersUrl?: string;
  /** Manual reputation nudge, -5..+5. */
  signal?: number;
  tags?: string[];
}
