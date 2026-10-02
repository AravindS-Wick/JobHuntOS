import { describe, expect, it } from 'vitest';
import { resolveScreeningQuestion } from './resolver.js';
import { mentionsTech } from './terms.js';
import { matchSkills, scoreJob } from './score.js';
import { normalizeJob } from './normalize.js';
import type { RawJob } from './types.js';

const raw = (descriptionText: string, extra: Partial<RawJob> = {}): RawJob => ({
  source: 'greenhouse', sourceId: '1', company: 'X', companySlug: 'x',
  title: 'Senior Frontend Engineer', url: 'https://x.test/1', locationRaw: 'Remote - India',
  descriptionText, postedAt: new Date(), ...extra,
});

describe('ambiguous technology terms', () => {
  it('does not read English "go" and "less" as technologies', () => {
    expect(mentionsTech('we need someone ready to go from day one', 'go')).toBe(false);
    expect(mentionsTech('no less than 5 years of experience', 'less')).toBe(false);
    expect(mentionsTech('willing to go onsite 3 days a week', 'go')).toBe(false);
  });

  it('still recognises them in a technical context', () => {
    expect(mentionsTech('Backend services written in Go', 'go')).toBe(true);
    expect(mentionsTech('Experience with Golang microservices', 'go')).toBe(true);
    expect(mentionsTech('Python, Go or Rust', 'go')).toBe(true);
    expect(mentionsTech('Styling with SASS/LESS', 'less')).toBe(true);
  });

  it('keeps English words out of job gaps', () => {
    const job = normalizeJob(raw('Build React and TypeScript UIs. Ready to go from day one, no less than 5 years.'));
    expect(matchSkills(job).gaps).toEqual([]);
  });
});

describe('company signal', () => {
  it('moves the companySignal component with the registry signal', () => {
    const job = normalizeJob(raw('React TypeScript Node.js'));
    expect(scoreJob(job, undefined, new Date()).breakdown.companySignal).toBe(2.5);
    expect(scoreJob(job, undefined, new Date(), 5).breakdown.companySignal).toBe(5);
    expect(scoreJob(job, undefined, new Date(), -5).breakdown.companySignal).toBe(0);
  });
});

describe('resolver truth constraint', () => {
  it('does not answer "go onsite" with Go-language years', () => {
    const r = resolveScreeningQuestion('Are you willing to go onsite 3 days a week?');
    expect(r.reason).not.toContain("'go'");
    expect(r.answer).not.toBe(0);
  });

  it('asks instead of estimating years for a skill with no verified year count', () => {
    const r = resolveScreeningQuestion('How many years of experience do you have with Express?');
    expect(r.outcome).toBe('ask');
    expect(r.answer).toBeUndefined();
  });

  it('answers years only from a verified fact', () => {
    const r = resolveScreeningQuestion('How many years of experience do you have with React.js?');
    expect(r.outcome).toBe('answer');
    expect(r.key).toBe('react_experience_years');
  });

  it('answers "currently serving notice" as a yes/no fact', () => {
    const r = resolveScreeningQuestion('Are you currently serving your notice period?', { options: ['Yes', 'No'] });
    expect(r.key).toBe('currently_serving_notice');
    expect(['Yes', 'No']).toContain(r.formattedAnswer);
  });
});

describe('discipline comes from the title', () => {
  it('disqualifies sales and support roles even when the JD mentions the stack', () => {
    const jd = 'Work with engineering on SQL, AI tools, Agile, React dashboards and REST API integrations.';
    for (const title of ['Senior Enterprise Account Executive, Acquisition', 'Product Support - Bridge']) {
      const s = scoreJob(normalizeJob(raw(jd, { title })));
      expect(s.disqualified).toBe('not an engineering role');
      expect(s.tier).toBe(4);
    }
    expect(scoreJob(normalizeJob(raw(jd, { title: 'Senior Software Engineer' }))).disqualified).toBeUndefined();
  });
});
