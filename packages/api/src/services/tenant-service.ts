import { prisma } from '../utils/database';
import { ClientType, TenantType, Prisma, TenantStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { CreateTenantRequest, UpdateTenantRequest, TenantFilters, TenantStats } from '../types/tenant-types';
import { revokeTenantSessions } from '../middleware/session-invalidation';
import { logAuditEvent, AuditActionKey } from './audit-service';

/**
 * Interface for registering a tenant client
 */
export interface RegisterTenantClientRequest {
  userId: string;
  tenantId: string;
  clientType: ClientType;
  details?: Prisma.InputJsonValue;
}

/**
 * Interface for creating a new tenant (legacy - use types from tenant-types.ts)
 */
export interface CreateTenantRequest {
  name: string;
  slug: string;
  type: TenantType;
  logoUrl?: string;
  website?: string;
}

/**
 * Get tenant by ID (extended with new relationships)
 * @param tenantId - Tenant ID
 * @returns Tenant or null
 */
export async function getTenantById(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      clients: {
        include: { user: true }
      },
      modules: true,
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              lastLoginAt: true
            }
          }
        }
      },
      subscription: {
        include: {
          invoices: {
            orderBy: { issueDate: 'desc' },
            take: 10
          }
        }
      }
    }
  });
}

/**
 * Get tenant by slug
 * @param slug - Tenant slug (unique identifier for URLs)
 * @returns Tenant or null
 */
export async function getTenantBySlug(slug: string) {
  return prisma.tenant.findUnique({
    where: { slug },
    include: {
      memberships: {
        include: { user: true }
      }
    }
  });
}

/**
 * Create a new tenant (extended with new fields)
 * @param data - Tenant creation data
 * @param actorUserId - User ID creating the tenant (for audit log)
 * @returns Created tenant
 */
export async function createTenant(
  data: CreateTenantRequest | import('../types/tenant-types').CreateTenantRequest,
  actorUserId?: string
) {
  // Check if slug already exists
  const existingTenant = await prisma.tenant.findUnique({
    where: { slug: 'slug' in data ? data.slug : generateSlugFromName(data.name) }
  });

  if (existingTenant) {
    throw new Error('Un tenant avec ce slug existe dÃ©jÃ .');
  }

  // Check if subdomain already exists (if provided)
  if ('subdomain' in data && data.subdomain) {
    const existingSubdomain = await prisma.tenant.findUnique({
      where: { subdomain: data.subdomain }
    });
    if (existingSubdomain) {
      throw new Error('Ce sous-domaine est dÃ©jÃ  utilisÃ©.');
    }
  }

  const slug = 'slug' in data ? data.slug : generateSlugFromName(data.name);
  const tenant = await prisma.tenant.create({
    data: {
      name: data.name,
      slug,
      type: data.type,
      logoUrl: 'logoUrl' in data ? data.logoUrl : undefined,
      website: 'website' in data ? data.website : undefined,
      isActive: true,
      // New fields
      legalName: 'legalName' in data ? data.legalName : undefined,
      status: 'status' in data ? (data.status as TenantStatus) : TenantStatus.PENDING,
      contactEmail: 'contactEmail' in data ? data.contactEmail : undefined,
      contactPhone: 'contactPhone' in data ? data.contactPhone : undefined,
      country: 'country' in data ? data.country : undefined,
      city: 'city' in data ? data.city : undefined,
      address: 'address' in data ? data.address : undefined,
      brandingPrimaryColor: 'brandingPrimaryColor' in data ? data.brandingPrimaryColor : undefined,
      subdomain: 'subdomain' in data ? data.subdomain : undefined,
      customDomain: 'customDomain' in data ? data.customDomain : undefined
    }
  });

  logger.info('Tenant created', { tenantId: tenant.id, slug: tenant.slug, type: tenant.type });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: tenant.id,
      actionKey: AuditActionKey.TENANT_CREATED,
      entityType: 'Tenant',
      entityId: tenant.id
    });
  }

  return tenant;
}

/**
 * Generate slug from name
 */
function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Update tenant
 * @param tenantId - Tenant ID
 * @param data - Update data
 * @param actorUserId - User ID performing the update (for audit log)
 * @returns Updated tenant
 */
export async function updateTenant(tenantId: string, data: UpdateTenantRequest, actorUserId?: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) {
    throw new Error('Tenant introuvable.');
  }

  // If status is being changed to SUSPENDED, revoke all sessions
  if (data.status === TenantStatus.SUSPENDED && tenant.status !== TenantStatus.SUSPENDED) {
    await revokeTenantSessions(tenantId);
  }

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      name: data.name,
      legalName: data.legalName,
      status: data.status,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      country: data.country,
      city: data.city,
      address: data.address,
      brandingPrimaryColor: data.brandingPrimaryColor,
      subdomain: data.subdomain,
      customDomain: data.customDomain,
      logoUrl: data.logoUrl,
      website: data.website
    }
  });

  logger.info('Tenant updated', { tenantId, changes: Object.keys(data) });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey:
        data.status === TenantStatus.SUSPENDED
          ? AuditActionKey.TENANT_SUSPENDED
          : data.status === TenantStatus.ACTIVE
            ? AuditActionKey.TENANT_ACTIVATED
            : AuditActionKey.TENANT_UPDATED,
      entityType: 'Tenant',
      entityId: tenantId
    });
  }

  return updated;
}

/**
 * Suspend tenant and revoke all sessions
 * @param tenantId - Tenant ID
 * @param actorUserId - User ID performing the suspension (for audit log)
 * @returns Updated tenant
 */
export async function suspendTenant(tenantId: string, actorUserId?: string) {
  // Revoke all sessions first
  await revokeTenantSessions(tenantId);

  // Update tenant status
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      status: TenantStatus.SUSPENDED,
      isActive: false
    }
  });

  logger.info('Tenant suspended', { tenantId });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.TENANT_SUSPENDED,
      entityType: 'Tenant',
      entityId: tenantId
    });
  }

  return tenant;
}

/**
 * Activate tenant
 * @param tenantId - Tenant ID
 * @param actorUserId - User ID performing the activation (for audit log)
 * @returns Updated tenant
 */
export async function activateTenant(tenantId: string, actorUserId?: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!tenant) {
    throw new Error('Tenant introuvable.');
  }

  // Update tenant status
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      status: TenantStatus.ACTIVE,
      isActive: true
    }
  });

  logger.info('Tenant activated', { tenantId });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.TENANT_ACTIVATED,
      entityType: 'Tenant',
      entityId: tenantId
    });
  }

  return updated;
}

/**
 * List tenants with filtering and pagination
 * @param filters - Filter criteria
 * @returns List of tenants with pagination
 */
export async function listTenants(filters: TenantFilters = {}) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  const where: Prisma.TenantWhereInput = {};

  if (filters.status) {
    where.status = filters.status as TenantStatus;
  }
  if (filters.type) {
    where.type = filters.type;
  }
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { contactEmail: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  // Filter by subscription plan (if subscription exists)
  if (filters.plan) {
    where.subscription = {
      planKey: filters.plan as any
    };
  }

  // Filter by module (if module is enabled)
  if (filters.module) {
    where.modules = {
      some: {
        moduleKey: filters.module as any,
        enabled: true
      }
    };
  }

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        subscription: {
          select: {
            planKey: true,
            status: true
          }
        },
        modules: {
          where: { enabled: true },
          select: {
            moduleKey: true
          }
        }
      }
    }),
    prisma.tenant.count({ where })
  ]);

  return {
    tenants,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get tenant statistics
 * @param tenantId - Tenant ID
 * @returns Tenant statistics
 */
export async function getTenantStats(tenantId: string): Promise<TenantStats> {
  const [memberships, modules, subscription, lastLogin] = await Promise.all([
    // Get collaborator counts
    prisma.membership.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true
    }),
    // Get enabled modules
    prisma.tenantModule.findMany({
      where: {
        tenantId,
        enabled: true
      },
      select: {
        moduleKey: true
      }
    }),
    // Get subscription
    prisma.subscription.findUnique({
      where: { tenantId },
      select: {
        planKey: true,
        status: true,
        billingCycle: true
      }
    }),
    // Get most recent login
    prisma.user.findFirst({
      where: {
        memberships: {
          some: { tenantId }
        },
        lastLoginAt: { not: null }
      },
      orderBy: {
        lastLoginAt: 'desc'
      },
      select: {
        lastLoginAt: true
      }
    })
  ]);

  const activeCount = memberships.find(m => m.status === 'ACTIVE')?._count || 0;
  const disabledCount = memberships.find(m => m.status === 'DISABLED')?._count || 0;
  const totalCount = memberships.reduce((sum, m) => sum + m._count, 0);

  return {
    collaboratorCount: totalCount,
    activeCollaborators: activeCount,
    disabledCollaborators: disabledCount,
    enabledModules: modules.map(m => m.moduleKey),
    subscription: subscription
      ? {
          plan: subscription.planKey,
          status: subscription.status,
          billingCycle: subscription.billingCycle
        }
      : null,
    lastLoginAt: lastLogin?.lastLoginAt || null
  };
}

/**
 * Register a user as a client of a tenant (T019)
 * This links an existing user to a tenant as a client (owner, renter, or buyer)
 * @param data - Registration data
 * @returns Created TenantClient
 */
export async function registerTenantClient(data: RegisterTenantClientRequest) {
  // Verify tenant exists and is active
  const tenant = await prisma.tenant.findUnique({
    where: { id: data.tenantId }
  });

  if (!tenant) {
    throw new Error('Tenant introuvable.');
  }

  if (!tenant.isActive) {
    throw new Error("Ce tenant n'est plus actif.");
  }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: data.userId }
  });

  if (!user) {
    throw new Error('Utilisateur introuvable.');
  }

  // Check if user is already a client of this tenant
  const existingClient = await prisma.tenantClient.findUnique({
    where: {
      userId_tenantId: {
        userId: data.userId,
        tenantId: data.tenantId
      }
    }
  });

  if (existingClient) {
    throw new Error('Vous Ãªtes dÃ©jÃ  enregistrÃ© comme client de ce tenant.');
  }

  // Create tenant client relationship
  const tenantClient = await prisma.tenantClient.create({
    data: {
      userId: data.userId,
      tenantId: data.tenantId,
      clientType: data.clientType,
      details: data.details || {}
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true
        }
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          type: true
        }
      }
    }
  });

  logger.info('Tenant client registered', {
    userId: data.userId,
    tenantId: data.tenantId,
    clientType: data.clientType
  });

  return tenantClient;
}

/**
 * Get all clients for a tenant
 * @param tenantId - Tenant ID
 * @returns List of tenant clients
 */
export async function getTenantClients(tenantId: string) {
  return prisma.tenantClient.findMany({
    where: { tenantId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Get all tenants a user is a client of
 * @param userId - User ID
 * @returns List of tenants with client type
 */
export async function getUserTenantMemberships(userId: string) {
  const [clientMemberships, memberships] = await Promise.all([
    prisma.tenantClient.findMany({
      where: { userId },
      include: {
        tenant: true
      }
    }),
    prisma.membership.findMany({
      where: { userId },
      include: {
        tenant: true
      }
    })
  ]);

  return {
    asClient: clientMemberships,
    asMember: memberships
  };
}

/**
 * Update a tenant client's details
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @param details - New details
 * @returns Updated tenant client
 */
export async function updateTenantClientDetails(userId: string, tenantId: string, details: Prisma.InputJsonValue) {
  return prisma.tenantClient.update({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    },
    data: { details },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });
}

/**
 * Remove a client from a tenant
 * @param userId - User ID
 * @param tenantId - Tenant ID
 */
export async function removeTenantClient(userId: string, tenantId: string) {
  await prisma.tenantClient.delete({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    }
  });

  logger.info('Tenant client removed', { userId, tenantId });
}

/**
 * List all active tenants
 * @returns List of active tenants
 */
export async function listActiveTenants() {
  return prisma.tenant.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      logoUrl: true,
      website: true
    },
    orderBy: { name: 'asc' }
  });
}


/**
 * Get or create a TenantClient from a CRM Contact
 * This function handles the automatic conversion of CRM contacts to tenant clients
 * when creating leases or other client-related records.
 * 
 * @param tenantId - Tenant ID
 * @param contactId - CRM Contact ID
 * @param clientType - Type of client (RENTER, OWNER, etc.)
 * @returns TenantClient (existing or newly created)
 */
export async function getOrCreateTenantClientFromContact(
  tenantId: string,
  contactId: string,
  clientType: ClientType
) {
  // Get the CRM contact
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId: tenantId
    }
  });

  if (!contact) {
    throw new Error('Contact not found or does not belong to this tenant');
  }

  // Check if contact has an associated user account
  // We'll try to find a user by email
  let user = await prisma.user.findUnique({
    where: { email: contact.email }
  });

  // If no user exists, create one
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: contact.email,
        fullName: `${contact.firstName} ${contact.lastName}`,
        globalRole: 'USER',
        // Generate a random password - user will need to reset it
        passwordHash: await import('bcrypt').then(bcrypt => 
          bcrypt.hash(Math.random().toString(36), 10)
        ),
        emailVerified: false
      }
    });

    logger.info('User account created from CRM contact', {
      userId: user.id,
      contactId: contact.id,
      email: contact.email
    });
  }

  // Check if TenantClient already exists
  let tenantClient = await prisma.tenantClient.findUnique({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: tenantId
      }
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true
        }
      }
    }
  });

  // If TenantClient doesn't exist, create it
  if (!tenantClient) {
    tenantClient = await prisma.tenantClient.create({
      data: {
        userId: user.id,
        tenantId: tenantId,
        clientType: clientType,
        details: {
          crmContactId: contact.id,
          phone: contact.phonePrimary,
          source: 'crm_contact',
          autoCreated: true,
          createdFromLeaseForm: true
        }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true
          }
        }
      }
    });

    logger.info('TenantClient created from CRM contact', {
      tenantClientId: tenantClient.id,
      userId: user.id,
      contactId: contact.id,
      clientType: clientType
    });
  }

  return tenantClient;
}
