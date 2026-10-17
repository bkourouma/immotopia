import type { Prisma } from '@prisma/client';
import { t } from '../../i18n';
import { BadRequestError, ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { nextSequenceTx } from '../sales/numbering';
import { checkCollectionDate, formatFrenchDate, prenotificationDeadline, todayUtc, toIsoDate } from './business-days';
import { resolveDebtorNames, type DbClient } from './dto';
import { assertFileDigestAvailable, computeRemittanceFileDigest } from './file-digest';
import { getFileAdapter, type DirectDebitFileFormatKey } from './file-formats';
import { decryptMandateIban } from './mandates';
import { startRemittancePrenotifications } from './prenotification';
import {
  REMITTANCE_SUMMARY_SELECT,
  lineReferenceOf,
  loadRemittanceDto,
  mandateReferenceOf,
  remittanceReferenceOf,
  toRemittanceSummaryDto,
  type PrenotificationSummaryDto,
  type RemittanceDto,
  type RemittanceStatus,
  type RemittanceSummaryDto,
  type SkippedMandateDto
} from './remittance-dto';
import type { CreateRemittanceInput, ListRemittancesQuery } from './remittance-schemas';
import { evaluateMandate, roundMoney, sameMoney, type SelectionResult, type SkipReason } from './remittance-selection';

/**
 * Remises de prélèvement des loyers (spec 042, P2, data-model §7).
 *
 * - Toute lecture et toute écriture est filtrée par tenantId ; un identifiant
 *   reçu (créancier, remise, ligne) qui n est pas de l agence lève la même
 *   NotFoundError qu un objet inexistant.
 * - Une échéance ne figure que dans une seule ligne non annulée : la
 *   contrainte d unicité sur activeKey est la garantie, la lecture préalable
 *   n est qu un confort (une violation P2002 devient une ConflictError).
 * - Les transitions de statut verrouillent la ligne de la remise par une mise
 *   à jour conditionnelle sur le statut lu : deux requêtes concurrentes ne
 *   peuvent pas toutes deux réussir, et les écritures de lignes sont sérialisées.
 * - L IBAN complet n est déchiffré que dans l export, jamais renvoyé, jamais
 *   journalisé ni écrit sur disque.
 */

type Tx = PrismaTransactionClient;

const MAX_SEQUENCE_ATTEMPTS = 3;

/** Écritures longues (création, actualisation, validation d'une remise de centaines de lignes). */
const WRITE_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

const notFoundRemittance = () => new NotFoundError(t('Remise introuvable.'));
const notFoundLine = () => new NotFoundError(t('Ligne de remise introuvable.'));
const reloadConflict = () => new ConflictError(t("La remise vient d'être modifiée : rechargez la page."));
const installmentTaken = () =>
  new ConflictError(t('Une échéance figure déjà dans une autre remise : actualisez puis réessayez.'));
const collectionDatePassed = () =>
  new ConflictError(t('La date de prélèvement est passée : annulez cette remise et préparez-en une nouvelle.'));

/** Vocabulaire de l'écran : brouillon, validée, fichier produit, déposée à la banque, annulée. */
function statusLabel(status: RemittanceStatus): string {
  switch (status) {
    case 'DRAFT':
      return t('brouillon');
    case 'VALIDATED':
      return t('validée');
    case 'EXPORTED':
      return t('fichier produit');
    case 'SUBMITTED':
      return t('déposée à la banque');
    default:
      return t('annulée');
  }
}

const transitionImpossible = (status: RemittanceStatus) =>
  new ConflictError(
    t('Transition impossible : la remise est au statut « {{status}} ».', { status: statusLabel(status) })
  );

function uniqueViolationTarget(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || (error as { code?: string }).code !== 'P2002') return null;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) ? target.join(',') : String(target ?? '');
}

const isActiveKeyViolation = (target: string | null) =>
  target !== null && (target.includes('active_key') || target.includes('activeKey'));

interface CreditorInfo {
  id: string;
  label: string;
  creditorIdentifier: string | null;
  isActive: boolean;
  collectionDay: number;
  prenotificationBusinessDays: number;
  fileFormat: DirectDebitFileFormatKey;
}

const CREDITOR_INFO_SELECT = {
  id: true,
  label: true,
  creditorIdentifier: true,
  isActive: true,
  collectionDay: true,
  prenotificationBusinessDays: true,
  fileFormat: true
} satisfies Prisma.DirectDebitCreditorSelect;

// ---------------------------------------------------------------------------
// Sélection des échéances (lecture + règles pures de remittance-selection.ts)
// ---------------------------------------------------------------------------

interface Candidate {
  mandateId: string;
  mandateReference: string;
  leaseId: string | null;
  leaseNumber: string | null;
  debtorClientId: string | null;
  debtorName: string | null;
  installmentId: string | null;
  result: SelectionResult;
}

/**
 * Évalue tous les mandats ACTIVE du créancier pour la période de la date de
 * collecte. ownRemittanceId : les lignes de CETTE remise ne comptent pas comme
 * déjà dans une remise (actualisation, validation).
 */
async function evaluateCandidates(
  db: DbClient,
  tenantId: string,
  creditor: CreditorInfo,
  collectionDate: Date,
  ownRemittanceId: string | null
): Promise<Candidate[]> {
  const mandates = await db.directDebitMandate.findMany({
    // DRAFT et SUSPENDED ne donnent jamais de ligne : ils ne servent qu'à les signaler (MANDATE_NOT_ACTIVE).
    where: {
      tenantId,
      creditorId: creditor.id,
      status: { in: ['ACTIVE', 'DRAFT', 'SUSPENDED'] },
      scope: 'RENTAL_LEASE'
    },
    orderBy: [{ year: 'asc' }, { sequence: 'asc' }],
    select: {
      id: true,
      status: true,
      year: true,
      sequence: true,
      leaseId: true,
      debtorClientId: true,
      maxAmount: true,
      collectionDay: true,
      lease: { select: { id: true, lease_number: true, status: true } },
      debtor: { select: { id: true, details: true, user: { select: { fullName: true } } } }
    }
  });
  if (mandates.length === 0) return [];

  const periodYear = collectionDate.getUTCFullYear();
  const periodMonth = collectionDate.getUTCMonth() + 1;
  const leaseIds = mandates
    .filter(mandate => mandate.status === 'ACTIVE')
    .map(mandate => mandate.leaseId)
    .filter((id): id is string => Boolean(id));
  const installments =
    leaseIds.length === 0
      ? []
      : await db.rentalInstallment.findMany({
          where: {
            tenant_id: tenantId,
            lease_id: { in: leaseIds },
            period_year: periodYear,
            period_month: periodMonth
          },
          select: {
            id: true,
            lease_id: true,
            status: true,
            amount_rent: true,
            amount_service: true,
            amount_other_fees: true,
            amount_paid: true
          }
        });
  const installmentByLease = new Map(installments.map(installment => [installment.lease_id, installment]));

  const taken =
    installments.length === 0
      ? []
      : await db.directDebitRemittanceLine.findMany({
          where: {
            tenantId,
            installmentId: { in: installments.map(installment => installment.id) },
            status: 'PENDING',
            ...(ownRemittanceId ? { remittanceId: { not: ownRemittanceId } } : {})
          },
          select: { installmentId: true }
        });
  const takenIds = new Set(taken.map(line => line.installmentId));

  const names = await resolveDebtorNames(
    db,
    tenantId,
    mandates.map(mandate => mandate.debtor)
  );

  return mandates.map(mandate => {
    const active = mandate.status === 'ACTIVE';
    const installment = active && mandate.leaseId ? (installmentByLease.get(mandate.leaseId) ?? null) : null;
    const result: SelectionResult = !active
      ? { kind: 'SKIPPED', reason: 'MANDATE_NOT_ACTIVE' }
      : evaluateMandate({
          mandate: {
            maxAmount: mandate.maxAmount === null ? null : Number(mandate.maxAmount),
            collectionDay: mandate.collectionDay,
            leaseStatus: mandate.lease?.status ?? null
          },
          creditorCollectionDay: creditor.collectionDay,
          collectionDayOfMonth: collectionDate.getUTCDate(),
          installment: installment
            ? {
                status: installment.status,
                amountRent: Number(installment.amount_rent),
                amountService: Number(installment.amount_service),
                amountOtherFees: Number(installment.amount_other_fees),
                amountPaid: Number(installment.amount_paid)
              }
            : null,
          alreadyInRemittance: installment ? takenIds.has(installment.id) : false
        });
    return {
      mandateId: mandate.id,
      mandateReference: mandateReferenceOf(mandate.year, mandate.sequence),
      leaseId: mandate.leaseId,
      leaseNumber: mandate.lease?.lease_number ?? null,
      debtorClientId: mandate.debtorClientId,
      debtorName: mandate.debtor ? (names.get(mandate.debtor.id) ?? null) : null,
      installmentId: installment?.id ?? null,
      result
    };
  });
}

/** Le fichier des remises de copropriété est réalisé en P4 (spec 042 §9.3). */
const failOutsideRental = (): never => {
  throw new Error('Ligne hors périmètre locatif : fichier de copropriété à réaliser (spec 042 §9.3)');
};

type SelectedCandidate = Candidate & {
  leaseId: string;
  installmentId: string;
  result: Extract<SelectionResult, { kind: 'SELECTED' }>;
};

const isSelected = (candidate: Candidate): candidate is SelectedCandidate =>
  candidate.result.kind === 'SELECTED' && candidate.leaseId !== null && candidate.installmentId !== null;

function toSkipped(candidates: Candidate[]): SkippedMandateDto[] {
  return candidates.flatMap(candidate =>
    candidate.result.kind === 'SKIPPED'
      ? [
          {
            mandateId: candidate.mandateId,
            mandateReference: candidate.mandateReference,
            leaseNumber: candidate.leaseNumber,
            debtorName: candidate.debtorName,
            reason: candidate.result.reason
          }
        ]
      : []
  );
}

async function createLines(
  tx: Tx,
  tenantId: string,
  remittanceId: string,
  firstLineNumber: number,
  selected: SelectedCandidate[]
): Promise<void> {
  if (selected.length === 0) return;
  // Un seul aller-retour : une violation d'unicité sur activeKey annule tout le lot.
  await tx.directDebitRemittanceLine.createMany({
    data: selected.map((candidate, index) => ({
      tenantId,
      remittanceId,
      lineNumber: firstLineNumber + index,
      mandateId: candidate.mandateId,
      leaseId: candidate.leaseId,
      installmentId: candidate.installmentId,
      debtorClientId: candidate.debtorClientId,
      status: 'PENDING' as const,
      amount: candidate.result.amount,
      remainingDueAtSelection: candidate.result.remainingDue,
      capped: candidate.result.capped,
      // ADR-007 article 6 : la clé d unicité d une ligne vivante est son échéance.
      activeKey: candidate.installmentId
    }))
  });
}

/** Totaux des lignes PENDING, recalculés dans la transaction de toute écriture de lignes. */
async function recomputeTotals(tx: Tx, tenantId: string, remittanceId: string): Promise<void> {
  const lines = await tx.directDebitRemittanceLine.findMany({
    where: { tenantId, remittanceId, status: 'PENDING' },
    select: { amount: true }
  });
  const total = roundMoney(lines.reduce((sum, line) => sum + Number(line.amount), 0));
  await tx.directDebitRemittance.updateMany({
    where: { id: remittanceId, tenantId },
    data: { lineCount: lines.length, totalAmount: total }
  });
}

interface LockedRemittance {
  id: string;
  year: number;
  sequence: number;
  status: RemittanceStatus;
  collectionDate: Date;
  lineCount: number;
  totalAmount: number;
  creditor: CreditorInfo;
}

/**
 * Lit la remise de l agence puis la verrouille par une mise à jour conditionnelle
 * sur son statut : une transition ou une écriture de lignes concurrente attend,
 * puis échoue en ConflictError si le statut a bougé.
 */
async function lockRemittance(
  tx: Tx,
  tenantId: string,
  remittanceId: string,
  allowed: RemittanceStatus[]
): Promise<LockedRemittance> {
  const row = await tx.directDebitRemittance.findFirst({
    where: { id: remittanceId, tenantId },
    select: {
      id: true,
      year: true,
      sequence: true,
      status: true,
      collectionDate: true,
      lineCount: true,
      totalAmount: true,
      creditor: { select: CREDITOR_INFO_SELECT }
    }
  });
  if (!row) throw notFoundRemittance();
  if (!allowed.includes(row.status)) throw transitionImpossible(row.status);
  const locked = await tx.directDebitRemittance.updateMany({
    where: { id: remittanceId, tenantId, status: row.status },
    data: { updatedAt: new Date() }
  });
  if (locked.count === 0) throw reloadConflict();
  return { ...row, totalAmount: Number(row.totalAmount) };
}

function auditPayload(remittance: {
  year: number;
  sequence: number;
  collectionDate: Date;
  lineCount: number;
  totalAmount: number;
}) {
  return {
    reference: remittanceReferenceOf(remittance.year, remittance.sequence),
    lineCount: remittance.lineCount,
    totalAmount: remittance.totalAmount,
    collectionDate: toIsoDate(remittance.collectionDate)
  };
}

/** Relit les totaux après écriture, pour l audit. */
async function currentTotals(tx: Tx, tenantId: string, remittanceId: string) {
  const row = await tx.directDebitRemittance.findFirst({
    where: { id: remittanceId, tenantId },
    select: { year: true, sequence: true, collectionDate: true, lineCount: true, totalAmount: true }
  });
  if (!row) throw notFoundRemittance();
  return { ...row, totalAmount: Number(row.totalAmount) };
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function listRemittances(
  tenantId: string,
  query: ListRemittancesQuery
): Promise<{ items: RemittanceSummaryDto[]; total: number; page: number; pageSize: number }> {
  const where: Prisma.DirectDebitRemittanceWhereInput = { tenantId };
  if (query.creditorId) where.creditorId = query.creditorId;
  if (query.status) where.status = query.status;
  const [total, rows] = await Promise.all([
    prisma.directDebitRemittance.count({ where }),
    prisma.directDebitRemittance.findMany({
      where,
      select: REMITTANCE_SUMMARY_SELECT,
      orderBy: [{ collectionDate: 'desc' }, { year: 'desc' }, { sequence: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    })
  ]);
  return { items: rows.map(toRemittanceSummaryDto), total, page: query.page, pageSize: query.pageSize };
}

export async function getRemittance(tenantId: string, remittanceId: string): Promise<RemittanceDto> {
  const dto = await loadRemittanceDto(prisma, tenantId, remittanceId);
  if (!dto) throw notFoundRemittance();
  if (dto.status !== 'DRAFT') return dto;
  // Brouillon : les mandats non retenus sont recalculés (lecture seule, rien n'est écrit).
  const remittance = await prisma.directDebitRemittance.findFirst({
    where: { id: remittanceId, tenantId },
    select: { collectionDate: true, creditor: { select: CREDITOR_INFO_SELECT } }
  });
  if (!remittance) throw notFoundRemittance();
  const candidates = await evaluateCandidates(
    prisma,
    tenantId,
    remittance.creditor,
    remittance.collectionDate,
    remittanceId
  );
  const withLine = new Set(dto.lines.map(line => line.mandate.id));
  return { ...dto, skipped: toSkipped(candidates.filter(candidate => !withLine.has(candidate.mandateId))) };
}

// ---------------------------------------------------------------------------
// Création (brouillon)
// ---------------------------------------------------------------------------

const noInstallmentToCollect = () =>
  new BadRequestError(t('Aucune échéance à prélever pour ce créancier à cette date.'));

export async function createRemittance(
  tenantId: string,
  input: CreateRemittanceInput,
  actorUserId?: string | null,
  now: Date = new Date()
): Promise<{ remittance: RemittanceDto; skipped: SkippedMandateDto[] }> {
  const creditor = await prisma.directDebitCreditor.findFirst({
    where: { id: input.creditorId, tenantId },
    select: CREDITOR_INFO_SELECT
  });
  if (!creditor) throw new NotFoundError(t('Créancier introuvable.'));
  if (!creditor.isActive) throw new BadRequestError(t('Ce créancier est désactivé : choisissez-en un autre.'));

  const check = checkCollectionDate(input.collectionDate, creditor.prenotificationBusinessDays, todayUtc(now));
  if (!check.ok) {
    throw new BadRequestError(
      t('Cette date de prélèvement est trop proche : la première date possible est le {{date}}.', {
        date: formatFrenchDate(check.firstPossible)
      })
    );
  }

  const year = now.getUTCFullYear();
  const collectionDate = input.collectionDate;
  let result: { id: string; skipped: SkippedMandateDto[] } | null = null;

  for (let attempt = 1; attempt <= MAX_SEQUENCE_ATTEMPTS && !result; attempt += 1) {
    try {
      result = await prisma.$transaction(async tx => {
        const candidates = await evaluateCandidates(tx, tenantId, creditor, collectionDate, null);
        const selected = candidates.filter(isSelected);
        // Rien n est écrit si aucune ligne ne se présente.
        if (selected.length === 0) throw noInstallmentToCollect();

        const sequence = await nextSequenceTx(tx.directDebitRemittance, tenantId, year);
        const created = await tx.directDebitRemittance.create({
          data: {
            tenantId,
            year,
            sequence,
            scope: 'RENTAL_LEASE',
            creditorId: creditor.id,
            status: 'DRAFT',
            collectionDate,
            prenotificationDeadline: prenotificationDeadline(collectionDate, creditor.prenotificationBusinessDays),
            periodYear: collectionDate.getUTCFullYear(),
            periodMonth: collectionDate.getUTCMonth() + 1,
            notes: input.notes ?? null,
            createdByUserId: actorUserId ?? null
          },
          select: { id: true }
        });
        await createLines(tx, tenantId, created.id, 1, selected);
        await recomputeTotals(tx, tenantId, created.id);
        await recordAuditEvent(tx, {
          actorUserId: actorUserId ?? null,
          tenantId,
          actionKey: AuditActionKey.DIRECT_DEBIT_REMITTANCE_CREATED,
          entityType: 'DirectDebitRemittance',
          entityId: created.id,
          payload: auditPayload(await currentTotals(tx, tenantId, created.id))
        });
        return { id: created.id, skipped: toSkipped(candidates) };
      }, WRITE_TRANSACTION_OPTIONS);
    } catch (error) {
      const target = uniqueViolationTarget(error);
      if (target === null) throw error;
      if (isActiveKeyViolation(target)) throw installmentTaken();
      // Séquence prise entre-temps par une requête concurrente : on retente.
      if (attempt === MAX_SEQUENCE_ATTEMPTS) throw new ConflictError(t('Réessayez : la numérotation est occupée.'));
    }
  }

  const created = result as { id: string; skipped: SkippedMandateDto[] };
  return { remittance: await getRemittance(tenantId, created.id), skipped: created.skipped };
}

// ---------------------------------------------------------------------------
// Actualisation (brouillon)
// ---------------------------------------------------------------------------

function autoCancelReason(reason: SkipReason | 'MANDATE_INELIGIBLE'): string {
  switch (reason) {
    case 'NOTHING_DUE':
      return t('Plus rien à prélever sur cette échéance.');
    case 'LEASE_NOT_ACTIVE':
      return t("Le bail n'est plus actif.");
    case 'NO_INSTALLMENT':
      return t("L'échéance du mois n'existe plus.");
    default:
      return t("Le mandat n'est plus éligible à cette remise.");
  }
}

export async function refreshRemittance(
  tenantId: string,
  remittanceId: string,
  actorUserId?: string | null
): Promise<{ remittance: RemittanceDto; skipped: SkippedMandateDto[] }> {
  let skipped: SkippedMandateDto[];
  try {
    skipped = await prisma.$transaction(async tx => {
      const remittance = await lockRemittance(tx, tenantId, remittanceId, ['DRAFT']);
      // Le délai de prénotification du créancier a pu changer depuis la création.
      await tx.directDebitRemittance.updateMany({
        where: { id: remittanceId, tenantId, status: 'DRAFT' },
        data: {
          prenotificationDeadline: prenotificationDeadline(
            remittance.collectionDate,
            remittance.creditor.prenotificationBusinessDays
          )
        }
      });
      const candidates = await evaluateCandidates(
        tx,
        tenantId,
        remittance.creditor,
        remittance.collectionDate,
        remittanceId
      );
      const byMandate = new Map(candidates.map(candidate => [candidate.mandateId, candidate]));
      const lines = await tx.directDebitRemittanceLine.findMany({
        where: { tenantId, remittanceId },
        select: {
          id: true,
          lineNumber: true,
          status: true,
          mandateId: true,
          amount: true,
          remainingDueAtSelection: true,
          capped: true
        }
      });

      let canceled = 0;
      let updated = 0;
      for (const line of lines.filter(entry => entry.status === 'PENDING')) {
        const candidate = byMandate.get(line.mandateId);
        if (!candidate || candidate.result.kind === 'SKIPPED') {
          await tx.directDebitRemittanceLine.updateMany({
            where: { id: line.id, tenantId, remittanceId, status: 'PENDING' },
            data: {
              status: 'CANCELED',
              activeKey: null,
              canceledAt: new Date(),
              cancellationReason: autoCancelReason(
                candidate?.result.kind === 'SKIPPED' ? candidate.result.reason : 'MANDATE_INELIGIBLE'
              )
            }
          });
          canceled += 1;
        } else if (
          !sameMoney(Number(line.amount), candidate.result.amount) ||
          !sameMoney(Number(line.remainingDueAtSelection), candidate.result.remainingDue) ||
          line.capped !== candidate.result.capped
        ) {
          await tx.directDebitRemittanceLine.updateMany({
            where: { id: line.id, tenantId, remittanceId, status: 'PENDING' },
            data: {
              amount: candidate.result.amount,
              remainingDueAtSelection: candidate.result.remainingDue,
              capped: candidate.result.capped
            }
          });
          updated += 1;
        }
      }

      // Un mandat qui a déjà une ligne dans cette remise (même retirée) n y est pas rajouté.
      const withLine = new Set(lines.map(line => line.mandateId));
      const fresh = candidates.filter(candidate => !withLine.has(candidate.mandateId));
      const toAdd = fresh.filter(isSelected);
      const nextNumber = lines.reduce((max, line) => Math.max(max, line.lineNumber), 0) + 1;
      await createLines(tx, tenantId, remittanceId, nextNumber, toAdd);
      await recomputeTotals(tx, tenantId, remittanceId);
      await recordAuditEvent(tx, {
        actorUserId: actorUserId ?? null,
        tenantId,
        actionKey: AuditActionKey.DIRECT_DEBIT_REMITTANCE_REFRESHED,
        entityType: 'DirectDebitRemittance',
        entityId: remittanceId,
        payload: {
          ...auditPayload(await currentTotals(tx, tenantId, remittanceId)),
          added: toAdd.length,
          updated,
          canceled
        }
      });
      return toSkipped(fresh);
    }, WRITE_TRANSACTION_OPTIONS);
  } catch (error) {
    if (isActiveKeyViolation(uniqueViolationTarget(error))) throw installmentTaken();
    throw error;
  }
  return { remittance: await getRemittance(tenantId, remittanceId), skipped };
}

// ---------------------------------------------------------------------------
// Retrait d une ligne
// ---------------------------------------------------------------------------

export async function cancelRemittanceLine(
  tenantId: string,
  remittanceId: string,
  lineId: string,
  reason: string | null | undefined,
  actorUserId?: string | null
): Promise<RemittanceDto> {
  await prisma.$transaction(async tx => {
    const remittance = await lockRemittance(tx, tenantId, remittanceId, ['DRAFT', 'VALIDATED']);
    const line = await tx.directDebitRemittanceLine.findFirst({
      where: { id: lineId, remittanceId, tenantId },
      select: {
        id: true,
        lineNumber: true,
        status: true,
        amount: true,
        mandate: { select: { year: true, sequence: true } }
      }
    });
    if (!line) throw notFoundLine();
    if (line.status !== 'PENDING') throw new ConflictError(t('Cette ligne est déjà annulée.'));
    if (remittance.status === 'VALIDATED') {
      const pending = await tx.directDebitRemittanceLine.count({
        where: { tenantId, remittanceId, status: 'PENDING' }
      });
      if (pending <= 1) {
        throw new ConflictError(t("La dernière ligne d'une remise validée ne se retire pas : annulez la remise."));
      }
    }
    const result = await tx.directDebitRemittanceLine.updateMany({
      where: { id: lineId, tenantId, remittanceId, status: 'PENDING' },
      data: { status: 'CANCELED', activeKey: null, canceledAt: new Date(), cancellationReason: reason ?? null }
    });
    if (result.count === 0) throw reloadConflict();
    await recomputeTotals(tx, tenantId, remittanceId);
    await recordAuditEvent(tx, {
      actorUserId: actorUserId ?? null,
      tenantId,
      actionKey: AuditActionKey.DIRECT_DEBIT_REMITTANCE_LINE_CANCELED,
      entityType: 'DirectDebitRemittance',
      entityId: remittanceId,
      payload: {
        ...auditPayload(await currentTotals(tx, tenantId, remittanceId)),
        lineReference: lineReferenceOf(remittance.year, remittance.sequence, line.lineNumber),
        mandateReference: mandateReferenceOf(line.mandate.year, line.mandate.sequence),
        lineAmount: Number(line.amount)
      }
    });
  });
  return getRemittance(tenantId, remittanceId);
}

// ---------------------------------------------------------------------------
// Validation (DRAFT -> VALIDATED) puis prénotifications hors transaction
// ---------------------------------------------------------------------------

export async function validateRemittance(
  tenantId: string,
  remittanceId: string,
  actorUserId?: string | null,
  now: Date = new Date()
): Promise<{ remittance: RemittanceDto; prenotifications: PrenotificationSummaryDto }> {
  await prisma.$transaction(async tx => {
    const remittance = await lockRemittance(tx, tenantId, remittanceId, ['DRAFT']);
    const creditor = remittance.creditor;

    const lines = await tx.directDebitRemittanceLine.findMany({
      where: { tenantId, remittanceId, status: 'PENDING' },
      select: {
        id: true,
        mandateId: true,
        installmentId: true,
        amount: true,
        remainingDueAtSelection: true,
        capped: true,
        mandate: { select: { year: true, sequence: true } }
      }
    });
    if (lines.length === 0) throw new BadRequestError(t('Cette remise ne contient aucune ligne à prélever.'));

    const identifier = creditor.creditorIdentifier?.trim();
    if (!creditor.isActive) {
      throw new BadRequestError(t('Ce créancier est désactivé : réactivez-le ou annulez la remise.'));
    }
    if (!identifier) {
      throw new BadRequestError(t("Renseignez le numéro d'émetteur du créancier avant de valider la remise."));
    }

    // Aujourd'hui doit précéder strictement la date de prélèvement, puis respecter la date limite.
    const today = todayUtc(now);
    if (today.getTime() >= remittance.collectionDate.getTime()) throw collectionDatePassed();
    const deadline = prenotificationDeadline(remittance.collectionDate, creditor.prenotificationBusinessDays);
    if (today.getTime() > deadline.getTime()) {
      throw new ConflictError(
        t(
          'La date limite de prénotification ({{date}}) est dépassée : annulez cette remise et préparez-en une nouvelle.',
          { date: formatFrenchDate(deadline) }
        )
      );
    }

    // Chaque ligne recalculée doit être identique à ce qui a été préparé.
    const candidates = await evaluateCandidates(tx, tenantId, creditor, remittance.collectionDate, remittanceId);
    const byMandate = new Map(candidates.map(candidate => [candidate.mandateId, candidate]));
    for (const line of lines) {
      const candidate = byMandate.get(line.mandateId);
      // Mandat suspendu, révoqué, bail clos, échéance disparue : il n'est plus prélevable.
      if (candidate === undefined || !isSelected(candidate)) {
        throw new ConflictError(
          t("Le mandat {{reference}} n'est plus prélevable : actualisez la remise.", {
            reference: mandateReferenceOf(line.mandate.year, line.mandate.sequence)
          })
        );
      }
      const same =
        candidate.installmentId === line.installmentId &&
        sameMoney(candidate.result.amount, Number(line.amount)) &&
        sameMoney(candidate.result.remainingDue, Number(line.remainingDueAtSelection)) &&
        candidate.result.capped === line.capped;
      if (!same) {
        throw new ConflictError(t('Les montants ont changé depuis la préparation : actualisez la remise.'));
      }
    }

    // Mise à jour conditionnelle sur le statut : deux validations simultanées, une seule passe.
    const result = await tx.directDebitRemittance.updateMany({
      where: { id: remittanceId, tenantId, status: 'DRAFT' },
      data: {
        status: 'VALIDATED',
        validatedAt: now,
        validatedByUserId: actorUserId ?? null,
        fileFormat: creditor.fileFormat,
        creditorLabelSnapshot: creditor.label,
        creditorIdentifierSnapshot: identifier,
        // Figée dès la validation, avec le délai courant du créancier.
        prenotificationDeadline: deadline
      }
    });
    if (result.count === 0) throw reloadConflict();

    await recordAuditEvent(tx, {
      actorUserId: actorUserId ?? null,
      tenantId,
      actionKey: AuditActionKey.DIRECT_DEBIT_REMITTANCE_VALIDATED,
      entityType: 'DirectDebitRemittance',
      entityId: remittanceId,
      payload: { ...auditPayload(await currentTotals(tx, tenantId, remittanceId)), from: 'DRAFT', to: 'VALIDATED' }
    });
  }, WRITE_TRANSACTION_OPTIONS);

  // Après le commit, en arrière-plan : un échec d'envoi ne défait pas la validation
  // et la réponse n'attend pas les e-mails (prénotifications encore PENDING dans le résumé).
  startRemittancePrenotifications(tenantId, remittanceId, actorUserId);
  const remittance = await getRemittance(tenantId, remittanceId);
  return { remittance, prenotifications: remittance.prenotificationSummary };
}

/** Renvoie les prénotifications non envoyées d une remise validée ou exportée, avant la date de collecte. */
export async function resendPrenotifications(
  tenantId: string,
  remittanceId: string,
  actorUserId?: string | null,
  now: Date = new Date()
): Promise<{ remittance: RemittanceDto; prenotifications: PrenotificationSummaryDto }> {
  const row = await prisma.directDebitRemittance.findFirst({
    where: { id: remittanceId, tenantId },
    select: { status: true, collectionDate: true }
  });
  if (!row) throw notFoundRemittance();
  if (row.status !== 'VALIDATED' && row.status !== 'EXPORTED') throw transitionImpossible(row.status);
  if (todayUtc(now).getTime() >= row.collectionDate.getTime()) {
    throw new ConflictError(
      t('La date de prélèvement est atteinte : les prénotifications ne peuvent plus être envoyées.')
    );
  }
  // En arrière-plan, sous verrou par remise : pas de doublon si un envoi est déjà en cours.
  startRemittancePrenotifications(tenantId, remittanceId, actorUserId);
  const remittance = await getRemittance(tenantId, remittanceId);
  return { remittance, prenotifications: remittance.prenotificationSummary };
}

// ---------------------------------------------------------------------------
// Fichier de remise
// ---------------------------------------------------------------------------

export interface RemittanceFile {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}

const EXPORT_SELECT = {
  id: true,
  year: true,
  sequence: true,
  status: true,
  collectionDate: true,
  lineCount: true,
  totalAmount: true,
  exportCount: true,
  firstExportedAt: true,
  updatedAt: true,
  fileFormat: true,
  creditorLabelSnapshot: true,
  creditorIdentifierSnapshot: true,
  lines: {
    // Toutes les lignes non annulées (spec 042 §8.7) : le fichier re-téléchargé reste identique à celui déposé.
    where: { status: { in: ['PENDING', 'SETTLED', 'REJECTED'] } },
    orderBy: { lineNumber: 'asc' },
    select: {
      lineNumber: true,
      amount: true,
      mandate: {
        select: { year: true, sequence: true, status: true, ibanEncrypted: true, holderName: true, signedAt: true }
      },
      lease: { select: { lease_number: true } },
      installment: { select: { period_year: true, period_month: true } }
    }
  }
} satisfies Prisma.DirectDebitRemittanceSelect;

/**
 * Produit le fichier de remise. C est le SEUL endroit où l IBAN complet est
 * déchiffré pour une remise. L audit critique est écrit et validé AVANT que le
 * fichier soit rendu : son échec bloque l envoi. Le fichier n est ni stocké ni
 * journalisé ; seule son empreinte HMAC-SHA-256 (clé dérivée de la clé IBAN,
 * `file-digest.ts`) est gardée : sans clé courante, l export est refusé.
 */
export async function exportRemittance(
  tenantId: string,
  remittanceId: string,
  actorUserId?: string | null,
  now: Date = new Date()
): Promise<RemittanceFile> {
  const remittance = await prisma.directDebitRemittance.findFirst({
    where: { id: remittanceId, tenantId },
    select: EXPORT_SELECT
  });
  if (!remittance) throw notFoundRemittance();
  if (remittance.status !== 'VALIDATED' && remittance.status !== 'EXPORTED' && remittance.status !== 'SUBMITTED') {
    throw transitionImpossible(remittance.status);
  }
  if (remittance.lines.length === 0) {
    throw new BadRequestError(t('Cette remise ne contient aucune ligne à prélever.'));
  }
  // Avant tout déchiffrement d IBAN : pas de clé courante, pas de fichier.
  assertFileDigestAvailable();

  // Le premier fichier ne peut plus partir le jour du prélèvement ni après ; les
  // téléchargements suivants (lignes figées) restent possibles.
  const isFirstExport = remittance.status === 'VALIDATED';
  if (isFirstExport && todayUtc(now).getTime() >= remittance.collectionDate.getTime()) throw collectionDatePassed();

  // Au premier export, chaque mandat doit être encore actif.
  if (remittance.firstExportedAt === null) {
    const inactive = remittance.lines
      .filter(line => line.mandate.status !== 'ACTIVE')
      .map(line => mandateReferenceOf(line.mandate.year, line.mandate.sequence));
    if (inactive.length > 0) {
      throw new ConflictError(
        t(
          'Des mandats ne sont plus actifs : {{references}}. Retirez les lignes concernées avant de produire le fichier.',
          {
            references: inactive.join(', ')
          }
        )
      );
    }
  }

  const reference = remittanceReferenceOf(remittance.year, remittance.sequence);
  const adapter = getFileAdapter(remittance.fileFormat ?? 'GENERIC_CSV');
  const buffer = adapter.build({
    reference,
    creditorIdentifier: remittance.creditorIdentifierSnapshot ?? '',
    creditorLabel: remittance.creditorLabelSnapshot ?? '',
    collectionDate: remittance.collectionDate,
    lines: remittance.lines.map(line => ({
      reference: lineReferenceOf(remittance.year, remittance.sequence, line.lineNumber),
      mandateReference: mandateReferenceOf(line.mandate.year, line.mandate.sequence),
      mandateSignedAt: line.mandate.signedAt,
      holderName: line.mandate.holderName,
      iban: decryptMandateIban(line.mandate.ibanEncrypted),
      amount: Number(line.amount),
      leaseNumber: line.lease?.lease_number ?? failOutsideRental(),
      periodYear: line.installment?.period_year ?? failOutsideRental(),
      periodMonth: line.installment?.period_month ?? failOutsideRental()
    }))
  });
  // HMAC, pas un SHA-256 vérifiable de l extérieur : le fichier porte les IBAN complets.
  const fileDigest = computeRemittanceFileDigest(buffer);

  await prisma.$transaction(async tx => {
    // Conditionnelle sur le statut. Au PREMIER export (VALIDATED), aussi sur updatedAt :
    // une ligne retirée ou un statut changé depuis la lecture invalide le fichier construit.
    // Les téléchargements suivants (EXPORTED, SUBMITTED : lignes figées) ne se
    // disputent pas entre eux, seul le compteur est incrémenté.
    const result = await tx.directDebitRemittance.updateMany({
      where: {
        id: remittanceId,
        tenantId,
        status: remittance.status,
        ...(isFirstExport ? { updatedAt: remittance.updatedAt } : {})
      },
      data: {
        status: isFirstExport ? 'EXPORTED' : remittance.status,
        exportCount: { increment: 1 },
        lastExportedAt: now,
        firstExportedAt: remittance.firstExportedAt ?? now,
        lastFileDigest: fileDigest
      }
    });
    if (result.count === 0) throw reloadConflict();
    // Audit écrit AVANT l envoi : son échec annule la transaction et bloque le fichier.
    await recordAuditEvent(tx, {
      actorUserId: actorUserId ?? null,
      tenantId,
      actionKey: AuditActionKey.DIRECT_DEBIT_REMITTANCE_EXPORTED,
      entityType: 'DirectDebitRemittance',
      entityId: remittanceId,
      payload: {
        reference,
        lineCount: remittance.lines.length,
        totalAmount: Number(remittance.totalAmount),
        collectionDate: toIsoDate(remittance.collectionDate),
        fileDigest,
        fileFormat: adapter.format,
        exportNumber: remittance.exportCount + 1
      }
    });
  });

  return { buffer, fileName: `${reference}.${adapter.fileExtension}`, contentType: adapter.contentType };
}

// ---------------------------------------------------------------------------
// Dépôt à la banque et annulation
// ---------------------------------------------------------------------------

/** EXPORTED -> SUBMITTED : l agence atteste avoir déposé le fichier à la banque. */
export async function submitRemittance(
  tenantId: string,
  remittanceId: string,
  actorUserId?: string | null,
  now: Date = new Date()
): Promise<RemittanceDto> {
  await prisma.$transaction(async tx => {
    await lockRemittance(tx, tenantId, remittanceId, ['EXPORTED']);
    const result = await tx.directDebitRemittance.updateMany({
      where: { id: remittanceId, tenantId, status: 'EXPORTED' },
      data: { status: 'SUBMITTED', submittedAt: now, submittedByUserId: actorUserId ?? null }
    });
    if (result.count === 0) throw reloadConflict();
    await recordAuditEvent(tx, {
      actorUserId: actorUserId ?? null,
      tenantId,
      actionKey: AuditActionKey.DIRECT_DEBIT_REMITTANCE_SUBMITTED,
      entityType: 'DirectDebitRemittance',
      entityId: remittanceId,
      payload: { ...auditPayload(await currentTotals(tx, tenantId, remittanceId)), from: 'EXPORTED', to: 'SUBMITTED' }
    });
  });
  return getRemittance(tenantId, remittanceId);
}

/** DRAFT, VALIDATED ou EXPORTED -> CANCELED : les lignes PENDING sont annulées et leurs échéances libérées. */
export async function cancelRemittance(
  tenantId: string,
  remittanceId: string,
  reason: string,
  actorUserId?: string | null,
  now: Date = new Date()
): Promise<RemittanceDto> {
  await prisma.$transaction(async tx => {
    const before = await lockRemittance(tx, tenantId, remittanceId, ['DRAFT', 'VALIDATED', 'EXPORTED']);
    const payload = { ...auditPayload(before), from: before.status, to: 'CANCELED', reason };
    await tx.directDebitRemittanceLine.updateMany({
      where: { tenantId, remittanceId, status: 'PENDING' },
      data: { status: 'CANCELED', activeKey: null, canceledAt: now, cancellationReason: t('Remise annulée.') }
    });
    const result = await tx.directDebitRemittance.updateMany({
      where: { id: remittanceId, tenantId, status: before.status },
      data: { status: 'CANCELED', canceledAt: now, cancellationReason: reason, lineCount: 0, totalAmount: 0 }
    });
    if (result.count === 0) throw reloadConflict();
    await recordAuditEvent(tx, {
      actorUserId: actorUserId ?? null,
      tenantId,
      actionKey: AuditActionKey.DIRECT_DEBIT_REMITTANCE_CANCELED,
      entityType: 'DirectDebitRemittance',
      entityId: remittanceId,
      payload
    });
  });
  return getRemittance(tenantId, remittanceId);
}
