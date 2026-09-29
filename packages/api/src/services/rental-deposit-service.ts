import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { RentalDepositMovementType } from '@prisma/client';
import { assertTreasuryAccountUsableTx, type PaymentMethodLike } from '../lib/treasury/accounts';
import { montantDisponibleTx } from './rental-payment-service';

/**
 * Create security deposit for a lease
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @param actorUserId - User creating the deposit
 * @returns Created deposit
 */
export async function createDeposit(tenantId: string, leaseId: string, actorUserId: string) {
  // Verify lease exists and belongs to tenant
  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    }
  });

  if (!lease) {
    throw new Error('Bail introuvable');
  }

  // Check if deposit already exists
  const existingDeposit = await prisma.rentalSecurityDeposit.findUnique({
    where: {
      lease_id: leaseId
    }
  });

  if (existingDeposit) {
    throw new Error('Un dépôt de garantie existe déjà pour ce bail');
  }

  // Create deposit
  const deposit = await prisma.rentalSecurityDeposit.create({
    data: {
      tenant_id: tenantId,
      lease_id: leaseId,
      currency: lease.currency,
      target_amount: lease.security_deposit_amount,
      collected_amount: 0,
      held_amount: 0,
      refunded_amount: 0,
      forfeited_amount: 0
    },
    include: {
      lease: {
        select: {
          id: true,
          lease_number: true
        }
      },
      movements: {
        orderBy: {
          created_at: 'desc'
        },
        take: 10
      }
    }
  });

  logger.info('Security deposit created', {
    depositId: deposit.id,
    leaseId,
    tenantId,
    targetAmount: deposit.target_amount
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_DEPOSIT_CREATED',
    entityType: 'RENTAL_SECURITY_DEPOSIT',
    entityId: deposit.id,
    payload: {
      leaseId,
      targetAmount: deposit.target_amount
    }
  });

  return deposit;
}

/**
 * Get deposit for a lease
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @param actorUserId - Optional user ID for auto-creation (if deposit doesn't exist but lease has security_deposit_amount)
 * @returns Deposit or null
 */
export async function getDeposit(tenantId: string, leaseId: string, actorUserId?: string) {
  // Verify lease exists and belongs to tenant
  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    }
  });

  if (!lease) {
    throw new Error('Bail introuvable');
  }

  let deposit = await prisma.rentalSecurityDeposit.findUnique({
    where: {
      lease_id: leaseId
    },
    include: {
      lease: {
        select: {
          id: true,
          lease_number: true
        }
      },
      movements: {
        orderBy: {
          created_at: 'desc'
        },
        include: {
          payment: {
            select: {
              id: true,
              method: true,
              amount: true,
              succeeded_at: true
            }
          },
          createdBy: {
            select: {
              id: true,
              email: true,
              fullName: true
            }
          }
        }
      }
    }
  });

  // If deposit doesn't exist but lease has security_deposit_amount, create it automatically
  if (!deposit && lease.security_deposit_amount && Number(lease.security_deposit_amount) > 0) {
    deposit = await prisma.rentalSecurityDeposit.create({
      data: {
        tenant_id: tenantId,
        lease_id: leaseId,
        currency: lease.currency,
        target_amount: lease.security_deposit_amount,
        collected_amount: 0,
        held_amount: 0,
        refunded_amount: 0,
        forfeited_amount: 0
      },
      include: {
        lease: {
          select: {
            id: true,
            lease_number: true
          }
        },
        movements: {
          orderBy: {
            created_at: 'desc'
          },
          include: {
            payment: {
              select: {
                id: true,
                method: true,
                amount: true,
                succeeded_at: true
              }
            },
            createdBy: {
              select: {
                id: true,
                email: true,
                fullName: true
              }
            }
          }
        }
      }
    });

    logger.info('Security deposit auto-created from lease', {
      depositId: deposit.id,
      leaseId,
      tenantId,
      targetAmount: deposit.target_amount
    });

    // Audit log if actorUserId provided
    if (actorUserId) {
      logAuditEvent({
        actorUserId,
        tenantId,
        actionKey: 'RENTAL_DEPOSIT_CREATED',
        entityType: 'RENTAL_SECURITY_DEPOSIT',
        entityId: deposit.id,
        payload: {
          leaseId,
          targetAmount: deposit.target_amount,
          autoCreated: true
        }
      });
    }
  }

  return deposit;
}

/**
 * Create deposit movement
 * @param tenantId - Tenant ID
 * @param depositId - Deposit ID
 * @param type - Movement type
 * @param amount - Movement amount
 * @param paymentId - Optional payment ID
 * @param installmentId - Optional installment ID
 * @param note - Optional note
 * @param actorUserId - User creating the movement
 * @returns Created movement
 */
export async function createDepositMovement(
  tenantId: string,
  depositId: string,
  type: RentalDepositMovementType,
  amount: number,
  paymentId?: string,
  installmentId?: string,
  note?: string,
  actorUserId?: string,
  /** Lot 10 : compte de tresorerie d'un remboursement. Nul : caisse par defaut. */
  treasuryAccountId?: string | null,
  /**
   * Moyen de paiement du mouvement, pour valider `treasuryAccountId`. Ce
   * champ n'a pas de colonne propre sur `RentalDepositMovement` (seule
   * `treasury_account_id` a ete ajoutee au lot 10) : il ne sert qu'a la
   * verification, `CASH` par defaut quand il manque.
   */
  method?: PaymentMethodLike
) {
  // Get deposit with tenant isolation
  const deposit = await prisma.rentalSecurityDeposit.findFirst({
    where: {
      id: depositId,
      tenant_id: tenantId
    }
  });

  if (!deposit) {
    throw new Error('Dépôt de garantie introuvable');
  }

  // Validate that the referenced payment and installment, when provided,
  // belong to this tenant before storing them on the movement.
  if (paymentId) {
    const payment = await prisma.rentalPayment.findFirst({
      where: { id: paymentId, tenant_id: tenantId }
    });
    if (!payment) {
      throw new Error('Paiement introuvable');
    }
  }

  if (installmentId) {
    const installment = await prisma.rentalInstallment.findFirst({
      where: { id: installmentId, tenant_id: tenantId }
    });
    if (!installment) {
      throw new Error('Échéance introuvable');
    }
  }

  // Validate COLLECT movement - must be single payment equal to target amount
  if (type === RentalDepositMovementType.COLLECT) {
    const existingCollectMovements = await prisma.rentalDepositMovement.findMany({
      where: {
        deposit_id: depositId,
        type: RentalDepositMovementType.COLLECT
      }
    });

    if (existingCollectMovements.length > 0) {
      throw new Error("Le dépôt de garantie ne peut être collecté qu'une seule fois");
    }

    if (Number(amount) !== Number(deposit.target_amount)) {
      throw new Error('Le montant collecté doit être égal au dépôt de garantie attendu');
    }

    if (!paymentId) {
      throw new Error('Un paiement est requis pour collecter le dépôt de garantie');
    }
  }

  // Validate amount
  if (amount <= 0) {
    throw new Error('Le montant du mouvement doit être positif');
  }

  // Validate movement types that reduce balance
  if (type === RentalDepositMovementType.REFUND || type === RentalDepositMovementType.FORFEIT) {
    const availableAmount =
      Number(deposit.collected_amount) - Number(deposit.refunded_amount) - Number(deposit.forfeited_amount);
    if (amount > availableAmount) {
      throw new Error('Le solde du dépôt de garantie est insuffisant pour ce mouvement');
    }
  }

  // Update deposit aggregated amounts
  const updateData: any = {};

  if (type === RentalDepositMovementType.COLLECT) {
    updateData.collected_amount = { increment: amount };
  } else if (type === RentalDepositMovementType.HOLD) {
    updateData.held_amount = { increment: amount };
  } else if (type === RentalDepositMovementType.RELEASE) {
    updateData.held_amount = { decrement: amount };
  } else if (type === RentalDepositMovementType.REFUND) {
    updateData.refunded_amount = { increment: amount };
    updateData.collected_amount = { decrement: amount };
  } else if (type === RentalDepositMovementType.FORFEIT) {
    updateData.forfeited_amount = { increment: amount };
    updateData.collected_amount = { decrement: amount };
  } else if (type === RentalDepositMovementType.ADJUSTMENT) {
    // Adjustment can be positive or negative - handled by amount sign
    if (amount > 0) {
      updateData.collected_amount = { increment: amount };
    } else {
      updateData.collected_amount = { decrement: Math.abs(amount) };
    }
  }

  // Le compte de tresorerie d'un remboursement est verifie et la piece
  // ecrite dans la meme transaction : un remboursement enregistre sur un
  // compte finalement invalide ne doit rien laisser derriere lui.
  const movement = await prisma.$transaction(async tx => {
    await assertTreasuryAccountUsableTx(tx, tenantId, treasuryAccountId, method ?? 'CASH');

    // Un paiement ne sert qu'à une destination à la fois : la collecte ne peut
    // s'appuyer que sur un règlement encaissé, du même bail, et dont le
    // montant n'est ni déjà affecté à des loyers ni déjà déposé en garantie.
    if (type === RentalDepositMovementType.COLLECT && paymentId) {
      const payment = await tx.rentalPayment.findFirst({ where: { id: paymentId, tenant_id: tenantId } });
      if (!payment) {
        throw new Error('Paiement introuvable');
      }
      if (payment.status !== 'SUCCESS') {
        throw new Error('Seul un paiement encaissé peut servir à collecter le dépôt de garantie');
      }
      if (payment.lease_id && payment.lease_id !== deposit.lease_id) {
        throw new Error("Ce paiement n'appartient pas au bail de ce dépôt de garantie");
      }
      const disponible = await montantDisponibleTx(tx, tenantId, payment);
      if (disponible < Number(amount)) {
        throw new Error(
          "Ce paiement n'est plus assez disponible : il est déjà affecté à un loyer ou à un dépôt de garantie"
        );
      }
    }

    const created = await tx.rentalDepositMovement.create({
      data: {
        tenant_id: tenantId,
        deposit_id: depositId,
        type: type,
        currency: deposit.currency,
        amount: amount,
        payment_id: paymentId || null,
        installment_id: installmentId || null,
        treasury_account_id: treasuryAccountId || null,
        note: note || null,
        created_by_user_id: actorUserId || null
      }
    });

    await tx.rentalSecurityDeposit.update({
      where: {
        id: depositId,
        tenant_id: tenantId
      },
      data: updateData
    });

    return created;
  });

  logger.info('Deposit movement created', {
    movementId: movement.id,
    depositId,
    tenantId,
    type,
    amount
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'RENTAL_DEPOSIT_MOVEMENT_CREATED',
      entityType: 'RENTAL_DEPOSIT_MOVEMENT',
      entityId: movement.id,
      payload: {
        depositId,
        type,
        amount
      }
    });
  }

  // Notifications email (locataire + propriétaire) si config activée
  try {
    await sendDepositMovementNotifications(tenantId, depositId, type, Number(amount), deposit.currency);
  } catch (notifErr: any) {
    logger.warn('Deposit movement notification failed', { depositId, error: notifErr?.message });
  }

  return movement;
}

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  COLLECT: 'Collecte',
  HOLD: 'Mise en retenue',
  RELEASE: 'Libération',
  REFUND: 'Remboursement',
  FORFEIT: 'Confiscation',
  ADJUSTMENT: 'Ajustement'
};

async function sendDepositMovementNotifications(
  tenantId: string,
  depositId: string,
  type: string,
  amount: number,
  currency: string
): Promise<void> {
  const deposit = await prisma.rentalSecurityDeposit.findFirst({
    where: { id: depositId, tenant_id: tenantId },
    include: {
      lease: {
        include: {
          primaryRenter: { include: { user: { select: { email: true, fullName: true } } } },
          ownerClient: { include: { user: { select: { email: true, fullName: true } } } },
          property: {
            select: {
              title: true,
              internalReference: true,
              owner: { select: { fullName: true } },
              containerParent: { select: { title: true } }
            }
          }
        }
      }
    }
  });
  if (!deposit?.lease) return;

  const lease = deposit.lease;
  const leaseNumber = lease.lease_number || '';
  const { getPropertyDisplayLabel } = await import('../utils/property-display');
  const leaseLabel = lease.property ? getPropertyDisplayLabel(lease.property) : leaseNumber;
  const movementTypeLabel = MOVEMENT_TYPE_LABELS[type] || type;
  const amountStr = new Intl.NumberFormat('fr-FR', { style: 'decimal' }).format(amount);

  const tenantEmail = lease.primaryRenter?.user?.email;
  const tenantName = lease.primaryRenter?.user?.fullName || 'Locataire';
  const ownerEmail = lease.ownerClient?.user?.email;
  const ownerName = lease.ownerClient?.user?.fullName || 'Propriétaire';
  const renterName = tenantName;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true }
  });
  const agencyName = tenant?.name || undefined;
  const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
  const portalUrl = `${baseUrl}/tenant/deposit`;

  const { getEmailNotificationConfig } = await import('./email-notification-config-service');
  const { emailService: svc } = await import('./email-service');

  const configTenant = await getEmailNotificationConfig(tenantId, 'DEPOSIT_MOVEMENT_TENANT');
  if (configTenant.enabled && tenantEmail) {
    await svc.sendDepositMovementToTenant(
      tenantEmail,
      tenantName,
      movementTypeLabel,
      amountStr,
      currency,
      leaseNumber,
      {
        leaseLabel,
        agencyName,
        portalUrl,
        templateOverrides:
          configTenant.subjectOverride || configTenant.bodyHtmlOverride
            ? {
                subject: configTenant.subjectOverride ?? undefined,
                bodyHtml: configTenant.bodyHtmlOverride ?? undefined
              }
            : undefined
      }
    );
    logger.info('Deposit movement notification sent to tenant', { depositId, tenantEmail });
  }

  const { getCrmContactIdForWhatsApp } = await import('./whatsapp-contact-resolve');
  const contactIdDeposit = tenantEmail ? await getCrmContactIdForWhatsApp(tenantId, tenantEmail) : null;
  if (contactIdDeposit) {
    const { sendWhatsappNotification } = await import('./whatsapp-notification-send-service');
    await sendWhatsappNotification({
      tenantId,
      notificationKey: 'DEPOSIT_MOVEMENT_TENANT',
      variables: {
        tenantName: tenantName || 'Locataire',
        movementTypeLabel,
        amount: amountStr,
        currency: currency || '',
        leaseLabel: leaseLabel || leaseNumber,
        agencyName: agencyName || "L'agence"
      },
      contactId: contactIdDeposit
    });
  }

  const configOwner = await getEmailNotificationConfig(tenantId, 'DEPOSIT_MOVEMENT_OWNER');
  if (configOwner.enabled && ownerEmail) {
    await svc.sendDepositMovementToOwner(
      ownerEmail,
      ownerName,
      renterName,
      movementTypeLabel,
      amountStr,
      currency,
      leaseNumber,
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
    logger.info('Deposit movement notification sent to owner', { depositId, ownerEmail });
  }
}

/**
 * List deposit movements
 * @param tenantId - Tenant ID
 * @param depositId - Deposit ID
 * @returns List of movements
 */
export async function listDepositMovements(tenantId: string, depositId: string) {
  // Verify deposit belongs to tenant
  const deposit = await prisma.rentalSecurityDeposit.findFirst({
    where: {
      id: depositId,
      tenant_id: tenantId
    }
  });

  if (!deposit) {
    throw new Error('Dépôt de garantie introuvable');
  }

  const movements = await prisma.rentalDepositMovement.findMany({
    where: {
      deposit_id: depositId,
      tenant_id: tenantId
    },
    include: {
      payment: {
        select: {
          id: true,
          method: true,
          amount: true,
          succeeded_at: true
        }
      },
      installment: {
        select: {
          id: true,
          period_year: true,
          period_month: true
        }
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    },
    orderBy: {
      created_at: 'desc'
    }
  });

  return movements;
}
