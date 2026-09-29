/**
 * Libellés, descriptions et gabarits par défaut des notifications e-mail et
 * WhatsApp : ils s'affichent dans l'écran de personnalisation et partent chez
 * les locataires et propriétaires. BUG-2026-09-29-011 : plusieurs étaient écrits
 * sans accents (« Releve de gerance envoye », « Alerte fin de pret »…).
 */
import { EMAIL_NOTIFICATION_META } from '../../src/constants/email-notification-keys';
import { WHATSAPP_NOTIFICATION_META } from '../../src/constants/whatsapp-notification-keys';
import { EMAIL_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/email-notification-default-templates';
import { WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES } from '../../src/constants/whatsapp-notification-default-templates';

// Mots français courants dont la forme sans accent est une faute dans ces textes.
const UNACCENTED = [
  'releve',
  'gerance',
  'envoye',
  'envoyee',
  'proprietaire',
  'proprietes',
  'propriete',
  'planifie',
  'planifies',
  'pret',
  'echeance',
  'copropriete',
  'assemblee',
  'generale',
  'proces',
  'declare',
  'declaration',
  'equipement',
  'convoque',
  'etes',
  'ete',
  'cree',
  'definissez',
  'regulariser',
  'prevue',
  'prevu',
  'etape',
  'reglee',
  'bientot',
  'depot',
  'bien publie',
  'numero',
  'recu'
];
const PATTERN = new RegExp(`(?<!\\p{L})(${UNACCENTED.join('|')})(?!\\p{L})`, 'iu');

function visibleTextIssues(entries: Array<[string, string]>): string[] {
  const issues: string[] = [];
  for (const [where, text] of entries) {
    const visible = text.replace(/\{\{\w+\}\}/g, '');
    const match = PATTERN.exec(visible);
    if (match)
      issues.push(
        `${where} : « ${match[1]} » dans « ${visible.slice(Math.max(0, match.index - 25), match.index + 25)} »`
      );
  }
  return issues;
}

describe('accents des notifications', () => {
  it('libellés, descriptions et destinataires e-mail', () => {
    const entries = Object.entries(EMAIL_NOTIFICATION_META).flatMap(([key, m]): Array<[string, string]> => [
      [`${key}.label`, m.label],
      [`${key}.description`, m.description],
      [`${key}.recipientLabel`, m.recipientLabel]
    ]);
    expect(visibleTextIssues(entries)).toEqual([]);
  });

  it('libellés, descriptions et destinataires WhatsApp', () => {
    const entries = Object.entries(WHATSAPP_NOTIFICATION_META).flatMap(([key, m]): Array<[string, string]> => [
      [`${key}.label`, m.label],
      [`${key}.description`, m.description],
      [`${key}.recipientLabel`, m.recipientLabel]
    ]);
    expect(visibleTextIssues(entries)).toEqual([]);
  });

  it('gabarits e-mail par défaut (sujet et corps)', () => {
    const entries = Object.entries(EMAIL_NOTIFICATION_DEFAULT_TEMPLATES).flatMap(
      ([key, tpl]): Array<[string, string]> => [
        [`${key}.subject`, tpl.subject],
        [`${key}.bodyHtml`, tpl.bodyHtml.replace(/<[^>]+>/g, ' ')]
      ]
    );
    expect(visibleTextIssues(entries)).toEqual([]);
  });

  it('messages WhatsApp par défaut', () => {
    const entries = Object.entries(WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES).map(([key, text]): [string, string] => [
      key,
      text
    ]);
    expect(visibleTextIssues(entries)).toEqual([]);
  });
});
