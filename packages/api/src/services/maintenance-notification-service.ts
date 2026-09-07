import { logger } from '../utils/logger';
import { prisma } from '../utils/database';
import { getPropertyDisplayLabel } from '../utils/property-display';
import { MaintenanceTicketStatus } from '@prisma/client';

/**
 * Get status label in French
 */
function getStatusLabel(status: MaintenanceTicketStatus): string {
  const labels: Record<MaintenanceTicketStatus, string> = {
    DECLARED: 'Déclaré',
    IN_PROGRESS: 'En cours',
    ASSIGNED: 'Assigné',
    RESOLVED: 'Résolu',
    CANCELED: 'Annulé'
  };
  return labels[status] || status;
}

/**
 * Send notification email to agency admins when ticket is created (en dur, like payment declaration).
 * Targets TENANT_ADMIN users, fallback to tenant contactEmail.
 */
export async function sendTicketCreatedNotification(tenantId: string, ticketId: string): Promise<void> {
  try {
    logger.info('sendTicketCreatedNotification called', { tenantId, ticketId });
    const { getEmailNotificationConfig } = await import('./email-notification-config-service');
    const configAgency = await getEmailNotificationConfig(tenantId, 'MAINTENANCE_TICKET_CREATED_AGENCY');

    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id: ticketId, tenant_id: tenantId },
      include: {
        property: {
          select: {
            id: true,
            internalReference: true,
            address: true,
            title: true,
            owner: { select: { id: true, email: true, fullName: true } },
            containerParent: { select: { title: true } }
          }
        },
        tenantContact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            whatsappNumber: true,
            phonePrimary: true,
            consentWhatsapp: true
          }
        },
        createdByUser: {
          select: { fullName: true }
        },
        lease: {
          select: {
            primary_renter_client_id: true,
            owner_client_id: true,
            primaryRenter: {
              select: {
                id: true,
                user: { select: { fullName: true, email: true } }
              }
            },
            ownerClient: {
              select: {
                id: true,
                user: { select: { id: true, email: true, fullName: true } }
              }
            }
          }
        }
      }
    });

    if (!ticket) {
      logger.warn('Ticket not found for notification', { ticketId, tenantId });
      return;
    }

    const propertyReference = getPropertyDisplayLabel(ticket.property);

    // Récupérer le nom exact du locataire (créateur du ticket)
    let renterName: string | undefined;
    if (ticket.tenantContact?.firstName || ticket.tenantContact?.lastName) {
      renterName = [ticket.tenantContact.firstName, ticket.tenantContact.lastName].filter(Boolean).join(' ');
    } else if (ticket.createdByUser?.fullName) {
      renterName = ticket.createdByUser.fullName;
    } else if (ticket.created_by_contact_id) {
      // Portail locataire : created_by_contact_id peut être TenantClient.id
      const tc = await prisma.tenantClient.findUnique({
        where: { id: ticket.created_by_contact_id },
        select: { user: { select: { fullName: true } } }
      });
      renterName = tc?.user?.fullName || undefined;
    }
    if (!renterName && ticket.lease?.primaryRenter?.user?.fullName) {
      renterName = ticket.lease.primaryRenter.user.fullName;
    }

    const ticketCreatedAtFormatted = ticket.created_at
      ? new Date(ticket.created_at).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';

    const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
    const targetPath = `/tenant/${tenantId}/admin/maintenance/tickets/${ticketId}`;
    const validationUrl = `${baseUrl}/login?redirect=${encodeURIComponent(targetPath)}`;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true }
    });
    const agencyName = tenant?.name || undefined;

    type AgencyUser = { id: string; email: string; fullName: string | null };
    let users: AgencyUser[] = [];
    const tenantAdminRole = await prisma.role.findUnique({
      where: { key: 'TENANT_ADMIN' },
      select: { id: true }
    });

    if (tenantAdminRole) {
      const adminUserRoles = await prisma.userRole.findMany({
        where: { tenantId, roleId: tenantAdminRole.id },
        select: { userId: true }
      });
      const adminUserIds = [...new Set(adminUserRoles.map(r => r.userId))];
      if (adminUserIds.length > 0) {
        users = await prisma.user.findMany({
          where: { id: { in: adminUserIds }, isActive: true },
          select: { id: true, email: true, fullName: true }
        });
      }
    }

    if (users.length === 0) {
      const t = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { contactEmail: true, name: true }
      });
      if (t?.contactEmail) {
        const byEmail = await prisma.user.findFirst({
          where: { email: t.contactEmail, isActive: true },
          select: { id: true, email: true, fullName: true }
        });
        if (byEmail) users = [byEmail];
        else users = [{ id: '', email: t.contactEmail, fullName: t.name }];
        logger.info('Ticket created: using tenant contactEmail (no TENANT_ADMIN)', { tenantId, ticketId });
      }
    }

    // Fallback: users with Membership in tenant (ACTIVE)
    if (users.length === 0) {
      const memberships = await prisma.membership.findMany({
        where: { tenantId, status: 'ACTIVE' },
        select: { userId: true }
      });
      const memberIds = [...new Set(memberships.map(m => m.userId))];
      if (memberIds.length > 0) {
        const members = await prisma.user.findMany({
          where: { id: { in: memberIds }, isActive: true },
          select: { id: true, email: true, fullName: true }
        });
        if (members.length > 0) {
          users = members;
          logger.info('Ticket created: using tenant members (fallback)', {
            tenantId,
            ticketId,
            memberCount: users.length
          });
        }
      }
    }

    // Fallback: tout utilisateur ayant un rôle pour ce tenant (UserRole.tenantId)
    if (users.length === 0) {
      const anyRoleAssignments = await prisma.userRole.findMany({
        where: { tenantId },
        select: { userId: true }
      });
      const userIds = [...new Set(anyRoleAssignments.map(r => r.userId))];
      if (userIds.length > 0) {
        const withRole = await prisma.user.findMany({
          where: { id: { in: userIds }, isActive: true },
          select: { id: true, email: true, fullName: true }
        });
        if (withRole.length > 0) {
          users = withRole;
          logger.info('Ticket created: using users with role for tenant (fallback)', {
            tenantId,
            ticketId,
            count: users.length
          });
        }
      }
    }

    const { emailService } = await import('./email-service');
    const notifiedEmails = new Set<string>();

    const portalPath = '/tenant/maintenance';
    const portalUrl = `${baseUrl}/login?redirect=${encodeURIComponent(portalPath)}`;

    // 1) Agence (MAINTENANCE_TICKET_CREATED_AGENCY)
    if (configAgency.enabled) {
      if (users.length === 0) {
        logger.warn(
          'No agency admins to notify for ticket created (no TENANT_ADMIN, no contactEmail, no members, no UserRole for tenant)',
          {
            tenantId,
            ticketId
          }
        );
      } else {
        logger.info('Ticket created: sending agency notifications', {
          tenantId,
          ticketId,
          recipientCount: users.length
        });
        for (const u of users) {
          if (u.email && !notifiedEmails.has(u.email.toLowerCase())) {
            try {
              await emailService.sendMaintenanceTicketCreatedToAgency(
                u.email,
                u.fullName || 'Utilisateur',
                ticket.title,
                ticketId,
                propertyReference,
                validationUrl,
                {
                  agencyName,
                  renterName,
                  ticketCreatedAt: ticketCreatedAtFormatted,
                  templateOverrides:
                    configAgency.subjectOverride || configAgency.bodyHtmlOverride
                      ? {
                          subject: configAgency.subjectOverride ?? undefined,
                          bodyHtml: configAgency.bodyHtmlOverride ?? undefined
                        }
                      : undefined
                }
              );
              notifiedEmails.add(u.email.toLowerCase());
              logger.info('Ticket created notification sent to agency admin', { ticketId, email: u.email });
            } catch (emailErr: any) {
              logger.error('Failed to send ticket created notification', {
                ticketId,
                email: u.email,
                error: emailErr?.message
              });
            }
          }
        }
      }
    } else {
      logger.info('Notification MAINTENANCE_TICKET_CREATED_AGENCY disabled', { tenantId, ticketId });
    }

    // WhatsApp agence : envoyer aux admins qui ont un contact CRM (même email) avec consentement + numéro
    const configWhatsappAgency = await (
      await import('./whatsapp-notification-config-service')
    ).getWhatsappNotificationConfig(tenantId, 'MAINTENANCE_TICKET_CREATED_AGENCY');
    if (configWhatsappAgency.enabled && users.length > 0) {
      const { getCrmContactIdForWhatsApp } = await import('./whatsapp-contact-resolve');
      const { sendWhatsappNotification } = await import('./whatsapp-notification-send-service');
      const agencyVars = {
        agencyUserName: '',
        renterName: renterName || 'Locataire',
        ticketTitle: ticket.title,
        propertyReference,
        ticketCreatedAt: ticketCreatedAtFormatted,
        agencyName: agencyName || "L'agence"
      };
      for (const u of users) {
        if (!u.email) continue;
        agencyVars.agencyUserName = u.fullName || 'Utilisateur';
        const contactIdAgency = await getCrmContactIdForWhatsApp(tenantId, u.email);
        if (contactIdAgency) {
          await sendWhatsappNotification({
            tenantId,
            notificationKey: 'MAINTENANCE_TICKET_CREATED_AGENCY',
            variables: agencyVars,
            contactId: contactIdAgency
          });
        } else {
          logger.info('WhatsApp agency: no CRM contact with same email + consent + phone', {
            ticketId,
            email: u.email,
            hint: 'Create a CRM contact with this email, consent_whatsapp=true and whatsapp_number or phone_primary'
          });
        }
      }
    }

    // 2) Locataire – accusé de réception (MAINTENANCE_TICKET_CREATED_TENANT)
    const configTenant = await getEmailNotificationConfig(tenantId, 'MAINTENANCE_TICKET_CREATED_TENANT');
    if (configTenant.enabled) {
      let tenantEmail: string | null = ticket.tenantContact?.email || null;
      let tenantName: string =
        ticket.tenantContact?.firstName || ticket.tenantContact?.lastName
          ? `${ticket.tenantContact?.firstName || ''} ${ticket.tenantContact?.lastName || ''}`.trim()
          : '';
      if (!tenantEmail && ticket.lease?.primaryRenter?.user) {
        tenantEmail = ticket.lease.primaryRenter.user.email || null;
        tenantName = tenantName || ticket.lease.primaryRenter.user.fullName || 'Locataire';
      }
      if (!tenantName) tenantName = 'Locataire';
      if (tenantEmail) {
        try {
          await emailService.sendMaintenanceTicketCreatedToTenant(
            tenantEmail,
            tenantName,
            ticket.title,
            propertyReference,
            ticketCreatedAtFormatted,
            portalUrl,
            {
              agencyName,
              templateOverrides:
                configTenant.subjectOverride || configTenant.bodyHtmlOverride
                  ? {
                      subject: configTenant.subjectOverride ?? undefined,
                      bodyHtml: configTenant.bodyHtmlOverride ?? undefined
                    }
                  : undefined
            }
          );
          notifiedEmails.add(tenantEmail.toLowerCase());
          logger.info('Ticket created notification (tenant ack) sent', { ticketId, email: tenantEmail });
        } catch (emailErr: any) {
          logger.error('Failed to send ticket created notification to tenant', {
            ticketId,
            email: tenantEmail,
            error: emailErr?.message
          });
        }
      } else {
        logger.warn('No tenant email for MAINTENANCE_TICKET_CREATED_TENANT', { ticketId, tenantId });
      }

      // WhatsApp : même événement. Contact = contact lié au ticket OU contact CRM trouvé par email du locataire (bail).
      const configWhatsapp = await (
        await import('./whatsapp-notification-config-service')
      ).getWhatsappNotificationConfig(tenantId, 'MAINTENANCE_TICKET_CREATED_TENANT');
      if (configWhatsapp.enabled) {
        const { getCrmContactIdForWhatsApp } = await import('./whatsapp-contact-resolve');
        const { sendWhatsappNotification } = await import('./whatsapp-notification-send-service');
        let contactIdTenant: string | null = ticket.tenantContact?.id ?? null;
        if (!contactIdTenant && tenantEmail) {
          contactIdTenant = await getCrmContactIdForWhatsApp(tenantId, tenantEmail);
        }
        if (contactIdTenant) {
          const sent = await sendWhatsappNotification({
            tenantId,
            notificationKey: 'MAINTENANCE_TICKET_CREATED_TENANT',
            variables: {
              tenantName: tenantName || 'Locataire',
              ticketTitle: ticket.title,
              agencyName: agencyName || "L'agence",
              propertyReference,
              ticketCreatedAt: ticketCreatedAtFormatted
            },
            contactId: contactIdTenant
          });
          if (!sent) {
            logger.info(
              'WhatsApp tenant: not sent (contact missing consent_whatsapp or whatsapp_number/phone_primary)',
              {
                ticketId,
                contactId: contactIdTenant
              }
            );
          }
        } else {
          logger.info(
            'WhatsApp tenant: no contact found (link a contact to the ticket or create a CRM contact with tenant email + consent + phone)',
            {
              ticketId,
              tenantEmail: tenantEmail ?? null
            }
          );
        }
      }
    }

    // 3) Propriétaire (MAINTENANCE_TICKET_CREATED_OWNER)
    const configOwner = await getEmailNotificationConfig(tenantId, 'MAINTENANCE_TICKET_CREATED_OWNER');
    if (configOwner.enabled) {
      const ownerUser = ticket.lease?.ownerClient?.user || ticket.property?.owner;
      if (ownerUser?.email && !notifiedEmails.has(ownerUser.email.toLowerCase())) {
        try {
          await emailService.sendMaintenanceTicketCreatedToOwner(
            ownerUser.email,
            ownerUser.fullName || 'Propriétaire',
            ticket.title,
            propertyReference,
            ticketCreatedAtFormatted,
            {
              agencyName,
              renterName,
              templateOverrides:
                configOwner.subjectOverride || configOwner.bodyHtmlOverride
                  ? {
                      subject: configOwner.subjectOverride ?? undefined,
                      bodyHtml: configOwner.bodyHtmlOverride ?? undefined
                    }
                  : undefined
            }
          );
          notifiedEmails.add(ownerUser.email.toLowerCase());
          logger.info('Ticket created notification sent to owner', { ticketId, email: ownerUser.email });
        } catch (emailErr: any) {
          logger.error('Failed to send ticket created notification to owner', {
            ticketId,
            email: ownerUser.email,
            error: emailErr?.message
          });
        }
      }
    }
  } catch (error) {
    logger.error('Error in sendTicketCreatedNotification', {
      ticketId,
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Send notification email to tenant when ticket status changes (en dur).
 * Uses tenantContact email if available, otherwise primary renter of lease.
 */
export async function sendStatusChangeNotification(
  tenantId: string,
  ticketId: string,
  fromStatus: MaintenanceTicketStatus | null,
  toStatus: MaintenanceTicketStatus
): Promise<void> {
  try {
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id: ticketId, tenant_id: tenantId },
      include: {
        property: {
          select: {
            id: true,
            internalReference: true,
            address: true,
            owner: { select: { id: true, email: true, fullName: true } }
          }
        },
        tenantContact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            whatsappNumber: true,
            phonePrimary: true,
            consentWhatsapp: true
          }
        },
        lease: {
          select: {
            primaryRenter: {
              select: {
                id: true,
                user: { select: { email: true, fullName: true } }
              }
            },
            ownerClient: {
              select: {
                id: true,
                user: { select: { id: true, email: true, fullName: true } }
              }
            }
          }
        }
      }
    });

    if (!ticket) {
      logger.warn('Ticket not found for status change notification', { ticketId, tenantId });
      return;
    }

    const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
    const portalPath = '/tenant/maintenance';
    const portalUrl = `${baseUrl}/login?redirect=${encodeURIComponent(portalPath)}`;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true }
    });
    const agencyName = tenant?.name || undefined;

    const oldStatusLabel = fromStatus ? getStatusLabel(fromStatus) : 'N/A';
    const newStatusLabel = getStatusLabel(toStatus);

    const formatTicketDate = (d: Date | null | undefined) =>
      d
        ? new Date(d).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : '';
    const ticketCreatedAtFormatted = formatTicketDate(ticket.created_at);
    const ticketUpdatedAtFormatted = formatTicketDate(ticket.updated_at);

    const { emailService } = await import('./email-service');
    const { getEmailNotificationConfig } = await import('./email-notification-config-service');
    const configTenant = await getEmailNotificationConfig(tenantId, 'MAINTENANCE_TICKET_STATUS_CHANGED_TENANT');
    const configOwner = await getEmailNotificationConfig(tenantId, 'MAINTENANCE_TICKET_STATUS_CHANGED_OWNER');
    const notifiedEmails = new Set<string>();

    // Notifier le locataire
    let tenantEmail: string | null = ticket.tenantContact?.email || null;
    let tenantName =
      ticket.tenantContact?.firstName || ticket.tenantContact?.lastName
        ? `${ticket.tenantContact?.firstName || ''} ${ticket.tenantContact?.lastName || ''}`.trim()
        : null;
    if (!tenantEmail && ticket.lease?.primaryRenter?.user?.email) {
      tenantEmail = ticket.lease.primaryRenter.user.email;
      tenantName = tenantName || ticket.lease.primaryRenter.user.fullName || null;
    }

    if (tenantEmail && configTenant.enabled) {
      await emailService.sendMaintenanceTicketStatusChangedToTenant(
        tenantEmail,
        tenantName || 'Locataire',
        ticket.title,
        oldStatusLabel,
        newStatusLabel,
        portalUrl,
        {
          agencyName,
          ticketCreatedAt: ticketCreatedAtFormatted,
          ticketUpdatedAt: ticketUpdatedAtFormatted,
          templateOverrides:
            configTenant.subjectOverride || configTenant.bodyHtmlOverride
              ? {
                  subject: configTenant.subjectOverride ?? undefined,
                  bodyHtml: configTenant.bodyHtmlOverride ?? undefined
                }
              : undefined
        }
      );
      notifiedEmails.add(tenantEmail.toLowerCase());
    } else if (!tenantEmail) {
      logger.warn('No tenant email for status change notification', { ticketId, tenantId });
    }

    // WhatsApp : statut ticket changé (locataire)
    const configWhatsappStatus = await (
      await import('./whatsapp-notification-config-service')
    ).getWhatsappNotificationConfig(tenantId, 'MAINTENANCE_TICKET_STATUS_CHANGED_TENANT');
    if (configWhatsappStatus.enabled && ticket.tenantContact?.id) {
      const { sendWhatsappNotification } = await import('./whatsapp-notification-send-service');
      await sendWhatsappNotification({
        tenantId,
        notificationKey: 'MAINTENANCE_TICKET_STATUS_CHANGED_TENANT',
        variables: {
          tenantName: tenantName || 'Locataire',
          ticketTitle: ticket.title,
          newStatusLabel,
          agencyName: agencyName || "L'agence",
          ticketCreatedAt: ticketCreatedAtFormatted,
          ticketUpdatedAt: ticketUpdatedAtFormatted
        },
        contactId: ticket.tenantContact.id
      });
    }

    // Notifier le propriétaire (ownerClient du bail ou owner de la propriété)
    const ownerUser = ticket.lease?.ownerClient?.user || ticket.property?.owner;
    if (ownerUser?.email && !notifiedEmails.has(ownerUser.email.toLowerCase()) && configOwner.enabled) {
      try {
        await emailService.sendMaintenanceTicketStatusChangedToOwner(
          ownerUser.email,
          ownerUser.fullName || 'Propriétaire',
          ticket.title,
          oldStatusLabel,
          newStatusLabel,
          agencyName || "l'agence",
          {
            ticketCreatedAt: ticketCreatedAtFormatted,
            ticketUpdatedAt: ticketUpdatedAtFormatted,
            ...(configOwner.subjectOverride || configOwner.bodyHtmlOverride
              ? {
                  templateOverrides: {
                    subject: configOwner.subjectOverride ?? undefined,
                    bodyHtml: configOwner.bodyHtmlOverride ?? undefined
                  }
                }
              : {})
          }
        );
        logger.info('Status change notification sent to owner', {
          ticketId,
          email: ownerUser.email
        });
      } catch (emailErr: any) {
        logger.error('Failed to send status change notification to owner', {
          ticketId,
          email: ownerUser.email,
          error: emailErr?.message
        });
      }
    }

    logger.info('Status change notification sent', {
      ticketId,
      tenantId,
      fromStatus,
      toStatus
    });
  } catch (error) {
    logger.error('Error in sendStatusChangeNotification', {
      ticketId,
      tenantId,
      fromStatus,
      toStatus,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
