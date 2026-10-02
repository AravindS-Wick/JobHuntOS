import { PROFILE, type Profile } from './profile.js';
import { DEFAULT_FACTS, type FactMap } from './facts.js';

export type OutreachArchetype =
  | 'direct_hiring_manager'
  | 'internal_referral'
  | 'recruiter_pitch'
  | 'follow_up_1'
  | 'follow_up_2';

export interface OutreachContext {
  recipientName: string;
  recipientEmail?: string;
  company: string;
  role: string;
  archetype?: OutreachArchetype;
  jobDescription?: string;
  customNote?: string;
  matchedSkills?: string[];
  facts?: FactMap;
  profile?: Profile;
}

export interface GeneratedOutreach {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  webComposeUrl: string;
  wordCount: number;
  charCount: number;
  archetype: OutreachArchetype;
  candidateName: string;
  recipientName: string;
  company: string;
  role: string;
}

/**
 * Standard Outreach Templates (Customizable & Jinja/Mustache Variable Compatible)
 */
export const OUTREACH_TEMPLATES: Record<
  OutreachArchetype,
  { name: string; description: string; subjectTemplate: string; bodyTemplate: string }
> = {
  direct_hiring_manager: {
    name: 'Direct Hiring Manager Cold Pitch',
    description: 'High-signal, value-first pitch to engineering directors, VPs, or CTOs.',
    subjectTemplate: '{{candidate_name}} — {role} @ {company} ({{top_skills}})',
    bodyTemplate: `Hi {recipient_first_name},

I saw your engineering team at {company} is scaling and hiring for {role}.

I bring {{years_experience}} years of production experience leading full-stack engineering, specializing in {{top_skills}}. In my recent roles, I architected high-throughput services with Fastify & Node.js, built scalable React/TypeScript interfaces, and containerized deployments on GCP Cloud Run.

{custom_note}

I have verified expertise in your required stack and would love to contribute immediately without onboarding lag:
- Production Stack: {{top_skills}}
- Notice Period: {{notice_period}}
- Portfolio / Code: {{github_url}} | {{portfolio_url}}

If you are open to a brief 10-minute technical chat this week, please let me know your availability.

Best regards,
{{candidate_name}}
{{candidate_phone}} | {{candidate_email}}
LinkedIn: {{linkedin_url}}`,
  },

  internal_referral: {
    name: 'Peer Engineer Referral Request',
    description: 'Low-friction, respectful request to current software engineers at the target company.',
    subjectTemplate: 'Quick question regarding engineering @ {company} / {role}',
    bodyTemplate: `Hi {recipient_first_name},

Hope you are having a productive week! I came across your profile while researching the engineering culture and systems at {company}.

I am actively targeting the {role} position open on your team. With {{years_experience}} years of full-stack experience in {{top_skills}}, I felt my background in scalable web apps directly aligns with what your team builds.

{custom_note}

I know internal employee referrals carry significant weight and save recruiters time. Would you be open to reviewing my GitHub ({{github_url}}) or submitting an internal referral if you feel there is a solid fit?

Happy to share my tailored resume and make the process completely frictionless for you. Either way, appreciate what your team is building at {company}!

Best,
{{candidate_name}}
{{linkedin_url}}`,
  },

  recruiter_pitch: {
    name: 'Technical Recruiter / Talent Acquisition Pitch',
    description: 'Crisp, structured introduction answering core recruiter screening questions upfront.',
    subjectTemplate: 'Application: {role} — {{candidate_name}} ({{years_experience}} YOE, {{notice_period}} Notice)',
    bodyTemplate: `Hi {recipient_first_name},

I noticed you are hiring for the {role} role at {company} and wanted to reach out directly.

Key Highlights for Quick Screening:
- Experience: {{years_experience}} Years (Senior Full-Stack & Frontend Lead)
- Core Strengths: {{top_skills}}
- Current Location: Chennai, India (Open to Bengaluru / Hyderabad & Remote)
- Notice Period: {{notice_period}}
- Work Authorization: Authorized to work in India (No sponsorship required)

{custom_note}

You can find my code repositories and technical projects here:
GitHub: {{github_url}}
Portfolio: {{portfolio_url}}

I would welcome the opportunity to discuss how my technical skills match {company}'s current requirements.

Warm regards,
{{candidate_name}}
{{candidate_email}} | {{candidate_phone}}`,
  },

  follow_up_1: {
    name: 'Follow-Up #1 (Day +4)',
    description: 'Gentle, respectful bump keeping the conversation warm.',
    subjectTemplate: 'Re: {role} @ {company} — quick follow-up',
    bodyTemplate: `Hi {recipient_first_name},

I wanted to quickly follow up on my note from earlier this week regarding the {role} role at {company}.

I understand you receive many messages, so no worries if your schedule is packed. Just wanted to reaffirm my enthusiasm for joining {company} and contributing with my background in {{top_skills}}.

Happy to connect whenever convenient.

Best,
{{candidate_name}}
{{candidate_email}}`,
  },

  follow_up_2: {
    name: 'Follow-Up #2 (Day +9 Final Value Add)',
    description: 'Final follow-up offering a concrete technical takeaway before closing the loop.',
    subjectTemplate: 'Re: {role} @ {company} — final check-in',
    bodyTemplate: `Hi {recipient_first_name},

Following up one final time regarding the {role} position.

In case it is helpful, here is a quick overview of recent architecture and automation work I completed on high-performance APIs and micro-frontends: {{github_url}}.

If the position has already been filled, no worries at all — I will stay in touch for future opportunities.

Thank you for your time,
{{candidate_name}}`,
  },
};

/**
 * Builds a dynamic tags dictionary from Candidate Profile, Fact Table, and target recipient.
 */
export function buildDynamicTags(ctx: OutreachContext): Record<string, string> {
  const profile = ctx.profile ?? PROFILE;
  const facts = ctx.facts ?? Object.fromEntries(DEFAULT_FACTS.map((f) => [f.key, f]));

  const candidateName = (facts['full_name']?.value as string) || profile.name;
  const candidateFirstName = (facts['first_name']?.value as string) || candidateName.split(' ')[0] || '';
  const candidatePhone = (facts['phone']?.value as string) || '';
  const candidateEmail = (facts['email']?.value as string) || '';
  const githubUrl = (facts['github_url']?.value as string) || '';
  const linkedinUrl = (facts['linkedin_url']?.value as string) || '';
  const portfolioUrl = (facts['portfolio_url']?.value as string) || '';
  const noticePeriod = (facts['notice_period_text']?.value as string) || '60 days (negotiable)';

  // Recipient info
  const recipientName = ctx.recipientName.trim();
  const recipientFirstName = recipientName.split(' ')[0] || recipientName;

  // Skills - Filter out gaps to respect Truth Constraint (PRD G4/D3)
  const skillsPool = Object.keys(profile.skills).filter((s) => !profile.gaps.includes(s));
  const topSkills = ctx.matchedSkills && ctx.matchedSkills.length > 0
    ? ctx.matchedSkills.filter((s) => !profile.gaps.includes(s)).slice(0, 4).join(', ')
    : skillsPool.slice(0, 4).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');

  const customNote = ctx.customNote ? ctx.customNote.trim() : '';

  return {
    candidate_name: candidateName,
    candidate_first_name: candidateFirstName,
    candidate_email: candidateEmail,
    candidate_phone: candidatePhone,
    recipient_name: recipientName,
    recipient_first_name: recipientFirstName,
    company: ctx.company,
    role: ctx.role,
    years_experience: String(profile.yearsExperience),
    top_skills: topSkills,
    notice_period: noticePeriod,
    github_url: githubUrl,
    linkedin_url: linkedinUrl,
    portfolio_url: portfolioUrl,
    custom_note: customNote,
  };
}

/**
 * Replaces both `{tag}` and `{{tag}}` placeholders with corresponding values.
 */
export function substituteTags(template: string, tags: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(tags)) {
    const regex = new RegExp(`(\\{{1,2}\\s*${key}\\s*\\}{1,2})`, 'gi');
    result = result.replace(regex, value);
  }
  // Clean up any empty custom_note lines
  result = result.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
  return result;
}

/**
 * Creates a 1-click web compose URL for Gmail
 */
export function buildGmailWebComposeUrl(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/**
 * Synthesizes a completely custom cold or referral outreach message.
 */
export function generateOutreach(
  ctx: OutreachContext,
  customTemplate?: { subject?: string; body?: string }
): GeneratedOutreach {
  const archetype = ctx.archetype ?? 'direct_hiring_manager';
  const defaultTmpl = OUTREACH_TEMPLATES[archetype];

  const tags = buildDynamicTags(ctx);

  const subjectTemplate = customTemplate?.subject || defaultTmpl.subjectTemplate;
  const bodyTemplate = customTemplate?.body || defaultTmpl.bodyTemplate;

  const subject = substituteTags(subjectTemplate, tags);
  const bodyText = substituteTags(bodyTemplate, tags);

  // Convert plain text to basic HTML with paragraphs
  const bodyHtml = bodyText
    .split('\n\n')
    .map((p) => `<p style="margin-bottom: 12px; line-height: 1.6;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  const recipientEmail = ctx.recipientEmail || '';
  const webComposeUrl = buildGmailWebComposeUrl(recipientEmail, subject, bodyText);

  const wordCount = bodyText.trim().split(/\s+/).length;
  const charCount = bodyText.length;

  return {
    subject,
    bodyText,
    bodyHtml,
    webComposeUrl,
    wordCount,
    charCount,
    archetype,
    candidateName: tags['candidate_name'] ?? PROFILE.name,
    recipientName: ctx.recipientName,
    company: ctx.company,
    role: ctx.role,
  };
}
