import type { Frame, Page } from 'playwright-core';
import { pause, screenshot } from './browser.js';
import {
  CONFIRMATION_RE, detectBlocker, fillFields, findAction, formErrors, loadComboboxOptions, planFields, readFields, type FillContext,
} from './form.js';

export type StepOutcome =
  | { kind: 'submitted'; fields: Record<string, string>; confirmation: string; screenshotPath: string }
  | { kind: 'dry_run'; fields: Record<string, string>; screenshotPath: string; pending: string[] }
  | { kind: 'needs_human'; reason: string; question?: string; options?: string[]; screenshotPath: string }
  | { kind: 'failed'; error: string; retryable: boolean; screenshotPath?: string };

export interface RunFormOptions {
  scope: Page | Frame;
  page: Page;
  /** CSS selector of the form or modal that holds the fields. */
  root?: string;
  ctx: FillContext;
  dryRun?: boolean;
  maxSteps?: number;
  /** Name for screenshots. */
  tag: string;
}

async function bodyText(scope: Page | Frame): Promise<string> {
  return (await scope.locator('body').innerText().catch(() => '')).slice(0, 20_000);
}

/**
 * Fill and advance a (possibly multi-step) application form until it is
 * submitted, needs the human, or fails. Submit is clicked at most once:
 * after that click nothing is retried automatically, so a slow confirmation
 * can never become a duplicate application.
 */
export async function runForm(o: RunFormOptions): Promise<StepOutcome> {
  const { scope, page, ctx, root = 'body', maxSteps = 12 } = o;
  const typed: Record<string, string> = {};
  let lastSignature = '';
  let stuck = 0;

  for (let step = 1; step <= maxSteps; step++) {
    const blocker = await detectBlocker(page);
    if (blocker) {
      return { kind: 'needs_human', reason: `${blocker.detail}. Clear it in the open browser window, then press Resume.`, screenshotPath: await screenshot(page, `${o.tag}-${blocker.kind}`) };
    }
    const text = await bodyText(scope);
    const done = text.match(CONFIRMATION_RE);
    if (done && step > 1) {
      return { kind: 'submitted', fields: typed, confirmation: done[0], screenshotPath: await screenshot(page, `${o.tag}-confirmation`) };
    }

    const fields = await readFields(scope, root);
    await loadComboboxOptions(scope, fields);
    const plan = planFields(fields, ctx);
    const abort = plan.find((a) => a.outcome === 'abort');
    if (abort) {
      return { kind: 'failed', retryable: false, error: `Stopped: answering "${abort.question}" truthfully disqualifies this application (${abort.reason})`, screenshotPath: await screenshot(page, `${o.tag}-abort`) };
    }
    const ask = plan.find((a) => a.outcome === 'ask' && a.field.required);
    if (ask) {
      return {
        kind: 'needs_human', reason: ask.reason, question: ask.question, options: ask.field.options,
        screenshotPath: await screenshot(page, `${o.tag}-question`),
      };
    }

    const filled = await fillFields(scope, plan, ctx);
    Object.assign(typed, filled.typed);
    if (filled.failed.length) {
      return { kind: 'needs_human', reason: `Couldn't fill: ${filled.failed.join('; ')}. Fill these in the browser, then press Resume.`, screenshotPath: await screenshot(page, `${o.tag}-unfilled`) };
    }
    await pause(500, 1200);

    const action = await findAction(scope, root);
    if (!action) {
      return { kind: 'failed', retryable: true, error: 'No Next/Submit button found on this step (the page layout may have changed)', screenshotPath: await screenshot(page, `${o.tag}-no-button`) };
    }

    if (action.kind === 'submit') {
      if (o.dryRun) {
        return { kind: 'dry_run', fields: typed, screenshotPath: await screenshot(page, `${o.tag}-dry-run`), pending: plan.filter((a) => a.outcome !== 'answer').map((a) => a.question) };
      }
      await action.locator.click();
      // Confirmation can take a while; never click submit again.
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        await pause(1000, 1500);
        const after = await bodyText(scope).catch(() => '');
        const m = after.match(CONFIRMATION_RE) ?? page.url().match(/confirmation|thank[-_ ]?you|applied|success/i);
        if (m) return { kind: 'submitted', fields: typed, confirmation: m[0], screenshotPath: await screenshot(page, `${o.tag}-confirmation`) };
        const errs = await formErrors(scope);
        if (errs.length) {
          return { kind: 'needs_human', reason: `The form rejected the submission: ${errs.join(' | ')}. Fix it in the browser and submit, then mark it submitted.`, screenshotPath: await screenshot(page, `${o.tag}-errors`) };
        }
      }
      return { kind: 'failed', retryable: false, error: 'Submitted, but no confirmation appeared within 20 s. Check the screenshot and your email before re-applying.', screenshotPath: await screenshot(page, `${o.tag}-unconfirmed`) };
    }

    await action.locator.click();
    await pause(1200, 2500);

    // Same fields twice in a row = the step didn't advance (validation error).
    const signature = (await readFields(scope, root)).map((f) => f.label).join('|');
    if (signature === lastSignature) {
      stuck++;
      if (stuck >= 2) {
        const errs = await formErrors(scope);
        return { kind: 'needs_human', reason: `The form won't advance${errs.length ? `: ${errs.join(' | ')}` : ''}. Complete this step in the browser, then press Resume.`, screenshotPath: await screenshot(page, `${o.tag}-stuck`) };
      }
    } else {
      stuck = 0;
    }
    lastSignature = signature;
  }
  return { kind: 'failed', retryable: false, error: `Form had more than ${maxSteps} steps`, screenshotPath: await screenshot(page, `${o.tag}-too-long`) };
}
