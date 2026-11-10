import type { Prisma, ReceivingAccount } from '@prisma/client';
import { t } from '../../i18n';
import { AppError, ConflictError, ErrorCode, NotFoundError } from '../../middleware/error-middleware';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { assertSyndicateOfTenant } from '../syndics/charge-allocation';
import type { PrivateFile } from '../files/private-files';
import { notifyReceivingAccountChanged, type ReceivingAccountChange } from './notifications';
import { deleteQrQuietly, prepareQr, readQr, writeQr, type PreparedQr, type StoredQr } from './qr-files';
import {
  createReceivingAccountBodySchema,
  updateReceivingAccountBodySchema,
  type CreateReceivingAccountBody,
  type UpdateReceivingAccountBody
} from './schemas';
import type { ReceivingAccountAdmin, ReceivingAccountTarget, UploadedQr } from './types';

/**
 * Gestion des comptes de réception de l'agence et des copropriétés (spec 048,
 * lot Q, contrat §1 à §4). ImmoTopia ne génère ni ne modifie aucun QR.
 *
 * Chaque lecture et chaque écriture filtre par agence, portée et copropriété :
 * un compte d'une autre agence (ou d'une autre copropriété) lève la même
 * `NotFoundError` qu'un compte inexistant. `qrFileUrl` ne sort jamais.
 */

export const MAX_ACCOUNTS_PER_TARGET = 10;

/** Colonnes lues pour une réponse : ni `qrFileUrl` ni `qrSha256`. */
export const ADMIN_SELECT = {
  id: true,
  institution: true,
  scannableWith: true,
  alias: true,
  holderName: true,
  instructions: true,
  qrMimeType: true,
  isActive: true,
  sortOrder: true,
  updatedAt: true
} satisfies Prisma.ReceivingAccountSelect;

type AdminRow = Prisma.ReceivingAccountGetPayload<{ select: typeof ADMIN_SELECT }>;

const notFound = () => new NotFoundError(t('Compte de réception introuvable.'));

function qrPathOf(tenantId: string, target: ReceivingAccountTarget, accountId: string): string {
  return target.scope === 'AGENCY'
    ? `/api/tenants/${tenantId}/settings/receiving-accounts/${accountId}/qr`
    : `/api/tenants/${tenantId}/syndics/${target.syndicateId}/receiving-accounts/${accountId}/qr`;
}

function toAdmin(row: AdminRow, qrPath: string): ReceivingAccountAdmin {
  const hasQr = row.qrMimeType !== null;
  return {
    id: row.id,
    institution: row.institution,
    scannableWith: row.scannableWith,
    alias: row.alias,
    holderName: row.holderName,
    instructions: row.instructions,
    hasQr,
    qrPath: hasQr ? qrPath : null,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString()
  };
}

function whereTarget(tenantId: string, target: ReceivingAccountTarget) {
  return { tenantId, scope: target.scope, syndicateId: target.syndicateId } as const;
}

async function assertTarget(tenantId: string, target: ReceivingAccountTarget): Promise<void> {
  if (target.scope === 'SYNDICATE') await assertSyndicateOfTenant(prisma, tenantId, target.syndicateId);
}

async function loadOwned(
  tenantId: string,
  target: ReceivingAccountTarget,
  accountId: string
): Promise<ReceivingAccount> {
  const row = await prisma.receivingAccount.findFirst({ where: { id: accountId, ...whereTarget(tenantId, target) } });
  if (!row) throw notFound();
  return row;
}

async function loadAdminView(tenantId: string, target: ReceivingAccountTarget, accountId: string) {
  const row = await prisma.receivingAccount.findFirst({
    where: { id: accountId, ...whereTarget(tenantId, target) },
    select: ADMIN_SELECT
  });
  if (!row) throw notFound();
  return toAdmin(row, qrPathOf(tenantId, target, row.id));
}

function incomplete(): AppError {
  return new AppError(
    t('Un compte actif doit avoir au moins un alias ou une image de QR.'),
    400,
    ErrorCode.RECEIVING_ACCOUNT_INCOMPLETE
  );
}

function limitReached(): AppError {
  return new AppError(
    t('Dix comptes de réception au plus : supprimez-en un avant d’en ajouter.'),
    409,
    ErrorCode.RECEIVING_ACCOUNT_LIMIT
  );
}

/** Actifs d'abord, puis par `sortOrder`. */
export async function listReceivingAccounts(
  tenantId: string,
  target: ReceivingAccountTarget
): Promise<ReceivingAccountAdmin[]> {
  await assertTarget(tenantId, target);
  const rows = await prisma.receivingAccount.findMany({
    where: whereTarget(tenantId, target),
    select: ADMIN_SELECT,
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
  });
  return rows.map(row => toAdmin(row, qrPathOf(tenantId, target, row.id)));
}

interface Actor {
  tenantId: string;
  target: ReceivingAccountTarget;
  actorUserId: string;
}

/**
 * Verrou consultatif jusqu'à la fin de la transaction : sérialise les créations concurrentes d'une même
 * cible pour que la limite de 10 comptes tienne. Isolé pour être remplacé dans les tests.
 */
export async function lockTarget(tx: PrismaTransactionClient, tenantId: string, target: ReceivingAccountTarget) {
  const key = `receiving-accounts:${tenantId}:${target.scope}:${target.syndicateId ?? '-'}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

function auditPayload(target: ReceivingAccountTarget, values: Record<string, unknown>) {
  return { scope: target.scope, syndicateId: target.syndicateId, ...values };
}

export async function createReceivingAccount(
  params: Actor & { body: CreateReceivingAccountBody; file?: UploadedQr }
): Promise<ReceivingAccountAdmin> {
  const { tenantId, target, actorUserId } = params;
  await assertTarget(tenantId, target);
  const body = createReceivingAccountBodySchema.parse(params.body);
  const prepared: PreparedQr | null = params.file ? prepareQr(params.file) : null;
  const isActive = body.isActive ?? true;
  if (isActive && !body.alias && !prepared) throw incomplete();

  const stored: StoredQr | null = prepared ? await writeQr(tenantId, prepared) : null;
  let created: ReceivingAccount;
  try {
    created = await prisma.$transaction(async tx => {
      await lockTarget(tx, tenantId, target);
      const count = await tx.receivingAccount.count({ where: whereTarget(tenantId, target) });
      if (count >= MAX_ACCOUNTS_PER_TARGET) throw limitReached();
      return tx.receivingAccount.create({
        data: {
          ...whereTarget(tenantId, target),
          institution: body.institution,
          scannableWith: body.scannableWith ?? null,
          alias: body.alias ?? null,
          holderName: body.holderName,
          instructions: body.instructions ?? null,
          qrFileUrl: stored?.fileUrl ?? null,
          qrMimeType: stored?.mimeType ?? null,
          qrSha256: stored?.sha256 ?? null,
          isActive,
          sortOrder: body.sortOrder ?? 0
        }
      });
    });
  } catch (error) {
    await deleteQrQuietly(tenantId, stored?.fileUrl);
    throw error;
  }

  const hasQr = stored !== null;
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.RECEIVING_ACCOUNT_CREATED,
    entityType: 'RECEIVING_ACCOUNT',
    entityId: created.id,
    payload: auditPayload(target, {
      institution: created.institution,
      previousAlias: null,
      newAlias: created.alias,
      hadQr: false,
      hasQr,
      sortOrder: created.sortOrder,
      isActive: created.isActive
    })
  });
  notifyReceivingAccountChanged({
    tenantId,
    actorUserId,
    scope: target.scope,
    syndicateId: target.syndicateId,
    institution: created.institution,
    changes: ['CREATED'],
    previousAlias: null,
    newAlias: created.alias,
    hadQr: false,
    hasQr,
    previousHolderName: null,
    newHolderName: created.holderName
  });
  return loadAdminView(tenantId, target, created.id);
}

const TEXT_FIELDS = ['institution', 'scannableWith', 'holderName', 'instructions'] as const;

/** Champs modifiés (hors image) : seules les clés fournies et différentes. */
function diffFields(current: ReceivingAccount, body: UpdateReceivingAccountBody): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const set = (field: keyof ReceivingAccount, value: unknown) => {
    if (value !== undefined && value !== current[field]) data[field] = value;
  };
  set('institution', body.institution);
  set('scannableWith', body.scannableWith);
  set('alias', body.alias);
  set('holderName', body.holderName);
  set('instructions', body.instructions);
  set('isActive', body.isActive);
  set('sortOrder', body.sortOrder);
  return data;
}

const CHANGE_BY_FIELD: Record<string, ReceivingAccountChange> = {
  alias: 'ALIAS_CHANGED',
  institution: 'INSTITUTION_CHANGED',
  holderName: 'HOLDER_CHANGED',
  instructions: 'INSTRUCTIONS_CHANGED',
  scannableWith: 'SCANNABLE_WITH_CHANGED'
};

/** Tout ce qui change ce que le payeur voit ou l'état du compte alerte les administrateurs ; l'ordre seul, non. */
function changesOf(current: ReceivingAccount, data: Record<string, unknown>, qrChanged: boolean) {
  const changes = Object.keys(CHANGE_BY_FIELD)
    .filter(field => field in data)
    .map(field => CHANGE_BY_FIELD[field]);
  if (qrChanged) changes.push('QR_CHANGED');
  if (data.isActive === false && current.isActive) changes.push('DEACTIVATED');
  if (data.isActive === true && !current.isActive) changes.push('REACTIVATED');
  return changes;
}

interface UpdatePlan {
  current: ReceivingAccount;
  data: Record<string, unknown>;
  removeQr: boolean;
  nextAlias: string | null;
  nextActive: boolean;
  nextHasQr: boolean;
}

/** Décide des changements à partir de la ligne lue DANS la transaction ; lève si le compte deviendrait inutilisable. */
function planUpdate(current: ReceivingAccount, body: UpdateReceivingAccountBody, stored: StoredQr | null): UpdatePlan {
  const removeQr = !stored && body.removeQr === true && current.qrFileUrl !== null;
  const data = diffFields(current, body);
  const nextAlias = 'alias' in data ? (data.alias as string | null) : current.alias;
  const nextActive = 'isActive' in data ? (data.isActive as boolean) : current.isActive;
  const nextHasQr = stored ? true : removeQr ? false : current.qrFileUrl !== null;
  if (nextActive && !nextAlias && !nextHasQr) throw incomplete();
  if (stored) Object.assign(data, { qrFileUrl: stored.fileUrl, qrMimeType: stored.mimeType, qrSha256: stored.sha256 });
  if (removeQr) Object.assign(data, { qrFileUrl: null, qrMimeType: null, qrSha256: null });
  return { current, data, removeQr, nextAlias, nextActive, nextHasQr };
}

function conflict(): ConflictError {
  return new ConflictError(
    t('Ce compte vient d’être modifié par quelqu’un d’autre : rechargez la page et recommencez.')
  );
}

/** Le formulaire a été ouvert sur une version périmée : un autre utilisateur a écrit depuis. */
function isStale(current: ReceivingAccount, expectedUpdatedAt: string | undefined): boolean {
  if (expectedUpdatedAt === undefined) return false;
  return new Date(expectedUpdatedAt).getTime() !== current.updatedAt.getTime();
}

/**
 * Lecture et écriture dans UNE transaction. 409 sans rien écrire si la version envoyée par le formulaire
 * (`expectedUpdatedAt`) n'est plus celle de la ligne, ou si la ligne a bougé entre la lecture et l'écriture
 * (`updatedAt` dans le `where`). `null` : rien à changer.
 */
async function applyUpdate(
  tenantId: string,
  target: ReceivingAccountTarget,
  accountId: string,
  body: UpdateReceivingAccountBody,
  stored: StoredQr | null
): Promise<UpdatePlan | null> {
  return prisma.$transaction(async tx => {
    const current = await tx.receivingAccount.findFirst({ where: { id: accountId, ...whereTarget(tenantId, target) } });
    if (!current) throw notFound();
    if (isStale(current, body.expectedUpdatedAt)) throw conflict();
    const plan = planUpdate(current, body, stored);
    if (Object.keys(plan.data).length === 0) return null;
    const result = await tx.receivingAccount.updateMany({
      where: { id: current.id, ...whereTarget(tenantId, target), updatedAt: current.updatedAt },
      // Posé explicitement : `updateMany` ne doit pas dépendre du comportement implicite de `@updatedAt`.
      // Toujours postérieur à la version lue, même dans la même milliseconde : sinon la version ne bougerait pas.
      data: { ...plan.data, updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) }
    });
    if (result.count === 0) throw conflict();
    return plan;
  });
}

function updateAuditPayload(target: ReceivingAccountTarget, plan: UpdatePlan) {
  const { current, data } = plan;
  const next = (field: (typeof TEXT_FIELDS)[number]) => (field in data ? data[field] : current[field]);
  return auditPayload(target, {
    institution: next('institution'),
    previousAlias: current.alias,
    newAlias: plan.nextAlias,
    hadQr: current.qrFileUrl !== null,
    hasQr: plan.nextHasQr,
    sortOrder: (data.sortOrder as number | undefined) ?? current.sortOrder,
    isActive: plan.nextActive,
    previousValues: Object.fromEntries(TEXT_FIELDS.map(field => [field, current[field]])),
    newValues: Object.fromEntries(TEXT_FIELDS.map(field => [field, next(field)])),
    changedFields: Object.keys(data).filter(key => !key.startsWith('qr'))
  });
}

export async function updateReceivingAccount(
  params: Actor & { accountId: string; body: UpdateReceivingAccountBody; file?: UploadedQr }
): Promise<ReceivingAccountAdmin> {
  const { tenantId, target, actorUserId, accountId } = params;
  await assertTarget(tenantId, target);
  const body = updateReceivingAccountBodySchema.parse(params.body);
  const prepared = params.file ? prepareQr(params.file) : null;
  const stored = prepared ? await writeQr(tenantId, prepared) : null;

  let plan: UpdatePlan | null;
  try {
    plan = await applyUpdate(tenantId, target, accountId, body, stored);
  } catch (error) {
    await deleteQrQuietly(tenantId, stored?.fileUrl);
    throw error;
  }
  if (!plan) return loadAdminView(tenantId, target, accountId);
  const { current, data } = plan;
  if (stored || plan.removeQr) await deleteQrQuietly(tenantId, current.qrFileUrl);

  const payload = updateAuditPayload(target, plan);
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.RECEIVING_ACCOUNT_UPDATED,
    entityType: 'RECEIVING_ACCOUNT',
    entityId: current.id,
    payload
  });
  const institution = (data.institution as string | undefined) ?? current.institution;
  const newHolder = (data.holderName as string | undefined) ?? current.holderName;
  const changes = changesOf(current, data, Boolean(stored) || plan.removeQr);
  if (changes.length > 0) {
    notifyReceivingAccountChanged({
      tenantId,
      actorUserId,
      scope: target.scope,
      syndicateId: target.syndicateId,
      institution,
      changes,
      previousAlias: current.alias,
      newAlias: plan.nextAlias,
      hadQr: current.qrFileUrl !== null,
      hasQr: plan.nextHasQr,
      previousHolderName: current.holderName,
      newHolderName: newHolder
    });
  }
  return loadAdminView(tenantId, target, current.id);
}

/**
 * Lecture et suppression dans UNE transaction. Le `deleteMany` exige le `qrFileUrl` lu : si un remplacement
 * concurrent du QR a changé le fichier entre-temps, rien n'est supprimé (409) ; sinon le fichier supprimé
 * ensuite est bien celui de la ligne supprimée, et aucun fichier ne reste orphelin.
 */
async function removeRow(
  tenantId: string,
  target: ReceivingAccountTarget,
  accountId: string
): Promise<ReceivingAccount> {
  return prisma.$transaction(async tx => {
    const current = await tx.receivingAccount.findFirst({ where: { id: accountId, ...whereTarget(tenantId, target) } });
    if (!current) throw notFound();
    const result = await tx.receivingAccount.deleteMany({
      where: { id: current.id, ...whereTarget(tenantId, target), qrFileUrl: current.qrFileUrl }
    });
    if (result.count === 0) throw conflict();
    return current;
  });
}

/** Suppression de la ligne et du fichier ; l'audit garde l'historique. */
export async function deleteReceivingAccount(params: Actor & { accountId: string }): Promise<void> {
  const { tenantId, target, actorUserId, accountId } = params;
  await assertTarget(tenantId, target);
  const current = await removeRow(tenantId, target, accountId);
  await deleteQrQuietly(tenantId, current.qrFileUrl);

  const hadQr = current.qrFileUrl !== null;
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.RECEIVING_ACCOUNT_DELETED,
    entityType: 'RECEIVING_ACCOUNT',
    entityId: current.id,
    payload: auditPayload(target, {
      institution: current.institution,
      previousAlias: current.alias,
      newAlias: null,
      hadQr,
      hasQr: false,
      sortOrder: current.sortOrder,
      isActive: current.isActive
    })
  });
  notifyReceivingAccountChanged({
    tenantId,
    actorUserId,
    scope: target.scope,
    syndicateId: target.syndicateId,
    institution: current.institution,
    changes: ['DELETED'],
    previousAlias: current.alias,
    newAlias: null,
    hadQr,
    hasQr: false,
    previousHolderName: current.holderName,
    newHolderName: null
  });
}

/** Image d'un compte de la cible (gestion : actif ou non). */
export async function readReceivingAccountQr(
  tenantId: string,
  target: ReceivingAccountTarget,
  accountId: string
): Promise<PrivateFile> {
  await assertTarget(tenantId, target);
  const row = await loadOwned(tenantId, target, accountId);
  if (!row.qrFileUrl) throw new NotFoundError(t('Image introuvable.'));
  return readQr(tenantId, row.qrFileUrl);
}
