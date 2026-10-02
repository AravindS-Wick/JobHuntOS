# Apply Engine — how jobs become submitted applications

**Status:** built 2026-10-02 · companion to `01-PRD.md` (Modules A, C, D) and `05-API-AND-UI-MAPPING.md`

The apply engine finds roles on job boards and company careers pages,
tailors the master resume for each one without adding anything, lets the
user approve a batch, and submits from the user's own browser within daily
caps. Anything it can't do truthfully or safely stops at the Human Gate.

---

## 1. The flow

```
 job sources ──► jobs (scored, deduped) ──► prepare ──► review ──► approve ──► worker ──► submitted
  14 boards                                  │                     │           │
  26 company ATS boards                      │ tailored DOCX+PDF   │ governor  │ Human Gate:
  browser-only boards → scrape tasks         │ truth check         │ schedules │ CAPTCHA, login,
                                             │ form pre-answers    │           │ unknown question
```

| Stage | Where | What happens |
|---|---|---|
| Find | `connectors/*`, `services/boards.ts`, `services/ingest.ts` | Direct boards are fetched by the API; Naukri, Indeed, Glassdoor, Wellfound and Cutshort block non-browser clients, so they become `scrape` tasks for the worker |
| Score | `core/score.ts` | Unchanged model, plus: non-engineering titles are disqualified; unknown work mode in an unlisted city is penalised; company `signal` counts |
| Prepare | `services/applications.ts` → `prepare` | Tailor (`core/tailor.ts`), validate, render (`documents/render.ts`), cover letter for Tier 1, resolve published form questions (Greenhouse) |
| Review | console → Apply Pipeline | Job + gaps, what changed in the resume, truth-check result, every form answer and its reason, questions waiting for you |
| Approve | `applications.approve` | Each application gets a slot from the rate governor and an `apply` task |
| Submit | `apps/worker` | Claims due tasks, opens the form, fills, uploads the PDF, clicks Submit once, verifies confirmation |

## 2. Truth model

| Rule | Enforced by |
|---|---|
| Tailoring may only reorder, select and trim the master resume | `tailorResume` never writes new text |
| No new skill, bullet, number, technology or contact detail | `validateVariant`; a failing variant is `blocked` and can't be approved |
| LLM rephrasing (future) must not add numbers or technologies | `rephraseIsSafe` |
| Form answers come from the master resume or verified facts | `core/answers.ts` → `resolveScreeningQuestion` |
| A skill with no verified year count is never estimated | resolver returns `ask` |
| Work authorization depends on the job's country | `countryOf(job location)`; questions that depend on an earlier selection → `ask` |
| Voluntary demographic questions are declined, not guessed | `answers.ts` |
| A question that would require misrepresentation stops the application | resolver `abort` → `blocked` |
| A human's answer can be saved as a fact and reused | `saveAsFact`; matched by question text (company names normalised for "how did you hear about us") |

Personal facts (contact details, address, current salary) are **not** in the
code defaults: the repo is public. They come from the master resume or are
asked once and stored in the local database.

## 3. Rate governor

`core/governor.ts`. Ceilings, never targets.

| Platform | Per day | Gap between submissions |
|---|---|---|
| LinkedIn | 12, weekdays only | 2–7 min |
| Naukri | 30 | 45 s–3 min |
| Indeed | 15 | 1–4 min |
| Foundit, Instahyre | 20 | 45 s–3 min |
| Cutshort, Wellfound | 15 | 1–4 min |
| Company ATS (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, …) | 15 combined | 45 s–3 min |

All activity is kept inside 08:00–23:00 IST. A full day rolls to the next.

## 4. Worker protocol

The API never drives a browser. The worker runs on the user's machine, in a
dedicated persistent Chrome profile (`~/.jobhunt/chrome-profile`), and talks
to the API over HTTP only, so the same protocol works when the API is hosted.

```
POST /agent/claim                 → { kind: 'apply' | 'scrape', bundle }  (or null)
POST /agent/tasks/:id/report      ← submitted | scraped | needs_human | failed
GET  /agent/tasks/:id             (polled while waiting at the Human Gate)
POST /agent/tasks/:id/continue    → latest answers; the worker resumes on the same page
```

- `claim` is atomic (`for update skip locked`); tasks held >15 min by a crashed worker are released.
- A skipped or edited application is never submitted, even if its task was queued.
- `failed` with `retryable` backs off 10 → 20 → 40 min, then gives up.
- After the Submit click nothing retries automatically: an unconfirmed submission is reported, never repeated.
- No stealth flags, no fingerprint spoofing, no CAPTCHA services.

## 5. Form engine (`apps/worker/src/form.ts`, `runner.ts`)

1. Read visible fields in the form/modal; stamp each with `data-jh-id`. Hidden validation inputs and invisible CAPTCHAs are ignored.
2. Open custom dropdowns briefly to read their options (scoped to the control's own listbox).
3. Answer each field (`planFields`): known answers > consent rule > site pre-fill > `answerQuestion`.
4. Required `ask` → Human Gate; `abort` → stop.
5. Fill: typed at human speed; dropdowns must match an option exactly or by prefix — no match goes to the human (pressing Enter could pick a wrong option).
6. Next / Submit; detect "won't advance" and validation errors; verify the confirmation text or URL.

`pnpm worker:smoke` runs this against current Greenhouse, Lever and Ashby
jobs with the sample resume and stops before Submit. Run it after any change
here, and weekly to catch layout drift.

## 6. Status by platform (2026-10-02)

| Platform | Search | Apply |
|---|---|---|
| Greenhouse, Lever, Ashby | ✅ public API | ✅ live-verified to the Submit button |
| Workday | ✅ public API (`?q=India` tokens) | Beta: per-company account → Human Gate first |
| SmartRecruiters, Zoho Recruit | ✅ public API | Beta / manual |
| LinkedIn | ✅ guest API (no cookies sent from the server) | Beta: Easy Apply adapter, **not yet run with a real login** |
| Naukri | ✅ via the worker | Beta, not yet run with a login; chatbot questions likely need adapter work |
| Indeed | ✅ via the worker | Beta, not yet run with a login |
| Glassdoor | ⚠️ via the worker, intermittent | Mostly redirects to the company ATS |
| Wellfound, Cutshort | ✅ via the worker | Beta |
| Instahyre, Foundit, YC | ✅ public API | Beta |
| Google, Microsoft, Amazon | ✅ public API | Manual: tailored resume generated, you submit |
| HN Who is hiring, RemoteOK | ✅ public API | Manual (email / external link) |
