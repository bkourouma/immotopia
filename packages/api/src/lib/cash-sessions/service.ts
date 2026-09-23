import { CashSessionStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { hasPermission } from '../../services/permission-service';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { postDocumentEntryTx } from '../finance/accounting';
import { formatCashVoucherNumber } from '../finance/cash';
import { roundMoney } from '../finance/money';
import { CASH_ACCOUNT, journalResolver } from '../owner-account/accounts';

/**
 * Caisse d'agence — lot 6.
 *
 * Une session par caissier : ouverte avec un fond de caisse, close par un
 * comptage, validée par un AUTRE que le caissier. Le montant attendu n'est
 * jamais saisi : il se déduit des opérations en espèces que le caissier a
 * enregistrées pendant la session, et se fige à la clôture.
 *
 * L'écart (compté − attendu) passe en comptabilité à la validation : un
 * manquant en charge (658), un excédent en produit (758), contre la caisse.
 */

/** Valeurs du billetage, en FCFA : billets puis pièces. */
export const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50, 25, 10, 5] as const;

const SHORTAGE_ACCOUNT = { number: '658', name: 'Charges diverses — écarts de caisse', type: 'EXPENSE' as const };
const SURPLUS_ACCOUNT = { number: '758', name: 'Produits divers — écarts de caisse', type: 'INCOME' as const };

const sessionNumber = (year: number, sequence: number) => `CAI-${year}-${String(sequence).padStart(4, '0')}`;

export interface ExpectedLine {
  kind: 'RENT_PAYMENT' | 'OWNER_PAYOUT' | 'CASH_VOUCHER';
  label: string;
  amount: number;
  at: string;
}

export interface Expected {
  receipts: number;
  disbursements: number;
  amount: number;
  lines: ExpectedLine[];
}

/** Total d'un billetage. Refuse une valeur inconnue ou un nombre qui n'est pas un entier positif. */
export function countDenominations(denominations: Record<string, number>): number {
  let total = 0;
  for (const [value, count] of Object.entries(denominations)) {
    if (!DENOMINATIONS.includes(Number(value) as (typeof DENOMINATIONS)[number])) {
      throw badRequest(`Valeur de billetage inconnue : ${value}`);
    }
    if (!Number.isInteger(count) || count < 0) throw badRequest('Un nombre de billets ou de pièces est invalide');
    total += Number(value) * count;
  }
  return total;
}

/**
 * Opérations en espèces d'un caissier sur une période : loyers encaissés,
 * reversements payés, pièces de caisse validées.
 */
export async function computeExpected(
  tenantId: string,
  cashierUserId: string,
  openingFloat: number,
  from: Date,
  to: Date
): Promise<Expected> {
  const [payments, payouts, vouchers] = await Promise.all([
    prisma.rentalPayment.findMany({
      where: {
        tenant_id: tenantId,
        method: 'CASH',
        status: 'SUCCESS',
        created_by_user_id: cashierUserId,
        created_at: { gte: from, lte: to }
      },
      select: { amount: true, created_at: true, lease: { select: { lease_number: true } } }
    }),
    prisma.ownerPayout.findMany({
      where: {
        tenantId,
        method: 'CASH',
        status: 'VALIDATED',
        createdByUserId: cashierUserId,
        createdAt: { gte: from, lte: to }
      },
      select: { amount: true, createdAt: true, year: true, sequence: true }
    }),
    prisma.cashVoucher.findMany({
      where: { tenantId, validatedByUserId: cashierUserId, validatedAt: { gte: from, lte: to } },
      select: {
        id: true,
        amount: true,
        validatedAt: true,
        voucherYear: true,
        voucherNumber: true,
        beneficiaryName: true
      }
    })
  ]);
  // Une pièce de caisse annulée n'a pas fait sortir d'argent.
  const voided = vouchers.length
    ? new Set(
        (
          await prisma.voidDocument.findMany({
            where: { tenantId, documentType: 'CASH_VOUCHER', documentId: { in: vouchers.map(v => v.id) } },
            select: { documentId: true }
          })
        ).map(v => v.documentId)
      )
    : new Set<string>();

  const lines: ExpectedLine[] = [
    ...payments.map(p => ({
      kind: 'RENT_PAYMENT' as const,
      label: p.lease ? `Loyer — ${p.lease.lease_number}` : 'Encaissement',
      amount: roundMoney(Number(p.amount)),
      at: p.created_at.toISOString()
    })),
    ...payouts.map(p => ({
      kind: 'OWNER_PAYOUT' as const,
      label: `Reversement REV-${p.year}-${String(p.sequence).padStart(4, '0')}`,
      amount: -roundMoney(Number(p.amount)),
      at: p.createdAt.toISOString()
    })),
    ...vouchers
      .filter(v => !voided.has(v.id))
      .map(v => ({
        kind: 'CASH_VOUCHER' as const,
        label: `Pièce de caisse PC-${formatCashVoucherNumber(v.voucherYear, v.voucherNumber) ?? ''} — ${v.beneficiaryName}`,
        amount: -roundMoney(Number(v.amount)),
        at: (v.validatedAt as Date).toISOString()
      }))
  ].sort((a, b) => a.at.localeCompare(b.at));

  const receipts = roundMoney(lines.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const disbursements = roundMoney(-lines.filter(l => l.amount < 0).reduce((s, l) => s + l.amount, 0));
  return { receipts, disbursements, amount: roundMoney(openingFloat + receipts - disbursements), lines };
}

type SessionRow = Prisma.CashSessionGetPayload<Record<string, never>>;

async function names(ids: Array<string | null>) {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (!unique.length) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullName: true, email: true }
  });
  return new Map(users.map(u => [u.id, u.fullName || u.email]));
}

async function toDto(session: SessionRow, nameMap?: Map<string, string>) {
  const map = nameMap ?? (await names([session.cashierUserId, session.validatedByUserId]));
  const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));
  const expected: Expected =
    session.status === CashSessionStatus.OPEN
      ? await computeExpected(
          session.tenantId,
          session.cashierUserId,
          Number(session.openingFloat),
          session.openedAt,
          new Date()
        )
      : (session.expectedBreakdown as unknown as Expected);
  return {
    id: session.id,
    number: sessionNumber(session.year, session.sequence),
    cashierUserId: session.cashierUserId,
    cashierName: map.get(session.cashierUserId) ?? '',
    status: session.status,
    openedAt: session.openedAt.toISOString(),
    openingFloat: Number(session.openingFloat),
    openingNote: session.openingNote,
    closedAt: session.closedAt ? session.closedAt.toISOString() : null,
    expected,
    countedAmount: num(session.countedAmount),
    denominations: (session.denominations as Record<string, number> | null) ?? null,
    difference: num(session.difference),
    differenceReason: session.differenceReason,
    validatedAt: session.validatedAt ? session.validatedAt.toISOString() : null,
    validatedByName: session.validatedByUserId ? (map.get(session.validatedByUserId) ?? null) : null,
    validationComment: session.validationComment
  };
}

// ---------------------------------------------------------------------------

export async function getCurrentSession(tenantId: string, userId: string) {
  const session = await prisma.cashSession.findFirst({
    where: { tenantId, cashierUserId: userId, status: CashSessionStatus.OPEN }
  });
  return session ? toDto(session) : null;
}

const openSchema = z.object({
  openingFloat: z.coerce.number().min(0),
  openingNote: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform(v => v || null)
});

export async function openSession(tenantId: string, userId: string, body: unknown) {
  const input = openSchema.parse(body);
  const already = await prisma.cashSession.findFirst({
    where: { tenantId, cashierUserId: userId, status: CashSessionStatus.OPEN },
    select: { id: true }
  });
  if (already) throw conflict('Vous avez déjà une caisse ouverte.');

  const now = new Date();
  const year = now.getUTCFullYear();
  const session = await prisma.$transaction(async tx => {
    const last = await tx.cashSession.findFirst({
      where: { tenantId, year },
      orderBy: { sequence: 'desc' },
      select: { sequence: true }
    });
    return tx.cashSession.create({
      data: {
        tenantId,
        year,
        sequence: (last?.sequence ?? 0) + 1,
        cashierUserId: userId,
        openedAt: now,
        openingFloat: new Prisma.Decimal(roundMoney(input.openingFloat)),
        openingNote: input.openingNote
      }
    });
  });
  return toDto(session);
}

const closeSchema = z.object({
  countedAmount: z.coerce.number().min(0).nullish(),
  denominations: z.record(z.string(), z.coerce.number()).nullish(),
  differenceReason: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform(v => v || null)
});

export async function closeSession(tenantId: string, userId: string, sessionId: string, body: unknown) {
  const input = closeSchema.parse(body);
  const session = await prisma.cashSession.findFirst({ where: { id: sessionId, tenantId } });
  if (!session) throw notFound('Session de caisse introuvable');
  if (session.cashierUserId !== userId) throw forbidden('Seul le caissier peut clôturer sa caisse.');
  if (session.status !== CashSessionStatus.OPEN) throw conflict('Cette caisse est déjà clôturée.');

  let counted: number;
  if (input.denominations && Object.keys(input.denominations).length) {
    counted = countDenominations(input.denominations);
    if (
      input.countedAmount !== null &&
      input.countedAmount !== undefined &&
      roundMoney(input.countedAmount) !== counted
    ) {
      throw badRequest('Le total saisi ne correspond pas au billetage.');
    }
  } else if (input.countedAmount !== null && input.countedAmount !== undefined) {
    counted = roundMoney(input.countedAmount);
  } else {
    throw badRequest('Indiquez le montant compté, ou le billetage.');
  }

  const closedAt = new Date();
  const expected = await computeExpected(tenantId, userId, Number(session.openingFloat), session.openedAt, closedAt);
  const difference = roundMoney(counted - expected.amount);
  if (difference !== 0 && (!input.differenceReason || input.differenceReason.length < 3)) {
    throw badRequest(`Expliquez l'écart de caisse (${difference.toLocaleString('fr-FR')} FCFA).`);
  }

  const updated = await prisma.cashSession.update({
    where: { id: session.id },
    data: {
      status: CashSessionStatus.CLOSED,
      closedAt,
      expectedBreakdown: expected as unknown as Prisma.InputJsonValue,
      expectedAmount: new Prisma.Decimal(expected.amount),
      countedAmount: new Prisma.Decimal(counted),
      denominations: input.denominations ? (input.denominations as Prisma.InputJsonValue) : Prisma.DbNull,
      difference: new Prisma.Decimal(difference),
      differenceReason: difference === 0 ? null : input.differenceReason
    }
  });
  return toDto(updated);
}

async function accountIdTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  spec: { number: string; name: string; type: 'ASSET' | 'EXPENSE' | 'INCOME' }
) {
  const existing = await tx.chartOfAccount.findFirst({
    where: { tenantId, scope: 'OPERATIONS', accountNumber: spec.number },
    select: { id: true }
  });
  if (existing) return existing.id;
  const created = await tx.chartOfAccount.create({
    data: {
      tenantId,
      syndicateId: null,
      scope: 'OPERATIONS',
      accountNumber: spec.number,
      accountName: spec.name,
      accountClass: Number(spec.number[0]),
      accountType: spec.type
    },
    select: { id: true }
  });
  return created.id;
}

const validateSchema = z.object({
  comment: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform(v => v || null)
});

export async function validateSession(tenantId: string, userId: string, sessionId: string, body: unknown) {
  const input = validateSchema.parse(body);
  const session = await prisma.cashSession.findFirst({ where: { id: sessionId, tenantId } });
  if (!session) throw notFound('Session de caisse introuvable');
  if (session.status !== CashSessionStatus.CLOSED) throw conflict('Seule une caisse clôturée peut être validée.');
  if (session.cashierUserId === userId) throw forbidden('Un caissier ne valide pas sa propre caisse.');

  const now = new Date();
  const difference = Number(session.difference ?? 0);
  const number = sessionNumber(session.year, session.sequence);

  const updated = await prisma.$transaction(async tx => {
    if (difference !== 0) {
      const cash = await accountIdTx(tx, tenantId, { number: CASH_ACCOUNT, name: 'Caisse', type: 'ASSET' });
      const counterpart = await accountIdTx(tx, tenantId, difference < 0 ? SHORTAGE_ACCOUNT : SURPLUS_ACCOUNT);
      const value = Math.abs(difference);
      const label = difference < 0 ? `Manquant de caisse ${number}` : `Excédent de caisse ${number}`;
      await postDocumentEntryTx(tx, {
        tenantId,
        journalId: await journalResolver(tx, tenantId)(session.closedAt ?? now, 'CASH'),
        entryDate: session.closedAt ?? now,
        reference: number,
        description: `${label} — ${session.differenceReason ?? ''}`.trim(),
        documentType: 'CASH_SESSION_DIFFERENCE',
        documentId: session.id,
        lines:
          difference < 0
            ? [
                { accountId: counterpart, debit: value, label },
                { accountId: cash, credit: value, label }
              ]
            : [
                { accountId: cash, debit: value, label },
                { accountId: counterpart, credit: value, label }
              ]
      });
    }
    return tx.cashSession.update({
      where: { id: session.id },
      data: {
        status: CashSessionStatus.VALIDATED,
        validatedAt: now,
        validatedByUserId: userId,
        validationComment: input.comment
      }
    });
  });
  return toDto(updated);
}

export async function listSessions(tenantId: string, filters: { status?: unknown; cashierUserId?: unknown }) {
  const status =
    typeof filters.status === 'string' && (Object.values(CashSessionStatus) as string[]).includes(filters.status)
      ? (filters.status as CashSessionStatus)
      : undefined;
  const cashierUserId =
    typeof filters.cashierUserId === 'string' && filters.cashierUserId ? filters.cashierUserId : undefined;
  const sessions = await prisma.cashSession.findMany({
    where: { tenantId, ...(status ? { status } : {}), ...(cashierUserId ? { cashierUserId } : {}) },
    orderBy: [{ openedAt: 'desc' }],
    take: 200
  });
  const map = await names(sessions.flatMap(s => [s.cashierUserId, s.validatedByUserId]));
  return Promise.all(sessions.map(s => toDto(s, map)));
}

export async function getSession(tenantId: string, userId: string, sessionId: string) {
  const session = await prisma.cashSession.findFirst({ where: { id: sessionId, tenantId } });
  if (!session) throw notFound('Session de caisse introuvable');
  if (session.cashierUserId !== userId && !(await hasPermission(userId, 'FINANCE_ACCOUNTS_READ', tenantId))) {
    throw forbidden('Accès refusé à cette caisse.');
  }
  return toDto(session);
}
