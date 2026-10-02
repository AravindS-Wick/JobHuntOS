#!/usr/bin/env tsx
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { parse as parseYaml } from 'yaml';
import pc from 'picocolors';
import { PROFILE, dedupe, normalizeJob, scoreJob, type CompanyEntry, type ScoredJob } from '@jobhunt/core';
import { detectAts, fetchCompany, loadRegistry, mapWithConcurrency, parseAshby, parseGreenhouse, parseLever } from '@jobhunt/connectors';
import { renderDigest, renderSummary } from './report.js';
import { createRepos, closeDb, getDb } from '@jobhunt/db';
import { syncRegistry } from '@jobhunt/services';

const ROOT = resolve(process.cwd());
const REGISTRY = resolve(ROOT, 'config/companies.yaml');
const OUT = resolve(ROOT, 'out/jobs.json');

const program = new Command()
  .name('jobhunt')
  .description('JobHunt OS — Phase 0: ingest, dedupe, score')
  .version('0.1.0');

// ---------------------------------------------------------------- detect ----
program
  .command('detect <url>')
  .description('Work out which ATS a careers URL uses and the board token to add to companies.yaml')
  .action((url: string) => {
    const d = detectAts(url);
    console.log('');
    if (d.token && d.ats !== 'unknown') {
      console.log(pc.green(`  ATS    ${d.ats}`));
      console.log(pc.green(`  token  ${d.token}`));
      console.log('');
      console.log(pc.dim('  Add to config/companies.yaml:'));
      console.log(`    - name: <Company Name>`);
      console.log(`      ats: ${d.ats}`);
      console.log(`      token: ${d.token}`);
      console.log(`      careersUrl: ${url}`);
    } else {
      console.log(pc.yellow(`  ATS    ${d.ats}`));
      console.log(pc.yellow(`  token  ${d.token ?? '(none found)'}`));
    }
    if (d.meta) console.log(pc.dim(`  meta   ${JSON.stringify(d.meta)}`));
    if (d.note) console.log(pc.dim(`  note   ${d.note}`));
    console.log('');
  });

// ---------------------------------------------------------------- verify ----
program
  .command('verify')
  .description('Check every registry entry (including disabled ones) actually returns jobs')
  .option('-c, --concurrency <n>', 'parallel boards', '4')
  .action(async (opts: { concurrency: string }) => {
    const all = loadRegistryAll();
    console.log(pc.dim(`\nVerifying ${all.length} boards...\n`));
    const results = await mapWithConcurrency(all, Number(opts.concurrency), async (c) => {
      const r = await fetchCompany(c);
      return { name: c.name, ats: c.ats, token: c.token, count: r.jobs.length, error: r.error };
    });

    const ok = results.filter((r) => !r.error && r.count > 0);
    const empty = results.filter((r) => !r.error && r.count === 0);
    const bad = results.filter((r) => r.error);

    for (const r of ok) console.log(`  ${pc.green('✓')} ${r.name.padEnd(22)} ${pc.dim(`${r.ats}/${r.token}`)}  ${r.count} jobs`);
    for (const r of empty) console.log(`  ${pc.yellow('○')} ${r.name.padEnd(22)} ${pc.dim(`${r.ats}/${r.token}`)}  valid board, 0 open roles`);
    for (const r of bad) console.log(`  ${pc.red('✗')} ${r.name.padEnd(22)} ${pc.dim(`${r.ats}/${r.token}`)}  ${pc.red(r.error!)}`);

    console.log(pc.bold(`\n  ${ok.length} working · ${empty.length} empty · ${bad.length} failed\n`));
    console.log(pc.dim('  Set enabled: true on the working ones, delete the failures.\n'));
  });

// ---------------------------------------------------------------- ingest ----
program
  .command('ingest')
  .description('Fetch every enabled board, normalize, dedupe, score, write out/jobs.json')
  .option('-c, --concurrency <n>', 'parallel boards', '4')
  .option('--max-age-days <n>', 'ignore postings older than this', '45')
  .option('--json-only', 'skip the printed digest', false)
  .action(async (opts: { concurrency: string; maxAgeDays: string; jsonOnly: boolean }) => {
    const started = Date.now();
    const companies = loadRegistry(REGISTRY);
    if (!companies.length) {
      console.log(pc.yellow('No enabled companies in config/companies.yaml.'));
      return;
    }

    console.log(pc.dim(`\nPolling ${companies.length} boards...\n`));
    const results = await mapWithConcurrency(companies, Number(opts.concurrency), async (c) => {
      const r = await fetchCompany(c);
      const label = r.error ? pc.red('✗') : pc.green('✓');
      console.log(`  ${label} ${c.name.padEnd(22)} ${r.error ? pc.red(r.error) : `${r.jobs.length} postings`}`);
      return r;
    });

    const now = new Date();
    const maxAgeMs = Number(opts.maxAgeDays) * 864e5;
    const raw = results.flatMap((r) => r.jobs);

    const normalized = raw
      .map((j) => normalizeJob(j, now))
      .filter((j) => {
        const ts = j.postedAt ?? j.updatedAt;
        return !ts || now.getTime() - ts.getTime() <= maxAgeMs;
      });

    const { unique, duplicatesRemoved, seenOn } = dedupe(normalized);
    const scored: ScoredJob[] = unique
      .map((j) => scoreJob(j, PROFILE, now))
      .sort((a, b) => b.score - a.score);

    const tiers: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const j of scored) tiers[j.tier] = (tiers[j.tier] ?? 0) + 1;

    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(
      OUT,
      JSON.stringify(
        {
          generatedAt: now.toISOString(),
          profile: PROFILE.name,
          stats: { companies: companies.length, fetched: raw.length, unique: unique.length, duplicates: duplicatesRemoved, tiers },
          jobs: scored.map((j) => ({ ...j, seenOn: seenOn.get(j.dedupHash) ?? [j.source] })),
        },
        null,
        2,
      ),
    );

    if (!opts.jsonOnly) console.log(renderDigest(scored));
    console.log(
      renderSummary({
        companies: companies.length,
        fetched: raw.length,
        unique: unique.length,
        duplicates: duplicatesRemoved,
        errors: results.filter((r) => r.error).map((r) => ({ company: r.company.name, error: r.error! })),
        tiers,
        ms: Date.now() - started,
      }),
    );
    console.log(pc.dim(`\n  written → ${OUT}\n`));
  });

// ------------------------------------------------------------------ demo ----
program
  .command('demo')
  .description('Run the full pipeline on bundled fixtures — no network, no DB. Use this to sanity-check a change.')
  .action(() => {
    const fx = (n: string) => JSON.parse(readFileSync(resolve(ROOT, 'fixtures', n), 'utf8'));
    const raw = [
      ...parseGreenhouse(fx('greenhouse.acme.json'), 'acme', 'Acme Cloud'),
      ...parseLever(fx('lever.globex.json'), 'globex', 'Globex'),
      ...parseAshby(fx('ashby.initech.json'), 'initech', 'Initech'),
    ];
    const now = new Date();
    const normalized = raw.map((j) => normalizeJob(j, now));
    const { unique, duplicatesRemoved } = dedupe(normalized);
    const scored = unique.map((j) => scoreJob(j, PROFILE, now)).sort((a, b) => b.score - a.score);
    const tiers: Record<number, number> = {};
    for (const j of scored) tiers[j.tier] = (tiers[j.tier] ?? 0) + 1;

    console.log(pc.dim('\n  running on bundled fixtures (no network)'));
    console.log(renderDigest(scored, { showTier4: true }));
    console.log(renderSummary({ companies: 3, fetched: raw.length, unique: unique.length, duplicates: duplicatesRemoved, errors: [], tiers, ms: 0 }));
    console.log('');
  });

// ---------------------------------------------------------------- digest ----
program
  .command('digest')
  .description('Re-print the ranked digest from the last ingest, without re-fetching')
  .option('--top <n>', 'tier 1 entries to show', '5')
  .option('--all', 'include filtered-out tier 4', false)
  .action((opts: { top: string; all: boolean }) => {
    const data = JSON.parse(readFileSync(OUT, 'utf8'));
    const jobs: ScoredJob[] = data.jobs.map((j: ScoredJob & { postedAt?: string; updatedAt?: string }) => ({
      ...j,
      postedAt: j.postedAt ? new Date(j.postedAt) : undefined,
      updatedAt: j.updatedAt ? new Date(j.updatedAt) : undefined,
    }));
    console.log(pc.dim(`\n  from ${data.generatedAt}`));
    console.log(renderDigest(jobs, { top: Number(opts.top), showTier4: opts.all }));
  });

// -------------------------------------------------------- registry:sync ----
program
  .command('registry:sync')
  .description('Push config/companies.yaml into the database the API reads from')
  .action(async () => {
    const repos = createRepos(getDb());
    try {
      const { synced } = await syncRegistry(repos, REGISTRY);
      console.log(pc.green(`\n  synced ${synced} companies into the database\n`));
    } finally {
      await closeDb();
    }
  });

// --------------------------------------------------- source-specific ingests ----
program
  .command('ingest:linkedin <query>')
  .description('Live search & ingest jobs from LinkedIn into the scoring pipeline')
  .option('-l, --location <loc>', 'location filter', 'India')
  .option('-n, --limit <n>', 'max postings to fetch', '25')
  .action(async (query: string, opts: { location: string; limit: string }) => {
    const { fetchLinkedInJobs } = await import('@jobhunt/connectors');
    const repos = createRepos(getDb());
    try {
      console.log(pc.dim(`\nSearching LinkedIn for "${query}" in "${opts.location}"...\n`));
      const raw = await fetchLinkedInJobs({ query, location: opts.location, limit: Number(opts.limit) });
      const now = new Date();
      const normalized = raw.map((j) => normalizeJob(j, now));
      const { unique, duplicatesRemoved } = dedupe(normalized);
      const scored = unique.map((j) => scoreJob(j, PROFILE, now)).sort((a, b) => b.score - a.score);

      const persist = await repos.jobs.upsertMany(scored, new Map());
      console.log(renderDigest(scored, { showTier4: false }));
      console.log(pc.green(`\n  Fetched: ${raw.length} | Unique: ${unique.length} | Inserted to DB: ${persist.inserted} | Updated: ${persist.updated}\n`));
    } finally {
      await closeDb();
    }
  });

program
  .command('ingest:naukri <query>')
  .description('Live search & ingest jobs from Naukri.com into the scoring pipeline')
  .option('-l, --location <loc>', 'location filter', 'Chennai, Bangalore, Remote')
  .option('-n, --limit <n>', 'max postings to fetch', '25')
  .action(async (query: string, opts: { location: string; limit: string }) => {
    const { fetchNaukriJobs } = await import('@jobhunt/connectors');
    const repos = createRepos(getDb());
    try {
      console.log(pc.dim(`\nSearching Naukri for "${query}" in "${opts.location}"...\n`));
      const raw = await fetchNaukriJobs({ query, location: opts.location, limit: Number(opts.limit) });
      const now = new Date();
      const normalized = raw.map((j) => normalizeJob(j, now));
      const { unique, duplicatesRemoved } = dedupe(normalized);
      const scored = unique.map((j) => scoreJob(j, PROFILE, now)).sort((a, b) => b.score - a.score);

      const persist = await repos.jobs.upsertMany(scored, new Map());
      console.log(renderDigest(scored, { showTier4: false }));
      console.log(pc.green(`\n  Fetched: ${raw.length} | Unique: ${unique.length} | Inserted to DB: ${persist.inserted} | Updated: ${persist.updated}\n`));
    } finally {
      await closeDb();
    }
  });

program
  .command('ingest:indeed <query>')
  .description('Live search & ingest jobs from Indeed RSS/Search into the scoring pipeline')
  .option('-l, --location <loc>', 'location filter', 'India')
  .option('-c, --country <c>', 'country code (in, us, uk)', 'in')
  .action(async (query: string, opts: { location: string; country: 'in' | 'us' | 'uk' }) => {
    const { fetchIndeedJobs } = await import('@jobhunt/connectors');
    const repos = createRepos(getDb());
    try {
      console.log(pc.dim(`\nSearching Indeed (${opts.country}) for "${query}" in "${opts.location}"...\n`));
      const raw = await fetchIndeedJobs({ query, location: opts.location, country: opts.country });
      const now = new Date();
      const normalized = raw.map((j) => normalizeJob(j, now));
      const { unique, duplicatesRemoved } = dedupe(normalized);
      const scored = unique.map((j) => scoreJob(j, PROFILE, now)).sort((a, b) => b.score - a.score);

      const persist = await repos.jobs.upsertMany(scored, new Map());
      console.log(renderDigest(scored, { showTier4: false }));
      console.log(pc.green(`\n  Fetched: ${raw.length} | Unique: ${unique.length} | Inserted to DB: ${persist.inserted} | Updated: ${persist.updated}\n`));
    } finally {
      await closeDb();
    }
  });

program
  .command('inbox:sync')
  .description('Poll Gmail for recruiter emails, interview invites, online assessments & auto-classify')
  .action(async () => {
    const { inboxService } = await import('@jobhunt/services');
    const repos = createRepos(getDb());
    try {
      console.log(pc.dim('\nSyncing Gmail inbox and classifying hiring communications...\n'));
      const svc = inboxService(repos);
      const res = await svc.sync();
      console.log(pc.green(`  Synced: ${res.synced} messages`));
      console.log(pc.green(`  Linked to Job Applications: ${res.linkedToJobs}`));
      console.log(pc.yellow(`  Action Required: ${res.actionRequired}`));
      console.log(pc.dim(`  Categories: ${JSON.stringify(res.categories)}\n`));
    } finally {
      await closeDb();
    }
  });

// ----------------------------------------------------------------- facts ----
program
  .command('facts')
  .description('Print the verified candidate fact table (truth constraint)')
  .option('-c, --category <cat>', 'filter by category')
  .action(async (opts: { category?: string }) => {
    const { DEFAULT_FACTS } = await import('@jobhunt/core');
    const filtered = opts.category
      ? DEFAULT_FACTS.filter((f) => f.category === opts.category)
      : DEFAULT_FACTS;

    console.log(pc.bold(`\n  Verified Fact Table — ${filtered.length} entries\n`));
    for (const f of filtered) {
      const val = typeof f.value === 'boolean' ? (f.value ? pc.green('Yes') : pc.red('No')) : pc.cyan(String(f.value));
      console.log(`  ${pc.bold(f.key.padEnd(30))} ${val}`);
      console.log(`  ${pc.dim(f.label)} · ${pc.dim(f.evidence ?? '')}`);
      console.log('');
    }
  });

program
  .command('resolve <question>')
  .description('Simulate screening question resolution against verified facts (PRD §5.4 D3)')
  .option('-o, --options <opts...>', 'optional radio/select choices')
  .action(async (question: string, opts: { options?: string[] }) => {
    const { resolveScreeningQuestion } = await import('@jobhunt/core');
    console.log(pc.bold(`\nQuestion: `) + question);
    if (opts.options && opts.options.length) {
      console.log(pc.dim(`Options:  `) + opts.options.join(' | '));
    }

    const res = resolveScreeningQuestion(question, { options: opts.options });
    console.log('');
    if (res.outcome === 'answer') {
      console.log(`  ${pc.green('✓ OUTCOME:')}   ${pc.bold(res.outcome.toUpperCase())}`);
      console.log(`  ${pc.cyan('ANSWER:')}    ${pc.bold(res.formattedAnswer)}`);
      console.log(`  ${pc.dim('CONFIDENCE:')} ${(res.confidence * 100).toFixed(0)}%`);
      console.log(`  ${pc.dim('REASON:')}     ${res.reason}`);
    } else if (res.outcome === 'abort') {
      console.log(`  ${pc.red('✗ OUTCOME:')}   ${pc.bold(res.outcome.toUpperCase())} (Disqualifying gap / misrepresentation risk)`);
      console.log(`  ${pc.red('REASON:')}     ${res.reason}`);
    } else {
      console.log(`  ${pc.yellow('? OUTCOME:')}   ${pc.bold(res.outcome.toUpperCase())} (Human Gate required)`);
      console.log(`  ${pc.yellow('REASON:')}     ${res.reason}`);
    }
    console.log('');
  });

// -------------------------------------------------------------- outreach ----
program
  .command('outreach:generate')
  .description('Generate customized cold email or referral request with 1-click Gmail Compose link')
  .requiredOption('-c, --company <company>', 'target company name')
  .requiredOption('-r, --role <role>', 'target job role')
  .requiredOption('-n, --name <recipientName>', 'recipient person name')
  .option('-e, --email <email>', 'recipient email address')
  .option('-a, --archetype <archetype>', 'direct_hiring_manager | internal_referral | recruiter_pitch | follow_up_1 | follow_up_2', 'direct_hiring_manager')
  .option('--note <customNote>', 'custom personalized line to inject')
  .action(async (opts: {
    company: string;
    role: string;
    name: string;
    email?: string;
    archetype: string;
    note?: string;
  }) => {
    const { generateOutreach } = await import('@jobhunt/core');
    const result = generateOutreach({
      company: opts.company,
      role: opts.role,
      recipientName: opts.name,
      recipientEmail: opts.email,
      archetype: opts.archetype as any,
      customNote: opts.note,
    });

    console.log(pc.bold(`\n=== Generated Outreach [${result.archetype}] ===\n`));
    console.log(pc.cyan('Subject: ') + pc.bold(result.subject));
    console.log(pc.dim('Stats:   ') + `${result.wordCount} words · ${result.charCount} characters`);
    console.log('\n' + pc.white(result.bodyText) + '\n');
    console.log(pc.green('1-Click Gmail Web Compose URL:'));
    console.log(pc.underline(pc.cyan(result.webComposeUrl)));
    console.log('');
  });

program
  .command('outreach:send')
  .description('Send outreach email via Gmail SMTP (App Password) or Google API')
  .requiredOption('-t, --to <email>', 'recipient email')
  .requiredOption('-s, --subject <subject>', 'email subject')
  .requiredOption('-b, --body <body>', 'email body text')
  .option('-m, --mode <mode>', 'smtp | api | draft', 'smtp')
  .option('--user <email>', 'Gmail address (defaults to GMAIL_USER env)')
  .option('--pass <password>', 'Google App Password (defaults to GMAIL_APP_PASS env)')
  .action(async (opts: {
    to: string;
    subject: string;
    body: string;
    mode: string;
    user?: string;
    pass?: string;
  }) => {
    const { sendGmailSmtp, sendGmailApi } = await import('@jobhunt/connectors');
    console.log(pc.bold(`\nSending outreach to ${opts.to} via Gmail [${opts.mode.toUpperCase()}]...`));

    if (opts.mode === 'smtp') {
      const user = opts.user || process.env.GMAIL_USER || '';
      const pass = opts.pass || process.env.GMAIL_APP_PASS || '';
      if (!user || !pass) {
        console.error(pc.red('Error: GMAIL_USER and GMAIL_APP_PASS must be provided or set in environment.'));
        process.exit(1);
      }
      const res = await sendGmailSmtp({
        user,
        pass,
        to: opts.to,
        subject: opts.subject,
        text: opts.body,
      });
      if (res.success) {
        console.log(pc.green(`✓ Email sent successfully via Gmail SMTP! Message-ID: ${res.messageId}`));
      } else {
        console.error(pc.red(`✗ Send failed: ${res.error}`));
      }
    } else {
      console.log(pc.yellow('For direct API/Draft sending, use web studio or configure OAuth tokens in config.'));
    }
  });

// ------------------------------------------------------------------ util ----
/** verify deliberately includes entries marked enabled: false */
function loadRegistryAll(): CompanyEntry[] {
  const doc = parseYaml(readFileSync(REGISTRY, 'utf8')) as { companies: CompanyEntry[] };
  return doc.companies ?? [];
}

program.parseAsync(process.argv);

