# JobHunt OS

Personal job-search automation, built to become a product only if the numbers
justify it. Single-tenant today. Owner: Aravindhan Sivaraman.

Full context lives in `docs/` — read `01-PRD.md` before changing behaviour and
`00-FEASIBILITY-ANALYSIS.md` before arguing for a new feature.

## Non-negotiable constraints

These are product decisions backed by evidence, not style preferences. Do not
relax them to "get more throughput".

1. **Never fabricate.** Every claim about the candidate resolves against
   `PROFILE` in `packages/core/src/profile.ts`. `PROFILE.gaps` lists
   technologies the candidate does **not** have. They are surfaced honestly on
   every job card and must never be counted as a skill match, padded into a
   resume, or answered as experience on a screening form. When a fact is
   missing, the system asks the user — it never infers.
2. **Nothing reaches another human without approval.** No auto-send email, no
   auto-send LinkedIn message, in any phase, until a template has earned
   autonomy through measured performance.
3. **Rate governors are ceilings.** Market data says high-volume applying
   converts at 0.1–2% while reviewed, tailored applying converts at 5–15%.
   Volume is not the goal.
4. **Authenticated actions run locally.** LinkedIn, Naukri and ATS form
   submissions execute in the user's own browser profile on their own
   residential IP. Never from a server. Greenhouse flags datacenter IPs.
5. **No CAPTCHA-solving services.** Blockers go to the Human Gate queue for a
   10-second human tap. This is the line between grey-area and clearly
   violating.
6. **Deterministic first, LLM as fallback.** Selector packs handle known ATS
   forms; the model is called only when the DOM is unrecognised. Cost and
   reliability both depend on this.

## Stack

Turborepo · pnpm · Node 22 · TypeScript (strict, `noUncheckedIndexedAccess`)
· Zod at every boundary · Vitest · Postgres 16 + pgvector + Drizzle · Redis
Built: Fastify + Zod API, Vite/React console (`apps/web`), MV3 extension (`apps/extension`).
Planned: tRPC, BullMQ, Playwright (headed, persistent context), Next.js 15 console, python-docx sidecar.

## Layout

```
packages/core         types, PROFILE, normalize, score, dedupe   — no IO
packages/connectors   Greenhouse / Lever / Ashby, ATS detection  — all network IO
packages/db           Drizzle schema, migrations, repositories, PGlite test harness
packages/services     ingest · rescore · profile · registry-sync (no HTTP concerns)
packages/contracts    Zod schemas = the API contract; each export is schema AND type
packages/api-client   typed fetch client the console imports
apps/api              Fastify + Zod + OpenAPI  (routes are thin; logic lives in services)
apps/cli              ingest · score · digest · detect · verify · demo · registry:sync
apps/web              Vite + React decision cockpit (falls back to built-in demo data when the API is down)
apps/extension        MV3 extension: scrape job cards, assisted Easy Apply autofill (never submits)
config/companies.yaml the Target Company Registry (the most valuable file here)
fixtures/             real-shaped API payloads for offline tests
```

## Layering rule

`routes → services → repositories → drizzle`. A route may not touch Drizzle
directly, and a service may not know about HTTP. That separation is why the CLI
and the API can share one ingest implementation, and why the whole pipeline is
testable with a stubbed fetcher.

## Conventions

- **Parse/fetch split.** Every connector exports a pure `parseX(payload, …)`
  and a thin `fetchX(token, …)`. Tests hit the pure function; only `fetchX`
  touches the network.
- **Zod for anything external.** Wire payloads, LLM output, config files.
- `packages/core` stays IO-free so it is trivially testable.
- Every agent action (Phase 3+) writes an `events` row with a reason and, where
  applicable, a screenshot path.
- Runtime inference uses the cheap model. The strong model is only for resume
  tailoring and cover letters.
- **Network IO is injectable.** `ingestService.run({ fetcher })` takes the board
  fetcher as a parameter so the pipeline is tested end-to-end without the
  network. Follow the same pattern for the browser worker in Phase 3.
- **Tests use PGlite, not mocks.** Repository and route tests run against real
  Postgres compiled to WASM, so `on conflict`, `jsonb_agg` and friends behave
  exactly as they will in production.

## Working agreement for AI-assisted development

- Claude Code writes the **first** of each kind of thing (the first selector
  pack, the first connector, the state machine). Antigravity writes the next
  nine from that pattern.
- One phase per session. Start fresh at phase boundaries.
- Run `pnpm test` before claiming anything works. `pnpm cli demo` exercises the
  whole pipeline offline in under a second.

## Commands

```bash
pnpm install
pnpm cli demo                      # full pipeline on fixtures, no network
pnpm cli detect "<careers url>"    # find the ATS + board token
pnpm cli verify                    # check every registry entry resolves
pnpm ingest                        # poll enabled boards → out/jobs.json
pnpm digest                        # re-print the last run
pnpm test                          # all packages (PGlite, no external services)

docker compose up -d               # Postgres 16 + pgvector, Redis
pnpm db:migrate                    # apply migrations
pnpm registry:sync                 # companies.yaml -> database
pnpm api                           # API on :4000, Swagger UI at /docs
pnpm openapi                       # write openapi.json (no server, no DB)
```

## API conventions

- Zod drives request validation **and** response serialization. A response that
  doesn't match its schema is a 500, treated as our bug.
- One error shape everywhere: `{ error: { code, message, details?, requestId } }`.
  `code` is stable and safe for the UI to branch on.
- Lists return `{ items, total, limit, offset }`.
- Every mutation writes an `events` row. That table is the audit log.
- `x-api-key` guards everything except `/health*` and `/docs*`.
