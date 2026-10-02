import { z } from 'zod';
import { PageQuery } from './schemas.js';

const csv = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v), z.array(item));

// ---------------------------------------------------------------- resume ----

export const ResumeDoc = z.object({
  name: z.string(),
  headline: z.string().optional(),
  contact: z.object({
    email: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    links: z.array(z.string()),
  }),
  summary: z.string().optional(),
  skills: z.array(z.object({ group: z.string().optional(), items: z.array(z.string()) })),
  experience: z.array(z.object({
    company: z.string(), title: z.string(), location: z.string().optional(),
    start: z.string().optional(), end: z.string().optional(), bullets: z.array(z.string()),
  })),
  projects: z.array(z.object({ name: z.string(), tech: z.array(z.string()), bullets: z.array(z.string()), link: z.string().optional() })),
  education: z.array(z.object({
    institution: z.string(), degree: z.string().optional(), start: z.string().optional(), end: z.string().optional(), details: z.string().optional(),
  })),
  certifications: z.array(z.string()),
});

export const Resume = z.object({
  id: z.string(),
  label: z.string(),
  fileName: z.string().nullable(),
  isMaster: z.boolean(),
  doc: ResumeDoc,
  /** Fields still missing before this resume can drive applications. */
  readiness: z.object({ ready: z.boolean(), missing: z.array(z.string()) }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ResumeImportRequest = z.object({
  fileName: z.string().regex(/\.(pdf|docx|txt|md|json)$/i, 'PDF, DOCX, TXT or JSON Resume'),
  /** File contents, base64-encoded. */
  dataBase64: z.string().min(1),
  label: z.string().optional(),
  makeMaster: z.boolean().optional(),
});

// ---------------------------------------------------------- applications ----

export const ApplicationStatus = z.enum([
  'prepared', 'approved', 'queued', 'submitting', 'submitted', 'needs_human', 'failed', 'skipped', 'blocked', 'manual',
]);

export const FormAnswer = z.object({
  question: z.string(),
  name: z.string().optional(),
  outcome: z.enum(['answer', 'ask', 'abort']),
  formattedAnswer: z.string(),
  answer: z.unknown().optional(),
  key: z.string().optional(),
  confidence: z.number(),
  reason: z.string(),
  attach: z.enum(['resume', 'cover_letter']).optional(),
}).passthrough();

export const TailorChange = z.object({
  kind: z.string(), section: z.string(), detail: z.string(), before: z.string().optional(), after: z.string().optional(),
});

export const ApplicationItem = z.object({
  application: z.object({
    id: z.string(),
    jobId: z.string(),
    platform: z.string(),
    applyUrl: z.string(),
    status: z.string(),
    coverLetter: z.string().nullable(),
    answers: z.array(FormAnswer),
    blockedReason: z.string().nullable(),
    lastError: z.string().nullable(),
    attempts: z.number(),
    screenshotPath: z.string().nullable(),
    approvedAt: z.date().nullable(),
    submittedAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  }),
  job: z.object({
    id: z.string(), title: z.string(), company: z.string(), url: z.string(), source: z.string(),
    score: z.number().nullable(), tier: z.number().nullable(),
    gaps: z.array(z.string()).nullable(), matchedSkills: z.array(z.string()).nullable(),
    locationRaw: z.string().nullable(), workMode: z.string().nullable(),
  }),
  variant: z.object({
    id: z.string(),
    changes: z.object({ changes: z.array(TailorChange), matched: z.array(z.string()), gaps: z.array(z.string()), notOnResume: z.array(z.string()).default([]) }),
    validation: z.object({ ok: z.boolean(), issues: z.array(z.string()) }),
    pdfPath: z.string().nullable(),
    docxPath: z.string().nullable(),
  }).optional(),
});

export const ApplicationListQuery = PageQuery.extend({
  status: csv(ApplicationStatus).optional(),
  platform: csv(z.string()).optional(),
});

export const ApplicationListResponse = z.object({
  items: z.array(ApplicationItem), total: z.number(), limit: z.number(), offset: z.number(),
});

export const PrepareRequest = z.object({
  jobIds: z.array(z.string()).max(100).optional(),
  auto: z.object({
    tiers: z.array(z.number().int().min(1).max(4)).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    minScore: z.number().optional(),
  }).optional(),
}).refine((b) => b.jobIds?.length || b.auto, { message: 'pass jobIds or auto' });

export const PrepareResponse = z.object({
  prepared: z.number(), blocked: z.number(), manual: z.number(), needsAnswers: z.number(),
  items: z.array(z.object({ jobId: z.string(), applicationId: z.string().optional(), status: z.string(), reason: z.string().optional() })),
});

export const IdsRequest = z.object({ ids: z.array(z.string()).min(1).max(200) });

export const ApproveResponse = z.object({
  approved: z.number(),
  scheduled: z.array(z.object({ id: z.string(), platform: z.string(), runAfter: z.string() })),
});

const FactKey = z.string().regex(/^[a-z0-9_]{3,60}$/, 'lowercase_snake_case');

export const AnswerRequest = z.object({
  question: z.string().min(1),
  answer: z.string(),
  /** Remember this as a verified fact so the question is never asked again. */
  saveAsFact: z.object({ key: FactKey, label: z.string().optional() }).optional(),
});

export const UsageResponse = z.record(z.string(), z.object({ used: z.number(), cap: z.number() }));

// ----------------------------------------------------------------- agent ----

export const AgentTask = z.object({
  id: z.string(),
  kind: z.string(),
  platform: z.string(),
  status: z.string(),
  payload: z.unknown(),
  result: z.unknown().nullable(),
  error: z.string().nullable(),
  humanPrompt: z.object({
    reason: z.string(), question: z.string().optional(), options: z.array(z.string()).optional(), screenshotPath: z.string().optional(),
  }).nullable(),
  applicationId: z.string().nullable(),
  attempts: z.number(),
  runAfter: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  finishedAt: z.date().nullable(),
});

export const AgentTaskListQuery = z.object({
  status: csv(z.enum(['queued', 'running', 'done', 'failed', 'needs_human', 'cancelled'])).optional(),
  kind: csv(z.enum(['scrape', 'apply'])).optional(),
});

export const ClaimRequest = z.object({
  workerId: z.string().min(1).max(100),
  kinds: z.array(z.enum(['scrape', 'apply'])).optional(),
});

/** The bundle is large and worker-internal; it is validated by the worker, not re-described here. */
export const ClaimResponse = z.object({
  task: z.union([
    z.object({ kind: z.literal('apply'), bundle: z.record(z.string(), z.unknown()) }),
    z.object({ kind: z.literal('scrape'), bundle: z.record(z.string(), z.unknown()) }),
  ]).nullable(),
});

const RawJobIn = z.object({
  source: z.string(), sourceId: z.string(), company: z.string(), companySlug: z.string(), title: z.string(),
  url: z.string(), applyUrl: z.string().optional(), locationRaw: z.string(), allLocations: z.array(z.string()).optional(),
  descriptionText: z.string(), postedAt: z.coerce.date().optional(), compensationRaw: z.string().optional(),
  workplaceTypeRaw: z.string().optional(), employmentType: z.string().optional(),
});

export const TaskReport = z.discriminatedUnion('status', [
  z.object({ status: z.literal('submitted'), fields: z.record(z.string(), z.string()).optional(), screenshotPath: z.string().optional(), confirmation: z.string().optional() }),
  z.object({ status: z.literal('scraped'), jobs: z.array(RawJobIn).max(500) }),
  z.object({ status: z.literal('needs_human'), reason: z.string(), question: z.string().optional(), options: z.array(z.string()).optional(), screenshotPath: z.string().optional() }),
  z.object({ status: z.literal('failed'), error: z.string(), retryable: z.boolean().optional(), screenshotPath: z.string().optional() }),
]);

export const HumanResolution = z.object({
  question: z.string().optional(),
  answer: z.string().optional(),
  saveAsFact: z.object({ key: FactKey, label: z.string().optional() }).optional(),
});

// ---------------------------------------------------------------- boards ----

export const BoardInfo = z.object({
  id: z.string(), name: z.string(), mode: z.enum(['direct', 'browser']), apply: z.enum(['supported', 'beta', 'external']), note: z.string().optional(),
});

export const SearchConfigSchema = z.object({
  keywords: z.array(z.string().min(2)).min(1).max(10),
  locations: z.array(z.string()).max(6),
  boards: z.array(z.string()).min(1),
  limitPerQuery: z.number().int().min(5).max(100),
});

export const BoardRunRequest = z.object({ boards: z.array(z.string()).optional() });

export const BoardRunResponse = z.object({
  boards: z.array(z.object({ board: z.string(), mode: z.enum(['direct', 'browser']), fetched: z.number(), queued: z.number(), errors: z.array(z.string()) })),
  received: z.number(), inserted: z.number(), updated: z.number(), queuedForBrowser: z.number(),
});
