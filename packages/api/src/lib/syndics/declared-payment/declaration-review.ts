import { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import type { PrismaTransactionClient } from '../../../utils/database';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent, recordAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { t } from '../../../i18n';
import { compareLotIdsForLocking, lockLotTx, recordLotPaymentTx } from '../charge-allocation';
import { issueReceiptsForPaymentTx, toDocumentRefs } from '../charge-receipts';
import type { IssuedChargeDocument } from '../charge-receipts';
import { assertFiscalYearOpenTx, isReceivingAccountNumber } from '../provider-invoice-accounting';
import type { ReceivingAccountNumber } from '../provider-invoice-accounting';
import { MAX_CHARGE_CALLS_PER_LINE, MAX_DECLARATION_AMOUNT, PAID_AT_FUTURE_TOLERANCE_MINUTES } from './types';
import type { ApproveDeclarationBody, DeclarationRejectReason, DocumentRef } from './types';

/**
 * Validation et rejet d'une déclaration de paiement mobile money par le
 * gestionnaire (spec 047, R16 à R21, contrats §1.9, §1.10, §3.3, §3.5).
 *
 * `approveDeclaration` est la SEULE fonction qui transforme une déclaration en
 * encaissements. Sur le modèle de `settleSyndicCheckoutTx` (spec 042), tout se
 * fait dans UNE transaction :
 *   1. claim atomique `PENDING` → `APPROVED` (deux validations concurrentes :
 *      la seconde attend le verrou de ligne puis ne trouve plus de `PENDING`) ;
 *   2. contrôle d'exercice sur la date retenue ;
 *   3. verrous de TOUS les lots encaissés, dans l'ordre global croissant des
 *      `lotId`, AVANT la première écriture (voir `lockDeclarationLotsTx`) ;
 *   4. pour chaque ligne à montant retenu > 0 : `recordLotPaymentTx` (origine
 *      `DECLARED`, écriture 5521x / 450), reçu et quittances, liaison
 *      `chargePaymentId` ;
 *   5. trace d'audit, écrite dans la transaction (action `critical` du
 *      catalogue).
 * Toute erreur annule l'ensemble, claim compris : rien n'est encaissé.
 *
 * Aucun envoi ni aucune notification ici : l'appelant (contrôleur) déclenche
 * `scheduleChargeDocumentDelivery` puis `notifyDeclarationApproved` APRÈS le
 * commit, avec les documents renvoyés.
 *
 * Revenir sur une validation est hors périmètre (R21) : aucune fonction ne le
 * propose.
 */

/** Jusqu'à 10 lignes, chacune avec affectation, écriture comptable, fonds et documents. */
const REVIEW_TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

const NOTE_MIN_LENGTH = 10;
const NOTE_MAX_LENGTH = 500;

const REJECT_REASONS: readonly DeclarationRejectReason[] = [
  'NOT_FOUND',
  'AMOUNT_MISMATCH',
  'REFERENCE_USED',
  'WRONG_NUMBER',
  'OTHER'
];

/** Préfixe de la clé d'idempotence d'un encaissement déclaré (contrats §3.3). */
export const DECLARED_PAYMENT_IDEMPOTENCY_PREFIX = 'DECL-';

export function declaredPaymentIdempotencyKey(lineId: string): string {
  return `${DECLARED_PAYMENT_IDEMPOTENCY_PREFIX}${lineId}`;
}

type ApproveCorrection = ApproveDeclarationBody['correction'];

export interface ApproveDeclarationParams {
  tenantId: string;
  syndicateId: string;
  declarationId: string;
  actorUserId: string;
  correction?: ApproveCorrection;
  note?: string | null;
  now?: Date;
}

export interface ApproveDeclarationResult {
  declarationId: string;
  documents: IssuedChargeDocument[];
  documentRefs: DocumentRef[];
}

export interface RejectDeclarationParams {
  tenantId: string;
  syndicateId: string;
  declarationId: string;
  actorUserId: string;
  reason: DeclarationRejectReason;
  note: string;
  now?: Date;
}

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

function validationError(field: string, message: string): AppError {
  return new AppError(message, 400, ErrorCode.VALIDATION_ERROR, [{ field, message }]);
}

function notPending(): AppError {
  return new AppError(
    t("Cette déclaration n'est plus en attente : elle a déjà été traitée."),
    409,
    ErrorCode.DECLARATION_NOT_PENDING
  );
}

/** Un encaissement porte déjà la clé `DECL-<ligne>` : la déclaration a déjà été encaissée. */
function alreadyRecorded(): AppError {
  return new AppError(
    t('Un encaissement existe déjà pour cette déclaration : elle ne peut pas être validée une seconde fois.'),
    409,
    ErrorCode.DECLARATION_NOT_PENDING
  );
}

function declarationNotFound(): NotFoundError {
  return new NotFoundError(t('Déclaration introuvable.'));
}

function isIdempotencyReplayError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const names = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return names.some(name => /idempotency_?key/i.test(name));
}

// ---------------------------------------------------------------------------
// Note du gestionnaire
// ---------------------------------------------------------------------------

/** Note nettoyée. Obligatoire : 10 à 500 caractères ; facultative : 500 au plus, vide = `null`. */
function normalizeNote(note: string | null | undefined, required: boolean): string | null {
  const value = typeof note === 'string' ? note.trim() : '';
  if (required) {
    if (value.length < NOTE_MIN_LENGTH || value.length > NOTE_MAX_LENGTH) {
      throw validationError('note', t('Une note de 10 à 500 caractères est obligatoire.'));
    }
    return value;
  }
  if (value.length > NOTE_MAX_LENGTH) {
    throw validationError('note', t('La note ne peut pas dépasser 500 caractères.'));
  }
  return value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Déclaration et correction
// ---------------------------------------------------------------------------

async function loadDeclarationForReview(tenantId: string, syndicateId: string, declarationId: string) {
  const declaration = await prisma.syndicPaymentDeclaration.findFirst({
    where: { id: declarationId, tenantId, syndicateId },
    select: {
      id: true,
      tenantId: true,
      syndicateId: true,
      status: true,
      amount: true,
      paidAt: true,
      transactionReference: true,
      receivingNumber: { select: { id: true, tenantId: true, syndicateId: true, treasuryAccountNumber: true } },
      lines: {
        select: { id: true, lotId: true, amount: true, chargeCallIds: true },
        orderBy: { lotId: 'asc' }
      }
    }
  });
  // Même 404 pour une déclaration inexistante, d'une autre agence ou d'une autre copropriété.
  if (!declaration) throw declarationNotFound();
  return declaration;
}

type ReviewedDeclaration = Awaited<ReturnType<typeof loadDeclarationForReview>>;
type DeclarationLine = ReviewedDeclaration['lines'][number];

interface RetainedLine {
  line: DeclarationLine;
  declaredAmount: number;
  acceptedAmount: number;
  chargeCallIds: string[];
  /** `true` : appels désignés par la correction (contrôle strict, 404) ; sinon ceux de la déclaration. */
  explicitCalls: boolean;
}

interface RetainedDecision {
  paidAt: Date;
  lines: RetainedLine[];
  corrected: boolean;
}

function isEmptyCorrection(correction: ApproveCorrection): boolean {
  return correction == null || (correction.paidAt === undefined && correction.lines === undefined);
}

function parseCorrectedPaidAt(value: unknown, now: Date): Date {
  const parsed = typeof value === 'string' && value.trim() !== '' ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw validationError('correction.paidAt', t('Date de paiement invalide.'));
  }
  if (parsed.getTime() > now.getTime() + PAID_AT_FUTURE_TOLERANCE_MINUTES * 60_000) {
    throw new AppError(
      t('La date de paiement ne peut pas être dans le futur.'),
      400,
      ErrorCode.DECLARATION_DATE_OUT_OF_RANGE
    );
  }
  return parsed;
}

function parseCorrectedCallIds(value: unknown, index: number): string[] {
  const field = `correction.lines.${index}.chargeCallIds`;
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || id.length === 0)) {
    throw validationError(field, t("Liste d'appels de charges invalide."));
  }
  if (value.length > MAX_CHARGE_CALLS_PER_LINE || new Set(value).size !== value.length) {
    throw validationError(field, t("Liste d'appels de charges invalide."));
  }
  return value as string[];
}

const declaredLine = (line: DeclarationLine): RetainedLine => ({
  line,
  declaredAmount: Number(line.amount),
  acceptedAmount: Number(line.amount),
  chargeCallIds: line.chargeCallIds,
  explicitCalls: false
});

function retainedTooHigh(): AppError {
  return new AppError(
    t('Le montant retenu dépasse le montant déclaré ou le plafond de {max} FCFA par déclaration.', {
      max: MAX_DECLARATION_AMOUNT
    }),
    400,
    ErrorCode.DECLARATION_AMOUNT_TOO_HIGH
  );
}

type CorrectionLines = NonNullable<NonNullable<ApproveCorrection>['lines']>;

/** Lignes corrigées : chaque ligne de la déclaration exactement une fois, montant entier ≥ 0. */
function parseCorrectedLines(declaration: ReviewedDeclaration, items: CorrectionLines): RetainedLine[] {
  const coverAll = () =>
    validationError('correction.lines', t('La correction doit reprendre toutes les lignes de la déclaration.'));
  if (!Array.isArray(items)) throw coverAll();
  const byId = new Map(declaration.lines.map(line => [line.id, line]));
  const corrected = new Map<string, RetainedLine>();
  items.forEach((item, index) => {
    const line = item && typeof item.lineId === 'string' ? byId.get(item.lineId) : undefined;
    if (!line || corrected.has(line.id)) {
      throw validationError(
        `correction.lines.${index}.lineId`,
        t('La correction doit reprendre chaque ligne de la déclaration une seule fois.')
      );
    }
    if (!Number.isSafeInteger(item.acceptedAmount) || item.acceptedAmount < 0) {
      throw validationError(
        `correction.lines.${index}.acceptedAmount`,
        t('Le montant retenu doit être un nombre entier positif ou nul.')
      );
    }
    if (item.acceptedAmount > MAX_DECLARATION_AMOUNT) throw retainedTooHigh();
    const explicitCalls = item.chargeCallIds !== undefined;
    corrected.set(line.id, {
      line,
      declaredAmount: Number(line.amount),
      acceptedAmount: item.acceptedAmount,
      chargeCallIds: explicitCalls ? parseCorrectedCallIds(item.chargeCallIds, index) : line.chargeCallIds,
      explicitCalls
    });
  });
  if (corrected.size !== declaration.lines.length) throw coverAll();
  // Toutes les lignes sont couvertes (contrôle ci-dessus) : le repli n'est jamais pris.
  return declaration.lines.map(line => corrected.get(line.id) ?? declaredLine(line));
}

/**
 * Montants, appels et date retenus. Sans correction : tels que déclarés. Avec
 * correction : toutes les lignes, chacune une fois, montants entiers ≥ 0 dont
 * au moins un > 0 ; date ISO pas dans le futur.
 */
function resolveRetainedDecision(
  declaration: ReviewedDeclaration,
  correction: ApproveCorrection,
  now: Date
): RetainedDecision {
  if (correction == null || isEmptyCorrection(correction)) {
    return { paidAt: declaration.paidAt, lines: declaration.lines.map(declaredLine), corrected: false };
  }
  const fix = correction;
  const paidAt = fix.paidAt === undefined ? declaration.paidAt : parseCorrectedPaidAt(fix.paidAt, now);
  const lines =
    fix.lines === undefined ? declaration.lines.map(declaredLine) : parseCorrectedLines(declaration, fix.lines);
  // R18 autorise la répartition entre lots : le plafond porte donc sur le TOTAL retenu, jamais sur une ligne.
  // Une correction ne crédite jamais plus que ce que le copropriétaire a déclaré.
  const declaredTotal = declaration.lines.reduce((sum, line) => sum + Number(line.amount), 0);
  if (lines.reduce((sum, line) => sum + line.acceptedAmount, 0) > declaredTotal) throw retainedTooHigh();
  if (!lines.some(line => line.acceptedAmount > 0)) {
    throw validationError(
      'correction.lines',
      t('Au moins une ligne doit être encaissée (montant retenu supérieur à 0).')
    );
  }
  return { paidAt, lines, corrected: true };
}

// ---------------------------------------------------------------------------
// Étapes de la transaction
// ---------------------------------------------------------------------------

/**
 * Verrouille d'emblée tous les lots encaissés, dans l'ordre global croissant
 * des `lotId` (`compareLotIdsForLocking`). `recordLotPaymentTx` prend ensuite
 * des verrous de FONDS après chaque lot : sans cette prise préalable, la
 * transaction tiendrait un fonds en attendant le lot suivant, pendant qu'un
 * paiement manuel sur ce lot attendrait le même fonds (interblocage). Le verrou
 * de lot est réentrant : la reprise par `recordLotPaymentTx` ne coûte rien.
 */
async function lockDeclarationLotsTx(tx: PrismaTransactionClient, lotIds: string[]): Promise<void> {
  for (const lotId of lotIds) await lockLotTx(tx, lotId);
}

/**
 * Appels retenus par ligne. Désignés par la correction : chacun doit être un
 * appel du lot de SA ligne dans cette copropriété (404 sinon). Repris de la
 * déclaration : un appel disparu depuis est écarté (le montant va aux appels
 * restants puis en avance, R13), il ne bloque pas.
 */
async function resolveChargeCallsTx(
  tx: PrismaTransactionClient,
  syndicateId: string,
  lines: RetainedLine[]
): Promise<Map<string, string[]>> {
  const allIds = Array.from(new Set(lines.flatMap(line => line.chargeCallIds)));
  const present = allIds.length
    ? await tx.chargeCall.findMany({ where: { id: { in: allIds }, syndicateId }, select: { id: true, lotId: true } })
    : [];
  const lotOfCall = new Map(present.map(call => [call.id, call.lotId]));

  const resolved = new Map<string, string[]>();
  for (const retained of lines) {
    const ofLot = retained.chargeCallIds.filter(id => lotOfCall.get(id) === retained.line.lotId);
    if (retained.explicitCalls && ofLot.length !== retained.chargeCallIds.length) {
      throw new NotFoundError(t('Appel de charges introuvable pour ce lot.'));
    }
    resolved.set(retained.line.id, ofLot);
  }
  return resolved;
}

interface RecordedLine {
  lineId: string;
  lotId: string;
  declaredAmount: number;
  acceptedAmount: number;
  chargePaymentId: string | null;
}

interface ApprovalContext {
  declaration: ReviewedDeclaration;
  decision: RetainedDecision;
  actorUserId: string;
  note: string | null;
  now: Date;
  treasuryAccountNumber: ReceivingAccountNumber;
}

/** Claim atomique `PENDING` → `APPROVED` : l'arbitre des validations, rejets et annulations concurrents. */
async function claimApprovalTx(tx: PrismaTransactionClient, ctx: ApprovalContext, acceptedTotal: number) {
  const { declaration } = ctx;
  const claim = await tx.syndicPaymentDeclaration.updateMany({
    where: {
      id: declaration.id,
      tenantId: declaration.tenantId,
      syndicateId: declaration.syndicateId,
      status: 'PENDING'
    },
    data: {
      status: 'APPROVED',
      reviewedByUserId: ctx.actorUserId,
      reviewedAt: ctx.now,
      acceptedAmount: acceptedTotal,
      acceptedPaidAt: ctx.decision.paidAt,
      reviewNote: ctx.note
    }
  });
  if (claim.count !== 1) throw notPending();
}

/**
 * Contrôles avant la première écriture : lots de la copropriété, appels
 * retenus, aucune clé `DECL-<ligne>` déjà portée (garde-fou : un encaissement
 * déjà fait pour une déclaration encore `PENDING` est une incohérence).
 */
async function prepareLinesTx(tx: PrismaTransactionClient, syndicateId: string, toRecord: RetainedLine[]) {
  const lotIds = toRecord.map(line => line.line.lotId);
  const lots = await tx.syndicateLot.findMany({ where: { id: { in: lotIds }, syndicateId }, select: { id: true } });
  if (lots.length !== new Set(lotIds).size) {
    throw new NotFoundError(t('Lot introuvable ou inaccessible pour cette copropriété.'));
  }
  const callsByLine = await resolveChargeCallsTx(tx, syndicateId, toRecord);
  const keys = toRecord.map(line => declaredPaymentIdempotencyKey(line.line.id));
  const existing = await tx.chargePayment.findMany({
    where: { idempotencyKey: { in: keys }, lotId: { in: lotIds } },
    select: { id: true }
  });
  if (existing.length > 0) throw alreadyRecorded();
  return callsByLine;
}

/** Encaissement d'une ligne : paiement du lot (5521x / 450), reçu et quittances, liaison de la ligne. */
async function recordRetainedLineTx(
  tx: PrismaTransactionClient,
  ctx: ApprovalContext,
  retained: RetainedLine,
  chargeCallIds: string[]
): Promise<{ recorded: RecordedLine; documents: IssuedChargeDocument[] }> {
  const { tenantId, syndicateId } = ctx.declaration;
  const { line } = retained;
  let payment: Awaited<ReturnType<typeof recordLotPaymentTx>>;
  try {
    payment = await recordLotPaymentTx(tx, {
      tenantId,
      syndicateId,
      lotId: line.lotId,
      amount: retained.acceptedAmount,
      paidAt: ctx.decision.paidAt,
      method: 'MOBILE_MONEY',
      reference: ctx.declaration.transactionReference,
      // [] : plus anciens appels ouverts d'abord ; appel soldé entre-temps : excédent en avance (R13).
      chargeCallIds,
      actorUserId: ctx.actorUserId,
      idempotencyKey: declaredPaymentIdempotencyKey(line.id),
      providerTransactionId: null,
      origin: 'DECLARED',
      treasuryAccountNumber: ctx.treasuryAccountNumber
    });
  } catch (error) {
    // Course sur la clé d'idempotence (P2002) : la transaction PostgreSQL est abandonnée.
    // Contrairement au paiement en ligne, on ne rattache rien : on refuse, tout est annulé.
    if (isIdempotencyReplayError(error)) throw alreadyRecorded();
    throw error;
  }

  const documents = await issueReceiptsForPaymentTx(tx, {
    tenantId,
    syndicateId,
    lotId: line.lotId,
    paymentId: payment.record.id,
    result: payment.result,
    actorUserId: ctx.actorUserId,
    issuedAt: ctx.now
  });
  await tx.syndicPaymentDeclarationLine.update({
    where: { id: line.id, tenantId },
    data: { chargePaymentId: payment.record.id, acceptedAmount: retained.acceptedAmount }
  });
  return {
    documents,
    recorded: {
      lineId: line.id,
      lotId: line.lotId,
      declaredAmount: retained.declaredAmount,
      acceptedAmount: retained.acceptedAmount,
      chargePaymentId: payment.record.id
    }
  };
}

/** Lignes retenues à 0 : non encaissées, le montant retenu (0) est noté. */
async function markZeroLinesTx(tx: PrismaTransactionClient, ctx: ApprovalContext): Promise<RecordedLine[]> {
  const zeroLines = ctx.decision.lines.filter(line => line.acceptedAmount === 0);
  if (zeroLines.length === 0) return [];
  await tx.syndicPaymentDeclarationLine.updateMany({
    where: {
      id: { in: zeroLines.map(line => line.line.id) },
      tenantId: ctx.declaration.tenantId,
      declarationId: ctx.declaration.id
    },
    data: { acceptedAmount: 0 }
  });
  return zeroLines.map(retained => ({
    lineId: retained.line.id,
    lotId: retained.line.lotId,
    declaredAmount: retained.declaredAmount,
    acceptedAmount: 0,
    chargePaymentId: null
  }));
}

/**
 * Trace d'audit DANS la transaction (action `critical` du catalogue : pas de
 * validation sans sa trace). Identifiants et montants seulement : ni capture,
 * ni valeur lue par l'IA, ni numéro de téléphone, ni note libre.
 */
async function auditApprovalTx(
  tx: PrismaTransactionClient,
  ctx: ApprovalContext,
  acceptedTotal: number,
  recorded: RecordedLine[]
) {
  const { declaration, decision } = ctx;
  await recordAuditEvent(tx, {
    actorUserId: ctx.actorUserId,
    tenantId: declaration.tenantId,
    actionKey: AuditActionKey.SYNDIC_PAYMENT_DECLARATION_APPROVED,
    entityType: 'SYNDIC_PAYMENT_DECLARATION',
    entityId: declaration.id,
    payload: {
      declarationId: declaration.id,
      syndicateId: declaration.syndicateId,
      status: 'APPROVED',
      declaredAmount: Number(declaration.amount),
      acceptedAmount: acceptedTotal,
      corrected: decision.corrected,
      paidAtChanged: decision.paidAt.getTime() !== declaration.paidAt.getTime(),
      chargePaymentIds: recorded.flatMap(line => (line.chargePaymentId ? [line.chargePaymentId] : [])),
      lines: recorded
    }
  });
}

async function approveInTransaction(
  tx: PrismaTransactionClient,
  ctx: ApprovalContext
): Promise<{ documents: IssuedChargeDocument[]; recorded: RecordedLine[] }> {
  const acceptedTotal = ctx.decision.lines.reduce((sum, line) => sum + line.acceptedAmount, 0);

  // 1. Claim atomique, AVANT toute autre lecture ou écriture.
  await claimApprovalTx(tx, ctx, acceptedTotal);

  // 2. Exercice clos à la date retenue : l'erreur remonte telle quelle (la date déclarée reste en base).
  await assertFiscalYearOpenTx(tx, ctx.declaration.syndicateId, ctx.decision.paidAt);

  // 3. Lignes encaissées dans l'ordre global des verrous de lot, tous pris d'emblée.
  const toRecord = ctx.decision.lines
    .filter(line => line.acceptedAmount > 0)
    .sort((a, b) => compareLotIdsForLocking(a.line.lotId, b.line.lotId));
  await lockDeclarationLotsTx(
    tx,
    toRecord.map(line => line.line.lotId)
  );
  const callsByLine = await prepareLinesTx(tx, ctx.declaration.syndicateId, toRecord);

  const documents: IssuedChargeDocument[] = [];
  const recorded: RecordedLine[] = [];
  for (const retained of toRecord) {
    const done = await recordRetainedLineTx(tx, ctx, retained, callsByLine.get(retained.line.id) ?? []);
    documents.push(...done.documents);
    recorded.push(done.recorded);
  }
  recorded.push(...(await markZeroLinesTx(tx, ctx)));

  // 4. Trace d'audit dans la transaction.
  await auditApprovalTx(tx, ctx, acceptedTotal, recorded);
  return { documents, recorded };
}

// ---------------------------------------------------------------------------
// API du module
// ---------------------------------------------------------------------------

/**
 * Valide une déclaration `PENDING` (telle que déclarée ou corrigée) : un
 * encaissement par ligne à montant retenu > 0, tous dans une transaction.
 * Renvoie les documents émis ; l'appelant les envoie après le commit.
 */
export async function approveDeclaration(params: {
  tenantId: string;
  syndicateId: string;
  declarationId: string;
  actorUserId: string;
  correction?: ApproveDeclarationBody['correction'];
  note?: string | null;
  now?: Date;
}): Promise<{ declarationId: string; documents: IssuedChargeDocument[]; documentRefs: DocumentRef[] }> {
  const { tenantId, syndicateId, declarationId, actorUserId } = params;
  const now = params.now ?? new Date();

  const declaration = await loadDeclarationForReview(tenantId, syndicateId, declarationId);
  // Contrôle rapide ; le claim de la transaction reste l'arbitre.
  if (declaration.status !== 'PENDING') throw notPending();

  const corrected = !isEmptyCorrection(params.correction);
  const note = normalizeNote(params.note, corrected);
  const decision = resolveRetainedDecision(declaration, params.correction, now);

  const receiving = declaration.receivingNumber;
  const treasuryAccountNumber = receiving.treasuryAccountNumber;
  if (
    receiving.tenantId !== tenantId ||
    receiving.syndicateId !== syndicateId ||
    !isReceivingAccountNumber(treasuryAccountNumber)
  ) {
    throw new NotFoundError(t('Compte de réception mobile money introuvable dans la comptabilité de la copropriété'));
  }

  const { documents } = await prisma.$transaction(
    tx => approveInTransaction(tx, { declaration, decision, actorUserId, note, now, treasuryAccountNumber }),
    REVIEW_TX_OPTIONS
  );

  return {
    declarationId: declaration.id,
    documents,
    documentRefs: toDocumentRefs(documents) as DocumentRef[]
  };
}

/**
 * Rejette une déclaration `PENDING` (R20) : motif de la liste et note de 10 à
 * 500 caractères. Aucune écriture comptable, aucune ligne touchée. La
 * référence redevient libre d'elle-même (`REJECTED` est hors de l'index
 * unique partiel).
 */
export async function rejectDeclaration(params: {
  tenantId: string;
  syndicateId: string;
  declarationId: string;
  actorUserId: string;
  reason: DeclarationRejectReason;
  note: string;
  now?: Date;
}): Promise<{ declarationId: string }> {
  const { tenantId, syndicateId, declarationId, actorUserId } = params;
  const now = params.now ?? new Date();

  if (!REJECT_REASONS.includes(params.reason)) {
    throw validationError('reason', t('Motif de rejet invalide.'));
  }
  const note = normalizeNote(params.note, true) as string;

  const declaration = await prisma.syndicPaymentDeclaration.findFirst({
    where: { id: declarationId, tenantId, syndicateId },
    select: { id: true, status: true, amount: true }
  });
  if (!declaration) throw declarationNotFound();
  if (declaration.status !== 'PENDING') throw notPending();

  const claim = await prisma.syndicPaymentDeclaration.updateMany({
    where: { id: declaration.id, tenantId, syndicateId, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      rejectReason: params.reason,
      reviewNote: note,
      reviewedByUserId: actorUserId,
      reviewedAt: now
    }
  });
  if (claim.count !== 1) throw notPending();

  // Sans la note libre : identifiants, motif et montant déclaré.
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SYNDIC_PAYMENT_DECLARATION_REJECTED,
    entityType: 'SYNDIC_PAYMENT_DECLARATION',
    entityId: declaration.id,
    payload: {
      declarationId: declaration.id,
      syndicateId,
      status: 'REJECTED',
      reason: params.reason,
      declaredAmount: Number(declaration.amount)
    }
  });
  return { declarationId: declaration.id };
}
