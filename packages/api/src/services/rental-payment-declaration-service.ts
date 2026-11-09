/**
 * Rental Payment Declaration Service
 * Handles approval, rejection, and retrieval of payment declarations
 */

import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { PaymentDeclarationStatus, RentalPaymentStatus, RentalInstallmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { compteLocataireTx, inscrireEcheanceFactureeTx, libellePeriodeEcheance } from './rental-installment-service';
import { inscrireAllocationTx, inscrireReliquatTx, libelleMoyen } from './rental-payment-service';
import { assertTreasuryAccountUsableTx } from '../lib/treasury/accounts';
import { syncDirectRentPaymentEntryTx } from '../lib/finance/rental-direct-ledger';
import { t } from '../i18n';
import { AppError, ConflictError, ErrorCode, NotFoundError } from '../middleware/error-middleware';
import { logAuditEvent } from './audit-service';
import { AuditActionKey } from '../types/audit-types';
import { loadDeclarationDtos } from '../lib/rental/declared-payment/declaration-dto';
import {
  RENTAL_MAX_DECLARATION_AMOUNT,
  type RentalDeclarationRejectReason
} from '../lib/rental/declared-payment/types';
import { applyDeclarationListExtras, type DeclarationListExtras } from '../lib/rental/payment-list-filters';

const NOTE_MIN = 10;
/** Candidats lus pour le filtre `flagged` (alertes calculées hors SQL). */
const FLAGGED_SCAN_LIMIT = 500;
const NOTE_MAX = 500;

/** 409 typé : reste une `ConflictError`, avec le code du contrat. */
const alreadyReviewed = () => {
  const error = new ConflictError(t('Déclaration déjà traitée'));
  error.code = ErrorCode.RENTAL_DECLARATION_ALREADY_REVIEWED;
  return error;
};

/** Déclaration absente de la file PENDING : 404 si elle n'existe pas dans l'agence, 409 si déjà traitée. */
async function throwNotFoundOrReviewed(tenantId: string, declarationId: string): Promise<never> {
  const existing = await prisma.rentalPaymentDeclaration.findFirst({
    where: { id: declarationId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!existing) throw new NotFoundError(t('Déclaration non trouvée'));
  throw alreadyReviewed();
}

interface PaymentDeclarationFilters {
  /** Alertes seulement (doublon probable, montant différent du dû, retard). */
  flagged?: boolean;
  receivingNumberId?: string;
  status?: PaymentDeclarationStatus;
  leaseId?: string;
  declaredBy?: string;
  startDate?: Date;
  endDate?: Date;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
}

/** Libellés des motifs de rejet (repli de la note envoyée au locataire). */
const REJECT_REASON_LABELS = (): Record<RentalDeclarationRejectReason, string> => ({
  NOT_FOUND: t('Paiement introuvable'),
  AMOUNT_MISMATCH: t('Montant ne correspondant pas'),
  REFERENCE_USED: t('Référence déjà utilisée'),
  WRONG_NUMBER: t('Numéro de réception erroné'),
  OTHER: t('Autre')
});

/**
 * Approve a payment declaration and convert it to a real payment
 * @param tenantId - Tenant ID
 * @param declarationId - Payment declaration ID
 * @param actorUserId - User approving the declaration
 * @param reviewNotes - Optional review notes
 * @returns Updated declaration and created payment
 */
export async function approvePaymentDeclaration(
  tenantId: string,
  declarationId: string,
  actorUserId: string,
  reviewNotes?: string,
  /** Lot 10 : compte de trésorerie réellement crédité. Nul : celui par défaut du moyen de paiement. */
  treasuryAccountId?: string | null,
  /** Contrat 1.6 : montant retenu (absent = montant déclaré) ; `reviewNotes` tient lieu de note. */
  correction?: { acceptedAmount?: number | null }
): Promise<{
  declaration: any;
  payment: any;
  installment: { id: string; status: string; amountPaid: number; remainingDue: number } | null;
  corrected: boolean;
}> {
  try {
    // Get declaration with relations
    const declaration = await prisma.rentalPaymentDeclaration.findFirst({
      where: { id: declarationId, tenant_id: tenantId, status: PaymentDeclarationStatus.PENDING },
      include: {
        lease: true,
        installment: true,
        declarer: true,
        receivingNumber: { select: { treasury_account_number: true } }
      }
    });

    if (!declaration) await throwNotFoundOrReviewed(tenantId, declarationId);
    if (!declaration) throw new NotFoundError(t('Déclaration non trouvée'));

    // Montant retenu : différent du déclaré = correction, avec note obligatoire.
    const declaredAmount = Number(declaration.amount);
    const requested = correction?.acceptedAmount;
    const corrected = requested != null && requested !== declaredAmount;
    const acceptedAmount = corrected ? (requested as number) : declaredAmount;
    const note = reviewNotes?.trim() || null;
    if (corrected) {
      if (!Number.isFinite(acceptedAmount) || acceptedAmount <= 0 || acceptedAmount > RENTAL_MAX_DECLARATION_AMOUNT) {
        throw new AppError(
          t('Le montant retenu doit être supérieur à 0 et ne pas dépasser 5 000 000 FCFA.'),
          400,
          ErrorCode.RENTAL_DECLARATION_ACCEPTED_AMOUNT_INVALID
        );
      }
      if (!note || note.length < NOTE_MIN || note.length > NOTE_MAX) {
        throw new AppError(
          t('Une note de 10 à 500 caractères est obligatoire quand le montant retenu diffère du montant déclaré.'),
          400,
          ErrorCode.RENTAL_DECLARATION_CORRECTION_NOTE_REQUIRED
        );
      }
    }

    // Use transaction to ensure consistency
    const result = await prisma.$transaction(async tx => {
      // Passage atomique PENDING -> APPROVED : de deux approbations
      // concurrentes, une seule l'emporte (l'autre voit count === 0).
      const revendiquee = await tx.rentalPaymentDeclaration.updateMany({
        where: { id: declarationId, tenant_id: tenantId, status: PaymentDeclarationStatus.PENDING },
        data: {
          status: PaymentDeclarationStatus.APPROVED,
          reviewed_by: actorUserId,
          reviewed_at: new Date(),
          review_notes: reviewNotes || null,
          ...(corrected ? { accepted_amount: new Decimal(acceptedAmount), correction_note: note } : {})
        }
      });
      if (revendiquee.count === 0) {
        throw alreadyReviewed();
      }

      // Compte crédité : celui du corps s'il est fourni, sinon celui du numéro
      // de réception de la déclaration (compte mobile money de l'opérateur).
      let compteCredite: string | null = treasuryAccountId || null;
      const numeroCompte = declaration.receivingNumber?.treasury_account_number;
      if (!compteCredite && numeroCompte) {
        const compte = await tx.treasuryAccount.findFirst({
          where: { tenantId, accountNumber: numeroCompte, isActive: true },
          select: { id: true }
        });
        compteCredite = compte?.id ?? null;
      }
      await assertTreasuryAccountUsableTx(tx, tenantId, compteCredite, declaration.payment_method);

      // Create payment from declaration
      const payment = await tx.rentalPayment.create({
        data: {
          tenant_id: tenantId,
          lease_id: declaration.lease_id,
          renter_client_id: declaration.declared_by,
          method: declaration.payment_method,
          amount: corrected ? new Decimal(acceptedAmount) : declaration.amount,
          currency: 'FCFA',
          mm_operator: declaration.mobile_operator as any,
          treasury_account_id: compteCredite,
          psp_reference: declaration.reference || null,
          idempotency_key: `declaration-${declaration.id}`,
          status: RentalPaymentStatus.SUCCESS,
          succeeded_at: declaration.payment_date,
          created_by_user_id: actorUserId
        }
      });

      // Ce que la déclaration approuvée a réellement affecté à une échéance :
      // le reste, s'il y en a, est une avance reçue à porter au compte du
      // locataire. La somme des deux vaut toujours le montant déclaré.
      let montantAffecte = 0;
      let echeanceApres: { id: string; status: string; amountPaid: number; remainingDue: number } | null = null;
      let affectation: {
        id: string;
        leaseId: string;
        periodYear: number | null;
        periodMonth: number | null;
      } | null = null;

      // Allocate payment to installment if specified
      if (declaration.installment_id) {
        const installment = await tx.rentalInstallment.findFirst({
          where: {
            id: declaration.installment_id,
            tenant_id: tenantId,
            lease_id: declaration.lease_id
          }
        });

        if (installment) {
          // Get existing allocations for this installment
          const existingAllocations = await tx.rentalPaymentAllocation.findMany({
            where: { installment_id: installment.id }
          });

          const allocatedToInstallment = existingAllocations.reduce((sum, alloc) => sum + Number(alloc.amount), 0);

          // Calculate total amount due
          const totalAmountDue =
            Number(installment.amount_rent) +
            Number(installment.amount_service) +
            Number(installment.amount_other_fees) +
            Number(installment.penalty_amount);

          const remainingDue = totalAmountDue - allocatedToInstallment;
          const paymentAmount = acceptedAmount;

          // Allocate the payment (up to remaining due amount)
          const allocationAmount = Math.min(paymentAmount, remainingDue);

          if (allocationAmount > 0) {
            const allocation = await tx.rentalPaymentAllocation.create({
              data: {
                tenant_id: tenantId,
                payment_id: payment.id,
                installment_id: installment.id,
                amount: new Decimal(allocationAmount),
                currency: 'FCFA'
              }
            });

            montantAffecte = allocationAmount;
            affectation = {
              id: allocation.id,
              leaseId: installment.lease_id,
              periodYear: installment.period_year,
              periodMonth: installment.period_month
            };

            // Calculate new total allocated
            const newTotalAllocated = allocatedToInstallment + allocationAmount;

            // Determine new status
            let newStatus = installment.status;
            if (newTotalAllocated >= totalAmountDue && totalAmountDue > 0) {
              newStatus = RentalInstallmentStatus.PAID;
            } else if (newTotalAllocated > 0) {
              newStatus = RentalInstallmentStatus.PARTIAL;
            }

            // Update installment
            const echeanceMiseAJour = await tx.rentalInstallment.update({
              where: { id: installment.id, tenant_id: tenantId },
              data: {
                status: newStatus,
                amount_paid: new Decimal(newTotalAllocated),
                paid_at: newStatus === RentalInstallmentStatus.PAID ? new Date() : undefined
              }
            });

            echeanceApres = {
              id: installment.id,
              status: String(echeanceMiseAJour.status),
              amountPaid: newTotalAllocated,
              remainingDue: Math.max(0, totalAmountDue - newTotalAllocated)
            };

            // L'échéance réglée est exigible : sa créance est portée au compte
            // (idempotent, voir BUG-2026-09-30-058).
            await inscrireEcheanceFactureeTx(tx, tenantId, echeanceMiseAJour);
          }
        }
      }

      // Le règlement né de l'approbation est porté au compte du locataire dans
      // la même transaction que lui : approuver une déclaration sans que le
      // compte l'enregistre laisserait le locataire débiteur de ce qu'il vient
      // de régler. Le déclarant est le locataire, c'est son compte qui bouge.
      const compteId = await compteLocataireTx(tx, tenantId, declaration.declared_by);
      const moyen = libelleMoyen(declaration.payment_method);
      const dateReglement = declaration.payment_date;

      if (affectation) {
        await inscrireAllocationTx(tx, {
          tenantId,
          accountId: compteId,
          allocationId: affectation.id,
          montant: montantAffecte,
          moyen,
          periode: libellePeriodeEcheance(affectation.periodYear, affectation.periodMonth),
          leaseId: affectation.leaseId,
          movementDate: dateReglement,
          // Le règlement vient d'être créé par cette même transaction : rien
          // n'a encore été porté au compte pour lui, il n'y a donc aucune
          // avance à imputer.
          avanceDejaCreditee: false
        });
      }

      await inscrireReliquatTx(tx, {
        tenantId,
        accountId: compteId,
        payment,
        dejaAffecte: montantAffecte,
        movementDate: dateReglement
      });

      // Gestion directe : trésorerie et journal, dans la même transaction.
      await syncDirectRentPaymentEntryTx(tx, tenantId, payment.id);

      // Le statut est déjà passé à APPROVED plus haut : relecture avec les relations.
      const updatedDeclaration = await tx.rentalPaymentDeclaration.update({
        where: { id: declarationId, tenant_id: tenantId },
        data: {},
        include: {
          lease: {
            select: {
              id: true,
              lease_number: true
            }
          },
          installment: {
            select: {
              id: true,
              period_year: true,
              period_month: true
            }
          },
          declarer: {
            select: {
              id: true,
              user: {
                select: {
                  fullName: true
                }
              }
            }
          },
          reviewer: {
            select: {
              id: true,
              fullName: true
            }
          }
        }
      });

      return { declaration: updatedDeclaration, payment, installment: echeanceApres };
    });

    logger.info('Payment declaration approved', {
      tenantId,
      declarationId,
      actorUserId,
      paymentId: result.payment.id,
      amount: acceptedAmount,
      installmentId: declaration.installment_id
    });

    if (corrected) {
      logAuditEvent({
        actorUserId,
        tenantId,
        actionKey: AuditActionKey.RENTAL_PAYMENT_DECLARATION_APPROVED_WITH_CORRECTION,
        entityType: 'RENTAL_PAYMENT_DECLARATION',
        entityId: declarationId,
        payload: { declaredAmount, acceptedAmount, paymentId: result.payment.id }
      });
    }

    // Notify tenant by email (en dur, like account creation)
    try {
      const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
      const portalPath = '/tenant/payments';
      const portalUrl = `${baseUrl}/login?redirect=${encodeURIComponent(portalPath)}`;

      const leaseWithRenter = await prisma.rentalLease.findFirst({
        where: { id: declaration.lease_id, tenant_id: tenantId },
        include: {
          tenant: { select: { name: true } },
          primaryRenter: {
            include: { user: { select: { email: true, fullName: true } } }
          },
          ownerClient: {
            select: { user: { select: { email: true, fullName: true } } }
          },
          property: {
            select: {
              title: true,
              internalReference: true,
              owner: { select: { fullName: true, email: true } },
              containerParent: { select: { title: true } }
            }
          }
        }
      });
      const { emailService } = await import('./email-service');
      const leaseNumber =
        (declaration.lease as { lease_number?: string })?.lease_number || leaseWithRenter?.lease_number || '';
      const paymentDateFormatted = declaration.payment_date
        ? new Date(declaration.payment_date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })
        : '';
      const declarationDetails = {
        amount: acceptedAmount,
        paymentDate: paymentDateFormatted,
        paymentMethod: declaration.payment_method,
        mobileOperator: declaration.mobile_operator ?? null,
        transactionPhone: declaration.transaction_phone ?? null,
        reference: declaration.reference ?? null,
        proofFileUrl: declaration.proof_file_url ?? null,
        notes: declaration.notes ?? null
      };
      let leaseLabel: string | undefined;
      if (leaseWithRenter?.property) {
        const { getPropertyDisplayLabel } = await import('../utils/property-display');
        leaseLabel = getPropertyDisplayLabel(leaseWithRenter.property);
      }
      let allocatedPeriod: string | undefined;
      if (result.declaration.installment) {
        const inst = result.declaration.installment;
        const month = String(inst.period_month || 1).padStart(2, '0');
        allocatedPeriod = `${month}/${inst.period_year}`;
      }
      const agencyName = leaseWithRenter?.tenant?.name || undefined;
      const renterName = leaseWithRenter?.primaryRenter?.user?.fullName || 'Locataire';

      const { getEmailNotificationConfig } = await import('./email-notification-config-service');
      const configTenant = await getEmailNotificationConfig(tenantId, 'PAYMENT_APPROVED_TENANT');
      const configOwner = await getEmailNotificationConfig(tenantId, 'PAYMENT_APPROVED_OWNER');

      const tenantEmail = leaseWithRenter?.primaryRenter?.user?.email;
      if (tenantEmail && configTenant.enabled) {
        await emailService.sendPaymentApprovedToTenant(tenantEmail, renterName, leaseNumber, declarationDetails, {
          leaseLabel,
          portalUrl,
          allocatedInstallmentPeriod: allocatedPeriod,
          agencyName,
          templateOverrides:
            configTenant.subjectOverride || configTenant.bodyHtmlOverride
              ? {
                  subject: configTenant.subjectOverride ?? undefined,
                  bodyHtml: configTenant.bodyHtmlOverride ?? undefined
                }
              : undefined
        });
        logger.info('Payment approved email sent to tenant', { declarationId, email: tenantEmail });
      }

      const contactIdTenant = tenantEmail
        ? await import('./whatsapp-contact-resolve').then(m => m.getCrmContactIdForWhatsApp(tenantId, tenantEmail))
        : null;
      if (contactIdTenant) {
        const { sendWhatsappNotification } = await import('./whatsapp-notification-send-service');
        await sendWhatsappNotification({
          tenantId,
          notificationKey: 'PAYMENT_APPROVED_TENANT',
          variables: { tenantName: renterName || 'Locataire', agencyName: agencyName || "L'agence" },
          contactId: contactIdTenant
        });
      }

      const ownerUser = leaseWithRenter?.ownerClient?.user || leaseWithRenter?.property?.owner;
      if (ownerUser?.email && configOwner.enabled) {
        try {
          await emailService.sendPaymentApprovedToOwner(
            ownerUser.email,
            ownerUser.fullName || 'Propriétaire',
            renterName,
            leaseNumber,
            declarationDetails,
            {
              leaseLabel,
              agencyName,
              templateOverrides:
                configOwner.subjectOverride || configOwner.bodyHtmlOverride
                  ? {
                      subject: configOwner.subjectOverride ?? undefined,
                      bodyHtml: configOwner.bodyHtmlOverride ?? undefined
                    }
                  : undefined
            }
          );
          logger.info('Payment approved email sent to owner', { declarationId, email: ownerUser.email });
        } catch (ownerErr: any) {
          logger.warn('Failed to send payment approved email to owner', {
            declarationId,
            error: ownerErr?.message
          });
        }
      }
    } catch (emailErr: any) {
      logger.warn('Failed to send payment approved email to tenant', {
        declarationId,
        error: emailErr?.message
      });
    }

    return { ...result, corrected };
  } catch (error: any) {
    logger.error('Error approving payment declaration', {
      error: error.message,
      stack: error.stack,
      tenantId,
      declarationId,
      actorUserId
    });
    throw error;
  }
}

/**
 * Reject a payment declaration
 * @param tenantId - Tenant ID
 * @param declarationId - Payment declaration ID
 * @param actorUserId - User rejecting the declaration
 * @param reviewNotes - Review notes explaining the rejection (required)
 * @returns Updated declaration
 */
export async function rejectPaymentDeclaration(
  tenantId: string,
  declarationId: string,
  actorUserId: string,
  /** Note du gestionnaire (10 à 500) ; obligatoire si le motif est `OTHER`. */
  noteInput: string | null | undefined,
  /** Motif du contrat ; absent = `OTHER` (ancien corps `{ reviewNotes }`). */
  rejectReasonInput?: RentalDeclarationRejectReason
): Promise<any> {
  try {
    const rejectReasonExplicit = rejectReasonInput !== undefined;
    const rejectReason: RentalDeclarationRejectReason = rejectReasonInput ?? 'OTHER';
    const rawNote = noteInput?.trim() || null;
    if (rejectReason === 'OTHER' && !rawNote) {
      throw new AppError(
        t('Une note est obligatoire pour le motif « Autre ».'),
        400,
        ErrorCode.RENTAL_DECLARATION_REJECT_NOTE_REQUIRED
      );
    }
    if (rawNote && rawNote.length > NOTE_MAX) {
      throw new AppError(t('La note ne doit pas dépasser 500 caractères.'), 400, ErrorCode.VALIDATION_ERROR);
    }
    // Contrat §1.6 : 10 à 500 caractères dès qu'un motif explicite accompagne la note.
    if (rawNote && rejectReasonExplicit && rawNote.length < NOTE_MIN) {
      throw new AppError(t('La note doit faire au moins 10 caractères.'), 400, ErrorCode.VALIDATION_ERROR);
    }

    // Get declaration
    const declaration = await prisma.rentalPaymentDeclaration.findFirst({
      where: { id: declarationId, tenant_id: tenantId, status: PaymentDeclarationStatus.PENDING }
    });

    if (!declaration) await throwNotFoundOrReviewed(tenantId, declarationId);
    if (!declaration) throw new NotFoundError(t('Déclaration non trouvée'));

    // Passage atomique PENDING -> REJECTED : de deux rejets (ou d'un rejet et
    // d'une approbation) concurrents, un seul l'emporte.
    const reviewNotes = rawNote ?? REJECT_REASON_LABELS()[rejectReason];
    const revendiquee = await prisma.rentalPaymentDeclaration.updateMany({
      where: { id: declarationId, tenant_id: tenantId, status: PaymentDeclarationStatus.PENDING },
      data: {
        status: PaymentDeclarationStatus.REJECTED,
        reviewed_by: actorUserId,
        reviewed_at: new Date(),
        review_notes: reviewNotes,
        reject_reason: rejectReason
      }
    });
    if (revendiquee.count === 0) throw alreadyReviewed();

    const updatedDeclaration = await prisma.rentalPaymentDeclaration.findFirstOrThrow({
      where: { id: declarationId, tenant_id: tenantId },
      include: {
        lease: {
          select: {
            id: true,
            lease_number: true
          }
        },
        installment: {
          select: {
            id: true,
            period_year: true,
            period_month: true
          }
        },
        declarer: {
          select: {
            id: true,
            user: {
              select: {
                fullName: true
              }
            }
          }
        },
        reviewer: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    });

    logger.info('Payment declaration rejected', {
      tenantId,
      declarationId,
      actorUserId,
      amount: Number(declaration.amount),
      rejectReason,
      reviewNotes
    });

    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.RENTAL_PAYMENT_DECLARATION_REJECTED,
      entityType: 'RENTAL_PAYMENT_DECLARATION',
      entityId: declarationId,
      payload: { rejectReason, hasNote: Boolean(rawNote) }
    });

    // Notify tenant by email (en dur, like account creation)
    try {
      const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
      const portalPath = '/tenant/payments';
      const portalUrl = `${baseUrl}/login?redirect=${encodeURIComponent(portalPath)}`;

      const leaseWithRenter = await prisma.rentalLease.findFirst({
        where: { id: declaration.lease_id, tenant_id: tenantId },
        include: {
          tenant: { select: { name: true } },
          primaryRenter: {
            include: { user: { select: { email: true, fullName: true } } }
          },
          ownerClient: {
            select: { user: { select: { email: true, fullName: true } } }
          },
          property: {
            select: {
              title: true,
              internalReference: true,
              owner: { select: { fullName: true, email: true } },
              containerParent: { select: { title: true } }
            }
          }
        }
      });
      const { emailService } = await import('./email-service');
      const leaseNumber = (updatedDeclaration.lease as { lease_number?: string })?.lease_number || '';
      const paymentDateFormatted = declaration.payment_date
        ? new Date(declaration.payment_date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })
        : '';
      const declarationDetails = {
        amount: Number(declaration.amount),
        paymentDate: paymentDateFormatted,
        paymentMethod: declaration.payment_method,
        mobileOperator: declaration.mobile_operator ?? null,
        transactionPhone: declaration.transaction_phone ?? null,
        reference: declaration.reference ?? null,
        proofFileUrl: declaration.proof_file_url ?? null,
        notes: declaration.notes ?? null
      };
      let leaseLabel: string | undefined;
      if (leaseWithRenter?.property) {
        const { getPropertyDisplayLabel } = await import('../utils/property-display');
        leaseLabel = getPropertyDisplayLabel(leaseWithRenter.property);
      }
      const agencyName = leaseWithRenter?.tenant?.name || undefined;
      const renterName = leaseWithRenter?.primaryRenter?.user?.fullName || 'Locataire';

      const { getEmailNotificationConfig } = await import('./email-notification-config-service');
      const configTenant = await getEmailNotificationConfig(tenantId, 'PAYMENT_REJECTED_TENANT');
      const configOwner = await getEmailNotificationConfig(tenantId, 'PAYMENT_REJECTED_OWNER');

      const tenantEmail = leaseWithRenter?.primaryRenter?.user?.email;
      if (tenantEmail && configTenant.enabled) {
        await emailService.sendPaymentRejectedToTenant(
          tenantEmail,
          renterName,
          leaseNumber,
          declarationDetails,
          reviewNotes,
          {
            leaseLabel,
            portalUrl,
            agencyName,
            templateOverrides:
              configTenant.subjectOverride || configTenant.bodyHtmlOverride
                ? {
                    subject: configTenant.subjectOverride ?? undefined,
                    bodyHtml: configTenant.bodyHtmlOverride ?? undefined
                  }
                : undefined
          }
        );
        logger.info('Payment rejected email sent to tenant', { declarationId, email: tenantEmail });
      }

      const contactIdTenantReject = tenantEmail
        ? await import('./whatsapp-contact-resolve').then(m => m.getCrmContactIdForWhatsApp(tenantId, tenantEmail))
        : null;
      if (contactIdTenantReject) {
        const { sendWhatsappNotification } = await import('./whatsapp-notification-send-service');
        await sendWhatsappNotification({
          tenantId,
          notificationKey: 'PAYMENT_REJECTED_TENANT',
          variables: { tenantName: renterName || 'Locataire', agencyName: agencyName || "L'agence" },
          contactId: contactIdTenantReject
        });
      }

      const ownerUser = leaseWithRenter?.ownerClient?.user || leaseWithRenter?.property?.owner;
      if (ownerUser?.email && configOwner.enabled) {
        try {
          await emailService.sendPaymentRejectedToOwner(
            ownerUser.email,
            ownerUser.fullName || 'Propriétaire',
            renterName,
            leaseNumber,
            declarationDetails,
            reviewNotes,
            {
              leaseLabel,
              agencyName,
              templateOverrides:
                configOwner.subjectOverride || configOwner.bodyHtmlOverride
                  ? {
                      subject: configOwner.subjectOverride ?? undefined,
                      bodyHtml: configOwner.bodyHtmlOverride ?? undefined
                    }
                  : undefined
            }
          );
          logger.info('Payment rejected email sent to owner', { declarationId, email: ownerUser.email });
        } catch (ownerErr: any) {
          logger.warn('Failed to send payment rejected email to owner', {
            declarationId,
            error: ownerErr?.message
          });
        }
      }
    } catch (emailErr: any) {
      logger.warn('Failed to send payment rejected email to tenant', {
        declarationId,
        error: emailErr?.message
      });
    }

    return updatedDeclaration;
  } catch (error: any) {
    logger.error('Error rejecting payment declaration', {
      error: error.message,
      stack: error.stack,
      tenantId,
      declarationId,
      actorUserId
    });
    throw error;
  }
}

/**
 * Get payment declarations with filters and pagination
 * @param tenantId - Tenant ID
 * @param filters - Optional filters
 * @param pagination - Optional pagination
 * @returns List of declarations with pagination metadata
 */
export async function getPaymentDeclarations(
  tenantId: string,
  filters?: PaymentDeclarationFilters & DeclarationListExtras,
  pagination?: PaginationOptions
): Promise<{ declarations: any[]; pagination: any }> {
  try {
    const page = Math.max(1, pagination?.page || 1);
    const limit = Math.min(500, Math.max(1, pagination?.limit || 100));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      tenant_id: tenantId
    };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.leaseId) {
      where.lease_id = filters.leaseId;
    }

    if (filters?.declaredBy) {
      where.declared_by = filters.declaredBy;
    }

    if (filters?.receivingNumberId) {
      where.receiving_number_id = filters.receivingNumberId;
    }

    if (filters?.startDate || filters?.endDate) {
      where.payment_date = {};
      if (filters.startDate) {
        where.payment_date.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.payment_date.lte = filters.endDate;
      }
    }

    if (filters) applyDeclarationListExtras(where, filters); // search + méthode

    // Alertes seulement : calculées à la lecture, donc filtrées avant la pagination.
    if (filters?.flagged) {
      where.status = PaymentDeclarationStatus.PENDING;
      const candidates = await prisma.rentalPaymentDeclaration.findMany({
        where,
        select: { id: true },
        orderBy: { created_at: 'asc' },
        take: FLAGGED_SCAN_LIMIT
      });
      const dtos = await loadDeclarationDtos(
        tenantId,
        candidates.map(c => c.id)
      );
      where.id = { in: candidates.map(c => c.id).filter(id => (dtos.get(id)?.alerts.length ?? 0) > 0) };
    }

    // Get declarations and total count
    const [declarations, total] = await Promise.all([
      prisma.rentalPaymentDeclaration.findMany({
        where,
        include: {
          lease: {
            select: {
              id: true,
              lease_number: true,
              property: {
                select: {
                  id: true,
                  // Le titre d'abord : c'est lui que les autres ecrans du
                  // module affichent, l'adresse n'est qu'un repli.
                  title: true,
                  address: true,
                  internalReference: true
                }
              }
            }
          },
          installment: {
            select: {
              id: true,
              period_year: true,
              period_month: true,
              due_date: true
            }
          },
          declarer: {
            select: {
              id: true,
              user: {
                select: {
                  fullName: true,
                  email: true
                }
              }
            }
          },
          reviewer: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          }
        },
        // Les plus anciennes en attente d'abord ; sinon les plus récentes.
        orderBy: {
          created_at: where.status === PaymentDeclarationStatus.PENDING ? 'asc' : 'desc'
        },
        skip,
        take: limit
      }),
      prisma.rentalPaymentDeclaration.count({ where })
    ]);

    // Champ additif `view` (camelCase, contrat 1.6) à côté des lignes snake_case.
    const views = await loadDeclarationDtos(
      tenantId,
      declarations.map((declaration: { id: string }) => declaration.id)
    );

    return {
      declarations: declarations.map((declaration: { id: string }) => ({
        ...declaration,
        view: views.get(declaration.id) ?? null
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (error: any) {
    logger.error('Error getting payment declarations', {
      error: error.message,
      stack: error.stack,
      tenantId
    });
    throw error;
  }
}

/**
 * Get a payment declaration by ID
 * @param tenantId - Tenant ID
 * @param declarationId - Payment declaration ID
 * @returns Payment declaration with all relations
 */
export async function getPaymentDeclarationById(tenantId: string, declarationId: string): Promise<any> {
  try {
    const declaration = await prisma.rentalPaymentDeclaration.findFirst({
      where: {
        id: declarationId,
        tenant_id: tenantId
      },
      include: {
        lease: {
          include: {
            property: {
              select: {
                id: true,
                address: true
              }
            },
            primaryRenter: {
              include: {
                user: {
                  select: {
                    fullName: true,
                    email: true
                  }
                }
              }
            }
          }
        },
        installment: {
          select: {
            id: true,
            period_year: true,
            period_month: true,
            due_date: true,
            amount_rent: true,
            amount_service: true,
            amount_other_fees: true,
            penalty_amount: true,
            amount_paid: true,
            status: true
          }
        },
        declarer: {
          include: {
            user: {
              select: {
                // `User` ne porte pas de telephone : il vit sur `CrmContact`
                // (`phone_primary`) et sur `TenantClient`. Le selectionner ici
                // faisait lever Prisma a l'execution, et la valeur n'etait lue
                // nulle part. Une des 103 erreurs de type preexistantes, qui
                // etait aussi une panne en attente.
                fullName: true,
                email: true
              }
            }
          }
        },
        reviewer: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        }
      }
    });

    if (!declaration) {
      throw new NotFoundError(t('Déclaration non trouvée'));
    }

    const view = (await loadDeclarationDtos(tenantId, [declarationId])).get(declarationId) ?? null;
    return { ...declaration, view };
  } catch (error: any) {
    logger.error('Error getting payment declaration by ID', {
      error: error.message,
      stack: error.stack,
      tenantId,
      declarationId
    });
    throw error;
  }
}
