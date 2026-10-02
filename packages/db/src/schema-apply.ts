import {
  boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { jobs } from './schema.js';

/**
 * Apply engine tables: master resumes, per-job tailored variants, the
 * application pipeline, and the task queue the local browser worker drains.
 */

/** A master resume as uploaded, plus its parsed structure (ResumeDoc). */
export const resumes = pgTable('resumes', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: text('label').notNull(),
  fileName: text('file_name'),
  mimeType: text('mime_type'),
  /** Original upload on disk, relative to the data directory. */
  filePath: text('file_path'),
  rawText: text('raw_text').notNull(),
  doc: jsonb('doc').notNull(),
  isMaster: boolean('is_master').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One tailored resume per (resume, job): reordered, never embellished. */
export const resumeVariants = pgTable(
  'resume_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resumeId: uuid('resume_id').notNull().references(() => resumes.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
    doc: jsonb('doc').notNull(),
    /** What changed vs the master, for the 5-second review. */
    changes: jsonb('changes').notNull(),
    /** Truth validation result: { ok, issues[] }. A failing variant cannot be approved. */
    validation: jsonb('validation').notNull(),
    docxPath: text('docx_path'),
    pdfPath: text('pdf_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniq: uniqueIndex('resume_variants_resume_job_idx').on(t.resumeId, t.jobId) }),
);

/**
 * prepared → approved → queued → submitting → submitted
 *                     ↘ needs_human (question / CAPTCHA / login) → queued
 *                     ↘ failed | skipped | blocked (truth abort, rate cap)
 */
export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    applyUrl: text('apply_url').notNull(),
    status: text('status').notNull().default('prepared'),
    resumeVariantId: uuid('resume_variant_id').references(() => resumeVariants.id, { onDelete: 'set null' }),
    coverLetter: text('cover_letter'),
    /** Screening answers resolved against the fact table: [{ question, answer, outcome, factKey }]. */
    answers: jsonb('answers').notNull().default([]),
    /** What the worker actually typed, for the audit trail. */
    submittedFields: jsonb('submitted_fields'),
    blockedReason: text('blocked_reason'),
    lastError: text('last_error'),
    attempts: integer('attempts').notNull().default(0),
    screenshotPath: text('screenshot_path'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqJob: uniqueIndex('applications_job_idx').on(t.jobId),
    byStatus: index('applications_status_idx').on(t.status),
    byPlatformSubmitted: index('applications_platform_submitted_idx').on(t.platform, t.submittedAt),
  }),
);

/**
 * Work for the local browser worker. The API never drives a browser: it
 * queues tasks, and the worker on the user's machine claims and runs them in
 * the user's own Chrome profile (residential IP, real session).
 */
export const agentTasks = pgTable(
  'agent_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** scrape | apply */
    kind: text('kind').notNull(),
    platform: text('platform').notNull(),
    /** queued | running | done | failed | needs_human | cancelled */
    status: text('status').notNull().default('queued'),
    payload: jsonb('payload').notNull(),
    result: jsonb('result'),
    error: text('error'),
    /** What the worker needs from the human: { reason, question?, options?, screenshotPath? } */
    humanPrompt: jsonb('human_prompt'),
    applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'cascade' }),
    attempts: integer('attempts').notNull().default(0),
    /** Not before: rate governor and retry backoff push this forward. */
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lockedBy: text('locked_by'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    byStatus: index('agent_tasks_status_idx').on(t.status, t.runAfter),
    byApplication: index('agent_tasks_application_idx').on(t.applicationId),
  }),
);
