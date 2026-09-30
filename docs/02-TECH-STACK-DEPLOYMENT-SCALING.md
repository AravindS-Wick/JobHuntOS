# JobHunt OS — Tech Stack, Deployment & Scaling

**Companion to:** `01-PRD.md`
**Bias:** every choice below defaults to something already in your stack (React, TypeScript, Node, Python/Flask, GCP, Docker, GitHub Actions, MongoDB/SQL, Next.js). Where I deviate, the reason is stated.

---

## 1. Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────────┐
│  YOUR MACHINE (or Tailscale-joined home box)                        │
│                                                                     │
│  ┌───────────────────┐        ┌──────────────────────────────────┐  │
│  │ Chrome Extension  │◄──────►│  Browser Worker                  │  │
│  │ (MV3, TS, React)  │  WS    │  Playwright, persistent profile  │  │
│  │ · session capture │        │  · headed, real fingerprint      │  │
│  │ · on-page actions │        │  · selector packs + LLM fallback │  │
│  │ · human gate UI   │        │  · screenshot every action       │  │
│  └───────────────────┘        └──────────────┬───────────────────┘  │
└──────────────────────────────────────────────┼──────────────────────┘
                                               │ (only authenticated
                                               │  actions need to be here)
┌──────────────────────────────────────────────┼──────────────────────┐
│  ORCHESTRATOR — local Docker Compose in P0-P3, VPS from P4          │
│                                               │                      │
│  ┌────────────┐  ┌──────────┐  ┌─────────────▼──────────┐           │
│  │  API       │  │ Workers  │  │  Queue (BullMQ/Redis)  │           │
│  │  Fastify   │  │ ingest   │  │  ingest · score ·      │           │
│  │  + tRPC    │  │ score    │  │  tailor · apply ·      │           │
│  │            │  │ tailor   │  │  reach · inbox         │           │
│  └─────┬──────┘  │ reach    │  └────────────────────────┘           │
│        │         │ inbox    │                                        │
│        │         └────┬─────┘                                        │
│  ┌─────▼──────────────▼────────────────────────────────┐            │
│  │  Postgres 16 + pgvector   ·   Object store (files)  │            │
│  └─────────────────────────────────────────────────────┘            │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
        ┌──────────────────┼─────────────────────┬──────────────────┐
        ▼                  ▼                     ▼                  ▼
   Next.js Console    Telegram Bot          Gmail API         External:
   (Vercel)           (gates/approvals)     Calendar API      Apify · ATS
                                                              public APIs ·
                                                              Postmark ·
                                                              Anthropic
```

**The one architectural rule that matters:** authenticated actions against LinkedIn, Naukri, Greenhouse and Workday run **from your machine, in your real browser profile, on your residential IP**. Everything else — scraping public ATS APIs, scoring, generating documents, sending email from your own domain, reading Gmail — can run anywhere, including a ₹400/month VPS.

---

## 2. Stack, layer by layer

### 2.1 Chrome Extension

| Choice | Why |
|---|---|
| **Manifest V3** | No option; MV2 is dead |
| **TypeScript + React 19 + Vite via CRXJS** | Your daily stack. CRXJS gives HMR on an extension, which is otherwise painful. |
| **`chrome.cookies` + `chrome.storage.session`** | Session capture without ever touching a password. Works with Google SSO and 2FA naturally. |
| **`chrome.debugger` or content-script injection** | For on-page form fill. Prefer content scripts — `chrome.debugger` shows a visible banner. |
| **Native messaging or local WebSocket to the worker** | WebSocket to `localhost` is simpler; native messaging is more robust if you ever package it |

**Don't publish it to the Chrome Web Store in v1.** Load unpacked. Store review for an extension that automates LinkedIn will be rejected, and an unlisted extension avoids the published-blacklist problem entirely.

### 2.2 Browser Worker

| Choice | Why |
|---|---|
| **Playwright (Node) with `launchPersistentContext`** | Reuses a real Chrome profile — cookies, history, fingerprint, extensions. Far less detectable than a fresh headless context. Headed mode, not headless. |
| **`playwright-extra` + `stealth` plugin** | Reduces the obvious automation tells. Not a silver bullet — behaviour matters more than flags. |
| **Selector packs as versioned JSON/TS modules** | `packs/greenhouse.ts`, `packs/lever.ts`… Each exports `detect()`, `fill(facts)`, `submit()`, `verify()`. Health-check test suite runs weekly against live boards. |
| **Checkpoint/resume state machine** | Human gates (D4) require the run to pause and resume. Model each application as an XState machine or a simple persisted step index. |
| Not Puppeteer | Playwright's auto-waiting and locators cut the flaky-selector work substantially |
| Not `browser-use`/Stagehand as the primary path | Excellent for the LLM fallback, far too expensive and slow as the default. Deterministic-first (Principle 4). |

### 2.3 Orchestrator / API

| Choice | Why |
|---|---|
| **Node.js 22 + TypeScript** | Your stack. Shares types with extension and console via a monorepo. |
| **Fastify** (over Express) | Faster, better TS support, schema validation built in. Small learning delta. |
| **tRPC** between API and Next.js console | End-to-end type safety with zero API-contract maintenance. Big time-saver for a solo build. |
| **BullMQ + Redis** | Job queue with retries, delays, rate limiting and cron. The rate governor (D5) is naturally expressed as BullMQ rate-limited queues. |
| **Zod** everywhere | Runtime validation for scraped data, LLM output, and API boundaries. Non-negotiable when parsing LLM JSON. |
| **Python only where it earns its place** | `python-docx` for resume generation is genuinely better than any Node equivalent. Run it as a small Flask/FastAPI sidecar. Everything else stays in Node. |

### 2.4 Data

| Choice | Why |
|---|---|
| **PostgreSQL 16 + pgvector** | Relational is right here — jobs, applications, contacts and threads are heavily joined. pgvector gives you JD↔resume semantic matching in the same DB. **This is the one place I'd move you off MongoDB.** |
| **Drizzle ORM** | TypeScript-native, SQL-shaped, no code generation step. Lighter than Prisma for a solo project. |
| **Redis** | Queue backing + dedup bloom filter + rate-limit counters |
| **Local filesystem → GCS in P4** | Resumes, screenshots, cover letters. Same interface, swap the driver. |
| **Encryption**: AES-256-GCM, key in OS keychain (`keytar`) locally, GCP Secret Manager on VPS | Session cookies are bearer tokens. Treat them as such. |

### 2.5 AI layer — where the money goes

| Task | Model | Rationale |
|---|---|---|
| Resume tailoring, cover letters | **Claude Opus/Sonnet 4.5** | Quality matters, volume is low (~20/week). Worth the spend. |
| JD parsing, keyword & gap extraction | **Claude Haiku** or **Gemini Flash** | High volume (~200/day), low complexity |
| Screening-question → fact-table matching | **Haiku / Flash**, with a strict Zod schema | Must return `answer | ask | abort` and nothing else |
| Unknown-form field mapping (LLM fallback only) | **Sonnet with vision** | Rare path. Screenshot + DOM → field map. |
| Email classification | **Haiku / Flash** | ~50/day |
| Embeddings for semantic match | **`text-embedding-3-small`** or a local `bge-small` via `transformers.js` | Local embeddings are free and good enough here |

**Cost discipline:** cache aggressively (same JD parsed once, ever), batch where possible, and put a hard monthly token budget in front of every call. The runtime bill should land at **$8–15/month**, and it must *not* come out of your $100 Claude credits — those are for building.

### 2.6 Console (dashboard)

| Choice | Why |
|---|---|
| **Next.js 15 (App Router) + TypeScript** | Your stack; you already deploy Next on Vercel |
| **Tailwind + shadcn/ui** | You have Tailwind and MUI experience; shadcn is faster to assemble for an internal tool |
| **TanStack Query** | You flagged this as a gap — this is a low-risk place to close it |
| **Your own `@aravi1008/ui` components where they fit** | Dogfooding your library on a real app is a genuine portfolio story for interviews |

### 2.7 Notifications & mobile

| Choice | Why |
|---|---|
| **Telegram Bot API** | 4 hours of work, inline approve/reject buttons, push to your phone, zero app-store friction. You've built a Telegram bot integration before (VYXN work). |
| Not React Native | Nothing on mobile needs a native app. Reconsider only if you productize. |

### 2.8 Email

| Choice | Why |
|---|---|
| **Gmail API** for reading, classifying and drafting | Native threading, labels, and your existing inbox. Personal-use OAuth, no CASA needed. |
| **Postmark** (or Resend) on a **separate domain** for cold outreach | Deliverability is a reputation game. Do not risk the Gmail account you interview from. Postmark ~$15/mo for 10k; Resend has a usable free tier. |
| **SPF + DKIM + DMARC** configured before the first send, 2-week warm-up | Non-optional. Skipping this is how cold email stops arriving. |

### 2.9 Job data sources

| Source | Access | Cost | ToS |
|---|---|---|---|
| Greenhouse / Lever / Ashby boards | Public JSON API | Free | ✅ Clean |
| Workday | Tenant CXS endpoint | Free | ⚠️ Grey |
| Indeed | **MCP connector (already in your Claude session)** | Free | ✅ Clean |
| ZipRecruiter | MCP connector | Free | ✅ Clean |
| Naukri / LinkedIn | Apify actors (existing) | ~$5–15/mo | ⚠️ Grey |
| Foundit | HTML scrape | Free | ⚠️ Grey, brittle |
| Instahyre / Cutshort | Authenticated session | Free | ⚠️ Grey |

---

## 3. Deployment

### Phase 0–3: everything local

```
docker compose up
├── postgres:16 (pgvector image)
├── redis:7
├── api          (Fastify)
├── workers      (BullMQ processors)
├── docgen       (Python sidecar, python-docx)
└── browser-worker  ← host network, headed Chrome, NOT in a container
```

The browser worker stays outside Docker so it can use your real Chrome profile and display. Everything else containerises cleanly. **Cost: ₹0.**

Console runs on `localhost:3000` in dev, or deploy it to Vercel and point it at your machine via a Cloudflare Tunnel.

### Phase 4+: split deployment

| Component | Where | Cost |
|---|---|---|
| API + workers + Postgres + Redis | **Hetzner CAX11 ARM** (2 vCPU / 4 GB) or **GCP e2-micro** free tier | €3.79/mo (~₹350) or free |
| Console | **Vercel** free tier | ₹0 |
| File storage | **GCS Standard** or **Cloudflare R2** | < ₹100/mo |
| Browser worker | **Stays on your machine**, joined via **Tailscale** | ₹0 |
| Secrets | GCP Secret Manager | ~₹0 at this scale |
| CI/CD | GitHub Actions → build image → push to GHCR → `docker compose pull && up` via SSH | Free |

Given your GCP Professional Cloud Architect cert, GCP is the natural choice and lets you frame this project in interviews. Hetzner is cheaper if cost is the only concern. Either is fine; don't spend a week deciding.

**Monthly running cost, personal use: ₹1,200–3,000 ($15–35)** — dominated by Apify and Postmark, not compute.

---

## 4. Scaling — only if you productize

The single-user architecture does **not** scale by adding servers, because the browser worker is deliberately bound to one person's IP and browser profile. Multi-tenancy is a genuine re-architecture of that one layer. Here's what it costs.

### 4.1 What has to change

| Layer | Single-user | Multi-tenant |
|---|---|---|
| Browser execution | Your machine, your profile | **One isolated browser context + one residential proxy per user.** This is the hard part and the main cost driver. |
| Session storage | OS keychain | Envelope encryption per tenant (GCP KMS), decrypt in RAM only, never to disk |
| Gmail access | Personal OAuth, exempt | **Google CASA Tier 2 assessment, re-verified every 12 months.** Budget 4–8 weeks and real remediation work. |
| Queue | One Redis, one queue | Per-tenant queues with fair scheduling; noisy-neighbour isolation |
| Rate governors | Per-user constants | Per-tenant, per-platform, persisted; a shared ban signal across tenants |
| Compliance | Your data | You become a data controller for recruiter contact data. DPDP/GDPR obligations, DPA, deletion flows. |
| Support | None | ATS selector packs break constantly and every break is a support ticket. **This becomes the job.** |

### 4.2 Browser infrastructure options at scale

| Option | Cost | Trade-off |
|---|---|---|
| **Browserbase** | Developer $20/mo (25 concurrent, 100 browser-hrs), Startup $99/mo (100 concurrent, 500 hrs), overage $0.10–0.12/browser-hr | Fastest to build on. Datacenter IPs by default — **Greenhouse flags these** — so you pay for residential proxies on top. |
| **Self-hosted Playwright on GKE / Cloud Run Jobs** | ~$0.03–0.06/browser-hr at scale + proxy | Cheapest at volume, most ops work. Your GCP cert makes this a reasonable choice. |
| **Keep it client-side** — ship the extension, users run their own automation | Near-zero infra | **Strongest anti-ban posture and cheapest.** This is what FastApply does, and it's why FastApply tops the submission benchmarks. |

**Recommendation if you productize: go client-side.** Ship the extension as the execution layer, keep the cloud for ingestion, scoring, tailoring and the dashboard. Infra cost per user drops to cents, ban risk moves to the user's own real session (which is also where it belongs), and you avoid the residential-proxy bill entirely.

### 4.3 Scaling numbers

| Users | Architecture | Infra cost/mo | Notes |
|---|---|---|---|
| 1 (you) | Local Docker | ₹0 + $15–35 services | Where you start |
| 10–50 (beta) | Single VPS + client-side extension | $30–60 | Manual onboarding, no billing |
| 50–500 | Managed Postgres, Redis, Cloud Run workers, client-side execution | $200–500 | Needs CASA if Gmail is in scope; needs billing (Razorpay/Stripe) |
| 500–5,000 | Multi-region, queue sharding, dedicated selector-pack maintenance | $1,500–4,000 | Needs at least one other person. Support load exceeds one operator. |

### 4.4 Cost per user (client-side model, 500 users)

| Item | Per user/mo |
|---|---|
| LLM (cached, cheap models) | $0.30–0.80 |
| Job ingestion (amortised — one pull serves all users) | $0.05 |
| Postgres + Redis + compute | $0.40 |
| Email infrastructure | $0.10 |
| **Total COGS** | **~$1.00–1.40** |
| At ₹799/mo (~$9.50) revenue | ~85% gross margin |

Margins are fine. **Churn and CAC are the problem, not COGS** — see §6 of the feasibility doc.

---

## 5. Monorepo layout

```
jobhunt-os/
├── apps/
│   ├── api/              Fastify + tRPC
│   ├── console/          Next.js 15
│   ├── workers/          BullMQ processors
│   ├── browser-worker/   Playwright + selector packs
│   ├── extension/        MV3 + React (CRXJS)
│   └── docgen/           Python sidecar (python-docx)
├── packages/
│   ├── db/               Drizzle schema + migrations
│   ├── core/             Scoring, dedup, fact table, shared types
│   ├── connectors/       Greenhouse, Lever, Ashby, Workday, Apify, Indeed MCP
│   ├── packs/            ATS selector packs + health checks
│   ├── ai/               Prompts, Zod schemas, model routing, budget guard
│   └── ui/               Shared components (or import @aravi1008/ui)
├── docker-compose.yml
└── turbo.json
```

Turborepo — you already built `aravindhan-ui-mat` as a Turborepo monorepo, so this is familiar ground rather than a new thing to learn.

---

## 6. Build vs buy shortcuts

Don't build these from scratch:

| Need | Use |
|---|---|
| Job scraping for Naukri/LinkedIn | Your existing Apify actors |
| Indeed / ZipRecruiter data | The MCP connectors already in your Claude session |
| Email finding | Hunter.io free tier (25/mo) + pattern inference + SMTP verify |
| DOCX generation | `python-docx` — you already have working scripts |
| PDF generation | LibreOffice headless `--convert-to pdf`, not a PDF library |
| Auth for the console | Nothing. It's single-user on localhost. Add Clerk/Auth.js only at productization. |
| Scheduling | BullMQ repeatable jobs, not a separate cron service |
| Resume parsing | You already have the master resume as structured data — keep it that way, never re-parse your own PDF |
