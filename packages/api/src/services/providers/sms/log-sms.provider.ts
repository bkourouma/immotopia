import { randomUUID } from 'crypto';
import { logger } from '../../../utils/logger';
import type { SmsBalance, SmsProvider, SmsSendOptions, SmsSendResult, SmsTestConnectionResult } from './types';

/**
 * Fournisseur SMS de journalisation — n'envoie rien.
 *
 * Utilisé en dev et dans les tests (`SMS_PROVIDER` par défaut) : journalise
 * l'envoi et renvoie un identifiant factice, sans jamais contacter Orange ni
 * aucun réseau.
 */
export class LogSmsProvider implements SmsProvider {
  readonly kind = 'log' as const;

  async sendText(options: SmsSendOptions): Promise<SmsSendResult> {
    const providerMessageId = `log-${randomUUID()}`;
    logger.info('SMS (log provider) — envoi simulé', {
      to: options.to,
      senderName: options.senderName,
      bodyLength: options.body.length,
      providerMessageId
    });
    return { providerMessageId };
  }

  async getBalance(): Promise<SmsBalance | null> {
    return null;
  }

  async testConnection(): Promise<SmsTestConnectionResult> {
    return { ok: true, message: 'Fournisseur de journalisation : toujours disponible.' };
  }
}
