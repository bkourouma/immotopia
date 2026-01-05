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
 * Format amount in FCFA (no decimals, thousands separator)
 */
function formatAmount(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '0';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';
  return Math.round(num).toLocaleString('fr-FR');
}

/**
 * Build context for LEASE_HABITATION document
 */
export async function buildLeaseHabitationContext(
  tenantId: string,
  leaseId: string
): Promise<Record<string, any>> {
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
          user: true
        }
      },
      ownerClient: {
        include: {
          user: true
        }
      },
      tenant: true,
      coRenters: {
        include: {
          renterClient: {
            include: {
              user: true
            }
          }
        }
      }
    }
  });

  if (!lease) {
    throw new Error('Lease not found');
  }

  const context: Record<string, any> = {
    // Tenant (Agency) info
    AGENCE_NOM: lease.tenant.name || '',
    AGENCE_ADRESSE: lease.tenant.address || '',
    AGENCE_TELEPHONE: lease.tenant.contactPhone || '',
    AGENCE_EMAIL: lease.tenant.contactEmail || '',

    // Property info
    BIEN_ADRESSE: lease.property.address || '',
    BIEN_TYPE: lease.property.propertyType || '',
    BIEN_SURFACE: formatAmount(lease.property.surfaceArea),
    BIEN_PIECES: lease.property.rooms?.toString() || '',
    BIEN_CHAMBRES: lease.property.bedrooms?.toString() || '',

    // Lease info
    BAIL_NUMERO: lease.lease_number || '',
    BAIL_DATE_DEBUT: formatDate(lease.start_date),
    BAIL_DATE_FIN: lease.end_date ? formatDate(lease.end_date) : '',
    BAIL_LOYER_MENSUEL: formatAmount(lease.rent_amount),
    BAIL_CHARGES: formatAmount(lease.service_charge_amount),
    BAIL_DEPOT_GARANTIE: formatAmount(lease.security_deposit_amount),
    BAIL_FREQUENCE: lease.billing_frequency || '',
    BAIL_JOUR_ECHEANCE: lease.due_day_of_month?.toString() || '',

    // Renter info
    LOCATAIRE_NOM: lease.primaryRenter?.user?.fullName || '',
    LOCATAIRE_EMAIL: lease.primaryRenter?.user?.email || '',
    LOCATAIRE_TELEPHONE: '', // Add if available in user details

    // Owner info
    BAILLEUR_NOM: lease.ownerClient?.user?.fullName || '',
    BAILLEUR_EMAIL: lease.ownerClient?.user?.email || '',
    BAILLEUR_TELEPHONE: '', // Add if available

    // Dates
    DATE_GENERATION: formatDate(new Date()),
    DATE_SIGNATURE: formatDate(lease.start_date)
  };

  // Add co-renters if any
  if (lease.coRenters && lease.coRenters.length > 0) {
    context.COLOCATAIRES = lease.coRenters.map((cr) => ({
      NOM: cr.renterClient?.user?.fullName || '',
      EMAIL: cr.renterClient?.user?.email || ''
    }));
  }

  return context;
}

/**
 * Build context for LEASE_COMMERCIAL document
 */
export async function buildLeaseCommercialContext(
  tenantId: string,
  leaseId: string
): Promise<Record<string, any>> {
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
              user: true
            }
          },
          tenant: true
        }
      },
      renterClient: {
        include: {
          user: true
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
    BAIL_LOYER_MENSUEL: formatAmount(payment.lease?.rent_amount),

    // Renter info
    LOCATAIRE_NOM: payment.renterClient?.user?.fullName || payment.lease?.primaryRenter?.user?.fullName || '',
    LOCATAIRE_EMAIL: payment.renterClient?.user?.email || payment.lease?.primaryRenter?.user?.email || '',

    // Payment info
    PAIEMENT_MONTANT: formatAmount(payment.amount),
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
          user: true
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
    totalDue += Number(inst.amount_rent) + Number(inst.amount_service) + Number(inst.amount_other_fees);
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
    BAIL_LOYER_MENSUEL: formatAmount(lease.rent_amount),

    // Renter info
    LOCATAIRE_NOM: lease.primaryRenter?.user?.fullName || '',
    LOCATAIRE_EMAIL: lease.primaryRenter?.user?.email || '',

    // Period info
    PERIODE_DEBUT: formatDate(startDate),
    PERIODE_FIN: formatDate(endDate),

    // Totals
    TOTAL_DU: formatAmount(totalDue),
    TOTAL_PAYE: formatAmount(totalPaid),
    SOLDE: formatAmount(totalDue - totalPaid),

    // Installments detail
    ECHEANCES: installments.map(inst => ({
      MOIS: `${inst.period_month}/${inst.period_year}`,
      DATE_ECHEANCE: formatDate(inst.due_date),
      MONTANT_DU: formatAmount(Number(inst.amount_rent) + Number(inst.amount_service) + Number(inst.amount_other_fees)),
      MONTANT_PAYE: formatAmount(inst.amount_paid),
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
  const criticalPlaceholders = [
    'AGENCE_NOM',
    'LOCATAIRE_NOM',
    'BAIL_NUMERO',
    'BAIL_LOYER_MENSUEL'
  ];

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


