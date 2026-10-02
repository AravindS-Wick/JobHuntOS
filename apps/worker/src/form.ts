/// <reference lib="dom" />
import type { Frame, Locator, Page } from 'playwright-core';
import { answerQuestion, type AnswerContext, type FormAnswer, type FormQuestion } from '@jobhunt/core';
import { pause } from './browser.js';

/**
 * The generic form engine every adapter uses: read the visible fields of a
 * form (or one step of a multi-step modal), answer each from the master
 * resume + fact table, fill them, and say what the human must do.
 *
 * Deterministic first: labels are matched by the same rules as the API-side
 * resolver. No LLM is called; an unrecognised required question becomes a
 * Human Gate prompt, never a guess.
 */

export interface DomField extends FormQuestion {
  /** data-jh-id we stamped on the control so Playwright can find it again. */
  id: string;
  control: 'input' | 'select' | 'textarea' | 'radio' | 'checkbox' | 'combobox' | 'file';
  /** Current value, so fields the site pre-filled from your profile are kept. */
  value: string;
}

type Scope = Page | Frame;

/** Runs in the page: find visible controls in `rootSelector`, stamp ids, describe them. */
/**
 * tsx/esbuild wraps named functions in a `__name` helper that doesn't exist
 * in the page. Define a no-op before any evaluate (passed as a string so it
 * isn't transformed itself).
 */
export async function ensurePageHelpers(scope: Scope): Promise<void> {
  await scope.evaluate('globalThis.__name = globalThis.__name || ((f) => f)').catch(() => undefined);
}

export async function readFields(scope: Scope, rootSelector = 'body'): Promise<DomField[]> {
  await ensurePageHelpers(scope);
  return scope.evaluate((rootSel) => {
    const root = document.querySelector(rootSel) ?? document.body;
    const visible = (el: Element) => {
      if ((el as HTMLInputElement).type === 'file') return true; // often visually hidden behind a styled button
      const r = (el as HTMLElement).getBoundingClientRect();
      const s = getComputedStyle(el as HTMLElement);
      // Custom dropdowns keep a 1px, transparent <input required> for validation; it isn't a question.
      return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
    };
    const clean = (s: string | null | undefined) => (s ?? '')
      .replace(/\s+/g, ' ')
      .replace(/[✱*]/g, ' ')
      .replace(/\((required|optional)\)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    /** Question text for a radio/checkbox group: the nearest label-ish element that isn't an option. */
    const groupLabel = (el: Element, optionLabels: string[]): string => {
      let c: Element | null = el.parentElement;
      for (let depth = 0; c && depth < 6; depth++, c = c.parentElement) {
        const cands = Array.from(c.querySelectorAll('legend, [class*="label" i], [class*="question" i], [class*="title" i], h3, h4, p'));
        for (const l of cands) {
          const t = textOf(l);
          if (t && !l.querySelector('input') && !optionLabels.includes(t) && t.length > 3) return t;
        }
      }
      return '';
    };
    const textOf = (el: Element | null) => clean(el?.textContent);
    let n = 0;
    const stamp = (el: Element) => {
      let id = el.getAttribute('data-jh-id');
      if (!id) { id = `jh${Date.now().toString(36)}${n++}`; el.setAttribute('data-jh-id', id); }
      return id;
    };
    const labelFor = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria) return clean(aria);
      const by = el.getAttribute('aria-labelledby');
      if (by) {
        const t = by.split(/\s+/).map((i) => textOf(document.getElementById(i))).join(' ');
        if (t) return clean(t);
      }
      const id = el.getAttribute('id');
      if (id) {
        const l = root.querySelector(`label[for="${CSS.escape(id)}"]`) ?? document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (l) return textOf(l);
      }
      const wrap = el.closest('label');
      if (wrap) return textOf(wrap);
      // Nearest preceding label/legend/heading inside the field's container.
      let c: Element | null = el.parentElement;
      for (let depth = 0; c && depth < 5; depth++, c = c.parentElement) {
        const l = c.querySelector('label, legend, [class*="label" i], [class*="question" i], h3, h4');
        if (l && !l.contains(el) && textOf(l)) return textOf(l);
      }
      return clean(el.getAttribute('placeholder') ?? el.getAttribute('name') ?? '');
    };
    /** Label text before cleaning: required markers (*, ✱) live there. */
    const rawLabel = (el: Element) => {
      const id = el.getAttribute('id');
      const forLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      return (forLabel ?? el.closest('label') ?? el.parentElement)?.textContent ?? '';
    };
    const isRequired = (el: Element, _label: string) =>
      (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true' ||
      /[*✱]/.test(rawLabel(el).slice(0, 200)) || Boolean(el.closest('[class*="required" i]'));

    const out: Record<string, unknown>[] = [];
    const seenGroups = new Set<string>();

    for (const el of Array.from(root.querySelectorAll('input, select, textarea, [role="combobox"]'))) {
      if (!visible(el)) continue;
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') ?? (tag === 'input' ? 'text' : tag)).toLowerCase();
      if (['submit', 'button', 'image', 'reset', 'search'].includes(type)) continue;
      if (type === 'hidden') continue;

      if (type === 'radio' || type === 'checkbox') {
        const name = el.getAttribute('name') ?? '';
        const group = name ? Array.from(root.querySelectorAll(`input[name="${CSS.escape(name)}"]`)) : [el];
        if (name && seenGroups.has(name)) continue;
        if (name) seenGroups.add(name);
        const options = group.map((g) => labelFor(g));
        const single = group.length === 1;
        // A lone checkbox is its own question ("I agree…") unless it sits under a question heading.
        const label = single
          ? (groupLabel(el, options) && type === 'radio' ? groupLabel(el, options) : labelFor(el))
          : groupLabel(el, options) || labelFor(el.parentElement?.parentElement ?? el);
        out.push({
          id: stamp(el), name, label, control: type, type: single && type === 'checkbox' ? 'checkbox' : 'radio',
          options: single ? undefined : options, required: isRequired(el, label),
          value: group.filter((g) => (g as HTMLInputElement).checked).map((g) => labelFor(g)).join(', '),
        });
        group.forEach((g) => stamp(g));
        continue;
      }

      const label = labelFor(el);
      if (tag === 'select') {
        const s = el as HTMLSelectElement;
        out.push({
          id: stamp(el), name: s.name, label, control: 'select', type: s.multiple ? 'multiselect' : 'select',
          options: Array.from(s.options).map((o) => o.text.trim()).filter((t) => t && !/^(select|choose|--|please select)/i.test(t)),
          required: isRequired(el, label), value: s.selectedIndex > 0 ? s.options[s.selectedIndex]?.text ?? '' : '',
        });
      } else if (el.getAttribute('role') === 'combobox' && tag !== 'input') {
        out.push({ id: stamp(el), name: el.getAttribute('name') ?? '', label, control: 'combobox', type: 'select', required: isRequired(el, label), value: textOf(el) });
      } else {
        const input = el as HTMLInputElement;
        // Upload buttons say "Attach"/"Upload"; the question ("Resume/CV") is the group heading.
        const fileLabel = type === 'file' && /^(attach|upload|choose|browse|select file|drop)/i.test(label) ? groupLabel(el, [label]) || label : label;
        const t = tag === 'textarea' ? 'textarea' : type === 'file' ? 'file' : ['email', 'tel', 'url', 'number', 'date'].includes(type) ? type : 'text';
        out.push({
          id: stamp(el), name: input.name || input.id, label: fileLabel, control: tag === 'textarea' ? 'textarea' : type === 'file' ? 'file' : el.getAttribute('role') === 'combobox' ? 'combobox' : 'input',
          type: el.getAttribute('role') === 'combobox' ? 'select' : t, required: isRequired(el, label), value: type === 'file' ? '' : input.value ?? '',
          accept: input.accept,
        });
      }
    }
    return out;
  }, rootSelector) as unknown as Promise<DomField[]>;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export interface FillContext extends AnswerContext {
  /** Answers resolved before approval or given by the human; they win over fresh resolution. */
  known: FormAnswer[];
  resumePdf?: string | null;
  coverLetterPath?: string | null;
}

/**
 * Custom dropdowns (react-select and friends) only render their options when
 * opened. Open each one briefly to read them, so yes/no and "decline to
 * answer" choices can be matched exactly.
 */
export async function loadComboboxOptions(scope: Scope, fields: DomField[]): Promise<void> {
  for (const f of fields) {
    if (f.control !== 'combobox' || f.options?.length) continue;
    const loc = scope.locator(`[data-jh-id="${f.id}"]`).first();
    try {
      await loc.click({ timeout: 3000 });
      await pause(250, 500);
      const texts = (await (await optionsOf(scope, loc)).allInnerTexts()).map((t) => t.trim()).filter(Boolean);
      // Long lists (countries, cities) are typeahead searches, not choices to enumerate.
      if (texts.length && texts.length <= 30) f.options = texts;
      await loc.press('Escape');
      await pause(150, 300);
    } catch {
      // leave options unknown
    }
  }
}

/** Answer every field. Known answers (from review / Human Gate) take precedence. */
export function planFields(fields: DomField[], ctx: FillContext): (FormAnswer & { field: DomField })[] {
  const known = new Map(ctx.known.map((a) => [norm(a.question), a]));
  return fields.map((field) => {
    const k = known.get(norm(field.label));
    if (k && (k.outcome === 'answer' || k.formattedAnswer)) return { ...k, field };
    // Consent checkboxes are a legal choice: ask once, then remember it as a fact.
    if (field.type === 'checkbox' && /(agree|consent|acknowledge|terms|privacy|certify)/i.test(field.label)) {
      const remembered = ctx.facts?.consent_privacy_terms?.value;
      if (remembered === true || remembered === 'Yes' || remembered === 'true') {
        return { question: field.label, outcome: 'answer', answer: true, formattedAnswer: 'Yes', confidence: 1, reason: 'You allowed accepting privacy/terms checkboxes', field };
      }
      if (!field.required) return { question: field.label, outcome: 'answer', formattedAnswer: '', confidence: 1, reason: 'Optional consent left unticked', field };
      return { question: field.label, outcome: 'ask', formattedAnswer: '', confidence: 0.3, reason: 'Consent checkbox: your decision (save it as the fact consent_privacy_terms to stop being asked)', field };
    }
    // Keep what the site pre-filled from your profile (Naukri, LinkedIn do this).
    if (field.value && field.type !== 'file' && field.control !== 'radio') {
      return { question: field.label, outcome: 'answer', formattedAnswer: field.value, confidence: 0.9, reason: 'Pre-filled by the site from your profile', field };
    }
    return { ...answerQuestion(field, ctx), field };
  });
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The open menu's options. `aria-controls` only appears once the dropdown is
 * open, and pages often hold other hidden listboxes (the phone-country picker),
 * so options are scoped to this control's own listbox.
 */
async function optionsOf(scope: Scope, loc: Locator): Promise<Locator> {
  const listbox = await loc.getAttribute('aria-controls').catch(() => null);
  return listbox
    ? scope.locator(`[id="${listbox}"] [role="option"]`)
    : scope.locator('[role="listbox"]:visible [role="option"]');
}

/**
 * Custom dropdown: type to filter, click the option whose text matches, and
 * confirm it took. No match means the field goes to the human: pressing Enter
 * would pick whatever happens to be first, which could be a false answer.
 */
async function pickOption(scope: Scope, loc: Locator, value: string): Promise<boolean> {
  await loc.scrollIntoViewIfNeeded().catch(() => undefined);
  await loc.click({ timeout: 5000 }).catch(() => loc.focus());
  await pause(200, 500);
  await loc.pressSequentially(value, { delay: 40 }).catch(() => undefined);
  await pause(500, 900);
  const exact = new RegExp(`^\\s*${escapeRe(value)}\\s*$`, 'i');
  const prefix = new RegExp(`^\\s*${escapeRe(value)}`, 'i');
  // Typeahead fields (city search) fetch suggestions asynchronously: wait for them.
  let opt: Locator | undefined;
  for (let waited = 0; waited < 4000 && !opt; waited += 400) {
    const opts = await optionsOf(scope, loc);
    if (await opts.filter({ hasText: exact }).count()) opt = opts.filter({ hasText: exact }).first();
    else if (await opts.filter({ hasText: prefix }).count()) opt = opts.filter({ hasText: prefix }).first();
    else await pause(400, 400);
  }
  if (!opt) {
    await loc.press('Escape').catch(() => undefined);
    return false;
  }
  await opt.click({ timeout: 5000 });
  await pause(150, 300);
  await loc.press('Tab').catch(() => undefined);
  return true;
}

/**
 * Fill the planned answers into the page. Returns what was typed (for the
 * audit trail) and the fields that could not be filled, which go to the
 * Human Gate by name rather than failing the whole application.
 */
export async function fillFields(scope: Scope, plan: (FormAnswer & { field: DomField })[], ctx: FillContext): Promise<{ typed: Record<string, string>; failed: string[] }> {
  const typed: Record<string, string> = {};
  const failed: string[] = [];
  for (const a of plan) {
    const f = a.field;
    if (a.outcome !== 'answer') continue;
    const loc = scope.locator(`[data-jh-id="${f.id}"]`).first();
    try {
      if (f.control === 'file') {
        const path = a.attach === 'cover_letter' ? ctx.coverLetterPath : a.attach === 'resume' ? ctx.resumePdf : undefined;
        if (path) { await loc.setInputFiles(path); typed[f.label] = path.split('/').pop()!; }
        continue;
      }
      const value = a.formattedAnswer;
      if (!value || value === f.value) continue;
      if (f.control === 'select') {
        await loc.selectOption({ label: value }).catch(() => loc.selectOption(value));
      } else if (f.control === 'combobox') {
        if (!(await pickOption(scope, loc, value))) { if (f.required) failed.push(`${f.label} (no option matches "${value}")`); continue; }
      } else if (f.control === 'radio') {
        // Match the option by its visible label: <label for>, a wrapping <label>, or the value.
        await ensurePageHelpers(scope);
        const picked = await scope.evaluate(({ name, want }) => {
          const n = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          for (const r of Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)) as HTMLInputElement[]) {
            const forLabel = r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`)?.textContent : '';
            const text = forLabel || r.closest('label')?.textContent || r.parentElement?.textContent || '';
            if (n(text) === n(want) || n(r.value) === n(want)) { r.click(); return r.checked; }
          }
          return false;
        }, { name: f.name ?? '', want: value });
        if (!picked) { if (f.required) failed.push(`${f.label} (no option matches "${value}")`); continue; }
      } else if (f.control === 'checkbox') {
        if (/^(yes|true)$/i.test(value)) await loc.check({ force: true });
      } else {
        await loc.scrollIntoViewIfNeeded().catch(() => undefined);
        await loc.click({ timeout: 5000 });
        await loc.fill('');
        // Long text is pasted; short fields are typed at human speed.
        if (value.length > 120) await loc.fill(value);
        else await loc.pressSequentially(value, { delay: 15 + Math.random() * 35 });
      }
      typed[f.label] = f.type === 'textarea' && value.length > 80 ? `${value.slice(0, 80)}…` : value;
      await pause(150, 600);
    } catch {
      if (f.required) failed.push(f.label);
    }
  }
  return { typed, failed };
}

// --------------------------------------------------------------- blockers ----

export type Blocker = { kind: 'captcha' | 'login' | 'otp' | 'account'; detail: string };

/** Things only a human may clear. We never try to defeat them. */
export async function detectBlocker(page: Page): Promise<Blocker | undefined> {
  // Many forms load an invisible reCAPTCHA/hCaptcha on every page; only a
  // challenge the user can actually see needs them.
  const challenge = page.locator('iframe[src*="recaptcha/api2/bframe"], iframe[src*="recaptcha"][title*="challenge" i], iframe[src*="hcaptcha"][title*="challenge" i], iframe[src*="hcaptcha"][src*="checkbox"], iframe[src*="challenges.cloudflare.com"], iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], iframe[title*="reCAPTCHA" i]:not([src*="size=invisible"])');
  for (let i = 0; i < await challenge.count(); i++) {
    const box = await challenge.nth(i).boundingBox().catch(() => null);
    if (box && box.width > 60 && box.height > 60 && await challenge.nth(i).isVisible().catch(() => false)) {
      return { kind: 'captcha', detail: 'A CAPTCHA challenge is showing' };
    }
  }
  const text = (await page.locator('body').innerText().catch(() => '')).slice(0, 5000);
  if (/verify (that )?you('| a)re (a )?human|are you a robot|security check|unusual activity/i.test(text)) {
    return { kind: 'captcha', detail: 'The site is asking to verify you are human' };
  }
  if (await page.locator('input[autocomplete="one-time-code"], input[name*="otp" i], input[id*="otp" i]').first().isVisible().catch(() => false)) {
    return { kind: 'otp', detail: 'The site sent a one-time code' };
  }
  if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) {
    const create = /create (an )?account|sign up|register/i.test(text);
    return { kind: create ? 'account' : 'login', detail: create ? 'The site requires creating an account' : 'You are not logged in on this site' };
  }
  return undefined;
}

export const CONFIRMATION_RE =
  /(thank(s| you) for (applying|your application|your interest)|application (has been |was )?(submitted|received|sent|complete)|we('ve| have) received your application|successfully (submitted|applied)|you('ve| have) (successfully )?applied|applied successfully|your application is on its way)/i;

/** Primary action buttons in a form step. */
export async function findAction(scope: Scope, root = 'body'): Promise<{ kind: 'submit' | 'next'; locator: Locator; text: string } | undefined> {
  const buttons = scope.locator(`${root} button, ${root} input[type="submit"], ${root} [role="button"]`);
  const count = await buttons.count();
  let next: { kind: 'next'; locator: Locator; text: string } | undefined;
  for (let i = 0; i < count; i++) {
    const b = buttons.nth(i);
    if (!(await b.isVisible().catch(() => false)) || (await b.isDisabled().catch(() => false))) continue;
    const text = ((await b.innerText().catch(() => '')) || (await b.getAttribute('value')) || (await b.getAttribute('aria-label')) || '').trim();
    if (/^(submit( (your )?application)?|send application|apply( now)?|submit & apply|finish)$/i.test(text)) return { kind: 'submit', locator: b, text };
    if (!next && /^(next|continue|review( your application)?|save (and|&) continue|proceed|save)$/i.test(text)) next = { kind: 'next', locator: b, text };
  }
  return next;
}

/** Validation messages the site shows after a failed step. */
export async function formErrors(scope: Scope): Promise<string[]> {
  const texts = await scope.locator('[role="alert"], [aria-live="assertive"], [class*="error" i]:not(:empty), [aria-invalid="true"]')
    .allInnerTexts().catch(() => []);
  return Array.from(new Set(texts.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 200))).slice(0, 5);
}
