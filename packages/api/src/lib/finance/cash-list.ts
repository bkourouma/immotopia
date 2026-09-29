/**
 * Liste des pièces de caisse — BUG-2026-09-29-020.
 *
 * L'écran « Pièce de caisse » ne connaissait que la pièce émise dans la session
 * en cours (état React) : une pièce validée par quelqu'un d'autre, ou après
 * avoir quitté la page, n'était plus atteignable, donc ni imprimable ni
 * annulable par personne. Cette lecture la rend consultable.
 *
 * **Lecture seule.** Rien n'est écrit ici. Une pièce VALIDÉE ne se rouvre ni ne
 * se modifie (principe P-6, `spec.md` « La validation est irréversible ») : la
 * seule voie de correction est l'annulation par contre-écriture, avec motif
 * (`voidDocumentTx`), que cette liste ne fait qu'exposer.
 *
 * **Statut.** `DRAFT` (pas de `validatedAt`), `VALIDATED`, ou `VOIDED` : une
 * pièce annulée reste une ligne validée en base, seule la présence d'un
 * `VoidDocument` la distingue — d'où la seconde lecture, groupée, jamais une
 * requête par ligne.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import { assertBelongsToTenant } from '../../utils/tenant-ownership';
import { toAmountOrZero } from './types';
import { formatCashVoucherNumber } from './cash';

/** Borne défensive : la liste n'est pas paginée, la plus récente d'abord. */
export const CASH_VOUCHER_LIST_LIMIT = 200;

export type CashVoucherListStatus = 'DRAFT' | 'VALIDATED' | 'VOIDED';

export interface CashVoucherListItem {
  id: string;
  /** `AAAA-NNNN`, nul tant que la pièce est un brouillon. */
  number: string | null;
  siteId: string;
  siteLabel: string;
  costCategoryId: string;
  costCategoryLabel: string;
  beneficiaryName: string;
  amount: number;
  currency: string;
  voucherDate: Date;
  reason: string;
  status: CashVoucherListStatus;
  validatedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdByLabel: string;
}

function labelCreator(user: { fullName: string | null; email: string } | null | undefined, userId: string): string {
  return user?.fullName || user?.email || `Utilisateur ${userId.slice(0, 8)}`;
}

/**
 * Les pièces de caisse d'une agence, éventuellement d'un seul chantier.
 *
 * `siteId`, s'il est fourni, vient de la requête : il est vérifié comme
 * appartenant à l'agence avant toute lecture (`assertBelongsToTenant`), et une
 * référence d'une autre agence lève la même `NotFoundError` qu'un chantier
 * inexistant.
 */
export async function listCashVouchers(
  client: PrismaTransactionClient,
  tenantId: string,
  filters: { siteId?: string } = {}
): Promise<CashVoucherListItem[]> {
  if (filters.siteId) {
    await assertBelongsToTenant(client, 'constructionSite', filters.siteId, tenantId, {
      message: 'Chantier introuvable.'
    });
  }

  const rows = await client.cashVoucher.findMany({
    where: { tenantId, ...(filters.siteId ? { siteId: filters.siteId } : {}) },
    include: {
      site: { select: { name: true } },
      costCategory: { select: { label: true } },
      createdBy: { select: { fullName: true, email: true } }
    },
    orderBy: [{ voucherDate: 'desc' }, { createdAt: 'desc' }],
    take: CASH_VOUCHER_LIST_LIMIT
  });

  const voids =
    rows.length > 0
      ? await client.voidDocument.findMany({
          where: {
            tenantId,
            documentType: 'CASH_VOUCHER' as any,
            documentId: { in: rows.map((row: { id: string }) => row.id) }
          },
          select: { documentId: true, voidedAt: true, reason: true }
        })
      : [];
  const annulations = new Map<string, { voidedAt: Date; reason: string }>(
    voids.map((v: { documentId: string; voidedAt: Date; reason: string }) => [v.documentId, v])
  );

  return rows.map((row: Record<string, any>): CashVoucherListItem => {
    const annulation = annulations.get(row.id);
    return {
      id: row.id,
      number: formatCashVoucherNumber(row.voucherYear, row.voucherNumber),
      siteId: row.siteId,
      siteLabel: row.site?.name ?? 'Chantier inconnu',
      costCategoryId: row.costCategoryId,
      costCategoryLabel: row.costCategory?.label ?? 'Poste inconnu',
      beneficiaryName: row.beneficiaryName,
      amount: toAmountOrZero(row.amount),
      currency: row.currency ?? 'XOF',
      voucherDate: row.voucherDate,
      reason: row.reason,
      status: annulation ? 'VOIDED' : row.validatedAt ? 'VALIDATED' : 'DRAFT',
      validatedAt: row.validatedAt ?? null,
      voidedAt: annulation?.voidedAt ?? null,
      voidReason: annulation?.reason ?? null,
      createdByLabel: labelCreator(row.createdBy, row.createdByUserId)
    };
  });
}
