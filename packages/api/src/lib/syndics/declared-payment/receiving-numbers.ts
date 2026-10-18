import type { SyndicReceivingNumber } from '@prisma/client';
import { z } from 'zod';
import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { t } from '../../../i18n';
import { assertSyndicateOfTenant } from '../charge-allocation';
import { ensureSyndicReceivingAccountTx } from '../provider-invoice-accounting';
import { normalizeIvorianMsisdn } from './phone';
import type {
  CreateReceivingNumberBody,
  ReceivingNumber,
  ReceivingNumberAdmin,
  UpdateReceivingNumberBody
} from './types';

/**
 * Numéros de réception mobile money d'une copropriété (spec 047, contrats §1.1 à 1.4).
 *
 * Chaque numéro porte un sous-compte de trésorerie `5521x` du plan de LA
 * copropriété (hypothèse comptable H1), alloué à la création dans la même
 * transaction. Ce sous-compte n'est jamais supprimé ni renommé. Les numéros
 * de téléphone ne figurent jamais en clair dans l'audit.
 */

type Client = PrismaTransactionClient | typeof prisma;

const OPERATORS = ['ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER'] as const;

/** Corps de création (§1.2). Le numéro est contrôlé à part (`INVALID_PHONE`). */
export const createReceivingNumberBodySchema = z
  .object({
    operator: z.enum(OPERATORS),
    phoneNumber: z.string().max(40),
    holderName: z.string().trim().min(2).max(80),
    label: z.string().trim().max(60).nullable().optional(),
    isActive: z.boolean().optional()
  })
  .strict();

/** Corps de modification (§1.3). */
export const updateReceivingNumberBodySchema = z
  .object({
    operator: z.enum(OPERATORS).optional(),
    phoneNumber: z.string().max(40).optional(),
    holderName: z.string().trim().min(2).max(80).optional(),
    label: z.string().trim().max(60).nullable().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional()
  })
  .strict();

function toReceivingNumber(row: SyndicReceivingNumber): ReceivingNumber {
  return {
    id: row.id,
    operator: row.operator,
    phoneNumber: row.phoneNumber,
    holderName: row.holderName,
    label: row.label,
    isActive: row.isActive,
    sortOrder: row.sortOrder
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2003';
}

function duplicateError(): AppError {
  return new AppError(
    t('Ce numéro est déjà enregistré pour cette copropriété avec cet opérateur.'),
    409,
    ErrorCode.RECEIVING_NUMBER_DUPLICATE
  );
}

function inUseError(): AppError {
  return new AppError(
    t('Ce numéro porte des déclarations de paiement : désactivez-le plutôt que de le modifier ou le supprimer.'),
    409,
    ErrorCode.RECEIVING_NUMBER_IN_USE
  );
}

function normalizePhoneOrThrow(input: string): string {
  const phone = normalizeIvorianMsisdn(input);
  if (!phone) {
    throw new AppError(
      t("Ce numéro de téléphone n'est pas un numéro mobile ivoirien valide."),
      400,
      ErrorCode.INVALID_PHONE
    );
  }
  return phone;
}

/** Une ligne par entrée de `numbers`, enrichie des compteurs et du solde (vue gestionnaire). */
async function buildAdminViews(
  client: Client,
  tenantId: string,
  syndicateId: string,
  numbers: SyndicReceivingNumber[]
): Promise<ReceivingNumberAdmin[]> {
  if (numbers.length === 0) return [];

  const pendingRows = await client.syndicPaymentDeclaration.groupBy({
    by: ['receivingNumberId'],
    where: { tenantId, syndicateId, status: 'PENDING', receivingNumberId: { in: numbers.map(n => n.id) } },
    _count: { _all: true }
  });
  const pendingById = new Map(pendingRows.map(row => [row.receivingNumberId, row._count._all]));

  // D10 : autres copropriétés de la même agence qui utilisent le même téléphone.
  const sharedRows = await client.syndicReceivingNumber.findMany({
    where: { tenantId, syndicateId: { not: syndicateId }, phoneNumber: { in: numbers.map(n => n.phoneNumber) } },
    select: { phoneNumber: true, syndicateId: true }
  });
  const sharedByPhone = new Map<string, Set<string>>();
  for (const row of sharedRows) {
    const set = sharedByPhone.get(row.phoneNumber) ?? new Set<string>();
    set.add(row.syndicateId);
    sharedByPhone.set(row.phoneNumber, set);
  }

  // Solde comptable du sous-compte dans le plan de CETTE copropriété (débit − crédit).
  const accounts = await client.chartOfAccount.findMany({
    where: {
      tenantId,
      syndicateId,
      scope: 'SYNDICATE',
      accountNumber: { in: numbers.map(n => n.treasuryAccountNumber) }
    },
    select: { id: true, accountNumber: true }
  });
  const balanceByAccountId = new Map<string, number>();
  if (accounts.length > 0) {
    const totals = await client.journalEntryLine.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accounts.map(a => a.id) } },
      _sum: { debit: true, credit: true }
    });
    for (const row of totals) {
      balanceByAccountId.set(row.accountId, Math.round(Number(row._sum.debit ?? 0) - Number(row._sum.credit ?? 0)));
    }
  }
  const accountIdByNumber = new Map(accounts.map(a => [a.accountNumber, a.id]));

  return numbers.map(number => {
    const accountId = accountIdByNumber.get(number.treasuryAccountNumber);
    return {
      ...toReceivingNumber(number),
      treasuryAccountNumber: number.treasuryAccountNumber,
      treasuryBalance: accountId ? (balanceByAccountId.get(accountId) ?? 0) : 0,
      sharedWithCount: sharedByPhone.get(number.phoneNumber)?.size ?? 0,
      pendingDeclarations: pendingById.get(number.id) ?? 0,
      createdAt: number.createdAt.toISOString(),
      updatedAt: number.updatedAt.toISOString()
    };
  });
}

/** Actifs d'abord, puis par `sortOrder` (§1.1). */
export async function listReceivingNumbers(tenantId: string, syndicateId: string): Promise<ReceivingNumberAdmin[]> {
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const numbers = await prisma.syndicReceivingNumber.findMany({
    where: { tenantId, syndicateId },
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
  });
  return buildAdminViews(prisma, tenantId, syndicateId, numbers);
}

async function loadAdminView(tenantId: string, syndicateId: string, numberId: string): Promise<ReceivingNumberAdmin> {
  const row = await prisma.syndicReceivingNumber.findFirst({ where: { id: numberId, tenantId, syndicateId } });
  if (!row) throw new NotFoundError(t('Numéro de réception introuvable.'));
  const [view] = await buildAdminViews(prisma, tenantId, syndicateId, [row]);
  return view;
}

export async function createReceivingNumber(params: {
  tenantId: string;
  syndicateId: string;
  actorUserId: string;
  body: CreateReceivingNumberBody;
}): Promise<ReceivingNumberAdmin> {
  const { tenantId, syndicateId, actorUserId } = params;
  await assertSyndicateOfTenant(prisma, tenantId, syndicateId);
  const body = createReceivingNumberBodySchema.parse(params.body);
  const phoneNumber = normalizePhoneOrThrow(body.phoneNumber);

  const duplicate = await prisma.syndicReceivingNumber.findFirst({
    where: { tenantId, syndicateId, operator: body.operator, phoneNumber },
    select: { id: true }
  });
  if (duplicate) throw duplicateError();

  let created: SyndicReceivingNumber;
  try {
    created = await prisma.$transaction(async tx => {
      const account = await ensureSyndicReceivingAccountTx(tx, tenantId, syndicateId, {
        operator: body.operator,
        phoneNumber
      });
      return tx.syndicReceivingNumber.create({
        data: {
          tenantId,
          syndicateId,
          operator: body.operator,
          phoneNumber,
          holderName: body.holderName,
          label: body.label || null,
          isActive: body.isActive ?? true,
          treasuryAccountNumber: account.accountNumber
        }
      });
    });
  } catch (error) {
    // Deux créations concurrentes du même numéro : la seconde heurte l'unicité.
    if (isUniqueViolation(error)) throw duplicateError();
    throw error;
  }

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_RECEIVING_NUMBER_CREATED,
    entityType: 'SYNDIC_RECEIVING_NUMBER',
    entityId: created.id,
    payload: {
      syndicateId,
      operator: created.operator,
      treasuryAccountNumber: created.treasuryAccountNumber,
      isActive: created.isActive
    }
  });
  return loadAdminView(tenantId, syndicateId, created.id);
}

export async function updateReceivingNumber(params: {
  tenantId: string;
  syndicateId: string;
  numberId: string;
  actorUserId: string;
  body: UpdateReceivingNumberBody;
}): Promise<ReceivingNumberAdmin> {
  const { tenantId, syndicateId, numberId, actorUserId } = params;
  const body = updateReceivingNumberBodySchema.parse(params.body);
  const current = await prisma.syndicReceivingNumber.findFirst({ where: { id: numberId, tenantId, syndicateId } });
  if (!current) throw new NotFoundError(t('Numéro de réception introuvable.'));

  const nextPhone = body.phoneNumber === undefined ? current.phoneNumber : normalizePhoneOrThrow(body.phoneNumber);
  const nextOperator = body.operator ?? current.operator;
  const identityChanged = nextPhone !== current.phoneNumber || nextOperator !== current.operator;

  if (identityChanged) {
    const used = await prisma.syndicPaymentDeclaration.count({ where: { tenantId, receivingNumberId: current.id } });
    if (used > 0) throw inUseError();
    const duplicate = await prisma.syndicReceivingNumber.findFirst({
      where: { tenantId, syndicateId, operator: nextOperator, phoneNumber: nextPhone, id: { not: current.id } },
      select: { id: true }
    });
    if (duplicate) throw duplicateError();
  }

  const data: Record<string, unknown> = {};
  const changedFields: string[] = [];
  const set = (field: string, value: unknown, previous: unknown) => {
    if (value === undefined || value === previous) return;
    data[field] = value;
    changedFields.push(field);
  };
  set('operator', nextOperator, current.operator);
  set('phoneNumber', nextPhone, current.phoneNumber);
  set('holderName', body.holderName, current.holderName);
  set('label', body.label === undefined ? undefined : body.label || null, current.label);
  set('isActive', body.isActive, current.isActive);
  set('sortOrder', body.sortOrder, current.sortOrder);

  if (changedFields.length > 0) {
    try {
      const result = await prisma.syndicReceivingNumber.updateMany({
        where: { id: current.id, tenantId, syndicateId },
        data
      });
      if (result.count === 0) throw new NotFoundError(t('Numéro de réception introuvable.'));
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateError();
      throw error;
    }

    const deactivated = body.isActive === false && current.isActive;
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: deactivated
        ? AuditActionKey.SYNDIC_RECEIVING_NUMBER_DEACTIVATED
        : AuditActionKey.SYNDIC_RECEIVING_NUMBER_UPDATED,
      entityType: 'SYNDIC_RECEIVING_NUMBER',
      entityId: current.id,
      payload: { syndicateId, operator: nextOperator, changedFields }
    });
  }
  return loadAdminView(tenantId, syndicateId, current.id);
}

/**
 * Suppression d'un numéro sans aucune déclaration. Le sous-compte comptable
 * reste dans le plan (jamais supprimé). Audit : `SYNDIC_RECEIVING_NUMBER_UPDATED`
 * avec `reason: 'deleted'` (le catalogue n'a pas de clé de suppression).
 */
export async function deleteReceivingNumber(params: {
  tenantId: string;
  syndicateId: string;
  numberId: string;
  actorUserId: string;
}): Promise<void> {
  const { tenantId, syndicateId, numberId, actorUserId } = params;
  const current = await prisma.syndicReceivingNumber.findFirst({ where: { id: numberId, tenantId, syndicateId } });
  if (!current) throw new NotFoundError(t('Numéro de réception introuvable.'));

  const used = await prisma.syndicPaymentDeclaration.count({ where: { tenantId, receivingNumberId: current.id } });
  if (used > 0) throw inUseError();

  try {
    await prisma.syndicReceivingNumber.deleteMany({ where: { id: current.id, tenantId, syndicateId } });
  } catch (error) {
    // Une déclaration créée entre le contrôle et la suppression : la clé étrangère (Restrict) refuse.
    if (isForeignKeyViolation(error)) throw inUseError();
    throw error;
  }

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_RECEIVING_NUMBER_UPDATED,
    entityType: 'SYNDIC_RECEIVING_NUMBER',
    entityId: current.id,
    payload: {
      syndicateId,
      operator: current.operator,
      treasuryAccountNumber: current.treasuryAccountNumber,
      reason: 'deleted'
    }
  });
}

/** Numéros ACTIFS d'une copropriété, vue portail (§2.1). */
export async function listActiveReceivingNumbersForPortal(
  tenantId: string,
  syndicateId: string
): Promise<ReceivingNumber[]> {
  const rows = await prisma.syndicReceivingNumber.findMany({
    where: { tenantId, syndicateId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });
  return rows.map(toReceivingNumber);
}

/**
 * Ligne du numéro s'il est ACTIF et de CETTE copropriété/agence ; sinon
 * `RECEIVING_NUMBER_INACTIVE` (400), sans distinguer l'absence de l'autre agence.
 */
export async function getActiveReceivingNumber(
  client: Client,
  tenantId: string,
  syndicateId: string,
  numberId: string
): Promise<SyndicReceivingNumber> {
  const row = await client.syndicReceivingNumber.findFirst({
    where: { id: numberId, tenantId, syndicateId, isActive: true }
  });
  if (!row) {
    throw new AppError(t("Ce numéro de réception n'est pas disponible."), 400, ErrorCode.RECEIVING_NUMBER_INACTIVE);
  }
  return row;
}
