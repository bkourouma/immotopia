import { prisma, type PrismaTransactionClient } from '../utils/database';
import { ClientType, Prisma, TenantStatus, TenantType } from '@prisma/client';
import { logger } from '../utils/logger';
import { UpdateTenantRequest, TenantFilters, TenantStats } from '../types/tenant-types';
import { revokeTenantSessions } from '../middleware/session-invalidation';
import { logAuditEvent, recordAuditEvent, AuditActionKey } from './audit-service';
import { BadRequestError, NotFoundError, ValidationError } from '../middleware/error-middleware';
import { isValidUemoaPhone, normalizeUemoaPhone } from './personal-space/schemas';
import { getUploadsRoot } from '../utils/project-root';
import { env, frontendUrl } from '../config/env';
import * as path from 'path';
import * as fs from 'fs/promises';
import crypto from 'crypto';
import { t } from '../i18n';

/**
 * Interface for registering a tenant client
 */
export interface RegisterTenantClientRequest {
  userId: string;
  tenantId: string;
  clientType: ClientType;
  details?: Prisma.InputJsonValue;
}

/** Champs d'une agence exposables sans authentification. */
const PUBLIC_TENANT_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  logoUrl: true,
  website: true,
  brandingPrimaryColor: true,
  city: true,
  country: true
} satisfies Prisma.TenantSelect;

/**
 * Get tenant by ID (extended with new relationships)
 * @param tenantId - Tenant ID
 * @returns Tenant or null
 */
export async function getTenantById(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      // Jamais `user: true` : l'objet User complet porte `passwordHash`.
      clients: {
        include: { user: { select: { id: true, email: true, fullName: true } } }
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
  // Route publique (vitrine, inscription d'un client) : uniquement ce qu'une
  // agence affiche d'elle-meme. Ni membres, ni clients, ni abonnement.
  return prisma.tenant.findUnique({
    where: { slug },
    select: PUBLIC_TENANT_SELECT
  });
}

// La creation d'une agence passe par `provisionTenant`
// (services/tenant-provisioning-service.ts) : agence, modules, abonnement,
// socle comptable et administrateur en une seule transaction.

/**
 * Generate slug from name
 */
export function generateSlugFromName(name: string): string {
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

  // Espace personnel : le téléphone sert au paiement mobile money, il est validé (format international
  // UEMOA, mêmes règles que la création d'espace) et normalisé avant écriture. Les autres types : inchangés.
  let contactPhone = data.contactPhone;
  if (tenant.type === TenantType.PARTICULIER && typeof contactPhone === 'string' && contactPhone.trim() !== '') {
    const normalized = normalizeUemoaPhone(contactPhone);
    if (!isValidUemoaPhone(normalized)) {
      const message = 'Numéro de téléphone invalide (format international, ex. +2250712345678).';
      throw new ValidationError(message, [{ field: 'contactPhone', message }]);
    }
    contactPhone = normalized;
  }

  // If status is being changed to SUSPENDED, revoke all sessions
  if (data.status === TenantStatus.SUSPENDED && tenant.status !== TenantStatus.SUSPENDED) {
    await revokeTenantSessions(tenantId);
  }

  const auditActionKey =
    data.status === TenantStatus.SUSPENDED
      ? AuditActionKey.TENANT_SUSPENDED
      : data.status === TenantStatus.ACTIVE
        ? AuditActionKey.TENANT_ACTIVATED
        : AuditActionKey.TENANT_UPDATED;
  const isCriticalAudit = auditActionKey !== AuditActionKey.TENANT_UPDATED;

  // TENANT_SUSPENDED / TENANT_ACTIVATED are critical: their audit trace is
  // written in the same transaction as the status change. TENANT_UPDATED stays
  // on the asynchronous queue.
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.tenant.update({
      where: { id: tenantId },
      data: {
        name: data.name,
        legalName: data.legalName,
        status: data.status,
        contactEmail: data.contactEmail,
        contactPhone,
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

    if (actorUserId && isCriticalAudit) {
      await recordAuditEvent(tx, {
        actorUserId,
        tenantId,
        actionKey: auditActionKey,
        entityType: 'Tenant',
        entityId: tenantId
      });
    }

    return result;
  });

  logger.info('Tenant updated', { tenantId, changes: Object.keys(data) });

  // Audit log (non-critical)
  if (actorUserId && !isCriticalAudit) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: auditActionKey,
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
  const tenant = await prisma.$transaction(async tx => {
    const result = await tx.tenant.update({
      where: { id: tenantId },
      data: {
        status: TenantStatus.SUSPENDED,
        isActive: false
      }
    });

    if (actorUserId) {
      await recordAuditEvent(tx, {
        actorUserId,
        tenantId,
        actionKey: AuditActionKey.TENANT_SUSPENDED,
        entityType: 'Tenant',
        entityId: tenantId
      });
    }

    return result;
  });

  logger.info('Tenant suspended', { tenantId });

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
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.tenant.update({
      where: { id: tenantId },
      data: {
        status: TenantStatus.ACTIVE,
        isActive: true
      }
    });

    if (actorUserId) {
      await recordAuditEvent(tx, {
        actorUserId,
        tenantId,
        actionKey: AuditActionKey.TENANT_ACTIVATED,
        entityType: 'Tenant',
        entityId: tenantId
      });
    }

    return result;
  });

  logger.info('Tenant activated', { tenantId });

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
    throw new Error('Vous êtes déjà enregistré comme client de ce tenant.');
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
  // NOTE: In some local/dev databases, tenant_clients or memberships can be out of sync with Prisma metadata.
  // Keep endpoint resilient so role/profile resolution still works (collaborator/owner/renter/public).
  let clientMemberships: any[] = [];
  try {
    clientMemberships = await prisma.tenantClient.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
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
  } catch (error: any) {
    logger.warn('tenantClient lookup failed, using SQL fallback for membership resolution', {
      userId,
      code: error?.code,
      message: error?.message
    });

    try {
      const fallbackClientMemberships = await prisma.$queryRaw<
        Array<{
          id: string;
          client_type: string;
          tenant_id: string;
          tenant_name: string;
          tenant_slug: string | null;
          tenant_type: string;
        }>
      >`
        SELECT
          tc.id,
          tc.client_type,
          t.id AS tenant_id,
          t.name AS tenant_name,
          t.slug AS tenant_slug,
          t.type::text AS tenant_type
        FROM tenant_clients tc
        JOIN tenants t ON t.id = tc.tenant_id
        WHERE tc.user_id = ${userId}
        ORDER BY tc.created_at DESC
      `;

      clientMemberships = fallbackClientMemberships.map(row => ({
        id: row.id,
        clientType: row.client_type,
        tenant: {
          id: row.tenant_id,
          name: row.tenant_name,
          slug: row.tenant_slug,
          type: row.tenant_type
        }
      }));
    } catch (fallbackError: any) {
      logger.warn('tenantClient SQL fallback failed', {
        userId,
        code: fallbackError?.code,
        message: fallbackError?.message
      });
      clientMemberships = [];
    }
  }

  let memberships: any[] = [];
  try {
    memberships = await prisma.membership.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
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
  } catch (error: any) {
    logger.warn('membership lookup failed, using SQL fallback for membership resolution', {
      userId,
      code: error?.code,
      message: error?.message
    });

    try {
      const fallbackMemberships = await prisma.$queryRaw<
        Array<{
          id: string;
          status: string;
          tenant_id: string;
          tenant_name: string;
          tenant_slug: string | null;
          tenant_type: string;
        }>
      >`
        SELECT
          m.id,
          m.status::text AS status,
          t.id AS tenant_id,
          t.name AS tenant_name,
          t.slug AS tenant_slug,
          t.type::text AS tenant_type
        FROM memberships m
        JOIN tenants t ON t.id = m.tenant_id
        WHERE m.user_id = ${userId}
        ORDER BY
          CASE WHEN m.status = 'ACTIVE' THEN 0 ELSE 1 END,
          m.created_at DESC
      `;

      memberships = fallbackMemberships.map(row => ({
        id: row.id,
        status: row.status,
        tenant: {
          id: row.tenant_id,
          name: row.tenant_name,
          slug: row.tenant_slug,
          type: row.tenant_type
        }
      }));
    } catch (fallbackError: any) {
      logger.warn('membership SQL fallback failed', {
        userId,
        code: fallbackError?.code,
        message: fallbackError?.message
      });
      memberships = [];
    }
  }

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
    where: { isActive: true, status: TenantStatus.ACTIVE },
    select: PUBLIC_TENANT_SELECT,
    orderBy: { name: 'asc' }
  });
}

/**
 * Nom d'un contact CRM : raison sociale pour une entreprise, sinon « prénom
 * nom ». `null` si le contact n'a aucun nom exploitable.
 */
function nomAffichageContact(contact: {
  contactType?: string | null;
  legalName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string | null {
  const personne = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();
  const legal = contact.legalName?.trim() || '';
  return (contact.contactType === 'COMPANY' ? legal || personne : personne || legal) || null;
}

/**
 * Get or create a TenantClient from a CRM Contact
 * This function handles the automatic conversion of CRM contacts to tenant clients
 * when creating leases or other client-related records.
 *
 * @param tenantId - Tenant ID
 * @param contactId - CRM Contact ID
 * @param clientType - Type of client (RENTER, OWNER, etc.)
 * @returns Object containing TenantClient, user info, and whether a new user was created with optional password reset token
 */
export async function getOrCreateTenantClientFromContact(
  tenantId: string,
  contactId: string,
  clientType: ClientType,
  options: { db?: PrismaTransactionClient } = {}
): Promise<{
  tenantClient: Prisma.TenantClientGetPayload<{
    include: {
      user: {
        select: {
          id: true;
          email: true;
          fullName: true;
          avatarUrl: true;
        };
      };
    };
  }>;
  isNewUser: boolean;
  passwordResetToken?: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
  };
}> {
  // Avec `options.db` (transaction de l'appelant), tout est ecrit dans cette
  // transaction et la notification WhatsApp est laissee a l'appelant : un echec
  // ulterieur n'y laisse ni compte ni client.
  const db: PrismaTransactionClient = options.db ?? prisma;
  // Get the CRM contact
  const contact = await db.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId: tenantId
    }
  });

  if (!contact) {
    throw new NotFoundError(t("Contact introuvable ou n'appartenant pas à cette agence"));
  }

  // Check if contact has an associated user account
  // We'll try to find a user by email
  let user = await db.user.findUnique({
    where: { email: contact.email }
  });

  let isNewUser = false;
  let passwordResetToken: string | undefined;

  // Compte déjà créé sans nom (ex. propriétaire créé depuis l'e-mail d'un
  // contact à l'enregistrement d'un bien) : il reprend le nom du contact, sinon
  // les listes affichent « null (e-mail) ». Le nom d'un contact CRM ne s'écrit
  // que sur un compte déjà client de CETTE agence : le compte est global, le
  // contact d'une autre agence ne doit pas le renommer.
  if (user && !user.fullName?.trim()) {
    const nom = nomAffichageContact(contact);
    const dejaClient = nom
      ? await db.tenantClient.findFirst({ where: { tenantId, userId: user.id }, select: { id: true } })
      : null;
    if (nom && dejaClient) {
      user = await db.user.update({ where: { id: user.id }, data: { fullName: nom } });
    }
  }

  // If no user exists, create one
  if (!user) {
    isNewUser = true;

    // Random password the user never learns: access is regained through the
    // reset token created below. crypto.randomBytes, not Math.random.
    const throwawayPassword = crypto.randomBytes(32).toString('base64url');
    const passwordHash = await import('bcrypt').then(bcrypt => bcrypt.hash(throwawayPassword, 10));

    const resetToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // The account and the token that makes it usable are one unit of work:
    // creating the user without the token left an account nobody could access.
    const createUserWithToken = async (tx: PrismaTransactionClient) => {
      const createdUser = await tx.user.create({
        data: {
          email: contact.email,
          fullName: nomAffichageContact(contact),
          globalRole: 'USER',
          passwordHash,
          emailVerified: false
        }
      });

      await tx.passwordResetToken.create({
        data: {
          token: resetToken,
          userId: createdUser.id,
          expiresAt: expiresAt
        }
      });

      return createdUser;
    };
    user = options.db ? await createUserWithToken(options.db) : await prisma.$transaction(createUserWithToken);

    logger.info('User account created from CRM contact', {
      userId: user.id,
      contactId: contact.id,
      email: contact.email
    });

    passwordResetToken = resetToken;

    logger.info('Password reset token created for new user', {
      userId: user.id,
      email: contact.email
    });

    // Notify user on WhatsApp (if consent + number) with reset-password link
    if (!options.db) {
      try {
        const baseUrl = (frontendUrl || '').replace(/\/$/, '');
        const resetUrl = baseUrl ? `${baseUrl}/reset-password?token=${resetToken}` : '';
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
        const { sendWhatsappNotification } = await import('./whatsapp-notification-send-service');
        await sendWhatsappNotification({
          tenantId,
          notificationKey: 'PORTAL_ACCOUNT_CREATED',
          variables: {
            userName:
              user.fullName?.trim() ||
              [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
              contact.email,
            tenantName: tenant?.name || '',
            resetUrl
          },
          contactId: contact.id
        });
      } catch (err) {
        logger.warn('WhatsApp portal account created notification failed', {
          tenantId,
          contactId: contact.id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  // Check if TenantClient already exists
  let tenantClient = await db.tenantClient.findUnique({
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

  // If TenantClient exists, update it to include crmContactId if not present
  if (tenantClient) {
    const currentDetails = (tenantClient.details as any) || {};
    if (!currentDetails.crmContactId) {
      tenantClient = await db.tenantClient.update({
        where: {
          id: tenantClient.id
        },
        data: {
          details: {
            ...currentDetails,
            crmContactId: contact.id,
            phone: contact.phonePrimary || currentDetails.phone
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

      logger.info('TenantClient updated with crmContactId', {
        tenantClientId: tenantClient.id,
        contactId: contact.id
      });
    }
  }

  // If TenantClient doesn't exist, create it
  if (!tenantClient) {
    tenantClient = await db.tenantClient.create({
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

  return {
    tenantClient,
    isNewUser,
    passwordResetToken,
    user: tenantClient.user
  };
}

// --- Lot G : logo d'agence -------------------------------------------------

const LOGO_ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

function extensionForLogoMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return '.jpg';
  }
}

/**
 * Enregistre le logo d'une agence et met a jour `Tenant.logoUrl`.
 *
 * Chemin de stockage : `uploads/properties/agency-logos/<tenantId>/<fichier>`.
 * Un logo doit etre PUBLIC (affiche sans authentification sur la vitrine, le
 * portail, l'e-mail...). `middleware/uploads-access-middleware.ts` (hors
 * territoire de cet agent, lecture seule) classe `properties/<X>/<...>` comme
 * public tant que le second segment n'est pas `documents` — c'est le cas ici
 * (`agency-logos`), donc AUCUNE modification de ce middleware n'est
 * necessaire. Une racine dediee (`tenants/<tenantId>/logo/...`) serait plus
 * lisible mais demanderait d'y ajouter un cas ; voir le rapport de l'agent
 * pour le detail exact du changement si ce choix est reconsidere.
 */
export async function uploadTenantLogo(tenantId: string, file: Express.Multer.File, actorUserId?: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    throw new NotFoundError('Agence introuvable.');
  }

  if (!file.mimetype || !LOGO_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new BadRequestError('Logo invalide : formats acceptés PNG, JPEG ou WebP (SVG refusé).');
  }
  if (file.size > LOGO_MAX_SIZE_BYTES) {
    throw new BadRequestError('Logo trop volumineux : 2 Mo maximum.');
  }

  const uploadDir = path.join(getUploadsRoot(env.UPLOADS_DIR), 'properties', 'agency-logos', tenantId);
  await fs.mkdir(uploadDir, { recursive: true });

  const originalExtension = path.extname(file.originalname).toLowerCase();
  const fileExtension =
    originalExtension && ['.png', '.jpg', '.jpeg', '.webp'].includes(originalExtension)
      ? originalExtension
      : extensionForLogoMimeType(file.mimetype);
  const fileName = `${crypto.randomUUID()}${fileExtension}`;

  await fs.writeFile(path.join(uploadDir, fileName), file.buffer);

  const logoUrl = `/uploads/properties/agency-logos/${tenantId}/${fileName}`;

  await prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl } });

  logger.info('Tenant logo uploaded', { tenantId, fileName });

  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.TENANT_UPDATED,
      entityType: 'Tenant',
      entityId: tenantId,
      payload: { logoUploaded: true }
    });
  }

  return { logoUrl };
}
