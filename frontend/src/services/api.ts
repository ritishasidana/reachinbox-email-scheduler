import axios, { AxiosError } from 'axios';

/** Single axios instance. Requests go to /api (proxied by Vite in dev) with the session cookie. */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30_000,
});

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

/** Normalizes any thrown value into a human-readable message for the UI. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError<ApiErrorBody>;
    const body = e.response?.data?.error;
    if (body?.code === 'VALIDATION_ERROR' && Array.isArray(body.details) && body.details.length > 0) {
      const first = body.details[0] as { path?: string; message?: string };
      return `${first.path ? `${first.path}: ` : ''}${first.message ?? body.message}`;
    }
    if (body?.message) return body.message;
    if (e.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
    // No response at all, or a 5xx without our JSON error body (e.g. the dev proxy when the API is down).
    if (!e.response || (e.response.status >= 500 && !body)) return 'Cannot reach the server. Is the backend running?';
    return `${fallback} (HTTP ${e.response.status})`;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export const isUnauthorized = (err: unknown): boolean =>
  axios.isAxiosError(err) && err.response?.status === 401;
