import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { DocumentType } from '@prisma/client';

/**
 * Format date to DD/MM/YYYY
 */
function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Nombre entier, separateur de milliers francais. Sans unite : c'est le modele
 * qui pose la sienne (une surface s'ecrit en m2, pas en francs).
 */
function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  return Math.round(num).toLocaleString('fr-FR');
}

/**
 * Libelle de devise tel qu'un lecteur ivoirien l'ecrit.
 *
 * Le code ISO de la zone UEMOA est `XOF`, mais personne ne l'ecrit ainsi sur un
 * contrat : on ecrit FCFA. Les autres devises sont laissees telles quelles.
 */
function currencyLabel(currency: string | null | undefined): string {
  const code = (currency || '').toUpperCase();
  if (!code || code === 'XOF' || code === 'CFA' || code === 'XAF') return 'FCFA';
  return code;
}

/**
 * Montant suivi de sa devise.
 *
 * Sans la devise, un contrat porte « Le loyer est fixe a 120 000 » — une somme
 * sans unite, qu'un bailleur ne peut pas signer en l'etat.
 */
function formatAmount(amount: number | string | null | undefined, currency?: string | null): string {
  return `${formatNumber(amount)} ${currencyLabel(currency)}`;
}

/**
 * Helper function to get phone from TenantClient
 * Priority: 1. CRM Contact phonePrimary (from details.crmContactId), 2. CRM Contact phoneSecondary, 3. CRM Contact whatsappNumber, 4. TenantClient.details.phone
 */
async function getPhoneFromClient(client: any, tenantId?: string, clientType: string = 'unknown'): Promise<string> {
  logger.info('getPhoneFromClient called', {
    clientType,
    hasClient: !!client,
    tenantId,
    clientId: client?.id,
    hasDetails: !!client?.details
  });

  if (!client) {
    logger.warn('getPhoneFromClient: No client provided', { clientType });
    return '';
  }

  // First, try to get phone from CRM Contact via crmContactId in details
  if (client.details) {
    try {
      const details = typeof client.details === 'string' ? JSON.parse(client.details) : client.details;

      logger.info('getPhoneFromClient: Parsed details', {
        clientType,
        clientId: client.id,
        hasCrmContactId: !!details?.crmContactId,
        crmContactId: details?.crmContactId,
        hasPhoneInDetails: !!(details?.phone || details?.telephone || details?.mobile),
        phoneInDetails: details?.phone || details?.telephone || details?.mobile
      });

      // If we have a crmContactId, fetch the contact
      if (details?.crmContactId && tenantId) {
        try {
          logger.info('getPhoneFromClient: Fetching CRM contact', {
            clientType,
            crmContactId: details.crmContactId,
            tenantId
          });

          const contact = await prisma.crmContact.findFirst({
            where: {
              id: details.crmContactId,
              tenantId: tenantId
            },
            select: {
              id: true,
              phonePrimary: true,
              phoneSecondary: true,
              whatsappNumber: true
            }
          });

          if (contact) {
            logger.info('getPhoneFromClient: CRM contact found', {
              clientType,
              crmContactId: contact.id,
              phonePrimary: contact.phonePrimary,
              phoneSecondary: contact.phoneSecondary,
              whatsappNumber: contact.whatsappNumber
            });

            if (contact.phonePrimary) {
              logger.info('getPhoneFromClient: Returning phonePrimary from CRM contact', {
                clientType,
                phone: contact.phonePrimary
              });
              return contact.phonePrimary;
            }
            if (contact.phoneSecondary) {
              logger.info('getPhoneFromClient: Returning phoneSecondary from CRM contact', {
                clientType,
                phone: contact.phoneSecondary
              });
              return contact.phoneSecondary;
            }
            if (contact.whatsappNumber) {
              logger.info('getPhoneFromClient: Returning whatsappNumber from CRM contact', {
                clientType,
                phone: contact.whatsappNumber
              });
              return contact.whatsappNumber;
            }

            logger.warn('getPhoneFromClient: CRM contact found but no phone available', {
              clientType,
              crmContactId: contact.id
            });
          } else {
            logger.warn('getPhoneFromClient: CRM contact not found', {
              clientType,
              crmContactId: details.crmContactId,
              tenantId
            });
          }
        } catch (error) {
          // If contact fetch fails, continue to fallback
          logger.error('getPhoneFromClient: Failed to fetch CRM contact', {
            clientType,
            crmContactId: details.crmContactId,
            tenantId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      } else {
        logger.info('getPhoneFromClient: No crmContactId or tenantId', {
          clientType,
          hasCrmContactId: !!details?.crmContactId,
          hasTenantId: !!tenantId
        });
      }

      // Fallback to phone in details
      const phoneFromDetails = details?.phone || details?.telephone || details?.mobile || '';
      if (phoneFromDetails) {
        logger.info('getPhoneFromClient: Returning phone from details', {
          clientType,
          phone: phoneFromDetails
        });
      } else {
        logger.warn('getPhoneFromClient: No phone found in details', {
          clientType,
          detailsKeys: Object.keys(details || {})
        });
      }
      return phoneFromDetails;
    } catch (error) {
      logger.error('getPhoneFromClient: Error parsing details', {
        clientType,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return '';
    }
  } else {
    logger.warn('getPhoneFromClient: No details in client', {
      clientType,
      clientId: client.id
    });
  }

  return '';
}

/**
 * Build context for LEASE_HABITATION document
 */
export async function buildLeaseHabitationContext(tenantId: string, leaseId: string): Promise<Record<string, any>> {
  logger.info('buildLeaseHabitationContext: Starting', { tenantId, leaseId });

  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    },
    include: {
      property: {
        include: {
          tenant: true
        }
      },
      primaryRenter: {
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          }
        }
      },
      ownerClient: {
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          }
        }
      },
      tenant: true,
      coRenters: {
        include: {
          renterClient: {
            include: {
              user: {
                select: { id: true, email: true, fullName: true }
              }
            }
          }
        }
      }
    }
  });

  if (!lease) {
    throw new Error('Lease not found');
  }

  // Helper function to format billing frequency
  const formatBillingFrequency = (freq: string | null | undefined): string => {
    if (!freq) return '';
    // Accorde au feminin et en minuscules : la valeur s'insere dans une phrase
    // (« la facturation est trimestrielle »), pas dans une case de tableau.
    // « La facturation est TRIMESTRIEL » se lit deux fois mal.
    const mapping: Record<string, string> = {
      MONTHLY: 'mensuelle',
      QUARTERLY: 'trimestrielle',
      SEMIANNUAL: 'semestrielle',
      ANNUAL: 'annuelle'
    };
    return mapping[freq.toUpperCase()] || freq;
  };

  const context: Record<string, any> = {
    // Tenant (Agency) info
    AGENCE_NOM: lease.tenant.name || '',
    AGENCE_ADRESSE: lease.tenant.address || lease.tenant.city || '',
    AGENCE_TELEPHONE: lease.tenant.contactPhone || '',
    AGENCE_EMAIL: lease.tenant.contactEmail || '',

    // Property info
    BIEN_ADRESSE: lease.property.address || '',
    BIEN_TYPE: lease.property.propertyType || '',
    // Une surface n'est pas une somme : pas de devise ici.
    BIEN_SURFACE: formatNumber(lease.property.surfaceArea),
    BIEN_PIECES: lease.property.rooms?.toString() || '',
    BIEN_CHAMBRES: lease.property.bedrooms?.toString() || '',

    // Lease info
    BAIL_NUMERO: lease.lease_number || '',
    BAIL_DATE_DEBUT: formatDate(lease.start_date),
    BAIL_DATE_FIN: lease.end_date ? formatDate(lease.end_date) : '',
    BAIL_LOYER_MENSUEL: formatAmount(lease.rent_amount, lease.currency),
    BAIL_CHARGES: formatAmount(lease.service_charge_amount, lease.currency),
    BAIL_DEPOT_GARANTIE: formatAmount(lease.security_deposit_amount, lease.currency),
    BAIL_FREQUENCE: formatBillingFrequency(lease.billing_frequency),
    BAIL_JOUR_ECHEANCE: lease.due_day_of_month?.toString() || '',

    // Renter info
    LOCATAIRE_NOM: lease.primaryRenter?.user?.fullName || '',
    LOCATAIRE_EMAIL: lease.primaryRenter?.user?.email || '',
    LOCATAIRE_TELEPHONE: (await getPhoneFromClient(lease.primaryRenter, tenantId, 'LOCATAIRE')) || '',

    // Owner info
    BAILLEUR_NOM: lease.ownerClient?.user?.fullName || '',
    BAILLEUR_EMAIL: lease.ownerClient?.user?.email || '',
    BAILLEUR_TELEPHONE: (await getPhoneFromClient(lease.ownerClient, tenantId, 'BAILLEUR')) || '',

    // Dates
    DATE_GENERATION: formatDate(new Date()),
    DATE_SIGNATURE: formatDate(lease.start_date)
  };

  logger.info('buildLeaseHabitationContext: Context built', {
    leaseId: lease.id,
    tenantId: lease.tenant_id,
    tenantName: lease.tenant.name,
    tenantAddress: lease.tenant.address,
    tenantCity: lease.tenant.city,
    tenantContactPhone: lease.tenant.contactPhone,
    tenantContactEmail: lease.tenant.contactEmail,
    hasLOCATAIRE_TELEPHONE: !!context.LOCATAIRE_TELEPHONE,
    LOCATAIRE_TELEPHONE: context.LOCATAIRE_TELEPHONE,
    hasBAILLEUR_TELEPHONE: !!context.BAILLEUR_TELEPHONE,
    BAILLEUR_TELEPHONE: context.BAILLEUR_TELEPHONE,
    hasAGENCE_ADRESSE: !!context.AGENCE_ADRESSE,
    AGENCE_ADRESSE: context.AGENCE_ADRESSE,
    hasAGENCE_TELEPHONE: !!context.AGENCE_TELEPHONE,
    AGENCE_TELEPHONE: context.AGENCE_TELEPHONE,
    hasAGENCE_EMAIL: !!context.AGENCE_EMAIL,
    AGENCE_EMAIL: context.AGENCE_EMAIL
  });

  // Add co-renters if any
  if (lease.coRenters && lease.coRenters.length > 0) {
    context.COLOCATAIRES = lease.coRenters.map(cr => ({
      NOM: cr.renterClient?.user?.fullName || '',
      EMAIL: cr.renterClient?.user?.email || ''
    }));
  }

  return context;
}

/**
 * Build context for LEASE_COMMERCIAL document
 */
export async function buildLeaseCommercialContext(tenantId: string, leaseId: string): Promise<Record<string, any>> {
  // Similar to habitation but with commercial-specific fields
  return buildLeaseHabitationContext(tenantId, leaseId);
}

/**
 * Build context for RENT_RECEIPT document
 */
export async function buildRentReceiptContext(
  tenantId: string,
  paymentId: string,
  installmentId?: string
): Promise<Record<string, any>> {
  const payment = await prisma.rentalPayment.findFirst({
    where: {
      id: paymentId,
      tenant_id: tenantId
    },
    include: {
      lease: {
        include: {
          property: true,
          primaryRenter: {
            include: {
              user: {
                select: { id: true, email: true, fullName: true }
              }
            }
          },
          tenant: true
        }
      },
      renterClient: {
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          }
        }
      },
      allocations: {
        include: {
          installment: true
        }
      }
    }
  });

  if (!payment) {
    throw new Error('Payment not found');
  }

  // Get installment if provided or from first allocation
  let installment = null;
  if (installmentId) {
    installment = await prisma.rentalInstallment.findFirst({
      where: {
        id: installmentId,
        tenant_id: tenantId,
        lease_id: payment.lease_id || undefined
      },
      include: {
        items: true
      }
    });
  } else if (payment.allocations && payment.allocations.length > 0) {
    installment = await prisma.rentalInstallment.findFirst({
      where: {
        id: payment.allocations[0].installment_id,
        tenant_id: tenantId
      },
      include: {
        items: true
      }
    });
  }

  const context: Record<string, any> = {
    // Tenant (Agency) info
    AGENCE_NOM: payment.lease?.tenant.name || '',
    AGENCE_ADRESSE: payment.lease?.tenant.address || '',
    AGENCE_TELEPHONE: payment.lease?.tenant.contactPhone || '',
    AGENCE_EMAIL: payment.lease?.tenant.contactEmail || '',

    // Property info
    BIEN_ADRESSE: payment.lease?.property.address || '',
    BIEN_TYPE: payment.lease?.property.propertyType || '',

    // Lease info
    BAIL_NUMERO: payment.lease?.lease_number || '',
    BAIL_LOYER_MENSUEL: formatAmount(payment.lease?.rent_amount, payment.lease?.currency),

    // Renter info
    LOCATAIRE_NOM: payment.renterClient?.user?.fullName || payment.lease?.primaryRenter?.user?.fullName || '',
    LOCATAIRE_EMAIL: payment.renterClient?.user?.email || payment.lease?.primaryRenter?.user?.email || '',
    LOCATAIRE_TELEPHONE:
      (await getPhoneFromClient(payment.renterClient || payment.lease?.primaryRenter, tenantId, 'LOCATAIRE')) || '',

    // Payment info
    PAIEMENT_MONTANT: formatAmount(payment.amount, payment.currency),
    PAIEMENT_METHODE: payment.method || '',
    PAIEMENT_DATE: formatDate(payment.succeeded_at || payment.initiated_at),
    PAIEMENT_NUMERO: payment.id.substring(0, 8).toUpperCase(),

    // Period info
    PERIODE_MOIS: installment ? `${installment.period_month}/${installment.period_year}` : '',
    PERIODE_ANNEE: installment?.period_year?.toString() || '',

    // Dates
    DATE_GENERATION: formatDate(new Date())
  };

  return context;
}

/**
 * Build context for RENT_STATEMENT document
 */
export async function buildRentStatementContext(
  tenantId: string,
  leaseId: string,
  startDate: Date,
  endDate: Date
): Promise<Record<string, any>> {
  const lease = await prisma.rentalLease.findFirst({
    where: {
      id: leaseId,
      tenant_id: tenantId
    },
    include: {
      property: true,
      primaryRenter: {
        include: {
          user: {
            select: { id: true, email: true, fullName: true }
          }
        }
      },
      tenant: true,
      installments: {
        where: {
          due_date: {
            gte: startDate,
            lte: endDate
          }
        },
        include: {
          items: true,
          payments: {
            include: {
              payment: true
            }
          }
        },
        orderBy: {
          due_date: 'asc'
        }
      }
    }
  });

  if (!lease) {
    throw new Error('Lease not found');
  }

  // Calculate totals
  let totalDue = 0;
  let totalPaid = 0;
  const installments = lease.installments || [];

  installments.forEach(inst => {
    totalDue +=
      Number(inst.amount_rent) +
      Number(inst.amount_service) +
      Number(inst.amount_other_fees) +
      Number(inst.penalty_amount || 0);
    totalPaid += Number(inst.amount_paid);
  });

  const context: Record<string, any> = {
    // Tenant (Agency) info
    AGENCE_NOM: lease.tenant.name || '',
    AGENCE_ADRESSE: lease.tenant.address || '',
    AGENCE_TELEPHONE: lease.tenant.contactPhone || '',
    AGENCE_EMAIL: lease.tenant.contactEmail || '',

    // Property info
    BIEN_ADRESSE: lease.property.address || '',
    BIEN_TYPE: lease.property.propertyType || '',

    // Lease info
    BAIL_NUMERO: lease.lease_number || '',
    BAIL_LOYER_MENSUEL: formatAmount(lease.rent_amount, lease.currency),

    // Renter info
    LOCATAIRE_NOM: lease.primaryRenter?.user?.fullName || '',
    LOCATAIRE_EMAIL: lease.primaryRenter?.user?.email || '',
    LOCATAIRE_TELEPHONE: (await getPhoneFromClient(lease.primaryRenter, tenantId, 'LOCATAIRE')) || '',

    // Period info
    PERIODE_DEBUT: formatDate(startDate),
    PERIODE_FIN: formatDate(endDate),

    // Totals
    TOTAL_DU: formatAmount(totalDue, lease.currency),
    TOTAL_PAYE: formatAmount(totalPaid, lease.currency),
    SOLDE: formatAmount(totalDue - totalPaid, lease.currency),

    // Installments detail
    ECHEANCES: installments.map(inst => ({
      MOIS: `${inst.period_month}/${inst.period_year}`,
      DATE_ECHEANCE: formatDate(inst.due_date),
      MONTANT_DU: formatAmount(
        Number(inst.amount_rent) +
          Number(inst.amount_service) +
          Number(inst.amount_other_fees) +
          Number(inst.penalty_amount || 0),
        inst.currency || lease.currency
      ),
      MONTANT_PAYE: formatAmount(inst.amount_paid, inst.currency || lease.currency),
      STATUT: inst.status
    })),

    // Dates
    DATE_GENERATION: formatDate(new Date())
  };

  return context;
}

/**
 * Build context for a document type
 */
export async function buildDocumentContext(
  tenantId: string,
  docType: DocumentType,
  sourceKey: string,
  additionalParams?: {
    installmentId?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<Record<string, any>> {
  switch (docType) {
    case DocumentType.LEASE_HABITATION:
      return buildLeaseHabitationContext(tenantId, sourceKey);

    case DocumentType.LEASE_COMMERCIAL:
      return buildLeaseCommercialContext(tenantId, sourceKey);

    case DocumentType.RENT_RECEIPT:
      return buildRentReceiptContext(tenantId, sourceKey, additionalParams?.installmentId);

    case DocumentType.RENT_STATEMENT:
      if (!additionalParams?.startDate || !additionalParams?.endDate) {
        throw new Error('Start date and end date required for RENT_STATEMENT');
      }
      return buildRentStatementContext(tenantId, sourceKey, additionalParams.startDate, additionalParams.endDate);

    default:
      throw new Error(`Unsupported document type: ${docType}`);
  }
}

/**
 * Validate context against template placeholders
 */
export function validateContext(
  context: Record<string, any>,
  placeholders: string[]
): { missing: string[]; warnings: string[] } {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Critical placeholders that must be present
  const criticalPlaceholders = ['AGENCE_NOM', 'LOCATAIRE_NOM', 'BAIL_NUMERO', 'BAIL_LOYER_MENSUEL'];

  placeholders.forEach(placeholder => {
    if (!(placeholder in context) || context[placeholder] === null || context[placeholder] === undefined) {
      if (criticalPlaceholders.includes(placeholder)) {
        missing.push(placeholder);
      } else {
        warnings.push(placeholder);
      }
    }
  });

  return { missing, warnings };
}
