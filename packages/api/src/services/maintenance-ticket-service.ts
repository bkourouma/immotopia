import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { CreateTicketRequest, UpdateTicketRequest, UpdateTenantTicketRequest } from '../types/maintenance-types';
import {
  MaintenanceTicketStatus,
  MaintenanceTicketCategory,
  MaintenanceTicketPriority,
  RentalLeaseStatus
} from '@prisma/client';
import { validateStatusTransition } from '../utils/maintenance-validators';
import { badRequest } from '../lib/errors';
import { sendTicketCreatedNotification, sendStatusChangeNotification } from './maintenance-notification-service';

async function ensureMaintenanceVendorMirrorFromServiceProvider(tenantId: string, vendorId: string) {
  const provider = await prisma.serviceProvider.findFirst({
    where: {
      id: vendorId,
      tenantId
    }
  });
  if (!provider) {
    return null;
  }

  const mirror = await prisma.maintenanceVendor.upsert({
    where: { id: vendorId },
    create: {
      id: provider.id,
      tenant_id: tenantId,
      name: provider.name,
      phone: provider.phone,
      email: provider.email,
      specialties: provider.specialty
        ? provider.specialty
            .split(',')
            .map(item => item.trim())
            .filter(item => item.length > 0)
        : [],
      is_active: true
    },
    update: {
      name: provider.name,
      phone: provider.phone,
      email: provider.email
    }
  });

  return { provider, mirror };
}

/**
 * Validate that tenant has active lease for property
 * @param tenantId - Tenant ID
 * @param propertyId - Property ID
 * @param tenantContactId - Tenant contact ID (optional, for validation)
 * @param leaseId - Lease ID (optional, if provided will validate this specific lease)
 * @returns Active lease if found, throws error if not
 */
async function validateActiveLease(
  tenantId: string,
  propertyId: string,
  tenantContactId?: string,
  leaseId?: string
): Promise<{ id: string; status: RentalLeaseStatus }> {
  // If leaseId is provided, validate that specific lease
  if (leaseId) {
    const lease = await prisma.rentalLease.findFirst({
      where: {
        id: leaseId,
        tenant_id: tenantId,
        property_id: propertyId,
        status: RentalLeaseStatus.ACTIVE
      }
    });

    if (!lease) {
      throw new Error(
        'Bail actif introuvable pour cette propriété. Vous devez avoir un bail actif pour créer un ticket de maintenance.'
      );
    }

    return { id: lease.id, status: lease.status };
  }

  // Otherwise, find any active lease for this property and tenant
  const lease = await prisma.rentalLease.findFirst({
    where: {
      tenant_id: tenantId,
      property_id: propertyId,
      status: RentalLeaseStatus.ACTIVE
    },
    orderBy: {
      start_date: 'desc'
    }
  });

  if (!lease) {
    throw new Error(
      'Bail actif introuvable pour cette propriété. Vous devez avoir un bail actif pour créer un ticket de maintenance.'
    );
  }

  // If tenantContactId is provided, verify the contact is linked to this lease
  if (tenantContactId) {
    // Check if contact is the primary renter or a co-renter
    const isPrimaryRenter =
      lease.primary_renter_client_id &&
      (await prisma.tenantClient.findFirst({
        where: {
          id: lease.primary_renter_client_id,
          tenantId: tenantId
        },
        include: {
          user: {
            include: {
              clientProfiles: {
                where: {
                  tenantId: tenantId
                }
              }
            }
          }
        }
      }));

    // Check co-renters
    const isCoRenter = await prisma.rentalLeaseCoRenter.findFirst({
      where: {
        lease_id: lease.id,
        tenant_id: tenantId
      },
      include: {
        renterClient: {
          include: {
            user: true
          }
        }
      }
    });

    // Note: This is a simplified check. In a real scenario, you'd need to link
    // CrmContact to TenantClient to verify the contact is the renter
    // For now, we'll just check that a lease exists
    void isPrimaryRenter;
    void isCoRenter;
  }

  return { id: lease.id, status: lease.status };
}

/**
 * Create a new maintenance ticket
 * @param tenantId - Tenant ID (required for isolation)
 * @param data - Ticket creation data
 * @param actorUserId - User creating the ticket (optional)
 * @param actorContactId - Contact creating the ticket (optional)
 * @returns Created ticket
 */
export async function createTicket(
  tenantId: string,
  data: CreateTicketRequest,
  actorUserId?: string,
  actorContactId?: string
) {
  // Validate active lease for property
  await validateActiveLease(tenantId, data.propertyId, actorContactId, data.leaseId);

  // Ticket and its first history entry are one unit of work: a failure between
  // the two used to leave a ticket with no status history.
  const ticket = await prisma.$transaction(async tx => {
    const created = await tx.maintenanceTicket.create({
      data: {
        tenant_id: tenantId,
        property_id: data.propertyId,
        lease_id: data.leaseId || null,
        tenant_contact_id: actorContactId || null,
        created_by_user_id: actorUserId || null,
        created_by_contact_id: actorContactId || null,
        title: data.title,
        category: data.category as MaintenanceTicketCategory,
        priority: data.priority as MaintenanceTicketPriority,
        description: data.description,
        location_details: data.locationDetails || null,
        status: MaintenanceTicketStatus.DECLARED,
        declared_at: new Date()
      },
      include: {
        property: {
          select: {
            id: true,
            internalReference: true,
            address: true,
            title: true
          }
        },
        lease: {
          select: {
            id: true,
            lease_number: true
          }
        },
        tenantContact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    await tx.maintenanceTicketStatusHistory.create({
      data: {
        tenant_id: tenantId,
        ticket_id: created.id,
        from_status: null,
        to_status: MaintenanceTicketStatus.DECLARED,
        changed_by_user_id: actorUserId || null,
        note: 'Ticket créé'
      }
    });

    return created;
  });

  logger.info('Maintenance ticket created', {
    ticketId: ticket.id,
    tenantId,
    propertyId: data.propertyId,
    category: data.category,
    priority: data.priority
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'MAINTENANCE_TICKET_CREATED',
      entityType: 'MaintenanceTicket',
      entityId: ticket.id,
      payload: {
        propertyId: data.propertyId,
        category: data.category,
        priority: data.priority
      }
    });
  }

  // Send notification emails via email_notification_configs (Communication > Notifications email).
  sendTicketCreatedNotification(tenantId, ticket.id).catch(err => {
    logger.error('Failed to send ticket created notification', {
      ticketId: ticket.id,
      tenantId,
      error: err instanceof Error ? err.message : String(err)
    });
  });

  return ticket;
}

/**
 * Get tickets for a tenant (filtered by contact/lease)
 * @param tenantId - Tenant ID
 * @param filters - Filter options (status, propertyId, tenantContactId, leaseId)
 * @param pagination - Pagination options (page, limit)
 * @returns List of tickets
 */
export async function getTenantTickets(
  tenantId: string,
  filters?: {
    status?: MaintenanceTicketStatus;
    propertyId?: string;
    tenantContactId?: string;
    leaseId?: string;
  },
  pagination?: {
    page?: number;
    limit?: number;
  }
) {
  const page = pagination?.page || 1;
  const limit = Math.min(pagination?.limit || 20, 100); // Max 100 per page
  const skip = (page - 1) * limit;

  const where: any = {
    tenant_id: tenantId
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.propertyId) {
    where.property_id = filters.propertyId;
  }

  if (filters?.tenantContactId) {
    where.tenant_contact_id = filters.tenantContactId;
  }

  if (filters?.leaseId) {
    where.lease_id = filters.leaseId;
  }

  const [tickets, total] = await Promise.all([
    prisma.maintenanceTicket.findMany({
      where,
      include: {
        property: {
          select: {
            id: true,
            internalReference: true,
            address: true,
            title: true
          }
        },
        assignedVendor: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      skip,
      take: limit
    }),
    prisma.maintenanceTicket.count({ where })
  ]);

  return {
    tickets,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get ticket by ID with full details
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @param tenantContactId - Tenant contact ID (for access validation)
 * @returns Ticket with attachments, comments, and status history
 */
export async function getTicketById(tenantId: string, ticketId: string, tenantContactId?: string) {
  const ticket = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenant_id: tenantId,
      // If tenantContactId provided, ensure ticket belongs to this contact
      ...(tenantContactId ? { tenant_contact_id: tenantContactId } : {})
    },
    include: {
      property: {
        select: {
          id: true,
          internalReference: true,
          address: true,
          title: true
        }
      },
      lease: {
        select: {
          id: true,
          lease_number: true
        }
      },
      tenantContact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      },
      assignedVendor: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          specialties: true
        }
      },
      assignedToUser: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      attachments: {
        orderBy: {
          created_at: 'asc'
        }
      },
      comments: {
        include: {
          authorUser: {
            select: {
              id: true,
              email: true,
              fullName: true
            }
          },
          authorContact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: {
          created_at: 'asc'
        }
      },
      statusHistory: {
        include: {
          changedByUser: {
            select: {
              id: true,
              email: true,
              fullName: true
            }
          }
        },
        orderBy: {
          changed_at: 'asc'
        }
      }
    }
  });

  if (!ticket) {
    throw new Error('Ticket introuvable');
  }

  return ticket;
}

/**
 * Cancel a ticket
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @param tenantContactId - Tenant contact ID (for ownership validation)
 * @param actorUserId - User canceling (optional)
 * @returns Updated ticket
 */
export async function cancelTicket(tenantId: string, ticketId: string, tenantContactId?: string, actorUserId?: string) {
  // Get existing ticket
  const existingTicket = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenant_id: tenantId,
      // If tenantContactId provided, ensure ticket belongs to this contact
      ...(tenantContactId ? { tenant_contact_id: tenantContactId } : {})
    }
  });

  if (!existingTicket) {
    throw new Error('Ticket introuvable');
  }

  // Validate status can be canceled
  if (existingTicket.status === MaintenanceTicketStatus.CANCELED) {
    throw new Error('Ce ticket est déjà annulé');
  }

  if (existingTicket.status === MaintenanceTicketStatus.RESOLVED) {
    throw new Error("Impossible d'annuler un ticket résolu");
  }

  // Validate status transition
  const transition = validateStatusTransition(existingTicket.status, MaintenanceTicketStatus.CANCELED);

  if (!transition.isValid) {
    // `badRequest` porte le statut HTTP avec l'erreur. Le controleur classait
    // les refus au mot present dans le message (« invalide ») : un message
    // reecrit en francais courant devenait alors un 500 « Echec de la mise a
    // jour du ticket », et la raison du refus n'arrivait plus a l'ecran.
    throw badRequest(transition.error || 'Cette étape du ticket ne peut pas être atteinte depuis son statut actuel.');
  }

  // Status change and its history entry must commit together.
  const ticket = await prisma.$transaction(async tx => {
    const updated = await tx.maintenanceTicket.update({
      where: {
        id: ticketId
      },
      data: {
        status: MaintenanceTicketStatus.CANCELED,
        canceled_at: new Date()
      },
      include: {
        property: {
          select: {
            id: true,
            internalReference: true,
            address: true
          }
        }
      }
    });

    await tx.maintenanceTicketStatusHistory.create({
      data: {
        tenant_id: tenantId,
        ticket_id: updated.id,
        from_status: existingTicket.status,
        to_status: MaintenanceTicketStatus.CANCELED,
        changed_by_user_id: actorUserId || null,
        note: 'Ticket annulé par le locataire'
      }
    });

    return updated;
  });

  logger.info('Maintenance ticket canceled', {
    ticketId: ticket.id,
    tenantId,
    previousStatus: existingTicket.status
  });

  return ticket;
}

/**
 * Delete ticket permanently (hard delete)
 * Only allowed if ticket status is DECLARED or CANCELED
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @param tenantContactId - Tenant contact ID (for ownership validation)
 * @param actorUserId - User deleting (optional)
 */
export async function deleteTicket(
  tenantId: string,
  ticketId: string,
  tenantContactId?: string,
  _actorUserId?: string
): Promise<void> {
  // Get existing ticket
  const existingTicket = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenant_id: tenantId,
      // If tenantContactId provided, ensure ticket belongs to this contact
      ...(tenantContactId ? { tenant_contact_id: tenantContactId } : {})
    },
    include: {
      attachments: true
    }
  });

  if (!existingTicket) {
    throw new Error('Ticket introuvable');
  }

  // Only allow deletion if ticket is DECLARED or CANCELED
  if (
    existingTicket.status !== MaintenanceTicketStatus.DECLARED &&
    existingTicket.status !== MaintenanceTicketStatus.CANCELED
  ) {
    throw new Error('Seuls les tickets avec le statut "Déclaré" ou "Annulé" peuvent être supprimés définitivement');
  }

  // Log before deletion for audit
  logger.info('Maintenance ticket being deleted (hard delete)', {
    ticketId: existingTicket.id,
    tenantId,
    status: existingTicket.status,
    title: existingTicket.title
  });

  // Delete physical files if they exist
  // Files are stored in uploads/maintenance/<tenantId>/<ticketId>/
  if (existingTicket.attachments && existingTicket.attachments.length > 0) {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Determine project root (similar to maintenance-attachment-service)
    const cwd = process.cwd();
    const projectRoot =
      path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
        ? path.resolve(cwd, '..', '..')
        : cwd;

    for (const attachment of existingTicket.attachments) {
      try {
        // Extract file path from file_url
        // file_url format: /uploads/maintenance/<tenantId>/<ticketId>/<fileName>
        if (attachment.file_url.startsWith('/uploads/maintenance/')) {
          // Remove leading slash and join with project root
          const relativePath = attachment.file_url.substring(1); // Remove leading '/'
          const filePath = path.join(projectRoot, relativePath);

          try {
            await fs.unlink(filePath);
            logger.info('Deleted attachment file', { filePath, attachmentId: attachment.id });
          } catch (fileError: any) {
            // Log but don't fail if file doesn't exist
            if (fileError.code !== 'ENOENT') {
              logger.warn('Failed to delete attachment file', { filePath, error: fileError.message });
            }
          }
        }
      } catch (error) {
        logger.warn('Error processing attachment file deletion', { attachmentId: attachment.id, error });
      }
    }

    // Try to remove the directory if it's empty
    try {
      const uploadDir = path.join(projectRoot, 'uploads', 'maintenance', tenantId, ticketId);
      try {
        await fs.rmdir(uploadDir);
        logger.info('Removed empty attachment directory', { uploadDir });
      } catch (dirError: any) {
        // Directory not empty or doesn't exist - that's fine
        if (dirError.code !== 'ENOTEMPTY' && dirError.code !== 'ENOENT') {
          logger.warn('Failed to remove attachment directory', { uploadDir, error: dirError.message });
        }
      }
    } catch (error) {
      logger.warn('Error removing attachment directory', { error });
    }
  }

  // Hard delete - Prisma will cascade delete related records (attachments, comments, statusHistory)
  // based on the schema's onDelete: Cascade relationships
  await prisma.maintenanceTicket.delete({
    where: { id: ticketId }
  });

  logger.info('Maintenance ticket deleted successfully', {
    ticketId: existingTicket.id,
    tenantId
  });
}

/**
 * Update ticket by tenant (title, description, category, priority, locationDetails)
 * Only allowed if ticket status is DECLARED
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @param data - Update data
 * @param tenantContactId - Tenant contact ID (optional, for validation)
 * @param actorUserId - User updating (optional)
 * @returns Updated ticket
 */
export async function updateTenantTicket(
  tenantId: string,
  ticketId: string,
  data: UpdateTenantTicketRequest,
  tenantContactId?: string,
  actorUserId?: string
) {
  // Get existing ticket
  const existingTicket = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenant_id: tenantId,
      // If tenantContactId provided, ensure ticket belongs to this contact
      ...(tenantContactId ? { tenant_contact_id: tenantContactId } : {})
    }
  });

  if (!existingTicket) {
    throw new Error('Ticket introuvable');
  }

  // Only allow updates if ticket is in DECLARED status
  if (existingTicket.status !== MaintenanceTicketStatus.DECLARED) {
    throw new Error('Seuls les tickets avec le statut "Déclaré" peuvent être modifiés');
  }

  // Prepare update data
  const updateData: any = {};

  if (data.title !== undefined) {
    updateData.title = data.title;
  }

  if (data.description !== undefined) {
    updateData.description = data.description;
  }

  if (data.category !== undefined) {
    updateData.category = data.category as MaintenanceTicketCategory;
  }

  if (data.priority !== undefined) {
    updateData.priority = data.priority as MaintenanceTicketPriority;
  }

  if (data.locationDetails !== undefined) {
    updateData.location_details = data.locationDetails;
  }

  // Check if there are any fields to update
  if (Object.keys(updateData).length === 0) {
    throw new Error('Aucune modification à apporter');
  }

  // Update ticket
  const ticket = await prisma.maintenanceTicket.update({
    where: {
      id: ticketId
    },
    data: updateData,
    include: {
      property: {
        select: {
          id: true,
          internalReference: true,
          address: true
        }
      },
      tenantContact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  });

  logger.info('Maintenance ticket updated by tenant', {
    ticketId: ticket.id,
    tenantId,
    actorUserId,
    updatedFields: Object.keys(updateData)
  });

  return ticket;
}

/**
 * Get all tickets for property managers (with advanced filters)
 * @param tenantId - Tenant ID
 * @param filters - Filter options (propertyId, status, priority, assignedVendorId, dateFrom, dateTo)
 * @param pagination - Pagination options (page, limit)
 * @returns List of tickets
 */
export async function getAllTickets(
  tenantId: string,
  filters?: {
    propertyId?: string;
    status?: MaintenanceTicketStatus;
    priority?: MaintenanceTicketPriority;
    assignedVendorId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  },
  pagination?: {
    page?: number;
    limit?: number;
  }
) {
  const page = pagination?.page || 1;
  const limit = Math.min(pagination?.limit || 20, 100); // Max 100 per page
  const skip = (page - 1) * limit;

  const where: any = {
    tenant_id: tenantId
  };

  if (filters?.propertyId) {
    where.property_id = filters.propertyId;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.priority) {
    where.priority = filters.priority;
  }

  if (filters?.assignedVendorId) {
    where.assigned_vendor_id = filters.assignedVendorId;
  }

  if (filters?.dateFrom || filters?.dateTo) {
    where.created_at = {};
    if (filters.dateFrom) {
      where.created_at.gte = filters.dateFrom;
    }
    if (filters.dateTo) {
      where.created_at.lte = filters.dateTo;
    }
  }

  const [tickets, total] = await Promise.all([
    prisma.maintenanceTicket.findMany({
      where,
      include: {
        property: {
          select: {
            id: true,
            internalReference: true,
            address: true,
            title: true
          }
        },
        lease: {
          select: {
            id: true,
            lease_number: true
          }
        },
        tenantContact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        assignedVendor: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true
          }
        },
        assignedToUser: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      skip,
      take: limit
    }),
    prisma.maintenanceTicket.count({ where })
  ]);

  return {
    tickets,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Update ticket status with workflow validation
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @param newStatus - New status
 * @param actorUserId - User updating the status
 * @param note - Optional note for status history
 * @returns Updated ticket
 */
export async function updateTicketStatus(
  tenantId: string,
  ticketId: string,
  newStatus: MaintenanceTicketStatus,
  actorUserId: string,
  note?: string
) {
  // Get existing ticket
  const existingTicket = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenant_id: tenantId
    }
  });

  if (!existingTicket) {
    throw new Error('Ticket introuvable');
  }

  // Validate status transition
  const hasAssignment = !!(existingTicket.assigned_vendor_id || existingTicket.assigned_to_user_id);
  const transition = validateStatusTransition(existingTicket.status, newStatus, hasAssignment);

  if (!transition.isValid) {
    // `badRequest` porte le statut HTTP avec l'erreur. Le controleur classait
    // les refus au mot present dans le message (« invalide ») : un message
    // reecrit en francais courant devenait alors un 500 « Echec de la mise a
    // jour du ticket », et la raison du refus n'arrivait plus a l'ecran.
    throw badRequest(transition.error || 'Cette étape du ticket ne peut pas être atteinte depuis son statut actuel.');
  }

  // Prepare update data with timestamps
  const updateData: any = {
    status: newStatus
  };

  // Update timestamps based on status
  if (newStatus === MaintenanceTicketStatus.IN_PROGRESS && !existingTicket.in_progress_at) {
    updateData.in_progress_at = new Date();
  }

  if (newStatus === MaintenanceTicketStatus.ASSIGNED && !existingTicket.assigned_at) {
    updateData.assigned_at = new Date();
  }

  if (newStatus === MaintenanceTicketStatus.RESOLVED && !existingTicket.resolved_at) {
    updateData.resolved_at = new Date();
  }

  // Status change and its history entry must commit together.
  const ticket = await prisma.$transaction(async tx => {
    const updated = await tx.maintenanceTicket.update({
      where: {
        id: ticketId
      },
      data: updateData,
      include: {
        property: {
          select: {
            id: true,
            internalReference: true,
            address: true
          }
        },
        tenantContact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    await tx.maintenanceTicketStatusHistory.create({
      data: {
        tenant_id: tenantId,
        ticket_id: updated.id,
        from_status: existingTicket.status,
        to_status: newStatus,
        changed_by_user_id: actorUserId,
        note: note || null
      }
    });

    return updated;
  });

  logger.info('Maintenance ticket status updated', {
    ticketId: ticket.id,
    tenantId,
    fromStatus: existingTicket.status,
    toStatus: newStatus,
    actorUserId
  });

  sendStatusChangeNotification(tenantId, ticketId, existingTicket.status, newStatus).catch(err => {
    logger.error('Failed to send status change notification', {
      ticketId,
      tenantId,
      error: err instanceof Error ? err.message : String(err)
    });
  });

  // Les emails de changement de statut sont envoyés uniquement via maintenance-notification-service
  // (config "Notifications email"), pas via triggerEvent (Règles/Templates).

  return ticket;
}

/**
 * Assign vendor to ticket
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @param vendorId - Vendor ID
 * @param actorUserId - User assigning vendor
 * @returns Updated ticket
 */
export async function assignVendor(tenantId: string, ticketId: string, vendorId: string, actorUserId: string) {
  // Verify shared provider exists and keep maintenance mirror in sync.
  const vendorBundle = await ensureMaintenanceVendorMirrorFromServiceProvider(tenantId, vendorId);
  if (!vendorBundle) {
    throw new Error('Prestataire introuvable ou inactif');
  }
  if (vendorBundle.mirror.is_active === false) {
    throw new Error('Prestataire introuvable ou inactif');
  }

  // Get existing ticket
  const existingTicket = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenant_id: tenantId
    }
  });

  if (!existingTicket) {
    throw new Error('Ticket introuvable');
  }

  // Update ticket with vendor assignment
  const ticket = await prisma.maintenanceTicket.update({
    where: {
      id: ticketId
    },
    data: {
      assigned_vendor_id: vendorId,
      assigned_at: existingTicket.assigned_at || new Date()
    },
    include: {
      property: {
        select: {
          id: true,
          internalReference: true,
          address: true
        }
      },
      assignedVendor: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          specialties: true
        }
      }
    }
  });

  // If ticket is IN_PROGRESS, automatically transition to ASSIGNED
  if (existingTicket.status === MaintenanceTicketStatus.IN_PROGRESS) {
    await updateTicketStatus(tenantId, ticketId, MaintenanceTicketStatus.ASSIGNED, actorUserId, 'Prestataire assigné');
  }

  logger.info('Vendor assigned to ticket', {
    ticketId: ticket.id,
    tenantId,
    vendorId,
    actorUserId
  });

  return ticket;
}

/**
 * Update ticket (priority, resolution notes, vendor assignment)
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @param data - Update data
 * @param actorUserId - User updating
 * @returns Updated ticket
 */
export async function updateTicket(tenantId: string, ticketId: string, data: UpdateTicketRequest, actorUserId: string) {
  // Get existing ticket
  const existingTicket = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenant_id: tenantId
    }
  });

  if (!existingTicket) {
    throw new Error('Ticket introuvable');
  }

  // Prepare update data
  const updateData: any = {};

  if (data.priority !== undefined) {
    updateData.priority = data.priority as MaintenanceTicketPriority;
  }

  if (data.resolutionNotes !== undefined) {
    updateData.resolution_notes = data.resolutionNotes;
  }

  if (data.assignedVendorId !== undefined) {
    if (data.assignedVendorId) {
      // Validate shared provider exists and keep maintenance mirror in sync.
      const vendorBundle = await ensureMaintenanceVendorMirrorFromServiceProvider(tenantId, data.assignedVendorId);
      if (!vendorBundle) {
        throw new Error('Prestataire introuvable ou inactif');
      }
      if (vendorBundle.mirror.is_active === false) {
        throw new Error('Prestataire introuvable ou inactif');
      }

      updateData.assigned_vendor_id = data.assignedVendorId;
      updateData.assigned_at = existingTicket.assigned_at || new Date();
    } else {
      // Remove vendor assignment
      updateData.assigned_vendor_id = null;
    }
  }

  if (data.assignedToUserId !== undefined) {
    updateData.assigned_to_user_id = data.assignedToUserId || null;
  }

  // Handle status update if provided
  if (data.status && data.status !== existingTicket.status) {
    // Use updateTicketStatus for status changes to ensure workflow validation
    await updateTicketStatus(tenantId, ticketId, data.status as MaintenanceTicketStatus, actorUserId);
  }

  // Update ticket (only if there are other fields to update)
  if (Object.keys(updateData).length > 0) {
    const ticket = await prisma.maintenanceTicket.update({
      where: {
        id: ticketId
      },
      data: updateData,
      include: {
        property: {
          select: {
            id: true,
            internalReference: true,
            address: true
          }
        },
        assignedVendor: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            specialties: true
          }
        },
        assignedToUser: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      }
    });

    logger.info('Maintenance ticket updated', {
      ticketId: ticket.id,
      tenantId,
      actorUserId,
      updatedFields: Object.keys(updateData)
    });

    return ticket;
  }

  // If only status was updated, fetch the updated ticket
  return await getTicketById(tenantId, ticketId);
}

/**
 * Get status history for a ticket
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @returns List of status history entries ordered by changed_at
 */
export async function getStatusHistory(tenantId: string, ticketId: string) {
  // Verify ticket exists and belongs to tenant
  const ticket = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenant_id: tenantId
    }
  });

  if (!ticket) {
    throw new Error('Ticket introuvable');
  }

  // Get all status history entries
  const history = await prisma.maintenanceTicketStatusHistory.findMany({
    where: {
      ticket_id: ticketId,
      tenant_id: tenantId
    },
    include: {
      changedByUser: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    },
    orderBy: {
      changed_at: 'asc'
    }
  });

  return history;
}

/**
 * Get maintenance history for a property
 * @param tenantId - Tenant ID
 * @param propertyId - Property ID
 * @param filters - Filter options (status, category)
 * @returns List of tickets ordered by created_at desc
 */
export async function getPropertyMaintenanceHistory(
  tenantId: string,
  propertyId: string,
  filters?: {
    status?: MaintenanceTicketStatus;
    category?: MaintenanceTicketCategory;
  }
) {
  // Verify property exists and belongs to tenant
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      tenantId: tenantId
    }
  });

  if (!property) {
    throw new Error('Propriété introuvable');
  }

  const where: any = {
    tenant_id: tenantId,
    property_id: propertyId
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.category) {
    where.category = filters.category;
  }

  const tickets = await prisma.maintenanceTicket.findMany({
    where,
    include: {
      assignedVendor: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true
        }
      },
      assignedToUser: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      tenantContact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    },
    orderBy: {
      created_at: 'desc'
    }
  });

  return tickets;
}
