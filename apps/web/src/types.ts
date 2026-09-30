export type NavTabId =
  | 'dashboard'
  | 'inbox'
  | 'feed'
  | 'companies'
  | 'integrations'
  | 'outreach'
  | 'synthesizer'
  | 'unified-inbox'
  | 'extension'
  | 'profile'
  | 'audit';

export type PlatformId =
  | 'linkedin'
  | 'naukri'
  | 'indeed'
  | 'gmail'
  | 'cutshort'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'gemini'
  | 'anthropic'
  | 'apify'
  | 'hunter';

export interface PlatformAuthInfo {
  id: PlatformId;
  name: string;
  category: 'social_portal' | 'job_board' | 'communication' | 'ats' | 'ai_service';
  icon: string;
  iconColor: string;
  status: 'connected' | 'disconnected' | 'syncing' | 'expired';
  authMethod: 'extension_bridge' | 'oauth2' | 'session_cookie' | 'api_key' | 'public_board';
  accountIdentifier?: string;
  lastSyncedAt?: string;
  dailyQuotaUsed?: number;
  dailyQuotaMax?: number;
  description: string;
  credentials?: {
    apiKey?: string;
    sessionCookie?: string;
    refreshToken?: string;
    webhookUrl?: string;
    clientId?: string;
    clientSecret?: string;
  };
}

export interface RecruiterContact {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  channels: ('linkedin' | 'gmail' | 'cutshort')[];
  status: string;
  stage: number;
  lastContacted?: string;
  notes?: string;
}

export interface InboundMessage {
  id: string;
  sender: string;
  senderEmail: string;
  company: string;
  channel: 'Gmail' | 'LinkedIn' | 'Cutshort';
  subject: string;
  preview: string;
  body: string;
  sentiment: 'Interview Request' | 'Technical Assessment' | 'Inquiry' | 'Rejection' | 'Application Ack' | 'Offer';
  receivedAt: string;
  replyDraft: string;
  read: boolean;
  actionRequired?: boolean;
  suggestedAction?: string;
  interviewUrl?: string;
  assessmentUrl?: string;
}

export interface OutreachPreset {
  id: string;
  name: string;
  channel: 'linkedin' | 'cutshort' | 'gmail';
  constraint: string;
  subjectTemplate?: string;
  bodyTemplate: string;
}

export interface ProxyHealthItem {
  portal: string;
  icon: string;
  color: string;
  integration: string;
  dailyCap: number;
  usedToday: number;
  delayModel: string;
  status: 'Optimal' | 'Active' | 'Paused' | 'Warning';
  flags: number;
}
