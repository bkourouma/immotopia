import { logAuditEvent } from '../audit-service';
import { changedFields } from '../patrimoine-assets/audit';

/**
 * Journal d'audit des scénarios de projection. Le payload ne porte JAMAIS de
 * donnée saisie : ni le nom du scénario, ni un montant, ni une opération.
 * Seuls figurent les identifiants, la clé du scénario de base (une énumération)
 * et les NOMS des champs modifiés.
 */

export const PATRIMOINE_SCENARIO_AUDIT = {
  SCENARIO_CREATED: 'PATRIMOINE_SCENARIO_CREATED',
  SCENARIO_UPDATED: 'PATRIMOINE_SCENARIO_UPDATED',
  SCENARIO_DELETED: 'PATRIMOINE_SCENARIO_DELETED'
} as const;

export type PatrimoineScenarioAuditAction = (typeof PATRIMOINE_SCENARIO_AUDIT)[keyof typeof PATRIMOINE_SCENARIO_AUDIT];

export function auditScenario(params: {
  tenantId: string;
  actorUserId?: string | null;
  action: PatrimoineScenarioAuditAction;
  scenarioId: string;
  /** Identifiants, énumérations et noms de champs seulement. */
  payload?: Record<string, string | string[] | null>;
}): void {
  logAuditEvent({
    actorUserId: params.actorUserId ?? null,
    tenantId: params.tenantId,
    actionKey: params.action,
    entityType: 'PatrimonyScenario',
    entityId: params.scenarioId,
    payload: params.payload ?? null
  });
}

export { changedFields };
