/**
 * Tenant Portal Service
 * Business logic for tenant portal operations
 */

import { depositCurrentBalance } from './rental-deposit-balance';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { toInstallmentOverview } from '../utils/installment-overview';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  DashboardData,
  LeaseOverview,
  InstallmentOverview,
  PaymentOverview,
  DepositOverview,
  MaintenanceSummary
} from '../types/tenant-portal-types';
import {
  RentalInstallmentStatus,
  RentalPaymentStatus,
  MaintenanceTicketStatus,
  MaintenanceTicketCommentAuthorType,
  type Prisma
} from '@prisma/client';
import { getDeposit, listDepositMovements } from './rental-deposit-service';
import { createTicket, getTicketById } from './maintenance-ticket-service';
import type { CreateTicketRequest } from '../types/maintenance-types';
import { uploadAttachment } from './maintenance-attachment-service';
import { addComment } from './maintenance-comment-service';
import { getDocumentFile } from './document-generation-service';
import {
  findTenantPortalTicket,
  resolveTenantPortalCrmContactId,
  tenantPortalTicketFilter
} from '../lib/maintenance/portal-visibility';
import { BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { isUuid } from '../lib/signature/sources/guards';
import { detectDocumentKind, detectImageKind, extensionForKind } from '../utils/file-signature';
import { env } from '../config/env';
import { PORTAL_RENTAL_DOCUMENT_SELECT, toPortalAttachment, toPortalRentalDocument } from '../lib/files/portal-files';
import {
  buildTenantDeclarationsFilters,
  buildTenantInstallmentsSearch,
  buildTenantPaymentsSearch,
  buildTenantTicketsWhere,
  tenantEnumClause,
  type TenantTicketsFilters
} from './portal-list-filters/tenant-portal-list-filters';

/** Montant exigé d'une échéance : loyer, charges, autres frais et pénalité. */
function installmentTotal(inst: {
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
  penalty_amount: unknown;
}): number {
  return (
    Number(inst.amount_rent) +
    Number(inst.amount_service) +
    Number(inst.amount_other_fees) +
    Number(inst.penalty_amount || 0)
  );
}

/** Reste dû : total moins le plus grand du cumul des allocations SUCCESS et de `amount_paid`. */
function installmentRemaining(inst: {
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
  penalty_amount: unknown;
  amount_paid?: unknown;
  payments?: Array<{ amount: unknown; payment?: { status?: unknown } | null }>;
}): number {
  const fromAllocations = (inst.payments ?? []).reduce(
    (sum, a) => (a.payment?.status === RentalPaymentStatus.SUCCESS ? sum + Number(a.amount || 0) : sum),
    0
  );
  return installmentTotal(inst) - Math.max(fromAllocations, Number(inst.amount_paid || 0));
}

/**
 * Colonnes d'une ligne d'échéance exposées au portail : ni `tenant_id`, ni
 * `metadata`, ni `installment_id`.
 */
const PORTAL_ITEM_SELECT = {
  id: true,
  charge_type: true,
  label: true,
  amount: true,
  currency: true,
  created_at: true
} as const;

/** Colonnes d'une affectation exposées au portail : ni `tenant_id`, ni `payment_id`, ni `installment_id`. */
const PORTAL_ALLOCATION_SELECT = {
  id: true,
  amount: true,
  currency: true,
  created_at: true
} as const;

/** « •••• 1234 » : seuls les 4 derniers chiffres d'un numéro (H34). */
function maskPhoneTail(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `•••• ${digits.slice(-4)}`;
}

/** Un identifiant qui n'a pas la forme d'un UUID ne désigne rien : 404, jamais une erreur de base. */
function assertKnownId(id: string | undefined, message: string): string {
  if (!id || !isUuid(id)) {
    throw new NotFoundError(message);
  }
  return id;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Brouillon dont la date est passée (BUG-2026-11-04-054, H30) : l'agence
 * l'affiche « En retard » sans attendre la tâche de 02:00
 * (`rental-installment-service.ts`, statut EFFECTIF). Le portail applique la
 * même règle à l'affichage ; rien n'est écrit en base. Un brouillon futur
 * reste un brouillon.
 */
function isOverdueDraft(inst: { status: unknown; due_date: Date | string }, today: Date = startOfToday()): boolean {
  if (inst.status !== RentalInstallmentStatus.DRAFT) return false;
  const dueDate = new Date(inst.due_date);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
}

/** Filtre Prisma : échéances exigibles — facturées, ou brouillons déjà échus. */
function billableWhere(today: Date): Prisma.RentalInstallmentWhereInput {
  return {
    OR: [
      {
        status: {
          in: [RentalInstallmentStatus.DUE, RentalInstallmentStatus.PARTIAL, RentalInstallmentStatus.OVERDUE]
        }
      },
      { status: RentalInstallmentStatus.DRAFT, due_date: { lt: today } }
    ]
  };
}

export class TenantPortalService {
  /**
   * Fiche CRM du locataire connecte, pour les colonnes qui en exigent une
   * (`maintenance_tickets.tenant_contact_id`, `created_by_contact_id`,
   * `maintenance_ticket_attachments.uploaded_by_contact_id`,
   * `maintenance_ticket_comments.author_contact_id` referencent tous
   * `crm_contacts`). La resolution vit avec la regle de visibilite des
   * tickets, qui s'appuie sur la meme fiche : lib/maintenance/portal-visibility.ts.
   */
  private resolveCrmContactId(tenantId: string, tenantClientId: string): Promise<string | undefined> {
    return resolveTenantPortalCrmContactId(tenantId, tenantClientId);
  }

  /**
   * Baux actifs du locataire connecté (H29) : de quoi alimenter un sélecteur.
   * `leaseIds` vient de `listPortalLeaseIds` (périmètre du client connecté) ;
   * la requête reste filtrée par `tenantId`. Aucun champ interne.
   */
  async getLeases(tenantId: string, leaseIds: string[], defaultLeaseId: string) {
    if (leaseIds.length === 0) return [];
    const rows = await prisma.rentalLease.findMany({
      where: { id: { in: leaseIds }, tenant_id: tenantId },
      select: {
        id: true,
        lease_number: true,
        start_date: true,
        end_date: true,
        rent_amount: true,
        service_charge_amount: true,
        property: { select: { address: true, title: true } }
      },
      orderBy: [{ start_date: 'asc' }, { id: 'asc' }]
    });
    return rows.map(row => ({
      id: row.id,
      leaseNumber: row.lease_number,
      propertyAddress: row.property?.address || row.property?.title || '',
      startDate: row.start_date,
      endDate: row.end_date,
      monthlyRent: Number(row.rent_amount),
      serviceCharges: Number(row.service_charge_amount),
      isDefault: row.id === defaultLeaseId
    }));
  }

  /**
   * Get dashboard data for tenant portal
   * Aggregates lease overview, balance, next installment, recent payments, deposit, and maintenance summary
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @returns Dashboard data
   */
  async getDashboard(
    tenantClientId: string,
    leaseId: string,
    tenantId: string,
    leaseIds?: string[]
  ): Promise<DashboardData> {
    try {
      // H29 : soldes, retards, prochaine échéance et paiements cumulent tous les
      // baux du périmètre ; bail, dépôt et maintenance suivent `leaseId`.
      const scope = leaseIds && leaseIds.length > 0 ? leaseIds : [leaseId];
      const today = startOfToday();
      // Get lease with property and primary renter
      const lease = await prisma.rentalLease.findFirst({
        where: {
          id: leaseId,
          tenant_id: tenantId
        },
        include: {
          property: {
            select: {
              id: true,
              address: true,
              title: true
            }
          },
          primaryRenter: {
            select: {
              id: true,
              user: {
                select: {
                  fullName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!lease) {
        throw new NotFoundError('Bail non trouvé');
      }

      // Build lease overview
      const leaseOverview: LeaseOverview = {
        id: lease.id,
        propertyAddress: lease.property.address || lease.property.title || '',
        startDate: lease.start_date,
        endDate: lease.end_date,
        monthlyRent: Number(lease.rent_amount),
        serviceCharges: Number(lease.service_charge_amount),
        status: lease.status
      };

      // Calculate current balance (T021) : reste dû de toutes les échéances
      // facturées (à échoir, en retard ET partiellement payées). Les
      // brouillons et les échéances annulées ne sont pas dus.
      const dueInstallments = await prisma.rentalInstallment.findMany({
        where: {
          lease_id: { in: scope },
          tenant_id: tenantId,
          ...billableWhere(today)
        },
        include: {
          payments: { select: { amount: true, payment: { select: { status: true } } } }
        }
      });

      let currentBalance = 0;
      let overdueInstallmentsCount = 0;
      const perLease = new Map<string, { balance: number; overdue: number }>();
      for (const inst of dueInstallments) {
        const remaining = installmentRemaining(inst);
        if (remaining <= 0) continue;
        currentBalance += remaining;
        const dueDate = new Date(inst.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const late = inst.status === RentalInstallmentStatus.OVERDUE || dueDate < today;
        if (late) {
          overdueInstallmentsCount++;
        }
        const entry = perLease.get(inst.lease_id) ?? { balance: 0, overdue: 0 };
        entry.balance += remaining;
        if (late) entry.overdue++;
        perLease.set(inst.lease_id, entry);
      }

      // Find next installment (T022) - la plus ancienne échéance non soldée :
      // à échoir, partiellement payée ou en retard (BUG-2026-09-28-027).
      const nextInstallmentRecord = await prisma.rentalInstallment.findFirst({
        where: {
          lease_id: { in: scope },
          tenant_id: tenantId,
          ...billableWhere(today)
        },
        orderBy: {
          due_date: 'asc'
        }
      });

      const nextInstallment: InstallmentOverview | null = nextInstallmentRecord
        ? {
            ...toInstallmentOverview(nextInstallmentRecord),
            leaseId: nextInstallmentRecord.lease_id,
            // Brouillon échu : « En retard » à l'affichage (H30).
            status: isOverdueDraft(nextInstallmentRecord, today)
              ? RentalInstallmentStatus.OVERDUE
              : nextInstallmentRecord.status
          }
        : null;

      // Get recent payments (T023) - last 5 successful payments
      const recentPaymentsRecords = await prisma.rentalPayment.findMany({
        where: {
          lease_id: { in: scope },
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS
        },
        orderBy: {
          succeeded_at: 'desc'
        },
        take: 5
      });

      const recentPayments: PaymentOverview[] = recentPaymentsRecords.map(payment => ({
        id: payment.id,
        amount: Number(payment.amount),
        date: payment.succeeded_at || payment.initiated_at,
        method: payment.method
      }));

      // Get deposit info (T024)
      const deposit = await prisma.rentalSecurityDeposit.findUnique({
        where: {
          lease_id: leaseId
        },
        include: {
          movements: {
            orderBy: {
              created_at: 'desc'
            },
            take: 10
          }
        }
      });

      const targetAmount = deposit ? Number(deposit.target_amount) : Number(lease.security_deposit_amount || 0);
      const collectedAmount = deposit ? Number(deposit.collected_amount) : 0;
      const depositStatus = !deposit
        ? 'NOT_CREATED'
        : collectedAmount >= targetAmount && targetAmount > 0
          ? 'COLLECTED'
          : collectedAmount > 0
            ? 'PARTIAL'
            : 'ACTIVE';

      const depositInfo: DepositOverview = deposit
        ? {
            amount: targetAmount,
            status: depositStatus,
            heldAmount: Number(deposit.held_amount),
            collectedAmount
          }
        : {
            amount: targetAmount,
            status: 'NOT_CREATED',
            heldAmount: 0,
            collectedAmount: 0
          };

      // Get maintenance ticket summary (T025) - counts by status
      const maintenanceTicketsCounts = await prisma.maintenanceTicket.groupBy({
        by: ['status'],
        // Meme regle que la liste (lib/maintenance/portal-visibility.ts).
        where: await tenantPortalTicketFilter({ tenantId, tenantClientId, leaseId, leaseIds: scope }),
        _count: true
      });

      const maintenanceSummary: MaintenanceSummary = {
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0
      };

      for (const count of maintenanceTicketsCounts) {
        maintenanceSummary.total += count._count;
        if (count.status === MaintenanceTicketStatus.DECLARED) {
          maintenanceSummary.open += count._count;
        } else if (
          count.status === MaintenanceTicketStatus.IN_PROGRESS ||
          count.status === MaintenanceTicketStatus.ASSIGNED
        ) {
          maintenanceSummary.inProgress += count._count;
        } else if (count.status === MaintenanceTicketStatus.RESOLVED) {
          maintenanceSummary.resolved += count._count;
        }
      }

      // Plusieurs baux : un résumé par bail (numéro, adresse, solde, retards).
      let leasesSummary: DashboardData['leases'];
      if (scope.length > 1) {
        const leaseRows = await prisma.rentalLease.findMany({
          where: { id: { in: scope }, tenant_id: tenantId },
          select: { id: true, lease_number: true, property: { select: { address: true, title: true } } },
          orderBy: [{ start_date: 'asc' }, { id: 'asc' }]
        });
        leasesSummary = leaseRows.map(row => ({
          id: row.id,
          leaseNumber: row.lease_number,
          propertyAddress: row.property?.address || row.property?.title || '',
          balance: perLease.get(row.id)?.balance ?? 0,
          overdueInstallmentsCount: perLease.get(row.id)?.overdue ?? 0
        }));
      }

      const dashboardData: DashboardData = {
        leases: leasesSummary,
        lease: leaseOverview,
        currentBalance,
        overdueInstallmentsCount,
        nextInstallment,
        recentPayments,
        depositInfo,
        maintenanceTickets: maintenanceSummary
      };

      logger.info('Dashboard data retrieved', {
        tenantClientId,
        leaseId,
        tenantId
      });

      return dashboardData;
    } catch (error) {
      logger.error('Error getting dashboard data', {
        error,
        tenantClientId,
        leaseId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Get complete lease details with property, primary renter, owner, co-renters, and documents
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @returns Lease details data
   */
  async getLeaseDetails(tenantClientId: string, leaseId: string, tenantId: string): Promise<any> {
    try {
      // Get complete lease with property, primary renter, owner (T036)
      const lease = await prisma.rentalLease.findFirst({
        where: {
          id: leaseId,
          tenant_id: tenantId
        },
        // Select explicite, sur le modèle du portail propriétaire : ni `terms_json`,
        // ni `notes` (internes à l'agence, H35), ni `created_by_user_id`, `crm_deal_id`,
        // `signature_request_id`, `owner_client_id`, `property_id`, ni aucun `userId`.
        select: {
          id: true,
          lease_number: true,
          status: true,
          start_date: true,
          end_date: true,
          move_in_date: true,
          move_out_date: true,
          billing_frequency: true,
          due_day_of_month: true,
          currency: true,
          rent_amount: true,
          service_charge_amount: true,
          security_deposit_amount: true,
          penalty_grace_days: true,
          penalty_mode: true,
          penalty_rate: true,
          penalty_fixed_amount: true,
          penalty_cap_amount: true,
          property: {
            select: {
              internalReference: true,
              address: true,
              title: true,
              owner: { select: { fullName: true } },
              containerParent: { select: { title: true } }
            }
          },
          primaryRenter: { select: { user: { select: { fullName: true, email: true } } } },
          ownerClient: { select: { user: { select: { fullName: true, email: true } } } }
        }
      });

      if (!lease) {
        throw new NotFoundError('Bail non trouvé');
      }

      // Get co-renters list (T037) : nom et e-mail seulement.
      const coRentersRecords = await prisma.rentalLeaseCoRenter.findMany({
        where: {
          lease_id: leaseId,
          tenant_id: tenantId
        },
        select: {
          id: true,
          renterClient: { select: { user: { select: { fullName: true, email: true } } } }
        }
      });

      const coRenters = coRentersRecords.map(cr => ({ id: cr.id, user: cr.renterClient.user }));

      // Get associated documents (T038) - grouped by type. Sans chemin disque
      // ni URL de stockage : `downloadPath` (lib/files/portal-files.ts).
      const documents = (
        await prisma.rentalDocument.findMany({
          where: {
            lease_id: leaseId,
            tenant_id: tenantId,
            status: {
              not: 'VOID'
            }
          },
          select: PORTAL_RENTAL_DOCUMENT_SELECT,
          orderBy: {
            issued_at: 'desc'
          }
        })
      ).map(document => toPortalRentalDocument(document, 'tenant'));

      // Group documents by type
      const groupedByType: Record<string, any[]> = {};
      for (const doc of documents) {
        const type = doc.type;
        if (!groupedByType[type]) {
          groupedByType[type] = [];
        }
        groupedByType[type].push(doc);
      }

      const { getPropertyDisplayLabel } = await import('../utils/property-display');
      const lease_label = lease.property ? getPropertyDisplayLabel(lease.property) : '';

      const leaseDetailsData = {
        // Le web lit `lease.id` pour son sélecteur.
        lease: {
          ...lease,
          lease_label,
          property: lease.property,
          primaryRenter: lease.primaryRenter,
          ownerClient: lease.ownerClient
        },
        coRenters,
        documents,
        groupedByType
      };

      logger.info('Lease details retrieved', {
        tenantClientId,
        leaseId,
        tenantId
      });

      return leaseDetailsData;
    } catch (error) {
      logger.error('Error getting lease details', {
        error,
        tenantClientId,
        leaseId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Get installments list with filters and summary
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @param filters - Optional filters (status, startDate, endDate)
   * @param pagination - Optional pagination (page, limit)
   * @returns Installments list with summary
   */
  async getInstallments(
    tenantClientId: string,
    leaseId: string,
    tenantId: string,
    filters?: {
      status?: string | string[];
      startDate?: string;
      endDate?: string;
      search?: string;
    },
    pagination?: {
      page?: number;
      limit?: number;
    },
    leaseIds?: string[]
  ): Promise<any> {
    try {
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 20;
      const skip = (page - 1) * limit;
      // H29 : échéances de tous les baux du périmètre (ou du seul bail demandé).
      const scope = leaseIds && leaseIds.length > 0 ? leaseIds : [leaseId];

      // Build where clause (T045)
      const where: any = {
        lease_id: { in: scope },
        tenant_id: tenantId
      };

      const statuses = filters?.status ? (Array.isArray(filters.status) ? filters.status : [filters.status]) : [];
      if (statuses.includes(RentalInstallmentStatus.OVERDUE)) {
        // Les brouillons échus s'affichent « En retard » (H30) : ils répondent aussi au filtre.
        where.OR = [
          { status: tenantEnumClause(statuses) },
          { status: RentalInstallmentStatus.DRAFT, due_date: { lt: startOfToday() } }
        ];
      } else if (statuses.length > 0) {
        where.status = tenantEnumClause(statuses);
      }

      Object.assign(where, buildTenantInstallmentsSearch(filters?.search));

      if (filters?.startDate || filters?.endDate) {
        where.due_date = {};
        if (filters.startDate) {
          where.due_date.gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          where.due_date.lte = new Date(filters.endDate);
        }
      }

      // Get installments with pagination
      const [installments, total] = await Promise.all([
        prisma.rentalInstallment.findMany({
          where,
          include: {
            items: { select: PORTAL_ITEM_SELECT, orderBy: { created_at: 'asc' } },
            lease: { select: { lease_number: true } },
            payments: {
              select: {
                ...PORTAL_ALLOCATION_SELECT,
                payment: {
                  select: {
                    id: true,
                    amount: true,
                    method: true,
                    status: true,
                    succeeded_at: true
                  }
                }
              }
            }
          },
          orderBy: [{ due_date: 'asc' }, { id: 'asc' }],
          skip,
          take: limit
        }),
        prisma.rentalInstallment.count({ where })
      ]);

      // Calculate summary (T046) with current date for status calculation
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const allInstallments = await prisma.rentalInstallment.findMany({
        where: {
          lease_id: { in: scope },
          tenant_id: tenantId
        },
        select: {
          id: true,
          status: true,
          amount_rent: true,
          amount_service: true,
          amount_other_fees: true,
          penalty_amount: true,
          amount_paid: true,
          due_date: true,
          payments: {
            select: {
              amount: true,
              payment: { select: { status: true } }
            }
          }
        }
      });

      let paidCount = 0;
      let dueCount = 0;
      let overdueCount = 0;
      let partialCount = 0;

      for (const inst of allInstallments) {
        const total =
          Number(inst.amount_rent) +
          Number(inst.amount_service) +
          Number(inst.amount_other_fees) +
          Number(inst.penalty_amount || 0);
        // Use sum of allocations from SUCCESS payments as source of truth (consistency with lease page)
        const amountPaidFromAlloc = (inst.payments || []).reduce(
          (s: number, a: any) => (a.payment?.status === RentalPaymentStatus.SUCCESS ? s + Number(a.amount || 0) : s),
          0
        );
        const amountPaid = Math.max(amountPaidFromAlloc, Number(inst.amount_paid || 0));
        const dueDate = new Date(inst.due_date);
        dueDate.setHours(0, 0, 0, 0);

        // Brouillon futur (pas encore facturée) et annulée : ni due, ni en retard.
        // Un brouillon échu compte comme une échéance en retard (H30).
        if (
          (inst.status === RentalInstallmentStatus.DRAFT && !isOverdueDraft(inst, today)) ||
          inst.status === RentalInstallmentStatus.CANCELED
        ) {
          continue;
        }

        let calculatedStatus: RentalInstallmentStatus;
        if (amountPaid >= total && total > 0) {
          calculatedStatus = RentalInstallmentStatus.PAID;
        } else if (amountPaid > 0 && amountPaid < total) {
          calculatedStatus = RentalInstallmentStatus.PARTIAL;
        } else if (dueDate < today) {
          calculatedStatus = RentalInstallmentStatus.OVERDUE;
        } else if (dueDate >= today) {
          calculatedStatus = RentalInstallmentStatus.DUE;
        } else {
          calculatedStatus = inst.status as RentalInstallmentStatus;
        }

        // Count by calculated status
        if (calculatedStatus === RentalInstallmentStatus.PAID) {
          paidCount++;
        } else if (calculatedStatus === RentalInstallmentStatus.DUE) {
          dueCount++;
        } else if (calculatedStatus === RentalInstallmentStatus.OVERDUE) {
          overdueCount++;
        } else if (calculatedStatus === RentalInstallmentStatus.PARTIAL) {
          // Même règle que l'accueil (BUG-2026-11-03-005) : une partielle échue
          // est en retard, sinon en attente — chaque échéance tombe dans une carte.
          partialCount++;
          if (dueDate < today) {
            overdueCount++;
          } else {
            dueCount++;
          }
        }
      }

      const summary = {
        total: allInstallments.filter(
          i =>
            (i.status !== RentalInstallmentStatus.DRAFT || isOverdueDraft(i, today)) &&
            i.status !== RentalInstallmentStatus.CANCELED
        ).length,
        paid: paidCount,
        due: dueCount,
        overdue: overdueCount,
        partial: partialCount
      };

      // Format installments list with calculated status (using today from summary calculation above)
      // Use sum of allocations from SUCCESS payments as source of truth for amount_paid (consistency with lease page)
      const installmentsList = installments.map(inst => {
        const totalAmount =
          Number(inst.amount_rent) +
          Number(inst.amount_service) +
          Number(inst.amount_other_fees) +
          Number(inst.penalty_amount || 0);
        const amountPaidFromAllocations = (inst.payments || []).reduce(
          (sum: number, alloc: any) =>
            alloc.payment?.status === RentalPaymentStatus.SUCCESS ? sum + Number(alloc.amount || 0) : sum,
          0
        );
        const amountPaid = Math.max(amountPaidFromAllocations, Number(inst.amount_paid || 0));
        const balance = totalAmount - amountPaid;

        // Calculate status based on payment and due date
        let calculatedStatus: RentalInstallmentStatus = inst.status;
        const dueDate = new Date(inst.due_date);
        dueDate.setHours(0, 0, 0, 0);

        // Brouillon futur et annulée gardent leur statut : elles ne sont ni dues ni payables.
        // Un brouillon échu est reclassé comme celles de l'agence (H30, affichage seul).
        if (
          (inst.status !== RentalInstallmentStatus.DRAFT || isOverdueDraft(inst, today)) &&
          inst.status !== RentalInstallmentStatus.CANCELED
        ) {
          if (amountPaid >= totalAmount && totalAmount > 0) {
            calculatedStatus = RentalInstallmentStatus.PAID;
          } else if (amountPaid > 0 && amountPaid < totalAmount) {
            calculatedStatus = RentalInstallmentStatus.PARTIAL;
          } else if (dueDate < today) {
            calculatedStatus = RentalInstallmentStatus.OVERDUE;
          } else if (inst.status !== RentalInstallmentStatus.PAID && inst.status !== RentalInstallmentStatus.PARTIAL) {
            calculatedStatus = RentalInstallmentStatus.DUE;
          }
        }

        return {
          id: inst.id,
          leaseId: inst.lease_id,
          leaseNumber: inst.lease?.lease_number ?? null,
          period: `${inst.period_year}-${String(inst.period_month).padStart(2, '0')}`,
          dueDate: inst.due_date,
          amount: totalAmount,
          paid: amountPaid,
          balance,
          status: calculatedStatus, // Use calculated status instead of stored status
          items: inst.items,
          payments: inst.payments
        };
      });

      logger.info('Installments retrieved', {
        tenantClientId,
        leaseId,
        tenantId,
        count: installments.length
      });

      return {
        installments: installmentsList,
        summary,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Error getting installments', {
        error,
        tenantClientId,
        leaseId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Get installment details with items, allocations, penalties, and related payments
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @param installmentId - Installment ID
   * @returns Installment details data
   */
  async getInstallmentDetails(
    tenantClientId: string,
    leaseId: string,
    tenantId: string,
    installmentId: string,
    leaseIds?: string[]
  ): Promise<any> {
    try {
      assertKnownId(installmentId, 'Échéance non trouvée');
      // Get installment with items, allocations, penalties (T047). L'échéance doit
      // appartenir à un bail du périmètre du locataire, sinon 404 (H29).
      const installment = await prisma.rentalInstallment.findFirst({
        where: {
          id: installmentId,
          lease_id: { in: leaseIds && leaseIds.length > 0 ? leaseIds : [leaseId] },
          tenant_id: tenantId
        },
        // `select` explicite : ni `tenant_id`, ni `invoice_id`, ni `metadata` des lignes.
        select: {
          id: true,
          lease_id: true,
          period_year: true,
          period_month: true,
          due_date: true,
          status: true,
          currency: true,
          amount_rent: true,
          amount_service: true,
          amount_other_fees: true,
          penalty_amount: true,
          amount_paid: true,
          paid_at: true,
          items: {
            select: PORTAL_ITEM_SELECT,
            orderBy: {
              created_at: 'asc'
            }
          },
          payments: {
            select: {
              ...PORTAL_ALLOCATION_SELECT,
              payment: {
                select: {
                  id: true,
                  amount: true,
                  method: true,
                  status: true,
                  currency: true,
                  initiated_at: true,
                  succeeded_at: true,
                  psp_reference: true
                }
              }
            },
            orderBy: {
              created_at: 'desc'
            }
          },
          // Champs affichables seulement : jamais override_reason (motif interne,
          // parfois un chemin /uploads) ni created_by_user_id.
          penalties: {
            select: {
              id: true,
              amount: true,
              currency: true,
              days_late: true,
              calculated_at: true,
              is_manual_override: true,
              created_at: true
            },
            orderBy: {
              created_at: 'desc'
            }
          },
          lease: {
            select: {
              id: true,
              lease_number: true,
              property: {
                select: {
                  id: true,
                  address: true
                }
              }
            }
          }
        }
      });

      if (!installment) {
        throw new NotFoundError('Échéance non trouvée');
      }

      // Get related payments (T048) - all payments for this lease that could be related
      const relatedPayments = await prisma.rentalPayment.findMany({
        where: {
          lease_id: installment.lease_id,
          tenant_id: tenantId,
          status: 'SUCCESS'
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          method: true,
          status: true,
          succeeded_at: true,
          psp_reference: true,
          allocations: {
            where: {
              installment_id: installmentId
            },
            select: {
              id: true,
              amount: true,
              currency: true
            }
          }
        },
        orderBy: {
          succeeded_at: 'desc'
        },
        take: 10
      });

      const installmentDetailsData = {
        installment: {
          ...installment,
          // Brouillon échu : « En retard » à l'affichage, comme à l'agence (H30).
          status: isOverdueDraft(installment) ? RentalInstallmentStatus.OVERDUE : installment.status,
          totalAmount:
            Number(installment.amount_rent) +
            Number(installment.amount_service) +
            Number(installment.amount_other_fees) +
            Number(installment.penalty_amount || 0),
          balance:
            Number(installment.amount_rent) +
            Number(installment.amount_service) +
            Number(installment.amount_other_fees) +
            Number(installment.penalty_amount || 0) -
            Number(installment.amount_paid)
        },
        relatedPayments
      };

      logger.info('Installment details retrieved', {
        tenantClientId,
        leaseId,
        tenantId,
        installmentId
      });

      return installmentDetailsData;
    } catch (error) {
      logger.error('Error getting installment details', {
        error,
        tenantClientId,
        leaseId,
        tenantId,
        installmentId
      });
      throw error;
    }
  }

  /**
   * Declare a payment made outside the portal
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @param data - Payment declaration data
   * @param file - Optional proof file
   * @returns Created payment declaration
   */
  async declarePayment(
    tenantClientId: string,
    defaultLeaseId: string,
    tenantId: string,
    data: {
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      transactionPhone?: string;
      mobileOperator?: string;
      reference?: string;
      installmentId?: string;
      notes?: string;
    },
    file?: Express.Multer.File,
    leaseIds?: string[]
  ): Promise<any> {
    // Le bail de la déclaration est celui de l'échéance visée (H29), à condition
    // qu'elle appartienne au périmètre du locataire ; sinon le bail par défaut.
    let leaseId = defaultLeaseId;
    try {
      // Validate installment if provided (T060)
      if (data.installmentId) {
        assertKnownId(data.installmentId, 'Échéance non trouvée ou non associée à ce bail');
        const installment = await prisma.rentalInstallment.findFirst({
          where: {
            id: data.installmentId,
            lease_id: { in: leaseIds && leaseIds.length > 0 ? leaseIds : [defaultLeaseId] },
            tenant_id: tenantId
          }
        });

        if (!installment) {
          throw new NotFoundError('Échéance non trouvée ou non associée à ce bail');
        }
        leaseId = installment.lease_id;
        // Un brouillon échu est exigible (H30) ; un brouillon futur ou une annulée ne l'est pas.
        if (
          (installment.status === RentalInstallmentStatus.DRAFT && !isOverdueDraft(installment)) ||
          installment.status === RentalInstallmentStatus.CANCELED
        ) {
          throw new BadRequestError("Cette échéance n'est pas exigible : aucun paiement ne peut être déclaré dessus.");
        }
      }

      // Handle file upload if provided (T061)
      let proofFileUrl: string | null = null;
      let writtenProofPath: string | null = null;
      if (file) {
        const cwd = process.cwd();
        const projectRoot =
          path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
            ? path.resolve(cwd, '..', '..')
            : cwd;
        const uploadDir = path.join(projectRoot, 'uploads', 'portal', 'payments', tenantId);
        await fs.mkdir(uploadDir, { recursive: true });

        // L'extension vient du type détecté par signature, jamais du nom envoyé.
        const detectedKind = file.buffer ? (detectDocumentKind(file.buffer) ?? detectImageKind(file.buffer)) : null;
        if (!detectedKind) {
          throw new BadRequestError('Le contenu du fichier ne correspond pas à un type accepté.');
        }
        const fileName = `payment-proof-${Date.now()}-${Math.random().toString(36).substring(7)}${extensionForKind(detectedKind)}`;
        const filePath = path.join(uploadDir, fileName);

        await fs.writeFile(filePath, file.buffer);
        writtenProofPath = filePath;
        proofFileUrl = `/uploads/portal/payments/${tenantId}/${fileName}`;
      }

      // Create payment declaration (T060). Si l'écriture en base échoue, le
      // fichier déjà écrit est supprimé : pas de pièce orpheline sur le disque.
      let paymentDeclaration;
      try {
        paymentDeclaration = await prisma.rentalPaymentDeclaration.create({
          data: {
            tenant_id: tenantId,
            lease_id: leaseId,
            installment_id: data.installmentId || null,
            declared_by: tenantClientId,
            amount: data.amount,
            payment_date: new Date(data.paymentDate),
            payment_method: data.paymentMethod as any,
            mobile_operator: data.mobileOperator ? (data.mobileOperator as any) : null,
            transaction_phone: data.transactionPhone?.trim() || null,
            reference: data.reference || null,
            proof_file_url: proofFileUrl,
            status: 'PENDING',
            notes: data.notes || null
          },
          // `select` explicite : seuls les champs que le locataire doit relire.
          // `proof_file_url` est lu ici pour l'e-mail à l'agence puis retiré de
          // la réponse (voir plus bas), jamais renvoyé au portail.
          select: {
            id: true,
            lease_id: true,
            installment_id: true,
            amount: true,
            payment_date: true,
            payment_method: true,
            mobile_operator: true,
            transaction_phone: true,
            reference: true,
            proof_file_url: true,
            status: true,
            notes: true,
            created_at: true,
            lease: {
              select: {
                id: true,
                lease_number: true
              }
            },
            installment: {
              select: {
                id: true,
                period_year: true,
                period_month: true
              }
            }
          }
        });
      } catch (dbError) {
        if (writtenProofPath) {
          await fs.unlink(writtenProofPath).catch(() => undefined);
        }
        throw dbError;
      }

      logger.info('Payment declaration created', {
        tenantClientId,
        leaseId,
        tenantId,
        declarationId: paymentDeclaration.id,
        amount: data.amount
      });

      // Notify agency users by email (en dur, like account creation for new renter)
      console.log('[DECLARATION] Déclaration créée, envoi notification aux admins du tenant...', {
        tenantId,
        leaseId,
        declarationId: paymentDeclaration.id
      });
      try {
        logger.info('Payment declaration: starting agency notification', {
          tenantId,
          leaseId,
          tenantClientId,
          declarationId: paymentDeclaration.id,
          amount: data.amount
        });

        const { getEmailNotificationConfig } = await import('./email-notification-config-service');
        const notifConfig = await getEmailNotificationConfig(tenantId, 'PAYMENT_DECLARATION_AGENCY');
        if (!notifConfig.enabled) {
          logger.info('Notification PAYMENT_DECLARATION_AGENCY désactivée', {
            tenantId,
            declarationId: paymentDeclaration.id
          });
        } else {
          const { emailService } = await import('./email-service');
          const declarer = await prisma.tenantClient.findFirst({
            where: { id: tenantClientId },
            include: { user: { select: { fullName: true } } }
          });
          const declarerName = declarer?.user?.fullName || 'Locataire';
          const leaseNumber = (paymentDeclaration.lease as { lease_number?: string })?.lease_number || '';

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
            const { getPropertyDisplayLabel } = await import('../utils/property-display');
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
            mobileOperator: data.mobileOperator ?? (paymentDeclaration as any).mobile_operator ?? null,
            transactionPhone: data.transactionPhone?.trim() || (paymentDeclaration as any).transaction_phone || null,
            reference: data.reference || (paymentDeclaration as any).reference || null,
            // Pas de `proofFileUrl` : chemin `/uploads` privé, lien mort et fuite de chemin.
            notes: data.notes ?? (paymentDeclaration as any).notes ?? null
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

            console.log('[DECLARATION] Admins tenant (TENANT_ADMIN):', adminUserIds.length, 'utilisateur(s)');
            logger.info('Payment declaration: tenant admin (TENANT_ADMIN) lookup', {
              tenantId,
              tenantAdminCount: adminUserIds.length
            });

            if (adminUserIds.length > 0) {
              users = await prisma.user.findMany({
                where: { id: { in: adminUserIds }, isActive: true },
                select: { id: true, email: true, fullName: true }
              });
              console.log(
                '[DECLARATION] Emails des admins à notifier:',
                users.map(u => u.email)
              );
              logger.info('Payment declaration: tenant admins to notify', {
                tenantId,
                usersFound: users.length,
                emails: users.map(u => u.email)
              });
            }
          } else {
            console.warn('[DECLARATION] Rôle TENANT_ADMIN introuvable en base.');
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
        console.error('[DECLARATION] Erreur envoi notification:', err?.message, err);
        logger.warn('Error sending payment declaration emails to agency', {
          declarationId: paymentDeclaration.id,
          leaseId,
          error: err?.message
        });
      }

      // La preuve reste privée : ni son chemin de stockage, ni son URL
      // `/uploads/portal/payments/...` ne reviennent au portail.
      const { proof_file_url: proofFileUrlStored, ...declaration } = paymentDeclaration;
      return { ...declaration, hasProof: Boolean(proofFileUrlStored) };
    } catch (error) {
      logger.error('Error declaring payment', {
        error,
        tenantClientId,
        leaseId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Get payment history with filters
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @param filters - Optional filters (startDate, endDate, method)
   * @param pagination - Optional pagination (page, limit)
   * @returns Payment history data
   */
  async getPaymentHistory(
    tenantClientId: string,
    leaseId: string,
    tenantId: string,
    filters?: {
      startDate?: string;
      endDate?: string;
      method?: string | string[];
      search?: string;
    },
    pagination?: {
      page?: number;
      limit?: number;
    },
    leaseIds?: string[]
  ): Promise<any> {
    try {
      const page = pagination?.page || 1;
      const limit = Math.min(pagination?.limit || 50, 100);
      const skip = (page - 1) * limit;
      // H29 : historique de tous les baux du périmètre.
      const scope = leaseIds && leaseIds.length > 0 ? leaseIds : [leaseId];

      // Build where clause (T070)
      const where: any = {
        lease_id: { in: scope },
        tenant_id: tenantId
      };
      const declarationWhere: Prisma.RentalPaymentDeclarationWhereInput = {
        lease_id: { in: scope },
        tenant_id: tenantId,
        declared_by: tenantClientId
      };

      if (filters?.method) {
        where.method = tenantEnumClause(filters.method);
      }

      Object.assign(where, buildTenantPaymentsSearch(filters?.search));
      Object.assign(declarationWhere, buildTenantDeclarationsFilters(filters));

      if (filters?.startDate || filters?.endDate) {
        const dateRange: { gte?: Date; lte?: Date } = {};
        if (filters.startDate) {
          dateRange.gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          dateRange.lte = new Date(filters.endDate);
        }
        // La date affichée est succeededAt, ou initiatedAt si le paiement n'a pas réussi.
        where.OR = [{ succeeded_at: dateRange }, { succeeded_at: null, initiated_at: dateRange }];
      }

      // Get all payments (capped) and declarations so we can merge and paginate
      const [payments, declarations] = await Promise.all([
        prisma.rentalPayment.findMany({
          where,
          include: {
            allocations: {
              include: {
                installment: {
                  select: {
                    id: true,
                    period_year: true,
                    period_month: true,
                    due_date: true
                  }
                }
              },
              orderBy: {
                created_at: 'asc'
              }
            }
          },
          orderBy: {
            succeeded_at: 'desc'
          },
          take: 500
        }),
        prisma.rentalPaymentDeclaration.findMany({
          where: declarationWhere,
          orderBy: { created_at: 'desc' }
        })
      ]);

      // Calculate total paid (T071)
      const totalPaidResult = await prisma.rentalPayment.aggregate({
        where: {
          lease_id: { in: scope },
          tenant_id: tenantId,
          status: 'SUCCESS'
        },
        _sum: {
          amount: true
        }
      });

      const totalPaid = Number(totalPaidResult._sum.amount || 0);

      // Format payments list
      const paymentsList = payments.map(payment => {
        const allocatedAmount = payment.allocations.reduce((sum, alloc) => sum + Number(alloc.amount), 0);

        return {
          id: payment.id,
          amount: Number(payment.amount),
          method: payment.method,
          status: payment.status,
          currency: payment.currency,
          reference: payment.psp_reference || payment.psp_transaction_id || null,
          succeededAt: payment.succeeded_at,
          initiatedAt: payment.initiated_at,
          allocatedAmount,
          unallocatedAmount: Number(payment.amount) - allocatedAmount,
          isDeclaration: false,
          allocations: payment.allocations.map(alloc => ({
            id: alloc.id,
            amount: Number(alloc.amount),
            installment: alloc.installment
              ? {
                  id: alloc.installment.id,
                  period: `${alloc.installment.period_year}-${String(alloc.installment.period_month).padStart(2, '0')}`,
                  dueDate: alloc.installment.due_date
                }
              : null
          }))
        };
      });

      const declarationsList = declarations
        .filter(d => d.status !== 'APPROVED')
        .map(d => ({
          id: d.id,
          amount: Number(d.amount),
          method: d.payment_method,
          status: d.status === 'PENDING' ? 'PENDING' : 'REJECTED',
          currency: 'FCFA',
          reference: d.reference || null,
          succeededAt: null,
          initiatedAt: d.payment_date,
          allocatedAmount: 0,
          unallocatedAmount: Number(d.amount),
          isDeclaration: true,
          declarationStatus: d.status,
          // Motif saisi par l'agence au rejet : le locataire doit savoir quoi corriger.
          rejectionReason: d.status === 'REJECTED' ? d.review_notes || null : null,
          allocations: []
        }));

      // Merge and sort by date (most recent first). Approved declarations are not included:
      // the corresponding RentalPayment is already in paymentsList, so we avoid duplicates.
      const merged = [...paymentsList, ...declarationsList].sort((a, b) => {
        const dateA = a.succeededAt || a.initiatedAt;
        const dateB = b.succeededAt || b.initiatedAt;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      const total = merged.length;
      const paginatedMerged = merged.slice(skip, skip + limit);

      logger.info('Payment history retrieved', {
        tenantClientId,
        leaseId,
        tenantId,
        paymentsCount: payments.length,
        declarationsCount: declarations.length,
        mergedTotal: total
      });

      return {
        payments: paginatedMerged,
        totalPaid,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1
        }
      };
    } catch (error) {
      logger.error('Error getting payment history', {
        error,
        tenantClientId,
        leaseId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Get deposit information with movements history
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @returns Deposit info data
   */
  async getDepositInfo(tenantClientId: string, leaseId: string, tenantId: string): Promise<any> {
    try {
      // Get deposit (T076) - using existing service function
      const deposit = await getDeposit(tenantId, leaseId);

      if (!deposit) {
        // Return empty deposit info if no deposit exists
        return {
          deposit: null,
          movements: [],
          currentHeldAmount: 0
        };
      }

      // Get all movements (T077)
      const movements = await listDepositMovements(tenantId, deposit.id);

      // Montant détenu (T078) : solde actuel du dépôt, pas `held_amount` (retenues seules).
      const currentHeldAmount = depositCurrentBalance(deposit);

      // Nom du bail : propriétaire - libellé propriété ( immeuble )
      let leaseWithLabel = { ...deposit.lease, lease_label: deposit.lease?.lease_number ?? '' };
      if (deposit.lease?.id) {
        const leaseWithProperty = await prisma.rentalLease.findFirst({
          where: { id: deposit.lease.id, tenant_id: tenantId },
          select: {
            id: true,
            lease_number: true,
            property: {
              select: {
                title: true,
                internalReference: true,
                owner: { select: { fullName: true } },
                containerParent: { select: { title: true } }
              }
            }
          }
        });
        if (leaseWithProperty?.property) {
          const { getPropertyDisplayLabel } = await import('../utils/property-display');
          leaseWithLabel = {
            ...deposit.lease,
            lease_label: getPropertyDisplayLabel(leaseWithProperty.property)
          };
        }
      }

      const depositInfoData = {
        deposit: {
          id: deposit.id,
          targetAmount: Number(deposit.target_amount),
          collectedAmount: Number(deposit.collected_amount),
          heldAmount: Number(deposit.held_amount),
          refundedAmount: Number(deposit.refunded_amount),
          forfeitedAmount: Number(deposit.forfeited_amount),
          currency: deposit.currency,
          lease: leaseWithLabel
        },
        movements: movements.map((movement: any) => ({
          id: movement.id,
          type: movement.type,
          amount: Number(movement.amount),
          currency: movement.currency,
          note: movement.note,
          createdAt: movement.created_at,
          payment: movement.payment,
          installment: movement.installment
            ? {
                id: movement.installment.id,
                period: `${movement.installment.period_year}-${String(movement.installment.period_month).padStart(2, '0')}`
              }
            : null
          // `createdBy` (id, e-mail et nom de l'agent) n'est pas destiné au locataire.
        })),
        currentHeldAmount
      };

      logger.info('Deposit info retrieved', {
        tenantClientId,
        leaseId,
        tenantId,
        depositId: deposit.id
      });

      return depositInfoData;
    } catch (error) {
      logger.error('Error getting deposit info', {
        error,
        tenantClientId,
        leaseId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Create maintenance ticket for tenant portal
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @param data - Ticket creation data
   * @param files - Optional attachment files
   * @returns Created ticket
   */
  async createMaintenanceTicket(
    tenantClientId: string,
    leaseId: string,
    tenantId: string,
    data: {
      title: string;
      category: string;
      priority: string;
      description: string;
      locationDetails?: string;
    },
    files?: Express.Multer.File[]
  ): Promise<any> {
    try {
      // Get lease to get property ID (T085)
      const lease = await prisma.rentalLease.findFirst({
        where: {
          id: leaseId,
          tenant_id: tenantId
        },
        include: {
          property: {
            select: {
              id: true
            }
          }
        }
      });

      if (!lease) {
        throw new NotFoundError('Bail non trouvé');
      }

      // Call existing maintenance ticket service (T084, T085)
      const ticketData = {
        propertyId: lease.property.id,
        leaseId: leaseId,
        title: data.title,
        // Cast ciblé : le validateur du portail laisse `category` en chaîne libre ;
        // la valeur est transmise telle quelle, comme avant (validation inchangée).
        category: data.category as CreateTicketRequest['category'],
        priority: data.priority as CreateTicketRequest['priority'],
        description: data.description,
        locationDetails: data.locationDetails
      };

      // La fiche CRM, pas le compte du portail : ces colonnes referencent
      // `crm_contacts` (voir `resolveCrmContactId`).
      const crmContactId = await this.resolveCrmContactId(tenantId, tenantClientId);

      // Create ticket
      const ticket = await createTicket(
        tenantId,
        ticketData,
        undefined, // actorUserId - not available from tenant portal
        crmContactId
      );

      // Upload attachments if provided
      if (files && files.length > 0) {
        const uploadPromises = files.map(file => uploadAttachment(tenantId, ticket.id, file, undefined, crmContactId));
        await Promise.all(uploadPromises);
      }

      logger.info('Maintenance ticket created from tenant portal', {
        tenantClientId,
        leaseId,
        tenantId,
        ticketId: ticket.id
      });

      return ticket;
    } catch (error) {
      logger.error('Error creating maintenance ticket', {
        error,
        tenantClientId,
        leaseId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Get maintenance tickets for tenant portal
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @param filters - Optional filters (status)
   * @param pagination - Optional pagination (page, limit)
   * @returns Maintenance tickets list with summary
   */
  async getMaintenanceTickets(
    tenantClientId: string,
    leaseId: string,
    tenantId: string,
    filters?: TenantTicketsFilters,
    pagination?: {
      page?: number;
      limit?: number;
    }
  ): Promise<any> {
    try {
      // Les tickets du locataire : son bail actif ou sa fiche CRM
      // (lib/maintenance/portal-visibility.ts). L'ancien filtre comparait
      // `tenant_contact_id` a l'identifiant du TenantClient, valeur que la cle
      // etrangere vers `crm_contacts` interdit : la liste restait vide.
      const visibility = await tenantPortalTicketFilter({ tenantId, tenantClientId, leaseId });
      const where: Prisma.MaintenanceTicketWhereInput = buildTenantTicketsWhere(visibility, filters);

      const page = pagination?.page || 1;
      const limit = Math.min(pagination?.limit || 20, 100);

      const [tickets, total, allTickets] = await Promise.all([
        prisma.maintenanceTicket.findMany({
          where,
          include: {
            property: { select: { id: true, internalReference: true, address: true, title: true } },
            assignedVendor: { select: { id: true, name: true } }
          },
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.maintenanceTicket.count({ where }),
        // Resume (T092) : tous les tickets du locataire, sans le filtre de statut.
        prisma.maintenanceTicket.findMany({ where: visibility, select: { status: true } })
      ]);
      const ticketsData = {
        tickets,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      };

      let openCount = 0;
      let inProgressCount = 0;
      let resolvedCount = 0;

      for (const ticket of allTickets) {
        if (ticket.status === 'DECLARED') {
          openCount++;
        } else if (ticket.status === 'IN_PROGRESS' || ticket.status === 'ASSIGNED') {
          inProgressCount++;
        } else if (ticket.status === 'RESOLVED') {
          resolvedCount++;
        }
      }

      const summary = {
        total: allTickets.length,
        open: openCount,
        inProgress: inProgressCount,
        resolved: resolvedCount
      };

      logger.info('Maintenance tickets retrieved', {
        tenantClientId,
        leaseId,
        tenantId,
        count: ticketsData.tickets.length
      });

      return {
        tickets: ticketsData.tickets,
        summary,
        pagination: ticketsData.pagination
      };
    } catch (error) {
      logger.error('Error getting maintenance tickets', {
        error,
        tenantClientId,
        leaseId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Get maintenance ticket details
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @param ticketId - Ticket ID
   * @returns Ticket details with comments and attachments
   */
  async getMaintenanceTicketDetails(
    tenantClientId: string,
    leaseId: string,
    tenantId: string,
    ticketId: string,
    leaseIds?: string[]
  ): Promise<any> {
    try {
      // Visible dans ce portail (un des baux actifs ou fiche CRM), sinon 404 comme
      // un ticket inexistant ; le detail complet vient ensuite du service.
      assertKnownId(ticketId, 'Ticket introuvable');
      const visible = await findTenantPortalTicket({ tenantId, tenantClientId, leaseId, leaseIds }, ticketId);
      if (!visible) {
        throw new NotFoundError('Ticket introuvable');
      }
      const { attachments, ...details } = await getTicketById(tenantId, visible.id);
      // Pièces jointes sans leur `file_url` de stockage : `toPortalAttachment`
      // ne recopie que l'identifiant, le nom, le type, la taille, la date, et
      // ajoute `downloadPath`.
      const ticket = {
        ...details,
        attachments: (attachments ?? []).map(attachment => toPortalAttachment(attachment, visible.id, 'tenant'))
      };

      logger.info('Maintenance ticket details retrieved', {
        tenantClientId,
        leaseId,
        tenantId,
        ticketId
      });

      return ticket;
    } catch (error) {
      logger.error('Error getting maintenance ticket details', {
        error,
        tenantClientId,
        leaseId,
        tenantId,
        ticketId
      });
      throw error;
    }
  }

  /**
   * Add comment to maintenance ticket
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @param ticketId - Ticket ID
   * @param comment - Comment content
   * @returns Created comment
   */
  async addTicketComment(
    tenantClientId: string,
    leaseId: string,
    tenantId: string,
    ticketId: string,
    comment: string,
    leaseIds?: string[]
  ): Promise<any> {
    try {
      // Seulement sur un ticket visible dans ce portail : `addComment` ne
      // verifie que l'agence, et un locataire commentait ainsi le ticket d'un
      // autre en connaissant son identifiant.
      assertKnownId(ticketId, 'Ticket introuvable');
      const visible = await findTenantPortalTicket({ tenantId, tenantClientId, leaseId, leaseIds }, ticketId);
      if (!visible) {
        throw new NotFoundError('Ticket introuvable');
      }

      // Call existing maintenance comment service (T094)
      const createdComment = await addComment(
        tenantId,
        visible.id,
        { content: comment },
        MaintenanceTicketCommentAuthorType.TENANT,
        undefined, // authorUserId
        await this.resolveCrmContactId(tenantId, tenantClientId)
      );

      logger.info('Maintenance comment added', {
        tenantClientId,
        leaseId,
        tenantId,
        ticketId,
        commentId: createdComment.id
      });

      return createdComment;
    } catch (error) {
      logger.error('Error adding maintenance comment', {
        error,
        tenantClientId,
        leaseId,
        tenantId,
        ticketId
      });
      throw error;
    }
  }

  /**
   * Get documents for tenant portal
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @param filters - Optional filters (type)
   * @returns Documents list grouped by type
   */
  async getDocuments(
    tenantClientId: string,
    leaseId: string,
    tenantId: string,
    filters?: {
      type?: string;
    },
    leaseIds?: string[]
  ): Promise<any> {
    try {
      // Get documents for lease (T103) — tous les baux du périmètre (H29).
      const where: any = {
        lease_id: { in: leaseIds && leaseIds.length > 0 ? leaseIds : [leaseId] },
        tenant_id: tenantId,
        status: {
          not: 'VOID'
        }
      };

      if (filters?.type) {
        where.type = filters.type;
      }

      const documents = (
        await prisma.rentalDocument.findMany({
          where,
          select: PORTAL_RENTAL_DOCUMENT_SELECT,
          orderBy: {
            issued_at: 'desc'
          }
        })
      ).map(document => toPortalRentalDocument(document, 'tenant'));

      // Group documents by type (T104)
      const groupedByType: Record<string, any[]> = {};
      for (const doc of documents) {
        const type = doc.type;
        if (!groupedByType[type]) {
          groupedByType[type] = [];
        }
        groupedByType[type].push(doc);
      }

      logger.info('Documents retrieved', {
        tenantClientId,
        leaseId,
        tenantId,
        count: documents.length
      });

      return {
        documents,
        groupedByType
      };
    } catch (error) {
      logger.error('Error getting documents', {
        error,
        tenantClientId,
        leaseId,
        tenantId
      });
      throw error;
    }
  }

  /**
   * Download document file
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @param documentId - Document ID
   * @returns File buffer and metadata
   */
  async downloadDocument(
    tenantClientId: string,
    leaseId: string,
    tenantId: string,
    documentId: string,
    leaseIds?: string[]
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    try {
      assertKnownId(documentId, 'Document non trouvé ou accès refusé');
      // Validate document access (T105)
      const document = await prisma.rentalDocument.findFirst({
        where: {
          id: documentId,
          lease_id: { in: leaseIds && leaseIds.length > 0 ? leaseIds : [leaseId] },
          tenant_id: tenantId,
          status: {
            not: 'VOID'
          }
        }
      });

      if (!document) {
        throw new NotFoundError('Document non trouvé ou accès refusé');
      }

      // Get document file (T106)
      const buffer = await getDocumentFile(tenantId, documentId);

      // Determine file name
      const fileExtension = document.file_path ? document.file_path.split('.').pop() : 'pdf';
      const fileName = document.document_number
        ? `${document.document_number}.${fileExtension}`
        : `document-${documentId}.${fileExtension}`;

      logger.info('Document downloaded', {
        tenantClientId,
        leaseId,
        tenantId,
        documentId
      });

      return {
        buffer,
        fileName,
        mimeType: document.mime_type || 'application/pdf'
      };
    } catch (error) {
      logger.error('Error downloading document', {
        error,
        tenantClientId,
        leaseId,
        tenantId,
        documentId
      });
      throw error;
    }
  }
}
