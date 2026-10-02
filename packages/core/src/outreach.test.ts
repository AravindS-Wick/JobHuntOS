import { describe, expect, it } from 'vitest';
import {
  buildDynamicTags,
  buildGmailWebComposeUrl,
  generateOutreach,
  OUTREACH_TEMPLATES,
  substituteTags,
  type OutreachContext,
} from './outreach.js';
import { PROFILE } from './profile.js';

describe('Outreach & Referral Generator', () => {
  const baseContext: OutreachContext = {
    recipientName: 'Sarah Connor',
    recipientEmail: 's.connor@skytech.io',
    company: 'SkyTech Systems',
    role: 'Lead Full-Stack Engineer',
    customNote: 'I loved reading your recent engineering blog on distributed indexing.',
  };

  it('generates dynamic tags without violating candidate profile or claiming gap skills', () => {
    const tags = buildDynamicTags(baseContext);

    expect(tags.candidate_name).toBe(PROFILE.name);
    expect(tags.company).toBe('SkyTech Systems');
    expect(tags.role).toBe('Lead Full-Stack Engineer');
    expect(tags.recipient_first_name).toBe('Sarah');
    expect(tags.years_experience).toBe(String(PROFILE.yearsExperience));

    // Truth constraint verification: gap skills must NEVER be in top_skills
    expect(tags.top_skills).toBeDefined();
    for (const gap of PROFILE.gaps) {
      expect((tags.top_skills ?? '').toLowerCase()).not.toContain(gap.toLowerCase());
    }
  });

  it('generates direct hiring manager pitch with valid Gmail compose URL', () => {
    const outreach = generateOutreach({
      ...baseContext,
      archetype: 'direct_hiring_manager',
    });

    expect(outreach.subject).toContain('Lead Full-Stack Engineer');
    expect(outreach.subject).toContain('SkyTech Systems');
    expect(outreach.bodyText).toContain('Hi Sarah,');
    expect(outreach.bodyText).toContain('SkyTech Systems');
    expect(outreach.bodyText).toContain('Lead Full-Stack Engineer');
    expect(outreach.bodyText).toContain('distributed indexing');
    expect(outreach.webComposeUrl).toContain('mail.google.com/mail/?view=cm');
    expect(outreach.webComposeUrl).toContain('s.connor%40skytech.io');
    expect(outreach.wordCount).toBeGreaterThan(30);
  });

  it('generates internal referral request with low-friction inquiry', () => {
    const outreach = generateOutreach({
      ...baseContext,
      recipientName: 'Alex Rivera',
      archetype: 'internal_referral',
    });

    expect(outreach.subject).toContain('SkyTech Systems');
    expect(outreach.bodyText).toContain('Hi Alex,');
    expect(outreach.bodyText).toContain('internal referral');
    expect(outreach.bodyText).toContain('GitHub');
  });

  it('supports recruiter pitch with core screening answers upfront', () => {
    const outreach = generateOutreach({
      ...baseContext,
      recipientName: 'Priya Sharma',
      archetype: 'recruiter_pitch',
    });

    expect(outreach.subject).toContain('Application: Lead Full-Stack Engineer');
    expect(outreach.bodyText).toContain('Key Highlights for Quick Screening');
    expect(outreach.bodyText).toContain('Notice Period');
  });

  it('supports custom templates with mustache/jinja-style tag substitution', () => {
    const customTemplate = {
      subject: 'Inquiry: {{role}} at {{company}} from {{candidate_name}}',
      body: 'Hello {recipient_first_name},\n\nI have {years_experience} years in {top_skills}. Would love to discuss {role}.\n\nBest,\n{candidate_name}',
    };

    const outreach = generateOutreach(
      {
        ...baseContext,
        recipientName: 'Michael Scott',
      },
      customTemplate
    );

    expect(outreach.subject).toBe(`Inquiry: Lead Full-Stack Engineer at SkyTech Systems from ${PROFILE.name}`);
    expect(outreach.bodyText).toContain('Hello Michael,');
    expect(outreach.bodyText).toContain(`I have ${PROFILE.yearsExperience} years`);
  });

  it('correctly constructs encoded 1-click Gmail web compose URL', () => {
    const url = buildGmailWebComposeUrl('recruiter@acme.com', 'Job Application', 'Hi there!\nLine 2');
    expect(url).toBe(
      'https://mail.google.com/mail/?view=cm&fs=1&to=recruiter%40acme.com&su=Job+Application&body=Hi+there%21%0ALine+2'
    );
  });
});
