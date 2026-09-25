import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { CRM_ENTITY_TYPES } from '../types/audit-types';
import { CreateContactRequest, UpdateContactRequest, ContactFilters, ContactDetail } from '../types/crm-types';
import { CrmContactStatus, MembershipStatus, Prisma } from '@prisma/client';
import { autoInviteContactToWhatsappGroup } from './whatsapp-group-automation-service';

/**
 * Assert that a user is an active member of the tenant before letting a
 * request assign them to a contact/deal/activity. Without this check, any
 * user id accepted from the request body (e.g. `assignedToUserId`) could
 * point to a member of another agency.
 * @param tenantId - Tenant ID
 * @param userId - User ID to verify
 */
export async function assertActiveMember(tenantId: string, userId: string): Promise<void> {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: MembershipStatus.ACTIVE }
  });

  if (!membership) {
    throw new Error("L'utilisateur assigné doit être membre actif de cette agence");
  }
}

/**
 * Create a new contact
 * @param tenantId - Tenant ID (required for isolation)
 * @param data - Contact creation data
 * @param actorUserId - User creating the contact (for audit)
 * @returns Created contact
 */
export async function createContact(tenantId: string, data: CreateContactRequest, actorUserId?: string) {
  // Validate required fields
  if (!data.firstName || !data.lastName || !data.email) {
    throw new Error('First name, last name, and email are required');
  }

  // Check for duplicate email within tenant
  const existingContact = await prisma.crmContact.findUnique({
    where: {
      tenantId_email: {
        tenantId,
        email: data.email
      }
    }
  });

  if (existingContact) {
    throw new Error(`A contact with email ${data.email} already exists in this tenant`);
  }

  // Map phone to phonePrimary for backward compatibility
  const phonePrimary = data.phonePrimary || data.phone || null;

  // The assignee must belong to this tenant (reference received in the request body)
  if (data.assignedToUserId) {
    await assertActiveMember(tenantId, data.assignedToUserId);
  }

  // Create contact
  const contact = await prisma.crmContact.create({
    data: {
      tenantId,
      contactType: data.contactType || 'PERSON',
      // Person Identification
      civility: data.civility || null,
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      nationality: data.nationality || null,
      identityDocumentType: data.identityDocumentType || null,
      identityDocumentNumber: data.identityDocumentNumber || null,
      identityDocumentExpiry: data.identityDocumentExpiry ? new Date(data.identityDocumentExpiry) : null,
      profilePhotoUrl: data.profilePhotoUrl || null,
      // Company Identification
      legalName: data.legalName || null,
      legalForm: data.legalForm || null,
      rccm: data.rccm || null,
      taxId: data.taxId || null,
      representativeName: data.representativeName || null,
      representativeRole: data.representativeRole || null,
      // Multi-Channel Contact Information
      email: data.email,
      emailSecondary: data.emailSecondary || null,
      phonePrimary: phonePrimary,
      phoneSecondary: data.phoneSecondary || null,
      whatsappNumber: data.whatsappNumber || null,
      address: data.address || null,
      city: data.city || null, // Legacy
      district: data.district || null, // Legacy
      country: data.country || null, // Legacy
      communeId: data.communeId || null,
      locationZone: data.locationZone || null,
      preferredLanguage: data.preferredLanguage || null,
      preferredContactChannel: data.preferredContactChannel || null,
      // Real Estate Project Intent (JSON) – safe serialize, avoid undefined
      // `Json?` de Prisma n'accepte pas un `null` ordinaire (voir audit-service.ts) :
      // il faut la valeur sentinelle `DbNull`, qui écrit un NULL SQL.
      projectIntentJson:
        data.projectIntent != null && typeof data.projectIntent === 'object'
          ? (JSON.parse(JSON.stringify(data.projectIntent)) as Prisma.InputJsonValue)
          : Prisma.DbNull,
      // Socio-Professional Profile
      profession: data.profession || null,
      sectorOfActivity: data.sectorOfActivity || null,
      employer: data.employer || null,
      incomeMin: data.incomeMin !== undefined ? data.incomeMin : null,
      incomeMax: data.incomeMax !== undefined ? data.incomeMax : null,
      jobStability: data.jobStability || null,
      borrowingCapacity: data.borrowingCapacity || null,
      // CRM Behavior & Scoring
      source: data.source || data.leadSource || null,
      leadSource: data.leadSource || null,
      maturityLevel: data.maturityLevel || 'COLD',
      score: data.score || 0,
      priorityLevel: data.priorityLevel || 'NORMAL',
      status: CrmContactStatus.LEAD, // Default to LEAD
      assignedToUserId: data.assignedToUserId || null,
      // Consents & Compliance (default true: tout coché par défaut)
      consentMarketing: data.consentMarketing ?? true,
      consentWhatsapp: data.consentWhatsapp ?? true,
      consentEmail: data.consentEmail ?? true,
      consentDate: data.consentMarketing || data.consentWhatsapp || data.consentEmail ? new Date() : null,
      consentSource: data.consentSource || null,
      // Internal Notes
      internalNotes: data.internalNotes || null,
      // Legacy fields (backward compatibility)
      numeroPieceId: data.numeroPieceId || null,
      fonction: data.fonction || null,
      salaire: data.salaire !== undefined ? data.salaire : null,
      // Target zones (many-to-many)
      targetZones:
        data.targetZoneIds && data.targetZoneIds.length > 0
          ? {
              create: data.targetZoneIds.map(communeId => ({
                communeId
              }))
            }
          : undefined
    },
    include: {
      assignedTo: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      targetZones: {
        include: {
          commune: {
            select: {
              id: true,
              name: true,
              nameFr: true,
              code: true
            }
          }
        }
      }
    }
  });

  logger.info('CRM contact created', {
    contactId: contact.id,
    tenantId,
    email: contact.email
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'CRM_CONTACT_CREATED',
      entityType: CRM_ENTITY_TYPES.CONTACT,
      entityId: contact.id,
      payload: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        status: contact.status
      }
    });
  }

  autoInviteContactToWhatsappGroup(tenantId, contact.id).catch(error => {
    logger.warn('Automatic WhatsApp group invite failed after CRM contact creation', {
      tenantId,
      contactId: contact.id,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  return contact;
}

/**
 * Get contact by ID with full details
 * @param tenantId - Tenant ID (required for isolation)
 * @param contactId - Contact ID
 * @returns Contact detail with relationships
 */
export async function getContactById(tenantId: string, contactId: string): Promise<ContactDetail | null> {
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId // Enforce tenant isolation
    },
    include: {
      roles: {
        where: {
          active: true
        },
        orderBy: {
          startedAt: 'desc'
        }
      },
      deals: {
        take: 10,
        orderBy: {
          createdAt: 'desc'
        }
      },
      activities: {
        take: 10,
        orderBy: {
          occurredAt: 'desc'
        },
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
              fullName: true
            }
          }
        }
      },
      tags: {
        include: {
          tag: true
        }
      },
      targetZones: {
        include: {
          commune: {
            select: {
              id: true,
              name: true,
              nameFr: true,
              code: true
            }
          }
        }
      },
      assignedTo: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    }
  });

  if (!contact) {
    return null;
  }

  // Transform tags and activities
  // Map phone_primary to phone for backward compatibility. `phone` is not a
  // declared field of `ContactDetail` (it only documents the DB column
  // `phonePrimary`) — the cast below is the pre-existing shape, kept as-is
  // rather than widening the shared type from this file.
  const transformedContact = {
    ...contact,
    phone: contact.phonePrimary || null, // Backward compatibility
    recentActivities: contact.activities,
    tags: contact.tags.map(ct => ({
      ...ct.tag,
      CrmContactTag: ct
    }))
  } as ContactDetail;

  return transformedContact;
}

/**
 * List contacts with filtering and pagination
 * @param tenantId - Tenant ID (required for isolation)
 * @param filters - Filter criteria
 * @returns Paginated contacts
 */
export async function listContacts(tenantId: string, filters: ContactFilters) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {
    tenantId // Always enforce tenant isolation
  };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.source) {
    where.source = filters.source;
  }

  if (filters.assignedTo) {
    where.assignedToUserId = filters.assignedTo;
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      where.createdAt.lte = new Date(filters.endDate);
    }
  }

  // Build AND conditions array for complex filters
  const andConditions: any[] = [];

  if (filters.search) {
    andConditions.push({
      OR: [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } }
      ]
    });
  }

  // Handle tag filter
  if (filters.tag) {
    andConditions.push({
      tags: {
        some: {
          tag: {
            name: filters.tag
          }
        }
      }
    });
  }

  // Handle hasActiveDeal filter
  if (filters.hasActiveDeal !== undefined) {
    if (filters.hasActiveDeal) {
      andConditions.push({
        deals: {
          some: {
            stage: {
              notIn: ['WON', 'LOST']
            }
          }
        }
      });
    } else {
      andConditions.push({
        deals: {
          none: {
            stage: {
              notIn: ['WON', 'LOST']
            }
          }
        }
      });
    }
  }

  // Handle hasUpcomingActivity filter
  if (filters.hasUpcomingActivity !== undefined) {
    const now = new Date();
    if (filters.hasUpcomingActivity) {
      // Contact must have an activity with nextActionAt in the future
      andConditions.push({
        activities: {
          some: {
            nextActionAt: {
              gte: now,
              not: null
            }
          }
        }
      });
    } else {
      // Contact must NOT have upcoming activities
      andConditions.push({
        activities: {
          none: {
            nextActionAt: {
              gte: now,
              not: null
            }
          }
        }
      });
    }
  }

  // Apply AND conditions if any
  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  // Get total count
  const total = await prisma.crmContact.count({ where });

  // Get contacts
  const contacts = await prisma.crmContact.findMany({
    where,
    skip,
    take: limit,
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      assignedTo: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      tags: {
        include: {
          tag: true
        }
      },
      roles: {
        where: {
          active: true
        },
        orderBy: {
          startedAt: 'desc'
        }
      },
      deals: {
        where: {
          stage: {
            notIn: ['WON', 'LOST']
          }
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: 1,
        select: {
          id: true,
          type: true,
          stage: true,
          budgetMin: true,
          budgetMax: true,
          locationZone: true
        }
      },
      activities: {
        where: {
          nextActionAt: {
            not: null
          }
        },
        orderBy: {
          nextActionAt: 'asc'
        },
        take: 1,
        select: {
          id: true,
          nextActionAt: true,
          nextActionType: true
        }
      }
    }
  });

  // Transform tags for each contact
  const transformedContacts = contacts.map(contact => {
    const result: any = {
      ...contact,
      tags: contact.tags.map(ct => ct.tag)
    };

    // Add active deal if exists
    if (contact.deals && contact.deals.length > 0) {
      result.activeDeal = contact.deals[0];
    } else {
      result.activeDeal = null;
    }

    // Add next action if exists
    if (contact.activities && contact.activities.length > 0) {
      result.nextAction = {
        id: contact.activities[0].id,
        nextActionAt: contact.activities[0].nextActionAt,
        nextActionType: contact.activities[0].nextActionType
      };
    } else {
      result.nextAction = null;
    }

    return result;
  });

  return {
    contacts: transformedContacts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Update contact
 * @param tenantId - Tenant ID (required for isolation)
 * @param contactId - Contact ID
 * @param data - Update data
 * @param actorUserId - User updating the contact (for audit)
 * @returns Updated contact
 */
export async function updateContact(
  tenantId: string,
  contactId: string,
  data: UpdateContactRequest,
  actorUserId?: string
) {
  // Verify contact exists and belongs to tenant
  const existingContact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId // Enforce tenant isolation
    }
  });

  if (!existingContact) {
    throw new Error('Contact not found');
  }

  // Check for duplicate email if email is being updated
  if (data.email && data.email !== existingContact.email) {
    const duplicateContact = await prisma.crmContact.findUnique({
      where: {
        tenantId_email: {
          tenantId,
          email: data.email
        }
      }
    });

    if (duplicateContact) {
      throw new Error(`A contact with email ${data.email} already exists in this tenant`);
    }
  }

  // Track changed fields for audit
  const changedFields: Record<string, unknown> = {};

  // Helper function to track changes
  const updateField = (field: string, value: any, existingValue: any) => {
    if (value !== undefined) {
      updateData[field] = value;
      if (value !== existingValue) {
        changedFields[field] = value;
      }
    }
  };

  // Build update data
  const updateData: any = {};

  // Contact Type
  updateField('contactType', data.contactType, existingContact.contactType);

  // Person Identification
  updateField('civility', data.civility, existingContact.civility);
  updateField('firstName', data.firstName, existingContact.firstName);
  updateField('lastName', data.lastName, existingContact.lastName);
  updateField('dateOfBirth', data.dateOfBirth ? new Date(data.dateOfBirth) : null, existingContact.dateOfBirth);
  updateField('nationality', data.nationality, existingContact.nationality);
  updateField('identityDocumentType', data.identityDocumentType, existingContact.identityDocumentType);
  updateField('identityDocumentNumber', data.identityDocumentNumber, existingContact.identityDocumentNumber);
  updateField(
    'identityDocumentExpiry',
    data.identityDocumentExpiry ? new Date(data.identityDocumentExpiry) : null,
    existingContact.identityDocumentExpiry
  );
  updateField('profilePhotoUrl', data.profilePhotoUrl, existingContact.profilePhotoUrl);

  // Company Identification
  updateField('legalName', data.legalName, existingContact.legalName);
  updateField('legalForm', data.legalForm, existingContact.legalForm);
  updateField('rccm', data.rccm, existingContact.rccm);
  updateField('taxId', data.taxId, existingContact.taxId);
  updateField('representativeName', data.representativeName, existingContact.representativeName);
  updateField('representativeRole', data.representativeRole, existingContact.representativeRole);

  // Multi-Channel Contact Information
  updateField('email', data.email, existingContact.email);
  updateField('emailSecondary', data.emailSecondary, existingContact.emailSecondary);
  // Handle phone mapping (backward compatibility)
  const phonePrimary =
    data.phonePrimary !== undefined ? data.phonePrimary : data.phone !== undefined ? data.phone : undefined;
  if (phonePrimary !== undefined) {
    updateField('phonePrimary', phonePrimary, existingContact.phonePrimary);
  }
  updateField('phoneSecondary', data.phoneSecondary, existingContact.phoneSecondary);
  updateField('whatsappNumber', data.whatsappNumber, existingContact.whatsappNumber);
  updateField('address', data.address, existingContact.address);
  updateField('city', data.city, existingContact.city); // Legacy
  updateField('district', data.district, existingContact.district); // Legacy
  updateField('country', data.country, existingContact.country); // Legacy
  updateField('communeId', data.communeId, existingContact.communeId);
  updateField('locationZone', data.locationZone, existingContact.locationZone);
  // Handle target zones (many-to-many) - replace all if provided
  if (data.targetZoneIds !== undefined) {
    // Delete existing target zones and create new ones
    updateData.targetZones = {
      deleteMany: {},
      create:
        data.targetZoneIds && data.targetZoneIds.length > 0
          ? data.targetZoneIds.map(communeId => ({
              communeId
            }))
          : []
    };
    changedFields.targetZoneIds = data.targetZoneIds;
  }
  updateField('preferredLanguage', data.preferredLanguage, existingContact.preferredLanguage);
  updateField('preferredContactChannel', data.preferredContactChannel, existingContact.preferredContactChannel);

  // Real Estate Project Intent (JSON)
  if (data.projectIntent !== undefined) {
    const projectIntentJson = data.projectIntent ? JSON.parse(JSON.stringify(data.projectIntent)) : null;
    updateField('projectIntentJson', projectIntentJson, existingContact.projectIntentJson);
  }

  // Socio-Professional Profile
  updateField('profession', data.profession, existingContact.profession);
  updateField('sectorOfActivity', data.sectorOfActivity, existingContact.sectorOfActivity);
  updateField('employer', data.employer, existingContact.employer);
  if (data.incomeMin !== undefined) {
    updateField('incomeMin', data.incomeMin, existingContact.incomeMin);
  }
  if (data.incomeMax !== undefined) {
    updateField('incomeMax', data.incomeMax, existingContact.incomeMax);
  }
  updateField('jobStability', data.jobStability, existingContact.jobStability);
  updateField('borrowingCapacity', data.borrowingCapacity, existingContact.borrowingCapacity);

  // CRM Behavior & Scoring
  if (data.source !== undefined) {
    updateField('source', data.source, existingContact.source);
  }
  updateField('leadSource', data.leadSource, existingContact.leadSource);
  updateField('maturityLevel', data.maturityLevel, existingContact.maturityLevel);
  updateField('score', data.score, existingContact.score);
  updateField('priorityLevel', data.priorityLevel, existingContact.priorityLevel);

  // Status & Assignment
  updateField('status', data.status, existingContact.status);
  if (data.assignedToUserId !== undefined && data.assignedToUserId !== null) {
    await assertActiveMember(tenantId, data.assignedToUserId);
  }
  updateField('assignedToUserId', data.assignedToUserId, existingContact.assignedToUserId);

  // Financial Snapshot
  updateField('balance', data.balance, existingContact.balance);
  updateField('totalPaid', data.totalPaid, existingContact.totalPaid);
  updateField('totalDue', data.totalDue, existingContact.totalDue);
  updateField('depositAmount', data.depositAmount, existingContact.depositAmount);
  updateField('paymentIncidentsCount', data.paymentIncidentsCount, existingContact.paymentIncidentsCount);
  updateField('preferredPaymentMethod', data.preferredPaymentMethod, existingContact.preferredPaymentMethod);

  // Consents & Compliance
  updateField('consentMarketing', data.consentMarketing, existingContact.consentMarketing);
  updateField('consentWhatsapp', data.consentWhatsapp, existingContact.consentWhatsapp);
  updateField('consentEmail', data.consentEmail, existingContact.consentEmail);
  if (data.consentMarketing !== undefined || data.consentWhatsapp !== undefined || data.consentEmail !== undefined) {
    const hasConsent = data.consentMarketing || data.consentWhatsapp || data.consentEmail || false;
    if (hasConsent && !existingContact.consentDate) {
      updateData.consentDate = new Date();
      changedFields.consentDate = new Date();
    }
  }
  updateField('consentSource', data.consentSource, existingContact.consentSource);

  // Internal Notes
  updateField('internalNotes', data.internalNotes, existingContact.internalNotes);

  // Legacy fields (backward compatibility)
  updateField('numeroPieceId', data.numeroPieceId, existingContact.numeroPieceId);
  updateField('fonction', data.fonction, existingContact.fonction);
  updateField('salaire', data.salaire, existingContact.salaire);

  // Update contact
  const updatedContact = await prisma.crmContact.update({
    where: { id: contactId, tenantId },
    data: updateData,
    include: {
      assignedTo: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      targetZones: {
        include: {
          commune: {
            select: {
              id: true,
              name: true,
              nameFr: true,
              code: true
            }
          }
        }
      }
    }
  });

  logger.info('CRM contact updated', {
    contactId,
    tenantId,
    changedFields: Object.keys(changedFields)
  });

  // Audit log
  if (actorUserId && Object.keys(changedFields).length > 0) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'CRM_CONTACT_UPDATED',
      entityType: CRM_ENTITY_TYPES.CONTACT,
      entityId: contactId,
      payload: changedFields
    });
  }

  return updatedContact;
}

/**
 * Update last interaction timestamp for a contact
 * @param tenantId - Tenant ID
 * @param contactId - Contact ID
 */
export async function updateLastInteractionAt(tenantId: string, contactId: string) {
  await prisma.crmContact.updateMany({
    where: {
      id: contactId,
      tenantId // Enforce tenant isolation
    },
    data: {
      lastInteractionAt: new Date()
    }
  });
}

/**
 * Permanently delete a contact (and related CRM data)
 * @param tenantId - Tenant ID
 * @param contactId - Contact ID
 * @param actorUserId - User deleting the contact (for audit)
 */
export async function deleteContact(tenantId: string, contactId: string, actorUserId?: string) {
  // Ensure contact exists and belongs to tenant
  const existingContact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId
    }
  });

  if (!existingContact) {
    throw new Error('Contact not found');
  }

  // Delete related CRM data with explicit cascades where needed
  await prisma.$transaction([
    // Tags (no tenantId column on this join table)
    prisma.crmContactTag.deleteMany({
      where: {
        contactId
      }
    }),
    // Target zones (no tenantId column on this join table)
    prisma.crmContactTargetZone.deleteMany({
      where: {
        contactId
      }
    }),
    // Roles
    prisma.crmContactRole.deleteMany({
      where: {
        contactId,
        tenantId
      }
    }),
    // Activities
    prisma.crmActivity.deleteMany({
      where: {
        contactId,
        tenantId
      }
    }),
    // Deals
    prisma.crmDeal.deleteMany({
      where: {
        contactId,
        tenantId
      }
    }),
    // Finally, the contact itself (will cascade to many relations by FK)
    prisma.crmContact.deleteMany({
      where: {
        id: contactId,
        tenantId
      }
    })
  ]);

  logger.info('CRM contact deleted', {
    contactId,
    tenantId,
    email: existingContact.email
  });

  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'CRM_CONTACT_DELETED',
      entityType: CRM_ENTITY_TYPES.CONTACT,
      entityId: contactId,
      payload: {
        email: existingContact.email,
        firstName: existingContact.firstName,
        lastName: existingContact.lastName
      }
    });
  }
}

/**
 * Convert lead to client with roles
 * @param tenantId - Tenant ID
 * @param contactId - Contact ID
 * @param roles - Array of role types to assign
 * @param actorUserId - User performing conversion (for audit)
 * @returns Updated contact with roles
 */
export async function convertLeadToClient(tenantId: string, contactId: string, roles: string[], actorUserId?: string) {
  // Verify contact exists
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId
    },
    include: {
      roles: {
        where: {
          active: true
        }
      }
    }
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  // Allow conversion if contact is LEAD or ACTIVE_CLIENT with no active roles
  const hasActiveRoles = contact.roles && contact.roles.length > 0;
  if (
    contact.status !== CrmContactStatus.LEAD &&
    !(contact.status === CrmContactStatus.ACTIVE_CLIENT && !hasActiveRoles)
  ) {
    throw new Error('Contact cannot be converted. It must be a lead or an active client with no active roles.');
  }

  // Update contact status to ACTIVE_CLIENT
  const updatedContact = await prisma.crmContact.update({
    where: { id: contactId, tenantId },
    data: {
      status: CrmContactStatus.ACTIVE_CLIENT
    }
  });

  // Create role records for each role
  const roleRecords = [];
  for (const roleType of roles) {
    const role = await prisma.crmContactRole.create({
      data: {
        tenantId,
        contactId,
        role: roleType as any,
        active: true,
        startedAt: new Date()
      }
    });
    roleRecords.push(role);
  }

  logger.info('Contact converted to client', {
    contactId,
    tenantId,
    roles
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'CRM_CONTACT_CONVERTED',
      entityType: CRM_ENTITY_TYPES.CONTACT,
      entityId: contactId,
      payload: {
        previousStatus: CrmContactStatus.LEAD,
        newStatus: CrmContactStatus.ACTIVE_CLIENT,
        roles
      }
    });
  }

  return {
    ...updatedContact,
    roles: roleRecords
  };
}

/**
 * Add role to existing client
 * @param tenantId - Tenant ID
 * @param contactId - Contact ID
 * @param roleType - Role type to add
 * @param actorUserId - User adding role (for audit)
 * @returns Created role
 */
export async function addContactRole(tenantId: string, contactId: string, roleType: string, _actorUserId?: string) {
  // Verify contact exists
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId
    }
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  // Create role
  const role = await prisma.crmContactRole.create({
    data: {
      tenantId,
      contactId,
      role: roleType as any,
      active: true,
      startedAt: new Date()
    }
  });

  logger.info('Role added to contact', {
    contactId,
    tenantId,
    roleType
  });

  return role;
}

/**
 * Get contact roles
 * @param tenantId - Tenant ID
 * @param contactId - Contact ID
 * @returns Array of roles
 */
export async function getContactRoles(tenantId: string, contactId: string) {
  // Verify contact exists
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId
    }
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  return prisma.crmContactRole.findMany({
    where: {
      tenantId,
      contactId
    },
    orderBy: {
      startedAt: 'desc'
    }
  });
}

/**
 * Delete a contact role completely
 * @param tenantId - Tenant ID
 * @param contactId - Contact ID
 * @param roleId - Role ID to delete
 * @param actorUserId - User deleting role (for audit)
 * @returns Deleted role data
 */
export async function deactivateContactRole(tenantId: string, contactId: string, roleId: string, actorUserId?: string) {
  // Verify contact exists
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId
    },
    include: {
      roles: {
        where: {
          active: true
        }
      }
    }
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  // Verify role exists and belongs to contact
  const role = await prisma.crmContactRole.findFirst({
    where: {
      id: roleId,
      tenantId,
      contactId
    }
  });

  if (!role) {
    throw new Error('Role not found');
  }

  const roleType = role.role;

  // Delete role completely
  await prisma.crmContactRole.delete({
    where: { id: roleId, tenantId }
  });

  // Check if contact has any remaining active roles
  const remainingActiveRoles = contact.roles.filter(r => r.id !== roleId && r.active);

  // If no active roles remain, revert contact status to LEAD
  if (remainingActiveRoles.length === 0 && contact.status === CrmContactStatus.ACTIVE_CLIENT) {
    await prisma.crmContact.update({
      where: { id: contactId, tenantId },
      data: {
        status: CrmContactStatus.LEAD
      }
    });

    logger.info('Contact reverted to LEAD status (no active roles)', {
      contactId,
      tenantId
    });
  }

  logger.info('Role deleted', {
    contactId,
    tenantId,
    roleId,
    roleType
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'CRM_CONTACT_ROLE_DELETED',
      entityType: CRM_ENTITY_TYPES.CONTACT,
      entityId: contactId,
      payload: {
        roleId,
        roleType,
        revertedToLead: remainingActiveRoles.length === 0
      }
    });
  }

  return { id: roleId, role: roleType };
}

/**
 * Update contact roles - synchronize roles to match desired state
 * @param tenantId - Tenant ID
 * @param contactId - Contact ID
 * @param desiredRoles - Array of role types that should be active
 * @param actorUserId - User updating roles (for audit)
 * @returns Updated contact with roles
 */
export async function updateContactRoles(
  tenantId: string,
  contactId: string,
  desiredRoles: string[],
  actorUserId?: string
) {
  // Verify contact exists
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId
    },
    include: {
      roles: {
        where: {
          active: true
        }
      }
    }
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  // `desiredRoles` comes in as `string[]` from the request; comparing it
  // against Prisma's `CrmContactRoleType[]` needs both sides on the same type.
  const currentActiveRoles = contact.roles.map(r => r.role as string);
  const rolesToAdd = desiredRoles.filter(role => !currentActiveRoles.includes(role));
  const rolesToRemove = currentActiveRoles.filter(role => !desiredRoles.includes(role));

  // Remove roles that are no longer desired
  if (rolesToRemove.length > 0) {
    await prisma.crmContactRole.deleteMany({
      where: {
        tenantId,
        contactId,
        role: {
          in: rolesToRemove as any
        },
        active: true
      }
    });
  }

  // Add new roles
  const roleRecords = [];
  for (const roleType of rolesToAdd) {
    const role = await prisma.crmContactRole.create({
      data: {
        tenantId,
        contactId,
        role: roleType as any,
        active: true,
        startedAt: new Date()
      }
    });
    roleRecords.push(role);
  }

  // Update contact status based on whether there are active roles
  const finalActiveRoles = desiredRoles.length;
  let statusUpdated = false;

  if (finalActiveRoles === 0 && contact.status === CrmContactStatus.ACTIVE_CLIENT) {
    await prisma.crmContact.update({
      where: { id: contactId, tenantId },
      data: {
        status: CrmContactStatus.LEAD
      }
    });
    statusUpdated = true;
  } else if (finalActiveRoles > 0 && contact.status === CrmContactStatus.LEAD) {
    await prisma.crmContact.update({
      where: { id: contactId, tenantId },
      data: {
        status: CrmContactStatus.ACTIVE_CLIENT
      }
    });
    statusUpdated = true;
  }

  logger.info('Contact roles updated', {
    contactId,
    tenantId,
    rolesAdded: rolesToAdd,
    rolesRemoved: rolesToRemove,
    finalRoles: desiredRoles,
    statusUpdated
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'CRM_CONTACT_ROLES_UPDATED',
      entityType: CRM_ENTITY_TYPES.CONTACT,
      entityId: contactId,
      payload: {
        rolesAdded: rolesToAdd,
        rolesRemoved: rolesToRemove,
        finalRoles: desiredRoles,
        statusUpdated
      }
    });
  }

  // Get updated contact with all roles
  const updatedContact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId },
    include: {
      roles: {
        where: {
          active: true
        }
      }
    }
  });

  return updatedContact;
}
