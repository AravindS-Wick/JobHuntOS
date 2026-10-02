# API Reference & UI Mapping

**Base URL:** `http://127.0.0.1:4000`
**Interactive docs:** `/docs` (Swagger UI) · **Machine-readable:** `/docs/json`, or `openapi.json` at the repo root
**Auth:** `x-api-key` header. Optional on localhost, required before binding to `0.0.0.0`. `/health*` and `/docs*` stay open for probes.

---

## Endpoint surface

22 operations across 18 paths.

### health
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness. No auth. |
| GET | `/health/ready` | Readiness — pings the database. Returns 503 when it's unreachable. |

### companies — the target registry
| Method | Path | Notes |
|---|---|---|
| GET | `/companies` | `?enabled=&ats=&tag=` |
| POST | `/companies` | Idempotent on `(ats, token)`. Returns 201. |
| GET | `/companies/:id` | |
| PATCH | `/companies/:id` | Partial |
| DELETE | `/companies/:id` | 204 |
| POST | `/companies/detect` | **Paste any careers URL → ATS + board token.** Returns a ready-to-POST `suggestion`. This is how the registry grows. |
| POST | `/companies/verify` | Polls each board once. Reports working / empty / failed so bad tokens get pruned. |

### jobs — the approval-inbox feed
| Method | Path | Notes |
|---|---|---|
| GET | `/jobs` | Filters compose: `tier`, `status`, `source`, `workMode`, `minScore`, `maxScore`, `q`, `since`, `excludeDisqualified`, `maxGhostScore`, `sortBy`, `sortDir`, `limit`, `offset`. Comma lists work: `?tier=1,2`. |
| GET | `/jobs/:id` | Includes the full `descriptionText`, which the list omits. |
| PATCH | `/jobs/:id/status` | `to_apply · queued · applied · skipped · expired`. Writes an audit event. |
| POST | `/jobs/status` | Bulk, up to 500 ids. What the approval inbox calls when you clear a batch. |

### runs
| Method | Path | Notes |
|---|---|---|
| POST | `/runs/ingest` | Polls every enabled board, dedupes, scores, persists. Synchronous. `dryRun: true` previews without writing. Rate-limited to 10/min. |
| GET | `/runs` | Recent runs |
| GET | `/runs/:id` | Full stats payload |

### profile — scoring configuration
| Method | Path | Notes |
|---|---|---|
| GET | `/profile` | `effective` (what the scorer uses) + `overrides` (what the UI changed) |
| PUT | `/profile/overrides` | Partial. `skills` **merges**, so you can nudge one weight. Rejects unknown fields. |
| DELETE | `/profile/overrides` | Back to the code default |
| POST | `/profile/rescore` | Re-scores every stored job. No network calls — scoring is pure. **Call this after any profile change.** |

### stats & events
| Method | Path | Notes |
|---|---|---|
| GET | `/stats` | One call for the dashboard header |
| GET | `/events` | Audit log, newest first |

---

## Two invariants the UI must honour

**1. Always render `gaps`.** Every job carries `gaps: string[]` — the JD requirements the candidate does *not* have. The scorer is structurally incapable of counting them as a match. The UI must show them and must never imply the candidate has one. This is the constraint the whole system is built around; it is what keeps the tool from writing applications you'd be embarrassed to defend in an interview.

**2. Nothing here sends anything to a human.** No endpoint in this API contacts a third party on your behalf. When Phase 4 adds outreach, it will be draft-and-approve only. A UI affordance that implies "send automatically" is describing a product we decided not to build.

---

## Response conventions

**List envelope**
```json
{ "items": [...], "total": 143, "limit": 50, "offset": 0 }
```

**Errors** — one shape everywhere:
```json
{ "error": { "code": "validation_failed", "message": "...", "details": [...], "requestId": "uuid" } }
```
`code` is stable and safe for control flow: `validation_failed`, `not_found`, `bad_request`, `conflict`, `unauthorized`, `rate_limited`, `internal_error`. `requestId` matches the server log line.

---

## Consuming it from the UI

**If the console lives in this monorepo** — import the typed client, no codegen:
```ts
import { createClient } from '@jobhunt/api-client';

const api = createClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
  apiKey: process.env.API_KEY,
});

const { items, total } = await api.jobs.list({ tier: [1, 2], excludeDisqualified: true, limit: 20 });
await api.jobs.setStatus(items[0].id, 'applied');
const { ats, token } = await api.companies.detect({ url: careersUrl });
```

**If the console is a separate repo** — generate types from the spec:
```bash
pnpm openapi                                  # writes openapi.json
npx openapi-typescript openapi.json -o src/api-types.ts
```

Either way the types come from `packages/contracts`, which the server also uses to validate requests and serialize responses. A schema change breaks compilation in the UI rather than surfacing as a runtime bug.

---

## Mapping your mockup's tabs to real endpoints

Your `unified_job_search_platform.html` has eight tabs. Here's what each can actually be wired to today.

| Tab | Status | Endpoints |
|---|---|---|
| **Dashboard** | ✅ **Live now** | `GET /stats` for the counters, `GET /runs` for the ingest history, `GET /jobs?limit=5&tier=1` for the feed |
| **Jobs / Opportunity Match Feed** | ✅ **Live now** | `GET /jobs` with filters, `GET /jobs/:id`, `PATCH /jobs/:id/status`, `POST /jobs/status` |
| **Settings / profile tuning** | ✅ **Live now** (no tab yet — add one) | `GET /profile`, `PUT /profile/overrides`, `POST /profile/rescore` |
| **Company registry** | ✅ **Live now** (no tab yet — add one) | `GET/POST/PATCH/DELETE /companies`, `POST /companies/detect`, `POST /companies/verify` |
| **Synthesizer** (resume + cover letter) | ⏳ Phase 1 | Not built. Will be `POST /jobs/:id/tailor` → DOCX + PDF. |
| **Outreach Studio** | ⏳ Phase 4 | Not built. Draft-and-approve only. |
| **Inbox** | ⏳ Phase 4 | Not built. Gmail via Pub/Sub push. |
| **Extension Runner** | ⏳ Phase 3 | Not built. Will include the **Human Gate** queue. |
| **API Code / Figma tabs** | ❌ Drop | Architecture diagrams and build valuation inside the product UI are documentation, not features. They belong in `docs/`. |

### Things in the mockup that shouldn't ship

The mockup inherits assumptions from the Gemini PRD that we deliberately didn't build. Each is a UI affordance for something that doesn't exist:

- **"Passed Turnstile Grid" / CAPTCHA status** — we don't defeat CAPTCHAs. Replace this panel with the **Human Gate queue**: a blocked application, a screenshot, and a "resume" button. Same screen real estate, honest behaviour.
- **"Auto-Account Active"** — autonomous account creation on career portals isn't feasible (phone OTP) and violates ATS terms. Reframe as "Assisted registration — 2 waiting for you".
- **"Session Cookie Intercept"** — accurate but alarming phrasing for a feature the user owns. Call it "Browser session connected".
- **"Railway Backend Stats", "Proxy Bandwidth Pool", "FastAPI / Celery" chips** — wrong stack and ~5× the real cost. The backend is Fastify + BullMQ on your own machine, and you don't need residential proxies when the extension runs in your own browser.
- **"$43,100 Commercial Agency Build Value"** — that's what it would cost to *build*, not what it's *worth*. Not a dashboard metric.

### Things missing that the API already gives you

- **`gaps` per job** — the single most important field. Nothing in the mockup renders it.
- **Tier buckets** (1/2/3/4) with the daily caps 5 / 7 / 8
- **`disqualified`** — the reason a job was filtered out, so a surprising exclusion is explainable
- **`ghostScore` / `ghostReasons`** — 18–22% of listings are ghosts
- **`seenOn`** — every board a role appeared on, after dedup
- **`breakdown`** — the seven scoring components, so a score is inspectable rather than magic

### Practical note on the file itself

It's a static mockup: 116 KB of one HTML file, Tailwind via CDN, Chart.js via CDN, all data hardcoded, zero `fetch` calls. That's completely fine as a **design reference** — the visual language is good and worth keeping. It is not a starting point to bolt an API onto: the Tailwind CDN build isn't production-shippable, and there's no component model. The path forward is to rebuild it as the Next.js console (Phase 2) using this file as the visual spec, starting with the two tabs that have real endpoints behind them.
