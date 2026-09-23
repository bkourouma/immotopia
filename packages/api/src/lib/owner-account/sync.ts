import type { PrismaTransactionClient } from '../../utils/database';
import { prisma } from '../../utils/database';
import { notFound } from '../errors';
import { postDocumentEntryTx } from '../finance/accounting';
import { appendThirdPartyMovementTx } from '../finance/ledger';
import { roundMoney } from '../finance/money';
import { materializeManagementFees } from '../rental-fees/materialize';
import { getAgencyFinanceSettings } from '../settings/finance-settings';
import { ensureRentalAccountsTx, journalResolver, RentalAccounts, treasuryFor } from './accounts';

/**
 * Compte courant d'un propriétaire : synchronisation avec ses sources.
 *
 * Le compte n'est pas saisi, il se DÉDUIT de pièces qui existent déjà :
 *
 * | Source                         | Mouvement            | Écriture                                   |
 * | ------------------------------ | -------------------- | ------------------------------------------ |
 * | affectation d'un règlement     | RENT_COLLECTED, crédit | 571 ou 521 au débit / fonds propriétaires |
 * | honoraires figés (lot 2)       | MANAGEMENT_FEE, débit  | fonds propriétaires / 706                 |
 * | TVA de ces honoraires          | MANAGEMENT_FEE_VAT     | (même écriture) / 4432                    |
 * | dépense d'un bien              | EXPENSE, débit         | fonds propriétaires / 571                 |
 * | reversement (`service.ts`)     | PAYOUT, débit          | fonds propriétaires / 571 ou 521          |
 *
 * Synchroniser, c'est inscrire ce qui manque et contre-passer ce qui a
 * disparu à la source (un règlement annulé retire son affectation, et avec
 * elle ses honoraires). Rien n'est jamais modifié ni supprimé : un mouvement
 * et son écriture, une fois passés, ne bougent plus ; une disparition
 * s'inscrit comme un mouvement VOID et une écriture de contre-passation.
 *
 * Idempotent : chaque mouvement est unique par (origine, pièce, nature) et
 * chaque écriture par (nature, pièce). Deux synchronisations successives ne
 * font rien de plus que la première.
 *
 * **Hypothèse sur les dépenses.** Une dépense déduite du net du propriétaire
 * est une dépense que l'agence a réglée pour lui — c'est déjà l'hypothèse du
 * relevé de gérance. Elle sort donc de la caisse (571). Le modèle des dépenses
 * ne dit pas par quel moyen elle a été payée.
 */

/** Origine d'un mouvement : une par nature, pour que chaque contre-passation soit unique. */
export const OWNER_SOURCE = {
  RENT: 'OWNER_ALLOCATION',
  FEE: 'OWNER_FEE',
  FEE_VAT: 'OWNER_FEE_VAT',
  EXPENSE: 'OWNER_EXPENSE',
  PAYOUT: 'OWNER_PAYOUT'
} as const;

/** Nature de la pièce comptable d'une origine. La TVA partage l'écriture des honoraires. */
const DOCUMENT_BY_SOURCE: Record<
  string,
  'OWNER_RENT_COLLECTED' | 'OWNER_MANAGEMENT_FEE' | 'OWNER_EXPENSE' | 'OWNER_PAYOUT' | null
> = {
  [OWNER_SOURCE.RENT]: 'OWNER_RENT_COLLECTED',
  [OWNER_SOURCE.FEE]: 'OWNER_MANAGEMENT_FEE',
  [OWNER_SOURCE.FEE_VAT]: null,
  [OWNER_SOURCE.EXPENSE]: 'OWNER_EXPENSE',
  [OWNER_SOURCE.PAYOUT]: 'OWNER_PAYOUT'
};

export async function getOrCreateOwnerAccountTx(tx: PrismaTransactionClient, tenantId: string, ownerClientId: string) {
  const existing = await tx.thirdPartyAccount.findUnique({
    where: { tenantId_kind_tenantClientId: { tenantId, kind: 'OWNER', tenantClientId: ownerClientId } },
    select: { id: true, balance: true }
  });
  if (existing) return existing;

  const owner = await tx.tenantClient.findFirst({
    where: { id: ownerClientId, tenantId },
    select: { user: { select: { fullName: true, email: true } } }
  });
  if (!owner) throw notFound('Proprietaire introuvable');

  return tx.thirdPartyAccount.create({
    data: {
      tenantId,
      kind: 'OWNER',
      tenantClientId: ownerClientId,
      label: owner.user.fullName || owner.user.email || 'Propriétaire',
      balance: 0,
      currency: 'XOF'
    },
    select: { id: true, balance: true }
  });
}

/** Contre-passe l'écriture d'une pièce, si elle en a une et qu'elle ne l'est pas déjà. */
export async function reverseDocumentEntryTx(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    documentType: string;
    documentId: string;
    entryDate: Date;
    description: string;
    journalFor: ReturnType<typeof journalResolver>;
  }
) {
  const original = await tx.journalEntry.findFirst({
    where: { tenantId: params.tenantId, documentType: params.documentType, documentId: params.documentId },
    select: {
      id: true,
      reference: true,
      voidedByEntryId: true,
      lines: { select: { accountId: true, debit: true, credit: true, label: true } }
    }
  });
  if (!original || original.voidedByEntryId) return;

  const journalId = await params.journalFor(params.entryDate, 'GENERAL');
  const { entryId } = await postDocumentEntryTx(tx, {
    tenantId: params.tenantId,
    journalId,
    entryDate: params.entryDate,
    reference: `ANN-${original.reference}`,
    description: params.description,
    documentType: 'OWNER_VOID',
    documentId: `${params.documentType}:${params.documentId}`,
    lines: original.lines.map(line => ({
      accountId: line.accountId,
      debit: Number(line.credit ?? 0),
      credit: Number(line.debit ?? 0),
      label: `Annulation — ${line.label ?? ''}`.trim()
    }))
  });
  await tx.journalEntry.update({ where: { id: original.id }, data: { voidedByEntryId: entryId } });
}

interface PendingMovement {
  sourceType: string;
  sourceId: string;
  type: 'RENT_COLLECTED' | 'MANAGEMENT_FEE' | 'MANAGEMENT_FEE_VAT' | 'EXPENSE';
  debit: number;
  credit: number;
  date: Date;
  label: string;
  leaseId: string | null;
}

const monthKey = (date: Date) => `${date.getUTCFullYear()}-${date.getUTCMonth()}`;

/** Propriétaires de l'agence : clients de type propriétaire, ou désignés sur un bail. */
export async function listAgencyOwners(tenantId: string) {
  return prisma.tenantClient.findMany({
    where: { tenantId, OR: [{ clientType: 'OWNER' }, { ownerLeases: { some: {} } }] },
    select: { id: true, userId: true, user: { select: { fullName: true, email: true } } },
    orderBy: { user: { fullName: 'asc' } }
  });
}

export async function syncOwnerAccount(tenantId: string, ownerClientId: string, options: { skipFees?: boolean } = {}) {
  const owner = await prisma.tenantClient.findFirst({
    where: { id: ownerClientId, tenantId },
    select: { id: true, userId: true, user: { select: { fullName: true, email: true } } }
  });
  if (!owner) throw notFound('Proprietaire introuvable');

  const [leases, ownedProperties] = await Promise.all([
    prisma.rentalLease.findMany({
      where: { tenant_id: tenantId, owner_client_id: ownerClientId },
      select: { id: true, property_id: true }
    }),
    prisma.property.findMany({ where: { tenantId, ownerUserId: owner.userId }, select: { id: true } })
  ]);
  const propertyIds = Array.from(new Set([...leases.map(l => l.property_id), ...ownedProperties.map(p => p.id)]));

  if (!options.skipFees && propertyIds.length > 0) {
    await materializeManagementFees(tenantId, { from: new Date(0), to: new Date(), propertyIds });
  }

  const [allocations, fees, expenses, settings] = await Promise.all([
    prisma.rentalPaymentAllocation.findMany({
      where: {
        tenant_id: tenantId,
        payment: { status: 'SUCCESS' },
        installment: { lease: { owner_client_id: ownerClientId } }
      },
      select: {
        id: true,
        amount: true,
        payment: { select: { succeeded_at: true, initiated_at: true, method: true } },
        installment: {
          select: { period_year: true, period_month: true, lease: { select: { id: true, lease_number: true } } }
        }
      }
    }),
    prisma.managementFee.findMany({ where: { tenantId, ownerClientId } }),
    propertyIds.length
      ? prisma.propertyExpense.findMany({
          where: { tenantId, propertyId: { in: propertyIds } },
          select: { id: true, propertyId: true, label: true, amount: true, category: true, paidAt: true }
        })
      : Promise.resolve([]),
    getAgencyFinanceSettings(tenantId)
  ]);

  // Même règle que le relevé : une dépense « frais de gestion » saisie à la
  // main n'est pas déduite d'un mois où le bien porte déjà des honoraires.
  const feeMonths = new Set(fees.map(fee => `${fee.propertyId}:${monthKey(fee.collectedAt)}`));
  const leaseNumberById = new Map(allocations.map(a => [a.installment.lease.id, a.installment.lease.lease_number]));

  const pending: PendingMovement[] = [];
  const methodBySource = new Map<string, string>();
  for (const allocation of allocations) {
    const amount = roundMoney(Number(allocation.amount));
    if (amount <= 0) continue;
    const { period_year: year, period_month: month, lease } = allocation.installment;
    pending.push({
      sourceType: OWNER_SOURCE.RENT,
      sourceId: allocation.id,
      type: 'RENT_COLLECTED',
      debit: 0,
      credit: amount,
      date: allocation.payment.succeeded_at ?? allocation.payment.initiated_at,
      label: `Loyer ${String(month).padStart(2, '0')}/${year} — ${lease.lease_number}`,
      leaseId: lease.id
    });
    methodBySource.set(allocation.id, allocation.payment.method);
  }
  for (const fee of fees) {
    const leaseNumber = leaseNumberById.get(fee.leaseId) ?? '';
    const feeAmount = Number(fee.feeAmount);
    const vatAmount = Number(fee.vatAmount);
    if (feeAmount > 0) {
      pending.push({
        sourceType: OWNER_SOURCE.FEE,
        sourceId: fee.id,
        type: 'MANAGEMENT_FEE',
        debit: feeAmount,
        credit: 0,
        date: fee.collectedAt,
        label: `Honoraires de gestion — ${leaseNumber}`.trim(),
        leaseId: fee.leaseId
      });
    }
    if (vatAmount > 0) {
      pending.push({
        sourceType: OWNER_SOURCE.FEE_VAT,
        sourceId: fee.id,
        type: 'MANAGEMENT_FEE_VAT',
        debit: vatAmount,
        credit: 0,
        date: fee.collectedAt,
        label: `TVA sur honoraires — ${leaseNumber}`.trim(),
        leaseId: fee.leaseId
      });
    }
  }
  for (const expense of expenses) {
    if (expense.category === 'MANAGEMENT_FEES' && feeMonths.has(`${expense.propertyId}:${monthKey(expense.paidAt)}`)) {
      continue;
    }
    const amount = roundMoney(Number(expense.amount));
    if (amount <= 0) continue;
    pending.push({
      sourceType: OWNER_SOURCE.EXPENSE,
      sourceId: expense.id,
      type: 'EXPENSE',
      debit: amount,
      credit: 0,
      date: expense.paidAt,
      label: `Dépense — ${expense.label}`,
      leaseId: null
    });
  }
  const feeById = new Map(fees.map(fee => [fee.id, fee]));

  await prisma.$transaction(
    async tx => {
      const account = await getOrCreateOwnerAccountTx(tx, tenantId, ownerClientId);
      const accounts: RentalAccounts = await ensureRentalAccountsTx(tx, tenantId, settings);
      const journalFor = journalResolver(tx, tenantId);

      const existing = await tx.thirdPartyMovement.findMany({
        where: { accountId: account.id },
        select: { sourceType: true, sourceId: true, type: true, debit: true, credit: true, leaseId: true }
      });
      const seen = new Set(existing.map(m => `${m.sourceType}:${m.sourceId}:${m.type}`));
      const current = new Set(pending.map(p => `${p.sourceType}:${p.sourceId}`));

      // 1. Inscrire ce qui manque, dans l'ordre des dates.
      pending.sort((a, b) => a.date.getTime() - b.date.getTime());
      for (const move of pending) {
        if (seen.has(`${move.sourceType}:${move.sourceId}:${move.type}`)) continue;
        await appendThirdPartyMovementTx(tx, {
          tenantId,
          accountId: account.id,
          type: move.type,
          billed: move.debit,
          settled: move.credit,
          movementDate: move.date,
          label: move.label,
          sourceType: move.sourceType,
          sourceId: move.sourceId,
          leaseId: move.leaseId
        } as any);
        await postSourceEntryTx(tx, { tenantId, move, accounts, journalFor, methodBySource, feeById });
      }

      // 2. Contre-passer ce qui a disparu à la source. Les reversements ne
      //    passent pas par ici : ils s'annulent explicitement, avec un motif.
      for (const movement of existing) {
        if (movement.type === 'VOID' || movement.sourceType === OWNER_SOURCE.PAYOUT) continue;
        if (!Object.values(OWNER_SOURCE).includes(movement.sourceType as any)) continue;
        if (current.has(`${movement.sourceType}:${movement.sourceId}`)) continue;
        if (seen.has(`${movement.sourceType}:${movement.sourceId}:VOID`)) continue;

        const now = new Date();
        await appendThirdPartyMovementTx(tx, {
          tenantId,
          accountId: account.id,
          type: 'VOID',
          billed: Number(movement.credit ?? 0),
          settled: Number(movement.debit ?? 0),
          movementDate: now,
          label: 'Annulation — pièce d’origine supprimée ou annulée',
          sourceType: movement.sourceType,
          sourceId: movement.sourceId,
          leaseId: movement.leaseId
        } as any);
        const documentType = DOCUMENT_BY_SOURCE[movement.sourceType];
        if (documentType) {
          await reverseDocumentEntryTx(tx, {
            tenantId,
            documentType,
            documentId: movement.sourceId,
            entryDate: now,
            description: 'Contre-passation : pièce d’origine supprimée ou annulée',
            journalFor
          });
        }
      }
    },
    { timeout: 120_000, maxWait: 20_000 }
  );
}

async function postSourceEntryTx(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    move: PendingMovement;
    accounts: RentalAccounts;
    journalFor: ReturnType<typeof journalResolver>;
    methodBySource: Map<string, string>;
    feeById: Map<string, { feeAmount: unknown; vatAmount: unknown }>;
  }
) {
  const { tenantId, move, accounts, journalFor } = params;
  const already = (documentType: string) =>
    tx.journalEntry.findFirst({ where: { tenantId, documentType, documentId: move.sourceId }, select: { id: true } });

  if (move.type === 'RENT_COLLECTED') {
    if (await already('OWNER_RENT_COLLECTED')) return;
    const treasury = treasuryFor(params.methodBySource.get(move.sourceId) ?? 'CASH', accounts);
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(move.date, treasury.journal),
      entryDate: move.date,
      reference: `LOY-${move.sourceId.slice(0, 8).toUpperCase()}`,
      description: move.label,
      documentType: 'OWNER_RENT_COLLECTED',
      documentId: move.sourceId,
      lines: [
        { accountId: treasury.accountId, debit: move.credit, label: move.label },
        { accountId: accounts.ownerFunds, credit: move.credit, label: move.label }
      ]
    });
    return;
  }

  if (move.type === 'MANAGEMENT_FEE') {
    // Une seule écriture pour les honoraires et leur TVA : le propriétaire est
    // débité du TTC, l'agence crédite son produit et l'État.
    if (await already('OWNER_MANAGEMENT_FEE')) return;
    const fee = params.feeById.get(move.sourceId);
    const feeAmount = Number(fee?.feeAmount ?? move.debit);
    const vatAmount = Number(fee?.vatAmount ?? 0);
    const lines = [
      { accountId: accounts.ownerFunds, debit: feeAmount + vatAmount, label: move.label },
      { accountId: accounts.fees, credit: feeAmount, label: move.label }
    ];
    if (vatAmount > 0) lines.push({ accountId: accounts.vat, credit: vatAmount, label: `TVA — ${move.label}` } as any);
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(move.date, 'GENERAL'),
      entryDate: move.date,
      reference: `HON-${move.sourceId.slice(0, 8).toUpperCase()}`,
      description: move.label,
      documentType: 'OWNER_MANAGEMENT_FEE',
      documentId: move.sourceId,
      lines
    });
    return;
  }

  if (move.type === 'EXPENSE') {
    if (await already('OWNER_EXPENSE')) return;
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(move.date, 'CASH'),
      entryDate: move.date,
      reference: `DEP-${move.sourceId.slice(0, 8).toUpperCase()}`,
      description: move.label,
      documentType: 'OWNER_EXPENSE',
      documentId: move.sourceId,
      lines: [
        { accountId: accounts.ownerFunds, debit: move.debit, label: move.label },
        { accountId: accounts.cash, credit: move.debit, label: move.label }
      ]
    });
  }
  // MANAGEMENT_FEE_VAT : portée par l'écriture des honoraires, rien à faire.
}
