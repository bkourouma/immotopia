/**
 * Transport SMS minimal (signature électronique, lot S7). Sans schéma Prisma :
 * un transport envoie un texte à un numéro déjà normalisé (E.164, voir
 * `lib/phone/e164.ts`) et ne lève jamais.
 */
export type SmsProviderId = 'disabled' | 'log' | 'orange';

export type SmsSendResult =
  { ok: true; providerMessageId?: string } | { ok: false; reason: 'DISABLED' | 'SEND_FAILED' };

export interface SmsTransport {
  readonly id: SmsProviderId;
  /** `to` est déjà en E.164 (`+2250712345678`). */
  send(input: { to: string; text: string }): Promise<SmsSendResult>;
}
