/**
 * Tenant Portal Service
 * Business logic for tenant portal operations
 */

import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
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
import { uploadAttachment } from './maintenance-attachment-service';
import { addComment } from './maintenance-comment-service';
import { getDocumentFile } from './document-generation-service';
import {
  findTenantPortalTicket,
  resolveTenantPortalCrmContactId,
  tenantPortalTicketFilter
} from '../lib/maintenance/portal-visibility';
import { NotFoundError } from '../middleware/error-middleware';

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
   * Get dashboard data for tenant portal
   * Aggregates lease overview, balance, next installment, recent payments, deposit, and maintenance summary
   * @param tenantClientId - Tenant client ID
   * @param leaseId - Active lease ID
   * @param tenantId - Tenant ID (for isolation)
   * @returns Dashboard data
   */
  async getDashboard(tenantClientId: string, leaseId: string, tenantId: string): Promise<DashboardData> {
    try {
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
        throw new Error('Bail non trouvé');
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

      // Calculate current balance (T021)
      // Sum of DUE + OVERDUE installments minus allocated payments
      const dueInstallments = await prisma.rentalInstallment.findMany({
        where: {
          lease_id: leaseId,
          tenant_id: tenantId,
          status: {
            in: [RentalInstallmentStatus.DUE, RentalInstallmentStatus.OVERDUE]
          }
        }
      });

      let totalDue = 0;
      for (const inst of dueInstallments) {
        const installmentTotal =
          Number(inst.amount_rent) +
          Number(inst.amount_service) +
          Number(inst.amount_other_fees) +
          Number(inst.penalty_amount || 0);
        totalDue += installmentTotal;
      }

      // Get total allocated payments for these installments
      const allocatedPayments = await prisma.rentalPaymentAllocation.aggregate({
        where: {
          tenant_id: tenantId,
          installment: {
            lease_id: leaseId,
            status: {
              in: [RentalInstallmentStatus.DUE, RentalInstallmentStatus.OVERDUE]
            }
          },
          payment: {
            status: RentalPaymentStatus.SUCCESS
          }
        },
        _sum: {
          amount: true
        }
      });

      const totalPaid = Number(allocatedPayments._sum.amount || 0);
      const currentBalance = totalDue - totalPaid;
      const overdueInstallmentsCount = dueInstallments.filter(i => i.status === RentalInstallmentStatus.OVERDUE).length;

      // Find next installment (T022) - earliest DUE installment
      const nextInstallmentRecord = await prisma.rentalInstallment.findFirst({
        where: {
          lease_id: leaseId,
          tenant_id: tenantId,
          status: RentalInstallmentStatus.DUE
        },
        orderBy: {
          due_date: 'asc'
        }
      });

      const nextInstallment: InstallmentOverview | null = nextInstallmentRecord
        ? {
            id: nextInstallmentRecord.id,
            period: `${nextInstallmentRecord.period_year}-${String(nextInstallmentRecord.period_month).padStart(2, '0')}`,
            dueDate: nextInstallmentRecord.due_date,
            amount:
              Number(nextInstallmentRecord.amount_rent) +
              Number(nextInstallmentRecord.amount_service) +
              Number(nextInstallmentRecord.amount_other_fees) +
              Number(nextInstallmentRecord.penalty_amount || 0),
            status: nextInstallmentRecord.status
          }
        : null;

      // Get recent payments (T023) - last 5 successful payments
      const recentPaymentsRecords = await prisma.rentalPayment.findMany({
        where: {
          lease_id: leaseId,
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
        where: await tenantPortalTicketFilter({ tenantId, tenantClientId, leaseId }),
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

      const dashboardData: DashboardData = {
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
        include: {
          property: {
            select: {
              id: true,
              internalReference: true,
              address: true,
              title: true,
              propertyType: true,
              owner: { select: { fullName: true } },
              containerParent: { select: { title: true } }
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
          },
          ownerClient: {
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
      });

      if (!lease) {
        throw new Error('Bail non trouvé');
      }

      // Get co-renters list (T037)
      const coRentersRecords = await prisma.rentalLeaseCoRenter.findMany({
        where: {
          lease_id: leaseId,
          tenant_id: tenantId
        },
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
      });

      const coRenters = coRentersRecords.map(cr => cr.renterClient);

      // Get associated documents (T038) - grouped by type
      const documents = await prisma.rentalDocument.findMany({
        where: {
          lease_id: leaseId,
          tenant_id: tenantId,
          status: {
            not: 'VOID'
          }
        },
        orderBy: {
          issued_at: 'desc'
        }
      });

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
      status?: string;
      startDate?: string;
      endDate?: string;
    },
    pagination?: {
      page?: number;
      limit?: number;
    }
  ): Promise<any> {
    try {
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 20;
      const skip = (page - 1) * limit;

      // Build where clause (T045)
      const where: any = {
        lease_id: leaseId,
        tenant_id: tenantId
      };

      if (filters?.status) {
        where.status = filters.status;
      }

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
            items: true,
            payments: {
              include: {
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
          orderBy: {
            due_date: 'asc'
          },
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
          lease_id: leaseId,
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
          partialCount++;
        }
      }

      const summary = {
        total: allInstallments.length,
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

        // Only recalculate if status is DRAFT or if payment/due date conditions changed
        if (inst.status === RentalInstallmentStatus.DRAFT || inst.status === RentalInstallmentStatus.CANCELED) {
          if (amountPaid >= totalAmount && totalAmount > 0) {
            calculatedStatus = RentalInstallmentStatus.PAID;
          } else if (amountPaid > 0 && amountPaid < totalAmount) {
            calculatedStatus = RentalInstallmentStatus.PARTIAL;
          } else if (dueDate < today) {
            calculatedStatus = RentalInstallmentStatus.OVERDUE;
          } else if (dueDate >= today) {
            calculatedStatus = RentalInstallmentStatus.DUE;
          }
        } else {
          // For non-DRAFT statuses, verify the status is still correct
          if (amountPaid >= totalAmount && totalAmount > 0) {
            calculatedStatus = RentalInstallmentStatus.PAID;
          } else if (amountPaid > 0 && amountPaid < totalAmount) {
            calculatedStatus = RentalInstallmentStatus.PARTIAL;
          } else if (dueDate < today) {
            calculatedStatus = RentalInstallmentStatus.OVERDUE;
          } else if (
            dueDate >= today &&
            inst.status !== RentalInstallmentStatus.PAID &&
            inst.status !== RentalInstallmentStatus.PARTIAL
          ) {
            calculatedStatus = RentalInstallmentStatus.DUE;
          }
        }

        return {
          id: inst.id,
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
    installmentId: string
  ): Promise<any> {
    try {
      // Get installment with items, allocations, penalties (T047)
      const installment = await prisma.rentalInstallment.findFirst({
        where: {
          id: installmentId,
          lease_id: leaseId,
          tenant_id: tenantId
        },
        include: {
          items: {
            orderBy: {
              created_at: 'asc'
            }
          },
          payments: {
            include: {
              payment: {
                select: {
                  id: true,
                  amount: true,
                  method: true,
                  status: true,
                  currency: true,
                  initiated_at: true,
                  succeeded_at: true,
                  psp_reference: true,
                  psp_transaction_id: true
                }
              }
            },
            orderBy: {
              created_at: 'desc'
            }
          },
          penalties: {
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
        throw new Error('Échéance non trouvée');
      }

      // Get related payments (T048) - all payments for this lease that could be related
      const relatedPayments = await prisma.rentalPayment.findMany({
        where: {
          lease_id: leaseId,
          tenant_id: tenantId,
          status: 'SUCCESS'
        },
        include: {
          allocations: {
            where: {
              installment_id: installmentId
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
    leaseId: string,
    tenantId: string,
    data: {
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      transactionPhone: string;
      mobileOperator?: string;
      reference?: string;
      installmentId?: string;
      notes?: string;
    },
    file?: Express.Multer.File
  ): Promise<any> {
    try {
      // Validate installment if provided (T060)
      if (data.installmentId) {
        const installment = await prisma.rentalInstallment.findFirst({
          where: {
            id: data.installmentId,
            lease_id: leaseId,
            tenant_id: tenantId
          }
        });

        if (!installment) {
          throw new Error('Échéance non trouvée ou non associée à ce bail');
        }
      }

      // Handle file upload if provided (T061)
      let proofFileUrl: string | null = null;
      if (file) {
        const cwd = process.cwd();
        const projectRoot =
          path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
            ? path.resolve(cwd, '..', '..')
            : cwd;
        const uploadDir = path.join(projectRoot, 'uploads', 'portal', 'payments', tenantId);
        await fs.mkdir(uploadDir, { recursive: true });

        const fileExtension = path.extname(file.originalname);
        const fileName = `payment-proof-${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
        const filePath = path.join(uploadDir, fileName);

        await fs.writeFile(filePath, file.buffer);
        proofFileUrl = `/uploads/portal/payments/${tenantId}/${fileName}`;
      }

      // Create payment declaration (T060)
      const paymentDeclaration = await prisma.rentalPaymentDeclaration.create({
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
        include: {
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

          const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
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
            proofFileUrl: (paymentDeclaration as any).proof_file_url || null,
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

      return paymentDeclaration;
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
      method?: string;
    },
    pagination?: {
      page?: number;
      limit?: number;
    }
  ): Promise<any> {
    try {
      const page = pagination?.page || 1;
      const limit = Math.min(pagination?.limit || 50, 100);
      const skip = (page - 1) * limit;

      // Build where clause (T070)
      const where: any = {
        lease_id: leaseId,
        tenant_id: tenantId
      };

      if (filters?.method) {
        where.method = filters.method;
      }

      if (filters?.startDate || filters?.endDate) {
        where.succeeded_at = {};
        if (filters.startDate) {
          where.succeeded_at.gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          where.succeeded_at.lte = new Date(filters.endDate);
        }
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
          where: {
            lease_id: leaseId,
            tenant_id: tenantId,
            declared_by: tenantClientId
          },
          orderBy: { created_at: 'desc' }
        })
      ]);

      // Calculate total paid (T071)
      const totalPaidResult = await prisma.rentalPayment.aggregate({
        where: {
          lease_id: leaseId,
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

      // Calculate current held amount (T078)
      const currentHeldAmount = Number(deposit.held_amount);

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
            : null,
          createdBy: movement.createdBy
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
        throw new Error('Bail non trouvé');
      }

      // Call existing maintenance ticket service (T084, T085)
      const ticketData = {
        propertyId: lease.property.id,
        leaseId: leaseId,
        title: data.title,
        category: data.category,
        priority: data.priority,
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
    filters?: {
      status?: string;
    },
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
      const where: Prisma.MaintenanceTicketWhereInput = filters?.status
        ? { AND: [visibility, { status: filters.status as MaintenanceTicketStatus }] }
        : visibility;

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
    ticketId: string
  ): Promise<any> {
    try {
      // Visible dans ce portail (bail actif ou fiche CRM), sinon 404 comme un
      // ticket inexistant ; le detail complet vient ensuite du service.
      const visible = await findTenantPortalTicket({ tenantId, tenantClientId, leaseId }, ticketId);
      if (!visible) {
        throw new NotFoundError('Ticket introuvable');
      }
      const ticket = await getTicketById(tenantId, visible.id);

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
    comment: string
  ): Promise<any> {
    try {
      // Seulement sur un ticket visible dans ce portail : `addComment` ne
      // verifie que l'agence, et un locataire commentait ainsi le ticket d'un
      // autre en connaissant son identifiant.
      const visible = await findTenantPortalTicket({ tenantId, tenantClientId, leaseId }, ticketId);
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
    }
  ): Promise<any> {
    try {
      // Get documents for lease (T103)
      const where: any = {
        lease_id: leaseId,
        tenant_id: tenantId,
        status: {
          not: 'VOID'
        }
      };

      if (filters?.type) {
        where.type = filters.type;
      }

      const documents = await prisma.rentalDocument.findMany({
        where,
        orderBy: {
          issued_at: 'desc'
        }
      });

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
    documentId: string
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    try {
      // Validate document access (T105)
      const document = await prisma.rentalDocument.findFirst({
        where: {
          id: documentId,
          lease_id: leaseId,
          tenant_id: tenantId,
          status: {
            not: 'VOID'
          }
        }
      });

      if (!document) {
        throw new Error('Document non trouvé ou accès refusé');
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
