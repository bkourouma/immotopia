/**
 * Rental Payment Declaration Service
 * Handles approval, rejection, and retrieval of payment declarations
 */

import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { PaymentDeclarationStatus, RentalPaymentStatus, RentalInstallmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { compteLocataireTx, libellePeriodeEcheance } from './rental-installment-service';
import { inscrireAllocationTx, inscrireReliquatTx, libelleMoyen } from './rental-payment-service';
import { assertTreasuryAccountUsableTx } from '../lib/treasury/accounts';

interface PaymentDeclarationFilters {
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
  treasuryAccountId?: string | null
): Promise<{ declaration: any; payment: any }> {
  try {
    // Get declaration with relations
    const declaration = await prisma.rentalPaymentDeclaration.findFirst({
      where: {
        id: declarationId,
        tenant_id: tenantId,
        status: PaymentDeclarationStatus.PENDING
      },
      include: {
        lease: true,
        installment: true,
        declarer: true
      }
    });

    if (!declaration) {
      throw new Error('Déclaration non trouvée ou déjà traitée');
    }

    // Use transaction to ensure consistency
    const result = await prisma.$transaction(async tx => {
      await assertTreasuryAccountUsableTx(tx, tenantId, treasuryAccountId, declaration.payment_method);

      // Create payment from declaration
      const payment = await tx.rentalPayment.create({
        data: {
          tenant_id: tenantId,
          lease_id: declaration.lease_id,
          renter_client_id: declaration.declared_by,
          method: declaration.payment_method,
          amount: declaration.amount,
          currency: 'FCFA',
          mm_operator: declaration.mobile_operator as any,
          treasury_account_id: treasuryAccountId || null,
          psp_reference: declaration.reference || null,
          idempotency_key: `declaration-${declaration.id}-${Date.now()}`,
          status: RentalPaymentStatus.SUCCESS,
          succeeded_at: declaration.payment_date,
          created_by_user_id: actorUserId
        }
      });

      // Ce que la déclaration approuvée a réellement affecté à une échéance :
      // le reste, s'il y en a, est une avance reçue à porter au compte du
      // locataire. La somme des deux vaut toujours le montant déclaré.
      let montantAffecte = 0;
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
          const paymentAmount = Number(declaration.amount);

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
            await tx.rentalInstallment.update({
              where: { id: installment.id, tenant_id: tenantId },
              data: {
                status: newStatus,
                amount_paid: new Decimal(newTotalAllocated),
                paid_at: newStatus === RentalInstallmentStatus.PAID ? new Date() : undefined
              }
            });
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

      // Update declaration status
      const updatedDeclaration = await tx.rentalPaymentDeclaration.update({
        where: { id: declarationId, tenant_id: tenantId },
        data: {
          status: PaymentDeclarationStatus.APPROVED,
          reviewed_by: actorUserId,
          reviewed_at: new Date(),
          review_notes: reviewNotes || null
        },
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

      return { declaration: updatedDeclaration, payment };
    });

    logger.info('Payment declaration approved', {
      tenantId,
      declarationId,
      actorUserId,
      paymentId: result.payment.id,
      amount: Number(declaration.amount),
      installmentId: declaration.installment_id
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

    return result;
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
  reviewNotes: string
): Promise<any> {
  try {
    // Get declaration
    const declaration = await prisma.rentalPaymentDeclaration.findFirst({
      where: {
        id: declarationId,
        tenant_id: tenantId,
        status: PaymentDeclarationStatus.PENDING
      }
    });

    if (!declaration) {
      throw new Error('Déclaration non trouvée ou déjà traitée');
    }

    // Update declaration status
    const updatedDeclaration = await prisma.rentalPaymentDeclaration.update({
      where: { id: declarationId, tenant_id: tenantId },
      data: {
        status: PaymentDeclarationStatus.REJECTED,
        reviewed_by: actorUserId,
        reviewed_at: new Date(),
        review_notes: reviewNotes
      },
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
      reviewNotes
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
  filters?: PaymentDeclarationFilters,
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

    if (filters?.startDate || filters?.endDate) {
      where.payment_date = {};
      if (filters.startDate) {
        where.payment_date.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.payment_date.lte = filters.endDate;
      }
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
        orderBy: {
          created_at: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.rentalPaymentDeclaration.count({ where })
    ]);

    return {
      declarations,
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
      throw new Error('Déclaration non trouvée');
    }

    return declaration;
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
