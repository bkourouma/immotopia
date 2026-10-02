import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent, recordAuditEvent } from './audit-service';
import { diffForAudit } from '../lib/audit/changes';
import { BadRequestError } from '../middleware/error-middleware';
import { CreateLeaseRequest, UpdateLeaseRequest, LeaseDetail } from '../types/rental-types';
import {
  RentalLeaseStatus,
  PropertyStatus,
  PropertyTransactionMode,
  RentalBillingFrequency,
  CrmContactType
} from '@prisma/client';
import { emailService } from './email-service';
import { getEmailNotificationConfig } from './email-notification-config-service';
import { updatePropertyStatus } from './property-status-service';
import { syncLotActivationsTx } from './lot-registry-service';
import { getTenantById } from './tenant-service';
import { assertThirdPartyAllowedForTenant } from './own-assets-barrier-service';
import { t } from '../i18n';
import { generateLeaseNumber, isLeaseNumberCollision } from './rental-lease-number';
import { toRentalDocumentDto } from './rental-document-service';

/**
 * Les documents d'un bail sortent via `toRentalDocumentDto` : jamais de chemin
 * disque ni de cle de stockage dans une reponse d'API.
 */
function withPublicDocuments<T>(lease: T): T {
  const documents = (lease as { documents?: Array<Record<string, unknown>> } | null)?.documents;
  if (!lease || !Array.isArray(documents)) return lease;
  return { ...lease, documents: documents.map(toRentalDocumentDto) } as T;
}

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
  // Generate lease number if not provided
  // Annotation explicite : sans elle, la reaffectation dans la boucle plus bas
  // rend l inference circulaire (TS7022).
  let leaseNumber: string | undefined = data.leaseNumber;

  if (!leaseNumber) {
    // Generate automatic lease number
    leaseNumber = await generateLeaseNumber(tenantId);

    // Ensure uniqueness - if generated number exists, increment until we find a free one
    let existingLease = await prisma.rentalLease.findFirst({
      where: {
        tenant_id: tenantId,
        lease_number: leaseNumber
      }
    });

    const year = new Date().getFullYear();
    let attempts = 0;
    const maxAttempts = 10000;

    while (existingLease && attempts < maxAttempts) {
      attempts += 1;
      const match: RegExpMatchArray | null = leaseNumber.match(/^BAIL-\d{4}-(\d+)$/);
      const nextSeq: number = match ? parseInt(match[1], 10) + 1 : 1;
      const sequenceNumber: string = nextSeq.toString().padStart(4, '0');
      leaseNumber = `BAIL-${year}-${sequenceNumber}`;
      existingLease = await prisma.rentalLease.findFirst({
        where: {
          tenant_id: tenantId,
          lease_number: leaseNumber
        }
      });
    }

    if (existingLease) {
      throw new BadRequestError('Impossible de générer un numéro de bail unique. Réessayez.');
    }
  } else {
    // If lease number is provided, check for duplicates
    const existingLease = await prisma.rentalLease.findFirst({
      where: {
        tenant_id: tenantId,
        lease_number: leaseNumber
      }
    });

    if (existingLease) {
      throw new BadRequestError(
        t('Un bail portant le numéro {{number}} existe déjà dans cette agence', { number: leaseNumber })
      );
    }
  }

  // Validate required fields
  if (!data.propertyId || !data.startDate) {
    throw new BadRequestError(t('Le bien et la date de début sont requis'));
  }

  if (!data.primaryRenterClientId && !data.primaryRenterContactId) {
    throw new BadRequestError(t('Le locataire principal (client ou contact) est requis'));
  }

  // Validate dates
  if (data.endDate && data.endDate <= data.startDate) {
    throw new BadRequestError(t('La date de fin doit être postérieure à la date de début'));
  }

  // Validate property exists and belongs to tenant (fetch early for transactionModes check)
  const property = await prisma.property.findFirst({
    where: {
      id: data.propertyId,
      tenantId: tenantId
    }
  });

  if (!property) {
    throw new BadRequestError(t("Bien introuvable ou n'appartenant pas à cette agence"));
  }

  // For sale-only properties, financial fields are optional (use defaults)
  const modes = (property.transactionModes || []) as PropertyTransactionMode[];
  const isSaleOnly =
    modes.includes(PropertyTransactionMode.SALE) &&
    !modes.includes(PropertyTransactionMode.RENTAL) &&
    !modes.includes(PropertyTransactionMode.SHORT_TERM);

  const billingFrequency = data.billingFrequency ?? RentalBillingFrequency.MONTHLY;
  const dueDayOfMonth = data.dueDayOfMonth ?? 1;
  const rentAmount = data.rentAmount ?? 0;

  if (!isSaleOnly) {
    if (data.dueDayOfMonth == null || data.dueDayOfMonth < 1 || data.dueDayOfMonth > 31) {
      throw new BadRequestError(t("Le jour d'échéance doit être compris entre 1 et 31"));
    }
    if (data.rentAmount == null || data.rentAmount <= 0) {
      throw new BadRequestError('Le montant du loyer doit être supérieur à 0');
    }
  }

  // Validate CRM deal belongs to this tenant, if provided.
  if (data.crmDealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: {
        id: data.crmDealId,
        tenantId: tenantId
      }
    });

    if (!deal) {
      throw new BadRequestError(t("Affaire CRM introuvable ou n'appartenant pas à cette agence"));
    }
  }

  // Barriere « detenu en propre » (pack Patrimoine) : un bailleur tiers sur
  // ce bail. AVANT toute ecriture — la creation des clients/comptes du
  // locataire et du bailleur n'a lieu qu'en transaction, plus bas.
  if (data.ownerClientId || data.ownerContactId) {
    await assertThirdPartyAllowedForTenant(tenantId, 'THIRD_PARTY_OWNER');
  }

  // Controles de refus sans ecriture : appartenance a l'agence du locataire
  // et du bailleur designes par leur client.
  if (data.primaryRenterClientId) {
    const primaryRenter = await prisma.tenantClient.findFirst({
      where: { id: data.primaryRenterClientId, tenantId: tenantId },
      select: { id: true }
    });
    if (!primaryRenter) {
      throw new BadRequestError(t("Locataire principal introuvable ou n'appartenant pas à cette agence"));
    }
  }
  if (data.ownerClientId) {
    const ownerClient = await prisma.tenantClient.findFirst({
      where: { id: data.ownerClientId, tenantId: tenantId },
      select: { id: true }
    });
    if (!ownerClient) {
      throw new BadRequestError(t("Propriétaire introuvable ou n'appartenant pas à cette agence"));
    }
  }

  // Create lease — un bail ACTIVE fait compter le logement (D1) : entree au
  // registre des lots dans la meme transaction.
  type NewAccount = { isNewUser: boolean; passwordResetToken?: string; user: any };
  const autoNumbered = !data.leaseNumber;
  const createInTransaction = () =>
    prisma.$transaction(
      async tx => {
        // Clients et comptes crees dans la meme transaction que le bail : un echec
        // en cours de route ne laisse ni client ni utilisateur.
        const { getOrCreateTenantClientFromContact } = await import('./tenant-service');
        let primaryRenterClientId: string;
        let primaryRenterResult: NewAccount | null = null;
        let ownerClientId: string | null = null;
        let ownerResult: NewAccount | null = null;
        if (data.primaryRenterClientId) {
          primaryRenterClientId = data.primaryRenterClientId;
        } else if (data.primaryRenterContactId) {
          const result = await getOrCreateTenantClientFromContact(tenantId, data.primaryRenterContactId, 'RENTER', {
            db: tx
          });
          primaryRenterClientId = result.tenantClient.id;
          primaryRenterResult = {
            isNewUser: result.isNewUser,
            passwordResetToken: result.passwordResetToken,
            user: result.user
          };
        } else {
          throw new BadRequestError(t('Le locataire principal (client ou contact) est requis'));
        }
        if (data.ownerClientId) {
          ownerClientId = data.ownerClientId;
        } else if (data.ownerContactId) {
          const result = await getOrCreateTenantClientFromContact(tenantId, data.ownerContactId, 'OWNER', { db: tx });
          ownerClientId = result.tenantClient.id;
          ownerResult = {
            isNewUser: result.isNewUser,
            passwordResetToken: result.passwordResetToken,
            user: result.user
          };
        }
        const createdLease = await tx.rentalLease.create({
          data: {
            tenant_id: tenantId,
            property_id: data.propertyId,
            primary_renter_client_id: primaryRenterClientId,
            owner_client_id: ownerClientId,
            crm_deal_id: data.crmDealId || null,
            lease_number: leaseNumber as string,
            status: RentalLeaseStatus.ACTIVE,
            start_date: data.startDate,
            end_date: data.endDate || null,
            move_in_date: data.moveInDate || null,
            move_out_date: data.moveOutDate || null,
            billing_frequency: billingFrequency,
            due_day_of_month: dueDayOfMonth,
            currency: data.currency || 'FCFA',
            rent_amount: rentAmount,
            service_charge_amount: data.serviceChargeAmount || 0,
            security_deposit_amount: data.securityDepositAmount || 0,
            penalty_grace_days: data.penaltyGraceDays || 0,
            penalty_mode: data.penaltyMode || 'PERCENT_OF_BALANCE',
            penalty_rate: data.penaltyRate || 0,
            penalty_fixed_amount: data.penaltyFixedAmount || 0,
            penalty_cap_amount: data.penaltyCapAmount || null,
            notes: data.notes || null,
            terms_json: (data.termsJson || null) as any,
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
        await syncLotActivationsTx(tx, tenantId, { propertyIds: [data.propertyId] }, { actorUserId });
        return { lease: createdLease, primaryRenterClientId, primaryRenterResult, ownerClientId, ownerResult };
      },
      { timeout: 15000, maxWait: 10000 }
    );

  // Numéro automatique : deux créations simultanées peuvent viser le même
  // numéro. La transaction perdante est annulée en entier (P2002 sur le numéro) :
  // on recalcule le numéro et on réessaie, au plus deux fois.
  let created!: Awaited<ReturnType<typeof createInTransaction>>;
  for (let attempt = 0; ; attempt += 1) {
    try {
      created = await createInTransaction();
      break;
    } catch (error) {
      if (!autoNumbered || attempt >= 2 || !isLeaseNumberCollision(error)) throw error;
      leaseNumber = await generateLeaseNumber(tenantId);
    }
  }
  const { lease, primaryRenterClientId, primaryRenterResult, ownerClientId, ownerResult } = created;

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

  // Update property status when bail created based on property operation type:
  // Vente (SALE) -> Vendu (SOLD), Location (RENTAL) / Location courte durée (SHORT_TERM) -> Loué (RENTED)
  {
    try {
      const modes = (property.transactionModes || []) as PropertyTransactionMode[];
      const hasSale = modes.includes(PropertyTransactionMode.SALE);
      const hasRental =
        modes.includes(PropertyTransactionMode.RENTAL) || modes.includes(PropertyTransactionMode.SHORT_TERM);
      const newPropertyStatus = hasSale && !hasRental ? PropertyStatus.SOLD : PropertyStatus.RENTED;

      await updatePropertyStatus(
        data.propertyId,
        newPropertyStatus,
        tenantId,
        undefined,
        actorUserId,
        `Statut mis à jour automatiquement lors de la création du bail (type d'opération: ${hasSale && !hasRental ? 'Vente' : 'Location'})`
      );
      logger.info('Property status updated after lease creation', {
        propertyId: data.propertyId,
        leaseId: lease.id,
        newStatus: newPropertyStatus
      });
    } catch (statusError: any) {
      logger.warn('Could not update property status after lease creation', {
        propertyId: data.propertyId,
        leaseId: lease.id,
        error: statusError?.message
      });
    }
  }

  // Les emails (ex. LEASE_ACTIVATED) sont gérés uniquement par "Notifications email" (email_notification_configs), pas par triggerEvent.

  // Send account creation emails if new users were created
  try {
    // Get tenant information for emails
    const tenant = await getTenantById(tenantId);
    const frontendUrl = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000').replace(
      /\/$/,
      ''
    );

    const sendPortalAccountCreatedWhatsapp = async (params: {
      email?: string | null;
      fullName?: string | null;
      resetToken?: string;
      explicitContactId?: string | null;
    }) => {
      const { email, fullName, resetToken, explicitContactId } = params;
      if (!resetToken) return;

      const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

      try {
        const { sendWhatsappNotification } = await import('./whatsapp-notification-send-service');

        let contactId = explicitContactId || null;
        if (!contactId && email) {
          const { getCrmContactIdForWhatsApp } = await import('./whatsapp-contact-resolve');
          contactId = await getCrmContactIdForWhatsApp(tenantId, email);
        }

        if (!contactId) {
          logger.info('Lease account creation WhatsApp skipped: no CRM contact with consent/phone', {
            tenantId,
            email
          });
          return;
        }

        await sendWhatsappNotification({
          tenantId,
          notificationKey: 'PORTAL_ACCOUNT_CREATED',
          contactId,
          variables: {
            userName: fullName || email || 'Utilisateur',
            tenantName: tenant?.name || '',
            resetUrl
          }
        });
      } catch (whatsappError) {
        logger.warn('Failed to send account creation WhatsApp', {
          tenantId,
          email,
          error: whatsappError instanceof Error ? whatsappError.message : String(whatsappError)
        });
      }
    };

    if (!tenant) {
      logger.warn('Tenant not found when sending account creation emails', { tenantId });
    } else {
      // Send email to primary renter if new user was created
      if (primaryRenterResult?.isNewUser && primaryRenterResult.passwordResetToken && primaryRenterResult.user) {
        try {
          await emailService.sendAccountCreationEmail(
            primaryRenterResult.user.email,
            primaryRenterResult.user.fullName || 'Utilisateur',
            primaryRenterResult.passwordResetToken,
            tenant.name,
            lease.lease_number,
            lease.property?.address || null,
            'RENTER'
          );
          logger.info('Account creation email sent to primary renter', {
            userId: primaryRenterResult.user.id,
            email: primaryRenterResult.user.email,
            leaseId: lease.id
          });
          try {
            await sendPortalAccountCreatedWhatsapp({
              email: primaryRenterResult.user.email,
              fullName: primaryRenterResult.user.fullName,
              resetToken: primaryRenterResult.passwordResetToken,
              explicitContactId: data.primaryRenterContactId || null
            });
          } catch {
            // Already logged in helper; keep lease/email flow successful.
          }
        } catch (emailError) {
          logger.error('Failed to send account creation email to primary renter', {
            userId: primaryRenterResult.user.id,
            email: primaryRenterResult.user.email,
            leaseId: lease.id,
            error: emailError
          });
          // Don't throw - lease creation succeeded, email failure is non-critical
        }
      }

      // Send email to owner if new user was created
      if (ownerResult?.isNewUser && ownerResult.passwordResetToken && ownerResult.user) {
        try {
          await emailService.sendAccountCreationEmail(
            ownerResult.user.email,
            ownerResult.user.fullName || 'Utilisateur',
            ownerResult.passwordResetToken,
            tenant.name,
            lease.lease_number,
            lease.property?.address || null,
            'OWNER'
          );
          logger.info('Account creation email sent to owner', {
            userId: ownerResult.user.id,
            email: ownerResult.user.email,
            leaseId: lease.id
          });
          try {
            await sendPortalAccountCreatedWhatsapp({
              email: ownerResult.user.email,
              fullName: ownerResult.user.fullName,
              resetToken: ownerResult.passwordResetToken,
              explicitContactId: data.ownerContactId || null
            });
          } catch {
            // Already logged in helper; keep lease/email flow successful.
          }
        } catch (emailError) {
          logger.error('Failed to send account creation email to owner', {
            userId: ownerResult.user.id,
            email: ownerResult.user.email,
            leaseId: lease.id,
            error: emailError
          });
          // Don't throw - lease creation succeeded, email failure is non-critical
        }
      }
    }
  } catch (error) {
    // Log error but don't fail lease creation
    logger.error('Error sending account creation emails', {
      leaseId: lease.id,
      tenantId,
      error
    });
  }

  // Send lease activation notifications (email + WhatsApp) to renter/owner, even for existing accounts.
  try {
    const [primaryRenterClient, ownerClient, tenant] = await Promise.all([
      prisma.tenantClient.findUnique({
        where: { id: primaryRenterClientId, tenantId },
        select: { details: true, user: { select: { email: true, fullName: true } } }
      }),
      ownerClientId
        ? prisma.tenantClient.findUnique({
            where: { id: ownerClientId, tenantId },
            select: { details: true, user: { select: { email: true, fullName: true } } }
          })
        : Promise.resolve(null),
      getTenantById(tenantId)
    ]);

    const renterDetails = (primaryRenterClient?.details || {}) as { crmContactId?: string };
    const ownerDetails = (ownerClient?.details || {}) as { crmContactId?: string };

    // Le compte utilisateur peut avoir ete cree sans nom (ex: rattachement d'un
    // proprietaire a un bien). La fiche CRM, elle, porte toujours l'identite
    // saisie par l'agence : on s'en sert plutot que d'ecrire « Bonjour Proprietaire ».
    const contactIds = [
      data.primaryRenterContactId || renterDetails.crmContactId,
      data.ownerContactId || ownerDetails.crmContactId
    ].filter((id): id is string => Boolean(id));

    const crmNames = new Map<string, string>();
    if (contactIds.length > 0) {
      const crmContacts = await prisma.crmContact.findMany({
        where: { id: { in: contactIds }, tenantId },
        select: { id: true, firstName: true, lastName: true, legalName: true }
      });
      crmContacts.forEach(contact => {
        const label = contact.legalName?.trim() || `${contact.firstName} ${contact.lastName}`.trim();
        if (label) crmNames.set(contact.id, label);
      });
    }

    const resolveName = (userName: string | null | undefined, contactId: string | null, fallback: string) =>
      userName?.trim() || (contactId ? crmNames.get(contactId) : undefined) || fallback;

    const recipients = [
      {
        role: 'RENTER',
        email: primaryRenterClient?.user?.email || null,
        name: resolveName(
          primaryRenterClient?.user?.fullName,
          data.primaryRenterContactId || renterDetails.crmContactId || null,
          'Locataire'
        ),
        explicitContactId: data.primaryRenterContactId || null,
        fallbackContactId: renterDetails.crmContactId || null,
        isNewUser: Boolean(primaryRenterResult?.isNewUser && primaryRenterResult.passwordResetToken),
        resetToken: primaryRenterResult?.passwordResetToken || null
      },
      {
        role: 'OWNER',
        email: ownerClient?.user?.email || null,
        name: resolveName(
          ownerClient?.user?.fullName,
          data.ownerContactId || ownerDetails.crmContactId || null,
          'Propriétaire'
        ),
        explicitContactId: data.ownerContactId || null,
        fallbackContactId: ownerDetails.crmContactId || null,
        isNewUser: Boolean(ownerResult?.isNewUser && ownerResult.passwordResetToken),
        resetToken: ownerResult?.passwordResetToken || null
      }
    ].filter((item, index, all) => item.email && all.findIndex(other => other.email === item.email) === index);

    if (recipients.length > 0) {
      const emailConfig = await getEmailNotificationConfig(tenantId, 'LEASE_ACTIVATED');
      const { getCrmContactIdForWhatsApp } = await import('./whatsapp-contact-resolve');
      const { sendWhatsappNotification } = await import('./whatsapp-notification-send-service');
      const frontendUrl = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000').replace(
        /\/$/,
        ''
      );
      const loginUrl = `${frontendUrl}/login`;
      const forgotPasswordUrl = `${frontendUrl}/forgot-password`;

      const leaseStartDate = data.startDate ? new Date(data.startDate).toLocaleDateString('fr-FR') : '';
      const leaseEndDate = data.endDate ? new Date(data.endDate).toLocaleDateString('fr-FR') : 'Non définie';
      const rentAmount = `${Number(data.rentAmount || 0).toLocaleString('fr-FR')} ${data.currency || 'FCFA'}`;
      const serviceChargeLabel = Number(data.serviceChargeAmount || 0)
        ? `${Number(data.serviceChargeAmount).toLocaleString('fr-FR')} ${data.currency || 'FCFA'}`
        : undefined;
      const agencyName = tenant?.name || "L'agence";
      const propertyAddress = lease.property?.address || '';

      await Promise.allSettled(
        recipients.map(async recipient => {
          const resetUrl = recipient.resetToken ? `${frontendUrl}/reset-password?token=${recipient.resetToken}` : null;

          if (emailConfig.enabled && recipient.email) {
            const { getLeaseActivatedTemplate } = await import('../utils/email-templates');
            const subject = `Votre bail ${lease.lease_number} est activé — ${agencyName}`;
            const html = getLeaseActivatedTemplate({
              recipientName: recipient.name,
              recipientRole: recipient.role === 'RENTER' ? 'RENTER' : 'OWNER',
              agencyName,
              leaseNumber: lease.lease_number,
              propertyAddress,
              leaseStartDate,
              leaseEndDate,
              rentAmount,
              serviceChargeAmount: serviceChargeLabel,
              dueDayOfMonth: data.dueDayOfMonth,
              accessUrl: recipient.isNewUser && resetUrl ? resetUrl : loginUrl,
              forgotPasswordUrl,
              isNewAccount: Boolean(recipient.isNewUser && resetUrl)
            });
            await emailService.sendEmail({
              to: recipient.email,
              subject,
              html
            });
          }

          if (recipient.email) {
            let contactId = recipient.explicitContactId || recipient.fallbackContactId || null;
            if (!contactId) {
              contactId = await getCrmContactIdForWhatsApp(tenantId, recipient.email);
            }

            if (contactId) {
              const sent = await sendWhatsappNotification({
                tenantId,
                notificationKey: 'LEASE_ACTIVATED',
                contactId,
                variables: {
                  tenantName: recipient.name || 'Client',
                  agencyName,
                  leaseLabel: lease.lease_number,
                  propertyAddress,
                  leaseStartDate,
                  leaseEndDate,
                  rentAmount,
                  loginUrl,
                  forgotPasswordUrl,
                  resetUrl: resetUrl || ''
                }
              });

              if (!sent) {
                logger.info('Lease activated WhatsApp skipped by config/consent/provider', {
                  tenantId,
                  leaseId: lease.id,
                  recipientRole: recipient.role,
                  email: recipient.email
                });
              }
            } else {
              logger.info('Lease activated WhatsApp skipped: no CRM contact found', {
                tenantId,
                leaseId: lease.id,
                recipientRole: recipient.role,
                email: recipient.email
              });
            }
          }
        })
      );
    }
  } catch (notificationError) {
    logger.warn('Lease activated notification failed', {
      leaseId: lease.id,
      tenantId,
      error: notificationError instanceof Error ? notificationError.message : String(notificationError)
    });
  }

  return withPublicDocuments(lease) as unknown as LeaseDetail;
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
          address: true,
          title: true,
          transactionModes: true
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
      ownerClient: {
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

  if (lease && lease.ownerClient) {
    // Extract crmContactId from details JSON if it exists
    const details = lease.ownerClient.details as any;
    if (details && details.crmContactId) {
      (lease.ownerClient as any).crmContactId = details.crmContactId;
    }
  }

  // Nom affichable du locataire et du proprietaire (REFONTE_UI_UX.md §8.4).
  //
  // Le front chargeait le bail, constatait que `user.fullName` etait vide, puis
  // relancait une requete `getContact` par partie manquante — donc apres le
  // rendu, en cascade : l'ecran s'affichait avec des noms absents qui
  // apparaissaient ensuite. Ces noms sont ici resolus avant la reponse, en une
  // seule requete pour les deux parties.
  //
  // La resolution ne se declenche que pour les parties dont le nom manque
  // vraiment : un client rattache a un compte utilisateur porte deja son nom.
  if (lease) {
    const parties = [lease.primaryRenter, lease.ownerClient].filter(Boolean) as any[];

    const missing = parties.filter(party => !party.user?.fullName?.trim() && party.crmContactId);
    const contactIds = [...new Set(missing.map(party => party.crmContactId as string))];

    if (contactIds.length > 0) {
      const contacts = await prisma.crmContact.findMany({
        // `tenantId` fait partie du filtre : un identifiant de contact devine
        // ou recopie d'une autre agence ne doit pas resoudre un nom.
        where: { id: { in: contactIds }, tenantId },
        select: { id: true, contactType: true, firstName: true, lastName: true, legalName: true }
      });

      const nameById = new Map<string, string>();
      for (const contact of contacts) {
        const name =
          contact.contactType === CrmContactType.COMPANY
            ? contact.legalName?.trim() || ''
            : `${contact.firstName?.trim() || ''} ${contact.lastName?.trim() || ''}`.trim();
        if (name) nameById.set(contact.id, name);
      }

      for (const party of missing) {
        const name = nameById.get(party.crmContactId as string);
        if (name) party.displayName = name;
      }
    }

    // Chaque partie porte un nom affichable, quelle que soit sa provenance :
    // le compte utilisateur s'il existe, le contact CRM sinon. Le front n'a
    // plus a arbitrer entre les deux ni a completer apres coup.
    for (const party of parties) {
      if (!party.displayName) {
        party.displayName = party.user?.fullName?.trim() || null;
      }
    }
  }

  return withPublicDocuments(lease) as LeaseDetail | null;
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
            title: true,
            address: true,
            price: true,
            currency: true,
            transactionModes: true
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
        lease_number: 'desc'
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
    throw new BadRequestError(t('Bail introuvable'));
  }

  // Validate dates if provided
  if (data.endDate && existingLease.start_date && data.endDate <= existingLease.start_date) {
    throw new BadRequestError(t('La date de fin doit être postérieure à la date de début'));
  }

  // Update lease
  const leaseUpdate = {
    end_date: data.endDate !== undefined ? data.endDate : undefined,
    move_in_date: data.moveInDate !== undefined ? data.moveInDate : undefined,
    move_out_date: data.moveOutDate !== undefined ? data.moveOutDate : undefined,
    rent_amount: data.rentAmount !== undefined ? data.rentAmount : undefined,
    service_charge_amount: data.serviceChargeAmount !== undefined ? data.serviceChargeAmount : undefined,
    security_deposit_amount: data.securityDepositAmount !== undefined ? data.securityDepositAmount : undefined,
    billing_frequency: data.billingFrequency !== undefined ? data.billingFrequency : undefined,
    notes: data.notes !== undefined ? data.notes : undefined
  };
  const lease = await prisma.rentalLease.update({
    where: {
      id: leaseId,
      tenant_id: tenantId
    },
    data: leaseUpdate,
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
    payload: data as unknown as Record<string, unknown>,
    // Avant/après : loyer, charges, dépôt, dates, fréquence de facturation.
    changes: diffForAudit(existingLease as unknown as Record<string, unknown>, leaseUpdate)
  });

  return withPublicDocuments(lease) as unknown as LeaseDetail;
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
    throw new BadRequestError(t('Bail introuvable'));
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
    throw new BadRequestError(
      t('Changement de statut invalide : de {{from}} à {{to}}', { from: existingLease.status, to: newStatus })
    );
  }

  // Update status — activation ou fin du bail : decompte du logement (D1)
  // recalcule dans la meme transaction.
  const lease = await prisma.$transaction(async tx => {
    const updatedLease = await tx.rentalLease.update({
      where: {
        id: leaseId,
        tenant_id: tenantId
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
    await syncLotActivationsTx(
      tx,
      tenantId,
      { propertyIds: [existingLease.property_id] },
      {
        actorUserId,
        reason: `LEASE_${newStatus}`
      }
    );
    return updatedLease;
  });

  logger.info('Rental lease status updated', {
    leaseId: lease.id,
    tenantId,
    oldStatus: existingLease.status,
    newStatus
  });

  // When lease ends or is canceled, revert property status to AVAILABLE if no other active leases
  if (
    (newStatus === RentalLeaseStatus.ENDED || newStatus === RentalLeaseStatus.CANCELED) &&
    (existingLease.status === RentalLeaseStatus.ACTIVE || existingLease.status === RentalLeaseStatus.SUSPENDED)
  ) {
    const otherActiveLeases = await prisma.rentalLease.count({
      where: {
        property_id: existingLease.property_id,
        tenant_id: tenantId,
        status: RentalLeaseStatus.ACTIVE,
        id: { not: leaseId }
      }
    });
    if (otherActiveLeases === 0) {
      try {
        await updatePropertyStatus(
          existingLease.property_id,
          PropertyStatus.AVAILABLE,
          tenantId,
          undefined,
          actorUserId,
          'Statut réinitialisé après fin du bail'
        );
      } catch (err: any) {
        logger.warn('Could not revert property status after lease end', {
          propertyId: existingLease.property_id,
          error: err?.message
        });
      }
    }
  }

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

  return withPublicDocuments(lease) as unknown as LeaseDetail;
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
    throw new BadRequestError(t('Bail introuvable'));
  }

  // Validate co-renter client exists and belongs to this tenant (same error
  // whether the id is unknown or belongs to another agency).
  const renterClient = await prisma.tenantClient.findFirst({
    where: {
      id: renterClientId,
      tenantId: tenantId
    }
  });

  if (!renterClient) {
    throw new BadRequestError(t("Colocataire introuvable ou n'appartenant pas à cette agence"));
  }

  // Check if co-renter already exists
  const existingCoRenter = await prisma.rentalLeaseCoRenter.findFirst({
    where: {
      lease_id: leaseId,
      renter_client_id: renterClientId,
      tenant_id: tenantId
    }
  });

  if (existingCoRenter) {
    throw new BadRequestError(t('Ce colocataire est déjà ajouté à ce bail'));
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
    throw new BadRequestError(t('Bail introuvable'));
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
    throw new BadRequestError(t('Bail introuvable'));
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

/**
 * Delete a lease
 * @param tenantId - Tenant ID
 * @param leaseId - Lease ID
 * @param actorUserId - User deleting the lease
 */
export async function deleteLease(tenantId: string, leaseId: string, actorUserId: string): Promise<void> {
  // Verify lease exists and belongs to tenant
  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    }
  });

  if (!lease) {
    throw new BadRequestError('Bail non trouvé ou accès refusé');
  }

  // Check if lease has installments with payments allocated
  const installmentsWithPayments = await prisma.rentalInstallment.findFirst({
    where: {
      tenant_id: tenantId,
      lease_id: leaseId,
      payments: {
        some: {}
      }
    }
  });

  if (installmentsWithPayments) {
    throw new BadRequestError(
      "Impossible de supprimer le bail : certaines échéances ont des paiements alloués. Supprimez d'abord les paiements."
    );
  }

  // Check if lease is ACTIVE - warn but allow deletion
  if (lease.status === RentalLeaseStatus.ACTIVE) {
    logger.warn('Deleting active lease', {
      tenantId,
      leaseId,
      actorUserId
    });
  }

  // Delete the lease (cascade will handle related items like co-renters, installments without payments, etc.)
  const propertyId = lease.property_id;
  // Un bail ACTIVE supprime peut faire sortir le logement de la reserve de
  // lots (D1) : recalcul dans la meme transaction.
  await prisma.$transaction(async tx => {
    await tx.rentalLease.delete({
      where: {
        id: leaseId,
        tenant_id: tenantId
      }
    });
    await syncLotActivationsTx(tx, tenantId, { propertyIds: [propertyId] }, { actorUserId, reason: 'LEASE_DELETED' });
    // Critical action: audit trail written in the same transaction.
    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: 'RENTAL_LEASE_DELETED',
      entityType: 'RENTAL_LEASE',
      entityId: leaseId,
      payload: {
        leaseNumber: lease.lease_number,
        status: lease.status
      }
    });
  });

  logger.info('Rental lease deleted', {
    tenantId,
    leaseId,
    leaseNumber: lease.lease_number,
    actorUserId
  });

  // Revert property status to AVAILABLE when no other active leases exist for this property
  const otherActiveLeases = await prisma.rentalLease.count({
    where: {
      property_id: propertyId,
      tenant_id: tenantId,
      status: RentalLeaseStatus.ACTIVE
    }
  });
  if (otherActiveLeases === 0) {
    try {
      await updatePropertyStatus(
        propertyId,
        PropertyStatus.AVAILABLE,
        tenantId,
        undefined,
        actorUserId,
        'Statut réinitialisé à Disponible après suppression du bail'
      );
      logger.info('Property status reverted to AVAILABLE after lease deletion', {
        propertyId
      });
    } catch (statusError: any) {
      logger.warn('Could not revert property status after lease deletion', {
        propertyId,
        error: statusError?.message
      });
    }
  }
}
