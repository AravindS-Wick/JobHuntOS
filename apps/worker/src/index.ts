import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import type { BrowserContext } from 'playwright-core';
import { detectAts } from '@jobhunt/connectors';
import { coverLetter, FACTS_BY_KEY, type FactMap, type FormAnswer, type ResumeDoc } from '@jobhunt/core';
import { ApiClient, type ApplyBundle, type Report, type ScrapeBundle } from './api.js';
import { dataDir, openBrowser, pause, profileDir } from './browser.js';
import { openApplication } from './adapters/apply.js';
import { scrapeBoard } from './adapters/scrape.js';
import { runForm } from './runner.js';
import type { FillContext } from './form.js';

const API_URL = process.env.JOBHUNT_API_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? 4000}`;
const api = new ApiClient(API_URL, process.env.API_KEY);
const workerId = `${hostname()}-${process.pid}`;
const log = (...a: unknown[]) => console.log(pc.dim(new Date().toLocaleTimeString()), ...a);

/** While the human clears a gate the worker waits on the same page, so they only tap Resume. */
async function waitForHuman(taskId: string, minutes = 10): Promise<boolean> {
  log(pc.yellow('⏸  waiting at the Human Gate — open the console (Human Gate tab) or fix it in this browser, then press Resume'));
  const deadline = Date.now() + minutes * 6e4;
  while (Date.now() < deadline) {
    await pause(4000, 5000);
    const t = await api.task(taskId).catch(() => undefined);
    if (t?.status === 'queued') return true;
    if (t && t.status !== 'needs_human') return false;
  }
  log(pc.dim('no answer yet; the task stays in the Human Gate and will restart from the job page when resumed'));
  return false;
}

function coverLetterFile(appId: string, text: string | null): string | null {
  if (!text) return null;
  const path = join(dataDir(), 'covers', `${appId}.txt`);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  return path;
}

async function handleApply(ctx: BrowserContext, b: ApplyBundle, dryRun: boolean): Promise<void> {
  const { application: a, job } = b;
  log(pc.cyan(`apply  ${job.title} @ ${job.company}`), pc.dim(`[${a.platform}] ${a.applyUrl}`));
  const page = await ctx.newPage();
  const fill: FillContext = {
    known: a.answers, facts: b.facts, resume: b.resume.doc, coverLetter: a.coverLetter ?? undefined,
    jobLocation: job.locationRaw ?? undefined, resumePdf: b.resume.pdfPath, coverLetterPath: coverLetterFile(a.id, a.coverLetter),
    // Only used when a form makes a cover letter mandatory; built from resume bullets verbatim.
    fallbackCoverLetter: coverLetter(b.resume.doc, { title: job.title, company: job.company, descriptionText: '' },
      { doc: b.resume.doc, changes: [], matched: [], gaps: [], notOnResume: [] }, b.facts),
  };
  const send = async (r: Report) => { if (!dryRun) await api.report(b.task.id, r); };

  try {
    for (let round = 0; round < 6; round++) {
      const opened = await openApplication(ctx, page, a.platform, a.applyUrl);
      if (!opened.ok) {
        if (opened.human && !dryRun) {
          await send({ status: 'needs_human', reason: opened.reason });
          if (await waitForHuman(b.task.id)) { fill.known = (await api.continueTask(b.task.id, workerId)).answers; continue; }
          return;
        }
        log(pc.red(`✗ ${opened.reason}`));
        await send({ status: 'failed', error: opened.reason, retryable: opened.retryable ?? false });
        return;
      }

      for (let gate = 0; gate < 8; gate++) {
        const out = await runForm({ scope: opened.scope, page: opened.page, root: opened.root, ctx: fill, dryRun, tag: `${a.platform}-${a.id.slice(0, 8)}` });
        if (out.kind === 'submitted') {
          log(pc.green(`✓ submitted — "${out.confirmation}"`));
          await send({ status: 'submitted', fields: out.fields, confirmation: out.confirmation, screenshotPath: out.screenshotPath });
          return;
        }
        if (out.kind === 'dry_run') {
          log(pc.green('✓ dry run: form filled, stopped before Submit'), pc.dim(out.screenshotPath));
          for (const [k, v] of Object.entries(out.fields)) console.log(`   ${pc.dim(k.slice(0, 60).padEnd(60))} ${v}`);
          if (out.pending.length) console.log(pc.yellow(`   left blank: ${out.pending.join(' | ')}`));
          return;
        }
        if (out.kind === 'failed') {
          log(pc.red(`✗ ${out.error}`), pc.dim(out.screenshotPath ?? ''));
          await send({ status: 'failed', error: out.error, retryable: out.retryable, screenshotPath: out.screenshotPath });
          return;
        }
        log(pc.yellow(`? ${out.question ? `"${out.question}"` : out.reason}`));
        if (dryRun) { console.log(pc.yellow(`   would ask you: ${out.reason}`)); return; }
        await send({ status: 'needs_human', reason: out.reason, question: out.question, options: out.options, screenshotPath: out.screenshotPath });
        if (!(await waitForHuman(b.task.id))) return;
        fill.known = (await api.continueTask(b.task.id, workerId)).answers;
      }
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0]! : String(err);
    log(pc.red(`✗ ${msg}`));
    await send({ status: 'failed', error: msg, retryable: true });
  } finally {
    if (!dryRun) await page.close().catch(() => undefined);
  }
}

async function handleScrape(ctx: BrowserContext, b: ScrapeBundle): Promise<void> {
  log(pc.cyan(`scrape ${b.board}`), pc.dim(b.url));
  const page = await ctx.newPage();
  try {
    const out = await scrapeBoard(page, b.board, b.url);
    if (out.ok) {
      log(pc.green(`✓ ${out.jobs.length} jobs`));
      await api.report(b.task.id, { status: 'scraped', jobs: out.jobs.slice(0, 500) });
    } else if (out.human) {
      await api.report(b.task.id, { status: 'needs_human', reason: `${out.reason}. Clear it in the browser, then press Resume.` });
    } else {
      log(pc.red(`✗ ${out.reason}`));
      await api.report(b.task.id, { status: 'failed', error: out.reason });
    }
  } finally {
    await page.close().catch(() => undefined);
  }
}

const program = new Command().name('worker').description('JobHunt OS local browser worker: applies and scrapes in your own Chrome profile');

program.command('run', { isDefault: true })
  .description('Drain the queue: submit approved applications and run browser-only searches')
  .option('--once', 'process what is due now, then exit')
  .option('--kinds <kinds>', 'apply,scrape', 'apply,scrape')
  .option('--poll <seconds>', 'idle poll interval', '20')
  .action(async (opts: { once?: boolean; kinds: string; poll: string }) => {
    await api.health().catch(() => { throw new Error(`API not reachable at ${API_URL}. Start it with: pnpm api`); });
    const kinds = opts.kinds.split(',') as ('apply' | 'scrape')[];
    log(`worker ${workerId} → ${API_URL}`, pc.dim(`profile ${profileDir()}`));
    const ctx = await openBrowser();
    try {
      for (;;) {
        const { task } = await api.claim(workerId, kinds);
        if (!task) {
          if (opts.once) break;
          await pause(Number(opts.poll) * 1000, Number(opts.poll) * 1000 + 3000);
          continue;
        }
        if (task.kind === 'apply') await handleApply(ctx, task.bundle, false);
        else await handleScrape(ctx, task.bundle);
        await pause(3000, 8000);
      }
    } finally {
      await ctx.close();
    }
  });

const LOGIN_PAGES: Record<string, string> = {
  linkedin: 'https://www.linkedin.com/login',
  naukri: 'https://www.naukri.com/nlogin/login',
  indeed: 'https://secure.indeed.com/auth',
  foundit: 'https://www.foundit.in/rio/login',
  instahyre: 'https://www.instahyre.com/login/',
  cutshort: 'https://cutshort.io/login',
  wellfound: 'https://wellfound.com/login',
  glassdoor: 'https://www.glassdoor.co.in/profile/login_input.htm',
  yc: 'https://account.ycombinator.com/',
};

program.command('login [platforms...]')
  .description('Open login pages in the worker profile; log in once, then close the window')
  .action(async (platforms: string[]) => {
    const list = platforms.length ? platforms : Object.keys(LOGIN_PAGES);
    const ctx = await openBrowser();
    for (const p of list) {
      const url = LOGIN_PAGES[p];
      if (!url) { console.log(pc.red(`unknown platform ${p}`)); continue; }
      const page = await ctx.newPage();
      await page.goto(url).catch(() => undefined);
    }
    console.log(pc.bold('\nLog in on each tab, then close the browser window. Sessions are saved in'), profileDir());
    await new Promise<void>((r) => ctx.on('close', () => r()));
  });

program.command('try <url>')
  .description('Dry run: fill a real application form with your resume and facts, stop before Submit')
  .option('--platform <p>', 'override ATS detection')
  .action(async (url: string, opts: { platform?: string }) => {
    const master = await fetch(`${API_URL}/resumes/master`, { headers: process.env.API_KEY ? { 'x-api-key': process.env.API_KEY } : {} });
    if (!master.ok) throw new Error('No master resume. Upload one first (console → Resume, or POST /resumes).');
    const resume = (await master.json()) as { doc: ResumeDoc };
    const factsRes = await fetch(`${API_URL}/facts`, { headers: process.env.API_KEY ? { 'x-api-key': process.env.API_KEY } : {} });
    const facts: FactMap = factsRes.ok
      ? Object.fromEntries(((await factsRes.json()) as { items: { key: string }[] }).items.map((f) => [f.key, f])) as FactMap
      : FACTS_BY_KEY;
    const platform = opts.platform ?? (detectAts(url).ats !== 'unknown' ? detectAts(url).ats : new URL(url).hostname.split('.').slice(-2)[0]!);
    const ctx = await openBrowser();
    await handleApply(ctx, {
      task: { id: 'dry-run', platform, attempts: 0 },
      application: { id: 'dry-run', platform, applyUrl: url, coverLetter: null, answers: [] as FormAnswer[] },
      job: { id: 'dry-run', title: '(dry run)', company: '', url, locationRaw: null },
      resume: { doc: resume.doc, pdfPath: null, docxPath: null },
      facts,
    }, true);
    console.log(pc.dim('\nThe browser stays open so you can inspect the filled form. Close it to exit.'));
    await new Promise<void>((r) => ctx.on('close', () => r()));
  });

program.parseAsync().catch((err) => {
  console.error(pc.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
