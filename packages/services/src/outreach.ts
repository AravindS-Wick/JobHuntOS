import {
  generateOutreach,
  buildDynamicTags,
  OUTREACH_TEMPLATES,
  type OutreachContext,
  type OutreachArchetype,
  type GeneratedOutreach,
  DEFAULT_FACTS,
} from '@jobhunt/core';
import {
  sendGmailSmtp,
  sendGmailApi,
  createGmailDraft,
  type GmailSendResult,
} from '@jobhunt/connectors';
import type { Repos } from '@jobhunt/db';
import type {
  GenerateOutreachRequest,
  GenerateOutreachResponse,
  SendOutreachEmailRequest,
  SendOutreachEmailResponse,
} from '@jobhunt/contracts';
import { profileService } from './profile.js';

export function outreachService(repos: Repos) {
  const profiles = profileService(repos);

  return {
    getTemplates() {
      return OUTREACH_TEMPLATES;
    },

    async generate(req: GenerateOutreachRequest): Promise<GenerateOutreachResponse> {
      const profile = await profiles.resolve();

      let storedFacts = await repos.facts.list();
      if (storedFacts.length === 0) {
        await repos.facts.seedDefaults(DEFAULT_FACTS);
        storedFacts = await repos.facts.list();
      }

      const factMap = Object.fromEntries(storedFacts.map((f) => [f.key, f]));

      const ctx: OutreachContext = {
        recipientName: req.recipientName,
        recipientEmail: req.recipientEmail,
        company: req.company,
        role: req.role,
        archetype: req.archetype as OutreachArchetype | undefined,
        customNote: req.customNote,
        matchedSkills: req.matchedSkills,
        facts: factMap,
        profile,
      };

      const customTemplate =
        req.customSubjectTemplate || req.customBodyTemplate
          ? {
              subject: req.customSubjectTemplate,
              body: req.customBodyTemplate,
            }
          : undefined;

      const generated: GeneratedOutreach = generateOutreach(ctx, customTemplate);
      const tags = buildDynamicTags(ctx);

      return {
        subject: generated.subject,
        bodyText: generated.bodyText,
        bodyHtml: generated.bodyHtml,
        webComposeUrl: generated.webComposeUrl,
        wordCount: generated.wordCount,
        charCount: generated.charCount,
        archetype: generated.archetype,
        candidateName: generated.candidateName,
        recipientName: generated.recipientName,
        company: generated.company,
        role: generated.role,
        tags,
      };
    },

    async send(req: SendOutreachEmailRequest): Promise<SendOutreachEmailResponse> {
      const mode = req.mode || 'smtp';

      let sendResult: GmailSendResult = { success: false };

      if (mode === 'smtp') {
        const user = req.smtpUser || process.env.GMAIL_USER || '';
        const pass = req.smtpPass || process.env.GMAIL_APP_PASS || '';

        sendResult = await sendGmailSmtp({
          user,
          pass,
          fromName: req.fromName || 'Aravindhan Sivaraman',
          to: req.to,
          subject: req.subject,
          text: req.bodyText,
          html: req.bodyHtml,
        });
      } else if (mode === 'api') {
        const token = req.apiToken || process.env.GMAIL_ACCESS_TOKEN || '';
        sendResult = await sendGmailApi({
          accessToken: token,
          to: req.to,
          subject: req.subject,
          text: req.bodyText,
          html: req.bodyHtml,
          threadId: req.threadId,
        });
      } else if (mode === 'draft') {
        const token = req.apiToken || process.env.GMAIL_ACCESS_TOKEN || '';
        const draft = await createGmailDraft({
          accessToken: token,
          to: req.to,
          subject: req.subject,
          body: req.bodyText,
          html: req.bodyHtml,
          threadId: req.threadId,
        });

        if (draft) {
          sendResult = {
            success: true,
            messageId: draft.id,
            threadId: draft.threadId,
          };
        } else {
          sendResult = {
            success: false,
            error: 'Failed to create Gmail draft. Ensure access token has https://www.googleapis.com/auth/gmail.compose scope.',
          };
        }
      }

      // Record audit event
      await repos.events.record({
        entityType: 'outreach',
        entityId: req.to,
        action: `email_${mode}`,
        actor: 'user',
        payload: {
          to: req.to,
          subject: req.subject,
          mode,
          success: sendResult.success,
          messageId: sendResult.messageId,
          error: sendResult.error,
        },
      });

      return {
        success: sendResult.success,
        mode,
        messageId: sendResult.messageId,
        threadId: sendResult.threadId,
        error: sendResult.error,
      };
    },
  };
}
