/**
 * Live regression check for the form engine: open a current job on each
 * public ATS, fill it with the SAMPLE resume (fixtures/resume.sample.txt),
 * and stop before Submit. Nothing is ever submitted. Run after changing
 * form.ts / runner.ts / adapters, or weekly to catch ATS layout drift.
 *
 *   pnpm worker:smoke            headless
 *   pnpm worker:smoke --headed   watch it
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pc from 'picocolors';
import { chromium } from 'playwright-core';
import { FACTS_BY_KEY, parseResumeText, type FormAnswer } from '@jobhunt/core';
import { renderPdf } from '../../../packages/documents/src/index.js';
import { openApplication } from './adapters/apply.js';
import { loadComboboxOptions, planFields, readFields } from './form.js';
import { runForm } from './runner.js';

const dir = mkdtempSync(join(tmpdir(), 'jobhunt-smoke-'));
process.env.JOBHUNT_DATA_DIR = dir;
const headless = !process.argv.includes('--headed');

async function firstJob(platform: string): Promise<string> {
  const isEng = (t: string) => /engineer|developer/i.test(t);
  if (platform === 'greenhouse') {
    const d = await (await fetch('https://boards-api.greenhouse.io/v1/boards/grafanalabs/jobs')).json() as { jobs: { title: string; absolute_url: string }[] };
    return (d.jobs.find((j) => isEng(j.title)) ?? d.jobs[0]!).absolute_url;
  }
  if (platform === 'lever') {
    const d = await (await fetch('https://api.lever.co/v0/postings/palantir?mode=json')).json() as { text: string; hostedUrl: string }[];
    return (d.find((j) => isEng(j.text)) ?? d[0]!).hostedUrl;
  }
  const d = await (await fetch('https://api.ashbyhq.com/posting-api/job-board/linear')).json() as { jobs: { title: string; jobUrl: string }[] };
  return (d.jobs.find((j) => isEng(j.title)) ?? d.jobs[0]!).jobUrl;
}

const resume = parseResumeText(readFileSync('fixtures/resume.sample.txt', 'utf8'));
const pdf = join(dir, 'Sample_Candidate.pdf');
writeFileSync(pdf, await renderPdf(resume));
const browser = await chromium.launch({ channel: 'chrome', headless });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
let failures = 0;

for (const platform of ['greenhouse', 'lever', 'ashby']) {
  const url = await firstJob(platform);
  const page = await ctx.newPage();
  const opened = await openApplication(ctx, page, platform, url);
  if (!opened.ok) { failures++; console.log(pc.red(`✗ ${platform}: ${opened.reason}`)); continue; }
  const fill = { known: [] as FormAnswer[], facts: FACTS_BY_KEY, resume, resumePdf: pdf, jobLocation: 'Remote', fallbackCoverLetter: 'Dear team, (smoke test).' };
  const fields = await readFields(opened.scope, opened.root);
  await loadComboboxOptions(opened.scope, fields);
  // Stand in for the human at the gate, so the run reaches Submit. Prefer neutral options.
  fill.known = planFields(fields, fill).filter((a) => a.outcome === 'ask').map((a) => ({
    question: a.question, outcome: 'answer' as const, confidence: 1, reason: 'smoke stand-in',
    formattedAnswer: a.field.options?.find((o) => /decline|prefer not|don.t wish|^no$/i.test(o)) ?? a.field.options?.[0] ?? (a.field.type === 'checkbox' ? 'Yes' : 'n/a'),
  }));
  const out = await runForm({ scope: opened.scope, page: opened.page, root: opened.root, ctx: fill, dryRun: true, tag: `smoke-${platform}` });
  const ok = out.kind === 'dry_run';
  if (!ok) failures++;
  console.log(ok ? pc.green(`✓ ${platform}`) : pc.red(`✗ ${platform}`), pc.dim(url));
  console.log(`  ${out.kind}${'fields' in out ? `: ${Object.keys(out.fields).length} fields filled` : ''}${'reason' in out ? ` — ${out.reason}` : ''}${'error' in out ? ` — ${out.error}` : ''}`);
  if ('screenshotPath' in out && out.screenshotPath) console.log(pc.dim(`  ${join(dir, out.screenshotPath)}`));
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
