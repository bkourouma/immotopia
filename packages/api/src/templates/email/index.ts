/**
 * Default email HTML templates for the communication module.
 * Variables use {{variableName}} and are replaced by NotificationEngine.
 * @see docs/communication/TEMPLATE_VARIABLES.md
 */
import * as fs from 'fs';
import * as path from 'path';

const TEMPLATES_DIR = __dirname;

export const DEFAULT_EMAIL_TEMPLATES = [
  'lease-payment-reminder',
  'payment-confirmed',
  'ticket-created',
  'appointment-reminder',
  'lease-ending-soon'
] as const;

export type DefaultEmailTemplateId = (typeof DEFAULT_EMAIL_TEMPLATES)[number];

/**
 * Load HTML content of a default template by id.
 * Returns undefined if file does not exist.
 */
export function loadEmailTemplateHtml(id: DefaultEmailTemplateId): string | undefined {
  const filePath = path.join(TEMPLATES_DIR, `${id}.html`);
  if (!fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Get all default template IDs and their HTML (for seeding or admin).
 */
export function loadAllEmailTemplates(): Record<DefaultEmailTemplateId, string> {
  const out: Record<string, string> = {};
  for (const id of DEFAULT_EMAIL_TEMPLATES) {
    const html = loadEmailTemplateHtml(id);
    if (html) out[id] = html;
  }
  return out as Record<DefaultEmailTemplateId, string>;
}
