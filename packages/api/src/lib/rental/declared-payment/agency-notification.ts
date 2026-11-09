import { env } from '../../../config/env';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';

/**
 * E-mail immédiat à l'agence à la création d'une déclaration de paiement
 * (clé `PAYMENT_DECLARATION_AGENCY` : administrateurs de l'agence + propriétaire
 * du bail). Bloc extrait tel quel de l'ancien `declarePayment` du portail pour
 * être partagé avec `createRentalDeclaration` : au mieux, ne lève JAMAIS.
 * Le récapitulatif horaire (`notifications.ts`) s'ajoute à cet envoi.
 */

/** « •••• 1234 » : seuls les 4 derniers chiffres d'un numéro (H34). */
function maskPhoneTail(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `•••• ${digits.slice(-4)}`;
}

export interface AgencyDeclarationNotificationParams {
  tenantId: string;
  leaseId: string;
  declarationId: string;
  /** Locataire déclarant (nom affiché dans l'e-mail). */
  tenantClientId: string;
  leaseNumber?: string | null;
  details: {
    amount: number;
    /** `YYYY-MM-DD` (formaté en fr-FR) ou texte déjà lisible. */
    paymentDate: string;
    paymentMethod: string;
    mobileOperator?: string | null;
    transactionPhone?: string | null;
    reference?: string | null;
    notes?: string | null;
  };
}

export async function notifyAgencyOfDeclaration(params: AgencyDeclarationNotificationParams): Promise<void> {
  const { tenantId, leaseId, tenantClientId, details: data } = params;
  const paymentDeclaration = { id: params.declarationId };
  const lease_number = params.leaseNumber ?? '';
  try {
    logger.info('Payment declaration: starting agency notification', {
      tenantId,
      leaseId,
      tenantClientId,
      declarationId: paymentDeclaration.id,
      amount: data.amount
    });

    const { getEmailNotificationConfig } = await import('../../../services/email-notification-config-service');
    const notifConfig = await getEmailNotificationConfig(tenantId, 'PAYMENT_DECLARATION_AGENCY');
    if (!notifConfig.enabled) {
      logger.info('Notification PAYMENT_DECLARATION_AGENCY désactivée', {
        tenantId,
        declarationId: paymentDeclaration.id
      });
    } else {
      const { emailService } = await import('../../../services/email-service');
      const declarer = await prisma.tenantClient.findFirst({
        where: { id: tenantClientId },
        select: { user: { select: { fullName: true } } }
      });
      const declarerName = declarer?.user?.fullName || 'Locataire';
      const leaseNumber = lease_number;

      // Build lease label: "Owner fullName - Property title ( Container parent title )" (same format as LeaseForm Propriété field)
      const leaseWithProperty = await prisma.rentalLease.findUnique({
        where: { id: leaseId },
        select: {
          owner_client_id: true,
          property: {
            select: {
              title: true,
              internalReference: true,
              owner: { select: { fullName: true, email: true } },
              containerParent: { select: { title: true } }
            }
          },
          ownerClient: {
            select: {
              id: true,
              user: { select: { fullName: true, email: true } }
            }
          }
        }
      });
      let leaseLabel: string | undefined;
      if (leaseWithProperty?.property) {
        const { getPropertyDisplayLabel } = await import('../../../utils/property-display');
        leaseLabel = getPropertyDisplayLabel(leaseWithProperty.property);
      }

      const baseUrl = env.FRONTEND_URL;
      const targetPath = `/tenant/${tenantId}/rental/leases/${leaseId}`;
      const validationUrl = `${baseUrl}/login?redirect=${encodeURIComponent(targetPath)}`;

      const paymentDateFormatted =
        data.paymentDate && /^\d{4}-\d{2}-\d{2}$/.test(data.paymentDate)
          ? new Date(data.paymentDate + 'T12:00:00').toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            })
          : data.paymentDate;

      const declarationDetails = {
        amount: data.amount,
        paymentDate: paymentDateFormatted,
        paymentMethod: data.paymentMethod,
        mobileOperator: data.mobileOperator ?? null,
        transactionPhone: data.transactionPhone?.trim() || null,
        reference: data.reference || null,
        // Pas de `proofFileUrl` : chemin `/uploads` privé, lien mort et fuite de chemin.
        notes: data.notes ?? null
      };

      // Notifier uniquement les admins de l'agence (tenant) : utilisateurs avec le rôle TENANT_ADMIN pour ce tenant
      let users: Array<{ id: string; email: string; fullName: string | null }> = [];

      const tenantAdminRole = await prisma.role.findUnique({
        where: { key: 'TENANT_ADMIN' },
        select: { id: true }
      });

      if (tenantAdminRole) {
        const adminUserRoles = await prisma.userRole.findMany({
          where: {
            tenantId,
            roleId: tenantAdminRole.id
          },
          select: { userId: true }
        });
        const adminUserIds = [...new Set(adminUserRoles.map(r => r.userId))];

        logger.info('Payment declaration: tenant admin (TENANT_ADMIN) lookup', {
          tenantId,
          tenantAdminCount: adminUserIds.length
        });

        if (adminUserIds.length > 0) {
          users = await prisma.user.findMany({
            where: { id: { in: adminUserIds }, isActive: true },
            select: { id: true, email: true, fullName: true }
          });
          logger.info('Payment declaration: tenant admins to notify', {
            tenantId,
            usersFound: users.length,
            emails: users.map(u => u.email)
          });
        }
      } else {
        logger.warn('Payment declaration: TENANT_ADMIN role not found in database', { tenantId });
      }

      if (users.length === 0) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { contactEmail: true, name: true }
        });
        if (tenant?.contactEmail) {
          const byEmail = await prisma.user.findFirst({
            where: { email: tenant.contactEmail, isActive: true },
            select: { id: true, email: true, fullName: true }
          });
          users = byEmail ? [byEmail] : [{ id: '', email: tenant.contactEmail, fullName: tenant.name }];
          logger.info('Payment declaration: no tenant admin found, using tenant contactEmail', {
            tenantId,
            contactEmail: tenant.contactEmail
          });
        } else {
          logger.warn('Payment declaration: no tenant admin (TENANT_ADMIN) or tenant contactEmail to notify', {
            tenantId,
            leaseId,
            declarationId: paymentDeclaration.id
          });
        }
      }

      const tenantAgency = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true }
      });
      const agencyName = tenantAgency?.name || undefined;

      logger.info('Payment declaration: sending notification emails to tenant admin(s)', {
        tenantId,
        declarationId: paymentDeclaration.id,
        recipientCount: users.length,
        recipientEmails: users.map(u => u.email)
      });

      const notifiedEmails = new Set<string>();

      for (const u of users) {
        if (u.email && !notifiedEmails.has(u.email.toLowerCase())) {
          try {
            await emailService.sendPaymentDeclarationToAgency(
              u.email,
              u.fullName || 'Utilisateur',
              declarerName,
              leaseNumber,
              declarationDetails,
              {
                leaseLabel,
                validationUrl,
                agencyName,
                templateOverrides:
                  notifConfig.subjectOverride || notifConfig.bodyHtmlOverride
                    ? {
                        subject: notifConfig.subjectOverride ?? undefined,
                        bodyHtml: notifConfig.bodyHtmlOverride ?? undefined
                      }
                    : undefined
              }
            );
            notifiedEmails.add(u.email.toLowerCase());
            logger.info('Payment declaration email sent to tenant admin', {
              email: u.email,
              declarationId: paymentDeclaration.id
            });
          } catch (emailErr: any) {
            logger.error('Failed to send payment declaration email', {
              email: u.email,
              declarationId: paymentDeclaration.id,
              error: emailErr?.message
            });
          }
        }
      }

      // Notifier le propriétaire (ownerClient du bail ou owner de la propriété)
      const ownerUser = leaseWithProperty?.ownerClient?.user || leaseWithProperty?.property?.owner;
      if (ownerUser?.email && !notifiedEmails.has(ownerUser.email.toLowerCase())) {
        try {
          await emailService.sendPaymentDeclarationToAgency(
            ownerUser.email,
            ownerUser.fullName || 'Propriétaire',
            declarerName,
            leaseNumber,
            // H34 : au propriétaire, le téléphone Mobile Money est masqué.
            { ...declarationDetails, transactionPhone: maskPhoneTail(declarationDetails.transactionPhone) },
            {
              leaseLabel,
              validationUrl,
              agencyName,
              templateOverrides:
                notifConfig.subjectOverride || notifConfig.bodyHtmlOverride
                  ? {
                      subject: notifConfig.subjectOverride ?? undefined,
                      bodyHtml: notifConfig.bodyHtmlOverride ?? undefined
                    }
                  : undefined
            }
          );
          logger.info('Payment declaration email sent to owner', {
            email: ownerUser.email,
            declarationId: paymentDeclaration.id
          });
        } catch (emailErr: any) {
          logger.error('Failed to send payment declaration email to owner', {
            email: ownerUser.email,
            declarationId: paymentDeclaration.id,
            error: emailErr?.message
          });
        }
      }
    }
  } catch (err: any) {
    logger.warn('Error sending payment declaration emails to agency', {
      declarationId: paymentDeclaration.id,
      leaseId,
      error: err?.message
    });
  }
}
