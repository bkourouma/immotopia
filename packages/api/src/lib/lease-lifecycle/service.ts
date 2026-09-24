import { LeaseEventType, Prisma, RentalInstallmentStatus, RentalLeaseStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { logAuditEvent } from '../../services/audit-service';
import { badRequest, conflict, notFound } from '../errors';
import { roundMoney } from '../finance/money';
import { buildInstallmentForPeriod } from '../finance/installment-builder';
import { appendThirdPartyMovementTx } from '../finance/ledger';
import {
  annulerPieceTx,
  compteLocataireDuBailTx,
  recalculateInstallmentStatuses
} from '../../services/rental-installment-service';

/**
 * Vie d'un bail : révision du loyer, renouvellement, avenant, résiliation, et
 * solde de tout compte — lot 5 de la gestion locative.
 *
 * **Règle centrale : une échéance déjà RÉGLÉE, même en partie, ne se touche
 * pas.** Dans ce produit, toutes les échéances d'un bail sont facturées au
 * compte du locataire dès leur génération, jusqu'à la fin du bail. Réviser un
 * loyer recalcule donc les échéances non réglées de la période et inscrit
 * l'écart au compte du locataire (`ADJUSTMENT`, origine `LEASE_REVISION`) ;
 * résilier annule les échéances non réglées postérieures à la fin, avec leur
 * contre-passation. Une échéance réglée n'est jamais réécrite : la révision la
 * refuse, la résiliation la compte, pour un avoir à faire à la main.
 *
 * Avant ce lot, modifier le loyer d'un bail ne changeait que le bail : les
 * échéances déjà générées gardaient l'ancien montant, sans que rien le dise.
 */

const month = z.string().regex(/^\d{4}-\d{2}$/, 'Mois attendu au format AAAA-MM');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');
const money = z.coerce.number().nonnegative();
const optionalText = z
  .string()
  .trim()
  .max(4000)
  .nullish()
  .transform(v => v || null);

/** Midi UTC : la date reste la même dans tous les fuseaux où on la relit. */
function parseDay(value: string, label: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  if (date.getUTCDate() !== d) throw badRequest(`${label} n'existe pas`);
  return date;
}

/** Index de période comparable : année × 12 + mois. */
const periodIndex = (year: number, monthNumber: number) => year * 12 + monthNumber;

/** Filtre Prisma « période ≥ (année, mois) ». */
function periodFrom(year: number, monthNumber: number): Prisma.RentalInstallmentWhereInput {
  return { OR: [{ period_year: { gt: year } }, { period_year: year, period_month: { gte: monthNumber } }] };
}

async function loadLease(tenantId: string, leaseId: string) {
  const lease = await prisma.rentalLease.findFirst({ where: { id: leaseId, tenant_id: tenantId } });
  if (!lease) throw notFound('Bail introuvable');
  return lease;
}

async function isTerminated(leaseId: string) {
  return (await prisma.leaseEvent.count({ where: { leaseId, type: LeaseEventType.TERMINATION } })) > 0;
}

type EventRow = Prisma.LeaseEventGetPayload<Record<string, never>>;
const num = (value: Prisma.Decimal | null) => (value === null ? null : Number(value));
const iso = (value: Date | null) => (value ? value.toISOString() : null);

function toDto(event: EventRow, names: Map<string, string>) {
  return {
    id: event.id,
    type: event.type,
    effectiveDate: event.effectiveDate.toISOString(),
    previousRent: num(event.previousRent),
    newRent: num(event.newRent),
    previousCharges: num(event.previousCharges),
    newCharges: num(event.newCharges),
    revisionRate: num(event.revisionRate),
    previousEndDate: iso(event.previousEndDate),
    newEndDate: iso(event.newEndDate),
    noticeDate: iso(event.noticeDate),
    initiatedBy: event.initiatedBy,
    moveOutDate: iso(event.moveOutDate),
    summary: event.summary,
    details: (event.details as Record<string, number> | null) ?? null,
    createdAt: event.createdAt.toISOString(),
    createdByName: event.createdByUserId ? (names.get(event.createdByUserId) ?? null) : null
  };
}

async function namesOf(ids: Array<string | null>) {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (!unique.length) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullName: true, email: true }
  });
  return new Map(users.map(u => [u.id, u.fullName || u.email]));
}

async function eventDto(event: EventRow) {
  return toDto(event, await namesOf([event.createdByUserId]));
}

function audit(
  actorUserId: string | undefined,
  tenantId: string,
  leaseId: string,
  actionKey: string,
  payload: unknown
) {
  logAuditEvent({
    actorUserId: actorUserId ?? null,
    tenantId,
    actionKey,
    entityType: 'RENTAL_LEASE',
    entityId: leaseId,
    payload: payload as Record<string, unknown>
  } as any);
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function getLeaseEvents(tenantId: string, leaseId: string) {
  const lease = await loadLease(tenantId, leaseId);
  const events = await prisma.leaseEvent.findMany({
    where: { tenantId, leaseId },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }]
  });
  const names = await namesOf(events.map(e => e.createdByUserId));
  return {
    events: events.map(e => toDto(e, names)),
    lease: {
      status: lease.status,
      startDate: lease.start_date.toISOString(),
      endDate: iso(lease.end_date),
      rentAmount: Number(lease.rent_amount),
      serviceChargeAmount: Number(lease.service_charge_amount),
      moveOutDate: iso(lease.move_out_date),
      terminated: events.some(e => e.type === LeaseEventType.TERMINATION)
    }
  };
}

// ---------------------------------------------------------------------------
// Révision
// ---------------------------------------------------------------------------

const revisionSchema = z.object({
  effectiveMonth: month,
  newRent: z.coerce.number().positive(),
  newCharges: money.optional(),
  revisionRate: z.coerce.number().min(-100).max(1000).nullish(),
  summary: optionalText
});

/** Montant facturé d'une échéance, pénalités comprises. */
function installmentTotal(i: {
  amount_rent: Prisma.Decimal;
  amount_service: Prisma.Decimal;
  amount_other_fees: Prisma.Decimal;
  penalty_amount: Prisma.Decimal;
}) {
  return Number(i.amount_rent) + Number(i.amount_service) + Number(i.amount_other_fees) + Number(i.penalty_amount);
}

const UNPAID_STATUSES = [RentalInstallmentStatus.DRAFT, RentalInstallmentStatus.DUE, RentalInstallmentStatus.OVERDUE];

/** Filtre « réglée, même en partie ». */
const SETTLED: Prisma.RentalInstallmentWhereInput = {
  OR: [{ amount_paid: { gt: 0 } }, { status: { in: [RentalInstallmentStatus.PAID, RentalInstallmentStatus.PARTIAL] } }]
};

/**
 * Recalcule les échéances non réglées d'un bail à partir d'un mois, dans la
 * transaction de l'appelant. Une échéance déjà facturée voit son écart inscrit
 * au compte du locataire, une pièce par révision et par échéance.
 */
async function reprice(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    leaseId: string;
    eventId: string;
    from: { year: number; month: number };
    rent: number;
    charges: number;
  }
) {
  const { tenantId, leaseId, eventId, from, rent, charges } = params;
  const targets = await tx.rentalInstallment.findMany({
    where: {
      lease_id: leaseId,
      status: { in: UNPAID_STATUSES },
      amount_paid: 0,
      ...periodFrom(from.year, from.month)
    },
    select: {
      id: true,
      status: true,
      period_year: true,
      period_month: true,
      due_date: true,
      amount_rent: true,
      amount_service: true,
      amount_other_fees: true,
      penalty_amount: true
    }
  });
  if (!targets.length) return 0;

  const account = await compteLocataireDuBailTx(tx, tenantId, leaseId);
  for (const inst of targets) {
    const before = installmentTotal(inst);
    await tx.rentalInstallment.update({
      where: { id: inst.id },
      data: { amount_rent: new Prisma.Decimal(rent), amount_service: new Prisma.Decimal(charges) }
    });
    await tx.rentalInstallmentItem.updateMany({
      where: { installment_id: inst.id, charge_type: 'RENT' },
      data: { amount: new Prisma.Decimal(rent) }
    });
    await tx.rentalInstallmentItem.updateMany({
      where: { installment_id: inst.id, charge_type: 'SERVICE_CHARGE' },
      data: { amount: new Prisma.Decimal(charges) }
    });

    // Un brouillon n'a rien inscrit : rien à ajuster.
    if (inst.status === RentalInstallmentStatus.DRAFT || !account) continue;
    const diff = roundMoney(rent + charges + Number(inst.amount_other_fees) + Number(inst.penalty_amount) - before);
    if (diff === 0) continue;
    await appendThirdPartyMovementTx(tx, {
      tenantId,
      accountId: account.accountId,
      type: 'ADJUSTMENT',
      billed: diff > 0 ? diff : undefined,
      settled: diff < 0 ? -diff : undefined,
      label: `Révision du loyer — échéance ${String(inst.period_month).padStart(2, '0')}/${inst.period_year}`,
      sourceType: 'LEASE_REVISION',
      sourceId: `${inst.id}:${eventId}`,
      leaseId,
      movementDate: inst.due_date
    } as any);
  }
  return targets.length;
}

export async function reviseRent(tenantId: string, leaseId: string, body: unknown, actorUserId?: string) {
  const input = revisionSchema.parse(body);
  const lease = await loadLease(tenantId, leaseId);
  if (await isTerminated(leaseId)) throw conflict('Ce bail est résilié : son loyer ne se révise plus.');
  if (lease.status === RentalLeaseStatus.CANCELED) throw conflict('Ce bail est annulé.');

  const [year, monthNumber] = input.effectiveMonth.split('-').map(Number);
  const start = lease.start_date;
  if (periodIndex(year, monthNumber) < periodIndex(start.getUTCFullYear(), start.getUTCMonth() + 1)) {
    throw badRequest('Le mois d’effet précède le début du bail.');
  }

  // Une échéance réglée, même en partie, ne se réécrit pas.
  const settled = await prisma.rentalInstallment.count({
    where: {
      lease_id: leaseId,
      status: { not: RentalInstallmentStatus.CANCELED },
      AND: [SETTLED, periodFrom(year, monthNumber)]
    }
  });
  if (settled > 0) {
    throw conflict(
      'Des échéances de cette période sont déjà réglées, même en partie : choisissez un mois d’effet postérieur.'
    );
  }

  const newCharges = input.newCharges ?? Number(lease.service_charge_amount);
  const event = await prisma.$transaction(async tx => {
    await tx.rentalLease.update({
      where: { id: leaseId },
      data: { rent_amount: new Prisma.Decimal(input.newRent), service_charge_amount: new Prisma.Decimal(newCharges) }
    });
    const created = await tx.leaseEvent.create({
      data: {
        tenantId,
        leaseId,
        type: LeaseEventType.REVISION,
        effectiveDate: new Date(Date.UTC(year, monthNumber - 1, 1, 12)),
        previousRent: lease.rent_amount,
        newRent: new Prisma.Decimal(input.newRent),
        previousCharges: lease.service_charge_amount,
        newCharges: new Prisma.Decimal(newCharges),
        revisionRate:
          input.revisionRate === null || input.revisionRate === undefined
            ? null
            : new Prisma.Decimal(input.revisionRate),
        summary: input.summary,
        createdByUserId: actorUserId ?? null
      }
    });
    const updated = await reprice(tx, {
      tenantId,
      leaseId,
      eventId: created.id,
      from: { year, month: monthNumber },
      rent: input.newRent,
      charges: newCharges
    });
    return tx.leaseEvent.update({ where: { id: created.id }, data: { details: { installmentsUpdated: updated } } });
  });
  audit(actorUserId, tenantId, leaseId, 'RENTAL_LEASE_RENT_REVISED', input);
  return eventDto(event);
}

// ---------------------------------------------------------------------------
// Renouvellement
// ---------------------------------------------------------------------------

const renewalSchema = z.object({
  newEndDate: day,
  newRent: z.coerce.number().positive().optional(),
  newCharges: money.optional(),
  summary: optionalText
});

export async function renewLease(tenantId: string, leaseId: string, body: unknown, actorUserId?: string) {
  const input = renewalSchema.parse(body);
  const lease = await loadLease(tenantId, leaseId);
  if (await isTerminated(leaseId)) throw conflict('Ce bail est résilié : il ne se renouvelle plus.');
  if (lease.status === RentalLeaseStatus.CANCELED) throw conflict('Ce bail est annulé.');
  if (!lease.end_date) {
    throw badRequest('Ce bail est à durée indéterminée : il n’a pas de fin à repousser.');
  }

  const newEnd = parseDay(input.newEndDate, 'La nouvelle date de fin');
  if (newEnd.getTime() <= lease.end_date.getTime()) {
    throw badRequest('La nouvelle date de fin doit être postérieure à la fin actuelle du bail.');
  }

  // Le nouveau loyer vaut à partir du premier mois qui suit l'ancienne fin.
  const oldEnd = lease.end_date;
  const firstNew = { year: oldEnd.getUTCFullYear(), month: oldEnd.getUTCMonth() + 2 };
  if (firstNew.month > 12) {
    firstNew.month -= 12;
    firstNew.year += 1;
  }
  const rent = input.newRent ?? Number(lease.rent_amount);
  const charges = input.newCharges ?? Number(lease.service_charge_amount);
  const priceChanges = rent !== Number(lease.rent_amount) || charges !== Number(lease.service_charge_amount);

  const result = await prisma.$transaction(async tx => {
    const updatedLease = await tx.rentalLease.update({
      where: { id: leaseId },
      data: {
        end_date: newEnd,
        status: lease.status === RentalLeaseStatus.ENDED ? RentalLeaseStatus.ACTIVE : undefined,
        rent_amount: new Prisma.Decimal(rent),
        service_charge_amount: new Prisma.Decimal(charges)
      }
    });

    // Échéances de la nouvelle période, au loyer en vigueur, sans doublon.
    let created = 0;
    let cursor = { ...firstNew };
    const last = periodIndex(newEnd.getUTCFullYear(), newEnd.getUTCMonth() + 1);
    while (periodIndex(cursor.year, cursor.month) <= last) {
      const built = buildInstallmentForPeriod(updatedLease, cursor.year, cursor.month);
      if (built.included) {
        const exists = await tx.rentalInstallment.findUnique({
          where: {
            lease_id_period_year_period_month: {
              lease_id: leaseId,
              period_year: cursor.year,
              period_month: cursor.month
            }
          },
          select: { id: true }
        });
        if (!exists) {
          await tx.rentalInstallment.create({ data: built.data });
          created += 1;
        }
      }
      cursor =
        cursor.month === 12 ? { year: cursor.year + 1, month: 1 } : { year: cursor.year, month: cursor.month + 1 };
    }

    const renewal = await tx.leaseEvent.create({
      data: {
        tenantId,
        leaseId,
        type: LeaseEventType.RENEWAL,
        effectiveDate: new Date(Date.UTC(firstNew.year, firstNew.month - 1, 1, 12)),
        previousEndDate: oldEnd,
        newEndDate: newEnd,
        previousRent: lease.rent_amount,
        newRent: new Prisma.Decimal(rent),
        previousCharges: lease.service_charge_amount,
        newCharges: new Prisma.Decimal(charges),
        summary: input.summary,
        details: { installmentsCreated: created },
        createdByUserId: actorUserId ?? null
      }
    });

    // Un nouveau loyer au renouvellement est aussi une révision : on
    // l'inscrit comme telle, pour que l'histoire du loyer se lise d'un trait.
    const revision = priceChanges
      ? await tx.leaseEvent.create({
          data: {
            tenantId,
            leaseId,
            type: LeaseEventType.REVISION,
            effectiveDate: new Date(Date.UTC(firstNew.year, firstNew.month - 1, 1, 12)),
            previousRent: lease.rent_amount,
            newRent: new Prisma.Decimal(rent),
            previousCharges: lease.service_charge_amount,
            newCharges: new Prisma.Decimal(charges),
            summary: 'Nouveau loyer au renouvellement',
            details: { installmentsUpdated: 0 },
            createdByUserId: actorUserId ?? null
          }
        })
      : null;
    return { renewal, revision };
  });

  // Les nouvelles échéances suivent le sort des autres : leur statut est
  // recalculé, ce qui les inscrit au compte du locataire comme à la génération.
  await recalculateInstallmentStatuses(tenantId, leaseId);
  audit(actorUserId, tenantId, leaseId, 'RENTAL_LEASE_RENEWED', input);
  const names = await namesOf([actorUserId ?? null]);
  return {
    renewal: toDto(result.renewal, names),
    revision: result.revision ? toDto(result.revision, names) : null
  };
}

// ---------------------------------------------------------------------------
// Avenant
// ---------------------------------------------------------------------------

const amendmentSchema = z.object({
  effectiveDate: day,
  summary: z.string().trim().min(3, 'L’objet de l’avenant est requis').max(4000)
});

export async function recordAmendment(tenantId: string, leaseId: string, body: unknown, actorUserId?: string) {
  const input = amendmentSchema.parse(body);
  await loadLease(tenantId, leaseId);
  const event = await prisma.leaseEvent.create({
    data: {
      tenantId,
      leaseId,
      type: LeaseEventType.AMENDMENT,
      effectiveDate: parseDay(input.effectiveDate, 'La date d’effet'),
      summary: input.summary,
      createdByUserId: actorUserId ?? null
    }
  });
  audit(actorUserId, tenantId, leaseId, 'RENTAL_LEASE_AMENDED', input);
  return eventDto(event);
}

// ---------------------------------------------------------------------------
// Résiliation
// ---------------------------------------------------------------------------

const terminationSchema = z.object({
  noticeDate: day,
  effectiveDate: day,
  initiatedBy: z.enum(['TENANT', 'LANDLORD', 'MUTUAL']),
  moveOutDate: day.nullish(),
  summary: optionalText
});

export async function terminateLease(tenantId: string, leaseId: string, body: unknown, actorUserId?: string) {
  const input = terminationSchema.parse(body);
  const lease = await loadLease(tenantId, leaseId);
  if (await isTerminated(leaseId)) throw conflict('Ce bail est déjà résilié.');
  if (lease.status === RentalLeaseStatus.CANCELED) throw conflict('Ce bail est annulé.');

  const notice = parseDay(input.noticeDate, 'La date de préavis');
  const end = parseDay(input.effectiveDate, 'La date de fin');
  const moveOut = input.moveOutDate ? parseDay(input.moveOutDate, 'La date de sortie') : null;
  if (end.getTime() < lease.start_date.getTime()) throw badRequest('La date de fin précède le début du bail.');
  if (notice.getTime() > end.getTime()) throw badRequest('Le préavis ne peut pas être postérieur à la date de fin.');

  // Les périodes qui commencent après le mois de fin ne sont plus dues. Le
  // mois de fin lui-même reste dû en entier : pas de prorata au jour.
  const after = { year: end.getUTCFullYear(), month: end.getUTCMonth() + 2 };
  if (after.month > 12) {
    after.month -= 12;
    after.year += 1;
  }

  const event = await prisma.$transaction(async tx => {
    // Non réglées : annulées, et leur facturation contre-passée au compte du
    // locataire (ajustements de révision compris, voir `soldePieceTx`).
    const toCancel = await tx.rentalInstallment.findMany({
      where: {
        lease_id: leaseId,
        status: { in: UNPAID_STATUSES },
        amount_paid: 0,
        ...periodFrom(after.year, after.month)
      },
      select: { id: true, status: true, period_year: true, period_month: true }
    });
    const account = await compteLocataireDuBailTx(tx, tenantId, leaseId);
    for (const inst of toCancel) {
      if (inst.status !== RentalInstallmentStatus.DRAFT && account) {
        await annulerPieceTx(tx, {
          tenantId,
          accountId: account.accountId,
          sourceType: 'RENTAL_INSTALLMENT',
          sourceId: inst.id,
          label: `Résiliation du bail — échéance ${String(inst.period_month).padStart(2, '0')}/${inst.period_year} annulée`,
          leaseId,
          movementDate: end
        });
      }
    }
    if (toCancel.length) {
      await tx.rentalInstallment.updateMany({
        where: { id: { in: toCancel.map(inst => inst.id) } },
        data: { status: RentalInstallmentStatus.CANCELED }
      });
    }
    const canceled = { count: toCancel.length };

    // Réglées, même en partie, après la fin : un avoir à faire à la main.
    const billedAfterEnd = await tx.rentalInstallment.count({
      where: {
        lease_id: leaseId,
        status: { not: RentalInstallmentStatus.CANCELED },
        AND: [SETTLED, periodFrom(after.year, after.month)]
      }
    });

    const endedNow = end.getTime() <= Date.now();
    await tx.rentalLease.update({
      where: { id: leaseId },
      data: {
        end_date: end,
        move_out_date: moveOut ?? undefined,
        status: endedNow ? RentalLeaseStatus.ENDED : undefined
      }
    });

    return tx.leaseEvent.create({
      data: {
        tenantId,
        leaseId,
        type: LeaseEventType.TERMINATION,
        effectiveDate: end,
        previousEndDate: lease.end_date,
        newEndDate: end,
        noticeDate: notice,
        initiatedBy: input.initiatedBy,
        moveOutDate: moveOut,
        summary: input.summary,
        details: { installmentsCanceled: canceled.count, billedAfterEnd },
        createdByUserId: actorUserId ?? null
      }
    });
  });

  audit(actorUserId, tenantId, leaseId, 'RENTAL_LEASE_TERMINATED', input);
  return eventDto(event);
}

// ---------------------------------------------------------------------------
// Solde de tout compte
// ---------------------------------------------------------------------------

interface Deduction {
  label: string;
  amount: number;
}

export async function getFinalSettlement(tenantId: string, leaseId: string) {
  await loadLease(tenantId, leaseId);
  const [deposit, unpaid, exit] = await Promise.all([
    prisma.rentalSecurityDeposit.findFirst({ where: { tenant_id: tenantId, lease_id: leaseId } }),
    prisma.rentalInstallment.findMany({
      where: {
        tenant_id: tenantId,
        lease_id: leaseId,
        status: { in: [RentalInstallmentStatus.DUE, RentalInstallmentStatus.OVERDUE, RentalInstallmentStatus.PARTIAL] },
        // Un impayé est échu. Les échéances sont facturées dès leur génération :
        // sans cette borne, un solde établi avant la fin du bail compterait les
        // loyers des mois à venir comme des dettes.
        due_date: { lte: new Date() }
      },
      select: {
        amount_rent: true,
        amount_service: true,
        amount_other_fees: true,
        penalty_amount: true,
        amount_paid: true
      }
    }),
    prisma.leaseInspection.findFirst({
      where: { tenantId, leaseId, type: 'EXIT' },
      select: { status: true, deductions: true }
    })
  ]);

  // Détenu = encaissé − restitué − conservé : ce qui est encore entre les mains
  // de l'agence au titre du dépôt.
  const depositHeld = deposit
    ? roundMoney(Number(deposit.collected_amount) - Number(deposit.refunded_amount) - Number(deposit.forfeited_amount))
    : 0;
  const arrears = roundMoney(
    unpaid.reduce(
      (sum, i) =>
        sum +
        Math.max(
          0,
          Number(i.amount_rent) +
            Number(i.amount_service) +
            Number(i.amount_other_fees) +
            Number(i.penalty_amount) -
            Number(i.amount_paid)
        ),
      0
    )
  );
  const deductions: Deduction[] = Array.isArray(exit?.deductions)
    ? (exit!.deductions as unknown as Deduction[])
        .filter(d => d && typeof d.label === 'string')
        .map(d => ({ label: d.label, amount: roundMoney(Number(d.amount) || 0) }))
    : [];
  const deductionsTotal = roundMoney(deductions.reduce((sum, d) => sum + d.amount, 0));

  return {
    depositHeld,
    arrears,
    deductions,
    deductionsTotal,
    balanceToRefund: roundMoney(depositHeld - arrears - deductionsTotal),
    exitInspectionStatus: (exit?.status ?? 'NONE') as 'NONE' | 'DRAFT' | 'FINALIZED'
  };
}
