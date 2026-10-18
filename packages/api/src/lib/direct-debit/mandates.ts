import type { Prisma } from '@prisma/client';
import { t } from '../../i18n';
import { BadRequestError, ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { logAuditEvent, recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { prisma } from '../../utils/database';
import { assertBelongsToTenant } from '../../utils/tenant-ownership';
import { decryptIban, encryptIban, isIbanEncryptionAvailable } from './iban-crypto';
import { nextSequenceTx } from '../sales/numbering';
import {
  loadMandateDto,
  MANDATE_SELECT,
  OPEN_MANDATE_STATUSES,
  referenceOf,
  resolveDebtorNames,
  toMandateDto,
  type IbanCheckDto,
  type MandateDto,
  type MandateStatus
} from './dto';
import { parseIbanInput } from './iban';
import { assertMandateScan, readMandateScan, removeMandateScan, storeMandateScan } from './mandate-files';
import type {
  ActivateMandateInput,
  CreateMandateInput,
  ListMandatesQuery,
  RevokeMandateInput,
  SuspendMandateInput,
  UpdateMandateInput
} from './schemas';
import type { PrivateFile } from '../files/private-files';

/**
 * Mandats de prélèvement bancaire (spec 042, PB2 et PB3).
 *
 * - Toute lecture est filtrée par `tenantId` ; toute référence reçue
 *   (créancier, bail, débiteur) est vérifiée comme appartenant à l'agence, et
 *   une référence d'une autre agence lève la même `NotFoundError` qu'un objet
 *   inexistant.
 * - L'IBAN complet n'existe en clair que le temps de le chiffrer à la
 *   création, et dans le PDF d'autorisation (`authorization-pdf.ts`). Il ne
 *   figure dans aucune réponse, aucun journal, aucune charge utile d'audit :
 *   seulement `bankCode` et `last4Digits` (clé non masquée par le filtre « iban » de l audit).
 * - Les transitions de statut s'écrivent par `updateMany` gardé sur le statut
 *   lu : deux requêtes concurrentes ne peuvent pas toutes deux réussir.
 */

export interface UploadedScan {
  buffer: Buffer;
  originalname?: string;
}

const MAX_SEQUENCE_ATTEMPTS = 3;

const encryptionUnavailable = () =>
  new BadRequestError(t("Le chiffrement des coordonnées bancaires n'est pas configuré sur ce serveur."));
const notFoundMandate = () => new NotFoundError(t('Mandat introuvable.'));
const openMandateExists = () => new ConflictError(t('Un mandat ouvert existe déjà pour ce bail et ce créancier.'));

function statusLabel(status: MandateStatus): string {
  switch (status) {
    case 'DRAFT':
      return t('en attente de signature');
    case 'ACTIVE':
      return t('actif');
    case 'SUSPENDED':
      return t('suspendu');
    default:
      return t('révoqué');
  }
}

function uniqueViolationTarget(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || (error as { code?: string }).code !== 'P2002') return null;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) ? target.join(',') : String(target ?? '');
}

/** PB2-R3 : contrôle d'un IBAN ou RIB, sans rien enregistrer. Ne renvoie que le masque. */
export function checkIban(raw: string): IbanCheckDto {
  const parsed = parseIbanInput(raw);
  if (!parsed.ok) {
    return { valid: false, ibanMasked: null, bankCode: null, error: parsed.error, warnings: [] };
  }
  return { valid: true, ibanMasked: parsed.masked, bankCode: parsed.bankCode, error: null, warnings: parsed.warnings };
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function listMandates(
  tenantId: string,
  query: ListMandatesQuery
): Promise<{ items: MandateDto[]; total: number; page: number; pageSize: number }> {
  const where: Prisma.DirectDebitMandateWhereInput = { tenantId };
  if (query.leaseId) where.leaseId = query.leaseId;
  if (query.debtorClientId) where.debtorClientId = query.debtorClientId;
  if (query.creditorId) where.creditorId = query.creditorId;
  if (query.status) where.status = query.status;
  if (query.search) {
    const search = query.search;
    const or: Prisma.DirectDebitMandateWhereInput[] = [
      { holderName: { contains: search, mode: 'insensitive' } },
      { lease: { is: { lease_number: { contains: search, mode: 'insensitive' } } } },
      { debtor: { is: { user: { is: { fullName: { contains: search, mode: 'insensitive' } } } } } }
    ];
    const reference = /^MDT-(\d{4})-(\d{1,6})$/i.exec(search);
    if (reference) or.push({ year: Number(reference[1]), sequence: Number(reference[2]) });
    if (/^\d{4}$/.test(search)) or.push({ ibanLast4: search });
    where.OR = or;
  }

  const [total, rows] = await Promise.all([
    prisma.directDebitMandate.count({ where }),
    prisma.directDebitMandate.findMany({
      where,
      select: MANDATE_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    })
  ]);

  const names = await resolveDebtorNames(
    prisma,
    tenantId,
    rows.map(row => row.debtor)
  );
  return {
    items: rows.map(row => toMandateDto(row, names.get(row.debtor.id) ?? null)),
    total,
    page: query.page,
    pageSize: query.pageSize
  };
}

export async function getMandate(tenantId: string, mandateId: string): Promise<MandateDto> {
  const dto = await loadMandateDto(prisma, tenantId, mandateId);
  if (!dto) throw notFoundMandate();
  return dto;
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

export async function createMandate(
  tenantId: string,
  input: CreateMandateInput,
  actorUserId?: string | null
): Promise<{ mandate: MandateDto; warnings: string[] }> {
  const parsed = parseIbanInput(input.iban);
  if (!parsed.ok) throw new BadRequestError(parsed.error);
  // Sans clé de chiffrement valide, rien n'est écrit (PB2-R4).
  if (!isIbanEncryptionAvailable()) throw encryptionUnavailable();
  const ibanEncrypted = encryptIban(parsed.iban);
  const year = new Date().getFullYear();

  let createdId: string | null = null;
  for (let attempt = 1; attempt <= MAX_SEQUENCE_ATTEMPTS && !createdId; attempt += 1) {
    try {
      createdId = await prisma.$transaction(async tx => {
        const creditor = await tx.directDebitCreditor.findFirst({
          where: { id: input.creditorId, tenantId },
          select: { id: true, isActive: true }
        });
        if (!creditor) throw new NotFoundError(t('Créancier introuvable.'));

        await assertBelongsToTenant(tx, 'rentalLease', input.leaseId, tenantId, {
          tenantField: 'tenant_id',
          message: t('Bail introuvable.')
        });
        await assertBelongsToTenant(tx, 'tenantClient', input.debtorClientId, tenantId, {
          message: t('Débiteur introuvable.')
        });

        const lease = await tx.rentalLease.findFirst({
          where: { id: input.leaseId, tenant_id: tenantId },
          select: {
            status: true,
            primary_renter_client_id: true,
            coRenters: { select: { renter_client_id: true } }
          }
        });
        if (!lease) throw new NotFoundError(t('Bail introuvable.'));

        // PB2-R9 : un bail terminé ou résilié n'accepte pas de nouveau mandat.
        if (lease.status === 'ENDED' || lease.status === 'CANCELED') {
          throw new BadRequestError(t('Ce bail est terminé ou résilié : un nouveau mandat ne peut pas y être créé.'));
        }
        if (!creditor.isActive) {
          throw new BadRequestError(t('Ce créancier est désactivé : choisissez-en un autre.'));
        }
        // PB2-R1 : le débiteur est le locataire principal ou un colocataire du bail.
        const parties = new Set([lease.primary_renter_client_id, ...lease.coRenters.map(c => c.renter_client_id)]);
        if (!parties.has(input.debtorClientId)) {
          throw new BadRequestError(t("Le débiteur n'est ni le locataire principal ni un colocataire de ce bail."));
        }

        // PB2-R7 : un seul mandat ouvert par (bail, créancier).
        const openSlotKey = `${input.leaseId}:${creditor.id}`;
        const open = await tx.directDebitMandate.findFirst({
          where: { tenantId, openSlotKey },
          select: { id: true }
        });
        if (open) throw openMandateExists();

        const sequence = await nextSequenceTx(tx.directDebitMandate, tenantId, year);
        const created = await tx.directDebitMandate.create({
          data: {
            tenantId,
            year,
            sequence,
            scope: 'RENTAL_LEASE',
            creditorId: creditor.id,
            debtorClientId: input.debtorClientId,
            leaseId: input.leaseId,
            status: 'DRAFT',
            ibanEncrypted,
            ibanBankCode: parsed.bankCode,
            ibanLast4: parsed.last4,
            holderName: input.holderName,
            maxAmount: input.maxAmount ?? null,
            collectionDay: input.collectionDay ?? null,
            openSlotKey,
            notes: input.notes ?? null,
            createdByUserId: actorUserId ?? null
          },
          select: { id: true }
        });

        await recordAuditEvent(tx, {
          actorUserId: actorUserId ?? null,
          tenantId,
          actionKey: AuditActionKey.DIRECT_DEBIT_MANDATE_CREATED,
          entityType: 'DirectDebitMandate',
          entityId: created.id,
          payload: {
            reference: referenceOf(year, sequence),
            creditorId: creditor.id,
            leaseId: input.leaseId,
            debtorClientId: input.debtorClientId,
            bankCode: parsed.bankCode,
            last4Digits: parsed.last4
          }
        });
        return created.id;
      });
    } catch (error) {
      const target = uniqueViolationTarget(error);
      if (target === null) throw error;
      if (target.includes('open_slot_key') || target.includes('openSlotKey')) throw openMandateExists();
      // Séquence prise entre-temps par une requête concurrente : on retente.
      if (attempt === MAX_SEQUENCE_ATTEMPTS) throw new ConflictError(t('Réessayez : la numérotation est occupée.'));
    }
  }

  const mandate = await getMandate(tenantId, createdId as string);
  return { mandate, warnings: parsed.warnings };
}

// ---------------------------------------------------------------------------
// Modification (champs non bancaires)
// ---------------------------------------------------------------------------

export async function updateMandate(
  tenantId: string,
  mandateId: string,
  input: UpdateMandateInput,
  actorUserId?: string | null
): Promise<MandateDto> {
  const current = await prisma.directDebitMandate.findFirst({
    where: { id: mandateId, tenantId },
    select: { status: true, maxAmount: true, collectionDay: true, notes: true }
  });
  if (!current) throw notFoundMandate();
  if (current.status === 'REVOKED') {
    throw new ConflictError(t('Un mandat révoqué ne peut plus être modifié.'));
  }

  const data: Prisma.DirectDebitMandateUncheckedUpdateManyInput = {};
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  if (
    input.maxAmount !== undefined &&
    input.maxAmount !== (current.maxAmount === null ? null : Number(current.maxAmount))
  ) {
    data.maxAmount = input.maxAmount;
    changes.maxAmount = {
      before: current.maxAmount === null ? null : Number(current.maxAmount),
      after: input.maxAmount
    };
  }
  if (input.collectionDay !== undefined && input.collectionDay !== current.collectionDay) {
    data.collectionDay = input.collectionDay;
    changes.collectionDay = { before: current.collectionDay, after: input.collectionDay };
  }
  if (input.notes !== undefined && input.notes !== current.notes) {
    data.notes = input.notes;
    changes.notes = { before: current.notes, after: input.notes };
  }

  if (Object.keys(data).length > 0) {
    const result = await prisma.directDebitMandate.updateMany({
      where: { id: mandateId, tenantId, status: { not: 'REVOKED' } },
      data
    });
    if (result.count === 0) throw new ConflictError(t('Un mandat révoqué ne peut plus être modifié.'));
    logAuditEvent({
      actorUserId: actorUserId ?? null,
      tenantId,
      actionKey: AuditActionKey.DIRECT_DEBIT_MANDATE_UPDATED,
      entityType: 'DirectDebitMandate',
      entityId: mandateId,
      payload: { fields: Object.keys(changes) },
      changes
    });
  }
  return getMandate(tenantId, mandateId);
}

// ---------------------------------------------------------------------------
// Transitions de statut (PB2-R6)
// ---------------------------------------------------------------------------

interface TransitionPlan {
  from: MandateStatus[];
  to: MandateStatus;
  auditKey: AuditActionKey;
  data: Prisma.DirectDebitMandateUncheckedUpdateManyInput;
  payload?: Record<string, unknown>;
}

async function applyTransition(
  tenantId: string,
  mandateId: string,
  actorUserId: string | null | undefined,
  plan: (current: { status: MandateStatus; signedScanUrl: string | null }) => TransitionPlan
): Promise<MandateDto> {
  await prisma.$transaction(async tx => {
    const current = await tx.directDebitMandate.findFirst({
      where: { id: mandateId, tenantId },
      select: { status: true, year: true, sequence: true, ibanBankCode: true, ibanLast4: true, signedScanUrl: true }
    });
    if (!current) throw notFoundMandate();

    const step = plan({ status: current.status, signedScanUrl: current.signedScanUrl });
    if (!step.from.includes(current.status)) {
      throw new ConflictError(
        t('Transition impossible : le mandat est {{status}}.', { status: statusLabel(current.status) })
      );
    }

    // Garde de concurrence : la mise à jour ne réussit que si le statut lu n'a pas bougé.
    const result = await tx.directDebitMandate.updateMany({
      where: { id: mandateId, tenantId, status: current.status },
      data: { ...step.data, status: step.to }
    });
    if (result.count === 0) {
      throw new ConflictError(t("Le mandat vient d'être modifié : rechargez la page."));
    }

    await recordAuditEvent(tx, {
      actorUserId: actorUserId ?? null,
      tenantId,
      actionKey: step.auditKey,
      entityType: 'DirectDebitMandate',
      entityId: mandateId,
      payload: {
        reference: referenceOf(current.year, current.sequence),
        from: current.status,
        to: step.to,
        bankCode: current.ibanBankCode,
        last4Digits: current.ibanLast4,
        ...step.payload
      }
    });
  });
  return getMandate(tenantId, mandateId);
}

/** DRAFT → ACTIVE : exige le scan signé déposé et la date de signature. */
export function activateMandate(
  tenantId: string,
  mandateId: string,
  input: ActivateMandateInput,
  actorUserId?: string | null
): Promise<MandateDto> {
  return applyTransition(tenantId, mandateId, actorUserId, current => {
    if (current.status === 'DRAFT' && !current.signedScanUrl) {
      throw new BadRequestError(t("Déposez le scan de l'autorisation signée avant d'activer le mandat."));
    }
    return {
      from: ['DRAFT'],
      to: 'ACTIVE',
      auditKey: AuditActionKey.DIRECT_DEBIT_MANDATE_ACTIVATED,
      data: { signedAt: input.signedAt, activatedAt: new Date() },
      payload: { signedAt: input.signedAt.toISOString() }
    };
  });
}

/** ACTIVE → SUSPENDED (motif obligatoire). */
export function suspendMandate(
  tenantId: string,
  mandateId: string,
  input: SuspendMandateInput,
  actorUserId?: string | null
): Promise<MandateDto> {
  return applyTransition(tenantId, mandateId, actorUserId, () => ({
    from: ['ACTIVE'],
    to: 'SUSPENDED',
    auditKey: AuditActionKey.DIRECT_DEBIT_MANDATE_SUSPENDED,
    data: { suspendedAt: new Date(), suspensionReason: input.reason },
    payload: { reason: input.reason }
  }));
}

/** SUSPENDED → ACTIVE : le compteur de rejets repart de zéro. */
export function reactivateMandate(
  tenantId: string,
  mandateId: string,
  actorUserId?: string | null
): Promise<MandateDto> {
  return applyTransition(tenantId, mandateId, actorUserId, () => ({
    from: ['SUSPENDED'],
    to: 'ACTIVE',
    auditKey: AuditActionKey.DIRECT_DEBIT_MANDATE_REACTIVATED,
    data: { suspendedAt: null, suspensionReason: null, consecutiveRejects: 0 }
  }));
}

/** DRAFT | ACTIVE | SUSPENDED → REVOKED : définitif, libère l'emplacement (bail, créancier). */
export function revokeMandate(
  tenantId: string,
  mandateId: string,
  input: RevokeMandateInput,
  actorUserId?: string | null
): Promise<MandateDto> {
  const revokedAt = input.revokedAt ?? new Date();
  return applyTransition(tenantId, mandateId, actorUserId, () => ({
    from: [...OPEN_MANDATE_STATUSES],
    to: 'REVOKED',
    auditKey: AuditActionKey.DIRECT_DEBIT_MANDATE_REVOKED,
    data: { revokedAt, revocationReason: input.reason, openSlotKey: null },
    payload: { reason: input.reason, revokedAt: revokedAt.toISOString() }
  }));
}

// ---------------------------------------------------------------------------
// Scan signé (PB3-R2)
// ---------------------------------------------------------------------------

/**
 * Dépose ou remplace le scan. Le nouveau fichier est écrit d'abord ; la base
 * est mise à jour sous garde de statut ; si la transaction échoue, le nouveau
 * fichier est retiré. L'ancien n'est supprimé qu'une fois la transaction
 * validée (son chemin reste dans l'audit).
 */
export async function uploadSignedScan(
  tenantId: string,
  mandateId: string,
  file: UploadedScan | undefined,
  actorUserId?: string | null
): Promise<MandateDto> {
  const existing = await prisma.directDebitMandate.findFirst({
    where: { id: mandateId, tenantId },
    select: { status: true }
  });
  if (!existing) throw notFoundMandate();
  if (existing.status === 'REVOKED') {
    throw new ConflictError(t('Un mandat révoqué ne peut plus recevoir de scan.'));
  }
  if (existing.status !== 'DRAFT')
    throw new ConflictError(
      t('Le scan signé ne se dépose que sur un mandat en brouillon : révoquez ce mandat et créez-en un autre.')
    );

  const kind = assertMandateScan(file?.buffer);
  const storedPath = await storeMandateScan(tenantId, mandateId, (file as UploadedScan).buffer, kind);

  let previousPath: string | null;
  try {
    previousPath = await prisma.$transaction(async tx => {
      const current = await tx.directDebitMandate.findFirst({
        where: { id: mandateId, tenantId },
        select: { status: true, year: true, sequence: true, signedScanUrl: true, ibanBankCode: true, ibanLast4: true }
      });
      if (!current) throw notFoundMandate();
      if (current.status === 'REVOKED') {
        throw new ConflictError(t('Un mandat révoqué ne peut plus recevoir de scan.'));
      }
      if (current.status !== 'DRAFT')
        throw new ConflictError(
          t('Le scan signé ne se dépose que sur un mandat en brouillon : révoquez ce mandat et créez-en un autre.')
        );
      // Condition sur le scan lu : deux dépôts concurrents ne laissent pas de fichier orphelin.
      const result = await tx.directDebitMandate.updateMany({
        where: { id: mandateId, tenantId, status: current.status, signedScanUrl: current.signedScanUrl },
        data: { signedScanUrl: storedPath, signedScanUploadedAt: new Date() }
      });
      if (result.count === 0) {
        throw new ConflictError(t("Le mandat vient d'être modifié : rechargez la page."));
      }
      await recordAuditEvent(tx, {
        actorUserId: actorUserId ?? null,
        tenantId,
        actionKey: AuditActionKey.DIRECT_DEBIT_MANDATE_SCAN_UPLOADED,
        entityType: 'DirectDebitMandate',
        entityId: mandateId,
        payload: {
          reference: referenceOf(current.year, current.sequence),
          bankCode: current.ibanBankCode,
          last4Digits: current.ibanLast4,
          replaced: Boolean(current.signedScanUrl)
        }
      });
      return current.signedScanUrl;
    });
  } catch (error) {
    await removeMandateScan(tenantId, mandateId, storedPath);
    throw error;
  }

  if (previousPath) await removeMandateScan(tenantId, mandateId, previousPath);
  return getMandate(tenantId, mandateId);
}

/** Lit le scan d'un mandat de l'agence. Toute situation d'échec répond la même 404. */
export async function getSignedScanFile(tenantId: string, mandateId: string): Promise<PrivateFile> {
  const row = await prisma.directDebitMandate.findFirst({
    where: { id: mandateId, tenantId },
    select: { id: true, tenantId: true, year: true, sequence: true, signedScanUrl: true }
  });
  if (!row || !row.signedScanUrl) throw new NotFoundError(t('Scan signé introuvable.'));
  return readMandateScan({
    tenantId: row.tenantId,
    id: row.id,
    signedScanUrl: row.signedScanUrl,
    reference: referenceOf(row.year, row.sequence)
  });
}

// ---------------------------------------------------------------------------
// IBAN en clair : réservé au PDF d'autorisation
// ---------------------------------------------------------------------------

/**
 * Déchiffre l'IBAN d'un mandat de l'agence. À n'appeler que pour dessiner le
 * PDF d'autorisation ; la valeur ne doit jamais être journalisée ni renvoyée.
 */
export function decryptMandateIban(ibanEncrypted: string): string {
  // Pas besoin de la clé courante : une valeur d'une ancienne clé ou de
  // l'ancien format pg1 reste lisible. Toute défaillance lève « Les
  // coordonnées bancaires de ce mandat ne peuvent pas être lues. ».
  return decryptIban(ibanEncrypted);
}
