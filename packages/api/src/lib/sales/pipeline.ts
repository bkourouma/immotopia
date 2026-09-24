import {
  SaleAgreementStatus,
  SaleCommissionPaymentStatus,
  SaleCommissionStatus,
  SaleMandateStatus,
  SaleOfferStatus
} from '@prisma/client';
import { prisma } from '../../utils/database';
import { roundMoneyXof } from '../finance/money';
import type { SalesPipelineDto } from './types';

/** Compteurs et valeurs du tableau des ventes (PRD §4, `GET /pipeline`). */
export async function getSalesPipeline(tenantId: string): Promise<SalesPipelineDto> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [
    activeMandates,
    expiredMandates,
    openOffers,
    signedAgreements,
    completedThisMonth,
    commissionsDueRows,
    commissionsPaidThisMonth
  ] = await Promise.all([
    prisma.saleMandate.findMany({
      where: { tenantId, status: SaleMandateStatus.ACTIVE },
      select: { askingPrice: true, endDate: true }
    }),
    prisma.saleMandate.count({
      where: { tenantId, status: SaleMandateStatus.ACTIVE, endDate: { lt: now } }
    }),
    prisma.saleOffer.count({
      where: {
        tenantId,
        status: { in: [SaleOfferStatus.SUBMITTED, SaleOfferStatus.COUNTERED] },
        OR: [{ validUntil: null }, { validUntil: { gte: now } }]
      }
    }),
    prisma.saleAgreement.findMany({ where: { tenantId, status: SaleAgreementStatus.SIGNED }, select: { price: true } }),
    prisma.saleAgreement.findMany({
      where: { tenantId, status: SaleAgreementStatus.COMPLETED, deedDate: { gte: monthStart, lt: nextMonthStart } },
      select: { price: true }
    }),
    prisma.saleCommission.findMany({
      where: { tenantId, status: { in: [SaleCommissionStatus.DUE, SaleCommissionStatus.PARTIALLY_PAID] } },
      select: { id: true, amountInclTax: true }
    }),
    prisma.saleCommissionPayment.aggregate({
      where: { tenantId, status: SaleCommissionPaymentStatus.POSTED, paidAt: { gte: monthStart, lt: nextMonthStart } },
      _sum: { amount: true }
    })
  ]);

  let commissionsDue = 0;
  for (const commission of commissionsDueRows) {
    const paid = await prisma.saleCommissionPayment.aggregate({
      where: { tenantId, commissionId: commission.id, status: SaleCommissionPaymentStatus.POSTED },
      _sum: { amount: true }
    });
    commissionsDue += roundMoneyXof(Number(commission.amountInclTax) - Number(paid._sum.amount ?? 0));
  }

  return {
    activeMandates: activeMandates.length,
    activeMandatesValue: roundMoneyXof(activeMandates.reduce((sum, m) => sum + Number(m.askingPrice), 0)),
    expiredMandates,
    openOffers,
    signedAgreements: signedAgreements.length,
    signedAgreementsValue: roundMoneyXof(signedAgreements.reduce((sum, a) => sum + Number(a.price), 0)),
    salesThisMonth: completedThisMonth.length,
    salesThisMonthValue: roundMoneyXof(completedThisMonth.reduce((sum, a) => sum + Number(a.price), 0)),
    commissionsDue: roundMoneyXof(commissionsDue),
    commissionsCollectedThisMonth: roundMoneyXof(Number(commissionsPaidThisMonth._sum.amount ?? 0))
  };
}
