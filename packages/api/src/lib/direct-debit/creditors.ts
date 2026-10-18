import { t } from '../../i18n';
import { BadRequestError, ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { prisma } from '../../utils/database';
import { CREDITOR_SELECT, toCreditorDto, type CreditorDto } from './dto';
import type { CreateCreditorInput, UpdateCreditorInput } from './schemas';

/**
 * Créanciers du prélèvement bancaire (spec 042, PB1) : le compte bancaire de
 * l'agence qui reçoit les prélèvements. Toute lecture et toute écriture est
 * filtrée par `tenantId` ; une référence d'une autre agence lève la même
 * `NotFoundError` qu'un objet inexistant.
 */

const notFoundCreditor = () => new NotFoundError(t('Créancier introuvable.'));

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

export async function listCreditors(tenantId: string): Promise<CreditorDto[]> {
  const rows = await prisma.directDebitCreditor.findMany({
    where: { tenantId, scope: 'RENTAL_LEASE' },
    select: CREDITOR_SELECT,
    orderBy: [{ isActive: 'desc' }, { label: 'asc' }]
  });
  return rows.map(toCreditorDto);
}

export async function getCreditor(tenantId: string, creditorId: string): Promise<CreditorDto> {
  const row = await prisma.directDebitCreditor.findFirst({
    where: { id: creditorId, tenantId, scope: 'RENTAL_LEASE' },
    select: CREDITOR_SELECT
  });
  if (!row) throw notFoundCreditor();
  return toCreditorDto(row);
}

/** PB1-R1 : compte de l'agence, de type BANK, actif. */
export async function createCreditor(
  tenantId: string,
  input: CreateCreditorInput,
  actorUserId?: string | null
): Promise<CreditorDto> {
  const account = await prisma.treasuryAccount.findFirst({
    where: { id: input.treasuryAccountId, tenantId },
    select: { id: true, kind: true, isActive: true }
  });
  if (!account) throw new NotFoundError(t('Compte de trésorerie introuvable.'));
  if (account.kind !== 'BANK') {
    throw new BadRequestError(t('Seul un compte bancaire peut recevoir des prélèvements.'));
  }
  if (!account.isActive) {
    throw new BadRequestError(t('Ce compte de trésorerie est désactivé.'));
  }

  // PB1-R3 : un seul créancier par compte, même désactivé.
  const existing = await prisma.directDebitCreditor.findFirst({
    where: { tenantId, treasuryAccountId: account.id },
    select: { id: true }
  });
  if (existing) throw new ConflictError(t('Un créancier existe déjà pour ce compte de trésorerie.'));

  let id: string;
  try {
    const created = await prisma.directDebitCreditor.create({
      data: {
        tenantId,
        treasuryAccountId: account.id,
        label: input.label,
        creditorIdentifier: input.creditorIdentifier ?? null,
        collectionDay: input.collectionDay,
        prenotificationBusinessDays: input.prenotificationBusinessDays,
        rejectFeeAmount: input.rejectFeeAmount,
        maxConsecutiveRejects: input.maxConsecutiveRejects,
        createdByUserId: actorUserId ?? null
      },
      select: { id: true }
    });
    id = created.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(t('Un créancier existe déjà pour ce compte de trésorerie.'));
    }
    throw error;
  }

  logAuditEvent({
    actorUserId: actorUserId ?? null,
    tenantId,
    actionKey: AuditActionKey.DIRECT_DEBIT_CREDITOR_CREATED,
    entityType: 'DirectDebitCreditor',
    entityId: id,
    payload: {
      label: input.label,
      treasuryAccountId: account.id,
      hasCreditorIdentifier: Boolean(input.creditorIdentifier)
    }
  });
  return getCreditor(tenantId, id);
}

export async function updateCreditor(
  tenantId: string,
  creditorId: string,
  input: UpdateCreditorInput,
  actorUserId?: string | null
): Promise<CreditorDto> {
  const current = await prisma.directDebitCreditor.findFirst({
    where: { id: creditorId, tenantId, scope: 'RENTAL_LEASE' },
    select: {
      label: true,
      creditorIdentifier: true,
      collectionDay: true,
      prenotificationBusinessDays: true,
      rejectFeeAmount: true,
      maxConsecutiveRejects: true,
      isActive: true
    }
  });
  if (!current) throw notFoundCreditor();

  const data: Record<string, unknown> = {};
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const set = (field: keyof typeof current, value: unknown, before: unknown) => {
    if (value === undefined || value === before) return;
    data[field] = value;
    changes[field] = { before, after: value };
  };
  set('label', input.label, current.label);
  set('creditorIdentifier', input.creditorIdentifier, current.creditorIdentifier);
  set('collectionDay', input.collectionDay, current.collectionDay);
  set('prenotificationBusinessDays', input.prenotificationBusinessDays, current.prenotificationBusinessDays);
  set('rejectFeeAmount', input.rejectFeeAmount, Number(current.rejectFeeAmount));
  set('maxConsecutiveRejects', input.maxConsecutiveRejects, current.maxConsecutiveRejects);
  set('isActive', input.isActive, current.isActive);

  if (Object.keys(data).length > 0) {
    const result = await prisma.directDebitCreditor.updateMany({
      where: { id: creditorId, tenantId, scope: 'RENTAL_LEASE' },
      data
    });
    if (result.count === 0) throw notFoundCreditor();
    logAuditEvent({
      actorUserId: actorUserId ?? null,
      tenantId,
      actionKey: AuditActionKey.DIRECT_DEBIT_CREDITOR_UPDATED,
      entityType: 'DirectDebitCreditor',
      entityId: creditorId,
      payload: { fields: Object.keys(changes) },
      changes
    });
  }
  return getCreditor(tenantId, creditorId);
}
