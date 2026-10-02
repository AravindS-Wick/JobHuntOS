import type { BrowserContext, Frame, Page } from 'playwright-core';
import { detectAts } from '@jobhunt/connectors';
import { pause } from '../browser.js';
import { detectBlocker } from '../form.js';

/**
 * Per-platform navigation: get from a job URL to the application form, and
 * say which element holds the fields. Filling and submitting is the shared
 * runner's job, so each adapter stays small.
 */
export type Opened =
  | { ok: true; scope: Page | Frame; page: Page; root: string; platform: string }
  | { ok: false; reason: string; human?: boolean; retryable?: boolean };

const clickText = async (page: Page | Frame, re: RegExp) => {
  const b = page.locator('button, a, [role="button"]').filter({ hasText: re }).first();
  if (await b.count() && await b.isVisible().catch(() => false)) { await b.click(); return true; }
  return false;
};

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  await pause(1200, 2200);
}

// ----------------------------------------------------------- company ATS ----

async function greenhouse(page: Page, url: string): Promise<Opened> {
  await page.goto(url);
  await settle(page);
  // Company-domain careers pages embed the Greenhouse form in an iframe.
  const frame = page.frames().find((f) => /greenhouse\.io\/(embed\/)?job_app/.test(f.url()));
  const scope = frame ?? page;
  await clickText(scope, /^apply( for this job| now)?$/i);
  await pause();
  const root = (await scope.locator('#application-form, form#application_form, form#application-form').count()) ? '#application-form, form#application_form, form#application-form' : 'form';
  return { ok: true, scope, page, root, platform: 'greenhouse' };
}

async function lever(page: Page, url: string): Promise<Opened> {
  const target = /\/apply\/?$/.test(url) ? url : `${url.replace(/\/$/, '')}/apply`;
  await page.goto(target);
  await settle(page);
  return { ok: true, scope: page, page, root: 'form', platform: 'lever' };
}

async function ashby(page: Page, url: string): Promise<Opened> {
  const target = /\/application\/?$/.test(url) ? url : `${url.replace(/\/$/, '')}/application`;
  await page.goto(target);
  await settle(page);
  return { ok: true, scope: page, page, root: 'body', platform: 'ashby' };
}

async function smartrecruiters(page: Page, url: string): Promise<Opened> {
  await page.goto(url);
  await settle(page);
  await clickText(page, /i'm interested|apply now|apply/i);
  await settle(page);
  return { ok: true, scope: page, page, root: 'body', platform: 'smartrecruiters' };
}

async function workday(page: Page, url: string): Promise<Opened> {
  await page.goto(url);
  await settle(page);
  await clickText(page, /^apply$/i);
  await pause();
  await clickText(page, /apply manually/i);
  await settle(page);
  const blocker = await detectBlocker(page);
  if (blocker?.kind === 'login' || blocker?.kind === 'account') {
    return { ok: false, human: true, reason: `Workday needs you to sign in or create an account for this company. Do it in the open browser window, then press Resume.` };
  }
  return { ok: true, scope: page, page, root: 'body', platform: 'workday' };
}

// ---------------------------------------------------------------- boards ----

/** "Apply on company site" buttons open the employer's ATS; follow it and treat it as that ATS. */
async function followExternal(ctx: BrowserContext, page: Page, click: () => Promise<boolean>): Promise<Opened> {
  const popup = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => undefined);
  if (!(await click())) return { ok: false, reason: 'Apply button not found', retryable: true };
  const next = (await popup) ?? page;
  await next.waitForLoadState('domcontentloaded').catch(() => undefined);
  await pause(1500, 2500);
  const ats = detectAts(next.url()).ats;
  if (ats === 'greenhouse') return greenhouse(next, next.url());
  if (ats === 'lever') return lever(next, next.url());
  if (ats === 'ashby') return ashby(next, next.url());
  if (ats === 'workday') return workday(next, next.url());
  if (ats === 'smartrecruiters') return smartrecruiters(next, next.url());
  // Unknown company site: the generic engine still tries, the runner gates anything unclear.
  return { ok: true, scope: next, page: next, root: 'body', platform: 'external' };
}

async function linkedin(ctx: BrowserContext, page: Page, url: string): Promise<Opened> {
  await page.goto(url);
  await settle(page);
  if (/authwall|login|checkpoint/.test(page.url()) || (await page.locator('a[href*="/login"], button:has-text("Sign in")').first().isVisible().catch(() => false))) {
    return { ok: false, human: true, reason: 'Log in to LinkedIn in the open browser window (pnpm worker login), then press Resume.' };
  }
  const easy = page.locator('button.jobs-apply-button, button[aria-label*="Easy Apply" i]').filter({ hasText: /easy apply/i }).first();
  if (await easy.count()) {
    await easy.click();
    await pause(1200, 2000);
    // Don't follow the company as a side effect of applying.
    await page.locator('#follow-company-checkbox, input[id*="follow-company"]').uncheck({ force: true }).catch(() => undefined);
    return { ok: true, scope: page, page, root: '.jobs-easy-apply-modal, [role="dialog"]', platform: 'linkedin' };
  }
  return followExternal(ctx, page, () => clickText(page, /^apply$/i));
}

async function naukri(ctx: BrowserContext, page: Page, url: string): Promise<Opened> {
  await page.goto(url);
  await settle(page);
  if (await page.locator('button, a').filter({ hasText: /login to apply|register to apply/i }).first().isVisible().catch(() => false)) {
    return { ok: false, human: true, reason: 'Log in to Naukri in the open browser window (pnpm worker login), then press Resume.' };
  }
  if (await page.locator('button, a').filter({ hasText: /^applied$/i }).first().isVisible().catch(() => false)) {
    return { ok: false, reason: 'Already applied on Naukri', retryable: false };
  }
  const company = page.locator('button, a').filter({ hasText: /apply on company (site|website)/i }).first();
  if (await company.isVisible().catch(() => false)) return followExternal(ctx, page, async () => { await company.click(); return true; });
  if (!(await clickText(page, /^apply$/i))) return { ok: false, reason: 'Naukri apply button not found', retryable: true };
  await pause(1500, 2500);
  // Naukri asks recruiter questions in a chatbot drawer.
  const drawer = '.chatbot_DrawerContentWrapper, [class*="chatbot" i]';
  return { ok: true, scope: page, page, root: (await page.locator(drawer).count()) ? drawer : 'body', platform: 'naukri' };
}

async function indeed(ctx: BrowserContext, page: Page, url: string): Promise<Opened> {
  await page.goto(url);
  await settle(page);
  const indeedApply = page.locator('#indeedApplyButton, button[aria-label*="Apply now" i]').first();
  if (await indeedApply.isVisible().catch(() => false)) {
    const popup = ctx.waitForEvent('page', { timeout: 6000 }).catch(() => undefined);
    await indeedApply.click();
    const next = (await popup) ?? page;
    await settle(next);
    return { ok: true, scope: next, page: next, root: 'body', platform: 'indeed' };
  }
  return followExternal(ctx, page, () => clickText(page, /apply on company site|apply now/i));
}

/** Foundit, Instahyre, Cutshort, Wellfound, YC: one Apply button, then a short form or modal. */
async function oneClickBoard(ctx: BrowserContext, page: Page, url: string, platform: string): Promise<Opened> {
  await page.goto(url);
  await settle(page);
  const blocker = await detectBlocker(page);
  if (blocker?.kind === 'login') return { ok: false, human: true, reason: `Log in to ${platform} in the open browser window (pnpm worker login), then press Resume.` };
  const external = page.locator('a, button').filter({ hasText: /apply on company|company website/i }).first();
  if (await external.isVisible().catch(() => false)) return followExternal(ctx, page, async () => { await external.click(); return true; });
  if (!(await clickText(page, /^(apply( now)?|quick apply|easy apply|apply to this job)$/i))) {
    return { ok: false, reason: `${platform}: apply button not found (are you logged in?)`, human: true };
  }
  await pause(1500, 2500);
  const modal = '[role="dialog"], .modal, [class*="modal" i]';
  return { ok: true, scope: page, page, root: (await page.locator(modal).first().isVisible().catch(() => false)) ? modal : 'body', platform };
}

export async function openApplication(ctx: BrowserContext, page: Page, platform: string, url: string): Promise<Opened> {
  switch (platform) {
    case 'greenhouse': return greenhouse(page, url);
    case 'lever': return lever(page, url);
    case 'ashby': return ashby(page, url);
    case 'smartrecruiters': return smartrecruiters(page, url);
    case 'workday': return workday(page, url);
    case 'linkedin': return linkedin(ctx, page, url);
    case 'naukri': return naukri(ctx, page, url);
    case 'indeed': return indeed(ctx, page, url);
    case 'foundit': case 'instahyre': case 'cutshort': case 'wellfound': case 'yc':
      return oneClickBoard(ctx, page, url, platform);
    default:
      return { ok: false, reason: `No browser adapter for "${platform}". Apply by hand with the generated resume.`, retryable: false };
  }
}
