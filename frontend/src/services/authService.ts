import type { User } from '../types';
import { api } from './api';

export const authService = {
  async me(): Promise<User> {
    const { data } = await api.get<{ user: User }>('/auth/me');
    return data.user;
  },
  async config(): Promise<{ googleConfigured: boolean }> {
    const { data } = await api.get<{ googleConfigured: boolean }>('/auth/config');
    return data;
  },
  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },
  /** Full-page navigation: the OAuth flow is a sequence of redirects handled by the backend. */
  startGoogleLogin(): void {
    window.location.href = '/api/auth/google';
  },
};
