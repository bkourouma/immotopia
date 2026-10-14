import { env } from '../../../config/env';
import { MediaFetchError, type WhatsappTransport } from '../types';
import { createLogTransport } from './log-transport';
import { createMetaTransport } from './meta-transport';

/**
 * Choix du transport de l'inventaire par WhatsApp (lot 041, spec W1-R1, W1-R2).
 *
 * `WHATSAPP_INVENTORY_TRANSPORT` : `meta` (API Graph), `log` (rien ne part,
 * journal et simulateur), `disabled` (défaut : tout est refusé). La
 * configuration est validée au démarrage par `src/config/env.ts`.
 */

const DISABLED_ERROR = "Transport WhatsApp de l'inventaire désactivé.";

function createDisabledTransport(): WhatsappTransport {
  return {
    id: 'disabled',
    async send() {
      return { metaMessageId: null, error: DISABLED_ERROR };
    },
    async markRead() {
      // Rien : aucun message n'est reçu.
    },
    async fetchMedia() {
      throw new MediaFetchError('NOT_FOUND', DISABLED_ERROR);
    }
  };
}

let cached: { id: WhatsappTransport['id']; transport: WhatsappTransport } | null = null;

/** Transport du serveur, selon `env.WHATSAPP_INVENTORY_TRANSPORT`. */
export function getWhatsappTransport(): WhatsappTransport {
  const id = env.WHATSAPP_INVENTORY_TRANSPORT;
  if (cached && cached.id === id) return cached.transport;
  const transport =
    id === 'meta' ? createMetaTransport() : id === 'log' ? createLogTransport() : createDisabledTransport();
  cached = { id, transport };
  return transport;
}

/** Oublie le transport mémorisé (tests qui changent `env`). */
export function resetWhatsappTransportForTests(): void {
  cached = null;
}
