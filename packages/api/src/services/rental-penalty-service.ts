import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { RentalPenaltyMode } from '@prisma/client';
import { updateInstallmentStatus } from './rental-installment-service';

/**
 * Get default penalty rule for tenant (or create default if none exists)
 * @param tenantId - Tenant ID
 * @returns Penalty rule
 */
export async function getDefaultPenaltyRule(tenantId: string) {
  let rule = await prisma.rentalPenaltyRule.findFirst({
    where: {
      tenant_id: tenantId,
      is_active: true
    },
    orderBy: {
      created_at: 'desc'
    }
  });

  // Create default rule if none exists
  if (!rule) {
    rule = await prisma.rentalPenaltyRule.create({
      data: {
        tenant_id: tenantId,
        is_active: true,
        grace_days: 0,
        mode: RentalPenaltyMode.PERCENT_OF_BALANCE,
        fixed_amount: 0,
        rate: 0.02, // 2% default
        cap_amount: null,
        min_balance_to_apply: null
      }
    });
  }

  return rule;
}

/**
 * Calculate penalty for an installment
 * @param tenantId - Tenant ID
 * @param installmentId - Installment ID
 * @param rule - Penalty rule to use (optional, will fetch default if not provided)
 * @param actorUserId - User triggering calculation (optional)
 * @returns Calculated penalty
 */
export async function calculatePenalty(tenantId: string, installmentId: string, rule?: any, actorUserId?: string) {
  // Get installment with tenant isolation
  const installment = await prisma.rentalInstallment.findFirst({
    where: {
      id: installmentId,
      tenant_id: tenantId
    },
    include: {
      lease: true
    }
  });

  if (!installment) {
    throw new Error('Installment not found');
  }

  // Get penalty rule (use provided or fetch default)
  const penaltyRule = rule || (await getDefaultPenaltyRule(tenantId));

  // Use lease penalty settings if available, otherwise use tenant rule
  const graceDays = installment.lease.penalty_grace_days ?? penaltyRule.grace_days;
  const mode = installment.lease.penalty_mode ?? penaltyRule.mode;
  const rate = Number(installment.lease.penalty_rate) || Number(penaltyRule.rate);
  const fixedAmount = Number(installment.lease.penalty_fixed_amount) || Number(penaltyRule.fixed_amount);
  const capAmount = installment.lease.penalty_cap_amount
    ? Number(installment.lease.penalty_cap_amount)
    : penaltyRule.cap_amount
      ? Number(penaltyRule.cap_amount)
      : null;

  // Check if installment is overdue (considering grace days)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(installment.due_date);
  dueDate.setHours(0, 0, 0, 0);
  const graceDate = new Date(dueDate);
  graceDate.setDate(graceDate.getDate() + graceDays);

  if (today <= graceDate) {
    throw new Error('Installment is not yet overdue (within grace period)');
  }

  // Calculate days late
  const daysLate = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

  // Calculate penalty amount based on mode
  let penaltyAmount = 0;

  if (mode === RentalPenaltyMode.FIXED_AMOUNT) {
    penaltyAmount = fixedAmount;
  } else if (mode === RentalPenaltyMode.PERCENT_OF_RENT) {
    const rentAmount = Number(installment.amount_rent);
    penaltyAmount = rentAmount * rate;
  } else if (mode === RentalPenaltyMode.PERCENT_OF_BALANCE) {
    const totalDue =
      Number(installment.amount_rent) + Number(installment.amount_service) + Number(installment.amount_other_fees);
    const paid = Number(installment.amount_paid);
    const balance = totalDue - paid;
    penaltyAmount = balance * rate;
  }

  // Apply cap if set
  if (capAmount && penaltyAmount > capAmount) {
    penaltyAmount = capAmount;
  }

  // Check minimum balance threshold if set
  if (penaltyRule.min_balance_to_apply) {
    const totalDue =
      Number(installment.amount_rent) + Number(installment.amount_service) + Number(installment.amount_other_fees);
    const paid = Number(installment.amount_paid);
    const balance = totalDue - paid;
    if (balance < Number(penaltyRule.min_balance_to_apply)) {
      penaltyAmount = 0; // No penalty if balance below threshold
    }
  }

  // Get or create penalty record
  const existingPenalty = await prisma.rentalPenalty.findFirst({
    where: {
      installment_id: installmentId,
      tenant_id: tenantId
    },
    orderBy: {
      calculated_at: 'desc'
    }
  });

  let penalty;
  if (existingPenalty && !existingPenalty.is_manual_override) {
    // Update existing penalty
    penalty = await prisma.rentalPenalty.update({
      where: {
        id: existingPenalty.id
      },
      data: {
        calculated_at: new Date(),
        days_late: daysLate,
        mode: mode,
        rate: mode !== RentalPenaltyMode.FIXED_AMOUNT ? rate : null,
        fixed_amount: mode === RentalPenaltyMode.FIXED_AMOUNT ? fixedAmount : null,
        amount: penaltyAmount
      }
    });
  } else {
    // Create new penalty
    penalty = await prisma.rentalPenalty.create({
      data: {
        tenant_id: tenantId,
        installment_id: installmentId,
        calculated_at: new Date(),
        days_late: daysLate,
        mode: mode,
        rate: mode !== RentalPenaltyMode.FIXED_AMOUNT ? rate : null,
        fixed_amount: mode === RentalPenaltyMode.FIXED_AMOUNT ? fixedAmount : null,
        amount: penaltyAmount,
        currency: installment.currency,
        is_manual_override: false,
        created_by_user_id: actorUserId || null
      }
    });
  }

  // Update installment penalty amount
  await prisma.rentalInstallment.update({
    where: {
      id: installmentId
    },
    data: {
      penalty_amount: penaltyAmount
    }
  });

  // Update installment status
  await updateInstallmentStatus(tenantId, installmentId);

  logger.info('Penalty calculated', {
    penaltyId: penalty.id,
    installmentId,
    tenantId,
    amount: penaltyAmount,
    daysLate
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'RENTAL_PENALTY_CALCULATED',
      entityType: 'RENTAL_PENALTY',
      entityId: penalty.id,
      payload: {
        installmentId,
        amount: penaltyAmount,
        daysLate,
        mode
      }
    });
  }

  return penalty;
}

/**
 * Calculate penalties for all overdue installments
 * @param tenantId - Tenant ID (optional, if not provided calculates for all tenants)
 * @param actorUserId - User triggering calculation (optional)
 * @returns Calculation results
 */
export async function calculatePenaltiesForOverdueInstallments(tenantId?: string, actorUserId?: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find all overdue installments
  const where: any = {
    status: {
      in: ['DUE', 'PARTIAL', 'OVERDUE']
    }
  };

  if (tenantId) {
    where.tenant_id = tenantId;
  }

  const installments = await prisma.rentalInstallment.findMany({
    where,
    include: {
      lease: true
    }
  });

  const results = {
    processed: 0,
    errors: [] as string[],
    penalties: [] as any[]
  };

  for (const installment of installments) {
    try {
      const dueDate = new Date(installment.due_date);
      dueDate.setHours(0, 0, 0, 0);
      const graceDays = installment.lease.penalty_grace_days ?? 0;
      const graceDate = new Date(dueDate);
      graceDate.setDate(graceDate.getDate() + graceDays);

      // Only calculate if overdue (past grace period)
      if (today > graceDate) {
        const penalty = await calculatePenalty(installment.tenant_id, installment.id, undefined, actorUserId);
        results.penalties.push(penalty);
        results.processed++;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      results.errors.push(`Installment ${installment.id}: ${errorMsg}`);
      logger.error('Error calculating penalty for installment', {
        installmentId: installment.id,
        error: errorMsg
      });
    }
  }

  logger.info('Penalty calculation job completed', {
    tenantId: tenantId || 'all',
    processed: results.processed,
    errors: results.errors.length
  });

  return results;
}

/**
 * Update penalty manually (override)
 * @param tenantId - Tenant ID
 * @param penaltyId - Penalty ID
 * @param amount - New penalty amount
 * @param reason - Override reason
 * @param actorUserId - User updating the penalty
 * @returns Updated penalty
 */
export async function updatePenalty(
  tenantId: string,
  penaltyId: string,
  amount: number,
  reason: string,
  actorUserId: string
) {
  const penalty = await prisma.rentalPenalty.findFirst({
    where: {
      id: penaltyId,
      tenant_id: tenantId
    },
    include: {
      installment: true
    }
  });

  if (!penalty) {
    throw new Error('Penalty not found');
  }

  // Update penalty
  const updatedPenalty = await prisma.rentalPenalty.update({
    where: {
      id: penaltyId
    },
    data: {
      amount: amount,
      is_manual_override: true,
      override_reason: reason,
      created_by_user_id: actorUserId
    }
  });

  // Update installment penalty amount
  await prisma.rentalInstallment.update({
    where: {
      id: penalty.installment_id
    },
    data: {
      penalty_amount: amount
    }
  });

  // Update installment status
  await updateInstallmentStatus(tenantId, penalty.installment_id);

  logger.info('Penalty manually updated', {
    penaltyId,
    tenantId,
    amount
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_PENALTY_UPDATED',
    entityType: 'RENTAL_PENALTY',
    entityId: penaltyId,
    payload: {
      oldAmount: Number(penalty.amount),
      newAmount: amount,
      reason
    }
  });

  return updatedPenalty;
}

/**
 * Get penalty by ID
 * @param tenantId - Tenant ID
 * @param penaltyId - Penalty ID
 * @returns Penalty or null
 */
export async function getPenaltyById(tenantId: string, penaltyId: string) {
  const penalty = await prisma.rentalPenalty.findFirst({
    where: {
      id: penaltyId,
      tenant_id: tenantId
    },
    include: {
      installment: {
        include: {
          lease: {
            select: {
              id: true,
              lease_number: true
            }
          }
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
  });

  return penalty;
}

/**
 * List penalties with filters
 * @param tenantId - Tenant ID
 * @param filters - Optional filters
 * @returns List of penalties
 */
export async function listPenalties(
  tenantId: string,
  filters?: {
    leaseId?: string;
    installmentId?: string;
  }
) {
  const where: any = {
    tenant_id: tenantId
  };

  if (filters?.leaseId) {
    where.installment = {
      lease_id: filters.leaseId
    };
  }

  if (filters?.installmentId) {
    where.installment_id = filters.installmentId;
  }

  const penalties = await prisma.rentalPenalty.findMany({
    where,
    include: {
      installment: {
        include: {
          lease: {
            select: {
              id: true,
              lease_number: true
            }
          }
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
      calculated_at: 'desc'
    }
  });

  return penalties;
}
