/**
 * Client-side mirror of the backend's recipient rules (backend/src/utils/recipients.ts) for instant
 * feedback while typing. The backend re-validates authoritatively on submit.
 */
const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i;

export const normalizeEmail = (value: string): string =>
  value.trim().replace(/^mailto:/i, '').replace(/^<|>$/g, '').toLowerCase();

export const isValidEmail = (value: string): boolean => value.length <= 254 && EMAIL_RE.test(value);

/** Splits pasted/typed text into candidate addresses. */
export const splitCandidates = (text: string): string[] =>
  text
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter(Boolean);
