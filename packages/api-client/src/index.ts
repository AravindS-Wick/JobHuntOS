import type {
  BulkStatusUpdate, Company, CompanyCreate, CompanyListQuery, CompanyUpdate,
  DetectRequest, DetectResponse, ErrorResponse, Event, EventListQuery,
  HealthResponse, IngestRequest, IngestResponse, Job, JobListQuery,
  JobListResponse, JobStatus, ProfileResponse, RescoreResponse, Run,
  StatsResponse, VerifyRequest, VerifyResponse,
} from '@jobhunt/contracts';

export class JobHuntApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'JobHuntApiError';
  }
}

export interface ClientOptions {
  baseUrl: string;
  apiKey?: string;
  /** Injectable for tests and for Next.js server components. */
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

type Query = Record<string, string | number | boolean | Date | (string | number)[] | undefined>;

function qs(params: Query = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    if (Array.isArray(v)) { if (v.length) sp.set(k, v.join(',')); continue; }
    sp.set(k, v instanceof Date ? v.toISOString() : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * A typed client over the JobHunt OS API.
 *
 * Every response type comes from @jobhunt/contracts, which the server also
 * uses to validate and serialize — so a schema change breaks compilation here
 * rather than surfacing as a runtime bug in the console.
 */
export function createClient(opts: ClientOptions) {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const base = opts.baseUrl.replace(/\/$/, '');
  const timeoutMs = opts.timeoutMs ?? 30_000;

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await doFetch(`${base}${path}`, {
        method,
        signal: ac.signal,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(opts.apiKey ? { 'x-api-key': opts.apiKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (res.status === 204) return undefined as T;

      const text = await res.text();
      const json = text ? JSON.parse(text) : undefined;

      if (!res.ok) {
        const e = (json as ErrorResponse | undefined)?.error;
        throw new JobHuntApiError(
          res.status,
          e?.code ?? 'unknown',
          e?.message ?? `HTTP ${res.status}`,
          e?.details,
          e?.requestId,
        );
      }
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    health: () => request<HealthResponse>('GET', '/health'),
    ready: () => request<HealthResponse>('GET', '/health/ready'),

    companies: {
      list: (q: CompanyListQuery = {}) => request<Company[]>('GET', `/companies${qs(q as Query)}`),
      get: (id: string) => request<Company>('GET', `/companies/${id}`),
      create: (body: CompanyCreate) => request<Company>('POST', '/companies', body),
      update: (id: string, body: CompanyUpdate) => request<Company>('PATCH', `/companies/${id}`, body),
      remove: (id: string) => request<void>('DELETE', `/companies/${id}`),
      detect: (body: DetectRequest) => request<DetectResponse>('POST', '/companies/detect', body),
      verify: (body: VerifyRequest = { includeDisabled: true }) =>
        request<VerifyResponse>('POST', '/companies/verify', body),
    },

    jobs: {
      list: (q: JobListQuery = {}) => request<JobListResponse>('GET', `/jobs${qs(q as Query)}`),
      get: (id: string) => request<Job>('GET', `/jobs/${id}`),
      setStatus: (id: string, status: JobStatus) =>
        request<Job>('PATCH', `/jobs/${id}/status`, { status }),
      setStatusMany: (body: BulkStatusUpdate) =>
        request<{ updated: number }>('POST', '/jobs/status', body),
    },

    runs: {
      ingest: (body: IngestRequest = {}) => request<IngestResponse>('POST', '/runs/ingest', body),
      list: (limit = 20) => request<Run[]>('GET', `/runs${qs({ limit })}`),
      get: (id: string) => request<Run>('GET', `/runs/${id}`),
    },

    profile: {
      get: () => request<ProfileResponse>('GET', '/profile'),
      setOverrides: (body: Record<string, unknown>) =>
        request<ProfileResponse>('PUT', '/profile/overrides', body),
      resetOverrides: () => request<ProfileResponse>('DELETE', '/profile/overrides'),
      rescore: () => request<RescoreResponse>('POST', '/profile/rescore'),
    },

    stats: () => request<StatsResponse>('GET', '/stats'),
    events: (q: EventListQuery = {}) => request<Event[]>('GET', `/events${qs(q as Query)}`),

    inbox: {
      list: (q: import('@jobhunt/contracts').InboxListQuery = {}) =>
        request<import('@jobhunt/contracts').InboxListResponse>('GET', `/inbox/messages${qs(q as Query)}`),
      get: (id: string) => request<import('@jobhunt/contracts').InboxMessage>('GET', `/inbox/messages/${id}`),
      sync: (body: import('@jobhunt/contracts').InboxSyncRequest = {}) =>
        request<import('@jobhunt/contracts').InboxSyncResponse>('POST', '/inbox/sync', body),
      draft: (id: string, body: { instructions?: string } = {}) =>
        request<import('@jobhunt/contracts').DraftReplyResponse>('POST', `/inbox/messages/${id}/draft`, body),
      update: (id: string, updates: Record<string, unknown>) =>
        request<import('@jobhunt/contracts').InboxMessage>('PATCH', `/inbox/messages/${id}`, updates),
      stats: () => request<import('@jobhunt/contracts').InboxStatsResponse>('GET', '/inbox/stats'),
    },

    connectors: {
      searchLinkedIn: (body: import('@jobhunt/contracts').LinkedInSearchRequest) =>
        request<import('@jobhunt/contracts').SourceSearchResponse>('POST', '/connectors/linkedin/search', body),
      searchNaukri: (body: import('@jobhunt/contracts').NaukriSearchRequest) =>
        request<import('@jobhunt/contracts').SourceSearchResponse>('POST', '/connectors/naukri/search', body),
      searchIndeed: (body: import('@jobhunt/contracts').IndeedSearchRequest) =>
        request<import('@jobhunt/contracts').SourceSearchResponse>('POST', '/connectors/indeed/search', body),
      test: (body: import('@jobhunt/contracts').PlatformTestRequest) =>
        request<import('@jobhunt/contracts').PlatformTestResponse>('POST', '/connectors/test', body),
    },

    facts: {
      list: (q: import('@jobhunt/contracts').FactListQuery = {}) =>
        request<import('@jobhunt/contracts').FactListResponse>('GET', `/facts${qs(q as Query)}`),
      upsert: (body: import('@jobhunt/contracts').Fact) =>
        request<import('@jobhunt/contracts').Fact>('POST', '/facts', body),
      resolve: (body: import('@jobhunt/contracts').ResolveQuestionRequest) =>
        request<import('@jobhunt/contracts').ResolveQuestionResponse>('POST', '/facts/resolve', body),
    },

    outreach: {
      templates: () =>
        request<{ templates: Record<string, { name: string; description: string; subjectTemplate: string; bodyTemplate: string }> }>(
          'GET',
          '/outreach/templates'
        ),
      generate: (body: import('@jobhunt/contracts').GenerateOutreachRequest) =>
        request<import('@jobhunt/contracts').GenerateOutreachResponse>('POST', '/outreach/generate', body),
      send: (body: import('@jobhunt/contracts').SendOutreachEmailRequest) =>
        request<import('@jobhunt/contracts').SendOutreachEmailResponse>('POST', '/outreach/send', body),
    },
  };
}

export type JobHuntClient = ReturnType<typeof createClient>;
export type * from '@jobhunt/contracts';
