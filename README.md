# JobHunt OS

[![CI](https://github.com/aravindhan/jobhunt-os/actions/workflows/ci.yml/badge.svg)](https://github.com/aravindhan/jobhunt-os/actions/workflows/ci.yml)
[![Tests: 121 passed](https://img.shields.io/badge/tests-121%20passed-10b981.svg)](https://github.com/aravindhan/jobhunt-os)
[![TypeScript: Strict](https://img.shields.io/badge/typescript-strict%205.7-3178c6.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A personal job-search operating system built for high-conversion, truth-constrained career automation.

The point is not volume. The public job market converts at ~0.4% per cold application; spam/blast tools measure at 0.1–2% while reviewed, tailored applications hit 5–15%. This tool optimises for **being early to a role that fits, with a tailored resume and real human outreach** — not for applying to more things.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │    JobHunt OS Decision Cockpit (:3000) │
                      │    (React 19 + Vite + Tailwind + Zod)  │
                      └──────────────────┬─────────────────────┘
                                         │ typed API client
                                         ▼
┌───────────────────────┐     ┌────────────────────────────────┐     ┌────────────────────────┐
│  Chrome MV3 Extension │────▶│  Fastify API Gateway (:4000)   │◀────│  CLI Automation Engine  │
│  (Residential DOM &   │     │  (OpenAPI + Zod + Audit Events)│     │  (demo, ingest, digest)│
│   Easy Apply Filler)  │     └────────────────┬───────────────┘     └───────────┬────────────┘
└───────────────────────┘                      │                                 │
                                               ▼                                 │
                             ┌─────────────────────────────────┐                 │
                             │   Services & Pipeline Layer     │◀────────────────┘
                             │ (Ingest, Dedup, Rescore, Inbox) │
                             └────────────────┬────────────────┘
                                              │
                      ┌───────────────────────┴────────────────────────┐
                      ▼                                                ▼
     ┌─────────────────────────────────┐              ┌─────────────────────────────────┐
     │    PostgreSQL 16 + pgvector     │              │    Gemini 2.0 / 3.7 Flash AI    │
     │   (Drizzle ORM & PGlite WASM)   │              │  (Truth-Guarded Material Synth) │
     └─────────────────────────────────┘              └─────────────────────────────────┘
```

---

## Monorepo Layout

```
apps/
  api/               Fastify + Zod + OpenAPI (22 operations, audit logs, rate governor)
  cli/               ingest · score · digest · detect · verify · demo · registry:sync
  extension/         Chrome Manifest V3 Copilot: DOM scraper & residential Easy Apply
  web/               React 19 Decision Cockpit: Kanban, Outreach Studio, Synthesis
packages/
  core/              Types, candidate PROFILE, normalisation, scoring, dedup — zero IO
  connectors/        Greenhouse, Lever, Ashby, ATS detection, Gmail sync — pure parsers
  contracts/         Zod schemas = API contracts; exports schema and static TypeScript type
  db/                Drizzle schema, migrations, repositories, WASM PGlite test harness
  services/          Ingest, rescore, profile overrides, registry-sync, inbox triage
  api-client/        End-to-end typed client for web console and automated agents
config/
  companies.yaml     The Target Company Registry (Greenhouse, Lever, Ashby tokens)
fixtures/            Real-world ATS payloads for instant offline regression testing
```

---

## Quick Start (5 minutes, no database needed)

```bash
# Install all dependencies across monorepo
pnpm install

# Run full pipeline on bundled fixtures (sub-second, completely offline)
pnpm cli demo

# Check which boards in config/companies.yaml resolve
pnpm cli verify

# Run unit and integration tests (121 tests pass via in-memory WASM Postgres)
pnpm test

# Verify type safety across the entire repository
pnpm typecheck
```

---

## Chrome Extension Setup (Manifest V3)

The extension enables residential DOM job syncing from LinkedIn, Naukri, and Indeed directly to your local JobHunt OS API, plus zero-fabrication Easy Apply autofill.

1. Open Chrome/Brave/Edge and navigate to `chrome://extensions`.
2. Toggle on **Developer mode** (top-right).
3. Click **Load unpacked** and select the `apps/extension` directory.
4. When on LinkedIn or Naukri, the **JobHunt OS Floating Dock** provides 1-click sync and assisted Easy Apply.

---

## Running the Web Decision Cockpit & API

```bash
# 1. Start local Postgres 16 & Redis
docker compose up -d

# 2. Configure environment
cp .env.example .env

# 3. Apply Drizzle database migrations
pnpm db:migrate

# 4. Sync target companies from config/companies.yaml to DB
pnpm registry:sync

# 5. Start Fastify API Gateway (:4000)
pnpm api

# 6. In another terminal, start the React 19 Cockpit (:3000)
pnpm web
```

- Interactive Swagger Docs: `http://127.0.0.1:4000/docs`
- Decision Cockpit UI: `http://localhost:3000`

---

## AI Working Model Integration (Gemini 2.0 / 3.7 Flash)

JobHunt OS features integrated AI material synthesis for tailored resumes, cover letters, and outreach pitches:

- **Truth-Constrained Generation**: Every prompt is guarded against `PROFILE.gaps` in `packages/core/src/profile.ts`. The model is instructed to never claim missing skills.
- **Key Configuration**: Enter your Gemini API key in the Web UI Header or set `VITE_GEMINI_API_KEY` in `.env`.
- **Offline / Zero-Key Fallback**: When no API key is provided, the engine generates deterministic, production-grade templates instantly with zero network cost.

---

## Scoring Architecture

| Component | Weight | Rule |
|---|---|---|
| **Stack match** | 40 | Saturating curve so keyword-stuffed JDs don't game the system |
| **Seniority** | 15 | Roles below target or manager titles are disqualified |
| **Work mode** | 15 | Onsite/hybrid outside acceptable cities scores ~0 |
| **Recency** | 10 | Postings under 6 hours old receive maximum marks |
| **Compensation**| 10 | Undisclosed pay is neutral; disclosed below floor is disqualified |
| **Title fit**   | 5  | Target title matching |
| **Company**     | 5  | Signal weight from `config/companies.yaml` |

Tiers: **1** ≥70 · **2** 50–69 · **3** 30–49 · **4** Disqualified.

---

## Commands Reference

| Command | Description |
|---|---|
| `pnpm cli demo` | Run full ingest, dedup, and scoring pipeline offline in <0.1s |
| `pnpm cli detect "<url>"` | Detect ATS platform (Greenhouse, Lever, Ashby) and token |
| `pnpm cli verify` | Test and verify all registered company careers boards |
| `pnpm ingest` | Poll enabled company boards, score jobs, write `out/jobs.json` |
| `pnpm digest` | Print ranked daily digest of ingested jobs |
| `pnpm test` | Run all unit & integration tests with Vitest & PGlite |
| `pnpm typecheck` | Run strict TypeScript compiler verification across monorepo |
| `pnpm build` | Build monorepo packages and production web distribution |
| `pnpm api` | Start Fastify API server on port 4000 |
| `pnpm web` | Launch Vite development server for Decision Cockpit |
| `pnpm openapi` | Regenerate static `openapi.json` from Fastify Zod routes |
| `pnpm db:migrate` | Apply Drizzle schema migrations to database |
| `pnpm registry:sync` | Sync `config/companies.yaml` records into database |
| `pnpm extension:icons` | Regenerate Chrome extension icons (16, 32, 48, 128 px) |

---

## Non-Negotiable Ground Rules

1. **Never fabricate**: Every claim resolves against `packages/core/src/profile.ts`. Skill gaps are surfaced honestly.
2. **Nothing reaches a human without approval**: No blind auto-sending of emails or LinkedIn messages.
3. **Residential execution**: Automated scraping and form interactions run locally inside the user's browser, never from datacenter IPs.
4. **No CAPTCHA defeat**: Blockers route to the Human Gate queue for a fast manual tap.

---

## License

[MIT](LICENSE) © 2025-2026 Aravindhan Sivaraman
