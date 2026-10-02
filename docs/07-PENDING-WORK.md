# Pending work

**As of:** 2026-10-02, after the apply engine (PR #23). Ordered by what gets real
applications out soonest. Tick items off in the draft PR that tracks this file.

## 1. Verify auto-apply on login-based sites (next session)

Needs the owner's logins in the worker profile: `pnpm worker:login linkedin naukri indeed`.
Each check is a dry run (`pnpm worker:try "<job url>"`): fill everything, stop before Submit.

- [ ] LinkedIn Easy Apply: 3 real jobs. Watch the resume step (previously uploaded vs upload) and multi-step Review.
- [ ] LinkedIn external "Apply" → company ATS hand-off
- [ ] Naukri apply + recruiter chatbot questions (chip buttons, not inputs: likely needs an adapter change)
- [ ] Naukri "Apply on company site" hand-off
- [ ] Indeed Apply (smartapply multi-step)
- [ ] Foundit, Instahyre, Cutshort, Wellfound one-click apply
- [ ] Workday: account sign-in at the Human Gate, then the multi-step form
- [ ] First real submissions at low volume (2–3 per platform), screenshots reviewed

## 2. Owner's real data

- [ ] Upload the real resume; correct the parse in the console
- [ ] Enter facts that are not in code (public repo): phone, email, address, postal code, current CTC, profile links
- [ ] Fix `currently_serving_notice` (fact says false; build plan says 60-day notice)
- [ ] Confirm degree, graduation year and per-skill years in `packages/core/src/facts.ts`

## 3. Referral engine

Owner decision (2026-10-02): referral asks **auto-send within daily caps**.

- [ ] Update `CLAUDE.md` rule 2 to record the decision and its caps
- [ ] Contact discovery: LinkedIn people search in the worker, email-pattern inference + verification
- [ ] Per-person drafts (no shared bodies; similarity check), daily caps through the governor
- [ ] Sending domain with SPF/DKIM/DMARC and warm-up. PRD E3: never cold-send from the primary Gmail; `/outreach/send` currently does
- [ ] Reply detection stops follow-ups; track referral → interview conversion

## 4. Pro tier (sellable product)

- [ ] Accounts and auth; per-user data isolation (tenant id on every table)
- [ ] Hosted API + paired local worker (per-worker token, `/agent/*` scoped to the user)
- [ ] Secrets encrypted at rest (PRD NFR1): session data never leaves the user's machine
- [ ] Billing (Razorpay for India, Stripe elsewhere), plans and usage limits
- [ ] Onboarding: resume upload → facts interview → first search, in under 10 minutes
- [ ] Terms of service and privacy policy; per-platform risk disclosure (site terms, account restrictions)

## 5. Quality and coverage

- [ ] Scheduled search (hourly company boards, twice daily job boards) and a daily Tier 1 digest
- [ ] Glassdoor search is intermittent: detect its wall and send it to the Human Gate
- [ ] Google / Microsoft / Amazon apply automation (currently manual with tailored resume)
- [ ] Registry: fix Postman, Swiggy, PhonePe, Uber, Zepto, Juspay, Atlassian, Walmart, Dell tokens; grow to 60 India-relevant companies
- [ ] Optional LLM rephrasing of bullets behind `rephraseIsSafe` (needs an API key and a cost cap, PRD NFR4)
- [ ] Console: other tabs still use demo data and show simulated success when the API is down; move them to the real API like Apply Pipeline
- [ ] `/connectors/test` reports "connected" without testing for several platforms
- [ ] Weekly scheduled CI job running `pnpm worker:smoke` to catch ATS layout drift
