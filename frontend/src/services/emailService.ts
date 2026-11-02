import type {
  EmailCounts,
  EmailDetail,
  EmailListItem,
  Paginated,
  RecipientParseResult,
  ScheduleRequest,
  ScheduleResponse,
  SearchResult,
} from '../types';
import { api } from './api';

export type ListEndpoint = 'scheduled' | 'sent' | 'failed';

export interface ListParams {
  page?: number;
  pageSize?: number;
  starred?: boolean;
  senderId?: string;
}

export const emailService = {
  async list(endpoint: ListEndpoint, params: ListParams = {}): Promise<Paginated<EmailListItem>> {
    const { data } = await api.get<Paginated<EmailListItem>>(`/emails/${endpoint}`, {
      params: { ...params, starred: params.starred ? 'true' : undefined },
    });
    return data;
  },
  async search(q: string, view: 'scheduled' | 'sent' | 'all'): Promise<SearchResult> {
    const { data } = await api.get<SearchResult>('/emails/search', { params: { q, view } });
    return data;
  },
  async counts(): Promise<EmailCounts> {
    const { data } = await api.get<EmailCounts>('/emails/counts');
    return data;
  },
  async get(id: string): Promise<EmailDetail> {
    const { data } = await api.get<EmailDetail>(`/emails/${id}`);
    return data;
  },
  async star(id: string, isStarred: boolean): Promise<void> {
    await api.patch(`/emails/${id}/star`, { isStarred });
  },
  async cancel(id: string): Promise<void> {
    await api.post(`/emails/${id}/cancel`);
  },
  /**
   * The Idempotency-Key is generated once per compose session, so double clicks / network retries
   * of the same submission never create duplicate campaigns.
   */
  async schedule(body: ScheduleRequest, idempotencyKey: string): Promise<ScheduleResponse> {
    const { data } = await api.post<ScheduleResponse>('/emails/schedule', body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return data;
  },
  async parseRecipientFile(file: File): Promise<RecipientParseResult> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post<RecipientParseResult>('/recipients/parse', form);
    return data;
  },
};
