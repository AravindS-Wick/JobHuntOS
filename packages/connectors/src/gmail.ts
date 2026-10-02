import nodemailer from 'nodemailer';
import { safeFetchJson } from './http.js';
import { stripHtml } from './html.js';

export type EmailCategory =
  | 'interview_invite'
  | 'assessment_link'
  | 'application_ack'
  | 'rejection'
  | 'recruiter_outreach'
  | 'offer'
  | 'other';

export interface ParsedEmailMessage {
  id: string;
  threadId: string;
  sender: string;
  senderName?: string;
  recipient?: string;
  subject: string;
  snippet: string;
  bodyText: string;
  category: EmailCategory;
  companyMentioned?: string;
  jobTitleMentioned?: string;
  assessmentUrl?: string;
  interviewUrl?: string;
  receivedAt: Date;
  actionRequired: boolean;
  suggestedAction?: string;
}

export interface GmailFetchOptions {
  accessToken?: string;
  query?: string;
  maxResults?: number;
}

export interface GmailDraftOptions {
  accessToken?: string;
  to: string;
  subject: string;
  body: string;
  html?: string;
  inReplyTo?: string;
  threadId?: string;
}

export interface GmailSmtpSendOptions {
  user: string;
  pass: string;
  fromName?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
}

export interface GmailApiSendOptions {
  accessToken: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
  threadId?: string;
}

export interface GmailSendResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
}

/**
 * Intelligent classifier for recruiting & hiring emails.
 */
export function classifyEmail(
  subject: string,
  snippet: string,
  bodyText: string,
  sender: string,
): {
  category: EmailCategory;
  companyMentioned?: string;
  jobTitleMentioned?: string;
  assessmentUrl?: string;
  interviewUrl?: string;
  actionRequired: boolean;
  suggestedAction?: string;
} {
  const text = `${subject} ${snippet} ${bodyText}`.toLowerCase();
  const senderLower = sender.toLowerCase();

  // Extract URLs
  const assessmentMatch = /https?:\/\/[^\s"'<>]*(?:hackerrank|codility|coderpad|codesignal|karat|testgorilla|glider|mettl|assessment|test)[^\s"'<>]+/i.exec(bodyText);
  const interviewMatch = /https?:\/\/[^\s"'<>]*(?:meet\.google\.com|zoom\.us|calendly\.com|teams\.microsoft\.com|cal\.com)[^\s"'<>]+/i.exec(bodyText);

  const assessmentUrl = assessmentMatch ? assessmentMatch[0] : undefined;
  const interviewUrl = interviewMatch ? interviewMatch[0] : undefined;

  // Extract Company Name Heuristics
  let companyMentioned: string | undefined;
  const atMatch = /(?:at|with|for|from|join)\s+([A-Z][a-zA-Z0-9&]{2,20}(?:\s+[A-Z][a-zA-Z0-9&]{2,20})?)/.exec(`${subject} ${bodyText}`);
  if (atMatch && atMatch[1]) {
    const candidate = atMatch[1].trim();
    if (!['Google', 'Zoom', 'Calendar', 'Teams', 'Your', 'Our', 'The', 'Interview', 'Position', 'Application'].includes(candidate)) {
      companyMentioned = candidate;
    }
  }

  // Extract Job Title Heuristics
  let jobTitleMentioned: string | undefined;
  const titleMatch = /(?:role of|position of|as an?|for the)\s+([A-Z][a-zA-Z0-9\s]{3,35}(?:Engineer|Developer|Architect|Lead|Manager|Specialist))/i.exec(`${subject} ${bodyText}`);
  if (titleMatch && titleMatch[1]) {
    jobTitleMentioned = titleMatch[1].trim();
  }

  // 1. Offer
  if (
    text.includes('offer letter') ||
    text.includes('formal offer') ||
    (text.includes('congratulations') && text.includes('pleased to offer'))
  ) {
    return {
      category: 'offer',
      companyMentioned,
      jobTitleMentioned,
      interviewUrl,
      actionRequired: true,
      suggestedAction: 'Review offer details and compensation package',
    };
  }

  // 2. Assessment Link
  if (
    assessmentUrl ||
    text.includes('coding challenge') ||
    text.includes('online assessment') ||
    text.includes('take-home test') ||
    text.includes('hackerrank test') ||
    text.includes('technical assessment')
  ) {
    return {
      category: 'assessment_link',
      companyMentioned,
      jobTitleMentioned,
      assessmentUrl,
      actionRequired: true,
      suggestedAction: 'Complete coding challenge before deadline',
    };
  }

  // 3. Interview Invite
  if (
    interviewUrl ||
    text.includes('interview invitation') ||
    text.includes('schedule a call') ||
    text.includes('invite you to interview') ||
    text.includes('discussion with our engineering') ||
    text.includes('technical interview') ||
    text.includes('round 1 interview') ||
    (text.includes('availability') && (text.includes('chat') || text.includes('interview') || text.includes('call')))
  ) {
    return {
      category: 'interview_invite',
      companyMentioned,
      jobTitleMentioned,
      interviewUrl,
      actionRequired: true,
      suggestedAction: 'Select or confirm available interview time slot',
    };
  }

  // 4. Rejection
  if (
    text.includes('unfortunately') ||
    text.includes('not moving forward') ||
    text.includes('other candidates') ||
    text.includes('decided to pursue other') ||
    text.includes('pursue other candidates') ||
    text.includes('will not be moving forward') ||
    text.includes('after careful consideration') ||
    (text.includes('thank you for your interest') && text.includes('at this time'))
  ) {
    return {
      category: 'rejection',
      companyMentioned,
      jobTitleMentioned,
      actionRequired: false,
      suggestedAction: 'Archive application and update tracker status',
    };
  }

  // 5. Application Ack
  if (
    text.includes('application received') ||
    text.includes('thank you for applying') ||
    text.includes('we received your application') ||
    text.includes('application submitted') ||
    text.includes('thanks for your interest') ||
    senderLower.includes('greenhouse') ||
    senderLower.includes('lever.co') ||
    senderLower.includes('ashbyhq')
  ) {
    return {
      category: 'application_ack',
      companyMentioned,
      jobTitleMentioned,
      actionRequired: false,
      suggestedAction: 'Application confirmed in ATS',
    };
  }

  // 6. Recruiter Outreach
  if (
    text.includes('came across your profile') ||
    text.includes('found your profile on linkedin') ||
    text.includes('exciting opportunity') ||
    text.includes('reaching out regarding') ||
    text.includes('talent acquisition team') ||
    text.includes('are you open to new opportunities')
  ) {
    return {
      category: 'recruiter_outreach',
      companyMentioned,
      jobTitleMentioned,
      actionRequired: true,
      suggestedAction: 'Draft and review personalized reply to recruiter',
    };
  }

  return {
    category: 'other',
    companyMentioned,
    jobTitleMentioned,
    actionRequired: false,
  };
}

/**
 * Parse raw Gmail API message resource into ParsedEmailMessage.
 */
export function parseGmailApiMessage(msg: any): ParsedEmailMessage {
  const id = msg.id || 'msg_unknown';
  const threadId = msg.threadId || id;
  const snippet = msg.snippet || '';

  const headers: Record<string, string> = {};
  if (Array.isArray(msg.payload?.headers)) {
    for (const h of msg.payload.headers) {
      if (h.name && h.value) headers[h.name.toLowerCase()] = h.value;
    }
  }

  const subject = headers.subject || '(No Subject)';
  const fromHeader = headers.from || 'unknown@example.com';
  const toHeader = headers.to || '';
  const dateHeader = headers.date;
  const receivedAt = dateHeader ? new Date(dateHeader) : new Date();

  // Extract Sender Name and Email
  let sender = fromHeader;
  let senderName: string | undefined;
  const fromMatch = /(.*?)\s*<(.+?)>/.exec(fromHeader);
  if (fromMatch && fromMatch[1] && fromMatch[2]) {
    senderName = fromMatch[1].replace(/["']/g, '').trim();
    sender = fromMatch[2].trim();
  }

  // Extract Body Text
  let bodyText = snippet;
  if (msg.payload?.parts && Array.isArray(msg.payload.parts)) {
    const textPart = msg.payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (textPart?.body?.data) {
      bodyText = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
    }
  } else if (msg.payload?.body?.data) {
    bodyText = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
  }

  bodyText = stripHtml(bodyText);

  const classification = classifyEmail(subject, snippet, bodyText, sender);

  return {
    id,
    threadId,
    sender,
    senderName,
    recipient: toHeader,
    subject,
    snippet,
    bodyText,
    category: classification.category,
    companyMentioned: classification.companyMentioned,
    jobTitleMentioned: classification.jobTitleMentioned,
    assessmentUrl: classification.assessmentUrl,
    interviewUrl: classification.interviewUrl,
    receivedAt,
    actionRequired: classification.actionRequired,
    suggestedAction: classification.suggestedAction,
  };
}

/**
 * Fetch messages from Gmail REST API with given query.
 */
export async function fetchGmailMessages(opts: GmailFetchOptions): Promise<ParsedEmailMessage[]> {
  const { accessToken, query = 'subject:(interview OR application OR offer OR assessment OR opportunity OR "thank you for applying" OR greenhouse OR lever OR ashby)', maxResults = 25 } = opts;

  if (!accessToken) {
    return [];
  }

  try {
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    const listRes = await safeFetchJson<{ messages?: { id: string; threadId: string }[] }>(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listRes.messages || !Array.isArray(listRes.messages)) {
      return [];
    }

    const messages: ParsedEmailMessage[] = [];
    for (const item of listRes.messages.slice(0, maxResults)) {
      try {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`;
        const rawMsg = await safeFetchJson<any>(msgUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        messages.push(parseGmailApiMessage(rawMsg));
      } catch (e) {
        console.warn(`Failed to fetch individual Gmail message ${item.id}:`, e);
      }
    }

    return messages;
  } catch (err) {
    console.warn('Gmail API list error:', err);
    return [];
  }
}

/**
 * Create a draft message in Gmail using the Gmail API.
 */
export async function createGmailDraft(opts: GmailDraftOptions): Promise<{ id: string; threadId: string } | null> {
  const { accessToken, to, subject, body, html, threadId } = opts;
  if (!accessToken) return null;

  const boundary = `__jobhunt_${Date.now()}__`;
  let rawMessage = '';

  if (html) {
    rawMessage = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      html,
      '',
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    rawMessage = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body,
    ].join('\r\n');
  }

  const raw = Buffer.from(rawMessage).toString('base64url');

  try {
    const res = await safeFetchJson<any>('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          raw,
          threadId,
        },
      }),
    });

    return { id: res.id, threadId: res.message?.threadId || threadId || res.id };
  } catch (err) {
    console.warn('Create Gmail draft error:', err);
    return null;
  }
}

/**
 * Send an email using Gmail SMTP with Google App Password.
 * Standard approach used by PaulleDemon/Email-automation and n8n workflows.
 */
export async function sendGmailSmtp(opts: GmailSmtpSendOptions): Promise<GmailSendResult> {
  const { user, pass, fromName, to, cc, bcc, subject, text, html } = opts;

  if (!user || !pass) {
    return {
      success: false,
      error: 'Gmail SMTP credentials missing. Please provide user (email) and app password.',
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // SSL
      auth: {
        user,
        pass,
      },
    });

    const fromAddress = fromName ? `"${fromName}" <${user}>` : user;

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      cc,
      bcc,
      subject,
      text,
      html: html || undefined,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('Gmail SMTP send failed:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Send an email directly via Gmail REST API (OAuth access token).
 */
export async function sendGmailApi(opts: GmailApiSendOptions): Promise<GmailSendResult> {
  const { accessToken, to, cc, bcc, subject, text, html, threadId } = opts;

  if (!accessToken) {
    return {
      success: false,
      error: 'Gmail API Access Token required for direct API send.',
    };
  }

  const boundary = `__jobhunt_${Date.now()}__`;
  const headers = [
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    ...(bcc ? [`Bcc: ${bcc}`] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
  ];

  let rawMessage = '';
  if (html) {
    rawMessage = [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      text,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      html,
      '',
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    rawMessage = [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      text,
    ].join('\r\n');
  }

  const raw = Buffer.from(rawMessage).toString('base64url');

  try {
    const res = await safeFetchJson<any>('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw,
        threadId,
      }),
    });

    return {
      success: true,
      messageId: res.id,
      threadId: res.threadId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('Gmail API send failed:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

