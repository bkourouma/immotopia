/**
 * Owner Portal Service
 * Business logic for owner portal operations
 */

import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import {
  DashboardData,
  PortfolioSummary,
  RevenueMetrics,
  UpcomingPayment,
  RecentPayment,
  RecentTicket,
  PropertiesListData,
  PropertyListItem,
  PropertyDetailsData,
  PropertyRevenueStats,
  LeasesListData,
  LeaseListItem,
  LeaseDetailsData,
  LeaseBalance,
  RevenueSummaryData,
  RevenueByPropertyData,
  RevenueByMonthData,
  InstallmentsListData,
  InstallmentListItem,
  PaymentsListData,
  PaymentListItem,
  PaymentDetailsData,
  DepositsListData,
  DepositListItem,
  DepositMovementsData,
  MaintenanceTicketsListData,
  MaintenanceTicketListItem,
  MaintenanceTicketDetailsData,
  DocumentsListData
} from '../types/owner-portal-types';
import {
  PropertyStatus,
  RentalLeaseStatus,
  RentalPaymentStatus,
  RentalPaymentMethod,
  RentalInstallmentStatus,
  MaintenanceTicketStatus,
  MaintenanceTicketCategory,
  MaintenanceTicketPriority,
  RentalDocumentType,
  PropertyType,
  PropertyTransactionMode
} from '@prisma/client';
import {
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
  subYears,
  format,
  eachMonthOfInterval
} from 'date-fns';
import {
  generateRevenueReportPDF,
  generateRevenueReportCSV,
  generateRevenueReportExcel,
  generateOccupancyReportPDF,
  generateOccupancyReportCSV,
  generateOccupancyReportExcel,
  exportData as exportDataFunction
} from '../utils/report-generator';
import { getDocumentFile } from './document-generation-service';

export class OwnerPortalService {
  /**
   * Get dashboard data for owner portal
   * Aggregates portfolio summary, revenue metrics, occupancy rate, upcoming payments, recent payments, and recent tickets
   * @param propertyIds - Array of property IDs owned by the owner
   * @param tenantId - Tenant ID (for isolation)
   * @returns Dashboard data
   */
  async getDashboard(propertyIds: string[], tenantId: string): Promise<DashboardData> {
    try {
      if (propertyIds.length === 0) {
        // Return empty dashboard if owner has no properties
        return {
          portfolioSummary: {
            total: 0,
            rented: 0,
            available: 0,
            inMaintenance: 0
          },
          revenueMetrics: {
            currentMonth: 0,
            currentYear: 0,
            lastMonth: 0,
            lastYear: 0
          },
          occupancyRate: 0,
          upcomingPayments: [],
          recentPayments: [],
          recentTickets: []
        };
      }

      // T019: Calculate portfolio summary (total, rented, available, inMaintenance)
      const portfolioSummary = await this.calculatePortfolioSummary(propertyIds, tenantId);

      // T020: Calculate revenue metrics (current month, current year, last month, last year)
      const revenueMetrics = await this.calculateRevenueMetrics(propertyIds, tenantId);

      // T021: Calculate occupancy rate (rented/total * 100)
      const occupancyRate = portfolioSummary.total > 0 ? (portfolioSummary.rented / portfolioSummary.total) * 100 : 0;

      // T022: Get upcoming payments (next 5 installments with status DUE)
      const upcomingPayments = await this.getUpcomingPayments(propertyIds, tenantId);

      // T023: Get recent payments (last 5)
      const recentPayments = await this.getRecentPayments(propertyIds, tenantId);

      // T024: Get recent maintenance tickets (last 5)
      const recentTickets = await this.getRecentTickets(propertyIds, tenantId);

      return {
        portfolioSummary,
        revenueMetrics,
        occupancyRate,
        upcomingPayments,
        recentPayments,
        recentTickets
      };
    } catch (error) {
      logger.error('Error getting owner dashboard:', error);
      throw error;
    }
  }

  /**
   * T019: Calculate portfolio summary
   */
  private async calculatePortfolioSummary(propertyIds: string[], tenantId: string): Promise<PortfolioSummary> {
    if (propertyIds.length === 0) {
      return { total: 0, rented: 0, available: 0, inMaintenance: 0 };
    }

    const properties = await prisma.property.findMany({
      where: {
        id: { in: propertyIds },
        tenantId: tenantId
      },
      include: {
        rentalLeases: {
          where: {
            tenant_id: tenantId,
            status: RentalLeaseStatus.ACTIVE
          },
          take: 1
        }
      }
    });

    const total = properties.length;
    const rented = properties.filter(p => p.rentalLeases && p.rentalLeases.length > 0).length;
    const available = properties.filter(
      p => (!p.rentalLeases || p.rentalLeases.length === 0) && p.status === PropertyStatus.AVAILABLE
    ).length;
    const inMaintenance = properties.filter(
      p => p.status === PropertyStatus.UNDER_REVIEW // Assuming UNDER_REVIEW means maintenance
    ).length;

    return { total, rented, available, inMaintenance };
  }

  /**
   * T020: Calculate revenue metrics
   */
  private async calculateRevenueMetrics(propertyIds: string[], tenantId: string): Promise<RevenueMetrics> {
    if (propertyIds.length === 0) {
      return {
        currentMonth: 0,
        currentYear: 0,
        lastMonth: 0,
        lastYear: 0
      };
    }

    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));
    const currentYearStart = startOfYear(now);
    const currentYearEnd = endOfYear(now);
    const lastYearStart = startOfYear(subYears(now, 1));
    const lastYearEnd = endOfYear(subYears(now, 1));

    // Current month revenue
    const currentMonthRevenue = await prisma.rentalPayment.aggregate({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds }
        },
        succeeded_at: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        }
      },
      _sum: {
        amount: true
      }
    });

    // Last month revenue
    const lastMonthRevenue = await prisma.rentalPayment.aggregate({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds }
        },
        succeeded_at: {
          gte: lastMonthStart,
          lte: lastMonthEnd
        }
      },
      _sum: {
        amount: true
      }
    });

    // Current year revenue
    const currentYearRevenue = await prisma.rentalPayment.aggregate({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds }
        },
        succeeded_at: {
          gte: currentYearStart,
          lte: currentYearEnd
        }
      },
      _sum: {
        amount: true
      }
    });

    // Last year revenue
    const lastYearRevenue = await prisma.rentalPayment.aggregate({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds }
        },
        succeeded_at: {
          gte: lastYearStart,
          lte: lastYearEnd
        }
      },
      _sum: {
        amount: true
      }
    });

    return {
      currentMonth: Number(currentMonthRevenue._sum.amount || 0),
      currentYear: Number(currentYearRevenue._sum.amount || 0),
      lastMonth: Number(lastMonthRevenue._sum.amount || 0),
      lastYear: Number(lastYearRevenue._sum.amount || 0)
    };
  }

  /**
   * T022: Get upcoming payments (next 5 installments with status DUE)
   */
  private async getUpcomingPayments(propertyIds: string[], tenantId: string): Promise<UpcomingPayment[]> {
    if (propertyIds.length === 0) {
      return [];
    }

    const installments = await prisma.rentalInstallment.findMany({
      where: {
        tenant_id: tenantId,
        status: RentalInstallmentStatus.DUE,
        due_date: { gte: new Date() },
        lease: {
          property_id: { in: propertyIds }
        }
      },
      orderBy: {
        due_date: 'asc'
      },
      take: 5,
      include: {
        lease: {
          include: {
            property: {
              select: {
                address: true
              }
            },
            primaryRenter: {
              include: {
                user: {
                  select: {
                    fullName: true
                  }
                }
              }
            }
          }
        }
      }
    });

    return installments.map(inst => ({
      id: inst.id,
      propertyAddress: inst.lease.property.address || 'Adresse non disponible',
      tenantName: inst.lease.primaryRenter.user?.fullName || 'Locataire inconnu',
      period: `${inst.period_year}-${String(inst.period_month).padStart(2, '0')}`,
      dueDate: inst.due_date,
      amount:
        Number(inst.amount_rent) +
        Number(inst.amount_service) +
        Number(inst.amount_other_fees) +
        Number(inst.penalty_amount || 0),
      status: inst.status
    }));
  }

  /**
   * T023: Get recent payments (last 5)
   */
  private async getRecentPayments(propertyIds: string[], tenantId: string): Promise<RecentPayment[]> {
    if (propertyIds.length === 0) {
      return [];
    }

    const payments = await prisma.rentalPayment.findMany({
      where: {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds }
        }
      },
      orderBy: {
        succeeded_at: 'desc'
      },
      take: 5,
      include: {
        lease: {
          include: {
            property: {
              select: {
                address: true
              }
            },
            primaryRenter: {
              include: {
                user: {
                  select: {
                    fullName: true
                  }
                }
              }
            }
          }
        }
      }
    });

    return payments.map(payment => ({
      id: payment.id,
      propertyAddress: payment.lease?.property.address || 'Adresse non disponible',
      tenantName: payment.lease?.primaryRenter.user?.fullName || 'Locataire inconnu',
      amount: Number(payment.amount),
      date: payment.succeeded_at || payment.initiated_at,
      method: payment.method
    }));
  }

  /**
   * T024: Get recent maintenance tickets (last 5)
   */
  private async getRecentTickets(propertyIds: string[], tenantId: string): Promise<RecentTicket[]> {
    if (propertyIds.length === 0) {
      return [];
    }

    const tickets = await prisma.maintenanceTicket.findMany({
      where: {
        tenant_id: tenantId,
        property_id: { in: propertyIds }
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 5,
      include: {
        property: {
          select: {
            address: true
          }
        }
      }
    });

    return tickets.map(ticket => ({
      id: ticket.id,
      propertyAddress: ticket.property.address || 'Adresse non disponible',
      title: ticket.title,
      status: ticket.status,
      createdAt: ticket.created_at
    }));
  }

  /**
   * T035-T036: Get properties list with filtering and portfolio summary
   */
  async getProperties(
    propertyIds: string[],
    tenantId: string,
    filters?: {
      status?: PropertyStatus;
      propertyType?: PropertyType;
      transactionMode?: PropertyTransactionMode;
    }
  ): Promise<PropertiesListData> {
    try {
      if (propertyIds.length === 0) {
        return {
          properties: [],
          summary: {
            total: 0,
            rented: 0,
            available: 0,
            inMaintenance: 0
          }
        };
      }

      // Build where clause
      const where: any = {
        id: { in: propertyIds },
        tenantId: tenantId
      };

      if (filters?.status) {
        where.status = filters.status;
      }

      if (filters?.propertyType) {
        where.propertyType = filters.propertyType;
      }

      if (filters?.transactionMode) {
        where.transactionModes = {
          has: filters.transactionMode
        };
      }

      // Get properties with current lease
      const properties = await prisma.property.findMany({
        where,
        include: {
          rentalLeases: {
            where: {
              tenant_id: tenantId,
              status: RentalLeaseStatus.ACTIVE
            },
            take: 1,
            include: {
              primaryRenter: {
                include: {
                  user: {
                    select: {
                      fullName: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // T036: Calculate portfolio summary
      const total = properties.length;
      const rented = properties.filter(p => p.rentalLeases.length > 0).length;
      const available = properties.filter(
        p => p.rentalLeases.length === 0 && p.status === PropertyStatus.AVAILABLE
      ).length;
      const inMaintenance = properties.filter(p => p.status === PropertyStatus.UNDER_REVIEW).length;

      // Map to PropertyListItem
      const propertyList: PropertyListItem[] = properties.map(property => ({
        id: property.id,
        address: property.address,
        propertyType: property.propertyType,
        status: property.status,
        transactionModes: property.transactionModes as string[],
        currentLease:
          property.rentalLeases.length > 0
            ? {
                id: property.rentalLeases[0].id,
                tenantName: property.rentalLeases[0].primaryRenter.user?.fullName || 'Locataire inconnu',
                startDate: property.rentalLeases[0].start_date,
                endDate: property.rentalLeases[0].end_date,
                monthlyRent: Number(property.rentalLeases[0].rent_amount),
                status: property.rentalLeases[0].status
              }
            : null
      }));

      return {
        properties: propertyList,
        summary: { total, rented, available, inMaintenance }
      };
    } catch (error) {
      logger.error('Error getting owner properties:', error);
      throw error;
    }
  }

  /**
   * T037-T041: Get property details with all related data
   */
  async getPropertyDetails(propertyId: string, propertyIds: string[], tenantId: string): Promise<PropertyDetailsData> {
    try {
      // Validate property ownership
      if (!propertyIds.includes(propertyId)) {
        throw new Error('Propriété non trouvée ou accès non autorisé');
      }

      // T037: Fetch complete property with media and documents
      const property = await prisma.property.findUnique({
        where: {
          id: propertyId,
          tenantId: tenantId
        },
        include: {
          media: {
            orderBy: {
              displayOrder: 'asc'
            }
          },
          documents: {
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      });

      if (!property) {
        throw new Error('Propriété non trouvée');
      }

      // T038: Fetch current active lease
      const currentLease = await prisma.rentalLease.findFirst({
        where: {
          property_id: propertyId,
          tenant_id: tenantId,
          status: RentalLeaseStatus.ACTIVE
        },
        include: {
          primaryRenter: {
            include: {
              user: {
                select: {
                  fullName: true,
                  email: true
                }
              }
            }
          },
          coRenters: {
            include: {
              renterClient: {
                include: {
                  user: {
                    select: {
                      fullName: true,
                      email: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      // T039: Fetch lease history (ended leases)
      const leaseHistory = await prisma.rentalLease.findMany({
        where: {
          property_id: propertyId,
          tenant_id: tenantId,
          status: RentalLeaseStatus.ENDED
        },
        include: {
          primaryRenter: {
            include: {
              user: {
                select: {
                  fullName: true,
                  email: true
                }
              }
            }
          }
        },
        orderBy: {
          end_date: 'desc'
        }
      });

      // T040: Calculate revenue statistics
      const now = new Date();
      const currentMonthStart = startOfMonth(now);
      const currentMonthEnd = endOfMonth(now);

      // Total received (all time)
      const totalRevenue = await prisma.rentalPayment.aggregate({
        where: {
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS,
          lease: {
            property_id: propertyId
          }
        },
        _sum: {
          amount: true
        }
      });

      // Current month revenue
      const currentMonthRevenue = await prisma.rentalPayment.aggregate({
        where: {
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS,
          lease: {
            property_id: propertyId
          },
          succeeded_at: {
            gte: currentMonthStart,
            lte: currentMonthEnd
          }
        },
        _sum: {
          amount: true
        }
      });

      // Calculate average monthly revenue
      // Get first payment date to calculate months
      const firstPayment = await prisma.rentalPayment.findFirst({
        where: {
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS,
          lease: {
            property_id: propertyId
          }
        },
        orderBy: {
          succeeded_at: 'asc'
        },
        select: {
          succeeded_at: true
        }
      });

      let averageMonthly = 0;
      if (firstPayment && totalRevenue._sum.amount) {
        const monthsDiff = Math.max(
          1,
          Math.ceil((now.getTime() - firstPayment.succeeded_at!.getTime()) / (1000 * 60 * 60 * 24 * 30))
        );
        averageMonthly = Number(totalRevenue._sum.amount) / monthsDiff;
      }

      const revenueStats: PropertyRevenueStats = {
        totalReceived: Number(totalRevenue._sum.amount || 0),
        currentMonth: Number(currentMonthRevenue._sum.amount || 0),
        averageMonthly
      };

      // T041: Fetch maintenance ticket history
      const maintenanceHistory = await prisma.maintenanceTicket.findMany({
        where: {
          property_id: propertyId,
          tenant_id: tenantId
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      return {
        property: property as any,
        currentLease: currentLease
          ? ({
              ...currentLease,
              coRenters: currentLease.coRenters.map(cr => cr.renterClient)
            } as any)
          : null,
        leaseHistory: leaseHistory as any,
        revenueStats,
        maintenanceHistory: maintenanceHistory as any
      };
    } catch (error) {
      logger.error('Error getting property details:', error);
      throw error;
    }
  }

  /**
   * T054-T055: Get leases list with filtering and summary
   */
  async getLeases(
    propertyIds: string[],
    tenantId: string,
    filters?: {
      status?: RentalLeaseStatus;
      propertyId?: string;
    }
  ): Promise<LeasesListData> {
    try {
      if (propertyIds.length === 0) {
        return {
          leases: [],
          summary: {
            active: 0,
            ended: 0,
            suspended: 0
          }
        };
      }

      // Build where clause
      const where: any = {
        tenant_id: tenantId,
        property_id: { in: propertyIds }
      };

      if (filters?.status) {
        where.status = filters.status;
      }

      if (filters?.propertyId) {
        where.property_id = filters.propertyId;
      }

      // Get leases
      const leases = await prisma.rentalLease.findMany({
        where,
        include: {
          property: {
            select: {
              id: true,
              address: true
            }
          },
          primaryRenter: {
            include: {
              user: {
                select: {
                  fullName: true
                }
              }
            }
          }
        },
        orderBy: {
          start_date: 'desc'
        }
      });

      // T055: Calculate lease summary
      const active = leases.filter(l => l.status === RentalLeaseStatus.ACTIVE).length;
      const ended = leases.filter(l => l.status === RentalLeaseStatus.ENDED).length;
      const suspended = leases.filter(l => l.status === RentalLeaseStatus.SUSPENDED).length;

      // Map to LeaseListItem
      const leaseList: LeaseListItem[] = leases.map(lease => ({
        id: lease.id,
        propertyAddress: lease.property.address || 'Adresse non disponible',
        tenantName: lease.primaryRenter.user?.fullName || 'Locataire inconnu',
        startDate: lease.start_date,
        endDate: lease.end_date,
        monthlyRent: Number(lease.rent_amount),
        status: lease.status
      }));

      return {
        leases: leaseList,
        summary: { active, ended, suspended }
      };
    } catch (error) {
      logger.error('Error getting owner leases:', error);
      throw error;
    }
  }

  /**
   * T056-T061: Get lease details with all related data
   */
  async getLeaseDetails(leaseId: string, propertyIds: string[], tenantId: string): Promise<LeaseDetailsData> {
    try {
      // Get lease and validate property ownership
      const lease = await prisma.rentalLease.findFirst({
        where: {
          id: leaseId,
          tenant_id: tenantId,
          property_id: { in: propertyIds }
        },
        include: {
          property: true,
          primaryRenter: {
            include: {
              user: {
                select: {
                  fullName: true,
                  email: true
                }
              }
            }
          },
          ownerClient: {
            include: {
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
        throw new Error('Bail non trouvé ou accès non autorisé');
      }

      // T057: Fetch all renters (primary and co-renters)
      const coRenters = await prisma.rentalLeaseCoRenter.findMany({
        where: {
          lease_id: leaseId,
          tenant_id: tenantId
        },
        include: {
          renterClient: {
            include: {
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

      // T058: Fetch installment schedule
      const installments = await prisma.rentalInstallment.findMany({
        where: {
          lease_id: leaseId,
          tenant_id: tenantId
        },
        orderBy: [{ period_year: 'desc' }, { period_month: 'desc' }]
      });

      // T059: Fetch payment history
      const paymentHistory = await prisma.rentalPayment.findMany({
        where: {
          lease_id: leaseId,
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS
        },
        include: {
          allocations: true
        },
        orderBy: {
          succeeded_at: 'desc'
        }
      });

      // T060: Calculate balance (total due, total paid, remaining)
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
      const remaining = totalDue - totalPaid;

      const balance: LeaseBalance = {
        totalDue,
        totalPaid,
        remaining
      };

      // T061: Fetch security deposit information
      const deposit = await prisma.rentalSecurityDeposit.findUnique({
        where: {
          lease_id: leaseId
        },
        include: {
          movements: {
            orderBy: {
              created_at: 'desc'
            }
          }
        }
      });

      return {
        lease: {
          ...lease,
          coRenters: coRenters.map(cr => cr.renterClient)
        } as any,
        installments: installments as any,
        paymentHistory: paymentHistory as any,
        balance,
        deposit: deposit
          ? ({
              ...deposit,
              movements: deposit.movements as any
            } as any)
          : (null as any)
      };
    } catch (error) {
      logger.error('Error getting lease details:', error);
      throw error;
    }
  }

  /**
   * T074: Get revenues with filtering
   */
  async getRevenues(
    propertyIds: string[],
    tenantId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      propertyId?: string;
      groupBy?: 'month' | 'year' | 'property';
    }
  ): Promise<any> {
    try {
      if (propertyIds.length === 0) {
        return [];
      }

      const where: any = {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds }
        }
      };

      if (filters?.startDate) {
        where.succeeded_at = { ...where.succeeded_at, gte: filters.startDate };
      }

      if (filters?.endDate) {
        where.succeeded_at = { ...where.succeeded_at, lte: filters.endDate };
      }

      if (filters?.propertyId) {
        // Verify that the filtered propertyId is in the allowed list
        if (propertyIds.includes(filters.propertyId)) {
          // Replace the lease clause with the specific propertyId filter
          where.lease = { property_id: filters.propertyId };
        } else {
          // If propertyId is not in allowed list, return empty result
          return [];
        }
      }

      const payments = await prisma.rentalPayment.findMany({
        where,
        include: {
          lease: {
            include: {
              property: {
                select: {
                  id: true,
                  address: true
                }
              }
            }
          }
        },
        orderBy: {
          succeeded_at: 'desc'
        }
      });

      return payments;
    } catch (error) {
      logger.error('Error getting owner revenues:', error);
      throw error;
    }
  }

  /**
   * T075: Get revenue summary
   */
  async getRevenueSummary(propertyIds: string[], tenantId: string): Promise<RevenueSummaryData> {
    try {
      if (propertyIds.length === 0) {
        return {
          currentMonth: 0,
          lastMonth: 0,
          currentYear: 0,
          lastYear: 0,
          allTime: 0,
          averageMonthly: 0
        };
      }

      const now = new Date();
      const currentMonthStart = startOfMonth(now);
      const currentMonthEnd = endOfMonth(now);
      const lastMonthStart = startOfMonth(subMonths(now, 1));
      const lastMonthEnd = endOfMonth(subMonths(now, 1));
      const currentYearStart = startOfYear(now);
      const currentYearEnd = endOfYear(now);
      const lastYearStart = startOfYear(subYears(now, 1));
      const lastYearEnd = endOfYear(subYears(now, 1));

      // Current month
      const currentMonthRevenue = await prisma.rentalPayment.aggregate({
        where: {
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS,
          lease: {
            property_id: { in: propertyIds }
          },
          succeeded_at: {
            gte: currentMonthStart,
            lte: currentMonthEnd
          }
        },
        _sum: { amount: true }
      });

      // Last month
      const lastMonthRevenue = await prisma.rentalPayment.aggregate({
        where: {
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS,
          lease: {
            property_id: { in: propertyIds }
          },
          succeeded_at: {
            gte: lastMonthStart,
            lte: lastMonthEnd
          }
        },
        _sum: { amount: true }
      });

      // Current year
      const currentYearRevenue = await prisma.rentalPayment.aggregate({
        where: {
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS,
          lease: {
            property_id: { in: propertyIds }
          },
          succeeded_at: {
            gte: currentYearStart,
            lte: currentYearEnd
          }
        },
        _sum: { amount: true }
      });

      // Last year
      const lastYearRevenue = await prisma.rentalPayment.aggregate({
        where: {
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS,
          lease: {
            property_id: { in: propertyIds }
          },
          succeeded_at: {
            gte: lastYearStart,
            lte: lastYearEnd
          }
        },
        _sum: { amount: true }
      });

      // All time
      const allTimeRevenue = await prisma.rentalPayment.aggregate({
        where: {
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS,
          lease: {
            property_id: { in: propertyIds }
          }
        },
        _sum: { amount: true }
      });

      // Get first payment date to calculate average monthly
      const firstPayment = await prisma.rentalPayment.findFirst({
        where: {
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS,
          lease: {
            property_id: { in: propertyIds }
          }
        },
        orderBy: {
          succeeded_at: 'asc'
        },
        select: {
          succeeded_at: true
        }
      });

      let averageMonthly = 0;
      if (firstPayment && allTimeRevenue._sum.amount) {
        const monthsDiff = Math.max(
          1,
          Math.ceil((now.getTime() - firstPayment.succeeded_at!.getTime()) / (1000 * 60 * 60 * 24 * 30))
        );
        averageMonthly = Number(allTimeRevenue._sum.amount) / monthsDiff;
      }

      return {
        currentMonth: Number(currentMonthRevenue._sum.amount || 0),
        lastMonth: Number(lastMonthRevenue._sum.amount || 0),
        currentYear: Number(currentYearRevenue._sum.amount || 0),
        lastYear: Number(lastYearRevenue._sum.amount || 0),
        allTime: Number(allTimeRevenue._sum.amount || 0),
        averageMonthly
      };
    } catch (error) {
      logger.error('Error getting revenue summary:', error);
      throw error;
    }
  }

  /**
   * T076: Get revenues by property
   */
  async getRevenuesByProperty(
    propertyIds: string[],
    tenantId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<RevenueByPropertyData[]> {
    try {
      if (propertyIds.length === 0) {
        return [];
      }

      const where: any = {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds }
        }
      };

      if (filters?.startDate) {
        where.succeeded_at = { ...where.succeeded_at, gte: filters.startDate };
      }

      if (filters?.endDate) {
        where.succeeded_at = { ...where.succeeded_at, lte: filters.endDate };
      }

      // Group by property using Prisma groupBy
      const payments = await prisma.rentalPayment.findMany({
        where,
        include: {
          lease: {
            include: {
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

      // Group and aggregate manually
      const revenueByProperty = new Map<string, { revenue: number; paymentCount: number; address: string }>();

      for (const payment of payments) {
        const propertyId = payment.lease?.property_id || '';
        const address = payment.lease?.property?.address || 'Adresse non disponible';

        if (!revenueByProperty.has(propertyId)) {
          revenueByProperty.set(propertyId, { revenue: 0, paymentCount: 0, address });
        }

        const current = revenueByProperty.get(propertyId)!;
        current.revenue += Number(payment.amount);
        current.paymentCount += 1;
      }

      return Array.from(revenueByProperty.entries()).map(([propertyId, data]) => ({
        propertyId,
        propertyAddress: data.address,
        revenue: data.revenue,
        paymentCount: data.paymentCount
      }));
    } catch (error) {
      logger.error('Error getting revenues by property:', error);
      throw error;
    }
  }

  /**
   * T077: Get revenues by month for a year
   */
  async getRevenuesByMonth(propertyIds: string[], tenantId: string, year: number): Promise<RevenueByMonthData[]> {
    try {
      if (propertyIds.length === 0) {
        return [];
      }

      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31, 23, 59, 59);

      // Get all payments for the year
      const payments = await prisma.rentalPayment.findMany({
        where: {
          tenant_id: tenantId,
          status: RentalPaymentStatus.SUCCESS,
          lease: {
            property_id: { in: propertyIds }
          },
          succeeded_at: {
            gte: yearStart,
            lte: yearEnd
          }
        }
      });

      // Group by month
      const revenueByMonth = new Map<string, { revenue: number; paymentCount: number }>();

      for (const payment of payments) {
        if (!payment.succeeded_at) continue;
        const paymentDate = new Date(payment.succeeded_at);
        const monthKey = format(paymentDate, 'yyyy-MM');
        if (!revenueByMonth.has(monthKey)) {
          revenueByMonth.set(monthKey, { revenue: 0, paymentCount: 0 });
        }

        const current = revenueByMonth.get(monthKey)!;
        current.revenue += Number(payment.amount);
        current.paymentCount += 1;
      }

      // Ensure all months of the year are included (even with 0 revenue)
      const allMonths = eachMonthOfInterval({ start: yearStart, end: yearEnd });
      const result: RevenueByMonthData[] = allMonths.map(month => {
        const monthKey = format(month, 'yyyy-MM');
        const monthName = format(month, 'MMMM yyyy');
        const data = revenueByMonth.get(monthKey) || { revenue: 0, paymentCount: 0 };

        return {
          month: monthKey,
          monthName,
          revenue: data.revenue,
          paymentCount: data.paymentCount
        };
      });

      return result;
    } catch (error) {
      logger.error('Error getting revenues by month:', error);
      throw error;
    }
  }

  /**
   * T091-T092: Get installments with filtering and summary
   */
  async getInstallments(
    propertyIds: string[],
    tenantId: string,
    filters?: {
      status?: RentalInstallmentStatus;
      propertyId?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<InstallmentsListData> {
    try {
      if (propertyIds.length === 0) {
        return {
          installments: [],
          summary: {
            total: 0,
            due: 0,
            overdue: 0,
            paid: 0,
            totalAmount: 0,
            dueAmount: 0
          }
        };
      }

      const where: any = {
        tenant_id: tenantId,
        lease: {
          property_id: { in: propertyIds }
        }
      };

      if (filters?.status) {
        where.status = filters.status;
      }

      if (filters?.propertyId) {
        // Verify that the filtered propertyId is in the allowed list
        if (propertyIds.includes(filters.propertyId)) {
          // Replace the lease clause with the specific propertyId filter
          where.lease = { property_id: filters.propertyId };
        } else {
          // If propertyId is not in allowed list, return empty result
          return {
            installments: [],
            summary: {
              total: 0,
              due: 0,
              overdue: 0,
              paid: 0,
              totalAmount: 0,
              dueAmount: 0
            }
          };
        }
      }

      if (filters?.startDate || filters?.endDate) {
        where.due_date = {};
        if (filters?.startDate) {
          where.due_date.gte = filters.startDate;
        }
        if (filters?.endDate) {
          where.due_date.lte = filters.endDate;
        }
      }

      // Get installments
      const installments = await prisma.rentalInstallment.findMany({
        where,
        include: {
          allocations: {
            include: {
              payment: {
                select: {
                  status: true
                }
              }
            }
          },
          penalties: {
            select: {
              amount: true
            }
          },
          lease: {
            include: {
              property: {
                select: {
                  id: true,
                  address: true,
                  title: true,
                  internalReference: true
                }
              },
              primaryRenter: {
                include: {
                  user: {
                    select: {
                      fullName: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: {
          due_date: 'desc'
        }
      });

      // Transform to InstallmentListItem
      const installmentList: InstallmentListItem[] = installments.map(inst => {
        const paidAmount = Number(
          (inst.allocations || []).reduce(
            (sum, alloc) =>
              alloc.payment?.status === RentalPaymentStatus.SUCCESS ? sum + Number(alloc.amount || 0) : sum,
            0
          )
        );
        const penaltiesTotalFromRows = (inst.penalties || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const penaltyAmount = Number(inst.penalty_amount || 0) || penaltiesTotalFromRows;
        const totalAmount =
          Number(inst.amount_rent) + Number(inst.amount_service) + Number(inst.amount_other_fees) + penaltyAmount;
        const computedStatus =
          paidAmount >= totalAmount && totalAmount > 0
            ? RentalInstallmentStatus.PAID
            : paidAmount > 0
              ? RentalInstallmentStatus.PARTIAL
              : inst.status;
        const propertyAddress =
          inst.lease?.property?.title?.trim() ||
          inst.lease?.property?.address?.trim() ||
          inst.lease?.property?.internalReference?.trim() ||
          'Adresse non disponible';
        const tenantName = inst.lease?.primaryRenter?.user?.fullName || 'Locataire inconnu';
        const period = `${inst.period_month.toString().padStart(2, '0')}/${inst.period_year}`;

        return {
          id: inst.id,
          propertyAddress,
          tenantName,
          period,
          dueDate: inst.due_date,
          penaltyAmount,
          paidAmount,
          amount: totalAmount,
          status: computedStatus
        };
      });

      // Calculate summary
      const now = new Date();
      const total = installmentList.length;
      const due = installmentList.filter(
        inst => inst.status === RentalInstallmentStatus.DUE && new Date(inst.dueDate) >= now
      ).length;
      const overdue = installmentList.filter(
        inst =>
          inst.status === RentalInstallmentStatus.OVERDUE ||
          (inst.status === RentalInstallmentStatus.DUE && new Date(inst.dueDate) < now)
      ).length;
      const paid = installmentList.filter(inst => inst.status === RentalInstallmentStatus.PAID).length;

      const totalAmount = installmentList.reduce((sum, inst) => sum + Number(inst.amount || 0), 0);

      const dueAmount = installmentList
        .filter(
          inst =>
            inst.status === RentalInstallmentStatus.DUE ||
            inst.status === RentalInstallmentStatus.OVERDUE ||
            inst.status === RentalInstallmentStatus.PARTIAL
        )
        .reduce((sum, inst) => sum + (Number(inst.amount || 0) - Number(inst.paidAmount || 0)), 0);

      return {
        installments: installmentList,
        summary: {
          total,
          due,
          overdue,
          paid,
          totalAmount,
          dueAmount
        }
      };
    } catch (error) {
      logger.error('Error getting owner installments:', error);
      throw error;
    }
  }

  /**
   * T099-T100: Get payments with filtering and summary
   */
  async getPayments(
    propertyIds: string[],
    tenantId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      propertyId?: string;
      method?: RentalPaymentMethod;
    }
  ): Promise<PaymentsListData> {
    try {
      if (propertyIds.length === 0) {
        return {
          payments: [],
          summary: {
            total: 0,
            totalAmount: 0,
            thisMonth: 0,
            thisYear: 0
          }
        };
      }

      const where: any = {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease_id: { not: null }, // Only include payments with a lease
        lease: {
          property_id: { in: propertyIds }
        }
      };

      if (filters?.startDate || filters?.endDate) {
        const range: { gte?: Date; lte?: Date } = {};
        if (filters?.startDate) range.gte = filters.startDate;
        if (filters?.endDate) range.lte = filters.endDate;

        where.OR = [
          { succeeded_at: range },
          {
            AND: [{ succeeded_at: null }, { initiated_at: range }]
          }
        ];
      }

      if (filters?.propertyId) {
        // Verify that the filtered propertyId is in the allowed list
        if (propertyIds.includes(filters.propertyId)) {
          // Replace the lease clause with the specific propertyId filter
          where.lease = { property_id: filters.propertyId };
        } else {
          // If propertyId is not in allowed list, return empty result
          return {
            payments: [],
            summary: {
              total: 0,
              totalAmount: 0,
              thisMonth: 0,
              thisYear: 0
            }
          };
        }
      }

      if (filters?.method) {
        where.method = filters.method;
      }

      // Get payments
      const payments = await prisma.rentalPayment.findMany({
        where,
        include: {
          lease: {
            include: {
              property: {
                select: {
                  id: true,
                  address: true,
                  title: true,
                  internalReference: true
                }
              },
              primaryRenter: {
                include: {
                  user: {
                    select: {
                      fullName: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: [{ succeeded_at: 'desc' }, { initiated_at: 'desc' }]
      });

      // Transform to PaymentListItem
      const paymentList: PaymentListItem[] = payments.map(payment => {
        const propertyAddress =
          payment.lease?.property?.title?.trim() ||
          payment.lease?.property?.address?.trim() ||
          payment.lease?.property?.internalReference?.trim() ||
          'Adresse non disponible';
        const tenantName = payment.lease?.primaryRenter?.user?.fullName || 'Locataire inconnu';

        return {
          id: payment.id,
          propertyAddress,
          tenantName,
          amount: Number(payment.amount),
          date: payment.succeeded_at || payment.initiated_at,
          method: payment.method,
          status: payment.status
        };
      });

      // Calculate summary
      const now = new Date();
      const currentMonthStart = startOfMonth(now);
      const currentMonthEnd = endOfMonth(now);
      const currentYearStart = startOfYear(now);
      const currentYearEnd = endOfYear(now);

      const total = paymentList.length;
      const totalAmount = paymentList.reduce((sum, p) => sum + p.amount, 0);

      const thisMonth = paymentList.filter(p => {
        const paymentDate = new Date(p.date);
        return paymentDate >= currentMonthStart && paymentDate <= currentMonthEnd;
      }).length;

      const thisYear = paymentList.filter(p => {
        const paymentDate = new Date(p.date);
        return paymentDate >= currentYearStart && paymentDate <= currentYearEnd;
      }).length;

      return {
        payments: paymentList,
        summary: {
          total,
          totalAmount,
          thisMonth,
          thisYear
        }
      };
    } catch (error) {
      logger.error('Error getting owner payments:', error);
      throw error;
    }
  }

  /**
   * T101: Get payment details with allocations
   */
  async getPaymentDetails(paymentId: string, propertyIds: string[], tenantId: string): Promise<PaymentDetailsData> {
    try {
      // Get payment with all relations
      const payment = await prisma.rentalPayment.findFirst({
        where: {
          id: paymentId,
          tenant_id: tenantId,
          lease: {
            property_id: { in: propertyIds }
          }
        },
        include: {
          lease: {
            include: {
              property: true,
              primaryRenter: {
                include: {
                  user: true
                }
              }
            }
          },
          allocations: {
            include: {
              installment: {
                include: {
                  lease: {
                    include: {
                      property: {
                        select: {
                          id: true,
                          address: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!payment) {
        throw new Error('Paiement non trouvé ou accès non autorisé');
      }

      return {
        payment: payment as any
      };
    } catch (error) {
      logger.error('Error getting payment details:', error);
      throw error;
    }
  }

  /**
   * T110-T111: Get deposits with summary
   */
  async getDeposits(propertyIds: string[], tenantId: string): Promise<DepositsListData> {
    try {
      if (propertyIds.length === 0) {
        return {
          deposits: [],
          summary: {
            total: 0,
            totalHeld: 0,
            totalReleased: 0
          }
        };
      }

      // Get deposits for owner's properties
      const deposits = await prisma.rentalSecurityDeposit.findMany({
        where: {
          tenant_id: tenantId,
          lease: {
            property_id: { in: propertyIds }
          }
        },
        include: {
          lease: {
            include: {
              property: {
                select: {
                  id: true,
                  address: true
                }
              },
              primaryRenter: {
                include: {
                  user: {
                    select: {
                      fullName: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      // Transform to DepositListItem
      const depositList: DepositListItem[] = deposits.map(deposit => {
        const propertyAddress = deposit.lease?.property?.address || 'Adresse non disponible';
        const tenantName = deposit.lease?.primaryRenter?.user?.fullName || 'Locataire inconnu';

        // Determine status based on amounts
        let status = 'PENDING';
        if (Number(deposit.collected_amount) > 0) {
          if (Number(deposit.held_amount) > 0) {
            status = 'HELD';
          } else if (Number(deposit.refunded_amount) > 0) {
            status = 'REFUNDED';
          } else if (Number(deposit.forfeited_amount) > 0) {
            status = 'FORFEITED';
          } else {
            status = 'COLLECTED';
          }
        }

        return {
          id: deposit.id,
          propertyAddress,
          tenantName,
          depositAmount: Number(deposit.target_amount),
          currentHeldAmount: Number(deposit.held_amount),
          status
        };
      });

      // Calculate summary
      const total = depositList.length;
      const totalHeld = depositList.reduce((sum, d) => sum + d.currentHeldAmount, 0);
      const totalReleased = depositList.reduce((sum, d) => {
        if (d.status === 'REFUNDED' || d.status === 'FORFEITED') {
          return sum + (d.depositAmount - d.currentHeldAmount);
        }
        return sum;
      }, 0);

      return {
        deposits: depositList,
        summary: {
          total,
          totalHeld,
          totalReleased
        }
      };
    } catch (error) {
      logger.error('Error getting owner deposits:', error);
      throw error;
    }
  }

  /**
   * T112: Get deposit movements
   */
  async getDepositMovements(depositId: string, propertyIds: string[], tenantId: string): Promise<DepositMovementsData> {
    try {
      // First verify the deposit belongs to owner's properties
      const deposit = await prisma.rentalSecurityDeposit.findFirst({
        where: {
          id: depositId,
          tenant_id: tenantId,
          lease: {
            property_id: { in: propertyIds }
          }
        }
      });

      if (!deposit) {
        throw new Error('Dépôt de garantie non trouvé ou accès non autorisé');
      }

      // Get movements
      const movements = await prisma.rentalDepositMovement.findMany({
        where: {
          deposit_id: depositId,
          tenant_id: tenantId
        },
        include: {
          payment: {
            select: {
              id: true,
              amount: true,
              method: true,
              succeeded_at: true
            }
          },
          installment: {
            select: {
              id: true,
              period_year: true,
              period_month: true,
              due_date: true
            }
          },
          createdBy: {
            select: {
              fullName: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      return {
        movements: movements.map(m => ({
          id: m.id,
          type: m.type,
          amount: Number(m.amount),
          currency: m.currency,
          note: m.note,
          createdAt: m.created_at,
          payment: m.payment,
          installment: m.installment
            ? {
                id: m.installment.id,
                period: `${m.installment.period_month.toString().padStart(2, '0')}/${m.installment.period_year}`,
                dueDate: m.installment.due_date
              }
            : null,
          createdBy: m.createdBy?.fullName || null
        }))
      };
    } catch (error) {
      logger.error('Error getting deposit movements:', error);
      throw error;
    }
  }

  /**
   * T120-T121: Get maintenance tickets with filtering and summary
   */
  async getMaintenanceTickets(
    propertyIds: string[],
    tenantId: string,
    filters?: {
      status?: MaintenanceTicketStatus;
      propertyId?: string;
      category?: MaintenanceTicketCategory;
      priority?: MaintenanceTicketPriority;
    }
  ): Promise<MaintenanceTicketsListData> {
    try {
      if (propertyIds.length === 0) {
        return {
          tickets: [],
          summary: {
            total: 0,
            open: 0,
            inProgress: 0,
            resolved: 0,
            totalCost: 0
          }
        };
      }

      const where: any = {
        tenant_id: tenantId,
        property_id: { in: propertyIds }
      };

      if (filters?.status) {
        where.status = filters.status;
      }

      if (filters?.propertyId) {
        where.property_id = filters.propertyId;
      }

      if (filters?.category) {
        where.category = filters.category;
      }

      if (filters?.priority) {
        where.priority = filters.priority;
      }

      // Get tickets
      const tickets = await prisma.maintenanceTicket.findMany({
        where,
        include: {
          property: {
            select: {
              id: true,
              address: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      // Transform to MaintenanceTicketListItem
      const ticketList: MaintenanceTicketListItem[] = tickets.map(ticket => ({
        id: ticket.id,
        propertyAddress: ticket.property?.address || 'Adresse non disponible',
        category: ticket.category,
        priority: ticket.priority,
        title: ticket.title,
        status: ticket.status,
        createdAt: ticket.created_at
      }));

      // Calculate summary
      const total = ticketList.length;
      const open = ticketList.filter(t => t.status === MaintenanceTicketStatus.DECLARED).length;
      const inProgress = ticketList.filter(
        t => t.status === MaintenanceTicketStatus.IN_PROGRESS || t.status === MaintenanceTicketStatus.ASSIGNED
      ).length;
      const resolved = ticketList.filter(t => t.status === MaintenanceTicketStatus.RESOLVED).length;

      // Note: totalCost calculation would require a MaintenanceTicketCost model
      // For now, we set it to 0 as there's no cost tracking in the schema
      const totalCost = 0;

      return {
        tickets: ticketList,
        summary: {
          total,
          open,
          inProgress,
          resolved,
          totalCost
        }
      };
    } catch (error) {
      logger.error('Error getting owner maintenance tickets:', error);
      throw error;
    }
  }

  /**
   * T122: Get maintenance ticket details
   */
  async getMaintenanceTicketDetails(
    ticketId: string,
    propertyIds: string[],
    tenantId: string
  ): Promise<MaintenanceTicketDetailsData> {
    try {
      // Get ticket with all relations
      const ticket = await prisma.maintenanceTicket.findFirst({
        where: {
          id: ticketId,
          tenant_id: tenantId,
          property_id: { in: propertyIds }
        },
        include: {
          property: true,
          lease: {
            include: {
              primaryRenter: {
                include: {
                  user: true
                }
              }
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
                  fullName: true,
                  email: true
                }
              },
              authorContact: {
                select: {
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
                  fullName: true,
                  email: true
                }
              }
            },
            orderBy: {
              changed_at: 'asc'
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
              fullName: true,
              email: true
            }
          }
        }
      });

      if (!ticket) {
        throw new Error('Ticket de maintenance non trouvé ou accès non autorisé');
      }

      return {
        ticket: ticket as any
      };
    } catch (error) {
      logger.error('Error getting maintenance ticket details:', error);
      throw error;
    }
  }

  /**
   * T130-T131-T132: Get documents with filtering and grouping
   */
  async getDocuments(
    propertyIds: string[],
    tenantId: string,
    filters?: {
      documentType?: RentalDocumentType;
      propertyId?: string;
      leaseId?: string;
    }
  ): Promise<DocumentsListData> {
    try {
      if (propertyIds.length === 0) {
        return {
          documents: [],
          groupedByType: {}
        };
      }

      const where: any = {
        tenant_id: tenantId,
        status: {
          not: 'VOID'
        },
        OR: [
          {
            lease: {
              property_id: { in: propertyIds }
            }
          },
          {
            // Documents can also be linked to installments or payments which are linked to leases
            installment: {
              lease: {
                property_id: { in: propertyIds }
              }
            }
          },
          {
            payment: {
              lease: {
                property_id: { in: propertyIds }
              }
            }
          }
        ]
      };

      if (filters?.documentType) {
        where.type = filters.documentType;
      }

      if (filters?.propertyId) {
        where.OR = [
          {
            lease: {
              property_id: filters.propertyId
            }
          },
          {
            installment: {
              lease: {
                property_id: filters.propertyId
              }
            }
          },
          {
            payment: {
              lease: {
                property_id: filters.propertyId
              }
            }
          }
        ];
      }

      if (filters?.leaseId) {
        where.lease_id = filters.leaseId;
      }

      // Get documents
      const documents = await prisma.rentalDocument.findMany({
        where,
        include: {
          lease: {
            include: {
              property: {
                select: {
                  id: true,
                  address: true
                }
              }
            }
          }
        },
        orderBy: {
          issued_at: 'desc'
        }
      });

      // Group by type
      const groupedByType: Record<string, any[]> = {};
      for (const doc of documents) {
        const type = doc.type;
        if (!groupedByType[type]) {
          groupedByType[type] = [];
        }
        groupedByType[type].push(doc);
      }

      return {
        documents: documents as any[],
        groupedByType
      };
    } catch (error) {
      logger.error('Error getting owner documents:', error);
      throw error;
    }
  }

  /**
   * T132: Download document
   */
  async downloadDocument(
    documentId: string,
    propertyIds: string[],
    tenantId: string
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    try {
      // Verify document belongs to owner's properties
      const document = await prisma.rentalDocument.findFirst({
        where: {
          id: documentId,
          tenant_id: tenantId,
          status: {
            not: 'VOID'
          },
          OR: [
            {
              lease: {
                property_id: { in: propertyIds }
              }
            },
            {
              installment: {
                lease: {
                  property_id: { in: propertyIds }
                }
              }
            },
            {
              payment: {
                lease: {
                  property_id: { in: propertyIds }
                }
              }
            }
          ]
        }
      });

      if (!document) {
        throw new Error('Document non trouvé ou accès non autorisé');
      }

      // Get document file
      const buffer = await getDocumentFile(tenantId, documentId);

      // Determine file name
      const fileExtension = document.file_path ? document.file_path.split('.').pop() : 'pdf';
      const fileName = document.document_number
        ? `${document.document_number}.${fileExtension}`
        : `document-${documentId}.${fileExtension}`;

      return {
        buffer,
        fileName,
        mimeType: document.mime_type || 'application/pdf'
      };
    } catch (error) {
      logger.error('Error downloading document:', error);
      throw error;
    }
  }

  /**
   * Generate revenue report
   */
  async generateRevenueReport(
    propertyIds: string[],
    tenantId: string,
    params: {
      startDate: Date;
      endDate: Date;
      propertyId?: string;
      format: 'pdf' | 'csv' | 'excel';
    }
  ): Promise<Buffer> {
    try {
      if (propertyIds.length === 0) {
        throw new Error('Aucune propriété trouvée');
      }

      // Get revenue data
      const where: any = {
        tenant_id: tenantId,
        status: RentalPaymentStatus.SUCCESS,
        lease: {
          property_id: { in: propertyIds }
        },
        succeeded_at: {
          gte: params.startDate,
          lte: params.endDate
        }
      };

      if (params.propertyId) {
        // Verify that the filtered propertyId is in the allowed list
        if (propertyIds.includes(params.propertyId)) {
          // Replace the lease clause with the specific propertyId filter
          where.lease = { property_id: params.propertyId };
        } else {
          // If propertyId is not in allowed list, throw error
          throw new Error('Propriété non autorisée');
        }
      }

      const payments = await prisma.rentalPayment.findMany({
        where,
        include: {
          lease: {
            include: {
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

      // Calculate totals
      const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const paymentCount = payments.length;

      // Group by property
      const revenuesByPropertyMap = new Map<string, { revenue: number; paymentCount: number; address: string }>();
      for (const payment of payments) {
        const propertyId = payment.lease?.property_id || '';
        const address = payment.lease?.property?.address || 'Adresse non disponible';
        if (!revenuesByPropertyMap.has(propertyId)) {
          revenuesByPropertyMap.set(propertyId, { revenue: 0, paymentCount: 0, address });
        }
        const current = revenuesByPropertyMap.get(propertyId)!;
        current.revenue += Number(payment.amount);
        current.paymentCount += 1;
      }

      const revenuesByProperty = Array.from(revenuesByPropertyMap.entries()).map(([_id, data]) => ({
        propertyAddress: data.address,
        revenue: data.revenue,
        paymentCount: data.paymentCount
      }));

      // Group by month
      const revenuesByMonthMap = new Map<string, { month: string; revenue: number }>();
      for (const payment of payments) {
        if (!payment.succeeded_at) continue;
        const monthKey = format(payment.succeeded_at, 'yyyy-MM');
        const monthName = format(payment.succeeded_at, 'MMMM yyyy');
        if (!revenuesByMonthMap.has(monthKey)) {
          revenuesByMonthMap.set(monthKey, { month: monthName, revenue: 0 });
        }
        const current = revenuesByMonthMap.get(monthKey)!;
        current.revenue += Number(payment.amount);
      }

      const revenuesByMonth = Array.from(revenuesByMonthMap.values());

      const reportData = {
        startDate: params.startDate,
        endDate: params.endDate,
        propertyId: params.propertyId,
        totalRevenue,
        paymentCount,
        revenuesByProperty,
        revenuesByMonth
      };

      // Generate report based on format
      if (params.format === 'pdf') {
        return await generateRevenueReportPDF(reportData, tenantId);
      } else if (params.format === 'csv') {
        return await generateRevenueReportCSV(reportData, tenantId);
      } else {
        return await generateRevenueReportExcel(reportData, tenantId);
      }
    } catch (error) {
      logger.error('Error generating revenue report:', error);
      throw error;
    }
  }

  /**
   * Generate occupancy report
   */
  async generateOccupancyReport(
    propertyIds: string[],
    tenantId: string,
    params: {
      asOfDate: Date;
      format: 'pdf' | 'csv' | 'excel';
    }
  ): Promise<Buffer> {
    try {
      if (propertyIds.length === 0) {
        throw new Error('Aucune propriété trouvée');
      }

      // Get properties
      const properties = await prisma.property.findMany({
        where: {
          id: { in: propertyIds },
          tenantId: tenantId
        },
        include: {
          rentalLeases: {
            where: {
              status: RentalLeaseStatus.ACTIVE,
              start_date: { lte: params.asOfDate },
              OR: [{ end_date: null }, { end_date: { gte: params.asOfDate } }]
            },
            include: {
              primaryRenter: {
                include: {
                  user: {
                    select: {
                      fullName: true
                    }
                  }
                }
              }
            },
            take: 1,
            orderBy: {
              start_date: 'desc'
            }
          }
        }
      });

      const totalProperties = properties.length;
      const occupiedProperties = properties.filter(p => p.rentalLeases.length > 0).length;
      const availableProperties = totalProperties - occupiedProperties;
      const occupancyRate = totalProperties > 0 ? (occupiedProperties / totalProperties) * 100 : 0;

      const propertiesData = properties.map(prop => ({
        address: prop.address,
        status: prop.status,
        currentLease: prop.rentalLeases[0]
          ? {
              leaseNumber: prop.rentalLeases[0].lease_number || '-',
              tenantName: prop.rentalLeases[0].primaryRenter?.user?.fullName || '-',
              startDate: prop.rentalLeases[0].start_date,
              endDate: prop.rentalLeases[0].end_date
            }
          : undefined
      }));

      const reportData = {
        asOfDate: params.asOfDate,
        totalProperties,
        occupiedProperties,
        availableProperties,
        occupancyRate,
        properties: propertiesData
      };

      // Generate report based on format
      if (params.format === 'pdf') {
        return await generateOccupancyReportPDF(reportData, tenantId);
      } else if (params.format === 'csv') {
        return await generateOccupancyReportCSV(reportData, tenantId);
      } else {
        return await generateOccupancyReportExcel(reportData, tenantId);
      }
    } catch (error) {
      logger.error('Error generating occupancy report:', error);
      throw error;
    }
  }

  /**
   * Export data
   */
  async exportData(
    propertyIds: string[],
    tenantId: string,
    params: {
      entityType: 'payments' | 'installments' | 'leases';
      startDate?: Date;
      endDate?: Date;
      propertyId?: string;
      format: 'csv' | 'excel';
    }
  ): Promise<Buffer> {
    try {
      if (propertyIds.length === 0) {
        throw new Error('Aucune propriété trouvée');
      }

      return await exportDataFunction(
        params.entityType,
        propertyIds,
        tenantId,
        {
          startDate: params.startDate,
          endDate: params.endDate,
          propertyId: params.propertyId
        },
        params.format
      );
    } catch (error) {
      logger.error('Error exporting data:', error);
      throw error;
    }
  }

  /**
   * Get owner preferences (newsletter consent)
   */
  async getPreferences(tenantClientId: string): Promise<{ newsletterConsent: boolean }> {
    const tc = await prisma.tenantClient.findFirst({
      where: { id: tenantClientId },
      select: { newsletterConsent: true }
    });
    if (!tc) throw new Error('Profil non trouvé.');
    return { newsletterConsent: tc.newsletterConsent };
  }

  /**
   * Update owner preferences (newsletter consent)
   */
  async updatePreferences(
    tenantClientId: string,
    data: { newsletterConsent?: boolean }
  ): Promise<{ newsletterConsent: boolean }> {
    const updated = await prisma.tenantClient.update({
      where: { id: tenantClientId },
      data: { ...(data.newsletterConsent != null && { newsletterConsent: data.newsletterConsent }) },
      select: { newsletterConsent: true }
    });
    return { newsletterConsent: updated.newsletterConsent };
  }
}
