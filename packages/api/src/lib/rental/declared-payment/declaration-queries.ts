import { prisma } from '../../../utils/database';
import { isOverdue } from '../../payment-proof/business-days';
import { loadDeclaredPaymentSettings } from './settings';
import type { PendingCountDto, PendingDeclarationSummary } from './types';

/**
 * Requêtes de lecture du paiement déclaré côté gestionnaire : compteur du
 * badge de menu et déclaration en attente par échéance. Toujours filtrées par agence.
 */

/** Plafond de lecture pour le calcul du retard (jours ouvrés, donc hors SQL). */
const PENDING_SCAN_LIMIT = 5000;

/** `{ pending, overdue }` de l'agence (contrat §1.6 `pending-count`). */
export async function getPendingCount(tenantId: string, now: Date = new Date()): Promise<PendingCountDto> {
  const [pending, settings] = await Promise.all([
    prisma.rentalPaymentDeclaration.count({ where: { tenant_id: tenantId, status: 'PENDING' } }),
    loadDeclaredPaymentSettings(tenantId)
  ]);
  if (pending === 0) return { pending: 0, overdue: 0 };
  const rows = await prisma.rentalPaymentDeclaration.findMany({
    where: { tenant_id: tenantId, status: 'PENDING' },
    select: { created_at: true },
    orderBy: { created_at: 'asc' },
    take: PENDING_SCAN_LIMIT
  });
  const overdue = rows.filter(row => isOverdue(row.created_at, settings.reviewAlertBusinessDays, now)).length;
  return { pending, overdue };
}

/**
 * La plus ancienne déclaration `PENDING` de chacune des échéances données
 * (champ additif `pendingDeclaration`, contrat §1.6). Une requête groupée.
 */
export async function pendingDeclarationsByInstallment(
  tenantId: string,
  installmentIds: string[]
): Promise<Map<string, PendingDeclarationSummary>> {
  const result = new Map<string, PendingDeclarationSummary>();
  if (installmentIds.length === 0) return result;
  const rows = await prisma.rentalPaymentDeclaration.findMany({
    where: { tenant_id: tenantId, status: 'PENDING', installment_id: { in: installmentIds } },
    select: { id: true, installment_id: true, amount: true, reference: true, created_at: true },
    orderBy: { created_at: 'asc' }
  });
  for (const row of rows) {
    if (!row.installment_id || result.has(row.installment_id)) continue;
    result.set(row.installment_id, {
      id: row.id,
      amount: Number(row.amount),
      declaredAt: row.created_at.toISOString(),
      reference: row.reference
    });
  }
  return result;
}
