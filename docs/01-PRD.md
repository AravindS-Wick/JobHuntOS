# Product Requirements Document — JobHunt OS

**Version:** 1.0
**Owner:** Aravindhan Sivaraman
**Date:** 24 August 2026
**Status:** Draft for build
**Mode:** Single-tenant personal platform, architected so multi-tenant is a later refactor and not a rewrite

---

## 1. Problem statement

The 2026 job market has inverted. A single opening now draws 242–250 applications and converts at 0.4%. Applying more does not help — 77% of hiring teams already see AI-generated applications and are discounting them. Meanwhile the highest-signal roles never reach LinkedIn or Naukri at all; they sit on company career pages behind Greenhouse, Lever, Ashby and Workday, and they are found by whoever is looking on the right day.

The individual job seeker's real constraints are **attention** and **latency**, not application count. Manually monitoring five job boards plus forty target-company career pages, tailoring a resume per role, finding a hiring manager's email, writing a personalised note, and tracking every thread costs 15–20 hours a week. Most people do a fraction of it, badly, and late.

**JobHunt OS is a personal job-search operating system that reduces that to ~3 hours a week of decisions, while making every application early, tailored, and accompanied by contact with a real human.**

---

## 2. Goals and non-goals

### Goals

| # | Goal | Success metric |
|---|---|---|
| G1 | Every relevant new posting surfaces within 60 minutes | Median time-from-post-to-surface < 60 min for Tier 1 |
| G2 | Applications go out with a role-tailored resume, never a generic one | 100% of submitted applications use a tailored variant |
| G3 | Every Tier 1 application is paired with human outreach within 24 hours | ≥ 80% of Tier 1 apps have a linked contact touch |
| G4 | Nothing is ever misrepresented on the user's behalf | 0 fabricated skill/experience claims; all screening answers traced to a fact table |
| G5 | Weekly time cost drops below 3 hours | Self-reported time log |
| G6 | Measurable callback rate materially above the 0.4% market baseline | ≥ 8% callback rate by week 8 |

### Non-goals (v1)

- Multi-tenant SaaS, billing, or user onboarding
- Unattended creation of accounts on third-party career portals
- Any volume target — the system deliberately caps daily applications
- Mobile application (mobile receives notifications and approve/reject only)
- Interview scheduling automation beyond proposing slots for user approval
- Resume *writing* from scratch — the system tailors an existing master resume

---

## 3. Users and personas

**Primary (and only, in v1): The Operator.** Senior engineer on notice period, ₹25 LPA+ target, remote-first preference, applying to 15–25 roles a week across India and global-remote. Technically capable, time-poor, and holds a LinkedIn account they cannot afford to lose. Wants judgement automated, not integrity.

**Secondary (v2 consideration): The Cohort.** Indian mid-to-senior engineers with the same board mix (Naukri, LinkedIn, Instahyre, Cutshort) and the same notice-period/CTC conventions that US-built tools handle poorly.

---

## 4. Product principles

1. **Quality gates over throughput.** The system caps applications per day. If it can only do 8 good ones, it does 8.
2. **Human on the outbound.** Anything that reaches another human — email, DM, connection request — is drafted by the system and approved by the user, until a template has earned autonomy through measured performance.
3. **Truth is a hard constraint.** Screening answers come from a verified fact table. If a fact isn't in the table, the system asks; it never infers or generates. Gaps are flagged honestly, as they already are in the user's manual process.
4. **Deterministic first, LLM as fallback.** Selector packs handle known ATS forms. The LLM is called only when the DOM is unrecognised. This is both a cost and a reliability decision.
5. **Own IP, own fingerprint, human cadence.** Authenticated actions run in the user's real browser session at human speed. Never a datacenter IP against LinkedIn or Greenhouse.
6. **Everything is observable.** Every action is logged with a screenshot and a reason. If something goes wrong, the user can see exactly what the agent did and why.

---

## 5. Functional requirements

### 5.1 Module A — Job Ingestion (`ingest`)

**A1. Board connectors**
- A1.1 Naukri via existing Apify actor (`muhammetakkurtt/naukri-job-scraper`), min 50 jobs/run, location filter applied post-pull
- A1.2 LinkedIn via existing Apify actor (`curious_coder/linkedin-jobs-scraper`), `f_TPR=r86400`
- A1.3 Indeed via the Indeed MCP connector (already available; within ToS)
- A1.4 Foundit (Monster India) — HTML scrape, lowest priority, most brittle
- A1.5 Instahyre / Cutshort / Wellfound — authenticated feed pull via extension session

**A2. Careers-page connectors — the differentiator**
- A2.1 **Greenhouse**: `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` — public, unauthenticated, no rate limit published
- A2.2 **Lever**: `GET https://api.lever.co/v0/postings/{company}?mode=json` — public
- A2.3 **Ashby**: `GET https://api.ashbyhq.com/posting-api/job-board/{board}` — public
- A2.4 **Workday**: tenant-specific `…/wday/cxs/{tenant}/{site}/jobs` POST endpoint — discoverable per company, needs per-tenant config
- A2.5 **SmartRecruiters / Recruitee / Personio**: public APIs, add opportunistically
- A2.6 **Target Company Registry**: user maintains a list of companies (name → ATS type → board token). System auto-detects ATS type from the company's careers URL on first add.
- A2.7 Fallback: for companies on none of the above, a scheduled headless fetch + LLM extraction of the careers page, run weekly not hourly

**A3. Normalisation & dedup**
- A3.1 All sources map to a canonical `Job` record (see §8)
- A3.2 Dedup by fuzzy match on `(company_normalised, title_normalised, location)` within a 14-day window — the same role appears on 4 boards and must count once
- A3.3 Ghost-job heuristic: flag postings re-listed >3 times in 90 days, or open >60 days with no edits (18–22% of listings are ghosts)

**A4. Scheduling**
- A4.1 ATS public APIs: every 60 minutes (cheap, legal, no rate concerns)
- A4.2 Apify actors: 2× daily (cost control)
- A4.3 Authenticated feeds: 1× daily, inside a human-plausible window

### 5.2 Module B — Scoring & Triage (`score`)

- B1. Score 0–100 on: stack match, seniority fit, work mode, company reputation, disclosed compensation, recency of posting, applicant count if visible
- B2. Preserve existing tiering: Tier 1 ≥ 70, Tier 2 50–69, Tier 3 30–49; below 30 is archived not deleted
- B3. **Semantic match** via pgvector: embed the master resume and each JD, cosine similarity as one scoring input alongside keyword rules
- B4. **Recency boost**: a posting under 6 hours old gets a multiplier — latency is a primary lever
- B5. **Gap detection**: automatically list JD requirements absent from the fact table (AWS, Kubernetes, GraphQL, Terraform, etc.) and attach them to the job record for honest handling downstream
- B6. Hard filters: salary floor ₹24 LPA, seniority, work-mode priority order (Remote India > Hybrid Chennai > Remote Global USD > Onsite Chennai)
- B7. Output: a ranked daily queue, Tier 1 capped at 5, Tier 2 at 7, Tier 3 at 8

### 5.3 Module C — Document Generation (`tailor`)

- C1. Master resume + verified fact table are the only sources of truth
- C2. Per role: extract JD keywords → map to fact-table entries → reorder bullets by relevance → adopt JD language where truthful → select 1–2 relevant projects → adjust seniority framing
- C3. Header format enforced: `ARAVINDHAN SIVARAMAN | [Role Title] | [Role-specific skills only] | Chennai | +91 XXXXXXXXXX | email | LinkedIn | GitHub`
- C4. Subtitle skills must intersect JD **and** fact table. No forced skills. This is a validation rule, not a prompt instruction.
- C5. **Output both DOCX and PDF** for every variant
- C6. Cover letter generated only for Tier 1, and only when the JD or portal asks for one
- C7. Every generated document is diffed against the master and the diff is shown in the approval UI
- C8. ATS-safety validator: no tables in the resume body, no text in headers/footers, standard section headings, parseable date formats

### 5.4 Module D — Application Execution (`apply`)

- D1. **Deterministic selector packs** per ATS: Greenhouse, Lever, Ashby, Workday, Naukri, LinkedIn Easy Apply, SmartRecruiters. Versioned, with health checks that detect DOM drift.
- D2. **LLM fallback**: when no pack matches, a vision+DOM agent maps fields to the fact table and produces a proposed fill for approval. Never auto-submits on the fallback path in v1.
- D3. **Screening question resolver**: matches the question to the fact table. Three outcomes — *answer* (fact exists), *ask* (queue to user, cache the answer to the fact table), *abort* (question implies a disqualifying misrepresentation).
- D4. **Human Gate queue**: CAPTCHA, SMS OTP, account registration, or any unrecognised blocker pauses the run, screenshots the page, and pushes a notification. User clears it; the agent resumes from the checkpoint. Target: < 10 seconds of user time per gate.
- D5. **Rate governor** (hard limits, non-configurable above ceiling):
  - LinkedIn Easy Apply: ≤ 12/day
  - LinkedIn connection requests: ≤ 20/day (below the 20–25 established-account guidance)
  - LinkedIn DMs: ≤ 15/day, each individually personalised
  - Naukri applies: ≤ 30/day
  - ATS direct applies: ≤ 15/day
  - Randomised inter-action delays, 45–180s; no activity outside 08:00–23:00 IST; no weekend LinkedIn bursts
- D6. Every submission captures a confirmation screenshot and the submitted field values
- D7. **Naukri profile freshness job**: daily resume re-upload / profile touch to maintain recruiter-search ranking

### 5.5 Module E — Outreach (`reach`)

- E1. **Contact discovery**: for each Tier 1 company, identify hiring manager and recruiter via LinkedIn people search (session-based), Hunter.io/Apollo free tier, and email-pattern inference with SMTP verification
- E2. **Email composition**: personalised per role using the existing cold-outreach playbook templates. Never a shared template body across recipients.
- E3. **Sending infrastructure**: dedicated domain (e.g. `aravindhan.dev`) via Postmark or Resend, SPF/DKIM/DMARC configured, warm-up period of 2 weeks at low volume. **Never send cold outreach from the primary Gmail.**
- E4. Volume ceiling: ≤ 15 cold emails/day, ≤ 3 per company, max 2 follow-ups spaced 4 and 9 days, auto-stop on any reply
- E5. Mandatory: real identity, real signature, working one-click opt-out, physical location line
- E6. **LinkedIn outreach**: connection request + note, or InMail, drafted per person. Approval required for every one in v1.
- E7. Referral-request flow: when a target company matches a 1st/2nd-degree connection, draft a referral ask instead of a cold application

### 5.6 Module F — Inbox Intelligence (`inbox`)

- F1. Gmail API (`gmail.readonly`, `gmail.modify`, `gmail.compose`) on a personal OAuth client — **personal-use exemption applies; no CASA assessment needed while single-user**
- F2. Classify every inbound message: `recruiter_outreach` / `application_ack` / `rejection` / `interview_invite` / `assessment_link` / `offer` / `noise`
- F3. Auto-link each thread to the correct application record
- F4. **Draft** replies for every actionable class. Auto-send permitted only for a narrow whitelist configured by the user (e.g. availability confirmation), and only after that template has been manually approved 10 times without edit.
- F5. Assessment links (HackerRank, CoderPad, Karat) extracted with deadline → calendar event created
- F6. Interview invites → propose slots against Google Calendar free/busy → user approves → reply sent
- F7. Rejection detection closes the application record and, for Tier 1, triggers a "keep warm" note to the contact after 90 days

### 5.7 Module G — Tracker & Analytics (`track`)

- G1. Replaces `Job_Search_Tracker.xlsx` while preserving its status model: To Apply / Applied / Emailed / LinkedIn-Engaged / Recruiter-Replied / Phone Screen / Tech Round 1 / 2 / Final / Offer / Rejected / Withdrew
- G2. Funnel dashboard with conversion rate at each stage
- G3. **Experiment tracking**: which resume variant, which outreach template, which time-of-day, which source board — measured against callback rate. This is what tells you in week 10 whether you have a product.
- G4. Export to XLSX on demand (keep the existing workbook as a reporting artifact)
- G5. Weekly digest: what went out, what came back, what needs a decision

### 5.8 Module H — Control Surface (`console`)

- H1. Web dashboard: daily queue, approval inbox, human-gate queue, tracker, analytics
- H2. **Approval inbox** is the core screen — a stack of cards, each showing the job, the score, the tailored resume diff, the drafted outreach, and Approve / Edit / Reject. Target: 20 decisions in 10 minutes.
- H3. Mobile: Telegram bot (or PWA push) for human gates and approvals. Notification → tap → approve/reject. No mobile app build.
- H4. Kill switch: one control that halts all outbound activity immediately
- H5. Full audit log with screenshots, filterable by job, by day, by action type

---

## 6. Explicit out-of-scope, with reasons

| Excluded | Why |
|---|---|
| Autonomous career-portal account creation | Blocked by CAPTCHA and SMS OTP; violates ATS terms; replaced by the Human Gate (D4) |
| CAPTCHA-solving services | Puts the project in clear ToS violation with no proportional benefit |
| Bulk identical outreach | Torches domain reputation, triggers LinkedIn bans, and converts worse than doing nothing |
| Auto-answering unknown screening questions | Misrepresentation risk. The system asks instead. |
| Auto-send on all email | One wrong reply to a recruiter costs a role. Draft-and-approve. |
| Applying above the daily governor | The data says marginal returns go negative. This is a product decision, not a technical limit. |

---

## 7. Non-functional requirements

- **NFR1 — Security.** Session cookies and OAuth tokens encrypted at rest (AES-256-GCM, key in OS keychain / GCP Secret Manager). Never logged. Never leave the local machine in v1.
- **NFR2 — Reliability.** Any failed application is retryable from checkpoint. No silent failures — a failure produces a card in the approval inbox.
- **NFR3 — Observability.** Structured logs, per-run trace ID, screenshot on every submit and every error.
- **NFR4 — Cost ceiling.** Runtime LLM spend ≤ $15/month. Enforced by a token budget guard that degrades to deterministic-only when exceeded.
- **NFR5 — Portability.** No feature may depend on the local machine in a way that blocks a later move to a VPS, except the authenticated browser worker (which is intentionally local).
- **NFR6 — Data minimisation.** Third-party contact data (recruiter emails) stored only for active applications; purged 180 days after an application closes.

---

## 8. Core data model

```
Company        id, name, normalised_name, ats_type, board_token, careers_url, tier, notes
Job            id, company_id, source, source_url, external_id, title, description,
               location, work_mode, salary_min, salary_max, posted_at, first_seen_at,
               score, tier, gaps[], ghost_score, status, dedup_hash
Application    id, job_id, resume_version_id, cover_letter_id, submitted_at, method,
               status, confirmation_screenshot, submitted_fields (jsonb), ats_ref
FactTable      id, key, value, evidence, verified_at        -- the truth constraint (G4/D3)
ResumeVersion  id, base, job_id, docx_path, pdf_path, diff_summary, created_at
Contact        id, company_id, name, role, email, email_confidence, linkedin_url,
               discovered_via, consent_state, purge_after
Outreach       id, application_id, contact_id, channel, template_id, body, status,
               sent_at, replied_at, thread_id
Thread         id, application_id, gmail_thread_id, classification, last_message_at
Event          id, entity_type, entity_id, action, actor (agent|user), payload, screenshot,
               created_at                                    -- the audit log
RunLog         id, module, started_at, finished_at, status, cost_usd, error
```

---

## 9. Milestones

| Phase | Weeks | Ships | Value delivered |
|---|---|---|---|
| **P0 — Ingestion** | 1–2 | Modules A + B, CLI output | Careers-page jobs nobody else sees, scored daily. **Immediate value.** |
| **P1 — Documents** | 3 | Module C + fact table | Tailored DOCX+PDF in one command |
| **P2 — Console** | 4 | Module H (web) + G (tracker) | Replaces the spreadsheet; approval inbox live |
| **P3 — Apply** | 5–6 | Module D: Greenhouse/Lever/Ashby packs + Naukri + human gate | Hands-off ATS applying |
| **P4 — Outreach** | 7–8 | Module E + F | The 2.6% → 6.6% lever. Highest ROI phase. |
| **P5 — LinkedIn + polish** | 9–10 | LinkedIn Easy Apply + DMs, Workday semi-auto, analytics | Full coverage |
| **P6 — Decision point** | 10 | Read the analytics | Productize or stop. Decide with data. |

---

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LinkedIn account restriction | Medium | **High** | Governor below published safe limits; own IP + real session; personalised messages only; LinkedIn is P5, not P1 — prove the rest works first |
| ATS DOM drift breaks selector packs | High | Medium | Weekly automated health check per pack; LLM fallback path; failures surface as cards, never silent |
| LLM cost overrun | Medium | Low | Deterministic-first design; cheap model at runtime; hard token budget (NFR4) |
| Over-automation produces a bad send | Medium | **High** | Approval gates on everything outbound in v1; earned-autonomy model (F4) |
| Build time crowds out actual job searching | **High** | **High** | P0 ships value in week 2; strict 10–15 hr/week cap; if week 4 arrives with no applications sent, pause the build |
| The tool doesn't beat manual applying | Medium | Medium | G3 experiment tracking measures this honestly from day one |
| Gmail OAuth scope changes / CASA required | Low (single-user) | Medium | Personal-use exemption documented; IMAP+app-password fallback path kept viable |

---

## 11. Success criteria for v1

The build is a success if, by week 10:

- Time spent on job-search mechanics is under 3 hrs/week
- ≥ 60% of applications come from sources other than LinkedIn/Naukri (i.e. careers pages are working)
- Callback rate ≥ 8%, measured against the 0.4% market baseline
- Zero instances of misrepresentation in a submitted application
- Zero platform account restrictions
- The user can answer, with data, whether this should become a product
