import { z } from 'zod';
import type { FormQuestion, RawJob } from '@jobhunt/core';
import { getJson } from './http.js';
import { htmlToText } from './html.js';

/** Verified against https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true */
const GhJob = z.object({
  id: z.number(),
  internal_job_id: z.number().optional(),
  title: z.string(),
  company_name: z.string().optional(),
  absolute_url: z.string(),
  location: z.object({ name: z.string() }).nullish(),
  requisition_id: z.string().nullish(),
  updated_at: z.string().nullish(),
  first_published: z.string().nullish(),
  content: z.string().nullish(),
  departments: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  offices: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  metadata: z.unknown().nullish(),
});

const GhResponse = z.object({ jobs: z.array(GhJob) });

export const greenhouseBoardUrl = (token: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;

/** Pure parse step — kept separate from IO so it can be unit-tested against fixtures. */
export function parseGreenhouse(payload: unknown, token: string, companyName?: string): RawJob[] {
  const data = GhResponse.parse(payload);

  return data.jobs.map((j): RawJob => {
    const offices = (j.offices ?? []).map((o) => o.name).filter((n) => n && n !== 'No Office');
    const locationRaw = j.location?.name ?? offices[0] ?? '';
    return {
      source: 'greenhouse',
      sourceId: String(j.id),
      company: companyName ?? j.company_name ?? token,
      companySlug: token,
      title: j.title,
      url: j.absolute_url,
      applyUrl: j.absolute_url,
      locationRaw,
      allLocations: offices.length > 1 ? offices : undefined,
      descriptionText: htmlToText(j.content ?? ''),
      descriptionHtml: j.content ?? undefined,
      postedAt: j.first_published ? new Date(j.first_published) : undefined,
      updatedAt: j.updated_at ? new Date(j.updated_at) : undefined,
      department: j.departments?.[0]?.name,
    };
  });
}

// ------------------------------------------------- application questions ----

const GhField = z.object({
  name: z.string(),
  type: z.string(),
  values: z.array(z.object({ label: z.string(), value: z.union([z.string(), z.number()]) })).optional(),
});
const GhQuestion = z.object({ label: z.string(), required: z.boolean().nullish(), fields: z.array(GhField) });
const GhQuestions = z.object({
  questions: z.array(GhQuestion).default([]),
  location_questions: z.array(GhQuestion).nullish(),
});

const GH_TYPES: Record<string, FormQuestion['type']> = {
  input_text: 'text', textarea: 'textarea', input_file: 'file', input_hidden: 'hidden',
  multi_value_single_select: 'select', multi_value_multi_select: 'multiselect',
};

export const greenhouseQuestionsUrl = (token: string, jobId: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${jobId}?questions=true`;

/**
 * Greenhouse publishes each job's application form. Reading it up front lets
 * screening answers be resolved and reviewed before approval, not mid-submit.
 */
export function parseGreenhouseQuestions(payload: unknown): FormQuestion[] {
  const d = GhQuestions.parse(payload);
  return [...d.questions, ...(d.location_questions ?? [])].flatMap((q) => {
    // A question with a file field and a textarea fallback is one question: prefer the file.
    const field = q.fields.find((f) => f.type === 'input_file') ?? q.fields[0];
    if (!field) return [];
    return [{
      label: q.label.trim(),
      name: field.name,
      type: GH_TYPES[field.type] ?? 'text',
      options: field.values?.map((v) => v.label),
      required: Boolean(q.required),
    }];
  });
}

export async function fetchGreenhouseQuestions(token: string, jobId: string): Promise<FormQuestion[]> {
  return parseGreenhouseQuestions(await getJson(greenhouseQuestionsUrl(token, jobId)));
}

export async function fetchGreenhouse(token: string, companyName?: string): Promise<RawJob[]> {
  return parseGreenhouse(await getJson(greenhouseBoardUrl(token)), token, companyName);
}
