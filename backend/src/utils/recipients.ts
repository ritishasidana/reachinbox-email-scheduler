/**
 * Recipient parsing/validation. Pure functions (no env, no I/O) so they are unit-testable.
 * The frontend applies the same rules for instant feedback; the backend re-validates authoritatively.
 */

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i;

export interface RecipientSummary {
  /** Unique, valid, normalized addresses in first-seen order. */
  valid: string[];
  /** Unique invalid candidates (tokens that looked like emails but failed validation). */
  invalid: string[];
  /** Number of duplicate valid addresses removed. */
  duplicates: number;
  /** Total candidate tokens detected (including duplicates and invalid). */
  total: number;
}

export const normalizeEmail = (value: string): string => value.trim().replace(/^mailto:/i, '').toLowerCase();

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

/**
 * Validates and de-duplicates an explicit list of addresses (e.g. the "To" chips).
 */
export function summarizeRecipients(candidates: string[]): RecipientSummary {
  const seen = new Set<string>();
  const invalidSeen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  let total = 0;

  for (const raw of candidates) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    total += 1;
    if (!isValidEmail(email)) {
      if (!invalidSeen.has(email)) {
        invalidSeen.add(email);
        invalid.push(raw.trim());
      }
      continue;
    }
    if (seen.has(email)) {
      duplicates += 1;
      continue;
    }
    seen.add(email);
    valid.push(email);
  }

  return { valid, invalid, duplicates, total };
}

/**
 * Extracts candidate addresses from CSV / TXT content. Any token containing "@" is a candidate;
 * other tokens (header rows such as "email", name columns, etc.) are ignored.
 */
export function extractRecipientsFromText(content: string): RecipientSummary {
  const tokens = content
    .split(/[\s,;|\t\r\n]+/)
    .map((t) => t.replace(/^["'<(]+|[>"')]+$/g, '').trim())
    .filter((t) => t.includes('@'));
  return summarizeRecipients(tokens);
}
