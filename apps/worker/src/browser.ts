import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';

/**
 * A dedicated, persistent Chrome profile on this machine. You log in to
 * LinkedIn, Naukri, Indeed etc. in it once (`pnpm worker login`); cookies
 * persist, so the worker acts as you, from your own residential IP.
 *
 * It is a separate profile, not your everyday one, because Chrome locks a
 * profile while it is open, and so the worker can never touch anything else
 * you're logged in to.
 */
export function profileDir(): string {
  const dir = process.env.JOBHUNT_BROWSER_PROFILE ?? join(homedir(), '.jobhunt', 'chrome-profile');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function dataDir(): string {
  return resolve(process.env.JOBHUNT_DATA_DIR ?? '.data');
}

export async function openBrowser(opts: { headless?: boolean } = {}): Promise<BrowserContext> {
  const ctx = await chromium.launchPersistentContext(profileDir(), {
    channel: process.env.JOBHUNT_BROWSER_CHANNEL ?? 'chrome',
    headless: opts.headless ?? false,
    viewport: { width: 1366, height: 900 },
    // No stealth flags or fingerprint spoofing: a real Chrome, a real profile,
    // human pacing. Anything that challenges us goes to the Human Gate.
  });
  ctx.setDefaultTimeout(20_000);
  return ctx;
}

export async function screenshot(page: Page, name: string): Promise<string> {
  const rel = `screenshots/${new Date().toISOString().slice(0, 10)}/${name.replace(/[^\w.-]+/g, '_')}.png`;
  const abs = join(dataDir(), rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  await page.screenshot({ path: abs, fullPage: true }).catch(() => page.screenshot({ path: abs }));
  return rel;
}

/** Human-paced pause: typing and clicking never happen at machine speed. */
export function pause(minMs = 400, maxMs = 1200): Promise<void> {
  return new Promise((r) => setTimeout(r, minMs + Math.random() * (maxMs - minMs)));
}
