# JobHunt OS — Feasibility & Viability Analysis

**Prepared for:** Aravindhan Sivaraman
**Date:** 24 August 2026
**Decision context:** Personal tool first, productize later · Pragmatic ToS risk (local, human-paced, own accounts) · 10–15 hrs/week build budget · $100 Claude credits available

---

## 1. The one-paragraph answer

Yes, this is feasible — about **85% of what you described is buildable in 8–10 weeks** at 10–15 hrs/week, and you already own most of the hard parts (Naukri/LinkedIn scrapers, scoring, resume tailoring, tracker). The 15% that is *not* feasible is specific and worth naming up front: **fully unattended account creation on company career portals**. That breaks on CAPTCHA, phone/SMS OTP, and per-company Workday registration walls — not on engineering skill. The honest design target is *"agent does 100% of the work, human clears a 10-second gate on ~20% of applications."*

The bigger finding is strategic, and it argues against the shape of the thing you described. **Volume is not the bottleneck in the 2026 market — it is actively counterproductive.** The measured data says fully-automated blast tools convert at **0.1–2%**, human-reviewed copilot tools at **5–15%**, and human-assisted managed services at a claimed **40–60%**. Referred candidates match at **6.6%** vs **2.6%** for non-referred. So the product that actually pays you back is not "apply to 500 jobs" — it is **"be among the first 10 applicants on a role that fits, with a tailored resume and a named human contacted within 24 hours."** Build for speed-to-posting and contact discovery, not throughput.

---

## 2. What is genuinely feasible, and how hard each piece is

| Capability you asked for | Feasible? | Difficulty | Notes |
|---|---|---|---|
| Unified job feed across LinkedIn, Naukri, Foundit, Indeed | ✅ Yes | Low | You already run 3 of these. Indeed + ZipRecruiter MCP connectors are available in your Claude session already — free and within ToS. |
| **Company careers pages (the jobs not on job boards)** | ✅ Yes — **and easier than you think** | **Low** | Greenhouse, Lever, Ashby all expose **public, unauthenticated JSON APIs** for every company's board. `boards-api.greenhouse.io/v1/boards/{co}/jobs`, `api.lever.co/v0/postings/{co}`, `api.ashbyhq.com/posting-api/job-board/{co}`. No scraping, no ToS violation, no CAPTCHA. This single insight solves your "many jobs aren't on LinkedIn" problem cleanly. Workday and SAP SuccessFactors need real browser automation. |
| Auto-apply on Naukri (Easy Apply) | ✅ Yes | Low–Med | Well-trodden. Multiple OSS Selenium bots exist. Naukri sessions expire in ~weeks. Bonus high-ROI trick: daily resume re-upload bumps your "last active" and materially increases recruiter inbound. |
| LinkedIn Easy Apply | ⚠️ Yes, with real risk | Med | No API exists for this. Browser-only. LinkedIn maintains extension blacklists and does behavioural + device-fingerprint + IP analysis. Documented permanent bans. Keep to ≤10–15/day, human-paced. |
| Greenhouse / Lever / Ashby form submission | ✅ Yes | Med | Deterministic selector packs work. Greenhouse flags datacenter IPs and VPNs — another reason to run from your own residential IP. |
| Workday form submission | ⚠️ Partial | High | Hidden form fields, per-company account registration, multi-step review page, CAPTCHA. Semi-auto only: agent fills, you clear the gate. |
| Indeed apply | ⚠️ Partial | High | CAPTCHA walls defeat most tools. Use the Indeed MCP for *sourcing*, apply through the employer's own ATS where possible. |
| Cold email to HMs/recruiters | ✅ Yes | Low | Fully legal when it's one-to-one, personalised, sent under your real identity, with an opt-out. This is your highest-leverage feature. |
| Gmail read / classify / draft replies | ✅ Yes | Low | Gmail API. **For personal use you are exempt from Google's CASA security assessment** — that exemption disappears the moment you make it multi-user. |
| Gmail **auto-send** replies unattended | ⚠️ Technically yes, strategically no | Low | A wrong auto-reply to a recruiter costs you the role. Draft-and-approve is the correct design; auto-send only for a narrow whitelist (e.g. "acknowledge receipt", "confirm interview slot"). |
| LinkedIn cold DMs / connection requests | ⚠️ Yes, with risk | Med | Safe envelope: 20–25 connects/day on an established account, personalised. Copy-paste bulk messaging is the #1 ban trigger. |
| Cutshort / Wellfound / Instahyre outreach | ✅ Yes | Med | Same browser-automation pattern; smaller, less defended platforms. |
| **Autonomous account creation on careers portals using your Gmail** | ❌ **No — this is the wall** | — | Blocked by reCAPTCHA Enterprise / Cloudflare Turnstile, phone-number OTP on many Workday tenants, and it violates every ATS's terms. Email-link verification *is* solvable via Gmail API; CAPTCHA and SMS are not, without paid solver services that put you squarely in ToS-violation and, in some jurisdictions, CFAA-adjacent territory. **Recommendation: build a "human gate" queue instead — the agent drives to the wall, pings your phone, you tap through in 10 seconds, the agent resumes.** |

---

## 3. Does anything like this already exist, and does it work?

Yes — the space is crowded and mostly disappointing. Independent 2026 testing found only 3 of 8 tools actually complete end-to-end submission.

| Tool | Model | Price | Measured result |
|---|---|---|---|
| **FastApply** | Chrome extension, co-pilot + auto-pilot | Freemium → paid | 47/50 submissions, 150+ ATS variants — best in class |
| **Jobright.ai** | Cloud, matching + selective apply | $20–40/mo | Good matching, limited platform coverage, less user control |
| **LoopCV** | Cloud, email + LinkedIn focused | $5–88/mo | 38/50 submissions; mixed reviews (2.0/5 on Product Hunt) |
| **LazyApply** | Extension, bulk blast | $99–249 | **~2% interview rate**; buggy; fails on Workday/Greenhouse/Lever |
| **Sonara** | Cloud, bulk blast | $24–80/mo | **0.14% interview rate** (1 interview from 700 applications); "black box"; briefly discontinued |
| **Simplify / Teal / Huntr** | Extension autofill only | Free–$30/mo | 0/50 auto-submissions — they fill, you click |
| **scale.jobs** | Human VAs, not bots | $199–349 | Claims 40–60% callback (vendor-reported, unverified) |
| **AIHawk / OSS Selenium bots** | Self-hosted | Free | Works until the DOM changes; maintenance burden is the product |

**Uplers' "Happy" — confirmed real, but read what it actually is.** It lives at `platform.uplers.com/talent/job-agent` behind a talent login, and Uplers ships a Chrome extension under their publisher account. Public detail is thin because it's gated. The important nuance: **Uplers is a talent marketplace that places Indian engineers with global startups.** Happy is a funnel into *their* client roles, not a general-purpose agent that applies across the open web. Its "auto-apply + outreach" almost certainly operates inside Uplers' own opportunity pool, where they control both sides and there is no ToS problem to solve.

That distinction matters for you: Happy is not the competitor you'd be building against, and it is not proof that open-web autonomous applying works. The tools actually attempting the open-web version are the ones in the table above, and their measured numbers are in the same table.

**The actual gap in the market:** almost every serious tool is US-first. Naukri, Foundit, Instahyre, Cutshort and Indian salary/notice-period conventions are poorly served. That is a real niche — but see §6 on whether it's a *business*.

---

## 4. Success rate — the numbers that should shape the design

- **242–250 applications** per job opening on average, up from ~100 five years ago
- **291 applications processed per hire** (2026), up from ~100 in 2021
- **0.4%** overall success rate per application submitted
- **2.6%** match rate for non-referred candidates vs **6.6%** for referred — a **2.5× multiplier from one human contact**
- **77%** of hiring teams now regularly encounter AI-generated applications, and **41%** are moving away from resume-first hiring
- **18–22%** of listings in a typical quarter are ghost jobs
- Personalised applications are **~2.3× more likely** to earn an interview
- Time-to-fill is up **~25%** vs pre-pandemic

**What this means for your build:** the ROI is concentrated in three levers, in this order.

1. **Latency.** Applying within the first hours of a posting beats applying with a better resume a week later. Your nightly 9 PM job is already good; make it near-real-time for Tier 1 matches.
2. **A named human.** Email/LinkedIn contact discovery + a personalised note is worth more than 200 extra applications. This is the 2.6% → 6.6% lever.
3. **Tailoring.** You already do this well. Automate it, don't reinvent it.

Volume is the *fourth* lever and it has negative marginal returns past ~15–20 quality applications a week.

---

## 5. Form factor: extension vs cloud vs desktop vs mobile

**Recommendation: hybrid — Chrome extension + local orchestrator + web dashboard. Not pure cloud. Not mobile.**

| Option | Verdict | Reasoning |
|---|---|---|
| **Chrome extension** | ✅ **Core of the system** | Runs inside *your* authenticated session, from *your* residential IP, with *your* real device fingerprint. That combination is the single biggest ban-avoidance lever available. Handles session capture, on-page form fill, LinkedIn/Naukri actions. Manifest V3 constraints are manageable. |
| **Local orchestrator (Node service on your PC)** | ✅ **Core of the system** | Owns the queue, the DB, the LLM calls, the scheduling. Keeps credentials on your own disk. Zero hosting cost. Playwright with a persistent Chrome profile for headed automation. |
| **Cloud-hosted bot farm** | ❌ **Avoid for v1** | Two sources disagree here — one vendor argues cloud is *safer* because no extension fingerprint; Jobscan's reporting says **Greenhouse actively flags datacenter IPs and VPNs**, and LinkedIn correlates IP with device history. For a single user with one precious LinkedIn account, running from your own IP wins. Cloud becomes necessary only if you productize (see §7). |
| **Desktop app (Electron/Tauri)** | 🤔 Later | Nicer packaging for a v2 product, but adds work now for no capability gain. Tauri if you ever ship it — smaller, and you'd learn Rust-adjacent tooling. |
| **Mobile app** | ❌ No | Wrong surface entirely. You cannot drive browser automation from a phone. What you *do* want on mobile is **notifications + approve/reject** — solve that with a Telegram bot or PWA push in 4 hours, not a React Native app. |

**Cost of that decision:** your machine must be on for the automation window. Mitigation: a ₹500/mo Hetzner ARM box or GCP e2-micro running the *orchestrator* (queue, scrapers, LLM, dashboard) 24/7, with the *browser worker* still on your machine over Tailscale. Scrapers and ATS API pulls don't need your IP; only the authenticated actions do.

---

## 6. What is this project worth?

**As a personal ROI tool — very high. This is the strongest argument for building it.**

If it compresses your search by four weeks on a ₹25 LPA target, that is roughly **₹2 lakh of direct value** plus the option value of a better-fitting role. Your running cost is $15–40/month. Payback is essentially immediate. Given your active 60-day-notice search, this is the case that justifies the build.

**As a product — moderate ceiling, hard economics. Be clear-eyed.**

- Build cost if you outsourced it: **4–6 person-months**. At senior Indian contract rates ₹1.5–2.5L/month → **₹8–15 lakh** (~$10–18K). At US contract rates, **$60–100K**.
- Market pricing is established and low: $19–99/mo globally; for an India-first product realistically **₹499–999/mo**.
- **Structural churn problem:** your customer's success is your churn event. Average customer lifetime is one job search — 2–4 months. LTV at ₹799/mo × 3 months ≈ **₹2,400**. You need CAC well under ₹800 for that to work, which means organic/content only, no paid acquisition.
- To reach **$1,000 MRR** (your stated target from the earlier income plan) you need roughly **150–250 paying users**, replaced every 3 months. That's a content-and-community grind, not an engineering problem.
- Defensibility is weak. The moat is ATS selector-pack maintenance, which is labour, not IP.

**Honest conclusion:** build it for yourself, unreservedly. Treat productization as a *separate decision to be made in week 10 with real data* — specifically, your own measured callback rate. If you get to 12%+ callbacks against a market baseline of 0.4%, you have a story worth selling. If you don't, you have a tool that got you a job, which is the better outcome anyway.

---

## 7. Legal and ethical boundaries — read this once, then design within it

- **ToS violation ≠ crime.** Post-*hiQ v. LinkedIn* (settled 2022), scraping public data isn't a CFAA violation, but it does breach LinkedIn's User Agreement. The realistic penalty is account restriction or ban, not litigation — but your LinkedIn account is a working asset during an active search. Weigh it accordingly.
- **Cold email is legal** when it's one-to-one, personalised, from your real identity, with a working opt-out, and about a genuine professional interest. Under India's DPDP Act, GDPR legitimate-interest, and CAN-SPAM this is all fine. **Bulk-blasting the same template to 500 recruiters is not** — and it will torch your domain reputation faster than any law will touch you. Send cold email from a **separate domain**, never your primary Gmail.
- **Never let the agent misrepresent you.** Screening questions ("years of Kubernetes experience?") must be answered from a verified fact table, never generated. You already maintain honest gap-flagging across every resume — encode that as a hard constraint in the system, not a prompt suggestion.
- **Do not mass-create accounts.** Per-company career-portal registration that you personally complete is normal candidate behaviour. Automating it at scale is account fraud in most ATS terms.
- **Other people's data.** If you scrape recruiter emails, you become a data controller. Store the minimum, don't resell, honour deletion requests. This becomes a real obligation the moment you productize.

---

## 8. Verdict

| Question | Answer |
|---|---|
| Is it feasible? | **Yes — 85% of it, in 8–10 weeks at your stated pace.** |
| The infeasible 15%? | Unattended account creation behind CAPTCHA/OTP. Replace with a 10-second human gate. |
| Is it viable as a business? | Marginally. Crowded market, structural churn, weak moat. Revisit in week 10 with your own conversion data. |
| Is it worth building for yourself? | **Unambiguously yes.** ~₹2L of expected value against a ~$30/mo running cost. |
| Best form factor? | Extension + local orchestrator + web dashboard. Phone gets notifications only. |
| Success rate to expect? | 5–15% callback if you build for tailoring + contact discovery. 0.1–2% if you build for volume. **The design choice determines which.** |
| Will $100 of Claude credits cover it? | To *build* it, yes if disciplined — see the budget in `03-BUILD-PLAN.md`. Runtime LLM calls must run on a cheap model, not out of this budget. |

---

## Sources

- [Auto-Apply to Jobs Tools Compared: Which Job Application Bot Actually Works in 2026? — FastApply](https://blog.fastapply.co/auto-apply-jobs-tools-compared-2026)
- [AI Job Application Bots: Which Actually Submit Applications in 2026? — FastApply](https://blog.fastapply.co/ai-job-application-bots-which-actually-submit-2026)
- [Auto-apply job tools have exploded. Are they worth it in 2026? — Jobscan](https://www.jobscan.co/blog/auto-apply-job-tools/)
- [The Average Job Opening Now Gets 242 Applications (And a 0.4% Chance of Landing It) — The Interview Guys](https://blog.theinterviewguys.com/the-average-job-opening-now-gets-242-applications/)
- [The job application got faster. The job search got worse. — Axios](https://www.axios.com/2026/08/21/job-seekers-ai-hiring-ghost-jobs-trust)
- [Is LinkedIn Automation Safe in 2026? ToS & Scraping Rules — ConnectSafely](https://connectsafely.ai/articles/is-linkedin-automation-safe-tos-scraping-guide-2026)
- [Restricted scope verification — Google for Developers](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Auto-Apply on Naukri & LinkedIn Without Sharing Your Password — ApplyCove](https://applycove.com/blog/job-portal-session-sync-without-password/)
- [Browserbase pricing — UsagePricing](https://www.usagepricing.com/blueprint/browserbase)
- [Uplers introduces AI-powered matching to help startups hire faster — YourStory](https://yourstory.com/2026/07/uplers-introduces-ai-powered-matching-help-startups-hire-faster)
