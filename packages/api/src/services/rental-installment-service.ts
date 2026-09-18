import { prisma } from '../utils/database';
import type { PrismaTransactionClient } from '../utils/database';
import { logger } from '../utils/logger';
import {
  RentalBillingFrequency,
  RentalInstallmentStatus,
  RentalLeaseStatus,
  ThirdPartyMovementType
} from '@prisma/client';
import { buildInstallmentForPeriod } from '../lib/finance/installment-builder';
import { appendThirdPartyMovementTx, getOrCreateTenantAccountTx } from '../lib/finance/ledger';
import { roundMoney } from '../lib/finance/money';
import type { FinanceSourceType } from '../lib/finance/types';

// ---------------------------------------------------------------------------
// Pont vers le grand livre des comptes de tiers — lot 1, tâche 1.3
//
// Ces fonctions sont partagées par les quatre services locatifs qui font
// bouger une créance (échéances, paiements, pénalités, déclarations). Elles
// vivent ici, et non dans `lib/finance/`, parce que ce branchement ne rouvre
// pas le contrat gelé du grand livre : elles n'ajoutent aucune règle
// financière, elles traduisent une pièce locative en paramètres de mouvement.
//
// Deux invariants les gouvernent, et rien ne doit les contourner :
//
//   1. **Elles n'écrivent que par un client de transaction.** Le mouvement
//      naît dans la même transaction que la pièce qui le provoque, ou il ne
//      naît pas (décision D3 du plan de mise en œuvre). Aucune ne prend
//      `prisma` : leur signature l'interdit.
//   2. **Elles reprennent les clés de source du rétro-remplissage**
//      (`rebuildThirdPartyAccount`, `lib/finance/ledger.ts`) : même
//      `sourceType` et même `sourceId` pour une même pièce. Sans cela, une
//      pièce porterait deux mouvements — celui écrit au fil de l'eau, puis
//      celui rejoué par le rétro-remplissage, que l'unicité
//      `(source_type, source_id, type)` ne reconnaîtrait pas comme le même.
// ---------------------------------------------------------------------------

/**
 * Noms de mois sans accent, identiques à ceux du rétro-remplissage et de la
 * campagne de facturation : les trois chemins écrivent sur le même relevé, et
 * « Loyer de fevrier 2026 » ne doit pas y côtoyer « Loyer de février 2026 ».
 */
const MOIS_FR = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre'
];

const MOIS_AVEC_ELISION = new Set(['avril', 'aout', 'octobre']);

/** « de fevrier 2026 » ou « d'octobre 2026 », prêt à suivre « Loyer » ou « l'échéance ». */
export function libellePeriodeEcheance(periodYear?: number | null, periodMonth?: number | null): string | null {
  if (!periodYear || !periodMonth) {
    return null;
  }
  const mois = MOIS_FR[(periodMonth - 1 + 12) % 12] ?? `mois ${periodMonth}`;
  return `${MOIS_AVEC_ELISION.has(mois) ? `d'${mois}` : `de ${mois}`} ${periodYear}`;
}

/**
 * Montant facturé par une échéance : loyer + charges + autres frais.
 *
 * `penalty_amount` en est volontairement exclu. Ce champ est un miroir
 * dénormalisé des lignes `RentalPenalty` (voir `deletePenalty` dans
 * `rental-penalty-service.ts`, qui le recalcule comme la somme des pénalités
 * restantes) ; or chaque pénalité porte déjà son propre mouvement `PENALTY`.
 * L'inclure ici facturerait deux fois la même pénalité. Même calcul que le
 * rétro-remplissage et que la campagne de facturation.
 */
export function montantFactureEcheance(installment: {
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
}): number {
  return roundMoney(
    Number(installment.amount_rent ?? 0) +
      Number(installment.amount_service ?? 0) +
      Number(installment.amount_other_fees ?? 0)
  );
}

/**
 * Compte de tiers du locataire, créé au besoin, dans la transaction courante.
 *
 * Échoue plutôt que de renvoyer `null` : un compte impossible à ouvrir veut
 * dire que le `TenantClient` n'existe pas ou n'appartient pas à ce tenant. Un
 * mouvement perdu en silence rendrait le solde faux sans que rien ne le
 * signale — c'est exactement ce que la transaction est là pour empêcher.
 * Même parti pris que la campagne de facturation.
 */
export async function compteLocataireTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  tenantClientId: string
): Promise<string> {
  const compte = await getOrCreateTenantAccountTx(tx, tenantId, tenantClientId);
  if (!compte) {
    throw new Error(`Compte de tiers introuvable ou impossible à créer pour le locataire ${tenantClientId}`);
  }
  return compte.id;
}

/**
 * Compte de tiers du locataire principal d'un bail. Renvoie `null` si le bail
 * n'existe pas ou n'appartient pas au tenant : il n'y a alors aucune créance à
 * inscrire, et l'isolation multi-tenant est vérifiée ici comme ailleurs.
 */
export async function compteLocataireDuBailTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  leaseId: string
): Promise<{ accountId: string; tenantClientId: string } | null> {
  const bail = await tx.rentalLease.findFirst({
    where: { id: leaseId, tenant_id: tenantId },
    select: { primary_renter_client_id: true }
  });

  if (!bail) {
    return null;
  }

  return {
    accountId: await compteLocataireTx(tx, tenantId, bail.primary_renter_client_id),
    tenantClientId: bail.primary_renter_client_id
  };
}

/**
 * Somme algébrique (facturé − réglé) de ce qu'une pièce a déjà inscrit au
 * grand livre. Sert à annuler ou corriger une pièce sans faire d'hypothèse sur
 * les mouvements qu'elle a produits : on lit ce qui est écrit plutôt que de le
 * redéduire du montant courant de la pièce, qui a pu changer entre-temps.
 */
export async function soldePieceTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  sourceType: FinanceSourceType,
  sourceId: string
): Promise<number> {
  const mouvements = await tx.thirdPartyMovement.findMany({
    where: { tenantId, sourceType, sourceId },
    select: { debit: true, credit: true }
  });

  return roundMoney(mouvements.reduce((somme, m) => somme + Number(m.debit ?? 0) - Number(m.credit ?? 0), 0));
}

/**
 * Écrit le mouvement inverse d'une pièce annulée ou supprimée.
 *
 * Le sens est celui que la pièce avait réellement pris au grand livre, pas
 * celui qu'on lui suppose : une échéance annulée se règle, une allocation
 * annulée se refacture. Une pièce qui n'a rien inscrit, ou déjà neutralisée,
 * ne produit aucun mouvement.
 */
export async function annulerPieceTx(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    accountId: string;
    sourceType: FinanceSourceType;
    sourceId: string;
    label: string;
    leaseId?: string | null;
    movementDate?: Date;
  }
) {
  const solde = await soldePieceTx(tx, params.tenantId, params.sourceType, params.sourceId);

  if (solde === 0) {
    return null;
  }

  return appendThirdPartyMovementTx(tx, {
    accountId: params.accountId,
    tenantId: params.tenantId,
    type: ThirdPartyMovementType.VOID,
    billed: solde < 0 ? -solde : undefined,
    settled: solde > 0 ? solde : undefined,
    label: params.label,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    leaseId: params.leaseId ?? null,
    movementDate: params.movementDate
  });
}

/**
 * Ramène au grand livre une pénalité dont le montant dû a baissé : remise
 * accordée par la gestionnaire, recalcul à la baisse, ou suppression pure et
 * simple (`montantRestant` vaut alors 0).
 *
 * Le grand livre est idempotent par `(sourceType, sourceId, type)` : une
 * pénalité ne peut donc porter qu'un mouvement `PENALTY` et qu'un mouvement
 * `WAIVER`. Une seconde baisse sur la même pénalité, comme une révision à la
 * hausse, n'a pas de clé disponible : on la journalise plutôt que d'écrire un
 * mouvement dont la clé serait absorbée en silence par l'unicité.
 */
export async function remettrePenaliteTx(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    accountId: string;
    penaltyId: string;
    montantRestant: number;
    label: string;
    leaseId?: string | null;
    movementDate?: Date;
  }
) {
  const solde = await soldePieceTx(tx, params.tenantId, 'RENTAL_PENALTY', params.penaltyId);
  const ecart = roundMoney(solde - roundMoney(params.montantRestant));

  if (ecart <= 0) {
    if (ecart < 0) {
      logger.warn('Pénalité revue à la hausse après inscription : écart non représentable au grand livre', {
        tenantId: params.tenantId,
        penaltyId: params.penaltyId,
        soldeInscrit: solde,
        montantRestant: params.montantRestant
      });
    }
    return null;
  }

  return appendThirdPartyMovementTx(tx, {
    accountId: params.accountId,
    tenantId: params.tenantId,
    type: ThirdPartyMovementType.WAIVER,
    settled: ecart,
    label: params.label,
    sourceType: 'RENTAL_PENALTY',
    sourceId: params.penaltyId,
    leaseId: params.leaseId ?? null,
    movementDate: params.movementDate
  });
}

/**
 * Inscrit au compte du locataire l'échéance devenue exigible.
 *
 * Appelée à chaque changement de statut vers un statut exigible, et non à la
 * seule transition vers `DUE` : une échéance créée en `DRAFT` dont la date est
 * déjà passée bascule directement en `OVERDUE` (voir le calcul de statut
 * ci-dessous), et ne serait jamais facturée si l'on n'écoutait que `DUE`.
 * L'idempotence du grand livre rend ces appels répétés sans effet : la clé
 * `(RENTAL_INSTALLMENT, id, INSTALLMENT)` n'admet qu'un mouvement, celui-là
 * même que la campagne de facturation ou le rétro-remplissage auraient écrit.
 */
export async function inscrireEcheanceFactureeTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  installment: {
    id: string;
    lease_id: string;
    status: RentalInstallmentStatus;
    due_date: Date;
    period_year: number;
    period_month: number;
    amount_rent: unknown;
    amount_service: unknown;
    amount_other_fees: unknown;
  }
) {
  if (installment.status === RentalInstallmentStatus.DRAFT || installment.status === RentalInstallmentStatus.CANCELED) {
    return null;
  }

  const compte = await compteLocataireDuBailTx(tx, tenantId, installment.lease_id);
  if (!compte) {
    return null;
  }

  const periode = libellePeriodeEcheance(installment.period_year, installment.period_month);

  return appendThirdPartyMovementTx(tx, {
    accountId: compte.accountId,
    tenantId,
    type: ThirdPartyMovementType.INSTALLMENT,
    billed: montantFactureEcheance(installment),
    label: periode ? `Loyer ${periode}` : 'Loyer',
    sourceType: 'RENTAL_INSTALLMENT',
    sourceId: installment.id,
    leaseId: installment.lease_id,
    movementDate: installment.due_date
  });
}

/**
 * Get billing period days based on frequency
 * @param frequency - Billing frequency
 * @returns Number of days in billing period (approximate, for calculation purposes)
 */
function getBillingPeriodDays(frequency: RentalBillingFrequency): number {
  switch (frequency) {
    case RentalBillingFrequency.MONTHLY:
      return 30; // Approximate, actual months will be calculated using calendar months
    case RentalBillingFrequency.QUARTERLY:
      return 90;
    case RentalBillingFrequency.SEMIANNUAL:
      return 180;
    case RentalBillingFrequency.ANNUAL:
      return 365;
    default:
      return 30;
  }
}

/**
 * Calculate the end date of a billing period based on frequency and start date
 * Uses calendar months for accurate period calculation
 */
function calculatePeriodEnd(startDate: Date, frequency: RentalBillingFrequency): Date {
  const endDate = new Date(startDate);

  switch (frequency) {
    case RentalBillingFrequency.MONTHLY:
      // Move to the same day next month, then subtract 1 day to get last day of current month
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0); // This sets to last day of previous month
      break;
    case RentalBillingFrequency.QUARTERLY:
      endDate.setMonth(endDate.getMonth() + 3);
      endDate.setDate(0); // Last day of the quarter
      break;
    case RentalBillingFrequency.SEMIANNUAL:
      endDate.setMonth(endDate.getMonth() + 6);
      endDate.setDate(0); // Last day of the 6-month period
      break;
    case RentalBillingFrequency.ANNUAL:
      // For annual, go to next year, then get last day of previous month (which is Dec of current year)
      endDate.setFullYear(endDate.getFullYear() + 1);
      endDate.setDate(0); // This sets to last day of previous month (December of current year)
      break;
    default:
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
  }

  return endDate;
}

/**
 * Generate installments for a lease
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @param actorUserId - User generating installments (for audit)
 * @returns Array of created installments
 */
export async function generateInstallments(tenantId: string, leaseId: string, actorUserId: string): Promise<any[]> {
  // Get lease with validation
  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    }
  });

  if (!lease) {
    throw new Error('Bail non trouvé ou accès refusé');
  }

  if (lease.status === RentalLeaseStatus.CANCELED || lease.status === RentalLeaseStatus.ENDED) {
    throw new Error('Impossible de générer des échéances pour un bail annulé ou terminé');
  }

  // Check if installments already exist
  const existingCount = await prisma.rentalInstallment.count({
    where: {
      tenant_id: tenantId,
      lease_id: leaseId
    }
  });

  if (existingCount > 0) {
    throw new Error("Des échéances existent déjà pour ce bail. Supprimez-les d'abord si vous souhaitez les régénérer.");
  }

  const startDate = new Date(lease.start_date);
  const endDate = lease.end_date ? new Date(lease.end_date) : null;

  // If no end date, generate installments for 12 months (default)
  const effectiveEndDate = endDate || new Date(startDate);
  if (!endDate) {
    effectiveEndDate.setFullYear(effectiveEndDate.getFullYear() + 1);
  }

  const billingFrequency = lease.billing_frequency;
  const billingPeriodDays = getBillingPeriodDays(billingFrequency);

  // Calculate number of periods
  const totalDays = Math.floor((effectiveEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const numberOfPeriods = Math.ceil(totalDays / billingPeriodDays);

  if (numberOfPeriods <= 0) {
    throw new Error('La durée du bail est invalide');
  }

  // Generate installments using calendar months
  const installments = [];
  let currentPeriodStart = new Date(startDate);
  currentPeriodStart.setHours(0, 0, 0, 0); // Normalize to start of day

  while (currentPeriodStart <= effectiveEndDate) {
    // Calculate period end based on billing frequency (using calendar months)
    const periodEnd = calculatePeriodEnd(currentPeriodStart, billingFrequency);

    // Don't exceed lease end date
    if (endDate && periodEnd > effectiveEndDate) {
      periodEnd.setTime(effectiveEndDate.getTime());
    }

    // Skip if period start is after end date
    if (currentPeriodStart > effectiveEndDate) {
      break;
    }

    // Extract period year and month from the period start date
    // This represents which month/year the installment covers (the billing period)
    const periodYear = currentPeriodStart.getFullYear();
    const periodMonth = currentPeriodStart.getMonth() + 1; // JavaScript months are 0-indexed

    // Délègue le calcul de l'échéance (montants, date d'échéance) à la fonction
    // pure partagée avec la campagne de facturation (lot 1). L'avancement de
    // currentPeriodStart ci-dessus garantit que periodYear/periodMonth tombe
    // toujours dans le cycle de facturation du bail : le cas « non inclus » ne
    // devrait jamais se produire ici, mais on le traite comme une période à
    // ignorer plutôt que de dupliquer le calcul.
    const built = buildInstallmentForPeriod(lease, periodYear, periodMonth);

    if (!built.included) {
      currentPeriodStart = new Date(periodEnd);
      currentPeriodStart.setDate(currentPeriodStart.getDate() + 1);
      continue;
    }

    // Check for duplicate (should not happen, but safety check)
    const existing = await prisma.rentalInstallment.findUnique({
      where: {
        lease_id_period_year_period_month: {
          lease_id: leaseId,
          period_year: periodYear,
          period_month: periodMonth
        }
      }
    });

    if (existing) {
      logger.warn('Duplicate installment skipped', {
        leaseId,
        periodYear,
        periodMonth
      });
      // Move to next period
      currentPeriodStart = new Date(periodEnd);
      currentPeriodStart.setDate(currentPeriodStart.getDate() + 1);
      continue;
    }

    // Create installment
    const installment = await prisma.rentalInstallment.create({
      data: built.data
    });

    installments.push(installment);

    // Move to next period: start of next month/quarter/etc.
    currentPeriodStart = new Date(periodEnd);
    currentPeriodStart.setDate(currentPeriodStart.getDate() + 1);
    currentPeriodStart.setHours(0, 0, 0, 0);
  }

  logger.info('Installments generated', {
    tenantId,
    leaseId,
    count: installments.length,
    actorUserId
  });

  return installments;
}

/**
 * List installments with filters
 * @param tenantId - Tenant ID
 * @param filters - Filter options
 * @param pagination - Pagination options
 * @returns List of installments with pagination
 */
export async function listInstallments(
  tenantId: string,
  filters?: {
    leaseId?: string;
    /**
     * Locataire principal. Filtre a travers le bail : une echeance n'a pas de
     * locataire en propre, elle en herite de son contrat. Permet de voir en un
     * ecran ce qu'un meme locataire doit sur l'ensemble de ses baux.
     */
    renterClientId?: string;
    status?: RentalInstallmentStatus;
    year?: number;
    month?: number;
    overdue?: boolean;
  },
  pagination?: {
    page?: number;
    limit?: number;
  }
) {
  const where: any = {
    tenant_id: tenantId
  };

  if (filters?.leaseId) {
    where.lease_id = filters.leaseId;
  }

  if (filters?.renterClientId) {
    where.lease = { primary_renter_client_id: filters.renterClientId };
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.year) {
    where.period_year = filters.year;
  }

  if (filters?.month) {
    where.period_month = filters.month;
  }

  if (filters?.overdue) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    where.due_date = {
      lt: today
    };
    where.status = {
      in: [RentalInstallmentStatus.DUE, RentalInstallmentStatus.OVERDUE]
    };
  }

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 50;
  const skip = (page - 1) * limit;

  const [installments, total] = await Promise.all([
    prisma.rentalInstallment.findMany({
      where,
      include: {
        lease: {
          select: {
            id: true,
            lease_number: true,
            property: {
              select: {
                id: true,
                internalReference: true,
                // Le titre d'abord : c'est lui que l'ecran Baux affiche, et une
                // reference interne ne dit rien a personne.
                title: true,
                address: true
              }
            },
            // Sans lui, la liste globale ne dit pas de qui vient l'echeance :
            // on voit une periode et un montant, jamais un nom.
            primaryRenter: {
              select: {
                id: true,
                user: { select: { fullName: true, email: true } }
              }
            }
          }
        }
      },
      orderBy: [{ due_date: 'asc' }, { period_year: 'asc' }, { period_month: 'asc' }],
      skip,
      take: limit
    }),
    prisma.rentalInstallment.count({ where })
  ]);

  return {
    data: installments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get installment by ID
 * @param tenantId - Tenant ID
 * @param installmentId - Installment ID
 * @returns Installment or null
 */
export async function getInstallmentById(tenantId: string, installmentId: string): Promise<any | null> {
  const installment = await prisma.rentalInstallment.findFirst({
    where: {
      id: installmentId,
      tenant_id: tenantId
    },
    include: {
      lease: {
        select: {
          id: true,
          lease_number: true,
          property: {
            select: {
              id: true,
              internalReference: true,
              address: true
            }
          }
        }
      },
      items: true,
      payments: {
        include: {
          payment: {
            select: {
              id: true,
              amount: true,
              method: true,
              status: true,
              currency: true,
              initiated_at: true,
              succeeded_at: true
            }
          }
        }
      },
      penalties: true
    }
  });

  return installment;
}

/**
 * Update status of a single installment based on payment and due date
 * @param tenantId - Tenant ID
 * @param installmentId - Installment ID
 * @returns Updated installment or null if not found
 */
export async function updateInstallmentStatus(tenantId: string, installmentId: string): Promise<any | null> {
  const installment = await prisma.rentalInstallment.findFirst({
    where: {
      id: installmentId,
      tenant_id: tenantId,
      status: {
        not: RentalInstallmentStatus.CANCELED
      }
    }
  });

  if (!installment) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(installment.due_date);
  dueDate.setHours(0, 0, 0, 0);

  const totalDue =
    Number(installment.amount_rent) +
    Number(installment.amount_service) +
    Number(installment.amount_other_fees) +
    Number(installment.penalty_amount);
  const amountPaid = Number(installment.amount_paid);

  let newStatus: RentalInstallmentStatus = installment.status;

  // Calculate new status based on payment and due date
  if (amountPaid >= totalDue && totalDue > 0) {
    newStatus = RentalInstallmentStatus.PAID;
  } else if (amountPaid > 0 && amountPaid < totalDue) {
    newStatus = RentalInstallmentStatus.PARTIAL;
  } else if (dueDate < today) {
    // Overdue if past due date and not paid
    newStatus = RentalInstallmentStatus.OVERDUE;
  } else if (dueDate >= today) {
    // Due if on or before due date
    newStatus = RentalInstallmentStatus.DUE;
  } else {
    // Default to DRAFT if none of the above
    newStatus = RentalInstallmentStatus.DRAFT;
  }

  // Update if status changed
  if (newStatus !== installment.status) {
    // L'échéance exigible et le mouvement qui la porte au compte du locataire
    // naissent ensemble : sans cette transaction, un incident entre les deux
    // écritures laisserait une créance exigible qu'aucun relevé ne montre.
    const updatedInstallment = await prisma.$transaction(async tx => {
      const updated = await tx.rentalInstallment.update({
        where: { id: installment.id },
        data: { status: newStatus }
      });

      await inscrireEcheanceFactureeTx(tx, tenantId, updated);

      return updated;
    });

    logger.info('Installment status updated', {
      tenantId,
      installmentId,
      oldStatus: installment.status,
      newStatus
    });

    return updatedInstallment;
  }

  return installment;
}

/**
 * Recalculate installment statuses for a lease
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @returns Number of updated installments
 */
export async function recalculateInstallmentStatuses(tenantId: string, leaseId: string): Promise<number> {
  // Verify lease exists and belongs to tenant
  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    }
  });

  if (!lease) {
    throw new Error('Bail non trouvé ou accès refusé');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all installments for the lease
  const installments = await prisma.rentalInstallment.findMany({
    where: {
      tenant_id: tenantId,
      lease_id: leaseId,
      status: {
        not: RentalInstallmentStatus.CANCELED
      }
    }
  });

  let updatedCount = 0;

  for (const installment of installments) {
    const dueDate = new Date(installment.due_date);
    dueDate.setHours(0, 0, 0, 0);

    const totalDue =
      Number(installment.amount_rent) +
      Number(installment.amount_service) +
      Number(installment.amount_other_fees) +
      Number(installment.penalty_amount);
    const amountPaid = Number(installment.amount_paid);

    let newStatus: RentalInstallmentStatus = installment.status;

    // Calculate new status based on payment and due date
    if (amountPaid >= totalDue && totalDue > 0) {
      newStatus = RentalInstallmentStatus.PAID;
    } else if (amountPaid > 0 && amountPaid < totalDue) {
      newStatus = RentalInstallmentStatus.PARTIAL;
    } else if (dueDate < today) {
      // Overdue if past due date and not paid
      newStatus = RentalInstallmentStatus.OVERDUE;
    } else if (dueDate >= today) {
      // Due if on or before due date
      newStatus = RentalInstallmentStatus.DUE;
    } else {
      // Default to DRAFT if none of the above
      newStatus = RentalInstallmentStatus.DRAFT;
    }

    // Update if status changed
    if (newStatus !== installment.status) {
      // Une transaction par échéance, et non une pour le bail entier : le
      // recalcul reste, comme avant, un enchaînement d'échéances indépendantes
      // dont l'échec de l'une ne défait pas les précédentes. Ce qui est
      // indivisible, c'est le couple (statut, mouvement) d'une même échéance.
      await prisma.$transaction(async tx => {
        const updated = await tx.rentalInstallment.update({
          where: { id: installment.id },
          data: { status: newStatus }
        });

        await inscrireEcheanceFactureeTx(tx, tenantId, updated);
      });
      updatedCount++;
    }
  }

  logger.info('Installment statuses recalculated', {
    tenantId,
    leaseId,
    updatedCount
  });

  return updatedCount;
}

/**
 * Delete all installments for a lease
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @param actorUserId - User deleting installments (for audit)
 * @returns Number of deleted installments
 */
export async function deleteAllInstallments(tenantId: string, leaseId: string, actorUserId: string): Promise<number> {
  // Verify lease exists and belongs to tenant
  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    }
  });

  if (!lease) {
    throw new Error('Bail non trouvé ou accès refusé');
  }

  // Check if lease is in a state that allows deletion
  if (lease.status === RentalLeaseStatus.ENDED && lease.end_date) {
    const endDate = new Date(lease.end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Allow deletion if lease ended more than 30 days ago
    const daysSinceEnd = Math.floor((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceEnd < 30) {
      throw new Error(
        "Impossible de supprimer les échéances d'un bail récemment terminé. Attendez 30 jours après la fin du bail."
      );
    }
  }

  // Count installments before deletion
  const count = await prisma.rentalInstallment.count({
    where: {
      tenant_id: tenantId,
      lease_id: leaseId
    }
  });

  if (count === 0) {
    return 0;
  }

  // Check if any installments have payments allocated
  const installmentsWithPayments = await prisma.rentalInstallment.findFirst({
    where: {
      tenant_id: tenantId,
      lease_id: leaseId,
      payments: {
        some: {}
      }
    }
  });

  if (installmentsWithPayments) {
    throw new Error(
      "Impossible de supprimer les échéances : certaines échéances ont des paiements alloués. Supprimez d'abord les paiements."
    );
  }

  // Delete all installments (cascade will handle related items)
  //
  // La suppression et les mouvements qui la contrepassent sont indivisibles :
  // une échéance disparue dont le débit resterait au compte laisserait le
  // locataire débiteur d'un loyer qui n'existe plus. Les pénalités partent
  // avec leurs échéances (cascade en base) : leurs mouvements aussi.
  await prisma.$transaction(async tx => {
    const supprimees = await tx.rentalInstallment.findMany({
      where: { tenant_id: tenantId, lease_id: leaseId },
      select: {
        id: true,
        period_year: true,
        period_month: true,
        penalties: { select: { id: true } }
      }
    });

    await tx.rentalInstallment.deleteMany({
      where: {
        tenant_id: tenantId,
        lease_id: leaseId
      }
    });

    const compte = await compteLocataireDuBailTx(tx, tenantId, leaseId);
    if (!compte) {
      return;
    }

    const maintenant = new Date();

    for (const echeance of supprimees) {
      const periode = libellePeriodeEcheance(echeance.period_year, echeance.period_month);

      await annulerPieceTx(tx, {
        tenantId,
        accountId: compte.accountId,
        sourceType: 'RENTAL_INSTALLMENT',
        sourceId: echeance.id,
        label: periode ? `Annulation du loyer ${periode}` : 'Annulation du loyer',
        leaseId,
        movementDate: maintenant
      });

      for (const penalite of echeance.penalties) {
        await remettrePenaliteTx(tx, {
          tenantId,
          accountId: compte.accountId,
          penaltyId: penalite.id,
          montantRestant: 0,
          label: periode
            ? `Annulation de la pénalité de retard sur l'échéance ${periode}`
            : 'Annulation de la pénalité de retard',
          leaseId,
          movementDate: maintenant
        });
      }
    }
  });

  logger.info('All installments deleted', {
    tenantId,
    leaseId,
    count,
    actorUserId
  });

  return count;
}
