/**
 * Notifications du paiement déclaré (spec 047, §3.4).
 *
 * SANS EFFET pour l'instant : journal seulement. Le lot L5 écrira le corps
 * (canaux de `planChannels`, clés `SYNDIC_PAYMENT_DECLARATION_*`) SANS changer
 * les signatures ci-dessous. Ces fonctions ne lèvent jamais : une notification
 * ne doit pas faire échouer une validation ou un rejet. Le journal ne porte
 * que des identifiants.
 */

import { logger } from '../../../utils/logger';
import type { IssuedChargeDocument } from '../charge-receipts';

function logSafely(event: string, meta: Record<string, unknown>): void {
  try {
    logger.info(`[declared-payment] notification ${event} (sans effet)`, meta);
  } catch {
    // Le journal ne doit jamais faire échouer l'appelant.
  }
}

/** Déclaration reçue : accusé au copropriétaire (et alerte aux gestionnaires). */
export function notifyDeclarationReceived(tenantId: string, declarationId: string): void {
  logSafely('SYNDIC_PAYMENT_DECLARATION_RECEIVED', { tenantId, declarationId });
}

/** Déclaration validée : quittances jointes au message du copropriétaire. */
export function notifyDeclarationApproved(
  tenantId: string,
  declarationId: string,
  documents: IssuedChargeDocument[]
): void {
  logSafely('SYNDIC_PAYMENT_DECLARATION_APPROVED', {
    tenantId,
    declarationId,
    documentIds: Array.isArray(documents) ? documents.map(document => document?.id) : []
  });
}

/** Déclaration rejetée : motif et note au copropriétaire. */
export function notifyDeclarationRejected(tenantId: string, declarationId: string): void {
  logSafely('SYNDIC_PAYMENT_DECLARATION_REJECTED', { tenantId, declarationId });
}
