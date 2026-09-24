import { MobileMoneyOperator, Prisma, TreasuryAccountKind, TreasuryDocumentStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { postDocumentEntryTx } from '../finance/accounting';
import { roundMoney } from '../finance/money';
import { journalResolver } from '../owner-account/accounts';
import { reverseDocumentEntryTx } from '../owner-account/sync';
import { DEFAULT_WITHHOLDING_ACCOUNT, getAgencyFinanceSettings } from '../settings/finance-settings';
import { ensureChartAccountTx, ensureDefaultTreasuryAccountTx, journalForKind } from './accounts';

/**
 * Trésorerie de l'agence — lot 10 (conformité SYSCOHADA).
 *
 * Trois familles de pièces : les comptes de trésorerie eux-mêmes (paramétrage,
 * pas de pièce comptable), les virements internes entre deux comptes
 * (`TreasuryTransfer`, numérotés VIR-AAAA-NNNN) et les versements à la DGI des
 * retenues à la source collectées (`TaxRemittance`, numérotés DGI-AAAA-NNNN).
 *
 * Numérotation annuelle : même motif que `createOwnerPayout`
 * (`lib/owner-account/service.ts`) — on relit le dernier numéro de l'année
 * dans la transaction, jamais de compteur séparé.
 *
 * Chaque lecture et chaque écriture est filtrée par `tenantId` : une agence ne
 * voit et ne touche que sa propre trésorerie.
 */

// ---------------------------------------------------------------------------
// Comptes de trésorerie
// ---------------------------------------------------------------------------

export interface TreasuryAccountDto {
  id: string;
  kind: TreasuryAccountKind;
  label: string;
  accountNumber: string;
  mmOperator: MobileMoneyOperator | null;
  bankName: string | null;
  bankAccountRef: string | null;
  isDefault: boolean;
  isActive: boolean;
  balance: number;
}

type TreasuryAccountRow = Prisma.TreasuryAccountGetPayload<Record<string, never>>;

function toAccountDto(row: TreasuryAccountRow, balance: number): TreasuryAccountDto {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    accountNumber: row.accountNumber,
    mmOperator: row.mmOperator,
    bankName: row.bankName,
    bankAccountRef: row.bankAccountRef,
    isDefault: row.isDefault,
    isActive: row.isActive,
    balance
  };
}

/** Solde (débit − crédit) des comptes du plan désignés, agrégé en SQL. */
async function balancesByChartAccount(tenantId: string, chartOfAccountIds: string[]): Promise<Map<string, number>> {
  if (!chartOfAccountIds.length) return new Map();
  const grouped = await prisma.journalEntryLine.groupBy({
    by: ['accountId'],
    where: { account: { tenantId }, accountId: { in: chartOfAccountIds } },
    _sum: { debit: true, credit: true }
  });
  return new Map(
    grouped.map(row => [row.accountId, roundMoney(Number(row._sum.debit ?? 0) - Number(row._sum.credit ?? 0))])
  );
}

const accountOrder: Prisma.TreasuryAccountFindManyArgs['orderBy'] = [
  { isDefault: 'desc' },
  { kind: 'asc' },
  { createdAt: 'asc' }
];

export async function listAccounts(tenantId: string): Promise<TreasuryAccountDto[]> {
  let accounts = await prisma.treasuryAccount.findMany({ where: { tenantId }, orderBy: accountOrder });
  if (!accounts.length) {
    // Une agence qui n'a pas ouvert la page Trésorerie doit pouvoir encaisser
    // un loyer : on lui crée ses comptes par défaut avant de lister.
    await prisma.$transaction(async tx => {
      await ensureDefaultTreasuryAccountTx(tx, tenantId, TreasuryAccountKind.CASH);
      await ensureDefaultTreasuryAccountTx(tx, tenantId, TreasuryAccountKind.BANK);
    });
    accounts = await prisma.treasuryAccount.findMany({ where: { tenantId }, orderBy: accountOrder });
  }
  const balances = await balancesByChartAccount(
    tenantId,
    accounts.map(a => a.chartOfAccountId)
  );
  return accounts.map(a => toAccountDto(a, balances.get(a.chartOfAccountId) ?? 0));
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform(v => (v ? v : null));

const digitsAccountNumber = z
  .string()
  .trim()
  .refine(v => /^\d{2,20}$/.test(v), { message: 'Un numéro de compte ne contient que des chiffres' });

const ACCOUNT_NUMBER_PREFIXES: Record<TreasuryAccountKind, string[]> = {
  CASH: ['5711', '571'],
  BANK: ['52'],
  MOBILE_MONEY: ['55'],
  CHECKS_TO_CASH: ['513'],
  CARDS_TO_CASH: ['515']
};

function assertAccountNumberMatchesKind(kind: TreasuryAccountKind, accountNumber: string) {
  const prefixes = ACCOUNT_NUMBER_PREFIXES[kind];
  if (!prefixes.some(prefix => accountNumber.startsWith(prefix))) {
    throw badRequest(`Le numéro de compte doit commencer par ${prefixes.join(' ou ')} pour la nature ${kind}`);
  }
}

const createAccountSchema = z.object({
  kind: z.nativeEnum(TreasuryAccountKind),
  label: z.string().trim().min(1).max(120),
  accountNumber: digitsAccountNumber,
  mmOperator: z.nativeEnum(MobileMoneyOperator).nullish(),
  bankName: optionalText(120),
  bankAccountRef: optionalText(60),
  isDefault: z.boolean().optional().default(false)
});

export async function createAccount(tenantId: string, body: unknown): Promise<TreasuryAccountDto> {
  const input = createAccountSchema.parse(body);
  assertAccountNumberMatchesKind(input.kind, input.accountNumber);

  const already = await prisma.treasuryAccount.findFirst({
    where: { tenantId, accountNumber: input.accountNumber },
    select: { id: true }
  });
  if (already) throw conflict(`Un compte de trésorerie porte déjà le numéro ${input.accountNumber}`);

  const created = await prisma.$transaction(async tx => {
    const chartOfAccountId = await ensureChartAccountTx(tx, tenantId, input.accountNumber, input.label, 'ASSET');

    if (input.isDefault) {
      await tx.treasuryAccount.updateMany({
        where: {
          tenantId,
          kind: input.kind,
          isDefault: true,
          ...(input.kind === TreasuryAccountKind.MOBILE_MONEY ? { mmOperator: input.mmOperator ?? null } : {})
        },
        data: { isDefault: false }
      });
    }

    return tx.treasuryAccount.create({
      data: {
        tenantId,
        kind: input.kind,
        label: input.label,
        accountNumber: input.accountNumber,
        chartOfAccountId,
        mmOperator: input.kind === TreasuryAccountKind.MOBILE_MONEY ? (input.mmOperator ?? null) : null,
        bankName: input.bankName,
        bankAccountRef: input.bankAccountRef,
        isDefault: input.isDefault
      }
    });
  });
  return toAccountDto(created, 0);
}

const patchAccountSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  bankName: optionalText(120),
  bankAccountRef: optionalText(60),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional()
});

/**
 * Modifie un compte de trésorerie. Le numéro et la nature ne se modifient
 * jamais : envoyés dans le corps, ils sont simplement ignorés — un compte
 * change de libellé ou de statut, jamais de classe comptable.
 */
export async function patchAccount(tenantId: string, accountId: string, body: unknown): Promise<TreasuryAccountDto> {
  const input = patchAccountSchema.parse(body);
  const account = await prisma.treasuryAccount.findFirst({ where: { id: accountId, tenantId } });
  if (!account) throw notFound('Compte de trésorerie introuvable');

  if (input.isActive === false) {
    const otherActive = await prisma.treasuryAccount.count({
      where: { tenantId, kind: account.kind, isActive: true, id: { not: account.id } }
    });
    if (otherActive === 0) {
      throw badRequest('Impossible de désactiver le dernier compte actif de cette nature.');
    }
  }

  const updated = await prisma.$transaction(async tx => {
    if (input.isDefault) {
      await tx.treasuryAccount.updateMany({
        where: {
          tenantId,
          kind: account.kind,
          isDefault: true,
          id: { not: account.id },
          ...(account.kind === TreasuryAccountKind.MOBILE_MONEY ? { mmOperator: account.mmOperator } : {})
        },
        data: { isDefault: false }
      });
    }
    return tx.treasuryAccount.update({
      // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D
      // du plan multi-tenant).
      where: { id: account.id, tenantId },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
        ...(input.bankAccountRef !== undefined ? { bankAccountRef: input.bankAccountRef } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {})
      }
    });
  });

  const balances = await balancesByChartAccount(tenantId, [updated.chartOfAccountId]);
  return toAccountDto(updated, balances.get(updated.chartOfAccountId) ?? 0);
}

// ---------------------------------------------------------------------------
// Noms d'utilisateurs — même motif que `cash-sessions/service.ts`
// ---------------------------------------------------------------------------

async function userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (!unique.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullName: true, email: true }
  });
  return new Map(users.map(u => [u.id, u.fullName || u.email]));
}

async function accountLabels(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids));
  if (!unique.length) return new Map();
  const accounts = await prisma.treasuryAccount.findMany({
    where: { tenantId, id: { in: unique } },
    select: { id: true, label: true }
  });
  return new Map(accounts.map(a => [a.id, a.label]));
}

// ---------------------------------------------------------------------------
// Virements internes
// ---------------------------------------------------------------------------

export interface TreasuryTransferDto {
  id: string;
  number: string;
  fromTreasuryAccountId: string;
  fromLabel: string;
  toTreasuryAccountId: string;
  toLabel: string;
  amount: number;
  transferredAt: string;
  reference: string | null;
  notes: string | null;
  status: TreasuryDocumentStatus;
  voidReason: string | null;
  voidedAt: string | null;
  createdByName: string | null;
}

const transferNumber = (year: number, sequence: number) => `VIR-${year}-${String(sequence).padStart(4, '0')}`;
const remittanceNumber = (year: number, sequence: number) => `DGI-${year}-${String(sequence).padStart(4, '0')}`;

type TransferRow = Prisma.TreasuryTransferGetPayload<Record<string, never>>;

function toTransferDto(row: TransferRow, labels: Map<string, string>, names: Map<string, string>): TreasuryTransferDto {
  return {
    id: row.id,
    number: transferNumber(row.year, row.sequence),
    fromTreasuryAccountId: row.fromTreasuryAccountId,
    fromLabel: labels.get(row.fromTreasuryAccountId) ?? '',
    toTreasuryAccountId: row.toTreasuryAccountId,
    toLabel: labels.get(row.toTreasuryAccountId) ?? '',
    amount: Number(row.amount),
    transferredAt: row.transferredAt.toISOString(),
    reference: row.reference,
    notes: row.notes,
    status: row.status,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    createdByName: row.createdByUserId ? (names.get(row.createdByUserId) ?? null) : null
  };
}

export async function listTransfers(tenantId: string): Promise<TreasuryTransferDto[]> {
  const transfers = await prisma.treasuryTransfer.findMany({
    where: { tenantId },
    orderBy: { transferredAt: 'desc' },
    take: 500
  });
  const [labels, names] = await Promise.all([
    accountLabels(
      tenantId,
      transfers.flatMap(t => [t.fromTreasuryAccountId, t.toTreasuryAccountId])
    ),
    userNames(transfers.map(t => t.createdByUserId))
  ]);
  return transfers.map(t => toTransferDto(t, labels, names));
}

const createTransferSchema = z.object({
  fromTreasuryAccountId: z.string().trim().min(1),
  toTreasuryAccountId: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  transferredAt: z.coerce.date(),
  reference: optionalText(60),
  notes: optionalText(500)
});

export async function createTransfer(
  tenantId: string,
  userId: string | undefined,
  body: unknown
): Promise<TreasuryTransferDto> {
  const input = createTransferSchema.parse(body);
  if (input.fromTreasuryAccountId === input.toTreasuryAccountId) {
    throw badRequest('Le compte source et le compte destination doivent être différents.');
  }

  const [from, to] = await Promise.all([
    prisma.treasuryAccount.findFirst({ where: { id: input.fromTreasuryAccountId, tenantId } }),
    prisma.treasuryAccount.findFirst({ where: { id: input.toTreasuryAccountId, tenantId } })
  ]);
  if (!from) throw badRequest('Compte de trésorerie source introuvable');
  if (!to) throw badRequest('Compte de trésorerie destination introuvable');
  if (!from.isActive) throw badRequest('Le compte de trésorerie source est désactivé');
  if (!to.isActive) throw badRequest('Le compte de trésorerie destination est désactivé');

  const amount = roundMoney(input.amount);
  const journalType = from.kind === TreasuryAccountKind.CASH && to.kind === TreasuryAccountKind.CASH ? 'CASH' : 'BANK';

  const created = await prisma.$transaction(async tx => {
    const year = input.transferredAt.getUTCFullYear();
    const last = await tx.treasuryTransfer.findFirst({
      where: { tenantId, year },
      orderBy: { sequence: 'desc' },
      select: { sequence: true }
    });
    const sequence = (last?.sequence ?? 0) + 1;
    const transfer = await tx.treasuryTransfer.create({
      data: {
        tenantId,
        year,
        sequence,
        fromTreasuryAccountId: from.id,
        toTreasuryAccountId: to.id,
        amount,
        transferredAt: input.transferredAt,
        reference: input.reference,
        notes: input.notes,
        createdByUserId: userId ?? null
      }
    });
    const number = transferNumber(year, sequence);
    const label = `Virement ${number} — ${from.label} → ${to.label}`;
    const journalFor = journalResolver(tx, tenantId);
    await postDocumentEntryTx(tx, {
      tenantId,
      journalId: await journalFor(input.transferredAt, journalType),
      entryDate: input.transferredAt,
      reference: number,
      description: label,
      documentType: 'TREASURY_TRANSFER',
      documentId: transfer.id,
      lines: [
        { accountId: to.chartOfAccountId, debit: amount, label },
        { accountId: from.chartOfAccountId, credit: amount, label }
      ]
    });
    return transfer;
  });

  const [labels, names] = await Promise.all([
    accountLabels(tenantId, [created.fromTreasuryAccountId, created.toTreasuryAccountId]),
    userNames([created.createdByUserId])
  ]);
  return toTransferDto(created, labels, names);
}

const voidSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

export async function voidTransfer(
  tenantId: string,
  userId: string | undefined,
  transferId: string,
  body: unknown
): Promise<TreasuryTransferDto> {
  const input = voidSchema.parse(body);
  const transfer = await prisma.treasuryTransfer.findFirst({ where: { id: transferId, tenantId } });
  if (!transfer) throw notFound('Virement introuvable');
  if (transfer.status === TreasuryDocumentStatus.VOIDED) throw conflict('Ce virement est déjà annulé.');

  const now = new Date();
  const number = transferNumber(transfer.year, transfer.sequence);
  const updated = await prisma.$transaction(async tx => {
    const journalFor = journalResolver(tx, tenantId);
    await reverseDocumentEntryTx(tx, {
      tenantId,
      documentType: 'TREASURY_TRANSFER',
      documentId: transfer.id,
      entryDate: now,
      description: `Annulation du virement ${number} — ${input.reason}`,
      journalFor
    });
    return tx.treasuryTransfer.update({
      // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
      where: { id: transfer.id, tenantId },
      data: {
        status: TreasuryDocumentStatus.VOIDED,
        voidReason: input.reason,
        voidedAt: now,
        voidedByUserId: userId ?? null
      }
    });
  });

  const [labels, names] = await Promise.all([
    accountLabels(tenantId, [updated.fromTreasuryAccountId, updated.toTreasuryAccountId]),
    userNames([updated.createdByUserId, updated.voidedByUserId])
  ]);
  return toTransferDto(updated, labels, names);
}

// ---------------------------------------------------------------------------
// Retenue à la source et versements DGI
// ---------------------------------------------------------------------------

export interface WithholdingSummaryDto {
  enabled: boolean;
  accountNumber: string;
  collected: number;
  remitted: number;
  due: number;
}

async function computeWithholdingDue(tenantId: string): Promise<{ collected: number; remitted: number; due: number }> {
  const [collectedAgg, remittedAgg] = await Promise.all([
    prisma.rentWithholding.aggregate({ where: { tenantId }, _sum: { amount: true } }),
    prisma.taxRemittance.aggregate({
      where: { tenantId, status: TreasuryDocumentStatus.VALIDATED },
      _sum: { amount: true }
    })
  ]);
  const collected = roundMoney(Number(collectedAgg._sum.amount ?? 0));
  const remitted = roundMoney(Number(remittedAgg._sum.amount ?? 0));
  const due = Math.max(0, roundMoney(collected - remitted));
  return { collected, remitted, due };
}

export async function getWithholdingSummary(tenantId: string): Promise<WithholdingSummaryDto> {
  const settings = await getAgencyFinanceSettings(tenantId);
  const { collected, remitted, due } = await computeWithholdingDue(tenantId);
  return {
    enabled: settings.withholdingEnabled,
    accountNumber: settings.withholdingAccountNumber ?? DEFAULT_WITHHOLDING_ACCOUNT,
    collected,
    remitted,
    due
  };
}

export interface TaxRemittanceDto {
  id: string;
  number: string;
  amount: number;
  paidAt: string;
  periodLabel: string;
  treasuryAccountId: string;
  treasuryLabel: string;
  reference: string | null;
  status: TreasuryDocumentStatus;
  voidReason: string | null;
  voidedAt: string | null;
  createdByName: string | null;
}

type RemittanceRow = Prisma.TaxRemittanceGetPayload<Record<string, never>>;

function toRemittanceDto(
  row: RemittanceRow,
  labels: Map<string, string>,
  names: Map<string, string>
): TaxRemittanceDto {
  return {
    id: row.id,
    number: remittanceNumber(row.year, row.sequence),
    amount: Number(row.amount),
    paidAt: row.paidAt.toISOString(),
    periodLabel: row.periodLabel,
    treasuryAccountId: row.treasuryAccountId,
    treasuryLabel: labels.get(row.treasuryAccountId) ?? '',
    reference: row.reference,
    status: row.status,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    createdByName: row.createdByUserId ? (names.get(row.createdByUserId) ?? null) : null
  };
}

export async function listTaxRemittances(tenantId: string): Promise<TaxRemittanceDto[]> {
  const remittances = await prisma.taxRemittance.findMany({
    where: { tenantId },
    orderBy: { paidAt: 'desc' },
    take: 500
  });
  const [labels, names] = await Promise.all([
    accountLabels(
      tenantId,
      remittances.map(r => r.treasuryAccountId)
    ),
    userNames(remittances.map(r => r.createdByUserId))
  ]);
  return remittances.map(r => toRemittanceDto(r, labels, names));
}

const createRemittanceSchema = z.object({
  amount: z.coerce.number().positive(),
  paidAt: z.coerce.date(),
  periodLabel: z.string().trim().min(1).max(60),
  treasuryAccountId: z.string().trim().min(1),
  reference: optionalText(60)
});

export async function createTaxRemittance(
  tenantId: string,
  userId: string | undefined,
  body: unknown
): Promise<TaxRemittanceDto> {
  const input = createRemittanceSchema.parse(body);
  const amount = roundMoney(input.amount);

  const { due } = await computeWithholdingDue(tenantId);
  if (amount > due) {
    throw conflict(
      `Le versement (${amount.toLocaleString('fr-FR')} FCFA) dépasse le montant dû à la DGI (${due.toLocaleString('fr-FR')} FCFA).`
    );
  }

  const treasury = await prisma.treasuryAccount.findFirst({ where: { id: input.treasuryAccountId, tenantId } });
  if (!treasury) throw badRequest('Compte de trésorerie introuvable');
  if (!treasury.isActive) throw badRequest('Ce compte de trésorerie est désactivé');

  const settings = await getAgencyFinanceSettings(tenantId);
  const withholdingAccountNumber = settings.withholdingAccountNumber ?? DEFAULT_WITHHOLDING_ACCOUNT;

  const created = await prisma.$transaction(async tx => {
    const year = input.paidAt.getUTCFullYear();
    const last = await tx.taxRemittance.findFirst({
      where: { tenantId, year },
      orderBy: { sequence: 'desc' },
      select: { sequence: true }
    });
    const sequence = (last?.sequence ?? 0) + 1;
    const remittance = await tx.taxRemittance.create({
      data: {
        tenantId,
        year,
        sequence,
        amount,
        paidAt: input.paidAt,
        periodLabel: input.periodLabel,
        treasuryAccountId: treasury.id,
        reference: input.reference,
        createdByUserId: userId ?? null
      }
    });
    const number = remittanceNumber(year, sequence);
    const label = `Versement DGI ${number} — ${input.periodLabel}`;
    const withholdingAccountId = await ensureChartAccountTx(
      tx,
      tenantId,
      withholdingAccountNumber,
      'Autres impots et contributions retenus a la source',
      'LIABILITY'
    );
    const journalFor = journalResolver(tx, tenantId);
    await postDocumentEntryTx(tx, {
      tenantId,
      // Un versement sort de la trésorerie : il va au journal de sa banque ou de sa caisse.
      journalId: await journalFor(input.paidAt, journalForKind(treasury.kind)),
      entryDate: input.paidAt,
      reference: number,
      description: label,
      documentType: 'TAX_REMITTANCE',
      documentId: remittance.id,
      lines: [
        { accountId: withholdingAccountId, debit: amount, label },
        { accountId: treasury.chartOfAccountId, credit: amount, label }
      ]
    });
    return remittance;
  });

  const [labels, names] = await Promise.all([
    accountLabels(tenantId, [created.treasuryAccountId]),
    userNames([created.createdByUserId])
  ]);
  return toRemittanceDto(created, labels, names);
}

export async function voidTaxRemittance(
  tenantId: string,
  userId: string | undefined,
  remittanceId: string,
  body: unknown
): Promise<TaxRemittanceDto> {
  const input = voidSchema.parse(body);
  const remittance = await prisma.taxRemittance.findFirst({ where: { id: remittanceId, tenantId } });
  if (!remittance) throw notFound('Versement DGI introuvable');
  if (remittance.status === TreasuryDocumentStatus.VOIDED) throw conflict('Ce versement est déjà annulé.');

  const now = new Date();
  const number = remittanceNumber(remittance.year, remittance.sequence);
  const updated = await prisma.$transaction(async tx => {
    const journalFor = journalResolver(tx, tenantId);
    await reverseDocumentEntryTx(tx, {
      tenantId,
      documentType: 'TAX_REMITTANCE',
      documentId: remittance.id,
      entryDate: now,
      description: `Annulation du versement DGI ${number} — ${input.reason}`,
      journalFor
    });
    return tx.taxRemittance.update({
      // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
      where: { id: remittance.id, tenantId },
      data: {
        status: TreasuryDocumentStatus.VOIDED,
        voidReason: input.reason,
        voidedAt: now,
        voidedByUserId: userId ?? null
      }
    });
  });

  const [labels, names] = await Promise.all([
    accountLabels(tenantId, [updated.treasuryAccountId]),
    userNames([updated.createdByUserId, updated.voidedByUserId])
  ]);
  return toRemittanceDto(updated, labels, names);
}

export type { PrismaTransactionClient };
