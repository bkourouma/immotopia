import { Prisma, RentalPaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../utils/database';
import { t } from '../../../i18n';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { montantDisponibleTx } from '../../../services/rental-payment-service';
import { reconcileCheckoutForVerify } from '../../payment-gateway/checkout';
import type {
  RentalOnlineCheckoutStatus,
  RentalOnlinePaginated,
  RentalOnlinePaymentDetailDto,
  RentalOnlinePaymentLogEntryDto,
  RentalOnlinePaymentRowDto,
  RentalOnlinePaymentsSummaryDto,
  RentalOnlineReviewKind,
  VerifyOnlinePaymentResultDto
} from './types';

/**
 * Suivi des paiements en ligne du locatif (contrat 049 §2.1 à §2.4) : liste, résumé, détail,
 * vérification manuelle. Tout est filtré par `tenantId`. Un DTO ne porte JAMAIS `checkoutUrl`,
 * `providerToken` ni `lastProviderPayload`.
 */

const STATUSES: RentalOnlineCheckoutStatus[] = ['PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'EXPIRED', 'REVIEW'];
const REVIEW_KINDS: RentalOnlineReviewKind[] = [
  'AMOUNT_MISMATCH',
  'CONTRARY_STATE',
  'DUPLICATE_TRANSACTION',
  'INSTALLMENT_UNAVAILABLE'
];

const dayRegex = /^\d{4}-\d{2}-\d{2}$/;

const listQuerySchema = z
  .object({
    status: z.string().trim().optional(),
    reviewKind: z
      .enum(['AMOUNT_MISMATCH', 'CONTRARY_STATE', 'DUPLICATE_TRANSACTION', 'INSTALLMENT_UNAVAILABLE'])
      .optional(),
    search: z.string().trim().max(100).optional(),
    leaseId: z.string().uuid().optional(),
    from: z.string().regex(dayRegex).optional(),
    to: z.string().regex(dayRegex).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

type CheckoutRow = NonNullable<Awaited<ReturnType<typeof prisma.onlinePaymentCheckout.findFirst>>>;

function parseStatuses(raw: string | undefined): RentalOnlineCheckoutStatus[] | null {
  if (!raw) return null;
  const parts = raw
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  const invalid = parts.filter(part => !STATUSES.includes(part as RentalOnlineCheckoutStatus));
  if (parts.length === 0 || invalid.length > 0) {
    throw new AppError(t('Statut de paiement inconnu.'), 400, ErrorCode.VALIDATION_ERROR);
  }
  return parts as RentalOnlineCheckoutStatus[];
}

function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function nextDayStart(value: string): Date {
  return new Date(dayStart(value).getTime() + 24 * 60 * 60 * 1000);
}

/** Construit les lignes du suivi par lots (aucune requête par ligne). */
async function buildRows(tenantId: string, checkouts: CheckoutRow[]): Promise<RentalOnlinePaymentRowDto[]> {
  if (checkouts.length === 0) return [];
  const leaseIds = [...new Set(checkouts.map(row => row.leaseId))];
  const renterIds = [...new Set(checkouts.map(row => row.renterClientId))];
  const installmentIds = [...new Set(checkouts.flatMap(row => row.installmentIds))];
  const paymentIds = checkouts.map(row => row.paymentId);
  const resolverIds = [...new Set(checkouts.map(row => row.resolvedByUserId).filter((id): id is string => !!id))];

  const [leases, renters, installments, payments, resolvers] = await Promise.all([
    prisma.rentalLease.findMany({
      where: { id: { in: leaseIds }, tenant_id: tenantId },
      select: { id: true, lease_number: true, property: { select: { title: true } } }
    }),
    prisma.tenantClient.findMany({
      where: { id: { in: renterIds }, tenantId },
      select: { id: true, user: { select: { fullName: true } } }
    }),
    prisma.rentalInstallment.findMany({
      where: { id: { in: installmentIds }, tenant_id: tenantId },
      select: {
        id: true,
        period_year: true,
        period_month: true,
        due_date: true,
        amount_rent: true,
        amount_service: true,
        amount_other_fees: true,
        penalty_amount: true
      }
    }),
    prisma.rentalPayment.findMany({
      where: { id: { in: paymentIds }, tenant_id: tenantId },
      select: { id: true, status: true }
    }),
    resolverIds.length > 0
      ? prisma.user.findMany({ where: { id: { in: resolverIds } }, select: { id: true, fullName: true } })
      : Promise.resolve([] as Array<{ id: string; fullName: string | null }>)
  ]);

  const leaseById = new Map(leases.map(row => [row.id, row]));
  const renterById = new Map(renters.map(row => [row.id, row]));
  const installmentById = new Map(installments.map(row => [row.id, row]));
  const paymentById = new Map(payments.map(row => [row.id, row]));
  const resolverById = new Map(resolvers.map(row => [row.id, row]));

  return checkouts.map(row => {
    const lease = leaseById.get(row.leaseId);
    const renter = renterById.get(row.renterClientId);
    return {
      id: row.id,
      codePaiement: row.codePaiement,
      status: row.status as RentalOnlineCheckoutStatus,
      origin: row.secureLinkId ? ('SECURE_LINK' as const) : ('PORTAL' as const),
      mode: row.mode,
      amount: Number(row.amount),
      receivedAmount: row.receivedAmount === null ? null : Number(row.receivedAmount),
      currency: row.currency,
      leaseId: row.leaseId,
      leaseReference: lease?.lease_number ?? null,
      propertyLabel: lease?.property?.title ?? null,
      renter: renter ? { clientId: renter.id, name: renter.user?.fullName ?? '' } : null,
      installments: row.installmentIds
        .map(id => installmentById.get(id))
        .filter((inst): inst is NonNullable<typeof inst> => !!inst)
        .map(inst => ({
          id: inst.id,
          periodYear: inst.period_year,
          periodMonth: inst.period_month,
          dueDate: inst.due_date.toISOString(),
          amountDue:
            Number(inst.amount_rent) +
            Number(inst.amount_service) +
            Number(inst.amount_other_fees) +
            Number(inst.penalty_amount ?? 0)
        })),
      providerServiceName: row.providerServiceName,
      providerTransactionId: row.providerTransactionId,
      providerFees: row.providerFees === null ? null : Number(row.providerFees),
      failureMessage: row.failureMessage,
      reviewKind: (row.reviewKind as RentalOnlineReviewKind | null) ?? null,
      reviewReason: row.reviewReason,
      resolution: row.resolution ?? null,
      resolutionNote: row.resolutionNote,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      resolvedByName: row.resolvedByUserId ? (resolverById.get(row.resolvedByUserId)?.fullName ?? null) : null,
      paymentId: row.paymentId,
      collected: paymentById.get(row.paymentId)?.status === RentalPaymentStatus.SUCCESS,
      lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null
    };
  });
}

/** Une ligne du suivi (utilisée par la décision) ; 404 si absente ou d'une autre agence. */
export async function getOnlinePaymentRow(tenantId: string, checkoutId: string): Promise<RentalOnlinePaymentRowDto> {
  const checkout = await prisma.onlinePaymentCheckout.findFirst({ where: { id: checkoutId, tenantId } });
  if (!checkout) throw new NotFoundError(t('Paiement en ligne introuvable.'));
  const [row] = await buildRows(tenantId, [checkout]);
  return row;
}

export async function listOnlinePayments(
  tenantId: string,
  rawQuery: unknown
): Promise<RentalOnlinePaginated<RentalOnlinePaymentRowDto>> {
  const query = listQuerySchema.parse(rawQuery ?? {});
  const statuses = parseStatuses(query.status);
  if (query.from && query.to && query.from > query.to) {
    throw new AppError(t('La date de début doit précéder la date de fin.'), 400, ErrorCode.VALIDATION_ERROR);
  }

  if (query.leaseId) {
    const lease = await prisma.rentalLease.findFirst({
      where: { id: query.leaseId, tenant_id: tenantId },
      select: { id: true }
    });
    if (!lease) throw new NotFoundError(t('Bail introuvable.'));
  }

  const and: Prisma.OnlinePaymentCheckoutWhereInput[] = [];
  if (statuses) and.push({ status: { in: statuses } });
  if (query.reviewKind) and.push({ reviewKind: query.reviewKind });
  if (query.leaseId) and.push({ leaseId: query.leaseId });
  if (query.from || query.to) {
    and.push({
      createdAt: {
        ...(query.from ? { gte: dayStart(query.from) } : {}),
        ...(query.to ? { lt: nextDayStart(query.to) } : {})
      }
    });
  }
  if (query.search) {
    const term = query.search;
    const [leases, renters] = await Promise.all([
      prisma.rentalLease.findMany({
        where: { tenant_id: tenantId, lease_number: { contains: term, mode: 'insensitive' } },
        select: { id: true },
        take: 200
      }),
      prisma.tenantClient.findMany({
        where: { tenantId, user: { fullName: { contains: term, mode: 'insensitive' } } },
        select: { id: true },
        take: 200
      })
    ]);
    and.push({
      OR: [
        { codePaiement: { contains: term, mode: 'insensitive' } },
        { providerTransactionId: { contains: term, mode: 'insensitive' } },
        ...(leases.length > 0 ? [{ leaseId: { in: leases.map(row => row.id) } }] : []),
        ...(renters.length > 0 ? [{ renterClientId: { in: renters.map(row => row.id) } }] : [])
      ]
    });
  }
  const where: Prisma.OnlinePaymentCheckoutWhereInput = { tenantId, ...(and.length > 0 ? { AND: and } : {}) };

  const [total, rows] = await Promise.all([
    prisma.onlinePaymentCheckout.count({ where }),
    prisma.onlinePaymentCheckout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    })
  ]);
  return { items: await buildRows(tenantId, rows), total, page: query.page, pageSize: query.pageSize };
}

export async function getOnlinePaymentsSummary(tenantId: string): Promise<RentalOnlinePaymentsSummaryDto> {
  const [byStatus, byKind, oldest] = await Promise.all([
    prisma.onlinePaymentCheckout.groupBy({ by: ['status'], where: { tenantId }, _count: { _all: true } }),
    prisma.onlinePaymentCheckout.groupBy({
      by: ['reviewKind'],
      where: { tenantId, status: 'REVIEW' },
      _count: { _all: true }
    }),
    prisma.onlinePaymentCheckout.aggregate({ where: { tenantId, status: 'REVIEW' }, _min: { createdAt: true } })
  ]);

  const counts = Object.fromEntries(STATUSES.map(status => [status, 0])) as Record<RentalOnlineCheckoutStatus, number>;
  for (const row of byStatus) counts[row.status as RentalOnlineCheckoutStatus] = row._count._all;
  const reviewByKind = Object.fromEntries(REVIEW_KINDS.map(kind => [kind, 0])) as Record<
    RentalOnlineReviewKind,
    number
  >;
  for (const row of byKind) {
    if (row.reviewKind) reviewByKind[row.reviewKind as RentalOnlineReviewKind] = row._count._all;
  }
  return {
    counts,
    reviewPending: counts.REVIEW,
    reviewByKind,
    oldestReviewAt: oldest._min.createdAt ? oldest._min.createdAt.toISOString() : null
  };
}

function logKindFor(actionKey: string): RentalOnlinePaymentLogEntryDto['kind'] {
  if (actionKey.endsWith('_RESOLVED')) return 'RESOLVED';
  if (actionKey.endsWith('_REVIEW')) return 'REVIEW';
  if (actionKey.includes('IPN')) return 'IPN';
  return 'STATUS_CHANGED';
}

async function buildLog(tenantId: string, checkout: CheckoutRow): Promise<RentalOnlinePaymentLogEntryDto[]> {
  const audits = await prisma.auditLog.findMany({
    where: { tenantId, entityType: 'OnlinePaymentCheckout', entityId: checkout.id },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, actionKey: true, actorLabel: true, actorUserId: true, payload: true }
  });

  const entries: RentalOnlinePaymentLogEntryDto[] = [
    {
      at: checkout.createdAt.toISOString(),
      kind: 'CREATED',
      status: 'PENDING',
      providerState: null,
      message: t('Paiement en ligne démarré.'),
      actorName: null
    }
  ];
  for (const audit of audits) {
    const payload = (audit.payload ?? {}) as Record<string, unknown>;
    const kind = logKindFor(audit.actionKey);
    entries.push({
      at: audit.createdAt.toISOString(),
      kind,
      status: null,
      providerState: null,
      message:
        kind === 'RESOLVED'
          ? t('Décision du gestionnaire : {{decision}}.', { decision: String(payload.decision ?? '') })
          : kind === 'REVIEW'
            ? t('Paiement mis en vérification.')
            : t('Changement de statut.'),
      actorName: audit.actorUserId ? (audit.actorLabel ?? null) : null
    });
  }
  if (checkout.lastCheckedAt) {
    entries.push({
      at: checkout.lastCheckedAt.toISOString(),
      kind: 'PROVIDER_CHECK',
      status: checkout.status as RentalOnlineCheckoutStatus,
      providerState: checkout.lastProviderState,
      message: t('Dernière vérification auprès de PaySecureHub ({{count}} au total).', {
        count: String(checkout.checkAttempts)
      }),
      actorName: null
    });
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

export async function getOnlinePaymentDetail(
  tenantId: string,
  checkoutId: string
): Promise<RentalOnlinePaymentDetailDto> {
  const checkout = await prisma.onlinePaymentCheckout.findFirst({ where: { id: checkoutId, tenantId } });
  if (!checkout) throw new NotFoundError(t('Paiement en ligne introuvable.'));
  const [[row], log, payment] = await Promise.all([
    buildRows(tenantId, [checkout]),
    buildLog(tenantId, checkout),
    prisma.rentalPayment.findFirst({
      where: { id: checkout.paymentId, tenant_id: tenantId },
      select: { id: true, status: true, amount: true, succeeded_at: true }
    })
  ]);
  if (!payment) throw new NotFoundError(t('Paiement introuvable'));
  const unallocated =
    payment.status === RentalPaymentStatus.SUCCESS
      ? await prisma.$transaction(tx => montantDisponibleTx(tx, tenantId, payment))
      : 0;
  return {
    ...row,
    checkAttempts: checkout.checkAttempts,
    lastProviderState: checkout.lastProviderState,
    log,
    payment: {
      id: payment.id,
      status: payment.status,
      amount: Number(payment.amount),
      paidAt: payment.succeeded_at ? payment.succeeded_at.toISOString() : null,
      receiptNumber: null,
      unallocatedAmount: Math.max(0, unallocated)
    }
  };
}

/**
 * Vérification manuelle (contrat 049 §2.4). N'encaisse jamais une tentative en REVIEW. Accepte
 * `PENDING`, `REVIEW` et `EXPIRED` (relecture d'un succès tardif).
 */
export async function verifyOnlinePayment(tenantId: string, checkoutId: string): Promise<VerifyOnlinePaymentResultDto> {
  const before = await prisma.onlinePaymentCheckout.findFirst({ where: { id: checkoutId, tenantId } });
  if (!before) throw new NotFoundError(t('Paiement en ligne introuvable.'));
  if (before.status !== 'PENDING' && before.status !== 'REVIEW' && before.status !== 'EXPIRED') {
    throw new AppError(t("Ce paiement n'est plus à vérifier."), 409, ErrorCode.CHECKOUT_NOT_VERIFIABLE);
  }

  let after: CheckoutRow;
  try {
    after = await reconcileCheckoutForVerify(tenantId, checkoutId);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 502) {
      throw new AppError(error.message, 502, ErrorCode.ONLINE_PAYMENT_PROVIDER_UNREACHABLE);
    }
    throw error;
  }

  const changed =
    after.status !== before.status ||
    String(after.receivedAmount ?? '') !== String(before.receivedAmount ?? '') ||
    after.reviewKind !== before.reviewKind;
  const [checkout] = await buildRows(tenantId, [after]);
  return { checkout, changed };
}
