import type { ReturnScope } from '../returns/types';

/**
 * Périmètre d'une opération de prélèvement (spec 042, P4, data-model §9.1).
 *
 * Les services de `lib/direct-debit/` servent deux périmètres : les loyers
 * (`RENTAL_LEASE`, par défaut) et les appels de charges d'un syndicat
 * (`SYNDIC_LOT`). Chaque lecture et chaque écriture filtre par `scopeWhere` :
 * un identifiant du mauvais périmètre (ou d'un autre syndicat) se comporte
 * comme un objet inexistant, donc `NotFoundError`.
 */

export type DirectDebitScopeCtx = ReturnScope;

export const RENTAL_CTX: DirectDebitScopeCtx = { scope: 'RENTAL_LEASE' };

export const syndicCtx = (syndicateId: string): DirectDebitScopeCtx => ({ scope: 'SYNDIC_LOT', syndicateId });

/** Filtre Prisma commun aux créanciers, mandats, remises, lignes et retours (tous portent `scope` et `syndicateId`). */
export function scopeWhere(
  ctx: DirectDebitScopeCtx
): { scope: 'RENTAL_LEASE' } | { scope: 'SYNDIC_LOT'; syndicateId: string } {
  return ctx.scope === 'SYNDIC_LOT' ? { scope: 'SYNDIC_LOT', syndicateId: ctx.syndicateId } : { scope: 'RENTAL_LEASE' };
}

/** Données de scope à écrire sur un créancier, un mandat ou une remise neufs. */
export function scopeData(
  ctx: DirectDebitScopeCtx
): { scope: 'RENTAL_LEASE' } | { scope: 'SYNDIC_LOT'; syndicateId: string } {
  return scopeWhere(ctx);
}

/** Charge utile d'audit : le périmètre (et le syndicat) s'ajoutent hors locatif, jamais un IBAN. */
export function auditScope(ctx: DirectDebitScopeCtx): Record<string, unknown> {
  return ctx.scope === 'SYNDIC_LOT' ? { scope: ctx.scope, syndicateId: ctx.syndicateId } : {};
}
