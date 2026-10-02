import { prisma } from '../utils/database';
import type { PrismaTransactionClient } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent, recordAuditEvent } from './audit-service';
import { RentalDepositMovementType } from '@prisma/client';
import { assertTreasuryAccountUsableTx, type PaymentMethodLike } from '../lib/treasury/accounts';
import { t } from '../i18n';
import { syncDirectDepositMovementEntryTx, syncDirectRentPaymentEntryTx } from '../lib/finance/rental-direct-ledger';
import { annulerPieceTx, compteLocataireDuBailTx, compteLocataireTx } from './rental-installment-service';
import { NotFoundError, ConflictError, BadRequestError } from '../middleware/error-middleware';

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
    throw new NotFoundError(t('Bail introuvable'));
  }

  // Check if deposit already exists
  const existingDeposit = await prisma.rentalSecurityDeposit.findUnique({
    where: {
      lease_id: leaseId
    }
  });

  if (existingDeposit) {
    throw new ConflictError(t('Un dépôt de garantie existe déjà pour ce bail'));
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
    throw new NotFoundError(t('Bail introuvable'));
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
/**
 * Solde détenu d'un dépôt : SEULE définition, partagée par le contrôleur et
 * la validation des mouvements. `collected_amount`, `refunded_amount` et
 * `forfeited_amount` sont des cumuls qui ne font que croître (à l'ajustement
 * près) : une restitution ou une retenue augmente son propre cumul et ne
 * touche jamais `collected_amount`, sans quoi elle serait retranchée deux fois.
 */
export function computeDepositBalance(deposit: {
  collected_amount: unknown;
  refunded_amount: unknown;
  forfeited_amount: unknown;
}): number {
  return Number(deposit.collected_amount) - Number(deposit.refunded_amount) - Number(deposit.forfeited_amount);
}

/** Contrôles métier d'un mouvement, sur le dépôt relu sous verrou. */
async function assertDepositMovementAllowedTx(
  tx: PrismaTransactionClient,
  deposit: {
    id: string;
    target_amount: unknown;
    collected_amount: unknown;
    refunded_amount: unknown;
    forfeited_amount: unknown;
    held_amount: unknown;
  },
  type: RentalDepositMovementType,
  amount: number,
  paymentId?: string
): Promise<void> {
  if (type === RentalDepositMovementType.COLLECT) {
    const existingCollectMovements = await tx.rentalDepositMovement.findMany({
      where: { deposit_id: deposit.id, type: RentalDepositMovementType.COLLECT }
    });
    if (existingCollectMovements.length > 0) {
      throw new BadRequestError(
        t("Le dépôt de garantie ne peut être encaissé qu'une seule fois (paiement unique exigé)")
      );
    }
    if (Number(amount) !== Number(deposit.target_amount)) {
      throw new BadRequestError(
        t('Le montant encaissé ({{amount}}) doit être égal au montant cible ({{target}})', {
          amount: String(amount),
          target: String(deposit.target_amount)
        })
      );
    }
    if (!paymentId) {
      throw new BadRequestError(t("L'identifiant du paiement est requis pour l'encaissement du dépôt"));
    }
  }

  if (type === RentalDepositMovementType.REFUND || type === RentalDepositMovementType.FORFEIT) {
    const availableAmount = computeDepositBalance(deposit);
    if (amount > availableAmount) {
      throw new BadRequestError(
        t('Solde du dépôt insuffisant (disponible : {{available}}, demandé : {{requested}})', {
          available: String(availableAmount),
          requested: String(amount)
        })
      );
    }
  }

  // Une libération ne peut pas dépasser ce qui est retenu : sinon held_amount
  // deviendrait négatif.
  if (type === RentalDepositMovementType.RELEASE && amount > Number(deposit.held_amount)) {
    throw new BadRequestError(
      t('Le montant retenu est insuffisant pour cette libération (retenu : {{held}}, demandé : {{requested}})', {
        held: String(Number(deposit.held_amount)),
        requested: String(amount)
      })
    );
  }
}

function depositAggregateUpdate(type: RentalDepositMovementType, amount: number) {
  const updateData: Record<string, unknown> = {};
  if (type === RentalDepositMovementType.COLLECT) {
    updateData.collected_amount = { increment: amount };
  } else if (type === RentalDepositMovementType.HOLD) {
    updateData.held_amount = { increment: amount };
  } else if (type === RentalDepositMovementType.RELEASE) {
    updateData.held_amount = { decrement: amount };
  } else if (type === RentalDepositMovementType.REFUND) {
    updateData.refunded_amount = { increment: amount };
  } else if (type === RentalDepositMovementType.FORFEIT) {
    updateData.forfeited_amount = { increment: amount };
  } else if (type === RentalDepositMovementType.ADJUSTMENT) {
    // Adjustment can be positive or negative - handled by amount sign
    updateData.collected_amount = amount > 0 ? { increment: amount } : { decrement: Math.abs(amount) };
  }
  return updateData;
}

/**
 * Retire du compte du locataire l'« avance reçue » qu'un règlement de dépôt de
 * garantie y a fait naître à l'encaissement : un dépôt est une dette envers le
 * locataire, jamais une avance imputable sur un loyer (la campagne de
 * facturation impute les avances). Sans effet si rien n'a été porté au compte,
 * et idempotent (la pièce est contre-passée une seule fois : solde nul ensuite).
 * Sert aussi au rattrapage des dépôts déjà encaissés.
 */
export async function retirerAvanceDuDepotTx(tx: PrismaTransactionClient, tenantId: string, paymentId: string) {
  const payment = await tx.rentalPayment.findFirst({
    where: { id: paymentId, tenant_id: tenantId },
    select: {
      id: true,
      lease_id: true,
      renter_client_id: true,
      succeeded_at: true,
      initiated_at: true
    }
  });
  if (!payment) return null;
  const accountId = payment.renter_client_id
    ? await compteLocataireTx(tx, tenantId, payment.renter_client_id)
    : payment.lease_id
      ? ((await compteLocataireDuBailTx(tx, tenantId, payment.lease_id))?.accountId ?? null)
      : null;
  if (!accountId) return null;

  return annulerPieceTx(tx, {
    tenantId,
    accountId,
    sourceType: 'RENTAL_PAYMENT',
    sourceId: paymentId,
    label: 'Dépôt de garantie encaissé : retiré des avances du locataire',
    leaseId: payment.lease_id ?? null,
    movementDate: payment.succeeded_at ?? payment.initiated_at
  });
}

/** Écritures d'un mouvement de dépôt (gestion directe) et neutralisation de l'avance à l'encaissement. */
async function postDepositAccountingTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  type: RentalDepositMovementType,
  movementId: string,
  paymentId?: string
): Promise<void> {
  if (type === RentalDepositMovementType.COLLECT && paymentId) {
    await retirerAvanceDuDepotTx(tx, tenantId, paymentId);
    // Le règlement est désormais reconnu comme un dépôt : trésorerie / 165.
    await syncDirectRentPaymentEntryTx(tx, tenantId, paymentId);
  } else if (type === RentalDepositMovementType.REFUND || type === RentalDepositMovementType.FORFEIT) {
    await syncDirectDepositMovementEntryTx(tx, tenantId, movementId);
  }
}

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
    throw new NotFoundError(t('Dépôt de garantie introuvable'));
  }

  // Validate that the referenced payment and installment, when provided,
  // belong to this tenant before storing them on the movement.
  if (paymentId) {
    const payment = await prisma.rentalPayment.findFirst({
      where: { id: paymentId, tenant_id: tenantId }
    });
    if (!payment) {
      throw new NotFoundError(t('Paiement introuvable'));
    }
  }

  if (installmentId) {
    const installment = await prisma.rentalInstallment.findFirst({
      where: { id: installmentId, tenant_id: tenantId }
    });
    if (!installment) {
      throw new NotFoundError(t('Échéance introuvable'));
    }
  }

  // Validate amount
  if (amount <= 0) {
    throw new BadRequestError(t('Le montant du mouvement doit être positif'));
  }

  // Les contrôles de solde, l'écriture du mouvement et la mise à jour des
  // cumuls se font dans UNE transaction, sous verrou de ligne du dépôt : deux
  // remboursements concurrents de 300 000 sur 500 000 lisaient le même solde et
  // passaient tous deux, et un second encaissement passait la règle « un seul
  // COLLECT ». Le verrou sérialise les mouvements d'un même dépôt ; le solde est
  // relu APRÈS l'avoir pris.
  //
  // Le compte de tresorerie d'un remboursement est verifie et la piece
  // ecrite dans la meme transaction : un remboursement enregistre sur un
  // compte finalement invalide ne doit rien laisser derriere lui.
  const movement = await prisma.$transaction(
    async tx => {
      await tx.$queryRaw`SELECT id FROM rental_security_deposits WHERE id = ${depositId}::uuid FOR UPDATE`;
      const locked = await tx.rentalSecurityDeposit.findFirst({ where: { id: depositId, tenant_id: tenantId } });
      if (!locked) {
        throw new NotFoundError(t('Dépôt de garantie introuvable'));
      }

      await assertDepositMovementAllowedTx(tx, locked, type, amount, paymentId);
      await assertTreasuryAccountUsableTx(tx, tenantId, treasuryAccountId, method ?? 'CASH');

      const created = await tx.rentalDepositMovement.create({
        data: {
          tenant_id: tenantId,
          deposit_id: depositId,
          type: type,
          currency: locked.currency,
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
        data: depositAggregateUpdate(type, amount)
      });

      await postDepositAccountingTx(tx, tenantId, type, created.id, paymentId);

      // Critical action: audit trail written in the same transaction.
      if (actorUserId) {
        await recordAuditEvent(tx, {
          actorUserId,
          tenantId,
          actionKey: 'RENTAL_DEPOSIT_MOVEMENT_CREATED',
          entityType: 'RENTAL_DEPOSIT_MOVEMENT',
          entityId: created.id,
          payload: {
            depositId,
            type,
            amount
          }
        });
      }

      return created;
    },
    { timeout: 15000, maxWait: 10000 }
  );

  logger.info('Deposit movement created', {
    movementId: movement.id,
    depositId,
    tenantId,
    type,
    amount
  });

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
    throw new NotFoundError(t('Dépôt de garantie introuvable'));
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
