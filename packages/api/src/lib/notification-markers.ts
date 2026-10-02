import { Prisma } from '@prisma/client';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

/**
 * Marques anti-doublon des notifications (ADR-006, phase 5).
 *
 * « Cette alerte est déjà partie pour cet objet » est une mémoire technique, pas
 * un fait à auditer : elle vit dans `notification_markers` (par agence), jamais
 * dans `audit_logs`, que la rétention purge. Un envoi qui mérite aussi une trace
 * d'audit écrit les DEUX : la marque ici, l'événement dans le journal.
 *
 * `kind` garde le nom de l'ancien événement d'audit dont la marque est issue
 * (`PATRIMOINE_LEASE_END_ALERT_SENT`…) : la migration a copié les lignes
 * existantes sous ce nom.
 */
export const MARKER_KIND = {
  leaseEnd: 'PATRIMOINE_LEASE_END_ALERT_SENT',
  loanMaturity: 'PATRIMOINE_LOAN_MATURITY_ALERT_SENT',
  workUpcoming: 'PATRIMOINE_WORK_UPCOMING_ALERT_SENT',
  insurancePolicy: 'PATRIMOINE_INSURANCE_POLICY_ALERT_SENT',
  maintenanceDue: 'PATRIMOINE_MAINTENANCE_DUE_ALERT_SENT',
  landStepOverdue: 'PATRIMOINE_LAND_STEP_OVERDUE_ALERT_SENT',
  ownerMonthlyReport: 'PATRIMOINE_OWNER_MONTHLY_REPORT_SENT',
  convocationDelivery: 'SYNDIC_MEETING_CONVOCATION_DELIVERY'
} as const;
export type MarkerKind = (typeof MARKER_KIND)[keyof typeof MARKER_KIND];

/** Parmi `candidateIds`, ceux qui portent déjà la marque `kind` pour cette agence. */
export async function alreadyMarkedEntityIds(
  tenantId: string,
  kind: MarkerKind,
  entityType: string,
  candidateIds: string[]
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await prisma.notificationMarker.findMany({
    where: { tenantId, kind, entityType, entityId: { in: candidateIds } },
    select: { entityId: true }
  });
  return new Set(rows.map(row => row.entityId));
}

/**
 * Pose la marque d'une notification envoyée. Un échec d'écriture ne doit ni
 * interrompre la boucle ni annuler un envoi déjà parti : au pire la notification
 * est renvoyée au prochain passage.
 */
export async function markNotified(
  tenantId: string,
  kind: MarkerKind,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.notificationMarker.create({
      data: { tenantId, kind, entityType, entityId, payload: payload as Prisma.InputJsonValue }
    });
  } catch (error) {
    logger.warn('Marque anti-doublon non écrite', {
      tenantId,
      kind,
      entityId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
