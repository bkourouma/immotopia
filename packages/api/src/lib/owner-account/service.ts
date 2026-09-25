import { z } from 'zod';
import { prisma } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { postDocumentEntryTx } from '../finance/accounting';
import { appendThirdPartyMovementTx } from '../finance/ledger';
import { roundMoney } from '../finance/money';
import { materializeManagementFees } from '../rental-fees/materialize';
import { getAgencyFinanceSettings } from '../settings/finance-settings';
import { assertTreasuryAccountUsableTx, resolveTreasuryAccountTx } from '../treasury/accounts';
import { ensureRentalAccountsTx, journalResolver } from './accounts';
import {
  getOrCreateOwnerAccountTx,
  listAgencyOwners,
  OWNER_SOURCE,
  reverseDocumentEntryTx,
  syncOwnerAccount
} from './sync';

/**
 * Compte courant des propriétaires et reversements — lot 3 de la gestion
 * locative.
 *
 * Convention d'API : `balance` est ce que l'agence DOIT au propriétaire. Le
 * compte de tiers, lui, garde le sens comptable du grand livre partagé (un
 * débit augmente le solde) : un loyer encaissé y est un crédit, ce qui rend
 * son solde négatif quand l'agence doit de l'argent. On l'inverse ici, une
 * fois, plutôt que de laisser chaque écran le faire.
 */

type Decimalish = { toString(): string } | number | null | undefined;
const amount = (value: Decimalish) => (value === null || value === undefined ? 0 : Number(value));
const due = (storedBalance: Decimalish) => roundMoney(-amount(storedBalance)) || 0;

function payoutNumber(year: number, sequence: number) {
  return `REV-${year}-${String(sequence).padStart(4, '0')}`;
}

async function userNames(ids: Array<string | null>) {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullName: true, email: true }
  });
  return new Map(users.map(u => [u.id, u.fullName || u.email]));
}

function toPayoutDto(
  payout: {
    id: string;
    year: number;
    sequence: number;
    amount: Decimalish;
    paidAt: Date;
    method: string;
    treasuryAccountId?: string | null;
    reference: string | null;
    notes: string | null;
    statementId: string | null;
    status: string;
    voidReason: string | null;
    voidedAt: Date | null;
    createdAt: Date;
    createdByUserId: string | null;
  },
  names: Map<string, string>
) {
  return {
    id: payout.id,
    number: payoutNumber(payout.year, payout.sequence),
    amount: amount(payout.amount),
    paidAt: payout.paidAt.toISOString(),
    method: payout.method,
    treasuryAccountId: payout.treasuryAccountId ?? null,
    reference: payout.reference,
    notes: payout.notes,
    statementId: payout.statementId,
    status: payout.status,
    voidReason: payout.voidReason,
    voidedAt: payout.voidedAt ? payout.voidedAt.toISOString() : null,
    createdAt: payout.createdAt.toISOString(),
    createdByName: payout.createdByUserId ? (names.get(payout.createdByUserId) ?? null) : null
  };
}

/** Pour les totaux, une contre-passation compte au débit de sa nature d'origine. */
const TOTAL_BY_SOURCE: Record<string, 'rentCollected' | 'fees' | 'vat' | 'expenses' | 'payouts'> = {
  [OWNER_SOURCE.RENT]: 'rentCollected',
  [OWNER_SOURCE.FEE]: 'fees',
  [OWNER_SOURCE.FEE_VAT]: 'vat',
  [OWNER_SOURCE.EXPENSE]: 'expenses',
  [OWNER_SOURCE.PAYOUT]: 'payouts'
};

async function buildAccountDetail(tenantId: string, ownerClientId: string) {
  const owner = await prisma.tenantClient.findFirst({
    where: { id: ownerClientId, tenantId },
    select: { id: true, user: { select: { fullName: true, email: true } } }
  });
  if (!owner) throw notFound('Proprietaire introuvable');

  const account = await prisma.thirdPartyAccount.findUnique({
    where: { tenantId_kind_tenantClientId: { tenantId, kind: 'OWNER', tenantClientId: ownerClientId } },
    select: { id: true, balance: true }
  });
  const [movements, payouts] = await Promise.all([
    account
      ? prisma.thirdPartyMovement.findMany({
          where: { accountId: account.id },
          orderBy: [{ movementDate: 'asc' }, { createdAt: 'asc' }]
        })
      : Promise.resolve([]),
    prisma.ownerPayout.findMany({
      where: { tenantId, ownerClientId },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }]
    })
  ]);

  const leaseIds = Array.from(new Set(movements.map(m => m.leaseId).filter((id): id is string => Boolean(id))));
  const leases = leaseIds.length
    ? await prisma.rentalLease.findMany({
        where: { tenant_id: tenantId, id: { in: leaseIds } },
        select: { id: true, lease_number: true, property: { select: { title: true } } }
      })
    : [];
  const leaseById = new Map(leases.map(l => [l.id, l]));

  // Solde recalculé dans l'ordre des dates : le solde stocké mouvement par
  // mouvement suit l'ordre d'inscription, qui peut différer (un loyer d'août
  // inscrit en septembre). Le total, lui, est le même.
  const totals = { rentCollected: 0, fees: 0, vat: 0, expenses: 0, payouts: 0 };
  let running = 0;
  const rows = movements.map(m => {
    const debit = amount(m.debit);
    const credit = amount(m.credit);
    running = roundMoney(running + credit - debit);
    const bucket = TOTAL_BY_SOURCE[m.sourceType];
    if (bucket) {
      // Un loyer se compte à son crédit ; tout le reste à son débit. Une
      // contre-passation, de sens inverse, vient en diminution.
      totals[bucket] += bucket === 'rentCollected' ? credit - debit : debit - credit;
    }
    const lease = m.leaseId ? leaseById.get(m.leaseId) : undefined;
    return {
      id: m.id,
      date: m.movementDate.toISOString(),
      type: m.type,
      label: m.label,
      debit,
      credit,
      balanceAfter: running,
      leaseNumber: lease?.lease_number ?? null,
      propertyTitle: lease?.property?.title ?? null
    };
  });

  const names = await userNames(payouts.map(p => p.createdByUserId));
  return {
    ownerClientId,
    ownerName: owner.user.fullName || owner.user.email || 'Propriétaire',
    email: owner.user.email ?? null,
    balance: account ? due(account.balance) : 0,
    totals: {
      rentCollected: roundMoney(totals.rentCollected),
      fees: roundMoney(totals.fees),
      vat: roundMoney(totals.vat),
      expenses: roundMoney(totals.expenses),
      payouts: roundMoney(totals.payouts)
    },
    movements: rows,
    payouts: payouts.map(p => toPayoutDto(p, names))
  };
}

export async function getOwnerAccount(tenantId: string, ownerClientId: string) {
  await syncOwnerAccount(tenantId, ownerClientId);
  return buildAccountDetail(tenantId, ownerClientId);
}

/**
 * Met à jour le compte de chaque propriétaire de l'agence, et par là leurs
 * écritures au grand livre. Les écritures de la gestion locative s'écrivent à
 * la consultation : tout ce qui lit le grand livre doit passer par ici avant.
 */
export async function syncAllOwnerAccounts(tenantId: string) {
  const owners = await listAgencyOwners(tenantId);
  // Les honoraires une seule fois pour toute l'agence, puis chaque compte.
  await materializeManagementFees(tenantId, { from: new Date(0), to: new Date() });
  for (const owner of owners) {
    await syncOwnerAccount(tenantId, owner.id, { skipFees: true });
  }
  return owners;
}

export async function listOwnerAccounts(tenantId: string) {
  const owners = await syncAllOwnerAccounts(tenantId);

  const [accounts, payouts] = await Promise.all([
    prisma.thirdPartyAccount.findMany({
      where: { tenantId, kind: 'OWNER' },
      select: {
        tenantClientId: true,
        balance: true,
        movements: { orderBy: { movementDate: 'desc' }, take: 1, select: { movementDate: true } }
      }
    }),
    prisma.ownerPayout.findMany({ where: { tenantId, status: 'VALIDATED' }, orderBy: { paidAt: 'desc' } })
  ]);
  const accountByOwner = new Map(accounts.map(a => [a.tenantClientId, a]));
  const lastPayoutByOwner = new Map<string, (typeof payouts)[number]>();
  for (const payout of payouts) {
    if (!lastPayoutByOwner.has(payout.ownerClientId)) lastPayoutByOwner.set(payout.ownerClientId, payout);
  }

  return owners.map(owner => {
    const account = accountByOwner.get(owner.id);
    const last = lastPayoutByOwner.get(owner.id);
    return {
      ownerClientId: owner.id,
      ownerName: owner.user.fullName || owner.user.email || 'Propriétaire',
      email: owner.user.email ?? null,
      balance: account ? due(account.balance) : 0,
      lastMovementAt: account?.movements[0]?.movementDate.toISOString() ?? null,
      lastPayout: last
        ? {
            number: payoutNumber(last.year, last.sequence),
            amount: amount(last.amount),
            paidAt: last.paidAt.toISOString()
          }
        : null
    };
  });
}

const payoutSchema = z.object({
  amount: z.coerce.number().positive(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'OTHER']),
  // Lot 10 : le compte de trésorerie réellement débité ; vide, celui par défaut du moyen.
  treasuryAccountId: z
    .string()
    .uuid()
    .nullish()
    .transform(v => v || null),
  reference: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform(v => v || null),
  notes: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform(v => v || null),
  statementId: z
    .string()
    .uuid()
    .nullish()
    .transform(v => v || null)
});

/** Midi UTC du jour choisi ; refuse le futur (même règle que la date d'un paiement). */
function payoutDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCDate() !== day) throw badRequest("La date du reversement n'existe pas");
  const now = new Date();
  if (Date.UTC(year, month - 1, day) > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) {
    throw badRequest('La date du reversement ne peut pas être dans le futur');
  }
  return date;
}

export async function createOwnerPayout(
  tenantId: string,
  ownerClientId: string,
  body: unknown,
  userId: string | undefined
) {
  const input = payoutSchema.parse(body);
  const paidAt = payoutDate(input.paidAt);
  const value = roundMoney(input.amount);

  // Le solde dû se juge sur un compte à jour.
  await syncOwnerAccount(tenantId, ownerClientId);
  const settings = await getAgencyFinanceSettings(tenantId);

  if (input.statementId) {
    const statement = await prisma.ownerStatement.findFirst({
      where: { id: input.statementId, tenantId },
      select: { id: true }
    });
    if (!statement) throw notFound('Releve introuvable');
  }

  const payout = await prisma.$transaction(async tx => {
    const account = await getOrCreateOwnerAccountTx(tx, tenantId, ownerClientId);
    await assertTreasuryAccountUsableTx(tx, tenantId, input.treasuryAccountId, input.method);
    const fresh = await tx.thirdPartyAccount.findUnique({ where: { id: account.id }, select: { balance: true } });
    if (value > due(fresh?.balance)) {
      throw conflict('Le reversement dépasse le solde dû au propriétaire');
    }

    const year = paidAt.getUTCFullYear();
    const last = await tx.ownerPayout.findFirst({
      where: { tenantId, year },
      orderBy: { sequence: 'desc' },
      select: { sequence: true }
    });
    const created = await tx.ownerPayout.create({
      data: {
        tenantId,
        ownerClientId,
        accountId: account.id,
        year,
        sequence: (last?.sequence ?? 0) + 1,
        amount: value,
        paidAt,
        method: input.method,
        treasuryAccountId: input.treasuryAccountId,
        reference: input.reference,
        notes: input.notes,
        statementId: input.statementId,
        createdByUserId: userId ?? null
      }
    });
    const number = payoutNumber(created.year, created.sequence);

    await appendThirdPartyMovementTx(tx, {
      tenantId,
      accountId: account.id,
      type: 'PAYOUT',
      billed: value,
      settled: 0,
      movementDate: paidAt,
      label: `Reversement ${number}`,
      sourceType: OWNER_SOURCE.PAYOUT,
      sourceId: created.id,
      leaseId: null
    } as any);

    const accounts = await ensureRentalAccountsTx(tx, tenantId, settings);
    const treasury = await resolveTreasuryAccountTx(tx, tenantId, {
      method: input.method,
      treasuryAccountId: input.treasuryAccountId
    });
    const journalFor = journalResolver(tx, tenantId);
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(paidAt, treasury.journal),
      entryDate: paidAt,
      reference: number,
      description: `Reversement ${number} au propriétaire`,
      documentType: 'OWNER_PAYOUT',
      documentId: created.id,
      lines: [
        {
          accountId: accounts.ownerFunds,
          debit: value,
          label: `Reversement ${number}`,
          thirdPartyAccountId: account.id,
          fundsNature: 'CURRENT'
        },
        { accountId: treasury.chartOfAccountId, credit: value, label: `Reversement ${number}` }
      ]
    });

    if (input.statementId) {
      await tx.ownerStatement.update({ where: { id: input.statementId, tenantId }, data: { status: 'PAID', paidAt } });
    }
    return created;
  });

  const names = await userNames([payout.createdByUserId]);
  return toPayoutDto(payout, names);
}

const voidSchema = z.object({ reason: z.string().trim().min(3, 'Le motif est requis') });

export async function voidOwnerPayout(
  tenantId: string,
  ownerClientId: string,
  payoutId: string,
  body: unknown,
  userId: string | undefined
) {
  const { reason } = voidSchema.parse(body);

  const payout = await prisma.$transaction(async tx => {
    const existing = await tx.ownerPayout.findFirst({ where: { id: payoutId, tenantId, ownerClientId } });
    if (!existing) throw notFound('Reversement introuvable');
    if (existing.status === 'VOIDED') throw conflict('Ce reversement est déjà annulé');

    const now = new Date();
    const updated = await tx.ownerPayout.update({
      where: { id: existing.id, tenantId },
      data: { status: 'VOIDED', voidReason: reason, voidedAt: now, voidedByUserId: userId ?? null }
    });
    const number = payoutNumber(existing.year, existing.sequence);

    await appendThirdPartyMovementTx(tx, {
      tenantId,
      accountId: existing.accountId,
      type: 'VOID',
      billed: 0,
      settled: amount(existing.amount),
      movementDate: now,
      label: `Annulation du reversement ${number} — ${reason}`,
      sourceType: OWNER_SOURCE.PAYOUT,
      sourceId: existing.id,
      leaseId: null
    } as any);

    await reverseDocumentEntryTx(tx, {
      tenantId,
      documentType: 'OWNER_PAYOUT',
      documentId: existing.id,
      entryDate: now,
      description: `Annulation du reversement ${number} : ${reason}`,
      journalFor: journalResolver(tx, tenantId)
    });

    // Le relevé que ce reversement réglait redevient dû.
    if (existing.statementId) {
      await tx.ownerStatement.updateMany({
        where: { id: existing.statementId, tenantId, status: 'PAID' },
        data: { status: 'SENT', paidAt: null }
      });
    }
    return updated;
  });

  const names = await userNames([payout.createdByUserId]);
  return toPayoutDto(payout, names);
}
