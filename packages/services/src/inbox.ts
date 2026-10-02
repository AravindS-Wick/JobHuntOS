import type { Repos } from '@jobhunt/db';
import {
  fetchGmailMessages,
  type ParsedEmailMessage,
  type EmailCategory,
} from '@jobhunt/connectors';
import { profileService } from './profile.js';

export interface InboxSyncOptions {
  accessToken?: string;
  query?: string;
  maxResults?: number;
  fetcher?: (opts: { accessToken?: string; query?: string; maxResults?: number }) => Promise<ParsedEmailMessage[]>;
}

export interface SyncResult {
  synced: number;
  inserted: number;
  updated: number;
  linkedToJobs: number;
  categories: Record<string, number>;
  actionRequired: number;
}

export function inboxService(repos: Repos) {
  const profiles = profileService(repos);

  return {
    async sync(opts: InboxSyncOptions = {}): Promise<SyncResult> {
      const { fetcher = fetchGmailMessages, maxResults = 25, accessToken, query } = opts;

      // 1. Fetch messages
      let rawMessages: ParsedEmailMessage[] = [];
      try {
        rawMessages = await fetcher({ accessToken, query, maxResults });
      } catch (err) {
        console.warn('Inbox fetch failed:', err);
      }

      // If no live access token was provided or empty returned in offline mode, ensure we handle gracefully
      const categories: Record<string, number> = {};
      let linkedToJobs = 0;
      let actionRequired = 0;

      // 2. Resolve job links and company matches
      for (const msg of rawMessages) {
        categories[msg.category] = (categories[msg.category] ?? 0) + 1;
        if (msg.actionRequired) actionRequired++;

        if (msg.companyMentioned) {
          const compNorm = msg.companyMentioned.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const matchingJobs = await repos.jobs.list({ q: msg.companyMentioned }, {}, { limit: 1, offset: 0 });
          if (matchingJobs.items.length > 0) {
            const job = matchingJobs.items[0]!;
            linkedToJobs++;

            // Auto status update on critical signals
            if (msg.category === 'interview_invite') {
              await repos.events.record({
                entityType: 'job',
                entityId: job.id,
                action: 'interview_detected',
                actor: 'system',
                payload: {
                  messageId: msg.id,
                  subject: msg.subject,
                  interviewUrl: msg.interviewUrl,
                },
              });
            } else if (msg.category === 'rejection') {
              await repos.events.record({
                entityType: 'job',
                entityId: job.id,
                action: 'rejection_detected',
                actor: 'system',
                payload: {
                  messageId: msg.id,
                  subject: msg.subject,
                },
              });
            }
          }
        }
      }

      // 3. Persist messages
      const persist = await repos.inbox.upsertMany(rawMessages);

      await repos.events.record({
        entityType: 'inbox',
        action: 'inbox_synced',
        actor: 'system',
        payload: {
          synced: rawMessages.length,
          inserted: persist.inserted,
          linkedToJobs,
          categories,
        },
      });

      return {
        synced: rawMessages.length,
        inserted: persist.inserted,
        updated: persist.updated,
        linkedToJobs,
        categories,
        actionRequired,
      };
    },

    async generateDraftReply(messageId: string, instructions?: string): Promise<{
      messageId: string;
      draftBody: string;
      subject: string;
      to: string;
      actionCategory: EmailCategory;
    }> {
      const msg = await repos.inbox.byId(messageId);
      if (!msg) {
        throw new Error(`Inbox message not found: ${messageId}`);
      }

      const profile = await profiles.resolve();
      const candidateName = profile.name;
      const cleanSubject = msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`;
      const to = msg.sender;
      const category = msg.category as EmailCategory;

      let draft = '';

      switch (category) {
        case 'interview_invite':
          draft = `Hi ${msg.senderName || 'Hiring Team'},

Thank you so much for the invitation to speak with the engineering team.

I am very excited about the opportunity at ${msg.companyMentioned || 'your company'} and look forward to our discussion. My availability: [add your availability]${
            msg.interviewUrl ? `. I have the scheduling link (${msg.interviewUrl})` : ''
          }.

Please let me know if you need any additional details from my side prior to our meeting.

Best regards,
${candidateName}`;
          break;

        case 'assessment_link':
          draft = `Hi ${msg.senderName || 'Talent Acquisition Team'},

Thank you for sharing the technical assessment details.

I have received the link${msg.assessmentUrl ? ` (${msg.assessmentUrl})` : ''} and will review the details.

Thanks again for coordinating this step.

Best regards,
${candidateName}`;
          break;

        case 'recruiter_outreach':
          draft = `Hi ${msg.senderName || 'there'},

Thank you for reaching out regarding the ${msg.jobTitleMentioned || 'engineering'} opportunity at ${msg.companyMentioned || 'your organization'}.

My background is in React, Node.js and TypeScript. I would love to learn more about the team's roadmap, the core technical challenges, and the role's scope.

Would you be open to a brief introductory call this week?

Best regards,
${candidateName}`;
          break;

        case 'offer':
          draft = `Hi ${msg.senderName || 'Team'},

Thank you very much for extending this offer. I am thrilled about the prospect of joining ${msg.companyMentioned || 'the team'} and making an impact on the platform.

I am reviewing the offer terms and documents and will get back to you shortly with any questions or confirmations.

Warm regards,
${candidateName}`;
          break;

        case 'rejection':
          draft = `Hi ${msg.senderName || 'Hiring Team'},

Thank you for following up and letting me know. I really enjoyed learning more about ${msg.companyMentioned || 'your company'} and the team's mission.

I would love to stay in touch for future opportunities where my full-stack background might be a good fit.

Wishing you and the team all the best.

Warm regards,
${candidateName}`;
          break;

        default:
          draft = `Hi ${msg.senderName || 'Team'},

Thank you for your email regarding ${msg.subject}.

${instructions || 'I have noted the details and will follow up accordingly.'}

Best regards,
${candidateName}`;
          break;
      }

      // Update message record with draft
      await repos.inbox.update(msg.id, { draftReply: draft });

      return {
        messageId: msg.id,
        draftBody: draft,
        subject: cleanSubject,
        to,
        actionCategory: category,
      };
    },
  };
}

export type InboxService = ReturnType<typeof inboxService>;
