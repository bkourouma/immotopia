import { logAuditEvent } from '../audit-service';

/**
 * Journal d'audit du patrimoine multi-actifs. Le payload ne porte JAMAIS de
 * donnée personnelle : identifiants, type, classe et NOMS des champs modifiés,
 * jamais un montant, un nom, un prêteur ni une note.
 */

export const PATRIMOINE_ASSET_AUDIT = {
  ASSET_CREATED: 'PATRIMOINE_ASSET_CREATED',
  ASSET_UPDATED: 'PATRIMOINE_ASSET_UPDATED',
  ASSET_DISPOSED: 'PATRIMOINE_ASSET_DISPOSED',
  ASSET_ARCHIVED: 'PATRIMOINE_ASSET_ARCHIVED',
  VALUATION_CREATED: 'PATRIMOINE_VALUATION_CREATED',
  VALUATION_UPDATED: 'PATRIMOINE_VALUATION_UPDATED',
  VALUATION_DELETED: 'PATRIMOINE_VALUATION_DELETED',
  DEBT_CREATED: 'PATRIMOINE_DEBT_CREATED',
  DEBT_UPDATED: 'PATRIMOINE_DEBT_UPDATED',
  DEBT_DELETED: 'PATRIMOINE_DEBT_DELETED',
  HOLDING_SET: 'PATRIMOINE_HOLDING_SET',
  HOLDING_DELETED: 'PATRIMOINE_HOLDING_DELETED'
} as const;

export type PatrimoineAssetAuditAction = (typeof PATRIMOINE_ASSET_AUDIT)[keyof typeof PATRIMOINE_ASSET_AUDIT];

export type AuditEntityType = 'Asset' | 'AssetValuation' | 'PropertyLoan' | 'PropertyHolding';

export function auditPatrimoine(params: {
  tenantId: string;
  actorUserId?: string | null;
  action: PatrimoineAssetAuditAction;
  entityType: AuditEntityType;
  entityId: string;
  /** Identifiants, types, classes et noms de champs seulement. */
  payload?: Record<string, string | string[] | null>;
}): void {
  logAuditEvent({
    actorUserId: params.actorUserId ?? null,
    tenantId: params.tenantId,
    actionKey: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    payload: params.payload ?? null
  });
}

/** Noms des champs effectivement fournis dans un PATCH (jamais leurs valeurs). */
export function changedFields(input: object): string[] {
  return Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort();
}
