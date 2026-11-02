import { describe, expect, it } from 'vitest';
import { htmlToPlainText, previewOf, sanitizeEmailHtml } from '../../src/utils/html';

describe('sanitizeEmailHtml', () => {
  it('removes scripts, event handlers and javascript: links', () => {
    const out = sanitizeEmailHtml('<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:alert(1)">y</a></p>');
    expect(out).not.toMatch(/script|onclick|javascript:/i);
  });

  it('removes data: URLs from links but keeps them for inline images', () => {
    const out = sanitizeEmailHtml(
      '<a href="data:text/html,<b>x</b>">a</a><img src="data:image/png;base64,iVBORw0KGgo=" alt="i">',
    );
    expect(out).not.toMatch(/href="data:/i);
    expect(out).toMatch(/<img src="data:image\/png;base64,/);
  });

  it('keeps editor formatting (bold, lists, quotes, links, alignment)', () => {
    const html =
      '<p style="text-align:center"><b>B</b> <i>I</i> <u>U</u> <s>S</s></p><ul><li>one</li></ul><blockquote>q</blockquote><a href="https://example.com">l</a>';
    const out = sanitizeEmailHtml(html);
    for (const fragment of ['<b>B</b>', '<i>I</i>', '<u>U</u>', '<s>S</s>', '<li>one</li>', '<blockquote>q</blockquote>', 'href="https://example.com"', 'text-align:center']) {
      expect(out).toContain(fragment);
    }
  });
});

describe('plain text + preview', () => {
  it('converts HTML to text and truncates previews', () => {
    expect(htmlToPlainText('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(previewOf('a'.repeat(200), 10)).toBe(`${'a'.repeat(9)}…`);
  });
});
