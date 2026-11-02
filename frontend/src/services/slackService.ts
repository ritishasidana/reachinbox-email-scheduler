import type { SlackStatus } from '../types';
import { api } from './api';

export const slackService = {
  async status(): Promise<SlackStatus> {
    const { data } = await api.get<SlackStatus>('/slack/status');
    return data;
  },
  /** Fetches the signed Slack authorize URL and navigates the browser to it. */
  async connect(): Promise<void> {
    const { data } = await api.get<{ url: string }>('/slack/install');
    window.location.href = data.url;
  },
  async disconnect(): Promise<void> {
    await api.delete('/slack');
  },
  async test(): Promise<void> {
    await api.post('/slack/test');
  },
};
