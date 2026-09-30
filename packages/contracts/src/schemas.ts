import { z } from 'zod';

// ---------------------------------------------------------------- shared ----
export const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

export const AtsType = z.enum(['greenhouse', 'lever', 'ashby', 'workday', 'smartrecruiters', 'unknown']);
export const WorkMode = z.enum(['remote', 'hybrid', 'onsite', 'unknown']);
export const JobStatus = z.enum(['to_apply', 'queued', 'applied', 'skipped', 'expired']);

export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Repeatable query params arrive as string | string[]; normalize to an array. */
const csv = <T extends z.ZodType>(inner: T) =>
  z.preprocess((v) => {
    if (v === undefined) return undefined;
    const arr = Array.isArray(v) ? v : String(v).split(',');
    return arr.map((s) => String(s).trim()).filter(Boolean);
  }, z.array(inner).optional());

// ------------------------------------------------------------- companies ----
export const Company = z.object({
  id: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  ats: z.string(),
  token: z.string(),
  careersUrl: z.string().nullable(),
  signal: z.number().nullable(),
  tags: z.array(z.string()).nullable(),
  enabled: z.boolean(),
  createdAt: z.date(),
});

export const CompanyCreate = z.object({
  name: z.string().min(1),
  ats: AtsType,
  token: z.string().min(1),
  careersUrl: z.string().url().optional(),
  signal: z.number().int().min(-5).max(5).optional(),
  tags: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
});

export const CompanyUpdate = CompanyCreate.partial();

export const CompanyListQuery = z.object({
  enabled: z.coerce.boolean().optional(),
  ats: AtsType.optional(),
  tag: z.string().optional(),
});

export const DetectRequest = z.object({ url: z.string().min(4) });
export const DetectResponse = z.object({
  ats: AtsType,
  token: z.string().nullable(),
  meta: z.record(z.string(), z.string()).optional(),
  note: z.string().optional(),
  /** Ready to POST to /companies once you add a name. */
  suggestion: CompanyCreate.partial().optional(),
});

export const VerifyRequest = z.object({
  /** Verify specific companies; omit to verify every registry entry. */
  companyIds: z.array(z.string()).optional(),
  includeDisabled: z.boolean().default(true),
});
export const VerifyResponse = z.object({
  results: z.array(z.object({
    companyId: z.string(),
    name: z.string(),
    ats: z.string(),
    token: z.string(),
    ok: z.boolean(),
    count: z.number(),
    error: z.string().optional(),
  })),
  summary: z.object({ working: z.number(), empty: z.number(), failed: z.number() }),
});

// ------------------------------------------------------------------ jobs ----
export const Job = z.object({
  id: z.string(),
  dedupHash: z.string(),
  companyId: z.string().nullable(),
  source: z.string(),
  sourceId: z.string(),
  company: z.string(),
  companyNormalized: z.string(),
  title: z.string(),
  titleNormalized: z.string(),
  url: z.string(),
  applyUrl: z.string().nullable(),
  locationRaw: z.string().nullable(),
  locations: z.array(z.string()).nullable(),
  workMode: z.string().nullable(),
  seniority: z.string().nullable(),
  descriptionText: z.string().nullable(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.string().nullable(),
  salaryInrLpa: z.number().nullable(),
  postedAt: z.date().nullable(),
  updatedAt: z.date().nullable(),
  firstSeenAt: z.date(),
  score: z.number().nullable(),
  tier: z.number().nullable(),
  breakdown: z.record(z.string(), z.number()).nullable(),
  matchedSkills: z.array(z.string()).nullable(),
  /** JD requirements the candidate does NOT have. Always present, never hidden. */
  gaps: z.array(z.string()).nullable(),
  ghostScore: z.number().nullable(),
  ghostReasons: z.array(z.string()).nullable(),
  disqualified: z.string().nullable(),
  seenOn: z.array(z.string()).nullable(),
  status: z.string(),
});

/** The card the approval inbox renders — everything it needs, nothing it doesn't. */
export const JobSummary = Job.omit({ descriptionText: true, companyNormalized: true, titleNormalized: true });

export const JobListQuery = PageQuery.extend({
  tier: csv(z.coerce.number().int().min(1).max(4)),
  status: csv(JobStatus),
  source: csv(z.string()),
  workMode: csv(WorkMode),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  q: z.string().optional(),
  since: z.coerce.date().optional(),
  excludeDisqualified: z.coerce.boolean().optional(),
  maxGhostScore: z.coerce.number().min(0).max(1).optional(),
  sortBy: z.enum(['score', 'postedAt', 'firstSeenAt', 'company']).default('score'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const JobListResponse = z.object({
  items: z.array(JobSummary),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export const StatusUpdate = z.object({ status: JobStatus });
export const BulkStatusUpdate = z.object({
  ids: z.array(z.string()).min(1).max(500),
  status: JobStatus,
});

// ------------------------------------------------------------------ runs ----
export const BoardResult = z.object({
  companyId: z.string(), company: z.string(), ats: z.string(), token: z.string(),
  fetched: z.number(), error: z.string().optional(),
});

export const IngestRequest = z.object({
  companyIds: z.array(z.string()).optional(),
  concurrency: z.number().int().min(1).max(10).default(4),
  maxAgeDays: z.number().int().min(1).max(365).default(45),
  dryRun: z.boolean().default(false),
});

export const IngestResponse = z.object({
  runId: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number(),
  boards: z.array(BoardResult),
  fetched: z.number(),
  afterAgeFilter: z.number(),
  unique: z.number(),
  duplicatesCollapsed: z.number(),
  inserted: z.number(),
  updated: z.number(),
  tiers: z.record(z.string(), z.number()),
  errors: z.array(z.object({ company: z.string(), error: z.string() })),
});

export const Run = z.object({
  id: z.string(),
  module: z.string(),
  startedAt: z.date(),
  finishedAt: z.date().nullable(),
  status: z.string(),
  stats: z.unknown().nullable(),
  error: z.string().nullable(),
});

// --------------------------------------------------------------- profile ----
export const ProfileResponse = z.object({
  effective: z.object({
    name: z.string(),
    homeCity: z.string(),
    acceptableCities: z.array(z.string()),
    yearsExperience: z.number(),
    skills: z.record(z.string(), z.number()),
    gaps: z.array(z.string()),
    targetTitles: z.array(z.string()),
    excludeTitles: z.array(z.string()),
    minSalaryInrLpa: z.number(),
    flexSalaryInrLpa: z.number(),
    acceptableSeniority: z.array(z.string()),
    workModePriority: z.array(z.string()),
  }),
  overrides: z.record(z.string(), z.unknown()),
});

export const RescoreResponse = z.object({
  scanned: z.number(), changed: z.number(),
  tiers: z.record(z.string(), z.number()), durationMs: z.number(),
});

// ----------------------------------------------------------------- stats ----
export const StatsResponse = z.object({
  companies: z.object({ total: z.number(), enabled: z.number() }),
  jobs: z.object({
    total: z.number(),
    byTier: z.record(z.string(), z.number()),
    byStatus: z.record(z.string(), z.number()),
    bySource: z.record(z.string(), z.number()),
  }),
  lastIngest: z.object({
    at: z.date().nullable(),
    status: z.string().nullable(),
    fetched: z.number().nullable(),
    inserted: z.number().nullable(),
  }),
});

// ---------------------------------------------------------------- events ----
export const Event = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  action: z.string(),
  actor: z.string(),
  payload: z.unknown().nullable(),
  screenshotPath: z.string().nullable(),
  createdAt: z.date(),
});

export const EventListQuery = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

// ---------------------------------------------------------------- health ----
export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number(),
  checks: z.record(z.string(), z.boolean()),
});

// ---------------------------------------------------------------- inbox -----
export const EmailCategory = z.enum([
  'interview_invite',
  'assessment_link',
  'application_ack',
  'rejection',
  'recruiter_outreach',
  'offer',
  'other',
]);

export const InboxMessage = z.object({
  id: z.string(),
  messageId: z.string(),
  threadId: z.string(),
  sender: z.string(),
  senderName: z.string().nullable(),
  recipient: z.string().nullable(),
  subject: z.string(),
  snippet: z.string().nullable(),
  bodyText: z.string().nullable(),
  category: EmailCategory,
  companyMentioned: z.string().nullable(),
  companyNormalized: z.string().nullable(),
  jobTitleMentioned: z.string().nullable(),
  assessmentUrl: z.string().nullable(),
  interviewUrl: z.string().nullable(),
  receivedAt: z.date(),
  linkedJobId: z.string().nullable(),
  actionRequired: z.boolean(),
  suggestedAction: z.string().nullable(),
  draftReply: z.string().nullable(),
  processed: z.boolean(),
  createdAt: z.date(),
});

export const InboxListQuery = PageQuery.extend({
  category: EmailCategory.optional(),
  linkedJobId: z.string().optional(),
  actionRequired: z.coerce.boolean().optional(),
  processed: z.coerce.boolean().optional(),
  q: z.string().optional(),
});

export const InboxListResponse = z.object({
  items: z.array(InboxMessage),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export const InboxSyncRequest = z.object({
  accessToken: z.string().optional(),
  query: z.string().optional(),
  maxResults: z.number().int().min(1).max(100).default(25),
});

export const InboxSyncResponse = z.object({
  synced: z.number(),
  inserted: z.number(),
  updated: z.number(),
  linkedToJobs: z.number(),
  categories: z.record(z.string(), z.number()),
  actionRequired: z.number(),
});

export const DraftReplyRequest = z.object({
  messageId: z.string(),
  instructions: z.string().optional(),
});

export const DraftReplyResponse = z.object({
  messageId: z.string(),
  draftBody: z.string(),
  subject: z.string(),
  to: z.string(),
  actionCategory: EmailCategory,
});

export const InboxStatsResponse = z.object({
  total: z.number(),
  byCategory: z.record(z.string(), z.number()),
  actionRequiredCount: z.number(),
  processedCount: z.number(),
});

// ----------------------------------------------------------- connectors -----
export const LinkedInSearchRequest = z.object({
  query: z.string().min(1),
  location: z.string().default('India'),
  limit: z.number().int().min(1).max(100).default(25),
  sessionCookie: z.string().optional(),
  apifyToken: z.string().optional(),
});

export const NaukriSearchRequest = z.object({
  query: z.string().min(1),
  location: z.string().default('Chennai, Bangalore, Remote'),
  experience: z.number().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  apifyToken: z.string().optional(),
});

export const IndeedSearchRequest = z.object({
  query: z.string().min(1),
  location: z.string().default('India'),
  country: z.enum(['in', 'us', 'uk', 'ca']).default('in'),
  limit: z.number().int().min(1).max(100).default(25),
});

export const SourceSearchResponse = z.object({
  source: z.string(),
  fetched: z.number(),
  inserted: z.number(),
  updated: z.number(),
  tiers: z.record(z.string(), z.number()),
  jobs: z.array(z.any()),
});

export const PlatformTestRequest = z.object({
  platform: z.enum(['gmail', 'linkedin', 'naukri', 'indeed', 'gemini']),
  credentials: z.record(z.string(), z.string()).optional(),
});

export const PlatformTestResponse = z.object({
  platform: z.string(),
  ok: z.boolean(),
  message: z.string(),
  latencyMs: z.number(),
  details: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Inferred types. Declared here so each name is both the schema and the type.
// `z.input` is used where the schema coerces (query strings, defaults).
// ---------------------------------------------------------------------------
export type ErrorResponse = z.infer<typeof ErrorResponse>;
export type AtsType = z.infer<typeof AtsType>;
export type WorkMode = z.infer<typeof WorkMode>;
export type JobStatus = z.infer<typeof JobStatus>;
export type PageQuery = z.input<typeof PageQuery>;
export type Company = z.infer<typeof Company>;
export type CompanyCreate = z.infer<typeof CompanyCreate>;
export type CompanyUpdate = z.infer<typeof CompanyUpdate>;
export type CompanyListQuery = z.input<typeof CompanyListQuery>;
export type DetectRequest = z.infer<typeof DetectRequest>;
export type DetectResponse = z.infer<typeof DetectResponse>;
export type VerifyRequest = z.input<typeof VerifyRequest>;
export type VerifyResponse = z.infer<typeof VerifyResponse>;
export type Job = z.infer<typeof Job>;
export type JobSummary = z.infer<typeof JobSummary>;
export type JobListQuery = z.input<typeof JobListQuery>;
export type JobListResponse = z.infer<typeof JobListResponse>;
export type StatusUpdate = z.infer<typeof StatusUpdate>;
export type BulkStatusUpdate = z.infer<typeof BulkStatusUpdate>;
export type BoardResult = z.infer<typeof BoardResult>;
export type IngestRequest = z.input<typeof IngestRequest>;
export type IngestResponse = z.infer<typeof IngestResponse>;
export type Run = z.infer<typeof Run>;
export type ProfileResponse = z.infer<typeof ProfileResponse>;
export type RescoreResponse = z.infer<typeof RescoreResponse>;
export type StatsResponse = z.infer<typeof StatsResponse>;
export type Event = z.infer<typeof Event>;
export type EventListQuery = z.input<typeof EventListQuery>;
export type HealthResponse = z.infer<typeof HealthResponse>;

export type EmailCategory = z.infer<typeof EmailCategory>;
export type InboxMessage = z.infer<typeof InboxMessage>;
export type InboxListQuery = z.input<typeof InboxListQuery>;
export type InboxListResponse = z.infer<typeof InboxListResponse>;
export type InboxSyncRequest = z.input<typeof InboxSyncRequest>;
export type InboxSyncResponse = z.infer<typeof InboxSyncResponse>;
export type DraftReplyRequest = z.infer<typeof DraftReplyRequest>;
export type DraftReplyResponse = z.infer<typeof DraftReplyResponse>;
export type InboxStatsResponse = z.infer<typeof InboxStatsResponse>;

export type LinkedInSearchRequest = z.infer<typeof LinkedInSearchRequest>;
export type NaukriSearchRequest = z.infer<typeof NaukriSearchRequest>;
export type IndeedSearchRequest = z.infer<typeof IndeedSearchRequest>;
export type SourceSearchResponse = z.infer<typeof SourceSearchResponse>;
export type PlatformTestRequest = z.infer<typeof PlatformTestRequest>;
export type PlatformTestResponse = z.infer<typeof PlatformTestResponse>;

