/**
 * Montee de palier de l'espace particulier (lot 4, sous-lot 4D) : constantes
 * et marqueur de facture, sans dependance vers les services de facturation
 * (evite tout import circulaire avec platform-invoice-service et
 * platform-payment-service).
 *
 * Contrat : specs/026-particuliers-libre-service/plan.md (section
 * « Contrats API des sous-lots 4B et 4D »).
 */

import { PACK } from '../../lib/subscription/catalog';

/** Liste blanche FERMEE des cibles : jamais un code de pack recu tel quel du client. */
export const UPGRADE_TARGETS = [PACK.PARTICULIER_PLUS] as const;
export type UpgradeTarget = (typeof UPGRADE_TARGETS)[number];

/** Pack de depart unique de la montee de palier. */
export const UPGRADE_SOURCE_PACK = PACK.PARTICULIER_GRATUIT;

/** Cles d'audit (l'entree d'audit accepte toute chaine ; aucun telephone ni montant nominatif dans le payload). */
export const UPGRADE_AUDIT = {
  STARTED: 'SUBSCRIPTION_UPGRADE_STARTED',
  APPLIED: 'SUBSCRIPTION_UPGRADE_APPLIED',
  NOT_APPLIED: 'SUBSCRIPTION_UPGRADE_NOT_APPLIED'
} as const;

/** Codes d'erreur du contrat. */
export const UPGRADE_ERROR = {
  ALREADY_ON_TARGET: 'ALREADY_ON_TARGET',
  PAYMENT_IN_PROGRESS: 'PAYMENT_IN_PROGRESS',
  PHONE_REQUIRED: 'PHONE_REQUIRED',
  PAYMENTS_UNAVAILABLE: 'PAYMENTS_UNAVAILABLE'
} as const;

/**
 * Marqueur porte par la ligne PACK de la facture d'upgrade (`InvoiceLine.metadata`,
 * JSON existant : la facture n'a pas de champ de metadonnees, aucune colonne
 * n'est ajoutee).
 */
export const UPGRADE_LINE_SOURCE = 'SUBSCRIPTION_UPGRADE';

export function isUpgradeTarget(value: unknown): value is UpgradeTarget {
  return typeof value === 'string' && (UPGRADE_TARGETS as readonly string[]).includes(value);
}

export function buildUpgradeLineMetadata(target: UpgradeTarget): Record<string, unknown> {
  return { source: UPGRADE_LINE_SOURCE, upgradeFrom: UPGRADE_SOURCE_PACK, upgradeTo: target };
}

/** Cible d'upgrade lue dans la metadonnee d'une ligne ; `null` si la ligne n'est pas marquee ou porte une cible hors liste. */
export function readUpgradeTarget(metadata: unknown): UpgradeTarget | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  if (record.source !== UPGRADE_LINE_SOURCE) return null;
  return isUpgradeTarget(record.upgradeTo) ? record.upgradeTo : null;
}
