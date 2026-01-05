import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { CRM_ENTITY_TYPES } from '../types/audit-types';
import { CreateContactRequest, UpdateContactRequest, ContactFilters, ContactDetail } from '../types/crm-types';
import { CrmContactStatus } from '@prisma/client';

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
      // Real Estate Project Intent (JSON)
      projectIntentJson: data.projectIntent ? JSON.parse(JSON.stringify(data.projectIntent)) : null,
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
      // Consents & Compliance
      consentMarketing: data.consentMarketing || false,
      consentWhatsapp: data.consentWhatsapp || false,
      consentEmail: data.consentEmail || false,
      consentDate: (data.consentMarketing || data.consentWhatsapp || data.consentEmail) ? new Date() : null,
      consentSource: data.consentSource || null,
      // Internal Notes
      internalNotes: data.internalNotes || null,
      // Legacy fields (backward compatibility)
      numeroPieceId: data.numeroPieceId || null,
      fonction: data.fonction || null,
      salaire: data.salaire !== undefined ? data.salaire : null,
      // Target zones (many-to-many)
      targetZones: data.targetZoneIds && data.targetZoneIds.length > 0 ? {
        create: data.targetZoneIds.map(communeId => ({
          communeId
        }))
      } : undefined
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
  // Map phone_primary to phone for backward compatibility
  const transformedContact: ContactDetail = {
    ...contact,
    phone: contact.phonePrimary || null, // Backward compatibility
    recentActivities: contact.activities,
    tags: contact.tags.map(ct => ({
      ...ct.tag,
      CrmContactTag: ct
    }))
  };

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

  // Handle hasUpcomingAppointmentOrActivity filter
  if (filters.hasUpcomingAppointmentOrActivity !== undefined) {
    const now = new Date();
    if (filters.hasUpcomingAppointmentOrActivity) {
      // Contact must have either:
      // 1. An appointment in the future with status SCHEDULED or CONFIRMED
      // 2. An activity with nextActionAt in the future
      andConditions.push({
        OR: [
          {
            appointments: {
              some: {
                startAt: {
                  gte: now
                },
                status: {
                  in: ['SCHEDULED', 'CONFIRMED']
                }
              }
            }
          },
          {
            activities: {
              some: {
                nextActionAt: {
                  gte: now,
                  not: null
                }
              }
            }
          }
        ]
      });
    } else {
      // Contact must NOT have upcoming appointments AND must NOT have upcoming activities
      // Both conditions must be true (AND)
      andConditions.push({
        AND: [
          {
            appointments: {
              none: {
                startAt: {
                  gte: now
                },
                status: {
                  in: ['SCHEDULED', 'CONFIRMED']
                }
              }
            }
          },
          {
            activities: {
              none: {
                nextActionAt: {
                  gte: now,
                  not: null
                }
              }
            }
          }
        ]
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
  updateField('identityDocumentExpiry', data.identityDocumentExpiry ? new Date(data.identityDocumentExpiry) : null, existingContact.identityDocumentExpiry);
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
  const phonePrimary = data.phonePrimary !== undefined ? data.phonePrimary : (data.phone !== undefined ? data.phone : undefined);
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
      create: data.targetZoneIds && data.targetZoneIds.length > 0 ? data.targetZoneIds.map(communeId => ({
        communeId
      })) : []
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
    const hasConsent = (data.consentMarketing || data.consentWhatsapp || data.consentEmail) || false;
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
    where: { id: contactId },
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
 * Convert lead to client with roles
 * @param tenantId - Tenant ID
 * @param contactId - Contact ID
 * @param roles - Array of role types to assign
 * @param actorUserId - User performing conversion (for audit)
 * @returns Updated contact with roles
 */
export async function convertLeadToClient(tenantId: string, contactId: string, roles: string[], actorUserId?: string) {
  // Verify contact exists and is a lead
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId
    },
    include: {
      roles: true
    }
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  if (contact.status !== CrmContactStatus.LEAD) {
    throw new Error('Contact is not a lead');
  }

  // Update contact status to ACTIVE_CLIENT
  const updatedContact = await prisma.crmContact.update({
    where: { id: contactId },
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
export async function addContactRole(tenantId: string, contactId: string, roleType: string, actorUserId?: string) {
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
