/**
 * D'où sort l'argent d'un décaissement de chantier (règlement de salaire, de
 * tâcheron, paiement de bail de terrain) — BUG-2026-09-29-032. Miroir du corps
 * facultatif des routes `.../validate` (`lib/treasury/outflow.ts` côté API).
 */
export type OutflowMethod = 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'CARD' | 'MOBILE_MONEY';

export interface OutflowPayerChoice {
  method: OutflowMethod;
  /** Nul : le compte par défaut du mode (banque, caisse ou portefeuille). */
  treasuryAccountId: string | null;
}
