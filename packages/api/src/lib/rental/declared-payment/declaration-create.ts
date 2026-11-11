import { randomUUID } from 'crypto';
import type { MobileMoneyOperator, RentalPaymentMethod } from '@prisma/client';
import { t } from '../../../i18n';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { prisma } from '../../../utils/database';
import { normalizeIvorianMsisdn } from '../../payment-proof/phone';
import { normalizeTransactionReference } from '../../payment-proof/reference';
import {
  discardTempProof,
  promoteTempProofToDeclaration,
  removeDeclarationProof,
  saveDeclarationProof
} from './proof-files';
import type { ProofFileInput, StoredProofFile } from './proof-files';
import { notifyAgencyOfDeclaration } from './agency-notification';
import { loadDeclaredPaymentSettings } from './settings';
import {
  RENTAL_DECLARATION_PAYMENT_METHODS,
  RENTAL_MAX_DECLARATION_AMOUNT,
  RENTAL_PAID_AT_FUTURE_TOLERANCE_MINUTES,
  RENTAL_PAID_AT_MAX_AGE_DAYS,
  type RentalPrefillField
} from './types';

/**
 * Création d'une déclaration de paiement locatif (contrat 049, §1.3 et §1.6).
 *
 * Source unique des règles métier, partagée par le portail locataire
 * (`actor: 'TENANT'`) et la saisie pour un tiers par le gestionnaire
 * (`actor: 'MANAGER'`). La forme du corps est validée par l'appelant ; les
 * erreurs sont typées (`AppError` + code), jamais déduites d'un message.
 * Rien n'est crédité ici : la déclaration naît PENDING.
 */

const OPERATORS = ['ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER'] as const;
const INDEX_NAME = 'rental_payment_declarations_pending_approved_ref_key';

export interface CreateRentalDeclarationInput {
  tenantId: string;
  leaseId: string;
  installmentId?: string | null;
  declaredByClientId: string;
  declaredByUserId?: string | null;
  actor: 'TENANT' | 'MANAGER';
  /** Extension « autres modes » : absent = MOBILE_MONEY (règles historiques du contrat §1.3). */
  paymentMethod?: string | null;
  /** Requis (et utilisé) pour MOBILE_MONEY seulement ; refusé avec un autre mode. */
  receivingNumberId?: string | null;
  operator?: string | null;
  /** Obligatoire pour MOBILE_MONEY ; facultative sinon. */
  reference?: string | null;
  amount: number;
  paidAt: string | Date;
  payerPhone?: string | null;
  notes?: string | null;
  proof?: ProofFileInput | null;
  proofReadId?: string | null;
}

/** Montant entier avec séparateur de milliers (espace), pour un message d'erreur. */
export function formatFcfaAmount(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function bad(message: string, code: string): AppError {
  return new AppError(message, 400, code);
}

function duplicateReference(): AppError {
  return new AppError(
    t('Cette référence de transaction a déjà été déclarée.'),
    409,
    ErrorCode.RENTAL_DECLARATION_DUPLICATE_REFERENCE
  );
}

function proofReadInvalid(): AppError {
  return new AppError(
    t("Cette lecture automatique n'est plus valable. Envoyez de nouveau la capture."),
    409,
    ErrorCode.RENTAL_PROOF_READ_INVALID
  );
}

function isReferenceUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || (error as { code?: unknown }).code !== 'P2002') return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const names = (Array.isArray(target) ? target : [target]).filter((n): n is string => typeof n === 'string');
  if (names.length === 0) return true;
  return names.some(name => name === INDEX_NAME || /reference_normalized/i.test(name));
}

/** Champs que l'IA avait proposés et que la personne a modifiés. */
function computeEditedFields(
  raw: unknown,
  submitted: { operator: string; amount: number; paidAt: Date; reference: string; payerPhone: string | null }
): RentalPrefillField[] {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const edited: RentalPrefillField[] = [];
  if (typeof r.operator === 'string' && r.operator !== submitted.operator) edited.push('operator');
  if (typeof r.amount === 'number' && r.amount !== submitted.amount) edited.push('amount');
  if (typeof r.paidAt === 'string') {
    const proposed = Date.parse(r.paidAt);
    if (Number.isNaN(proposed) || Math.abs(proposed - submitted.paidAt.getTime()) > 60_000) edited.push('paidAt');
  }
  if (typeof r.reference === 'string' && r.reference !== submitted.reference) edited.push('reference');
  if (typeof r.payerPhone === 'string' && r.payerPhone !== submitted.payerPhone) edited.push('payerPhone');
  return edited;
}

export async function createRentalDeclaration(
  input: CreateRentalDeclarationInput
): Promise<{ declarationId: string; duplicateSuspected: boolean }> {
  const { tenantId, actor } = input;
  const now = new Date();
  const proof = input.proof ?? null;

  // 0. Mode de paiement : MOBILE_MONEY par défaut ; les autres modes (extension) n'ont ni numéro ni opérateur.
  const paymentMethod = input.paymentMethod ? input.paymentMethod : 'MOBILE_MONEY';
  if (!(RENTAL_DECLARATION_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    throw bad(t('Mode de paiement invalide.'), ErrorCode.VALIDATION_ERROR);
  }
  const isMobileMoney = paymentMethod === 'MOBILE_MONEY';
  if (!isMobileMoney && (input.receivingNumberId || input.operator)) {
    throw bad(
      t("Le numéro de réception et l'opérateur ne s'appliquent qu'au paiement mobile money."),
      ErrorCode.VALIDATION_ERROR
    );
  }

  // 1. Réglages : fonction coupée ; pour le mobile money, au moins un numéro actif.
  const rules = await loadDeclaredPaymentSettings(tenantId);
  const activeNumbers =
    rules.enabled && isMobileMoney
      ? await prisma.rentalReceivingNumber.count({ where: { tenant_id: tenantId, is_active: true } })
      : 0;
  if (!rules.enabled || (isMobileMoney && activeNumbers === 0)) {
    throw bad(
      isMobileMoney
        ? t("Cette agence n'accepte pas les déclarations de paiement mobile money.")
        : t("Cette agence n'accepte pas les déclarations de paiement."),
      ErrorCode.RENTAL_DECLARED_PAYMENT_DISABLED
    );
  }

  // 2. Numéro de réception de CETTE agence (404 uniforme ; INACTIVE seulement côté gestionnaire).
  let receivingNumber: { id: string; phone: string; is_active: boolean } | null = null;
  let operator: MobileMoneyOperator | null = null;
  if (isMobileMoney) {
    receivingNumber = await prisma.rentalReceivingNumber.findFirst({
      where: { id: input.receivingNumberId ?? '', tenant_id: tenantId },
      select: { id: true, phone: true, is_active: true }
    });
    if (!receivingNumber || (!receivingNumber.is_active && actor === 'TENANT')) {
      throw new AppError(t('Numéro de réception introuvable.'), 404, ErrorCode.RENTAL_RECEIVING_NUMBER_NOT_FOUND);
    }
    if (!receivingNumber.is_active) {
      throw bad(t('Ce numéro de réception est désactivé.'), ErrorCode.RENTAL_RECEIVING_NUMBER_INACTIVE);
    }

    // 3. Forme métier : opérateur.
    if (!input.operator || !(OPERATORS as readonly string[]).includes(input.operator)) {
      throw bad(t('Opérateur mobile money invalide.'), ErrorCode.VALIDATION_ERROR);
    }
    operator = input.operator as MobileMoneyOperator;
  }

  let payerPhone: string | null = null;
  if (input.payerPhone && input.payerPhone.trim()) {
    payerPhone = normalizeIvorianMsisdn(input.payerPhone);
    if (!payerPhone) {
      throw bad(
        t("Le numéro de téléphone du payeur n'est pas un numéro mobile ivoirien valide."),
        ErrorCode.INVALID_PHONE
      );
    }
  }

  const hasReferenceInput = typeof input.reference === 'string' && input.reference.trim() !== '';
  const reference = typeof input.reference === 'string' ? normalizeTransactionReference(input.reference) : null;
  // Référence obligatoire pour le mobile money ; facultative sinon (mais valide si fournie).
  if (!reference && (isMobileMoney || hasReferenceInput)) {
    throw bad(
      t('La référence de transaction doit comporter de 4 à 40 caractères (lettres, chiffres, tirets, points).'),
      ErrorCode.RENTAL_DECLARATION_REFERENCE_INVALID
    );
  }

  const amount = input.amount;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    throw bad(
      t('Le montant doit être un nombre entier de FCFA supérieur à zéro.'),
      ErrorCode.RENTAL_DECLARATION_AMOUNT_INVALID
    );
  }
  if (amount > RENTAL_MAX_DECLARATION_AMOUNT) {
    throw bad(
      t('Le montant dépasse le plafond de {{max}} FCFA par déclaration.', {
        max: formatFcfaAmount(RENTAL_MAX_DECLARATION_AMOUNT)
      }),
      ErrorCode.RENTAL_DECLARATION_AMOUNT_TOO_HIGH
    );
  }

  const paidAt = new Date(input.paidAt);
  if (Number.isNaN(paidAt.getTime())) throw bad(t('Date de paiement invalide.'), ErrorCode.VALIDATION_ERROR);
  const latest = now.getTime() + RENTAL_PAID_AT_FUTURE_TOLERANCE_MINUTES * 60_000;
  const earliest = now.getTime() - RENTAL_PAID_AT_MAX_AGE_DAYS * 86_400_000;
  if (paidAt.getTime() > latest || paidAt.getTime() < earliest) {
    throw bad(
      t('La date du paiement ne peut pas être dans le futur ni remonter à plus de {{days}} jours.', {
        days: RENTAL_PAID_AT_MAX_AGE_DAYS
      }),
      ErrorCode.RENTAL_DECLARATION_DATE_OUT_OF_RANGE
    );
  }

  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (notes.length > 500) throw bad(t('Les notes ne peuvent pas dépasser 500 caractères.'), ErrorCode.VALIDATION_ERROR);

  // 4. Bail de l'agence et échéance du bail (non annulée, non soldée, exigible).
  const lease = await prisma.rentalLease.findFirst({
    where: { id: input.leaseId, tenant_id: tenantId },
    select: { id: true, lease_number: true }
  });
  if (!lease) throw new NotFoundError(t('Bail introuvable.'));

  const installmentId = input.installmentId || null;
  if (installmentId) {
    const installment = await prisma.rentalInstallment.findFirst({
      where: { id: installmentId, tenant_id: tenantId, lease_id: lease.id },
      select: { status: true, due_date: true }
    });
    const dueDay = installment ? new Date(installment.due_date) : null;
    dueDay?.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const notPayable =
      !installment ||
      installment.status === 'CANCELED' ||
      installment.status === 'PAID' ||
      (installment.status === 'DRAFT' && dueDay !== null && dueDay >= today);
    if (notPayable) {
      throw new AppError(
        t('Échéance introuvable ou non payable.'),
        404,
        ErrorCode.RENTAL_DECLARATION_INSTALLMENT_INVALID
      );
    }
  }

  // 5. Capture : fichier OU lecture IA, jamais les deux ; exigée selon le réglage.
  if (proof && input.proofReadId) {
    throw bad(
      t('Envoyez une capture ou une lecture déjà faite, pas les deux.'),
      ErrorCode.RENTAL_DECLARATION_PROOF_INVALID
    );
  }
  let proofRead: { id: string; tempFileUrl: string; result: unknown } | null = null;
  if (input.proofReadId) {
    const row = await prisma.rentalPaymentProofRead.findFirst({
      where: {
        id: input.proofReadId,
        tenant_id: tenantId,
        renter_client_id: input.declaredByClientId,
        consumed_at: null,
        expires_at: { gt: now },
        temp_file_url: { not: null }
      },
      select: { id: true, temp_file_url: true, result: true }
    });
    if (!row?.temp_file_url) throw proofReadInvalid();
    proofRead = { id: row.id, tempFileUrl: row.temp_file_url, result: row.result };
  }
  if (!proof && !proofRead && rules.proofRequired) {
    throw bad(
      t('Cette agence exige une capture de la preuve de paiement.'),
      ErrorCode.RENTAL_DECLARATION_PROOF_REQUIRED
    );
  }

  // 6. Doublon bloquant (même agence, même numéro de réception, même référence).
  // Autres modes : doublon sur référence + montant + bail + mode, seulement si une référence est fournie.
  const sameReference =
    isMobileMoney && receivingNumber && reference
      ? await prisma.rentalPaymentDeclaration.findFirst({
          where: {
            tenant_id: tenantId,
            receiving_phone: receivingNumber.phone,
            reference_normalized: reference,
            status: { in: ['PENDING', 'APPROVED'] }
          },
          select: { id: true }
        })
      : !isMobileMoney && reference
        ? await prisma.rentalPaymentDeclaration.findFirst({
            where: {
              tenant_id: tenantId,
              lease_id: lease.id,
              payment_method: paymentMethod as RentalPaymentMethod,
              reference_normalized: reference,
              amount,
              status: { in: ['PENDING', 'APPROVED'] }
            },
            select: { id: true }
          })
        : null;
  if (sameReference) throw duplicateReference();

  // Doublon probable : même montant, même jour (UTC), même échéance, autre référence.
  const dayStart = new Date(Date.UTC(paidAt.getUTCFullYear(), paidAt.getUTCMonth(), paidAt.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const probable = await prisma.rentalPaymentDeclaration.findFirst({
    where: {
      tenant_id: tenantId,
      lease_id: lease.id,
      installment_id: installmentId,
      amount,
      payment_date: { gte: dayStart, lt: dayEnd },
      status: { in: ['PENDING', 'APPROVED'] }
    },
    select: { id: true }
  });
  const duplicateSuspected = probable !== null;

  // 7. Écriture : capture (calculs d'abord), puis une transaction.
  const aiEditedFields = proofRead
    ? computeEditedFields(proofRead.result, {
        operator: operator ?? '',
        amount,
        paidAt,
        reference: reference ?? '',
        payerPhone
      })
    : [];
  const declarationId = randomUUID();
  let stored: StoredProofFile | null = null;
  if (proof) {
    stored = await saveDeclarationProof({ tenantId, declarationId, file: proof });
  } else if (proofRead) {
    try {
      stored = await promoteTempProofToDeclaration({ tenantId, declarationId, tempFileUrl: proofRead.tempFileUrl });
    } catch (error) {
      if (error instanceof NotFoundError) throw proofReadInvalid();
      throw error;
    }
  }

  try {
    await prisma.$transaction(async tx => {
      if (proofRead) {
        const consumed = await tx.rentalPaymentProofRead.updateMany({
          where: { id: proofRead.id, tenant_id: tenantId, consumed_at: null, expires_at: { gt: now } },
          data: { consumed_at: now }
        });
        if (consumed.count !== 1) throw proofReadInvalid();
      }
      await tx.rentalPaymentDeclaration.create({
        data: {
          id: declarationId,
          tenant_id: tenantId,
          lease_id: lease.id,
          installment_id: installmentId,
          declared_by: input.declaredByClientId,
          declared_by_user_id: actor === 'MANAGER' ? (input.declaredByUserId ?? null) : null,
          amount,
          payment_date: paidAt,
          payment_method: paymentMethod as RentalPaymentMethod,
          mobile_operator: operator,
          transaction_phone: payerPhone,
          reference,
          reference_normalized: reference,
          receiving_number_id: receivingNumber?.id ?? null,
          receiving_phone: receivingNumber?.phone ?? null,
          proof_file_url: stored?.fileUrl ?? null,
          proof_read_id: proofRead?.id ?? null,
          ai_prefilled: proofRead !== null,
          ai_edited_fields: aiEditedFields,
          status: 'PENDING',
          notes: notes || null
        },
        select: { id: true }
      });
    });
  } catch (error) {
    if (stored) await removeDeclarationProof(tenantId, stored.fileUrl);
    if (isReferenceUniqueViolation(error)) throw duplicateReference();
    throw error;
  }

  if (proofRead) {
    // Le chemin n'est effacé en base qu'une fois le fichier réellement supprimé.
    if (await discardTempProof(tenantId, proofRead.tempFileUrl)) {
      await prisma.rentalPaymentProofRead
        .updateMany({ where: { id: proofRead.id, tenant_id: tenantId }, data: { temp_file_url: null } })
        .catch(() => undefined);
    }
  }

  // 8. Audit (saisie pour un tiers) : identifiants, montant, drapeaux ; ni capture ni téléphone.
  if (actor === 'MANAGER') {
    logAuditEvent({
      actorUserId: input.declaredByUserId ?? null,
      tenantId,
      actionKey: AuditActionKey.RENTAL_PAYMENT_DECLARATION_CREATED_FOR_THIRD_PARTY,
      entityType: 'RENTAL_PAYMENT_DECLARATION',
      entityId: declarationId,
      payload: {
        leaseId: lease.id,
        installmentId,
        declaredByClientId: input.declaredByClientId,
        paymentMethod,
        receivingNumberId: receivingNumber?.id ?? null,
        amount,
        hasProof: stored !== null,
        aiPrefilled: proofRead !== null,
        duplicateSuspected
      }
    });
  }

  // 9. E-mail immédiat à l'agence (administrateurs + propriétaire du bail), après commit.
  // Au mieux : la fonction ne lève jamais, et le récapitulatif horaire s'ajoute à cet envoi.
  try {
    await notifyAgencyOfDeclaration({
      tenantId,
      leaseId: lease.id,
      declarationId,
      tenantClientId: input.declaredByClientId,
      leaseNumber: lease.lease_number ?? '',
      details: {
        amount,
        paymentDate: paidAt.toISOString().slice(0, 10),
        paymentMethod,
        mobileOperator: operator,
        transactionPhone: payerPhone,
        reference,
        notes: notes || null
      }
    });
  } catch {
    // jamais bloquant
  }

  return { declarationId, duplicateSuspected };
}
