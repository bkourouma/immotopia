/**
 * Un message dont les variables portent un lien, un jeton, un mot de passe ou
 * un code ne doit pas etre conserve en base pour etre rejoue : l'envoi est
 * journalise mais NON rejouable.
 *
 * Deux garde-fous complementaires :
 *  - LISTE BLANCHE sur le NOM : n'est conservee que la variable declaree dans le
 *    gabarit de la cle WhatsApp (`WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES`) ; une
 *    cle inconnue ou une variable hors gabarit rend l'envoi non rejouable ;
 *  - la VALEUR : une URL, ou un jeton long (>= 24 caracteres alphanumeriques,
 *    `-` ou `_`, sans espace) meme sous un nom anodin.
 */
import { WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES } from '../../constants/whatsapp-notification-default-templates';
import type { WhatsappNotificationKey } from '../../constants/whatsapp-notification-keys';

const URL_VALUE = /https?:\/\//i;
const LONG_TOKEN = /^[A-Za-z0-9_-]{24,}$/;

function looksSecret(value: unknown): boolean {
  const text = String(value ?? '');
  if (URL_VALUE.test(text)) return true;
  return text.split(/\s+/).some(word => LONG_TOKEN.test(word));
}

/** Variables declarees pour une cle WhatsApp (celles du gabarit par defaut) ; ensemble vide si la cle est inconnue. */
export function declaredVariables(notificationKey: string | undefined): Set<string> {
  const template = notificationKey
    ? WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES[notificationKey as WhatsappNotificationKey]
    : undefined;
  return new Set(template ? Array.from(template.matchAll(/\{\{(\w+)\}\}/g), match => match[1]) : []);
}

export function isReplayableVariables(
  variables: Record<string, string> | undefined,
  notificationKey: string | undefined
): boolean {
  if (!variables) return true;
  const declared = declaredVariables(notificationKey);
  return !Object.entries(variables).some(([name, value]) => !declared.has(name) || looksSecret(value));
}
