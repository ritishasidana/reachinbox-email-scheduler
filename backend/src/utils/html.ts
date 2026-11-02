import sanitizeHtml from 'sanitize-html';
import { convert } from 'html-to-text';

/** Allow-list sanitizer for user-authored email bodies (rendered later in the dashboard). */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img', 'span', 'u', 's', 'strike', 'del', 'font', 'h1', 'h2', 'h3',
    ],
    allowedAttributes: {
      '*': ['style', 'align'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      font: ['size', 'face', 'color'],
    },
    // `data:` only for inline images — never for links (data:text/html is an XSS vector).
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  });
}

export function htmlToPlainText(html: string): string {
  return convert(html, { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }] }).trim();
}

export function previewOf(text: string, max = 140): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}
