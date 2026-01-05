import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { RentalDepositMovementType } from '@prisma/client';

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
    throw new Error('Lease not found');
  }

  // Check if deposit already exists
  const existingDeposit = await prisma.rentalSecurityDeposit.findUnique({
    where: {
      lease_id: leaseId
    }
  });

  if (existingDeposit) {
    throw new Error('Security deposit already exists for this lease');
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
 * @returns Deposit or null
 */
export async function getDeposit(tenantId: string, leaseId: string) {
  // Verify lease exists and belongs to tenant
  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    }
  });

  if (!lease) {
    throw new Error('Lease not found');
  }

  const deposit = await prisma.rentalSecurityDeposit.findUnique({
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
  actorUserId?: string
) {
  // Get deposit with tenant isolation
  const deposit = await prisma.rentalSecurityDeposit.findFirst({
    where: {
      id: depositId,
      tenant_id: tenantId
    }
  });

  if (!deposit) {
    throw new Error('Security deposit not found');
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
      throw new Error('Security deposit can only be collected once (single payment requirement)');
    }

    if (Number(amount) !== Number(deposit.target_amount)) {
      throw new Error(`Collection amount (${amount}) must equal target amount (${deposit.target_amount})`);
    }

    if (!paymentId) {
      throw new Error('Payment ID is required for deposit collection');
    }
  }

  // Validate amount
  if (amount <= 0) {
    throw new Error('Movement amount must be positive');
  }

  // Validate movement types that reduce balance
  if (type === RentalDepositMovementType.REFUND || type === RentalDepositMovementType.FORFEIT) {
    const availableAmount =
      Number(deposit.collected_amount) - Number(deposit.refunded_amount) - Number(deposit.forfeited_amount);
    if (amount > availableAmount) {
      throw new Error(`Insufficient deposit balance. Available: ${availableAmount}, Requested: ${amount}`);
    }
  }

  // Create movement
  const movement = await prisma.rentalDepositMovement.create({
    data: {
      tenant_id: tenantId,
      deposit_id: depositId,
      type: type,
      currency: deposit.currency,
      amount: amount,
      payment_id: paymentId || null,
      installment_id: installmentId || null,
      note: note || null,
      created_by_user_id: actorUserId || null
    }
  });

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

  await prisma.rentalSecurityDeposit.update({
    where: {
      id: depositId
    },
    data: updateData
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

  return movement;
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
    throw new Error('Security deposit not found');
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




