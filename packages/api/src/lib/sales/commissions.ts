import { Prisma, SaleAgreement, SaleCommissionPaymentStatus, SaleCommissionStatus, SaleMandate } from '@prisma/client';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { assertTreasuryAccountUsableTx, ensureChartAccountTx, journalForKind } from '../treasury/accounts';
import { postDocumentEntryTx } from '../finance/accounting';
import { journalResolver } from '../owner-account/accounts';
import { reverseDocumentEntryTx } from '../owner-account/sync';
import { roundMoneyXof } from '../finance/money';
import { DEFAULT_VAT_COLLECTED_ACCOUNT, getAgencyFinanceSettings } from '../settings/finance-settings';
import { crmContactNames, propertyLabels, tenantClientNames, userNames } from './names';
import { agreementNumber, commissionNumber, commissionPaymentNumber, nextSequenceTx } from './numbering';
import { createCommissionPaymentSchema, voidReasonSchema } from './schemas';
import type {
  SaleCommissionDetailDto,
  SaleCommissionDto,
  SaleCommissionListDto,
  SaleCommissionPaymentDto
} from './types';

/**
 * Commission de transaction (PRD §3, P4/P5).
 *
 * Créée automatiquement au passage du compromis à `COMPLETED`
 * (`createCommissionForAgreementTx`, appelée par `agreements.ts` dans la même
 * transaction). Comptabilisée à l'encaissement, comme la gestion locative du
 * lot 10 : chaque règlement passe `Débit trésorerie / Crédit 70612 (HT) +
 * 4432 (TVA)`.
 */

/** 70612 — Honoraires de transaction. Distinct du 70611 (gestion locative). */
export const DEFAULT_SALE_COMMISSION_ACCOUNT = '70612';

type CommissionRow = Prisma.SaleCommissionGetPayload<Record<string, never>>;
type PaymentRow = Prisma.SaleCommissionPaymentGetPayload<Record<string, never>>;

export function computeCommissionAmounts(
  mandate: {
    commissionMode: SaleMandate['commissionMode'];
    commissionRate: number | Prisma.Decimal | null;
    commissionFixedAmount: number | Prisma.Decimal | null;
  },
  baseAmount: number,
  vatRegistered: boolean,
  vatRatePercent: number
): { amountExclTax: number; vatRate: number; vatAmount: number; amountInclTax: number } {
  const rawExclTax =
    mandate.commissionMode === 'PERCENT'
      ? (baseAmount * Number(mandate.commissionRate ?? 0)) / 100
      : Number(mandate.commissionFixedAmount ?? 0);
  const amountExclTax = roundMoneyXof(rawExclTax);
  const vatRate = vatRegistered ? vatRatePercent : 0;
  const vatAmount = roundMoneyXof((amountExclTax * vatRate) / 100);
  const amountInclTax = amountExclTax + vatAmount;
  return { amountExclTax, vatRate, vatAmount, amountInclTax };
}

/**
 * Répartit un règlement (montant TTC encaissé) entre sa part HT (70612) et sa
 * part TVA (4432), au prorata de la commission. « La part HT est arrondie à
 * l'unité ; la TVA prend le reste (l'écriture tombe juste) » (PRD §3) : le
 * reste garantit que HT + TVA == amount, quel que soit l'arrondi.
 */
export function splitCommissionPaymentAmount(
  amount: number,
  commission: { vatRate: number; amountExclTax: number; amountInclTax: number }
): { htPart: number; vatPart: number } {
  if (commission.vatRate <= 0 || commission.amountInclTax <= 0) {
    return { htPart: amount, vatPart: 0 };
  }
  const htPart = roundMoneyXof((amount * commission.amountExclTax) / commission.amountInclTax);
  return { htPart, vatPart: amount - htPart };
}

async function sumPostedPayments(
  client: PrismaTransactionClient,
  tenantId: string,
  commissionId: string
): Promise<number> {
  const agg = await client.saleCommissionPayment.aggregate({
    where: { tenantId, commissionId, status: SaleCommissionPaymentStatus.POSTED },
    _sum: { amount: true }
  });
  return roundMoneyXof(Number(agg._sum.amount ?? 0));
}

/** Crée la commission d'un compromis qui vient de passer à COMPLETED. Une par compromis. */
export async function createCommissionForAgreementTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  agreement: SaleAgreement,
  mandate: SaleMandate
): Promise<CommissionRow> {
  const already = await tx.saleCommission.findFirst({ where: { tenantId, agreementId: agreement.id } });
  if (already) return already;

  const settings = await getAgencyFinanceSettings(tenantId);
  const baseAmount = Number(agreement.price);
  const { amountExclTax, vatRate, vatAmount, amountInclTax } = computeCommissionAmounts(
    mandate,
    baseAmount,
    settings.vatRegistered,
    settings.vatRate
  );

  const deedDate = agreement.deedDate ?? new Date();
  const year = deedDate.getUTCFullYear();
  const sequence = await nextSequenceTx(tx.saleCommission, tenantId, year);

  return tx.saleCommission.create({
    data: {
      tenantId,
      year,
      sequence,
      agreementId: agreement.id,
      mandateId: mandate.id,
      payer: mandate.commissionPayer,
      baseAmount,
      amountExclTax,
      vatRate,
      vatAmount,
      amountInclTax,
      agentUserId: mandate.agentUserId,
      agentSharePercent: mandate.agentSharePercent,
      issuedAt: deedDate
    }
  });
}

async function paymentDto(
  row: PaymentRow,
  names: Map<string, string>,
  treasuryLabels: Map<string, string>
): Promise<SaleCommissionPaymentDto> {
  return {
    id: row.id,
    number: commissionPaymentNumber(row.year, row.sequence),
    amount: Number(row.amount),
    paidAt: row.paidAt.toISOString(),
    paymentMethod: row.paymentMethod,
    treasuryAccountId: row.treasuryAccountId,
    treasuryAccountLabel: treasuryLabels.get(row.treasuryAccountId) ?? '',
    reference: row.reference,
    status: row.status,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    createdByName: row.createdByUserId ? (names.get(row.createdByUserId) ?? null) : null,
    createdAt: row.createdAt.toISOString()
  };
}

export async function commissionDto(
  client: PrismaTransactionClient,
  tenantId: string,
  row: CommissionRow
): Promise<SaleCommissionDto> {
  const [agreement, mandate] = await Promise.all([
    client.saleAgreement.findFirst({ where: { id: row.agreementId, tenantId } }),
    client.saleMandate.findFirst({ where: { id: row.mandateId, tenantId } })
  ]);
  const offer = agreement ? await client.saleOffer.findFirst({ where: { id: agreement.offerId, tenantId } }) : null;

  const [props, sellers, buyers, agents] = await Promise.all([
    propertyLabels(client, tenantId, agreement ? [agreement.propertyId] : []),
    tenantClientNames(client, tenantId, mandate ? [mandate.sellerClientId] : []),
    crmContactNames(client, tenantId, offer ? [offer.buyerContactId] : []),
    userNames(client, [row.agentUserId])
  ]);

  const paidAmount = await sumPostedPayments(client, tenantId, row.id);
  const amountInclTax = Number(row.amountInclTax);
  const remainingAmount = roundMoneyXof(amountInclTax - paidAmount);
  const amountExclTax = Number(row.amountExclTax);
  const agentShareEarned =
    row.agentSharePercent == null
      ? 0
      : roundMoneyXof(
          amountInclTax > 0 ? paidAmount * (amountExclTax / amountInclTax) * (Number(row.agentSharePercent) / 100) : 0
        );

  const payerName =
    row.payer === 'SELLER'
      ? mandate
        ? (sellers.get(mandate.sellerClientId) ?? '')
        : ''
      : offer
        ? (buyers.get(offer.buyerContactId) ?? '')
        : '';

  return {
    id: row.id,
    number: commissionNumber(row.year, row.sequence),
    agreementId: row.agreementId,
    agreementNumber: agreement ? agreementNumber(agreement.year, agreement.sequence) : '',
    mandateId: row.mandateId,
    propertyLabel: agreement ? (props.get(agreement.propertyId)?.label ?? '') : '',
    payer: row.payer,
    payerName,
    baseAmount: Number(row.baseAmount),
    amountExclTax,
    vatRate: Number(row.vatRate),
    vatAmount: Number(row.vatAmount),
    amountInclTax,
    paidAmount,
    remainingAmount,
    status: row.status,
    agentUserId: row.agentUserId,
    agentName: row.agentUserId ? (agents.get(row.agentUserId) ?? null) : null,
    agentSharePercent: row.agentSharePercent == null ? null : Number(row.agentSharePercent),
    agentShareEarned,
    issuedAt: row.issuedAt.toISOString()
  };
}

export async function listCommissions(tenantId: string, filters: { status?: string }): Promise<SaleCommissionListDto> {
  const where: Prisma.SaleCommissionWhereInput = { tenantId };
  if (filters.status) where.status = filters.status as SaleCommissionStatus;
  const rows = await prisma.saleCommission.findMany({ where, orderBy: { issuedAt: 'desc' }, take: 500 });
  const items = await Promise.all(rows.map(row => commissionDto(prisma, tenantId, row)));
  const totals = items.reduce(
    (acc, item) => ({
      amountInclTax: acc.amountInclTax + item.amountInclTax,
      paidAmount: acc.paidAmount + item.paidAmount,
      remainingAmount: acc.remainingAmount + item.remainingAmount
    }),
    { amountInclTax: 0, paidAmount: 0, remainingAmount: 0 }
  );
  return { items, totals };
}

export async function getCommissionDetail(tenantId: string, commissionId: string): Promise<SaleCommissionDetailDto> {
  const row = await prisma.saleCommission.findFirst({ where: { id: commissionId, tenantId } });
  if (!row) throw notFound('Commission de vente introuvable');

  const paymentRows = await prisma.saleCommissionPayment.findMany({
    where: { tenantId, commissionId: row.id },
    orderBy: { createdAt: 'desc' }
  });
  const [names, treasuryLabels, dto] = await Promise.all([
    userNames(
      prisma,
      paymentRows.map(p => p.createdByUserId)
    ),
    (async () => {
      const ids = Array.from(new Set(paymentRows.map(p => p.treasuryAccountId)));
      if (!ids.length) return new Map<string, string>();
      const accounts = await prisma.treasuryAccount.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, label: true }
      });
      return new Map(accounts.map(a => [a.id, a.label]));
    })(),
    commissionDto(prisma, tenantId, row)
  ]);

  const payments = await Promise.all(paymentRows.map(p => paymentDto(p, names, treasuryLabels)));
  return { ...dto, payments };
}

const commissionPaymentLabel = (number: string, propertyLabel: string) =>
  `Encaissement de commission de vente ${number} — ${propertyLabel}`;

export async function createCommissionPayment(
  tenantId: string,
  userId: string | undefined,
  commissionId: string,
  body: unknown
): Promise<SaleCommissionPaymentDto> {
  const input = createCommissionPaymentSchema.parse(body);

  const created = await prisma.$transaction(async tx => {
    const commission = await tx.saleCommission.findFirst({ where: { id: commissionId, tenantId } });
    if (!commission) throw notFound('Commission de vente introuvable');
    if (commission.status === SaleCommissionStatus.CANCELLED) {
      throw conflict('Cette commission est annulée : elle ne reçoit plus de règlement.');
    }

    const paidSoFar = await sumPostedPayments(tx, tenantId, commission.id);
    const remaining = roundMoneyXof(Number(commission.amountInclTax) - paidSoFar);
    const amount = roundMoneyXof(input.amount);
    if (amount <= 0) throw badRequest('Le montant du règlement doit être positif');
    if (amount > remaining) {
      throw conflict(
        `Le règlement (${amount.toLocaleString('fr-FR')} FCFA) dépasse le reste dû (${remaining.toLocaleString('fr-FR')} FCFA).`
      );
    }

    await assertTreasuryAccountUsableTx(tx, tenantId, input.treasuryAccountId, input.paymentMethod);
    const treasury = await tx.treasuryAccount.findFirst({ where: { id: input.treasuryAccountId, tenantId } });
    if (!treasury) throw badRequest('Compte de trésorerie introuvable');

    const year = input.paidAt.getUTCFullYear();
    const sequence = await nextSequenceTx(tx.saleCommissionPayment, tenantId, year);
    const payment = await tx.saleCommissionPayment.create({
      data: {
        tenantId,
        year,
        sequence,
        commissionId: commission.id,
        amount,
        paidAt: input.paidAt,
        paymentMethod: input.paymentMethod,
        treasuryAccountId: treasury.id,
        reference: input.reference ?? null,
        createdByUserId: userId ?? null
      }
    });
    const number = commissionPaymentNumber(year, sequence);

    const agreement = await tx.saleAgreement.findFirst({ where: { id: commission.agreementId, tenantId } });
    const propLabels = agreement
      ? await propertyLabels(tx, tenantId, [agreement.propertyId])
      : new Map<string, { label: string; status: string }>();
    const label = commissionPaymentLabel(number, agreement ? (propLabels.get(agreement.propertyId)?.label ?? '') : '');

    const { htPart, vatPart } = splitCommissionPaymentAmount(amount, {
      vatRate: Number(commission.vatRate),
      amountExclTax: Number(commission.amountExclTax),
      amountInclTax: Number(commission.amountInclTax)
    });

    const settings = await getAgencyFinanceSettings(tenantId);
    const incomeAccountId = await ensureChartAccountTx(
      tx,
      tenantId,
      DEFAULT_SALE_COMMISSION_ACCOUNT,
      'Honoraires de transaction',
      'INCOME'
    );

    const lines = [
      { accountId: treasury.chartOfAccountId, debit: amount, label },
      { accountId: incomeAccountId, credit: htPart, label }
    ];
    if (vatPart > 0) {
      const vatAccountId = await ensureChartAccountTx(
        tx,
        tenantId,
        settings.vatCollectedAccountNumber ?? DEFAULT_VAT_COLLECTED_ACCOUNT,
        'TVA facturée sur prestations de services',
        'LIABILITY'
      );
      lines.push({ accountId: vatAccountId, credit: vatPart, label });
    }

    const journalFor = journalResolver(tx, tenantId);
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(input.paidAt, journalForKind(treasury.kind)),
      entryDate: input.paidAt,
      reference: number,
      description: label,
      documentType: 'SALE_COMMISSION_PAYMENT',
      documentId: payment.id,
      lines
    });

    const newPaid = roundMoneyXof(paidSoFar + amount);
    const newStatus =
      newPaid >= Number(commission.amountInclTax)
        ? SaleCommissionStatus.PAID
        : newPaid > 0
          ? SaleCommissionStatus.PARTIALLY_PAID
          : SaleCommissionStatus.DUE;
    await tx.saleCommission.update({ where: { id: commission.id }, data: { status: newStatus } });

    return payment;
  });

  const [names, treasuryLabels] = await Promise.all([
    userNames(prisma, [created.createdByUserId]),
    (async () => {
      const account = await prisma.treasuryAccount.findFirst({
        where: { id: created.treasuryAccountId },
        select: { label: true }
      });
      return new Map(account ? [[created.treasuryAccountId, account.label]] : []);
    })()
  ]);
  return paymentDto(created, names, treasuryLabels);
}

export async function voidCommissionPayment(
  tenantId: string,
  userId: string | undefined,
  paymentId: string,
  body: unknown
): Promise<SaleCommissionPaymentDto> {
  const input = voidReasonSchema.parse(body);

  const updated = await prisma.$transaction(async tx => {
    const payment = await tx.saleCommissionPayment.findFirst({ where: { id: paymentId, tenantId } });
    if (!payment) throw notFound('Règlement introuvable');
    if (payment.status === SaleCommissionPaymentStatus.VOIDED) {
      throw conflict('Ce règlement est déjà annulé.');
    }
    const commission = await tx.saleCommission.findFirst({ where: { id: payment.commissionId, tenantId } });
    if (!commission) throw notFound('Commission de vente introuvable');

    const now = new Date();
    const number = commissionPaymentNumber(payment.year, payment.sequence);
    const journalFor = journalResolver(tx, tenantId);
    await reverseDocumentEntryTx(tx, {
      tenantId,
      documentType: 'SALE_COMMISSION_PAYMENT',
      documentId: payment.id,
      entryDate: now,
      description: `Annulation du règlement de commission ${number} — ${input.reason}`,
      journalFor
    });

    const result = await tx.saleCommissionPayment.update({
      where: { id: payment.id },
      data: {
        status: SaleCommissionPaymentStatus.VOIDED,
        voidReason: input.reason,
        voidedAt: now,
        voidedByUserId: userId ?? null
      }
    });

    const paidSoFar = await sumPostedPayments(tx, tenantId, commission.id);
    const newStatus =
      paidSoFar >= Number(commission.amountInclTax) && paidSoFar > 0
        ? SaleCommissionStatus.PAID
        : paidSoFar > 0
          ? SaleCommissionStatus.PARTIALLY_PAID
          : SaleCommissionStatus.DUE;
    await tx.saleCommission.update({ where: { id: commission.id }, data: { status: newStatus } });

    return result;
  });

  const [names, treasuryLabels] = await Promise.all([
    userNames(prisma, [updated.createdByUserId, updated.voidedByUserId]),
    (async () => {
      const account = await prisma.treasuryAccount.findFirst({
        where: { id: updated.treasuryAccountId },
        select: { label: true }
      });
      return new Map(account ? [[updated.treasuryAccountId, account.label]] : []);
    })()
  ]);
  return paymentDto(updated, names, treasuryLabels);
}
