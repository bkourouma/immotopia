import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { agencyFeeTerms, getAgencyFinanceSettings } from '../settings/finance-settings';
import { computeAllocationFee, feeTermsFromRow, resolveFeeTerms } from './fee-terms';

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
  const allocations = await prisma.rentalPaymentAllocation.findMany({
    where: {
      tenant_id: tenantId,
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
    select: {
      id: true,
      amount: true,
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
  if (allocations.length === 0) return 0;

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

  if (rows.length === 0) return 0;
  const result = await prisma.managementFee.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}
