export type EmailStatus = 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type EmailView = 'scheduled' | 'sent';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface Sender {
  id: string;
  name: string;
  email: string;
  smtpHost: string;
  hourlyLimit: number;
  minDelayMs: number;
  isActive: boolean;
  createdAt: string;
  usedThisHour?: number | null;
}

export interface EmailListItem {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  preview: string;
  status: EmailStatus;
  scheduledAt: string;
  deferredUntil: string | null;
  sentAt: string | null;
  failedAt: string | null;
  lastError: string | null;
  isStarred: boolean;
  sender: { id: string; name: string; email: string };
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface EmailDetail extends EmailListItem {
  bodyHtml: string;
  bodyText: string;
  messageId: string;
  attempts: number;
  previewUrl: string | null;
  smtpResponse: string | null;
  createdAt: string;
  attachments: Attachment[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchResult {
  items: EmailListItem[];
  total: number;
  source: 'elasticsearch' | 'database';
}

export interface EmailCounts {
  scheduled: number;
  sent: number;
  sentOk: number;
  failed: number;
  cancelled: number;
}

export interface RecipientParseResult {
  filename: string;
  total: number;
  validCount: number;
  invalidCount: number;
  duplicates: number;
  valid: string[];
  invalid: string[];
}

export interface ScheduleRequest {
  senderId: string;
  recipients: string[];
  subject: string;
  bodyHtml: string;
  startAt: string;
  delayMs?: number | null;
  hourlyLimit?: number | null;
  attachmentIds: string[];
}

export interface ScheduleResponse {
  campaignId: string;
  duplicate: boolean;
  scheduled: number;
  invalid: string[];
  duplicatesRemoved: number;
  startAt: string;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  channelName: string | null;
  connectedAt: string | null;
}
