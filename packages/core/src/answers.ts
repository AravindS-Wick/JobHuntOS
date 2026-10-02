import { FACTS_BY_KEY, formatFactValue, type FactMap } from './facts.js';
import { PROFILE, type Profile } from './profile.js';
import { countryOf, resolveScreeningQuestion, type QuestionResolution } from './resolver.js';
import type { ResumeDoc } from './resume.js';

/**
 * One field on an application form, as read from an ATS API or from the DOM
 * by the browser worker. The same answering logic serves both.
 */
export interface FormQuestion {
  label: string;
  /** Input name/id when known (Greenhouse: "first_name", "question_123"). */
  name?: string;
  type: 'text' | 'textarea' | 'email' | 'tel' | 'url' | 'number' | 'select' | 'multiselect' | 'radio' | 'checkbox' | 'file' | 'date' | 'hidden';
  options?: string[];
  required?: boolean;
}

export interface FormAnswer extends QuestionResolution {
  question: string;
  name?: string;
  /** For file inputs: which document to attach. */
  attach?: 'resume' | 'cover_letter';
}

export interface AnswerContext {
  facts?: FactMap;
  profile?: Profile;
  resume?: ResumeDoc;
  /** Present only when the job warrants one (Tier 1 or the form requires it). */
  coverLetter?: string;
  /** The job's location; decides work-authorization answers that don't name a country. */
  jobLocation?: string;
  /** Used only when a form *requires* a cover letter and none was generated for this job. */
  fallbackCoverLetter?: string;
}

const fromSource = (question: string, value: string | undefined, reason: string, name?: string): FormAnswer =>
  value
    ? { question, name, outcome: 'answer', answer: value, formattedAnswer: value, confidence: 0.99, reason }
    : { question, name, outcome: 'ask', formattedAnswer: '', confidence: 0.3, reason: `${reason} — not found in your resume or fact table` };

/**
 * Canonical question text for matching a saved answer. "How did you hear about
 * this role at Grafana?" and "…at Stripe?" are one question; anything else
 * company-specific ("Why do you want to work at X?") is not generalised.
 */
const normQ = (s: string) => {
  const t = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (/^how did you (hear|learn|find out) about/.test(t) || /^(where|how) did you (find|see|discover) (this|the|our)/.test(t)) return 'how did you hear about us';
  return t;
};

function fact(key: string, facts: FactMap | undefined): string | undefined {
  const f = facts?.[key] ?? FACTS_BY_KEY[key];
  return f ? formatFactValue(f.value) : undefined;
}

function link(resume: ResumeDoc | undefined, re: RegExp): string | undefined {
  const l = resume?.contact.links.find((x) => re.test(x));
  return l && !/^https?:\/\//.test(l) ? `https://${l}` : l;
}

/** Contact and identity fields come from the master resume first, then the fact table. */
function standardField(q: FormQuestion, ctx: AnswerContext): FormAnswer | undefined {
  const label = `${q.name ?? ''} ${q.label}`.toLowerCase();
  const r = ctx.resume;
  const f = ctx.facts;
  const [first, ...rest] = (r?.name ?? '').split(' ');

  const text = q.label.toLowerCase().trim();
  // Questions about eligibility or sponsorship mention a country but are yes/no: leave them to the resolver.
  const isEligibility = /(eligib|authori[sz]|sponsor|visa|permit|willing|relocat|open to)/.test(text);

  if (q.type === 'file') {
    if (/autofill|auto-fill|parse/.test(label)) return { question: q.label, name: q.name, outcome: 'answer', formattedAnswer: '', confidence: 1, reason: 'Skipped resume autofill; fields are filled from verified data instead' };
    if (/resume|cv/.test(label)) return { question: q.label, name: q.name, outcome: 'answer', formattedAnswer: 'tailored resume (PDF)', confidence: 1, reason: 'Tailored resume for this job', attach: 'resume' };
    if (/cover/.test(label)) {
      const letter = ctx.coverLetter ?? (q.required ? ctx.fallbackCoverLetter : undefined);
      return letter
        ? { question: q.label, name: q.name, outcome: 'answer', formattedAnswer: 'cover letter', confidence: 1, reason: 'Generated from master-resume bullets', attach: 'cover_letter' }
        : { question: q.label, name: q.name, outcome: 'answer', formattedAnswer: '', confidence: 1, reason: 'Optional cover letter skipped' };
    }
    return undefined;
  }
  if (/cover.?letter/.test(label) && q.type === 'textarea') {
    const letter = ctx.coverLetter ?? (q.required ? ctx.fallbackCoverLetter : undefined);
    return letter
      ? fromSource(q.label, letter, 'Cover letter built from master-resume bullets', q.name)
      : { question: q.label, name: q.name, outcome: q.required ? 'ask' : 'answer', formattedAnswer: '', confidence: 0.5, reason: 'No cover letter for this job' };
  }
  if (/\bresume.?text\b/.test(label)) return { question: q.label, name: q.name, outcome: 'answer', formattedAnswer: '', confidence: 1, reason: 'Resume attached as a file instead' };
  if (/pronounc|nickname/.test(text)) return undefined;
  if (/\b(first.?name|given.?name)\b/.test(label)) return fromSource(q.label, first || fact('first_name', f), 'First name', q.name);
  if (/\b(last.?name|surname|family.?name)\b/.test(label)) return fromSource(q.label, rest.join(' ') || fact('last_name', f), 'Last name', q.name);
  if (/^((your|full|legal|candidate)\s+)?name$/.test(text) || /^(full_?name|name)$/i.test(q.name ?? '')) return fromSource(q.label, r?.name || fact('full_name', f), 'Full name', q.name);
  if (/e-?mail/.test(label) && !/other|alternate/.test(label)) return fromSource(q.label, r?.contact.email || fact('email', f), 'Email', q.name);
  if (/\b(phone|mobile|contact number)\b/.test(label) && !/country.?code/.test(label)) return fromSource(q.label, r?.contact.phone || fact('phone', f), 'Phone', q.name);
  if (/linkedin/.test(label)) return fromSource(q.label, link(r, /linkedin\.com/) || fact('linkedin_url', f), 'LinkedIn URL', q.name);
  if (/github/.test(label)) return fromSource(q.label, link(r, /github\.com/) || fact('github_url', f), 'GitHub URL', q.name);
  if (/(portfolio|website|personal site)/.test(label)) return fromSource(q.label, link(r, /^(?!.*(linkedin|github))/) || fact('portfolio_url', f), 'Portfolio URL', q.name);
  if (/(current|previous|most recent).*(employer|company)/.test(label)) return fromSource(q.label, r?.experience[0]?.company, 'Current employer from master resume', q.name);
  if (/(current|previous|most recent).*(job )?title|current (role|designation)/.test(label)) return fromSource(q.label, r?.experience[0]?.title, 'Current title from master resume', q.name);
  if (!isEligibility && (/^(country|country of residence|current country)$/.test(text) || /(what|which) country (are you|do you)|country (are you )?(based|living|located) in|country.*(reside|you live)/.test(text))) {
    const country = fact('country', f);
    const opt = q.options?.find((o) => o.toLowerCase() === country?.toLowerCase()) ?? country;
    return fromSource(q.label, opt, 'Country of residence from fact table', q.name);
  }
  if (!isEligibility && (/^(current |your )?(location|city)( \(city\))?$/.test(text) || /^where are you (currently )?(based|located)/.test(text) || /^location$/i.test(q.name ?? ''))) {
    const city = fact('city', f);
    // Location pickers autocomplete on the city; free-text fields get "City, Country".
    const value = q.type === 'select' ? city : city && fact('country', f) ? `${city}, ${fact('country', f)}` : r?.contact.location;
    return fromSource(q.label, value, 'Current location from fact table', q.name);
  }
  return undefined;
}

/** Answer one form field truthfully, or say why the human must. */
export function answerQuestion(q: FormQuestion, ctx: AnswerContext = {}): FormAnswer {
  if (q.type === 'hidden') return { question: q.label, name: q.name, outcome: 'answer', formattedAnswer: '', confidence: 1, reason: 'Hidden field' };
  const std = standardField(q, ctx);
  if (std) return std;

  // An answer you gave before (Human Gate → "remember") is stored as a fact labelled with the question.
  const saved = Object.values(ctx.facts ?? {}).find((f) => normQ(f.label) === normQ(q.label));
  if (saved) {
    const value = formatFactValue(saved.value);
    const opt = q.options?.find((o) => normQ(o) === normQ(value)) ?? value;
    return { question: q.label, name: q.name, outcome: 'answer', answer: saved.value, formattedAnswer: opt, key: saved.key, confidence: 1, reason: `You answered this before (fact ${saved.key})`, fact: saved };
  }

  // Demographic / EEO questions: voluntary; decline rather than guess.
  if (/(gender|race|ethnic|veteran|disabilit|sexual orientation|pronoun|hispanic)/i.test(q.label)) {
    const decline = q.options?.find((o) => /decline|prefer not|don.t wish|do not wish|not to (say|answer|disclose)/i.test(o));
    if (decline) return { question: q.label, name: q.name, outcome: 'answer', answer: decline, formattedAnswer: decline, confidence: 0.9, reason: 'Voluntary demographic question: declined' };
    return { question: q.label, name: q.name, outcome: q.required ? 'ask' : 'answer', formattedAnswer: '', confidence: 0.5, reason: 'Voluntary demographic question' };
  }

  const res = resolveScreeningQuestion(q.label, {
    options: q.options, facts: ctx.facts, profile: ctx.profile ?? PROFILE, jobCountry: countryOf(ctx.jobLocation),
  });
  // An optional question we can't answer is skipped, not escalated.
  if (res.outcome === 'ask' && !q.required) {
    return { ...res, question: q.label, name: q.name, outcome: 'answer', formattedAnswer: '', reason: `Optional; left blank (${res.reason})` };
  }
  return { ...res, question: q.label, name: q.name };
}

export interface FormPlan {
  answers: FormAnswer[];
  /** Questions only the human can answer. */
  asks: FormAnswer[];
  /** Questions that would require misrepresentation: do not apply. */
  aborts: FormAnswer[];
}

export function planForm(questions: FormQuestion[], ctx: AnswerContext = {}): FormPlan {
  const answers = questions.map((q) => answerQuestion(q, ctx));
  return {
    answers,
    asks: answers.filter((a) => a.outcome === 'ask'),
    aborts: answers.filter((a) => a.outcome === 'abort'),
  };
}
