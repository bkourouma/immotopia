import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { agencyFeeTerms, getAgencyFinanceSettings } from '../settings/finance-settings';
import { computeAllocationFee, feeTermsFromRow, resolveFeeTerms } from './fee-terms';

/**
 * Un niveau de conditions ne vaut que pour les encaissements enregistrés
 * après son dernier enregistrement (BUG-2026-09-28-029) : fixer ou changer un
 * taux ne touche jamais un encaissement déjà fait. `levelSince` est la date
 * d'enregistrement du niveau retenu.
 *
 * Les encaissements antérieurs qui avaient déjà des honoraires applicables les
 * ont reçus AVANT le changement (`freezeManagementFees`, appelé avant chaque
 * enregistrement de conditions) ; ceux qui n'en avaient pas n'en reçoivent pas.
 */
export function feeTermsApplyToAllocation(levelSince: Date | null | undefined, allocationCreatedAt: Date): boolean {
  return !levelSince || allocationCreatedAt.getTime() >= levelSince.getTime();
}

/** Taille d'un lot du figeage et de la simulation : borne la mémoire d'une agence qui a des années d'encaissements. */
const FREEZE_BATCH_SIZE = 500;

/**
 * Fige les honoraires de tous les encaissements déjà faits, avec les conditions
 * encore en vigueur. À appeler AVANT d'enregistrer un changement de conditions
 * (bail, propriétaire, agence), et par le script de rattrapage
 * `scripts/backfill-management-fees.ts` avant la mise en ligne.
 *
 * Idempotent : seuls les encaissements sans honoraires sont traités, et
 * l'unicité sur `allocation_id` + `skipDuplicates` rendent sans effet un second
 * passage ou deux passages concurrents. Parcours par lots (curseur sur l'id)
 * pour ne pas charger toute l'agence en mémoire ; chaque lot s'écrit en une
 * seule requête atomique.
 */
export async function freezeManagementFees(tenantId: string): Promise<number> {
  let created = 0;
  await forEachFeeBatch(tenantId, async rows => {
    if (rows.length === 0) return;
    const result = await prisma.managementFee.createMany({ data: rows, skipDuplicates: true });
    created += result.count;
  });
  return created;
}

/** Résultat d'une simulation de figeage : ce que `freezeManagementFees` écrirait. */
export interface ManagementFeeFreezePreview {
  /** Encaissements sans honoraires qui en recevraient. */
  allocations: number;
  /** Somme des honoraires HT qui seraient figés. */
  feeAmount: number;
  /** Somme de la TVA sur honoraires qui serait figée. */
  vatAmount: number;
}

/**
 * Simulation de `freezeManagementFees` : mêmes règles, mêmes lots, aucune
 * écriture.
 */
export async function previewManagementFeeFreeze(tenantId: string): Promise<ManagementFeeFreezePreview> {
  const preview: ManagementFeeFreezePreview = { allocations: 0, feeAmount: 0, vatAmount: 0 };
  await forEachFeeBatch(tenantId, async rows => {
    for (const row of rows) {
      preview.allocations += 1;
      preview.feeAmount += Number(row.feeAmount);
      preview.vatAmount += Number(row.vatAmount);
    }
  });
  preview.feeAmount = Math.round(preview.feeAmount * 100) / 100;
  preview.vatAmount = Math.round(preview.vatAmount * 100) / 100;
  return preview;
}

/** Parcourt, lot par lot, les honoraires à créer pour tous les encaissements de l'agence. */
async function forEachFeeBatch(
  tenantId: string,
  handle: (rows: Prisma.ManagementFeeCreateManyInput[]) => Promise<void>
): Promise<void> {
  const to = new Date();
  let afterId: string | undefined;
  for (;;) {
    const batch = await computeManagementFeeRows(tenantId, {
      from: new Date(0),
      to,
      afterId,
      take: FREEZE_BATCH_SIZE
    });
    await handle(batch.rows);
    if (batch.scanned < FREEZE_BATCH_SIZE || !batch.lastId) return;
    afterId = batch.lastId;
  }
}

/**
 * Crée les honoraires des encaissements d'une période qui n'en ont pas encore.
 *
 * Pourquoi « à la demande » et non au moment de l'affectation : un règlement
 * s'affecte par quatre chemins — la saisie, la campagne de facturation qui
 * impute une avance, la déclaration validée, l'encaissement rapide. En
 * brancher un seul aurait laissé les trois autres sans honoraires ; les
 * brancher tous aurait touché quatre flux financiers déjà recettés. Ici, un
 * seul point, appelé par le relevé propriétaire et l'état des commissions,
 * couvre toutes les voies.
 *
 * Une fois créés, les honoraires ne bougent plus : taux, TVA, gestionnaire et
 * part de l'agent sont ceux du jour de leur création. Un encaissement dont
 * aucun niveau n'est paramétré n'en reçoit pas ; il en recevra dès qu'un taux
 * sera fixé.
 *
 * Idempotent : l'unicité sur `allocation_id` et `skipDuplicates` rendent sans
 * effet deux appels concurrents sur la même période.
 */
export async function materializeManagementFees(
  tenantId: string,
  params: { from: Date; to: Date; propertyIds?: string[] }
): Promise<number> {
  const { rows } = await computeManagementFeeRows(tenantId, params);
  if (rows.length === 0) return 0;
  const result = await prisma.managementFee.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

/**
 * Calcule (sans écrire) les honoraires des encaissements sans honoraires d'une
 * période. `afterId` et `take` permettent un parcours par lots ordonné par id :
 * `scanned` est le nombre d'encaissements examinés (même ceux sans honoraires
 * applicables), `lastId` le dernier examiné.
 */
async function computeManagementFeeRows(
  tenantId: string,
  params: { from: Date; to: Date; propertyIds?: string[]; afterId?: string; take?: number }
): Promise<{ rows: Prisma.ManagementFeeCreateManyInput[]; scanned: number; lastId: string | null }> {
  const allocations = await prisma.rentalPaymentAllocation.findMany({
    where: {
      tenant_id: tenantId,
      ...(params.afterId ? { id: { gt: params.afterId } } : {}),
      managementFee: { is: null },
      payment: {
        status: 'SUCCESS',
        OR: [
          { succeeded_at: { gte: params.from, lte: params.to } },
          { succeeded_at: null, initiated_at: { gte: params.from, lte: params.to } }
        ]
      },
      ...(params.propertyIds ? { installment: { lease: { property_id: { in: params.propertyIds } } } } : {})
    },
    ...(params.take ? { orderBy: { id: 'asc' as const }, take: params.take } : {}),
    select: {
      id: true,
      amount: true,
      created_at: true,
      payment_id: true,
      payment: { select: { succeeded_at: true, initiated_at: true } },
      installment: {
        select: {
          amount_rent: true,
          amount_service: true,
          amount_other_fees: true,
          penalty_amount: true,
          lease: {
            select: {
              id: true,
              property_id: true,
              owner_client_id: true,
              managementTerms: true
            }
          }
        }
      }
    }
  });
  if (allocations.length === 0) return { rows: [], scanned: 0, lastId: null };

  const ownerIds = Array.from(
    new Set(allocations.map(a => a.installment.lease.owner_client_id).filter((id): id is string => Boolean(id)))
  );
  const [settings, ownerTerms, agentRates] = await Promise.all([
    getAgencyFinanceSettings(tenantId),
    ownerIds.length
      ? prisma.ownerManagementTerms.findMany({ where: { tenantId, ownerClientId: { in: ownerIds } } })
      : Promise.resolve([]),
    prisma.agentCommissionRate.findMany({ where: { tenantId } })
  ]);
  const ownerTermsById = new Map(ownerTerms.map(row => [row.ownerClientId, feeTermsFromRow(row)]));
  const ownerSinceById = new Map(ownerTerms.map(row => [row.ownerClientId, row.updatedAt]));
  const agencySince = settings.updatedAt ? new Date(settings.updatedAt) : null;
  const shareByAgent = new Map(agentRates.map(row => [row.userId, Number(row.sharePercent)]));
  const agency = agencyFeeTerms(settings);

  const decimal = (value: number) => new Prisma.Decimal(value);
  const rows: Prisma.ManagementFeeCreateManyInput[] = [];

  for (const allocation of allocations) {
    const { lease } = allocation.installment;
    const terms = resolveFeeTerms({
      lease: feeTermsFromRow(lease.managementTerms),
      owner: lease.owner_client_id ? ownerTermsById.get(lease.owner_client_id) : null,
      agency
    });
    if (terms.source === 'NONE') continue;

    const levelSince =
      terms.source === 'LEASE'
        ? lease.managementTerms?.updatedAt
        : terms.source === 'OWNER'
          ? ownerSinceById.get(lease.owner_client_id ?? '')
          : agencySince;
    if (!feeTermsApplyToAllocation(levelSince, allocation.created_at)) continue;

    const inst = allocation.installment;
    const amountRent = Number(inst.amount_rent);
    const total =
      amountRent + Number(inst.amount_service) + Number(inst.amount_other_fees) + Number(inst.penalty_amount);
    const agentUserId = lease.managementTerms?.agentUserId ?? null;
    const agentSharePercent = agentUserId ? (shareByAgent.get(agentUserId) ?? null) : null;

    const fee = computeAllocationFee({
      amount: Number(allocation.amount),
      installment: { amountRent, total },
      terms,
      vat: { registered: settings.vatRegistered, rate: settings.vatRate },
      agentSharePercent
    });

    rows.push({
      tenantId,
      allocationId: allocation.id,
      paymentId: allocation.payment_id,
      leaseId: lease.id,
      propertyId: lease.property_id,
      ownerClientId: lease.owner_client_id,
      collectedAt: allocation.payment.succeeded_at ?? allocation.payment.initiated_at,
      collectedAmount: decimal(Number(allocation.amount)),
      baseAmount: decimal(fee.baseAmount),
      source: terms.source,
      mode: terms.managementFeeMode,
      rate: terms.managementFeeRate === null ? null : decimal(terms.managementFeeRate),
      fixedAmount: terms.managementFeeFixedAmount === null ? null : decimal(terms.managementFeeFixedAmount),
      feeBase: terms.managementFeeMode === 'PERCENT' ? terms.managementFeeBase : null,
      feeAmount: decimal(fee.feeAmount),
      vatRate: fee.vatRate === null ? null : decimal(fee.vatRate),
      vatAmount: decimal(fee.vatAmount),
      agentUserId,
      agentSharePercent: agentSharePercent === null ? null : decimal(agentSharePercent),
      agentShareAmount: decimal(fee.agentShareAmount)
    });
  }

  return { rows, scanned: allocations.length, lastId: allocations[allocations.length - 1].id };
}
