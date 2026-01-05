import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { CreateLeaseRequest, UpdateLeaseRequest, LeaseDetail } from '../types/rental-types';
import { RentalLeaseStatus } from '@prisma/client';

/**
 * Create a new rental lease
 * @param tenantId - Tenant ID (required for isolation)
 * @param data - Lease creation data
 * @param actorUserId - User creating the lease (for audit)
 * @returns Created lease
 */
export async function createLease(
  tenantId: string,
  data: CreateLeaseRequest,
  actorUserId: string
): Promise<LeaseDetail> {
  // Validate required fields
  if (!data.leaseNumber || !data.propertyId || !data.startDate) {
    throw new Error('Lease number, property ID, and start date are required');
  }

  if (!data.primaryRenterClientId && !data.primaryRenterContactId) {
    throw new Error('Either primaryRenterClientId or primaryRenterContactId is required');
  }

  // Check for duplicate lease number within tenant
  const existingLease = await prisma.rentalLease.findFirst({
    where: {
      tenant_id: tenantId,
      lease_number: data.leaseNumber
    }
  });

  if (existingLease) {
    throw new Error(`A lease with number ${data.leaseNumber} already exists in this tenant`);
  }

  // Validate dates
  if (data.endDate && data.endDate <= data.startDate) {
    throw new Error('End date must be after start date');
  }

  // Validate due day of month (1-31)
  if (data.dueDayOfMonth < 1 || data.dueDayOfMonth > 31) {
    throw new Error('Due day of month must be between 1 and 31');
  }

  // Validate property exists and belongs to tenant
  const property = await prisma.property.findFirst({
    where: {
      id: data.propertyId,
      tenantId: tenantId
    }
  });

  if (!property) {
    throw new Error(`Property not found or does not belong to this tenant`);
  }

  // Get or create primary renter client
  let primaryRenterClientId: string;
  
  if (data.primaryRenterClientId) {
    // Validate existing client
    const primaryRenter = await prisma.tenantClient.findFirst({
      where: {
        id: data.primaryRenterClientId,
        tenantId: tenantId
      }
    });

    if (!primaryRenter) {
      throw new Error(`Primary renter client not found or does not belong to this tenant`);
    }
    
    primaryRenterClientId = data.primaryRenterClientId;
  } else if (data.primaryRenterContactId) {
    // Auto-create client from contact
    const { getOrCreateTenantClientFromContact } = await import('./tenant-service');
    const tenantClient = await getOrCreateTenantClientFromContact(
      tenantId,
      data.primaryRenterContactId,
      'RENTER'
    );
    primaryRenterClientId = tenantClient.id;
  } else {
    throw new Error('Either primaryRenterClientId or primaryRenterContactId is required');
  }

  // Get or create owner client (if provided)
  let ownerClientId: string | null = null;
  
  if (data.ownerClientId) {
    // Validate existing client
    const ownerClient = await prisma.tenantClient.findFirst({
      where: {
        id: data.ownerClientId,
        tenantId: tenantId
      }
    });

    if (!ownerClient) {
      throw new Error(`Owner client not found or does not belong to this tenant`);
    }
    
    ownerClientId = data.ownerClientId;
  } else if (data.ownerContactId) {
    // Auto-create client from contact
    const { getOrCreateTenantClientFromContact } = await import('./tenant-service');
    const tenantClient = await getOrCreateTenantClientFromContact(
      tenantId,
      data.ownerContactId,
      'OWNER'
    );
    ownerClientId = tenantClient.id;
  }

  // Create lease
  const lease = await prisma.rentalLease.create({
    data: {
      tenant_id: tenantId,
      property_id: data.propertyId,
      primary_renter_client_id: primaryRenterClientId,
      owner_client_id: ownerClientId,
      crm_deal_id: data.crmDealId || null,
      lease_number: data.leaseNumber,
      status: RentalLeaseStatus.DRAFT,
      start_date: data.startDate,
      end_date: data.endDate || null,
      move_in_date: data.moveInDate || null,
      move_out_date: data.moveOutDate || null,
      billing_frequency: data.billingFrequency,
      due_day_of_month: data.dueDayOfMonth,
      currency: data.currency || 'FCFA',
      rent_amount: data.rentAmount,
      service_charge_amount: data.serviceChargeAmount || 0,
      security_deposit_amount: data.securityDepositAmount || 0,
      penalty_grace_days: data.penaltyGraceDays || 0,
      penalty_mode: data.penaltyMode || 'PERCENT_OF_BALANCE',
      penalty_rate: data.penaltyRate || 0,
      penalty_fixed_amount: data.penaltyFixedAmount || 0,
      penalty_cap_amount: data.penaltyCapAmount || null,
      notes: data.notes || null,
      terms_json: data.termsJson || null,
      created_by_user_id: actorUserId
    },
    include: {
      property: {
        select: {
          id: true,
          internalReference: true,
          address: true
        }
      },
      primaryRenter: {
        select: {
          id: true,
          userId: true,
          clientType: true
        }
      },
      coRenters: true,
      deposit: true,
      documents: true
    }
  });

  logger.info('Rental lease created', {
    leaseId: lease.id,
    tenantId,
    leaseNumber: lease.lease_number
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_LEASE_CREATED',
    entityType: 'RENTAL_LEASE',
    entityId: lease.id,
    payload: {
      leaseNumber: lease.lease_number,
      propertyId: data.propertyId
    }
  });

  return lease as LeaseDetail;
}

/**
 * Get lease by ID (with tenant isolation)
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @returns Lease detail or null if not found
 */
export async function getLeaseById(tenantId: string, leaseId: string): Promise<LeaseDetail | null> {
  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId // Tenant isolation
    },
    include: {
      property: {
        select: {
          id: true,
          internalReference: true,
          address: true
        }
      },
      primaryRenter: {
        select: {
          id: true,
          userId: true,
          clientType: true,
          details: true,
          user: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          }
        }
      },
      coRenters: {
        include: {
          renterClient: {
            select: {
              id: true,
              userId: true,
              clientType: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true
                }
              }
            }
          }
        }
      },
      installments: {
        orderBy: {
          due_date: 'asc'
        },
        take: 10 // Limit to recent installments
      },
      deposit: true,
      documents: {
        orderBy: {
          created_at: 'desc'
        },
        take: 10 // Limit to recent documents
      }
    }
  });

  if (lease && lease.primaryRenter) {
    // Extract crmContactId from details JSON if it exists
    const details = lease.primaryRenter.details as any;
    if (details && details.crmContactId) {
      (lease.primaryRenter as any).crmContactId = details.crmContactId;
    }
  }

  return lease as LeaseDetail | null;
}

/**
 * List leases with filters (tenant-scoped)
 * @param tenantId - Tenant ID
 * @param filters - Optional filters (status, propertyId, etc.)
 * @param pagination - Optional pagination (page, limit)
 * @returns List of leases with pagination metadata
 */
export async function listLeases(
  tenantId: string,
  filters?: {
    status?: RentalLeaseStatus;
    propertyId?: string;
    primaryRenterClientId?: string;
    search?: string;
  },
  pagination?: {
    page?: number;
    limit?: number;
  }
) {
  const where: any = {
    tenant_id: tenantId // Tenant isolation
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.propertyId) {
    where.property_id = filters.propertyId;
  }

  if (filters?.primaryRenterClientId) {
    where.primary_renter_client_id = filters.primaryRenterClientId;
  }

  if (filters?.search) {
    where.OR = [{ lease_number: { contains: filters.search, mode: 'insensitive' } }];
  }

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 50;
  const skip = (page - 1) * limit;

  const [leases, total] = await Promise.all([
    prisma.rentalLease.findMany({
      where,
      include: {
        property: {
          select: {
            id: true,
            internalReference: true,
            address: true
          }
        },
        primaryRenter: {
          select: {
            id: true,
            userId: true,
            clientType: true,
            user: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      skip,
      take: limit
    }),
    prisma.rentalLease.count({ where })
  ]);

  return {
    data: leases,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Update lease
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @param data - Update data
 * @param actorUserId - User updating the lease
 * @returns Updated lease
 */
export async function updateLease(
  tenantId: string,
  leaseId: string,
  data: UpdateLeaseRequest,
  actorUserId: string
): Promise<LeaseDetail> {
  // Verify lease exists and belongs to tenant
  const existingLease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    }
  });

  if (!existingLease) {
    throw new Error('Lease not found');
  }

  // Validate dates if provided
  if (data.endDate && existingLease.start_date && data.endDate <= existingLease.start_date) {
    throw new Error('End date must be after start date');
  }

  // Update lease
  const lease = await prisma.rentalLease.update({
    where: {
      id: leaseId
    },
    data: {
      end_date: data.endDate !== undefined ? data.endDate : undefined,
      move_in_date: data.moveInDate !== undefined ? data.moveInDate : undefined,
      move_out_date: data.moveOutDate !== undefined ? data.moveOutDate : undefined,
      rent_amount: data.rentAmount !== undefined ? data.rentAmount : undefined,
      service_charge_amount: data.serviceChargeAmount !== undefined ? data.serviceChargeAmount : undefined,
      security_deposit_amount: data.securityDepositAmount !== undefined ? data.securityDepositAmount : undefined,
      billing_frequency: data.billingFrequency !== undefined ? data.billingFrequency : undefined,
      notes: data.notes !== undefined ? data.notes : undefined
    },
    include: {
      property: {
        select: {
          id: true,
          internalReference: true,
          address: true
        }
      },
      primaryRenter: {
        select: {
          id: true,
          userId: true,
          clientType: true
        }
      },
      coRenters: true,
      deposit: true,
      documents: true
    }
  });

  logger.info('Rental lease updated', {
    leaseId: lease.id,
    tenantId
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_LEASE_UPDATED',
    entityType: 'RENTAL_LEASE',
    entityId: lease.id,
    payload: data
  });

  return lease as LeaseDetail;
}

/**
 * Update lease status with transition validation
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @param newStatus - New status
 * @param actorUserId - User updating the status
 * @returns Updated lease
 */
export async function updateLeaseStatus(
  tenantId: string,
  leaseId: string,
  newStatus: RentalLeaseStatus,
  actorUserId: string
): Promise<LeaseDetail> {
  // Get existing lease
  const existingLease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    }
  });

  if (!existingLease) {
    throw new Error('Lease not found');
  }

  // Validate status transition
  const validTransitions: Record<RentalLeaseStatus, RentalLeaseStatus[]> = {
    [RentalLeaseStatus.DRAFT]: [RentalLeaseStatus.ACTIVE, RentalLeaseStatus.CANCELED],
    [RentalLeaseStatus.ACTIVE]: [RentalLeaseStatus.SUSPENDED, RentalLeaseStatus.ENDED, RentalLeaseStatus.CANCELED],
    [RentalLeaseStatus.SUSPENDED]: [RentalLeaseStatus.ACTIVE, RentalLeaseStatus.ENDED, RentalLeaseStatus.CANCELED],
    [RentalLeaseStatus.ENDED]: [], // Cannot transition from ENDED
    [RentalLeaseStatus.CANCELED]: [] // Cannot transition from CANCELED
  };

  const allowedStatuses = validTransitions[existingLease.status];
  if (!allowedStatuses.includes(newStatus)) {
    throw new Error(`Invalid status transition from ${existingLease.status} to ${newStatus}`);
  }

  // Update status
  const lease = await prisma.rentalLease.update({
    where: {
      id: leaseId
    },
    data: {
      status: newStatus
    },
    include: {
      property: {
        select: {
          id: true,
          internalReference: true,
          address: true
        }
      },
      primaryRenter: {
        select: {
          id: true,
          userId: true,
          clientType: true
        }
      },
      coRenters: true,
      deposit: true,
      documents: true
    }
  });

  logger.info('Rental lease status updated', {
    leaseId: lease.id,
    tenantId,
    oldStatus: existingLease.status,
    newStatus
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_LEASE_STATUS_UPDATED',
    entityType: 'RENTAL_LEASE',
    entityId: lease.id,
    payload: {
      oldStatus: existingLease.status,
      newStatus
    }
  });

  return lease as LeaseDetail;
}

/**
 * Add co-renter to lease
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @param renterClientId - Co-renter client ID
 * @param actorUserId - User adding the co-renter
 * @returns Updated lease
 */
export async function addCoRenter(
  tenantId: string,
  leaseId: string,
  renterClientId: string,
  actorUserId: string
): Promise<LeaseDetail> {
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

  // Check if co-renter already exists
  const existingCoRenter = await prisma.rentalLeaseCoRenter.findFirst({
    where: {
      lease_id: leaseId,
      renter_client_id: renterClientId
    }
  });

  if (existingCoRenter) {
    throw new Error('Co-renter already added to this lease');
  }

  // Add co-renter
  await prisma.rentalLeaseCoRenter.create({
    data: {
      tenant_id: tenantId,
      lease_id: leaseId,
      renter_client_id: renterClientId
    }
  });

  logger.info('Co-renter added to lease', {
    leaseId,
    tenantId,
    renterClientId
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_LEASE_CO_RENTER_ADDED',
    entityType: 'RENTAL_LEASE',
    entityId: leaseId,
    payload: {
      renterClientId
    }
  });

  // Return updated lease
  return getLeaseById(tenantId, leaseId) as Promise<LeaseDetail>;
}

/**
 * Remove co-renter from lease
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @param renterClientId - Co-renter client ID to remove
 * @param actorUserId - User removing the co-renter
 */
export async function removeCoRenter(
  tenantId: string,
  leaseId: string,
  renterClientId: string,
  actorUserId: string
): Promise<void> {
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

  // Remove co-renter
  await prisma.rentalLeaseCoRenter.deleteMany({
    where: {
      lease_id: leaseId,
      renter_client_id: renterClientId,
      tenant_id: tenantId
    }
  });

  logger.info('Co-renter removed from lease', {
    leaseId,
    tenantId,
    renterClientId
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_LEASE_CO_RENTER_REMOVED',
    entityType: 'RENTAL_LEASE',
    entityId: leaseId,
    payload: {
      renterClientId
    }
  });
}

/**
 * List co-renters for a lease
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @returns List of co-renters
 */
export async function listCoRenters(tenantId: string, leaseId: string) {
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

  const coRenters = await prisma.rentalLeaseCoRenter.findMany({
    where: {
      lease_id: leaseId,
      tenant_id: tenantId
    },
    include: {
      renterClient: {
        select: {
          id: true,
          userId: true,
          clientType: true
        }
      }
    }
  });

  return coRenters;
}
