import {
  boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    ats: text('ats').notNull(),
    token: text('token').notNull(),
    careersUrl: text('careers_url'),
    signal: integer('signal').default(0),
    tags: jsonb('tags').$type<string[]>().default([]),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqAts: uniqueIndex('companies_ats_token_idx').on(t.ats, t.token) }),
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dedupHash: text('dedup_hash').notNull(),
    companyId: uuid('company_id').references(() => companies.id),
    source: text('source').notNull(),
    sourceId: text('source_id').notNull(),
    company: text('company').notNull(),
    companyNormalized: text('company_normalized').notNull(),
    title: text('title').notNull(),
    titleNormalized: text('title_normalized').notNull(),
    url: text('url').notNull(),
    applyUrl: text('apply_url'),
    locationRaw: text('location_raw'),
    locations: jsonb('locations').$type<string[]>().default([]),
    workMode: text('work_mode'),
    seniority: text('seniority'),
    descriptionText: text('description_text'),
    salaryMin: real('salary_min'),
    salaryMax: real('salary_max'),
    salaryCurrency: text('salary_currency'),
    salaryInrLpa: real('salary_inr_lpa'),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),

    score: integer('score'),
    tier: integer('tier'),
    breakdown: jsonb('breakdown').$type<Record<string, number>>(),
    matchedSkills: jsonb('matched_skills').$type<string[]>().default([]),
    /** JD requirements the candidate does NOT have. Never hidden, never claimed. */
    gaps: jsonb('gaps').$type<string[]>().default([]),
    ghostScore: real('ghost_score').default(0),
    ghostReasons: jsonb('ghost_reasons').$type<string[]>().default([]),
    disqualified: text('disqualified'),
    seenOn: jsonb('seen_on').$type<string[]>().default([]),

    // to_apply | queued | applied | skipped | expired
    status: text('status').notNull().default('to_apply'),
  },
  (t) => ({
    uniqHash: uniqueIndex('jobs_dedup_hash_idx').on(t.dedupHash),
    byTier: index('jobs_tier_idx').on(t.tier),
    byStatus: index('jobs_status_idx').on(t.status),
    byFirstSeen: index('jobs_first_seen_idx').on(t.firstSeenAt),
  }),
);

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  module: text('module').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').notNull().default('running'),
  stats: jsonb('stats').$type<Record<string, unknown>>(),
  error: text('error'),
});

/**
 * Singleton key/value store for anything the UI can tune at runtime — most
 * importantly the profile overrides that are merged over the code default in
 * packages/core/src/profile.ts. Code stays the source of truth for shape;
 * this stores the deltas.
 */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Audit log. Every agent action, with a reason. Phase 3+ attaches screenshots. */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    action: text('action').notNull(),
    actor: text('actor').notNull().default('agent'),
    payload: jsonb('payload'),
    screenshotPath: text('screenshot_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byEntity: index('events_entity_idx').on(t.entityType, t.entityId) }),
);

export type EmailCategoryType =
  | 'interview_invite'
  | 'assessment_link'
  | 'application_ack'
  | 'rejection'
  | 'recruiter_outreach'
  | 'offer'
  | 'other';

/** Gmail / Email communication records and auto-classification */
export const inboxMessages = pgTable(
  'inbox_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id').notNull(),
    threadId: text('thread_id').notNull(),
    sender: text('sender').notNull(),
    senderName: text('sender_name'),
    recipient: text('recipient'),
    subject: text('subject').notNull(),
    snippet: text('snippet'),
    bodyText: text('body_text'),
    category: text('category').$type<EmailCategoryType>().notNull().default('other'),
    companyMentioned: text('company_mentioned'),
    companyNormalized: text('company_normalized'),
    jobTitleMentioned: text('job_title_mentioned'),
    assessmentUrl: text('assessment_url'),
    interviewUrl: text('interview_url'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    linkedJobId: uuid('linked_job_id').references(() => jobs.id),
    actionRequired: boolean('action_required').notNull().default(false),
    suggestedAction: text('suggested_action'),
    draftReply: text('draft_reply'),
    processed: boolean('processed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqMsg: uniqueIndex('inbox_msg_id_idx').on(t.messageId),
    byThread: index('inbox_thread_idx').on(t.threadId),
    byCategory: index('inbox_category_idx').on(t.category),
    byReceived: index('inbox_received_idx').on(t.receivedAt),
    byLinkedJob: index('inbox_linked_job_idx').on(t.linkedJobId),
  }),
);

