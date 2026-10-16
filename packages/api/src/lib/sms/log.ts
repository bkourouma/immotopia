import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import type { SmsTransport } from './types';

/**
 * Transport `log` (développement, tests) : RIEN ne part. Le journal ne reçoit
 * que des métadonnées (longueur, fournisseur), jamais le texte ni le numéro.
 * Le contenu est gardé en mémoire (tampon de 50) pour les tests uniquement.
 */

const BUFFER_MAX = 50;
const buffer: { to: string; text: string }[] = [];

export function takeLoggedSmsMessages(): { to: string; text: string }[] {
  return buffer.splice(0, buffer.length);
}

export function createLogSmsTransport(): SmsTransport {
  return {
    id: 'log',
    async send({ to, text }) {
      buffer.push({ to, text });
      if (buffer.length > BUFFER_MAX) buffer.shift();
      logger.info('SMS (log) : message non envoyé', { provider: 'log', length: text.length });
      return { ok: true, providerMessageId: `log-${randomUUID()}` };
    }
  };
}
