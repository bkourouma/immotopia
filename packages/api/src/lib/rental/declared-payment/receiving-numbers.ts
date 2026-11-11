import type { RentalReceivingNumber } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { AppError, ErrorCode } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { t } from '../../../i18n';
import { maskPhone, normalizeIvorianMsisdn } from '../../payment-proof/phone';
import { ensureDefaultTreasuryAccountTx } from '../../treasury/accounts';
import { createReceivingNumberBodySchema, updateReceivingNumberBodySchema } from './admin-schemas';
import { notifyReceivingNumberChanged } from './notifications';
import type { RentalReceivingNumberDto } from './types';

/**
 * Numéros de réception mobile money d'une agence (contrat §1.1). Un numéro
 * appartient à l'AGENCE ; le compte de trésorerie est DÉRIVÉ de l'opérateur
 * (`mobileMoneySpec`, 5521 à 5524, 5529 pour OTHER) et créé à la demande.
 * Les numéros ne figurent jamais en clair dans l'audit.
 */

function notFoundError(): AppError {
  return new AppError(t('Numéro de réception introuvable.'), 404, ErrorCode.RENTAL_RECEIVING_NUMBER_NOT_FOUND);
}

function duplicateError(): AppError {
  return new AppError(
    t('Ce numéro est déjà enregistré pour cette agence avec cet opérateur.'),
    409,
    ErrorCode.RENTAL_RECEIVING_NUMBER_DUPLICATE
  );
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
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

async function buildDtos(tenantId: string, rows: RentalReceivingNumber[]): Promise<RentalReceivingNumberDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map(row => row.id);
  const [totals, pendings, accounts] = await Promise.all([
    prisma.rentalPaymentDeclaration.groupBy({
      by: ['receiving_number_id'],
      where: { tenant_id: tenantId, receiving_number_id: { in: ids } },
      _count: { _all: true }
    }),
    prisma.rentalPaymentDeclaration.groupBy({
      by: ['receiving_number_id'],
      where: { tenant_id: tenantId, status: 'PENDING', receiving_number_id: { in: ids } },
      _count: { _all: true }
    }),
    prisma.treasuryAccount.findMany({
      where: { tenantId, accountNumber: { in: [...new Set(rows.map(row => row.treasury_account_number))] } },
      select: { id: true, accountNumber: true }
    })
  ]);
  const totalById = new Map(totals.map(row => [row.receiving_number_id, row._count._all]));
  const pendingById = new Map(pendings.map(row => [row.receiving_number_id, row._count._all]));
  const accountIdByNumber = new Map(accounts.map(account => [account.accountNumber, account.id]));

  return rows.map(row => ({
    id: row.id,
    operator: row.operator,
    phone: row.phone,
    label: row.label,
    active: row.is_active,
    treasuryAccountId: accountIdByNumber.get(row.treasury_account_number) ?? null,
    treasuryAccountNumber: row.treasury_account_number,
    declarationsCount: totalById.get(row.id) ?? 0,
    pendingDeclarations: pendingById.get(row.id) ?? 0,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  }));
}

async function loadDto(tenantId: string, id: string): Promise<RentalReceivingNumberDto> {
  const row = await prisma.rentalReceivingNumber.findFirst({ where: { id, tenant_id: tenantId } });
  if (!row) throw notFoundError();
  const [dto] = await buildDtos(tenantId, [row]);
  return dto;
}

/** Actifs d'abord, puis opérateur, puis création (§1.1). */
export async function listReceivingNumbers(
  tenantId: string,
  filter: { active?: boolean } = {}
): Promise<RentalReceivingNumberDto[]> {
  const rows = await prisma.rentalReceivingNumber.findMany({
    where: { tenant_id: tenantId, ...(filter.active === undefined ? {} : { is_active: filter.active }) },
    orderBy: [{ is_active: 'desc' }, { operator: 'asc' }, { created_at: 'asc' }]
  });
  return buildDtos(tenantId, rows);
}

/** Numéros ACTIFS de l'agence, vue portail et contrôles de déclaration. */
export async function listActiveReceivingNumbers(
  tenantId: string
): Promise<Array<{ id: string; operator: string; phone: string; label: string | null }>> {
  const rows = await prisma.rentalReceivingNumber.findMany({
    where: { tenant_id: tenantId, is_active: true },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }]
  });
  return rows.map(row => ({ id: row.id, operator: row.operator, phone: row.phone, label: row.label }));
}

export async function createReceivingNumber(
  tenantId: string,
  userId: string,
  body: unknown
): Promise<RentalReceivingNumberDto> {
  const parsed = createReceivingNumberBodySchema.parse(body ?? {});
  const phone = normalizePhoneOrThrow(parsed.phone);

  const duplicate = await prisma.rentalReceivingNumber.findFirst({
    where: { tenant_id: tenantId, operator: parsed.operator, phone },
    select: { id: true }
  });
  if (duplicate) throw duplicateError();

  let created: RentalReceivingNumber;
  try {
    created = await prisma.$transaction(async tx => {
      const account = await ensureDefaultTreasuryAccountTx(tx, tenantId, 'MOBILE_MONEY', parsed.operator);
      return tx.rentalReceivingNumber.create({
        data: {
          tenant_id: tenantId,
          operator: parsed.operator,
          phone,
          label: parsed.label || null,
          is_active: parsed.active ?? true,
          treasury_account_number: account.accountNumber
        }
      });
    });
  } catch (error) {
    // Deux créations concurrentes du même numéro : la seconde heurte l'unicité.
    if (isCode(error, 'P2002')) throw duplicateError();
    throw error;
  }

  logAuditEvent({
    actorUserId: userId,
    tenantId,
    actionKey: AuditActionKey.RENTAL_RECEIVING_NUMBER_CREATED,
    entityType: 'RENTAL_RECEIVING_NUMBER',
    entityId: created.id,
    payload: {
      operator: created.operator,
      treasuryAccountNumber: created.treasury_account_number,
      active: created.is_active
    }
  });
  notifyReceivingNumberChanged({
    tenantId,
    actorUserId: userId,
    action: 'created',
    operator: created.operator,
    phoneMasked: maskPhone(created.phone)
  });
  return loadDto(tenantId, created.id);
}

export async function updateReceivingNumber(
  tenantId: string,
  userId: string,
  numberId: string,
  body: unknown
): Promise<RentalReceivingNumberDto> {
  const parsed = updateReceivingNumberBodySchema.parse(body ?? {});
  const current = await prisma.rentalReceivingNumber.findFirst({ where: { id: numberId, tenant_id: tenantId } });
  if (!current) throw notFoundError();

  const nextPhone = parsed.phone === undefined ? current.phone : normalizePhoneOrThrow(parsed.phone);
  const nextOperator = parsed.operator ?? current.operator;
  const identityChanged = nextPhone !== current.phone || nextOperator !== current.operator;

  if (identityChanged) {
    const duplicate = await prisma.rentalReceivingNumber.findFirst({
      where: { tenant_id: tenantId, operator: nextOperator, phone: nextPhone, id: { not: current.id } },
      select: { id: true }
    });
    if (duplicate) throw duplicateError();
  }

  const data: Record<string, unknown> = {};
  const changedFields: string[] = [];
  const set = (field: string, column: string, value: unknown, previous: unknown) => {
    if (value === undefined || value === previous) return;
    data[column] = value;
    changedFields.push(field);
  };
  set('operator', 'operator', nextOperator, current.operator);
  set('phone', 'phone', nextPhone, current.phone);
  set('label', 'label', parsed.label === undefined ? undefined : parsed.label || null, current.label);
  set('active', 'is_active', parsed.active, current.is_active);

  if (changedFields.length === 0) return loadDto(tenantId, current.id);

  try {
    await prisma.$transaction(async tx => {
      // Le compte de trésorerie suit l'opérateur (dérivé, jamais saisi).
      if (nextOperator !== current.operator) {
        const account = await ensureDefaultTreasuryAccountTx(tx, tenantId, 'MOBILE_MONEY', nextOperator);
        data.treasury_account_number = account.accountNumber;
      }
      const result = await tx.rentalReceivingNumber.updateMany({
        where: { id: current.id, tenant_id: tenantId },
        data
      });
      if (result.count === 0) throw notFoundError();
    });
  } catch (error) {
    if (isCode(error, 'P2002')) throw duplicateError();
    throw error;
  }

  const deactivated = parsed.active === false && current.is_active;
  logAuditEvent({
    actorUserId: userId,
    tenantId,
    actionKey: deactivated
      ? AuditActionKey.RENTAL_RECEIVING_NUMBER_DEACTIVATED
      : AuditActionKey.RENTAL_RECEIVING_NUMBER_UPDATED,
    entityType: 'RENTAL_RECEIVING_NUMBER',
    entityId: current.id,
    payload: {
      operator: nextOperator,
      changedFields,
      ...(identityChanged
        ? { previousPhoneMasked: maskPhone(current.phone), newPhoneMasked: maskPhone(nextPhone) }
        : {})
    }
  });
  if (identityChanged || deactivated) {
    notifyReceivingNumberChanged({
      tenantId,
      actorUserId: userId,
      action: deactivated && !identityChanged ? 'deactivated' : 'updated',
      operator: nextOperator,
      phoneMasked: maskPhone(nextPhone)
    });
  }
  return loadDto(tenantId, current.id);
}

/**
 * `DELETE` (§1.1) : sans déclaration liée, suppression définitive ; sinon
 * désactivation douce. Jamais d'erreur `IN_USE`. Audit `DEACTIVATED` dans les deux cas.
 */
export async function deleteReceivingNumber(
  tenantId: string,
  userId: string,
  numberId: string
): Promise<{ id: string; deleted: boolean; deactivated: boolean }> {
  const current = await prisma.rentalReceivingNumber.findFirst({ where: { id: numberId, tenant_id: tenantId } });
  if (!current) throw notFoundError();

  const used = await prisma.rentalPaymentDeclaration.count({
    where: { tenant_id: tenantId, receiving_number_id: current.id }
  });

  let deleted = false;
  if (used === 0) {
    try {
      await prisma.rentalReceivingNumber.deleteMany({ where: { id: current.id, tenant_id: tenantId } });
      deleted = true;
    } catch (error) {
      // Une déclaration créée entre le contrôle et la suppression : repli sur la désactivation.
      if (!isCode(error, 'P2003')) throw error;
    }
  }
  if (!deleted) {
    await prisma.rentalReceivingNumber.updateMany({
      where: { id: current.id, tenant_id: tenantId },
      data: { is_active: false }
    });
  }

  logAuditEvent({
    actorUserId: userId,
    tenantId,
    actionKey: AuditActionKey.RENTAL_RECEIVING_NUMBER_DEACTIVATED,
    entityType: 'RENTAL_RECEIVING_NUMBER',
    entityId: current.id,
    payload: { operator: current.operator, deleted, deactivated: !deleted }
  });
  notifyReceivingNumberChanged({
    tenantId,
    actorUserId: userId,
    action: deleted ? 'deleted' : 'deactivated',
    operator: current.operator,
    phoneMasked: maskPhone(current.phone)
  });
  return { id: current.id, deleted, deactivated: !deleted };
}
