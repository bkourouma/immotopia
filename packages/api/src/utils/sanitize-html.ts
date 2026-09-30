import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const purify = DOMPurify(window as unknown as Parameters<typeof DOMPurify>[0]);

/**
 * Assainit un HTML saisi par un utilisateur (corps de newsletter, gabarit) :
 * liste blanche de balises, sans script, gestionnaire d'evenement ni URL
 * `javascript:` (SECURITY.md §7).
 */
export function sanitizeHtml(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      'a',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'div',
      'span',
      'table',
      'tr',
      'td',
      'th'
    ]
  });
}
