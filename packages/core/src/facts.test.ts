import { describe, expect, it } from 'vitest';
import { DEFAULT_FACTS, FACTS_BY_KEY, formatFactValue, getFact } from './facts.js';
import { resolveScreeningQuestion } from './resolver.js';

describe('Verified Fact Table', () => {
  it('contains essential candidate facts with evidence', () => {
    expect(DEFAULT_FACTS.length).toBeGreaterThanOrEqual(25);
    const fullName = getFact('full_name');
    expect(fullName).toBeDefined();
    expect(fullName?.value).toBe('Aravindhan Sivaraman');
    expect(fullName?.evidence).toBeDefined();

    const exp = getFact('total_experience_years');
    expect(exp?.value).toBe(5.5);

    const expectedCtc = getFact('expected_ctc_lpa');
    expect(expectedCtc?.value).toBe(25);

    const notice = getFact('notice_period_days');
    expect(notice?.value).toBe(60);
  });

  it('formats booleans, arrays and primitives properly', () => {
    expect(formatFactValue(true)).toBe('Yes');
    expect(formatFactValue(false)).toBe('No');
    expect(formatFactValue(60)).toBe('60');
    expect(formatFactValue(['Chennai', 'Bengaluru'])).toBe('Chennai, Bengaluru');
  });
});

describe('Screening Question Resolver (PRD §5.4 D3)', () => {
  it('resolves notice period in days and text', () => {
    const resDays = resolveScreeningQuestion('What is your notice period in days?');
    expect(resDays.outcome).toBe('answer');
    expect(resDays.answer).toBe(60);
    expect(resDays.formattedAnswer).toBe('60');

    const resText = resolveScreeningQuestion('What is your official notice period?');
    expect(resText.outcome).toBe('answer');
    expect(resText.formattedAnswer).toContain('60 days');

    const resOptions = resolveScreeningQuestion('Please select your notice period', {
      options: ['Immediate', '15 days', '30 days', '60 days', '90 days'],
    });
    expect(resOptions.outcome).toBe('answer');
    expect(resOptions.formattedAnswer).toBe('60 days');
  });

  it('resolves work authorization and sponsorship truthfully', () => {
    // India work authorization
    const authIndia = resolveScreeningQuestion('Are you legally authorized to work in India?');
    expect(authIndia.outcome).toBe('answer');
    expect(authIndia.answer).toBe(true);
    expect(authIndia.formattedAnswer).toBe('Yes');

    // India sponsorship
    const sponsorIndia = resolveScreeningQuestion('Will you require visa sponsorship in India?');
    expect(sponsorIndia.outcome).toBe('answer');
    expect(sponsorIndia.answer).toBe(false);
    expect(sponsorIndia.formattedAnswer).toBe('No');

    // US sponsorship & authorization
    const sponsorUS = resolveScreeningQuestion('Will you require visa sponsorship to work in the United States?');
    expect(sponsorUS.outcome).toBe('answer');
    expect(sponsorUS.answer).toBe(true);

    const authUS = resolveScreeningQuestion('Are you legally authorized to work in the United States?');
    expect(authUS.outcome).toBe('answer');
    expect(authUS.answer).toBe(false);
    expect(authUS.formattedAnswer).toBe('No');
  });

  it('resolves compensation questions', () => {
    // Current salary is never in the code defaults: asked once, then stored locally.
    const curr = resolveScreeningQuestion('What is your current annual CTC (INR)?');
    expect(curr.outcome).toBe('ask');
    const stored = resolveScreeningQuestion('What is your current annual CTC (INR)?', {
      facts: { current_ctc_lpa: { key: 'current_ctc_lpa', category: 'compensation', label: 'Current CTC', value: 20, verifiedAt: '' } },
    });
    expect(stored.answer).toBe(20);

    const exp = resolveScreeningQuestion('What is your expected salary / CTC?');
    expect(exp.outcome).toBe('answer');
    expect(exp.answer).toBe(25);
  });

  it('resolves verified skills with accurate production years', () => {
    const reactQ = resolveScreeningQuestion('How many years of experience do you have with React?');
    expect(reactQ.outcome).toBe('answer');
    expect(reactQ.answer).toBe(5);

    const tsBinary = resolveScreeningQuestion('Do you have experience with TypeScript?', {
      options: ['Yes', 'No'],
    });
    expect(tsBinary.outcome).toBe('answer');
    expect(tsBinary.answer).toBe(true);
    expect(tsBinary.formattedAnswer).toBe('Yes');
  });

  it('ENFORCES TRUTH CONSTRAINT on gaps: never fabricates experience', () => {
    // Numeric question about a gap technology (AWS)
    const awsQ = resolveScreeningQuestion('How many years of professional experience do you have with AWS?');
    expect(awsQ.outcome).toBe('answer');
    expect(awsQ.answer).toBe(0);
    expect(awsQ.formattedAnswer).toBe('0');
    expect(awsQ.reason).toContain('Truth constraint');

    // Binary question about a gap technology (Kubernetes)
    const k8sQ = resolveScreeningQuestion('Have you worked with Kubernetes in production?', {
      options: ['Yes', 'No'],
    });
    expect(k8sQ.outcome).toBe('answer');
    expect(k8sQ.answer).toBe(false);
    expect(k8sQ.formattedAnswer).toBe('No');
    expect(k8sQ.reason).toContain('Truth constraint');
  });

  it('ABORTS on mandatory requirement questions involving gaps', () => {
    const mandatoryK8s = resolveScreeningQuestion(
      'This role has a mandatory requirement: Do you have production Kubernetes experience?'
    );
    expect(mandatoryK8s.outcome).toBe('abort');
    expect(mandatoryK8s.reason).toContain('Aborting to prevent misrepresentation');
  });

  it('resolves relocation and profile link queries', () => {
    const bgl = resolveScreeningQuestion('Are you open to relocating to Bengaluru?');
    expect(bgl.outcome).toBe('answer');
    expect(bgl.answer).toBe(true);

    // Profile links come from the master resume or a stored fact, never from code defaults.
    expect(resolveScreeningQuestion('GitHub URL').outcome).toBe('ask');
    const facts = {
      linkedin_url: { key: 'linkedin_url', category: 'links' as const, label: 'LinkedIn', value: 'https://linkedin.com/in/sample', verifiedAt: '' },
      github_url: { key: 'github_url', category: 'links' as const, label: 'GitHub', value: 'https://github.com/sample', verifiedAt: '' },
    };
    expect(resolveScreeningQuestion('Please share your LinkedIn profile URL', { facts }).formattedAnswer).toBe('https://linkedin.com/in/sample');
    expect(resolveScreeningQuestion('GitHub URL', { facts }).formattedAnswer).toBe('https://github.com/sample');
  });

  it('marks novel or unfamiliar questions as ASK (Human Gate)', () => {
    const novelQ = resolveScreeningQuestion(
      'Describe a time you architected a zero-knowledge proof circuit for blockchain identity.'
    );
    expect(novelQ.outcome).toBe('ask');
    expect(novelQ.confidence).toBeLessThan(0.5);
    expect(novelQ.reason).toContain('Human Gate');
  });
});
