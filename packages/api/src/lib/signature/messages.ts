import { env } from '../../config/env';
import { t, type Language } from '../../i18n';

/**
 * Messages remis aux signataires (spec 044, SG-R14) : lien, code, relance. Les
 * textes passent par `t()` dans la langue de la demande. Aucun de ces textes
 * n'est journalisé (ils portent le lien ou le code).
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Lien de la page publique `/signer/:jeton`. */
export function signingUrl(token: string): string {
  const base = (env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/signer/${token}`;
}

function formatDate(date: Date, language: Language): string {
  const locale = language === 'ar' ? 'ar' : language === 'en' ? 'en-GB' : 'fr-FR';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

export type MessageChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';

/** Raccourcit un texte libre (titre, agence) à `max` caractères, avec « … » ; jamais appliqué au lien. */
function shorten(value: string, max: number): string {
  const chars = Array.from(value.replace(/\s+/g, ' ').trim());
  return chars.length <= max
    ? chars.join('')
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}

const SMS_TITLE_MAX = 40;
const SMS_AGENCY_MAX = 24;

/** SMS court, sans HTML : le titre et l'agence sont raccourcis AVANT insertion, le lien reste entier. */
function buildSmsInvite(input: InviteMessageInput): { subject: string; text: string } {
  const { language } = input;
  const vars = {
    agency: shorten(input.agencyName, SMS_AGENCY_MAX),
    title: shorten(input.title, SMS_TITLE_MAX),
    url: input.url,
    date: formatDate(input.expiresAt, language)
  };
  const text = input.reminder
    ? t(
        'Rappel {{agency}} : « {{title}} » attend votre signature : {{url}} (valable jusqu’au {{date}}). Lien personnel.',
        vars,
        language
      )
    : t('{{agency}} : signez « {{title}} » ici : {{url}} (valable jusqu’au {{date}}). Lien personnel.', vars, language);
  return { subject: '', text };
}

export type InviteMessageInput = {
  signerName: string;
  agencyName: string;
  title: string;
  url: string;
  expiresAt: Date;
  language: Language;
  /** Relance plutôt que première invitation. */
  reminder?: boolean;
  /** Canal de remise : SMS donne un texte court sans HTML ; e-mail par défaut. */
  channel?: MessageChannel;
};

export function buildInviteMessage(input: InviteMessageInput): { subject: string; text: string; html?: string } {
  if (input.channel === 'SMS') return buildSmsInvite(input);
  const { language } = input;
  const vars = {
    name: input.signerName,
    agency: input.agencyName,
    title: input.title,
    url: input.url,
    date: formatDate(input.expiresAt, language)
  };
  const subject = input.reminder
    ? t('Rappel : document à signer — {{title}}', vars, language)
    : t('Document à signer — {{title}}', vars, language);
  const text = input.reminder
    ? t(
        'Bonjour {{name}}, {{agency}} vous rappelle que le document « {{title}} » attend votre signature : {{url}} (lien personnel, valable jusqu’au {{date}}). Ne le transmettez à personne.',
        vars,
        language
      )
    : t(
        'Bonjour {{name}}, {{agency}} vous invite à signer électroniquement le document « {{title}} » : {{url}} (lien personnel, valable jusqu’au {{date}}). Ne le transmettez à personne.',
        vars,
        language
      );
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const html =
    `<div dir="${dir}"><p>${escapeHtml(text.replace(vars.url, '').trim())}</p>` +
    `<p><a href="${escapeHtml(vars.url)}">${escapeHtml(t('Ouvrir le document', undefined, language))}</a></p></div>`;
  return { subject, text, html };
}

export function buildOtpMessage(input: {
  agencyName: string;
  title: string;
  code: string;
  ttlMinutes: number;
  language: Language;
  channel?: MessageChannel;
}): { subject: string; text: string; html?: string } {
  const { language } = input;
  if (input.channel === 'SMS') {
    const smsVars = { agency: shorten(input.agencyName, SMS_AGENCY_MAX), code: input.code, minutes: input.ttlMinutes };
    return {
      subject: '',
      text: t('Code {{agency}} : {{code}} (valable {{minutes}} min). Ne le communiquez à personne.', smsVars, language)
    };
  }
  const vars = { agency: input.agencyName, title: input.title, code: input.code, minutes: input.ttlMinutes };
  const subject = t('Votre code de signature', undefined, language);
  const text = t(
    'Code de signature {{agency}} : {{code}}. Il vaut pour « {{title}} » et expire dans {{minutes}} minutes. Ne le communiquez à personne.',
    vars,
    language
  );
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  return { subject, text, html: `<div dir="${dir}"><p>${escapeHtml(text)}</p></div>` };
}

/** Texte de consentement explicite (SG-R5), haché et conservé avec l'événement de signature. */
export function consentText(language: Language): string {
  return t('Je reconnais avoir lu le document et je consens à le signer électroniquement.', undefined, language);
}
