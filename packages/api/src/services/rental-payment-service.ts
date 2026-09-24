import { prisma } from '../utils/database';
import type { PrismaTransactionClient } from '../utils/database';
import { logger } from '../utils/logger';
import {
  RentalPaymentStatus,
  RentalPaymentMethod,
  RentalInstallmentStatus,
  ThirdPartyMovementType
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { appendThirdPartyMovementTx } from '../lib/finance/ledger';
import { roundMoney } from '../lib/finance/money';
import { assertTreasuryAccountUsableTx } from '../lib/treasury/accounts';
import {
  annulerPieceTx,
  compteLocataireDuBailTx,
  compteLocataireTx,
  libellePeriodeEcheance
} from './rental-installment-service';

// ---------------------------------------------------------------------------
// Pont vers le grand livre des comptes de tiers — lot 1, tâche 1.3
//
// Un règlement encaissé se traduit au compte du locataire par une ou plusieurs
// affectations (`PAYMENT`) et, pour ce qui n'a été affecté à aucune échéance,
// par une avance reçue (`ADVANCE_RECEIVED`). La somme des deux vaut toujours
// le montant du règlement : c'est l'invariant que tout ce qui suit préserve, et
// c'est celui que le rétro-remplissage reconstruit depuis les pièces.
//
// Les clés de source sont celles de `rebuildThirdPartyAccount` : une allocation
// est portée par `(RENTAL_PAYMENT_ALLOCATION, id)`, un règlement par
// `(RENTAL_PAYMENT, id)`. Écrire sous d'autres clés ferait que le
// rétro-remplissage, rejoué ensuite, ajouterait un second mouvement pour la
// même pièce.
// ---------------------------------------------------------------------------

/** Mêmes intitulés de moyen de paiement que le rétro-remplissage. */
const MOYEN_PAIEMENT_FR: Record<string, string> = {
  CASH: 'especes',
  BANK_TRANSFER: 'virement bancaire',
  CHECK: 'cheque',
  MOBILE_MONEY: 'Mobile Money',
  CARD: 'carte',
  OTHER: 'autre moyen'
};

export function libelleMoyen(method: string | null | undefined): string {
  return (method && MOYEN_PAIEMENT_FR[method]) || 'moyen non precise';
}

/**
 * Compte de tiers à mouvementer pour un règlement.
 *
 * `renter_client_id` d'abord, comme le rétro-remplissage, qui rattache les
 * règlements au locataire par ce seul champ. Il est facultatif en base : quand
 * il manque, on retombe sur le locataire principal du bail réglé, faute de quoi
 * l'encaissement n'apparaîtrait sur aucun compte. Cette reprise ne peut pas
 * créer de doublon, puisque le mouvement porte la clé que le rétro-remplissage
 * utiliserait s'il voyait la pièce.
 */
async function comptePayeurTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  payment: { renter_client_id?: string | null; lease_id?: string | null }
): Promise<string | null> {
  if (payment.renter_client_id) {
    return compteLocataireTx(tx, tenantId, payment.renter_client_id);
  }

  if (payment.lease_id) {
    const compte = await compteLocataireDuBailTx(tx, tenantId, payment.lease_id);
    return compte?.accountId ?? null;
  }

  return null;
}

/** Le règlement a-t-il déjà été porté au compte comme avance reçue ? */
async function avanceDejaCrediteeTx(tx: PrismaTransactionClient, paymentId: string): Promise<boolean> {
  const avance = await tx.thirdPartyMovement.findUnique({
    where: {
      sourceType_sourceId_type: {
        sourceType: 'RENTAL_PAYMENT',
        sourceId: paymentId,
        type: ThirdPartyMovementType.ADVANCE_RECEIVED
      }
    },
    select: { id: true }
  });

  return Boolean(avance);
}

/**
 * Inscrit l'affectation d'un règlement à une échéance.
 *
 * Quand le règlement avait déjà été porté au compte en entier comme avance
 * reçue, l'affectation ne ramène pas d'argent neuf : on inscrit alors, sous la
 * même pièce, l'imputation de cette avance (`ADVANCE_APPLIED`) qui en reprend
 * exactement le montant. Le relevé montre distinctement l'affectation et la
 * consommation de l'avance (FR-011), le solde ne bouge pas, et le même argent
 * n'est pas encaissé deux fois.
 */
export async function inscrireAllocationTx(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    accountId: string;
    allocationId: string;
    montant: number;
    moyen: string;
    periode: string | null;
    leaseId?: string | null;
    movementDate?: Date;
    avanceDejaCreditee: boolean;
  }
): Promise<void> {
  await appendThirdPartyMovementTx(tx, {
    accountId: params.accountId,
    tenantId: params.tenantId,
    type: ThirdPartyMovementType.PAYMENT,
    settled: params.montant,
    label: params.periode
      ? `Règlement (${params.moyen}) affecté à l'échéance ${params.periode}`
      : `Règlement (${params.moyen})`,
    sourceType: 'RENTAL_PAYMENT_ALLOCATION',
    sourceId: params.allocationId,
    leaseId: params.leaseId ?? null,
    movementDate: params.movementDate
  });

  if (!params.avanceDejaCreditee) {
    return;
  }

  await appendThirdPartyMovementTx(tx, {
    accountId: params.accountId,
    tenantId: params.tenantId,
    type: ThirdPartyMovementType.ADVANCE_APPLIED,
    billed: params.montant,
    label: params.periode ? `Avance imputée sur l'échéance ${params.periode}` : 'Avance imputée',
    sourceType: 'RENTAL_PAYMENT_ALLOCATION',
    sourceId: params.allocationId,
    leaseId: params.leaseId ?? null,
    movementDate: params.movementDate
  });
}

/**
 * Inscrit au compte ce qu'un règlement encaissé laisse sans affectation.
 *
 * Le compte du locataire devient créditeur d'autant : c'est ce qui permet à la
 * campagne de facturation d'imputer ensuite cette avance sur une échéance sans
 * réencaisser l'argent. Rien n'est écrit quand tout est affecté.
 */
export async function inscrireReliquatTx(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    accountId: string;
    payment: { id: string; amount: unknown; method: string | null; lease_id?: string | null };
    dejaAffecte: number;
    movementDate?: Date;
  }
) {
  const reliquat = roundMoney(Number(params.payment.amount ?? 0) - params.dejaAffecte);

  if (reliquat <= 0) {
    return null;
  }

  return appendThirdPartyMovementTx(tx, {
    accountId: params.accountId,
    tenantId: params.tenantId,
    type: ThirdPartyMovementType.ADVANCE_RECEIVED,
    settled: reliquat,
    label: `Règlement (${libelleMoyen(params.payment.method)}) reçu en avance, non affecté`,
    sourceType: 'RENTAL_PAYMENT',
    sourceId: params.payment.id,
    leaseId: params.payment.lease_id ?? null,
    movementDate: params.movementDate
  });
}

/** Somme des affectations d'un règlement, telle qu'elle est en base à cet instant. */
async function totalAffecteTx(tx: PrismaTransactionClient, paymentId: string): Promise<number> {
  const allocations = await tx.rentalPaymentAllocation.findMany({
    where: { payment_id: paymentId },
    select: { amount: true }
  });

  return roundMoney(allocations.reduce((somme, a) => somme + Number(a.amount), 0));
}

/**
 * Date du règlement d'un paiement saisi à la main.
 *
 * `succeeded_at` est, partout dans l'application, la date où l'argent est
 * arrivé : relevé propriétaire, tableau de bord, quittance, compte du
 * locataire. La fixer au jour de la SAISIE rangeait un loyer reçu le 30 août et
 * saisi le 2 septembre dans le relevé de septembre.
 *
 * - Absente : maintenant, comme avant.
 * - Aujourd'hui : maintenant, pour garder l'heure réelle.
 * - Un jour passé : ce jour à midi UTC. Midi et pas minuit : la date reste la
 *   même quel que soit le fuseau dans lequel on la relit.
 * - Un jour futur, ou une date qui n'existe pas (31 février) : refus.
 */
export function resolvePaymentDate(paidAt: string | undefined, now: Date = new Date()): Date {
  if (!paidAt) return now;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paidAt);
  if (!match) {
    throw new Error('Date du règlement attendue au format AAAA-MM-JJ');
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("La date du règlement n'existe pas");
  }

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const chosen = Date.UTC(year, month - 1, day);
  if (chosen > today) {
    throw new Error('La date du règlement ne peut pas être dans le futur');
  }
  return chosen === today ? now : date;
}

interface CreatePaymentData {
  /** Date du règlement, `YYYY-MM-DD` — voir `resolvePaymentDate`. */
  paidAt?: string;
  leaseId?: string;
  renterClientId?: string;
  invoiceId?: string;
  method: RentalPaymentMethod;
  amount: number;
  currency?: string;
  mmOperator?: string;
  mmPhone?: string;
  pspName?: string;
  pspTransactionId?: string;
  pspReference?: string;
  idempotencyKey: string;
  /** Lot 10 : compte de trésorerie réellement crédité. Nul : celui par défaut du moyen de paiement. */
  treasuryAccountId?: string | null;
}

interface AllocatePaymentData {
  installmentIds: string[];
  amounts?: Record<string, number>;
}

interface PaymentFilters {
  leaseId?: string;
  renterClientId?: string;
  status?: RentalPaymentStatus;
  method?: RentalPaymentMethod;
  startDate?: Date;
  endDate?: Date;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
}

/**
 * Create a new payment
 * @param tenantId - Tenant ID
 * @param data - Payment data
 * @param actorUserId - User creating the payment
 * @returns Created payment
 */
export async function createPayment(tenantId: string, data: CreatePaymentData, actorUserId?: string): Promise<any> {
  try {
    // Avant tout accès à la base : une date refusée ne doit rien laisser derrière elle.
    const paidAt = resolvePaymentDate(data.paidAt);

    // Check for idempotency - if payment with this key exists, return it
    const existingPayment = await prisma.rentalPayment.findFirst({
      where: {
        tenant_id: tenantId,
        idempotency_key: data.idempotencyKey
      },
      include: {
        allocations: {
          include: {
            installment: true
          }
        }
      }
    });

    if (existingPayment) {
      logger.info(`Payment with idempotency key ${data.idempotencyKey} already exists`);
      return existingPayment;
    }

    // Validate lease exists if provided
    if (data.leaseId) {
      const lease = await prisma.rentalLease.findFirst({
        where: {
          id: data.leaseId,
          tenant_id: tenantId
        }
      });

      if (!lease) {
        throw new Error('Bail introuvable');
      }
    }

    // Create the payment
    //
    // L'encaissement et son mouvement de compte sont indivisibles : un
    // règlement enregistré dont le compte du locataire ne saurait rien ferait
    // apparaître le locataire débiteur d'un loyer qu'il a payé.
    const payment = await prisma.$transaction(async tx => {
      await assertTreasuryAccountUsableTx(tx, tenantId, data.treasuryAccountId, data.method);

      const created = await tx.rentalPayment.create({
        data: {
          tenant_id: tenantId,
          lease_id: data.leaseId,
          renter_client_id: data.renterClientId,
          invoice_id: data.invoiceId,
          method: data.method,
          amount: new Decimal(data.amount),
          currency: data.currency || 'FCFA',
          mm_operator: data.mmOperator as any,
          mm_phone: data.mmPhone,
          treasury_account_id: data.treasuryAccountId || null,
          psp_name: data.pspName,
          psp_transaction_id: data.pspTransactionId,
          psp_reference: data.pspReference,
          idempotency_key: data.idempotencyKey,
          status: RentalPaymentStatus.SUCCESS, // Auto-mark as success for manual payments
          succeeded_at: paidAt,
          created_by_user_id: actorUserId
        },
        include: {
          allocations: {
            include: {
              installment: true
            }
          }
        }
      });

      // Un règlement créé ici l'est sans affectation : la totalité est reçue
      // en avance, et l'affectation viendra plus tard (`allocatePayment` ou la
      // campagne de facturation), sans réencaisser cet argent.
      const compteId = await comptePayeurTx(tx, tenantId, created);
      if (compteId && created.status === RentalPaymentStatus.SUCCESS) {
        await inscrireReliquatTx(tx, {
          tenantId,
          accountId: compteId,
          payment: created,
          dejaAffecte: 0,
          movementDate: created.succeeded_at ?? created.initiated_at
        });
      }

      return created;
    });

    logger.info(`Payment ${payment.id} created successfully for tenant ${tenantId}`);

    // Les emails sont gérés uniquement par les flux dédiés (Notifications email / email_notification_configs), pas par triggerEvent (Règles/Templates).

    return payment;
  } catch (error) {
    logger.error('Error creating payment:', error);
    throw error;
  }
}

/**
 * Corps de `allocatePayment`, utilisable dans une transaction fournie par
 * l'appelant.
 *
 * Extrait pour le lot 7 (paiement en ligne) : au succès d'un paiement en
 * ligne, `reconcileCheckout` doit faire passer le paiement à SUCCESS ET
 * l'allouer aux échéances choisies par le locataire dans la MÊME transaction
 * — sans quoi un arrêt entre les deux laisserait un paiement encaissé mais
 * jamais affecté, ou pire, affecté deux fois si l'appel est rejoué. Toutes
 * les lectures passent par `tx` (jamais `prisma`), pour lire un état
 * cohérent avec ce que la même transaction vient d'écrire.
 */
export async function allocatePaymentTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  paymentId: string,
  data: AllocatePaymentData,
  _actorUserId: string
): Promise<{ allocations: any[]; totalAllocated: number; payment: any; installments: any[] }> {
  // Get payment with allocations
  const payment = await tx.rentalPayment.findFirst({
    where: {
      id: paymentId,
      tenant_id: tenantId
    },
    include: {
      allocations: true
    }
  });

  if (!payment) {
    throw new Error('Paiement introuvable');
  }

  // Check if payment is already fully allocated
  const allocatedAmount = payment.allocations.reduce((sum, alloc) => sum + Number(alloc.amount), 0);
  const remainingAmount = Number(payment.amount) - allocatedAmount;

  if (remainingAmount <= 0) {
    throw new Error('Le paiement est déjà entièrement alloué');
  }

  // Get installments to allocate to
  const installments = await tx.rentalInstallment.findMany({
    where: {
      id: { in: data.installmentIds },
      tenant_id: tenantId,
      lease_id: payment.lease_id || undefined
    },
    orderBy: [
      { due_date: 'asc' } // Prioritize oldest first
    ]
  });

  if (installments.length === 0) {
    throw new Error('Aucune échéance trouvée');
  }

  // Calculate allocations
  const allocations: any[] = [];
  let amountToAllocate = remainingAmount;

  for (const installment of installments) {
    if (amountToAllocate <= 0) break;

    // Calculate remaining amount due for this installment
    // Get existing allocations for this installment
    const existingAllocations = await tx.rentalPaymentAllocation.findMany({
      where: { installment_id: installment.id }
    });

    const allocatedToInstallment = existingAllocations.reduce((sum, alloc) => sum + Number(alloc.amount), 0);

    // Calculate total amount due (rent + service + other fees + penalties)
    const totalAmountDue =
      Number(installment.amount_rent) +
      Number(installment.amount_service) +
      Number(installment.amount_other_fees) +
      Number(installment.penalty_amount);

    const remainingDue = totalAmountDue - allocatedToInstallment;

    if (remainingDue <= 0) continue;

    // Determine allocation amount
    let allocationAmount: number;
    if (data.amounts && data.amounts[installment.id]) {
      // Use manually specified amount, but don't exceed remaining due
      allocationAmount = Math.min(data.amounts[installment.id], remainingDue, amountToAllocate);
    } else {
      // Auto-allocate: use minimum of remaining due and remaining payment
      allocationAmount = Math.min(remainingDue, amountToAllocate);
    }

    if (allocationAmount > 0) {
      allocations.push({
        tenant_id: tenantId,
        payment_id: paymentId,
        installment_id: installment.id,
        amount: new Decimal(allocationAmount),
        currency: payment.currency
      });

      amountToAllocate -= allocationAmount;
    }
  }

  if (allocations.length === 0) {
    throw new Error('Aucune allocation possible');
  }

  // Create allocations and update installment statuses
  {
    // Le compte du payeur est résolu une fois pour toute la transaction :
    // toutes les affectations d'un même règlement vont au même compte.
    const compteId = await comptePayeurTx(tx, tenantId, payment);
    const avanceDejaCreditee = compteId ? await avanceDejaCrediteeTx(tx, paymentId) : false;
    const moyen = libelleMoyen(payment.method);
    const dateReglement = payment.succeeded_at ?? payment.initiated_at ?? undefined;

    // Update installment statuses
    for (const allocation of allocations) {
      // Création ligne à ligne, et non `createMany` : le mouvement de compte
      // porte l'identifiant de l'allocation, que `createMany` ne renvoie
      // pas. Les lignes écrites sont les mêmes, et l'unicité
      // `(payment_id, installment_id)` protège toujours des doublons.
      const created = await tx.rentalPaymentAllocation.create({ data: allocation });

      const installment = installments.find(i => i.id === allocation.installment_id);
      if (!installment) continue;

      if (compteId) {
        await inscrireAllocationTx(tx, {
          tenantId,
          accountId: compteId,
          allocationId: created.id,
          montant: Number(allocation.amount),
          moyen,
          periode: libellePeriodeEcheance(installment.period_year, installment.period_month),
          leaseId: installment.lease_id,
          movementDate: dateReglement,
          avanceDejaCreditee
        });
      }

      // Get all allocations for this installment including the new one
      const allAllocations = await tx.rentalPaymentAllocation.findMany({
        where: { installment_id: installment.id }
      });

      // Calculate total allocated - allAllocations already includes the newly created allocation
      const totalAllocated = allAllocations.reduce((sum, alloc) => sum + Number(alloc.amount), 0);

      // Calculate total amount due
      const totalAmountDue =
        Number(installment.amount_rent) +
        Number(installment.amount_service) +
        Number(installment.amount_other_fees) +
        Number(installment.penalty_amount);

      let newStatus = installment.status;
      if (totalAllocated >= totalAmountDue) {
        newStatus = RentalInstallmentStatus.PAID;
      } else if (totalAllocated > 0) {
        newStatus = RentalInstallmentStatus.PARTIAL;
      }

      await tx.rentalInstallment.update({
        where: { id: installment.id },
        data: {
          status: newStatus,
          amount_paid: new Decimal(totalAllocated),
          paid_at: newStatus === RentalInstallmentStatus.PAID ? new Date() : undefined
        }
      });
    }

    // Ce qui reste non affecté après cette opération est une avance reçue.
    // Sans effet si l'avance a déjà été portée au compte à l'encaissement :
    // la clé `(RENTAL_PAYMENT, id, ADVANCE_RECEIVED)` n'admet qu'un mouvement.
    if (compteId && payment.status === RentalPaymentStatus.SUCCESS) {
      await inscrireReliquatTx(tx, {
        tenantId,
        accountId: compteId,
        payment,
        dejaAffecte: await totalAffecteTx(tx, paymentId),
        movementDate: dateReglement
      });
    }
  }

  return {
    allocations,
    totalAllocated: allocations.reduce((sum, a) => sum + Number(a.amount), 0),
    payment,
    installments
  };
}

/**
 * Allocate payment to installments
 * @param tenantId - Tenant ID
 * @param paymentId - Payment ID
 * @param data - Allocation data
 * @param actorUserId - User allocating payment
 * @returns Allocation result
 */
export async function allocatePayment(
  tenantId: string,
  paymentId: string,
  data: AllocatePaymentData,
  actorUserId: string
): Promise<any> {
  try {
    const { allocations, totalAllocated, payment, installments } = await prisma.$transaction(tx =>
      allocatePaymentTx(tx, tenantId, paymentId, data, actorUserId)
    );

    logger.info(`Payment ${paymentId} allocated to ${allocations.length} installments`);

    // Notify tenant by email (en dur, like payment declaration approval)
    try {
      const leaseId = payment.lease_id;
      if (leaseId) {
        const leaseWithRenter = await prisma.rentalLease.findFirst({
          where: { id: leaseId, tenant_id: tenantId },
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
        const lease = await prisma.rentalLease.findUnique({
          where: { id: leaseId },
          select: { lease_number: true }
        });
        const leaseNumber = lease?.lease_number || '';
        const totalAllocated = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
        const installmentPeriods = installments
          .filter(i => allocations.some(a => a.installment_id === i.id))
          .map(i => `${String(i.period_month).padStart(2, '0')}/${i.period_year}`);

        const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
        const portalPath = '/tenant/payments';
        const portalUrl = `${baseUrl}/login?redirect=${encodeURIComponent(portalPath)}`;

        let leaseLabel: string | undefined;
        if (leaseWithRenter?.property) {
          const { getPropertyDisplayLabel } = await import('../utils/property-display');
          leaseLabel = getPropertyDisplayLabel(leaseWithRenter.property);
        }
        const agencyName = leaseWithRenter?.tenant?.name || undefined;
        const renterName = leaseWithRenter?.primaryRenter?.user?.fullName || 'Locataire';

        const { getEmailNotificationConfig } = await import('./email-notification-config-service');
        const configTenant = await getEmailNotificationConfig(tenantId, 'PAYMENT_ALLOCATED_TENANT');
        const configOwner = await getEmailNotificationConfig(tenantId, 'PAYMENT_ALLOCATED_OWNER');

        const tenantEmail = leaseWithRenter?.primaryRenter?.user?.email;
        if (tenantEmail && configTenant.enabled) {
          await emailService.sendPaymentAllocatedToTenant(
            tenantEmail,
            renterName,
            leaseNumber,
            totalAllocated,
            installmentPeriods,
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
          logger.info('Payment allocated notification sent to tenant', {
            paymentId,
            email: tenantEmail,
            installmentCount: installmentPeriods.length
          });
        }

        const contactIdAlloc = tenantEmail
          ? await import('./whatsapp-contact-resolve').then(m => m.getCrmContactIdForWhatsApp(tenantId, tenantEmail))
          : null;
        if (contactIdAlloc) {
          const { sendWhatsappNotification } = await import('./whatsapp-notification-send-service');
          await sendWhatsappNotification({
            tenantId,
            notificationKey: 'PAYMENT_ALLOCATED_TENANT',
            variables: {
              tenantName: renterName || 'Locataire',
              amountAllocated: String(totalAllocated),
              leaseLabel: leaseLabel || leaseNumber,
              agencyName: agencyName || "L'agence"
            },
            contactId: contactIdAlloc
          });
        }

        const ownerUser = leaseWithRenter?.ownerClient?.user || leaseWithRenter?.property?.owner;
        if (ownerUser?.email && configOwner.enabled) {
          try {
            await emailService.sendPaymentAllocatedToOwner(
              ownerUser.email,
              ownerUser.fullName || 'Propriétaire',
              renterName,
              leaseNumber,
              totalAllocated,
              installmentPeriods,
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
            logger.info('Payment allocated notification sent to owner', { paymentId, email: ownerUser.email });
          } catch (ownerErr: any) {
            logger.warn('Failed to send payment allocated email to owner', {
              paymentId,
              error: ownerErr?.message
            });
          }
        }
      }
    } catch (emailErr: any) {
      logger.warn('Failed to send payment allocated email to tenant', {
        paymentId,
        error: emailErr?.message
      });
    }

    return { allocations, totalAllocated };
  } catch (error) {
    logger.error('Error allocating payment:', error);
    throw error;
  }
}

/**
 * Recalcule le montant paye et le statut d'echeances dont les allocations ont
 * change. Les allocations font foi : `amount_paid` en est toujours la somme.
 * Le statut suit la meme regle que `updateInstallmentStatus` du service des
 * echeances (solde, puis date d'echeance).
 */
async function reverseInstallmentAllocations(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  installmentIds: string[]
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const installmentId of installmentIds) {
    const installment = await tx.rentalInstallment.findUnique({ where: { id: installmentId } });
    if (!installment) continue;

    const remaining = await tx.rentalPaymentAllocation.findMany({
      where: { installment_id: installmentId },
      select: { amount: true }
    });
    const totalPaid = remaining.reduce((sum, alloc) => sum + Number(alloc.amount), 0);

    const totalDue =
      Number(installment.amount_rent) +
      Number(installment.amount_service) +
      Number(installment.amount_other_fees) +
      Number(installment.penalty_amount);

    const dueDate = new Date(installment.due_date);
    dueDate.setHours(0, 0, 0, 0);

    let status: RentalInstallmentStatus;
    if (totalDue > 0 && totalPaid >= totalDue) {
      status = RentalInstallmentStatus.PAID;
    } else if (totalPaid > 0) {
      status = RentalInstallmentStatus.PARTIAL;
    } else if (dueDate < today) {
      status = RentalInstallmentStatus.OVERDUE;
    } else {
      status = RentalInstallmentStatus.DUE;
    }

    await tx.rentalInstallment.update({
      where: { id: installmentId },
      data: {
        amount_paid: new Decimal(totalPaid),
        status,
        paid_at: status === RentalInstallmentStatus.PAID ? installment.paid_at : null
      }
    });
  }
}

/**
 * Corps de `updatePaymentStatus`, utilisable dans une transaction fournie par
 * l'appelant.
 *
 * Extrait pour le lot 7 (paiement en ligne) : `reconcileCheckout` doit changer
 * le statut du paiement ET celui du checkout dans la même transaction — la
 * changer deux fois séparément laisserait une fenêtre où l'un est à jour et
 * l'autre pas si le processus s'arrête entre les deux. Ne PAS dupliquer cette
 * logique ailleurs ; ajouter ici si un autre appelant transactionnel apparaît.
 */
export async function updatePaymentStatusTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  paymentId: string,
  status: RentalPaymentStatus,
  _actorUserId?: string
): Promise<any> {
  const payment = await tx.rentalPayment.findFirst({
    where: {
      id: paymentId,
      tenant_id: tenantId
    }
  });

  if (!payment) {
    throw new Error('Paiement introuvable');
  }

  const updateData: any = { status };

  // Set timestamp based on status
  if (status === RentalPaymentStatus.SUCCESS && !payment.succeeded_at) {
    updateData.succeeded_at = new Date();
  } else if (status === RentalPaymentStatus.FAILED && !payment.failed_at) {
    updateData.failed_at = new Date();
  } else if (status === RentalPaymentStatus.CANCELED && !payment.canceled_at) {
    updateData.canceled_at = new Date();
  }

  // Un paiement annule ou echoue ne doit plus solder quoi que ce soit : sans
  // ce retrait, l'echeance restait PAID et le loyer continuait d'apparaitre
  // encaisse (reversement proprietaire et quittance compris).
  const reversesAllocations = status === RentalPaymentStatus.CANCELED || status === RentalPaymentStatus.FAILED;

  {
    // Résolution paresseuse : le compte de tiers est créé s'il n'existe pas,
    // et un changement de statut sans écriture au grand livre (un règlement
    // remboursé, un règlement antérieur au branchement) n'a aucune raison
    // d'ouvrir un compte vide qui apparaîtrait ensuite à la balance clients.
    let compteResolu: string | null | undefined;
    const compteId = async () => {
      if (compteResolu === undefined) {
        compteResolu = await comptePayeurTx(tx, tenantId, payment);
      }
      return compteResolu;
    };
    const moyen = libelleMoyen(payment.method);

    if (reversesAllocations) {
      const allocations = await tx.rentalPaymentAllocation.findMany({
        where: { payment_id: paymentId },
        select: {
          id: true,
          installment_id: true,
          installment: { select: { lease_id: true, period_year: true, period_month: true } }
        }
      });
      const installmentIds = [...new Set(allocations.map(a => a.installment_id))];

      if (installmentIds.length > 0) {
        await tx.rentalPaymentAllocation.deleteMany({ where: { payment_id: paymentId } });
        await reverseInstallmentAllocations(tx, installmentIds);
        logger.info(`Payment ${paymentId} ${status}: reversed ${installmentIds.length} installment(s)`);
      }

      // Le retrait des affectations doit se voir au compte, sinon le
      // locataire resterait crédité d'un règlement qui ne solde plus rien.
      // On contrepasse ce que chaque pièce a réellement inscrit : une
      // affectation d'avance, elle, était sans effet sur le solde et le
      // reste. Un règlement dont rien n'a jamais été porté au grand livre
      // n'a rien à contrepasser.
      const inscrit = await tx.thirdPartyMovement.count({
        where: { tenantId, sourceId: { in: [paymentId, ...allocations.map(a => a.id)] } }
      });
      const accountId = inscrit > 0 ? await compteId() : null;

      if (accountId) {
        const dateAnnulation = new Date();

        for (const allocation of allocations) {
          const periode = libellePeriodeEcheance(
            allocation.installment?.period_year,
            allocation.installment?.period_month
          );

          await annulerPieceTx(tx, {
            tenantId,
            accountId,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: allocation.id,
            label: periode
              ? `Annulation du règlement (${moyen}) affecté à l'échéance ${periode}`
              : `Annulation du règlement (${moyen})`,
            leaseId: allocation.installment?.lease_id ?? payment.lease_id ?? null,
            movementDate: dateAnnulation
          });
        }

        await annulerPieceTx(tx, {
          tenantId,
          accountId,
          sourceType: 'RENTAL_PAYMENT',
          sourceId: paymentId,
          label: `Annulation du règlement (${moyen}) reçu en avance`,
          leaseId: payment.lease_id ?? null,
          movementDate: dateAnnulation
        });
      }
    } else if (status === RentalPaymentStatus.SUCCESS) {
      // Un règlement qui devient encaissé porte au compte ce qu'il ne solde
      // encore aucune échéance.
      const dejaAffecte = await totalAffecteTx(tx, paymentId);
      const accountId = roundMoney(Number(payment.amount ?? 0) - dejaAffecte) > 0 ? await compteId() : null;

      if (accountId) {
        await inscrireReliquatTx(tx, {
          tenantId,
          accountId,
          payment,
          dejaAffecte,
          movementDate: updateData.succeeded_at ?? payment.succeeded_at ?? payment.initiated_at
        });
      }
    }

    return tx.rentalPayment.update({
      where: { id: paymentId },
      data: updateData,
      include: {
        allocations: {
          include: {
            installment: true
          }
        }
      }
    });
  }
}

/**
 * Update payment status
 * @param tenantId - Tenant ID
 * @param paymentId - Payment ID
 * @param status - New status
 * @param actorUserId - User updating status
 * @returns Updated payment
 */
export async function updatePaymentStatus(
  tenantId: string,
  paymentId: string,
  status: RentalPaymentStatus,
  actorUserId: string
): Promise<any> {
  try {
    const updatedPayment = await prisma.$transaction(tx =>
      updatePaymentStatusTx(tx, tenantId, paymentId, status, actorUserId)
    );

    logger.info(`Payment ${paymentId} status updated to ${status}`);
    return updatedPayment;
  } catch (error) {
    logger.error('Error updating payment status:', error);
    throw error;
  }
}

/**
 * Get payment by ID
 * @param tenantId - Tenant ID
 * @param paymentId - Payment ID
 * @returns Payment or null
 */
export async function getPaymentById(tenantId: string, paymentId: string): Promise<any> {
  try {
    const payment = await prisma.rentalPayment.findFirst({
      where: {
        id: paymentId,
        tenant_id: tenantId
      },
      include: {
        allocations: {
          include: {
            installment: true
          }
        },
        depositMovements: {
          select: { id: true, amount: true, type: true, created_at: true }
        },
        lease: {
          include: {
            property: true
          }
        },
        renterClient: true,
        // Lot 7 : paiement en ligne éventuellement adossé, mappé en
        // `OnlineCheckoutSummary` par le contrôleur (voir
        // `toOnlineCheckoutSummaryDto`, `lib/payment-gateway/checkout.ts`).
        onlineCheckout: true
      }
    });

    return payment;
  } catch (error) {
    logger.error('Error getting payment:', error);
    throw error;
  }
}

/**
 * List payments with filters
 * @param tenantId - Tenant ID
 * @param filters - Filter criteria
 * @param options - Pagination options
 * @returns Paginated payment list
 */
export async function listPayments(
  tenantId: string,
  filters: PaymentFilters,
  options: PaginationOptions = {}
): Promise<any> {
  try {
    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      tenant_id: tenantId
    };

    if (filters.leaseId) {
      where.lease_id = filters.leaseId;
    }

    if (filters.renterClientId) {
      where.renter_client_id = filters.renterClientId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.method) {
      where.method = filters.method;
    }

    if (filters.startDate || filters.endDate) {
      where.created_at = {};
      if (filters.startDate) {
        where.created_at.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.created_at.lte = filters.endDate;
      }
    }

    const [payments, total] = await Promise.all([
      prisma.rentalPayment.findMany({
        where,
        include: {
          allocations: {
            include: {
              installment: true
            }
          },
          depositMovements: {
            select: { id: true, amount: true }
          },
          lease: {
            include: {
              property: true
            }
          },
          // `renterClient: true` ne ramenait que la ligne du client, sans le
          // compte : la liste avait un identifiant mais aucun nom a afficher.
          renterClient: {
            include: {
              user: { select: { fullName: true, email: true } }
            }
          },
          onlineCheckout: true
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      prisma.rentalPayment.count({ where })
    ]);

    return {
      data: payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    logger.error('Error listing payments:', error);
    throw error;
  }
}
