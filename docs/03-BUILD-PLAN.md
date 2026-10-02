# JobHunt OS — Build Plan, Claude Code Workflow & Credit Budget

**Companion to:** `01-PRD.md`, `02-TECH-STACK-DEPLOYMENT-SCALING.md`
**Assumptions:** 10–15 hrs/week · solo · $100 Claude credits (Tranche B, expiring 19 Sept, effective deadline earlier) · Antigravity available on the Jio Pro tier · active job search running in parallel

---

## 0. The rule that governs this whole plan

> **If week 4 arrives and you have built more than you have applied, stop building.**

You are on a 60-day notice period. The tool exists to get you a job; it is not the job. Every phase below is sequenced so that it produces usable output *before* the next phase starts. Phase 0 alone — two weeks — already gives you job sources nobody else in your position is watching.

---

## 1. Ten-week plan

### Phase 0 — Ingestion (Weeks 1–2, ~25 hrs) → **value on day 4**

| Step | Work | Output |
|---|---|---|
| 0.1 | Monorepo scaffold (Turborepo), Docker Compose with Postgres 16 + pgvector + Redis, Drizzle schema from PRD §8 | `docker compose up` works |
| 0.2 | **Greenhouse / Lever / Ashby connectors** — public JSON APIs, no auth | First unlisted jobs in the DB |
| 0.3 | **Target Company Registry** — seed 40–60 companies you'd actually work for; auto-detect ATS type from careers URL | The list that makes this tool yours |
| 0.4 | Wire existing Apify actors (Naukri, LinkedIn) + Indeed MCP into the same pipeline | One feed, five sources |
| 0.5 | Normalisation + fuzzy dedup + ghost-job heuristic | No duplicates, 20% waste removed |
| 0.6 | Scoring engine — port your existing 0–100 rules + pgvector cosine similarity + recency boost | Ranked daily queue |
| 0.7 | Daily digest to Telegram or email | **You start using it while still building it** |

**Do 0.2 and 0.3 first.** They are the cheapest work in the whole plan and produce the thing no competitor gives you: roles on company career pages, seen the hour they post.

### Phase 1 — Documents (Week 3, ~12 hrs)

| Step | Work |
|---|---|
| 1.1 | **Verified fact table** — encode your master resume as structured facts with evidence. This is the truth constraint (PRD G4/D3), and everything downstream depends on it. |
| 1.2 | Port your existing tailoring pipeline into `packages/ai` with Zod-validated output |
| 1.3 | `python-docx` generator + LibreOffice headless → PDF. Both formats, every time. |
| 1.4 | ATS-safety validator (no tables, no header/footer text, standard sections) |
| 1.5 | Diff view: tailored vs master, so you can eyeball what changed in 5 seconds |

### Phase 2 — Console (Week 4, ~14 hrs)

| Step | Work |
|---|---|
| 2.1 | Next.js 15 + tRPC + Tailwind/shadcn, single-user, no auth |
| 2.2 | **Approval Inbox** — the core screen. Card stack: job, score, gaps, resume diff, drafted outreach → Approve / Edit / Reject. Target 20 decisions in 10 minutes. |
| 2.3 | Tracker replacing `Job_Search_Tracker.xlsx`, same status model, XLSX export retained |
| 2.4 | Funnel analytics + experiment tracking (variant, template, time-of-day, source → callback) |
| 2.5 | Telegram bot for gates and approvals on your phone |

**At the end of week 4 the spreadsheet is retired and you have a working cockpit.** If you stop here, it was still worth it.

### Phase 3 — Apply (Weeks 5–6, ~28 hrs)

| Step | Work |
|---|---|
| 3.1 | Chrome extension skeleton (MV3, CRXJS, TS+React), session capture via `chrome.cookies`, WebSocket to local worker. **Load unpacked — do not submit to the Web Store.** |
| 3.2 | Playwright browser worker, `launchPersistentContext` on your real Chrome profile, headed |
| 3.3 | Selector packs: **Greenhouse → Lever → Ashby** in that order (easiest to hardest), with `detect/fill/submit/verify` and a weekly health-check suite |
| 3.4 | Screening-question resolver against the fact table: `answer` / `ask` / `abort`. Cache new answers back to the table. |
| 3.5 | **Human Gate**: checkpoint state machine, screenshot, Telegram push, resume-on-tap |
| 3.6 | Rate governor as BullMQ rate-limited queues (PRD D5 limits) |
| 3.7 | Naukri Easy Apply pack + the daily profile-freshness job |

### Phase 4 — Outreach & Inbox (Weeks 7–8, ~28 hrs) → **the highest-ROI phase**

| Step | Work |
|---|---|
| 4.1 | Buy the sending domain, configure SPF/DKIM/DMARC, start Postmark/Resend warm-up **on day one of week 7** — it takes two weeks regardless of your code |
| 4.2 | Contact discovery: LinkedIn people search via session, Hunter.io free tier, pattern inference + SMTP verify |
| 4.3 | Email composer using your existing cold-outreach playbook; per-recipient personalisation enforced by a similarity check that rejects near-identical bodies |
| 4.4 | Gmail API + **Pub/Sub push** (not polling — this is the one idea worth taking from the Gemini doc) |
| 4.5 | Inbound classifier (Haiku/Flash) → thread linking → draft replies. Draft only; auto-send stays off. |
| 4.6 | Assessment-link extraction → Calendar events; interview invites → propose slots from free/busy |
| 4.7 | **Referral path**: when a target company matches a 1st/2nd-degree connection, draft a referral ask *instead of* a cold application. This is the 2.6% → 6.6% lever — build it properly. |

### Phase 5 — LinkedIn & polish (Weeks 9–10, ~24 hrs)

| Step | Work |
|---|---|
| 5.1 | LinkedIn Easy Apply pack, ≤12/day, human-paced, approval-gated |
| 5.2 | LinkedIn connection + DM flow, ≤20 connects/day, every message individually drafted |
| 5.3 | Workday semi-auto (fill everything, gate the registration and CAPTCHA) |
| 5.4 | Kill switch, full audit log with screenshots, weekly digest |
| 5.5 | Move orchestrator to Hetzner/GCP; browser worker stays local over Tailscale |

**LinkedIn is deliberately last.** It carries the only real account risk in the system, and by week 9 you'll know whether the rest of the machine even needs it.

### Week 10 — The decision point

Read your own analytics and answer three questions honestly:

1. Is the callback rate ≥ 8%? (market baseline: 0.4%)
2. Are ≥ 60% of applications coming from careers pages rather than job boards?
3. Is weekly time under 3 hours?

If yes to all three, you have something worth showing other people, and `00-FEASIBILITY-ANALYSIS.md` §6 tells you what productizing actually costs. If no, you have a tool that got you a job — which is the better outcome, and you should stop building and go interview.

---

## 2. Claude Code + Antigravity workflow

### 2.1 The split that protects your credits

| Work type | Tool | Why |
|---|---|---|
| Architecture decisions, schema design, tricky state machines, selector-pack design, prompt engineering, security review | **Claude Code (Opus/Sonnet)** | Where model quality changes the outcome |
| Bulk CRUD, UI scaffolding, boilerplate connectors, test generation, refactors, repetitive selector packs #4–10 | **Antigravity** | High volume, low judgement — and it's on the Jio Pro tier, so effectively free |
| Anything with a tight feedback loop you can verify yourself | **Antigravity** | Cheap iteration |
| Anything you'd struggle to review | **Claude Code** | Don't ship code you can't evaluate |

**Rule of thumb: Claude Code writes the first one of each kind of thing; Antigravity writes the next nine.** Write the Greenhouse selector pack with Claude Code, get it right, then hand Antigravity the pattern for Lever, Ashby and SmartRecruiters.

### 2.2 Session hygiene (this is where credits leak)

- **One `CLAUDE.md` at the repo root**, kept current: stack decisions, conventions, the fact-table contract, the "never fabricate" rule, and pointers to these four docs. Re-explaining context every session is the single biggest avoidable cost.
- **One phase per session.** Start fresh at phase boundaries; don't drag a 200k-token context across weeks.
- **Plan mode before big work.** Get the plan right in a cheap exchange, then execute. Re-doing an implementation costs 5× what planning it costs.
- **Let it run tests itself.** Wire Vitest early so Claude Code can verify its own work instead of you round-tripping errors.
- **Never paste large files.** Point at paths; the tools read what they need.
- **Batch your questions.** Five small sessions cost far more than one focused session.

### 2.3 Suggested session-to-phase mapping

| Phase | Claude Code sessions | Antigravity sessions |
|---|---|---|
| 0 — Ingestion | 4 (scaffold, schema, connector pattern, scoring) | 6 (remaining connectors, normalisation, tests) |
| 1 — Documents | 3 (fact table, tailoring prompts, validator) | 3 (docx templating, PDF pipeline) |
| 2 — Console | 2 (tRPC + approval-inbox design) | 8 (screens, tables, charts) |
| 3 — Apply | 6 (extension bridge, state machine, first selector pack, resolver) | 8 (packs 2–7, form utils) |
| 4 — Outreach | 5 (Pub/Sub, classifier, referral logic, composer) | 6 (templates, UI, calendar) |
| 5 — LinkedIn/polish | 3 (LinkedIn pack, audit log) | 5 (deploy, digest, cleanup) |
| **Total** | **~23 sessions** | **~36 sessions** |

### 2.4 Credit budget

| Scenario | Cost/session | Total | Verdict |
|---|---|---|---|
| Undisciplined (Opus everywhere, no `CLAUDE.md`, long contexts) | $6–10 | **$150–230** | ❌ Blows the budget before Phase 4 |
| **Recommended split** (Opus for design, Sonnet for implementation, Antigravity for bulk) | $2.50–4 | **$60–90** | ✅ Fits, with headroom |
| Maximum discipline (Antigravity-heavy, Claude Code only for the hard 30%) | $1.50–2.50 | **$35–60** | ✅ Comfortable |

**Three hard rules:**

1. **Runtime inference never touches this budget.** Use a separate key on Haiku or Gemini Flash. Your $8–15/month of runtime cost is an operating expense, not build capital.
2. **Front-load the spend.** Your credits expire ~19 September; Phases 0–3 land inside that window. Phases 4–5 will run on ordinary paid usage or Antigravity, and that's fine.
3. **Check live model pricing before planning around any cost figure** — including the ones in this table and every number in the Gemini document.

### 2.5 A `CLAUDE.md` starting point

```markdown
# JobHunt OS

Personal job-search automation. Single-tenant. Owner: Aravindhan Sivaraman.

## Non-negotiable constraints
1. NEVER fabricate a skill, year of experience, or credential. All screening
   answers resolve against packages/core/facts.ts. If a fact is absent, the
   system asks the user — it never infers.
2. Nothing reaches another human without explicit approval. No auto-send.
3. Rate governors in packages/core/limits.ts are ceilings, not defaults.
   Never raise them to "get more throughput."
4. Authenticated actions run only in the local browser worker, never from
   a server IP.
5. No CAPTCHA-solving services. Blockers go to the Human Gate queue.

## Stack
Turborepo · Node 22 + TS · Fastify + tRPC · BullMQ/Redis · Postgres 16 +
pgvector + Drizzle · Playwright (headed, persistent context) · Next.js 15 +
Tailwind + shadcn · MV3 extension (CRXJS) · python-docx sidecar

## Conventions
- Zod at every boundary, especially LLM output
- Selector packs export detect/fill/submit/verify + a health check
- Every agent action writes an Event row with a screenshot
- Cheap model (Haiku/Flash) at runtime; strong model only for tailoring

## Docs
See docs/00-FEASIBILITY, 01-PRD, 02-TECH-STACK, 03-BUILD-PLAN,
04-REVIEW-OF-GEMINI-PRD.
```

---

## 3. Running cost, honestly

| Item | Monthly |
|---|---|
| Apify (Naukri + LinkedIn actors) | $5–15 |
| Postmark or Resend (cold outreach) | $0–15 |
| Sending domain | ~$1 |
| Runtime LLM (Haiku/Flash, cached) | $8–15 |
| Hosting (local → Hetzner/GCP free tier) | $0–4 |
| Hunter.io | $0 (free tier) |
| **Total** | **$15–50/month (₹1,300–4,300)** |

Against a ₹25 LPA target, four weeks of search compression is worth roughly ₹2 lakh. The payback is not close.

---

## 4. First three things to do

1. **Today, 30 minutes:** write out your Target Company Registry — 40–60 companies you'd genuinely join. Find each one's careers page, note whether the URL contains `greenhouse.io`, `lever.co`, `ashbyhq.com`, `myworkdayjobs.com`. That list is the raw material for the most valuable part of the system and needs no code.
2. **This week:** Phase 0.1–0.3. Get one Greenhouse board pulling into Postgres. It's a couple of hours and it will immediately show you roles you weren't seeing.
3. **Before you write Phase 4:** buy the sending domain and start the DKIM warm-up. It runs on wall-clock time, not effort, and it's the one thing that can't be compressed later.
