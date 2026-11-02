import type { Sender } from '../types';
import { api } from './api';

export const senderService = {
  async list(): Promise<Sender[]> {
    const { data } = await api.get<{ items: Sender[] }>('/senders');
    return data.items;
  },
  /** Creates a new Ethereal account on the backend and registers it as a sender. */
  async createEthereal(name?: string): Promise<Sender> {
    const { data } = await api.post<Sender>('/senders', { name }, { timeout: 60_000 });
    return data;
  },
};
