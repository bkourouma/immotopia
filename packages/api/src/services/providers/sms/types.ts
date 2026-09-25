/**
 * Interface fournisseur SMS — lot SMS-1.
 *
 * Fondations seulement (voir spec §10 / décision produit du lot) : un seul
 * compte Orange au nom d'ImmoTopia, pas d'identifiants par agence, pas de
 * file 5/s, pas de segments/coût, pas de webhook. `getSmsProvider()`
 * (`./index.ts`) choisit l'implémentation selon `env.SMS_PROVIDER`.
 */

export interface SmsSendOptions {
  to: string; // E.164, ex. +2250102030405
  body: string;
  senderName?: string;
}

export interface SmsSendResult {
  providerMessageId: string;
}

/** Un des packs/contrats Orange — format à confirmer avec un vrai compte. */
export interface SmsBalanceContract {
  country?: string;
  availableUnits: number;
  expiresAt: string | null;
  status?: string;
}

export interface SmsBalance {
  contracts: SmsBalanceContract[];
}

export interface SmsTestConnectionResult {
  ok: boolean;
  message: string;
}

export interface SmsProvider {
  readonly kind: 'orange' | 'log';
  sendText(options: SmsSendOptions): Promise<SmsSendResult>;
  /** `null` quand le fournisseur n'expose pas de solde (ex. 'log'). */
  getBalance(): Promise<SmsBalance | null>;
  testConnection(): Promise<SmsTestConnectionResult>;
}

/** Erreur levée par un `SmsProvider` quand le fournisseur ne peut pas être contacté ou répond en erreur. */
export class SmsProviderError extends Error {
  public readonly causeDetail?: unknown;

  constructor(message: string, causeDetail?: unknown) {
    super(message);
    this.name = 'SmsProviderError';
    this.causeDetail = causeDetail;
  }
}
