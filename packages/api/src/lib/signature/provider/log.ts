import { logger } from '../../../utils/logger';
import type { OutboundSignatureMessage, SignatureProvider } from '../types';

/**
 * Fournisseur `log` (développement, recette) : RIEN ne part. Seules des
 * métadonnées sont journalisées (agence, canal), JAMAIS le lien, le jeton, le
 * code ni le contact. Le contenu des messages est gardé en mémoire (tampon de
 * 50) pour les tests uniquement : `takeLoggedSignatureMessages`.
 */

const BUFFER_MAX = 50;
const buffer: OutboundSignatureMessage[] = [];

export function takeLoggedSignatureMessages(): OutboundSignatureMessage[] {
  return buffer.splice(0, buffer.length);
}

export function createLogProvider(): SignatureProvider {
  return {
    id: 'log',
    async createRequest(input) {
      logger.info('Signature (log) : demande créée', { tenantId: input.tenantId, signers: input.signerCount });
      return { providerRef: `log-${input.requestId}` };
    },
    async cancel() {
      // Rien à annuler.
    },
    async deliver(message) {
      buffer.push(message);
      if (buffer.length > BUFFER_MAX) buffer.shift();
      logger.info('Signature (log) : message non envoyé', { tenantId: message.tenantId, channel: message.channel });
      return { ok: true };
    }
  };
}
