import type { OutboundMessage } from '../types';

/**
 * Bornes des messages WhatsApp Cloud (lot 041, spec W1-R4).
 *
 * Appliquées AVANT l'envoi, par le transport, quel que soit l'appelant : un
 * libellé trop long est tronqué avec « … », jamais refusé par Meta. Les mêmes
 * bornes valent pour le transport `log`, pour que le simulateur montre ce que
 * le chef verrait.
 *
 * Fonctions pures : aucun accès réseau ni base, aucune journalisation.
 */

export const META_TEXT_BODY_MAX = 4096;
export const META_INTERACTIVE_BODY_MAX = 1024;
export const META_BUTTONS_MAX = 3;
export const META_BUTTON_TITLE_MAX = 20;
export const META_BUTTON_ID_MAX = 256;
export const META_LIST_ROWS_MAX = 10;
export const META_LIST_ROW_TITLE_MAX = 24;
export const META_LIST_ROW_DESCRIPTION_MAX = 72;
export const META_LIST_ROW_ID_MAX = 200;
export const META_LIST_BUTTON_TEXT_MAX = 20;

const ELLIPSIS = '…';

/**
 * Tronque à `max` caractères (points de code, comme Meta), le dernier étant
 * « … ». Une valeur vide devient « … » : Meta refuse un titre vide.
 */
export function truncateLabel(value: string, max: number): string {
  const chars = Array.from(typeof value === 'string' ? value.trim() : '');
  if (chars.length === 0) return ELLIPSIS;
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, Math.max(0, max - 1)).join('') + ELLIPSIS;
}

/** Identifiant de réponse : jamais tronqué avec « … » (le moteur le relit), seulement coupé. */
function boundId(value: string, max: number): string {
  return Array.from(String(value)).slice(0, max).join('');
}

function boundBody(text: string, max: number): string {
  const chars = Array.from(typeof text === 'string' ? text : '');
  if (chars.length === 0) return ELLIPSIS;
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, max - 1).join('') + ELLIPSIS;
}

/**
 * Message sortant ramené dans les bornes de Meta. Un message à boutons sans
 * bouton, ou une liste sans ligne, devient un simple texte (Meta le
 * refuserait).
 */
export function boundOutboundMessage(message: OutboundMessage): OutboundMessage {
  if (message.kind === 'BUTTONS') {
    const buttons = message.buttons.slice(0, META_BUTTONS_MAX).map(button => ({
      id: boundId(button.id, META_BUTTON_ID_MAX),
      title: truncateLabel(button.title, META_BUTTON_TITLE_MAX)
    }));
    if (buttons.length === 0) return { kind: 'TEXT', text: boundBody(message.text, META_TEXT_BODY_MAX) };
    return { kind: 'BUTTONS', text: boundBody(message.text, META_INTERACTIVE_BODY_MAX), buttons };
  }
  if (message.kind === 'LIST') {
    const rows = message.rows.slice(0, META_LIST_ROWS_MAX).map(row => {
      const bounded: { id: string; title: string; description?: string } = {
        id: boundId(row.id, META_LIST_ROW_ID_MAX),
        title: truncateLabel(row.title, META_LIST_ROW_TITLE_MAX)
      };
      if (typeof row.description === 'string' && row.description.trim().length > 0) {
        bounded.description = truncateLabel(row.description, META_LIST_ROW_DESCRIPTION_MAX);
      }
      return bounded;
    });
    if (rows.length === 0) return { kind: 'TEXT', text: boundBody(message.text, META_TEXT_BODY_MAX) };
    return {
      kind: 'LIST',
      text: boundBody(message.text, META_INTERACTIVE_BODY_MAX),
      buttonText: truncateLabel(message.buttonText, META_LIST_BUTTON_TEXT_MAX),
      rows
    };
  }
  return { kind: 'TEXT', text: boundBody(message.text, META_TEXT_BODY_MAX) };
}

/** Numéro E.164 vers le champ `to` de Meta (chiffres, sans « + »). */
export function toMetaRecipient(toE164: string): string {
  return toE164.startsWith('+') ? toE164.slice(1) : toE164;
}

/**
 * Corps de `POST /{phone-number-id}/messages` pour un message DÉJÀ borné
 * (`boundOutboundMessage`). Aucun aperçu de lien, aucun modèle Meta (W1-R6).
 */
export function toMetaMessageBody(toE164: string, bounded: OutboundMessage): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: toMetaRecipient(toE164) };
  if (bounded.kind === 'BUTTONS') {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bounded.text },
        action: {
          buttons: bounded.buttons.map(button => ({ type: 'reply', reply: { id: button.id, title: button.title } }))
        }
      }
    };
  }
  if (bounded.kind === 'LIST') {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bounded.text },
        action: {
          button: bounded.buttonText,
          // Une seule section : son titre est facultatif chez Meta.
          sections: [{ rows: bounded.rows.map(row => ({ ...row })) }]
        }
      }
    };
  }
  return { ...base, type: 'text', text: { preview_url: false, body: bounded.text } };
}
