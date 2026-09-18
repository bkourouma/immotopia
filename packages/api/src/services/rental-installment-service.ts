import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { RentalBillingFrequency, RentalInstallmentStatus, RentalLeaseStatus } from '@prisma/client';

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
 * Calculate due date for a period
 * @param periodStartDate - Start date of the billing period
 * @param dueDayOfMonth - Day of month when payment is due
 * @returns Due date for the installment
 */
function calculateDueDate(periodStartDate: Date, dueDayOfMonth: number): Date {
  // Due date should be in the same month as the period start
  const dueDate = new Date(periodStartDate);
  dueDate.setDate(dueDayOfMonth);

  // Handle edge case where the day doesn't exist in the target month (e.g., Feb 31)
  // In that case, setDate will automatically adjust to the last day of the month
  // We want to ensure we use the dueDayOfMonth if it exists, otherwise use last day
  const targetMonth = dueDate.getMonth();
  const targetYear = dueDate.getFullYear();
  const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

  // If the requested day doesn't exist in the month, use the last day
  if (dueDayOfMonth > lastDayOfMonth) {
    dueDate.setDate(lastDayOfMonth);
  } else {
    dueDate.setDate(dueDayOfMonth);
  }

  return dueDate;
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
  const dueDayOfMonth = lease.due_day_of_month || 5;

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

    const dueDate = calculateDueDate(currentPeriodStart, dueDayOfMonth);

    // Extract period year and month from the period start date
    // This represents which month/year the installment covers (the billing period)
    const periodYear = currentPeriodStart.getFullYear();
    const periodMonth = currentPeriodStart.getMonth() + 1; // JavaScript months are 0-indexed

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
      data: {
        tenant_id: tenantId,
        lease_id: leaseId,
        period_year: periodYear,
        period_month: periodMonth,
        due_date: dueDate,
        status: RentalInstallmentStatus.DRAFT,
        currency: lease.currency || 'FCFA',
        amount_rent: lease.rent_amount,
        amount_service: lease.service_charge_amount || 0,
        amount_other_fees: 0,
        penalty_amount: 0,
        amount_paid: 0
      }
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
    const updatedInstallment = await prisma.rentalInstallment.update({
      where: { id: installment.id },
      data: { status: newStatus }
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
      await prisma.rentalInstallment.update({
        where: { id: installment.id },
        data: { status: newStatus }
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
  await prisma.rentalInstallment.deleteMany({
    where: {
      tenant_id: tenantId,
      lease_id: leaseId
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
