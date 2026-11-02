import { describe, expect, it } from 'vitest';
import { extractRecipientsFromText, isValidEmail, summarizeRecipients } from '../../src/utils/recipients';

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last+tag@sub.domain.io', 'x_y@example.com'])('accepts %s', (e) => {
    expect(isValidEmail(e)).toBe(true);
  });
  it.each(['plain', 'a@b', '@b.com', 'a@.com', 'a b@c.com', 'a@b.c'])('rejects %s', (e) => {
    expect(isValidEmail(e)).toBe(false);
  });
});

describe('summarizeRecipients', () => {
  it('normalizes, de-duplicates case-insensitively and keeps first-seen order', () => {
    const r = summarizeRecipients(['B@x.com', 'a@x.com', ' b@X.com ', 'bad@', 'a@x.com']);
    expect(r.valid).toEqual(['b@x.com', 'a@x.com']);
    expect(r.invalid).toEqual(['bad@']);
    expect(r.duplicates).toBe(2);
    expect(r.total).toBe(5);
  });
});

describe('extractRecipientsFromText', () => {
  it('parses CSV with headers and extra columns', () => {
    const csv = 'name,email\nJohn,"john@example.com"\nJane,jane@example.com\nBob,bob@invalid\nJohn,JOHN@example.com\n';
    const r = extractRecipientsFromText(csv);
    expect(r.valid).toEqual(['john@example.com', 'jane@example.com']);
    expect(r.invalid).toEqual(['bob@invalid']);
    expect(r.duplicates).toBe(1);
    expect(r.total).toBe(4);
  });

  it('parses newline / semicolon separated text and <angle> addresses', () => {
    const r = extractRecipientsFromText('a@x.com; <b@x.com>\r\nmailto:c@x.com\n\n');
    expect(r.valid).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });
});
