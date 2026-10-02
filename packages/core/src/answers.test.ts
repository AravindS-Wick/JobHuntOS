import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerQuestion, planForm, type FormQuestion } from './answers.js';
import { parseResumeText } from './resume.js';
import { parseGreenhouseQuestions } from '../../connectors/src/greenhouse.js';

const resume = parseResumeText(readFileSync(resolve(__dirname, '../../../fixtures/resume.sample.txt'), 'utf8'));
const ghForm = parseGreenhouseQuestions(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/greenhouse.questions.json'), 'utf8')));

describe('answerQuestion', () => {
  const ctx = { resume };
  const ask = (label: string, extra: Partial<FormQuestion> = {}) => answerQuestion({ label, type: 'text', required: true, ...extra }, ctx);

  it('fills identity and contact from the master resume', () => {
    expect(ask('First Name', { name: 'first_name' }).formattedAnswer).toBe('Sample');
    expect(ask('Last Name', { name: 'last_name' }).formattedAnswer).toBe('Candidate');
    expect(ask('Email', { name: 'email' }).formattedAnswer).toBe('sample.candidate@example.com');
    expect(ask('LinkedIn Profile').formattedAnswer).toBe('https://linkedin.com/in/sample-candidate');
    expect(ask('Who is your current or previous employer?').formattedAnswer).toBe('Example Corp');
  });

  it('attaches the resume and skips an optional cover letter when none was generated', () => {
    expect(answerQuestion({ label: 'Resume/CV', type: 'file', required: true }, ctx)).toMatchObject({ outcome: 'answer', attach: 'resume' });
    expect(answerQuestion({ label: 'Cover Letter', type: 'file', required: false }, ctx)).toMatchObject({ outcome: 'answer', formattedAnswer: '' });
  });

  it('declines voluntary demographic questions instead of guessing', () => {
    const a = answerQuestion({ label: 'Gender', type: 'select', options: ['Male', 'Female', 'Decline to self-identify'] }, ctx);
    expect(a.formattedAnswer).toBe('Decline to self-identify');
  });

  it('leaves an unknown optional question blank but escalates a required one', () => {
    expect(answerQuestion({ label: 'Favourite colour?', type: 'text', required: false }, ctx)).toMatchObject({ outcome: 'answer', formattedAnswer: '' });
    expect(answerQuestion({ label: 'Favourite colour?', type: 'text', required: true }, ctx).outcome).toBe('ask');
  });
});

describe('planForm on a real Greenhouse form', () => {
  const plan = planForm(ghForm, { resume, jobLocation: 'Bengaluru, India' });
  const by = (p: typeof plan, re: RegExp) => p.answers.find((a) => re.test(a.question))!;

  it('answers the standard fields', () => {
    expect(by(plan, /^First Name/).formattedAnswer).toBe('Sample');
    expect(by(plan, /^Resume/).attach).toBe('resume');
  });

  it('asks when the answer depends on an earlier selection (Stripe: "the location(s) you selected")', () => {
    expect(by(plan, /authorized to work/i).outcome).toBe('ask');
    expect(by(plan, /sponsor/i).outcome).toBe('ask');
  });

  it('sends consent and judgement questions to the human, never a guess', () => {
    expect(plan.asks.length).toBeGreaterThan(0);
    for (const a of plan.asks) expect(a.formattedAnswer).toBe('');
    expect(plan.aborts).toEqual([]);
  });
});

describe('labels seen on live forms (Greenhouse, Lever, Ashby — 2026-10-02)', () => {
  const ctx = { resume };
  const q = (label: string, extra: Partial<FormQuestion> = {}) => answerQuestion({ label, type: 'text', required: true, ...extra }, ctx);

  it('reads a bare "Name" field as the full name, but not a pronunciation question', () => {
    expect(q('Name').formattedAnswer).toBe('Sample Candidate');
    expect(q('Name Pronunciation | How do you pronounce your name?', { required: false }).formattedAnswer).toBe('');
  });

  it('answers country and location fields from facts', () => {
    expect(q('Country').formattedAnswer).toBe('India');
    expect(q('What country are you based in?').formattedAnswer).toBe('India');
    expect(q('Location (City)', { type: 'select' }).formattedAnswer).toBe('Chennai');
  });

  it('treats "eligible to work in your country of residence" as yes/no, not a country', () => {
    const a = q('Are you currently eligible to work in your country of residence?', { type: 'select', options: ['Yes', 'No'] });
    expect(a.formattedAnswer).toBe('Yes');
    const s = q('Do you now or in the future require visa sponsorship to work in your country of residence?', { type: 'select', options: ['Yes', 'No'] });
    expect(s.formattedAnswer).toBe('No');
  });

  it('skips resume-autofill uploads', () => {
    expect(answerQuestion({ label: 'Autofill from resume', type: 'file' }, ctx).attach).toBeUndefined();
  });

  it('reuses an answer you saved at the Human Gate', () => {
    const facts = { heard_about: { key: 'heard_about', category: 'preferences' as const, label: 'How did you hear about this opportunity?', value: 'Company careers page', verifiedAt: '' } };
    const a = answerQuestion({ label: 'How did you hear about this opportunity?', type: 'select', options: ['LinkedIn', 'Company careers page'], required: true }, { resume, facts });
    expect(a).toMatchObject({ outcome: 'answer', formattedAnswer: 'Company careers page' });
  });

  it('fills a required cover letter from the fallback, not an optional one', () => {
    const fallback = 'Dear team…';
    expect(answerQuestion({ label: 'Cover letter', type: 'textarea', required: true }, { resume, fallbackCoverLetter: fallback }).formattedAnswer).toBe(fallback);
    expect(answerQuestion({ label: 'Cover letter', type: 'textarea', required: false }, { resume, fallbackCoverLetter: fallback }).formattedAnswer).toBe('');
  });
});

describe('work authorization follows the job country', () => {
  const q: FormQuestion = { label: 'Will you require sponsorship for a work visa?', type: 'select', options: ['Yes', 'No'], required: true };

  it('India job → India facts', () => {
    expect(answerQuestion(q, { resume, jobLocation: 'Bengaluru, Karnataka, India' }).formattedAnswer).toBe('No');
  });

  it('US job → US facts', () => {
    expect(answerQuestion(q, { resume, jobLocation: 'San Francisco, CA' }).formattedAnswer).toBe('Yes');
  });

  it('country with no verified fact → ask', () => {
    expect(answerQuestion(q, { resume, jobLocation: 'Dublin, Ireland' }).outcome).toBe('ask');
  });

  it('"contact us" is not the United States', () => {
    const a = answerQuestion({ label: 'Are you authorized to work in India? Contact us if unsure.', type: 'select', options: ['Yes', 'No'], required: true }, { resume });
    expect(a.key).toBe('authorized_in_india');
  });
});
