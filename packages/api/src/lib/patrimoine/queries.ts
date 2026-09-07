import { Prisma, StatementStatus } from '@prisma/client';
import { badRequest, notFound } from '../errors';
import { prisma } from '../../utils/database';
import type { YieldInput } from './yield';

export async function ensureTenantProperty(tenantId: string, propertyId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId }
  });

  if (!property) {
    throw notFound('Bien introuvable ou inaccessible pour ce tenant');
  }

  return property;
}

function toDecimal(value: number | undefined): Prisma.Decimal | undefined {
  if (typeof value === 'number') {
    return new Prisma.Decimal(value);
  }
  return undefined;
}

export async function listPropertyValuations(tenantId: string, propertyId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.assetValuation.findMany({
    where: { tenantId, propertyId },
    include: { property: true },
    orderBy: { valuatedAt: 'desc' }
  });
}

export async function createPropertyValuation(
  tenantId: string,
  propertyId: string,
  data: {
    valuatedAt: Date;
    estimatedValue: number;
    currency: string;
    acquisitionCost?: number;
    acquisitionDate?: Date;
    method: 'MANUAL' | 'MARKET_ESTIMATE' | 'EXPERT_APPRAISAL';
    notes?: string;
  }
) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.assetValuation.create({
    data: {
      tenantId,
      propertyId,
      valuatedAt: data.valuatedAt,
      estimatedValue: new Prisma.Decimal(data.estimatedValue),
      currency: data.currency,
      acquisitionCost: toDecimal(data.acquisitionCost),
      acquisitionDate: data.acquisitionDate,
      method: data.method,
      notes: data.notes
    },
    include: { property: true }
  });
}

export async function updatePropertyValuation(
  tenantId: string,
  propertyId: string,
  valuationId: string,
  data: Partial<{
    valuatedAt: Date;
    estimatedValue: number;
    currency: string;
    acquisitionCost: number;
    acquisitionDate: Date;
    method: 'MANUAL' | 'MARKET_ESTIMATE' | 'EXPERT_APPRAISAL';
    notes: string;
  }>
) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.assetValuation.findFirst({
    where: { id: valuationId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Valorisation introuvable');

  return prisma.assetValuation.update({
    where: { id: valuationId },
    data: {
      valuatedAt: data.valuatedAt,
      estimatedValue: typeof data.estimatedValue === 'number' ? new Prisma.Decimal(data.estimatedValue) : undefined,
      currency: data.currency,
      acquisitionCost: toDecimal(data.acquisitionCost),
      acquisitionDate: data.acquisitionDate,
      method: data.method,
      notes: data.notes
    },
    include: { property: true }
  });
}

export async function getPropertyValuationById(tenantId: string, propertyId: string, valuationId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const valuation = await prisma.assetValuation.findFirst({
    where: { id: valuationId, tenantId, propertyId },
    include: { property: true }
  });
  if (!valuation) throw notFound('Valorisation introuvable');
  return valuation;
}

export async function deletePropertyValuation(tenantId: string, propertyId: string, valuationId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.assetValuation.findFirst({
    where: { id: valuationId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Valorisation introuvable');
  await prisma.assetValuation.delete({ where: { id: valuationId } });
}

export async function listPropertyExpenses(tenantId: string, propertyId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.propertyExpense.findMany({
    where: { tenantId, propertyId },
    include: { property: true },
    orderBy: { paidAt: 'desc' }
  });
}

export async function createPropertyExpense(
  tenantId: string,
  propertyId: string,
  data: {
    category:
      | 'PROPERTY_TAX'
      | 'CONDO_FEES'
      | 'INSURANCE'
      | 'ROUTINE_MAINTENANCE'
      | 'RENOVATION'
      | 'MANAGEMENT_FEES'
      | 'UTILITIES'
      | 'OTHER';
    label: string;
    amount: number;
    currency: string;
    paidAt: Date;
    isCapitalized: boolean;
    receiptUrl?: string;
    notes?: string;
  }
) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.propertyExpense.create({
    data: {
      tenantId,
      propertyId,
      category: data.category,
      label: data.label,
      amount: new Prisma.Decimal(data.amount),
      currency: data.currency,
      paidAt: data.paidAt,
      isCapitalized: data.isCapitalized,
      receiptUrl: data.receiptUrl,
      notes: data.notes
    },
    include: { property: true }
  });
}

export async function getPropertyExpenseById(tenantId: string, propertyId: string, expenseId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const expense = await prisma.propertyExpense.findFirst({
    where: { id: expenseId, tenantId, propertyId },
    include: { property: true }
  });
  if (!expense) throw notFound('Depense introuvable');
  return expense;
}

export async function updatePropertyExpense(
  tenantId: string,
  propertyId: string,
  expenseId: string,
  data: Partial<{
    category:
      | 'PROPERTY_TAX'
      | 'CONDO_FEES'
      | 'INSURANCE'
      | 'ROUTINE_MAINTENANCE'
      | 'RENOVATION'
      | 'MANAGEMENT_FEES'
      | 'UTILITIES'
      | 'OTHER';
    label: string;
    amount: number;
    currency: string;
    paidAt: Date;
    isCapitalized: boolean;
    receiptUrl: string;
    notes: string;
  }>
) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.propertyExpense.findFirst({
    where: { id: expenseId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Depense introuvable');

  return prisma.propertyExpense.update({
    where: { id: expenseId },
    data: {
      category: data.category,
      label: data.label,
      amount: typeof data.amount === 'number' ? new Prisma.Decimal(data.amount) : undefined,
      currency: data.currency,
      paidAt: data.paidAt,
      isCapitalized: data.isCapitalized,
      receiptUrl: data.receiptUrl,
      notes: data.notes
    },
    include: { property: true }
  });
}

export async function deletePropertyExpense(tenantId: string, propertyId: string, expenseId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.propertyExpense.findFirst({
    where: { id: expenseId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Depense introuvable');
  await prisma.propertyExpense.delete({ where: { id: expenseId } });
}

export async function listPropertyLoans(tenantId: string, propertyId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.propertyLoan.findMany({
    where: { tenantId, propertyId },
    include: { property: true },
    orderBy: { createdAt: 'desc' }
  });
}

export async function createPropertyLoan(
  tenantId: string,
  propertyId: string,
  data: {
    lender: string;
    capitalAmount: number;
    remainingCapital: number;
    interestRate: number;
    monthlyPayment: number;
    currency: string;
    startDate: Date;
    endDate: Date;
  }
) {
  await ensureTenantProperty(tenantId, propertyId);
  if (data.endDate <= data.startDate) {
    throw badRequest('La date de fin du pret doit etre posterieure a la date de debut');
  }
  return prisma.propertyLoan.create({
    data: {
      tenantId,
      propertyId,
      lender: data.lender,
      capitalAmount: new Prisma.Decimal(data.capitalAmount),
      remainingCapital: new Prisma.Decimal(data.remainingCapital),
      interestRate: new Prisma.Decimal(data.interestRate),
      monthlyPayment: new Prisma.Decimal(data.monthlyPayment),
      currency: data.currency,
      startDate: data.startDate,
      endDate: data.endDate
    },
    include: { property: true }
  });
}

export async function getPropertyLoanById(tenantId: string, propertyId: string, loanId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const loan = await prisma.propertyLoan.findFirst({
    where: { id: loanId, tenantId, propertyId },
    include: { property: true }
  });
  if (!loan) throw notFound('Pret introuvable');
  return loan;
}

export async function updatePropertyLoan(
  tenantId: string,
  propertyId: string,
  loanId: string,
  data: Partial<{
    lender: string;
    capitalAmount: number;
    remainingCapital: number;
    interestRate: number;
    monthlyPayment: number;
    currency: string;
    startDate: Date;
    endDate: Date;
    status: 'ACTIVE' | 'CLOSED' | 'DEFAULTED';
  }>
) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.propertyLoan.findFirst({
    where: { id: loanId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Pret introuvable');

  if (data.startDate && data.endDate && data.endDate <= data.startDate) {
    throw badRequest('La date de fin du pret doit etre posterieure a la date de debut');
  }

  return prisma.propertyLoan.update({
    where: { id: loanId },
    data: {
      lender: data.lender,
      capitalAmount: typeof data.capitalAmount === 'number' ? new Prisma.Decimal(data.capitalAmount) : undefined,
      remainingCapital:
        typeof data.remainingCapital === 'number' ? new Prisma.Decimal(data.remainingCapital) : undefined,
      interestRate: typeof data.interestRate === 'number' ? new Prisma.Decimal(data.interestRate) : undefined,
      monthlyPayment: typeof data.monthlyPayment === 'number' ? new Prisma.Decimal(data.monthlyPayment) : undefined,
      currency: data.currency,
      startDate: data.startDate,
      endDate: data.endDate,
      status: data.status
    },
    include: { property: true }
  });
}

export async function deletePropertyLoan(tenantId: string, propertyId: string, loanId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.propertyLoan.findFirst({
    where: { id: loanId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Pret introuvable');
  await prisma.propertyLoan.delete({ where: { id: loanId } });
}

export async function listPropertyWorkPrograms(tenantId: string, propertyId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.workProgram.findMany({
    where: { tenantId, propertyId },
    include: { property: true },
    orderBy: { plannedDate: 'asc' }
  });
}

export async function createPropertyWorkProgram(
  tenantId: string,
  propertyId: string,
  data: {
    title: string;
    description?: string;
    estimatedCost: number;
    currency: string;
    plannedDate: Date;
    isCapitalized: boolean;
  }
) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.workProgram.create({
    data: {
      tenantId,
      propertyId,
      title: data.title,
      description: data.description,
      estimatedCost: new Prisma.Decimal(data.estimatedCost),
      currency: data.currency,
      plannedDate: data.plannedDate,
      isCapitalized: data.isCapitalized
    },
    include: { property: true }
  });
}

export async function getPropertyWorkProgramById(tenantId: string, propertyId: string, programId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const program = await prisma.workProgram.findFirst({
    where: { id: programId, tenantId, propertyId },
    include: { property: true }
  });
  if (!program) throw notFound('Programme de travaux introuvable');
  return program;
}

export async function updatePropertyWorkProgram(
  tenantId: string,
  propertyId: string,
  programId: string,
  data: Partial<{
    title: string;
    description: string;
    estimatedCost: number;
    actualCost: number;
    currency: string;
    plannedDate: Date;
    completedDate: Date;
    status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    isCapitalized: boolean;
  }>
) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.workProgram.findFirst({
    where: { id: programId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Programme de travaux introuvable');

  return prisma.workProgram.update({
    where: { id: programId },
    data: {
      title: data.title,
      description: data.description,
      estimatedCost: typeof data.estimatedCost === 'number' ? new Prisma.Decimal(data.estimatedCost) : undefined,
      actualCost: typeof data.actualCost === 'number' ? new Prisma.Decimal(data.actualCost) : undefined,
      currency: data.currency,
      plannedDate: data.plannedDate,
      completedDate: data.completedDate,
      status: data.status,
      isCapitalized: data.isCapitalized
    },
    include: { property: true }
  });
}

export async function deletePropertyWorkProgram(tenantId: string, propertyId: string, programId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.workProgram.findFirst({
    where: { id: programId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Programme de travaux introuvable');
  await prisma.workProgram.delete({ where: { id: programId } });
}

export async function listPropertyDocuments(tenantId: string, propertyId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.patrimonyDocument.findMany({
    where: { tenantId, propertyId },
    include: { property: true, owner: true },
    orderBy: { createdAt: 'desc' }
  });
}

export async function createPropertyDocument(
  tenantId: string,
  propertyId: string,
  data: {
    title: string;
    type:
      | 'TITLE_DEED'
      | 'NOTARIAL_DEED'
      | 'TAX_DOCUMENT'
      | 'INSURANCE'
      | 'TECHNICAL_DIAGNOSIS'
      | 'FLOOR_PLAN'
      | 'BUILDING_PERMIT'
      | 'OTHER';
    fileUrl: string;
    expiresAt?: Date;
    ownerContactId?: string;
  }
) {
  await ensureTenantProperty(tenantId, propertyId);
  return prisma.patrimonyDocument.create({
    data: {
      tenantId,
      propertyId,
      ownerContactId: data.ownerContactId,
      title: data.title,
      type: data.type,
      fileUrl: data.fileUrl,
      expiresAt: data.expiresAt
    },
    include: { property: true, owner: true }
  });
}

export async function getPropertyDocumentById(tenantId: string, propertyId: string, documentId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const document = await prisma.patrimonyDocument.findFirst({
    where: { id: documentId, tenantId, propertyId },
    include: { property: true, owner: true }
  });
  if (!document) throw notFound('Document patrimoine introuvable');
  return document;
}

export async function deletePropertyDocument(tenantId: string, propertyId: string, documentId: string) {
  await ensureTenantProperty(tenantId, propertyId);
  const existing = await prisma.patrimonyDocument.findFirst({
    where: { id: documentId, tenantId, propertyId }
  });
  if (!existing) throw notFound('Document patrimoine introuvable');
  await prisma.patrimonyDocument.delete({ where: { id: documentId } });
}

export async function getPatrimoineOverview(tenantId: string) {
  const now = new Date();
  const year = now.getFullYear();

  const [properties, valuations, activeLoans, expensesThisYear, activeLeases] = await Promise.all([
    prisma.property.findMany({ where: { tenantId }, select: { id: true } }),
    prisma.assetValuation.findMany({
      where: { tenantId },
      orderBy: [{ propertyId: 'asc' }, { valuatedAt: 'desc' }]
    }),
    prisma.propertyLoan.findMany({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.propertyExpense.findMany({
      where: {
        tenantId,
        paidAt: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31, 23, 59, 59, 999)
        }
      }
    }),
    prisma.rentalLease.findMany({
      where: { tenant_id: tenantId, status: 'ACTIVE' },
      select: { property_id: true, rent_amount: true }
    })
  ]);

  const latestByProperty = new Map<string, number>();
  for (const valuation of valuations) {
    if (!latestByProperty.has(valuation.propertyId)) {
      latestByProperty.set(valuation.propertyId, Number(valuation.estimatedValue));
    }
  }

  const occupiedPropertyCount = new Set(activeLeases.map(lease => lease.property_id)).size;

  return {
    totalProperties: properties.length,
    occupiedProperties: occupiedPropertyCount,
    occupancyRate: properties.length > 0 ? occupiedPropertyCount / properties.length : 0,
    totalEstimatedValue: [...latestByProperty.values()].reduce((sum, value) => sum + value, 0),
    totalLoanBalance: activeLoans.reduce((sum, loan) => sum + Number(loan.remainingCapital), 0),
    totalExpensesThisYear: expensesThisYear.reduce((sum, expense) => sum + Number(expense.amount), 0),
    totalAnnualRent: activeLeases.reduce((sum, lease) => sum + Number(lease.rent_amount) * 12, 0)
  };
}

export async function buildPropertyYieldInput(tenantId: string, propertyId: string): Promise<YieldInput> {
  await ensureTenantProperty(tenantId, propertyId);
  const [lease, latestValuation, expenses, loans] = await Promise.all([
    prisma.rentalLease.findFirst({
      where: { tenant_id: tenantId, property_id: propertyId, status: 'ACTIVE' },
      orderBy: { created_at: 'desc' }
    }),
    prisma.assetValuation.findFirst({
      where: { tenantId, propertyId },
      orderBy: { valuatedAt: 'desc' }
    }),
    prisma.propertyExpense.findMany({ where: { tenantId, propertyId } }),
    prisma.propertyLoan.findMany({ where: { tenantId, propertyId, status: 'ACTIVE' } })
  ]);

  const annualRent = lease ? Number(lease.rent_amount) * 12 : 0;
  const currentValue = latestValuation ? Number(latestValuation.estimatedValue) : 0;
  const acquisitionCost = latestValuation?.acquisitionCost ? Number(latestValuation.acquisitionCost) : 0;
  const annualExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const annualLoanPayments = loans.reduce((sum, loan) => sum + Number(loan.monthlyPayment) * 12, 0);

  return {
    annualRent,
    currentValue,
    acquisitionCost,
    annualExpenses,
    annualLoanPayments
  };
}

export async function listOwnerStatements(
  tenantId: string,
  filters?: {
    ownerContactId?: string;
    period?: string;
  }
) {
  return prisma.ownerStatement.findMany({
    where: {
      tenantId,
      ownerContactId: filters?.ownerContactId,
      period: filters?.period
    },
    include: {
      owner: true,
      items: {
        include: { property: true }
      }
    },
    orderBy: [{ period: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function getOwnerStatementById(tenantId: string, statementId: string) {
  const statement = await prisma.ownerStatement.findFirst({
    where: { tenantId, id: statementId },
    include: {
      owner: true,
      items: { include: { property: true } }
    }
  });
  if (!statement) throw notFound('Releve introuvable');
  return statement;
}

export async function generateOwnerStatement(
  tenantId: string,
  params: {
    ownerContactId: string;
    period: string;
    propertyIds: string[];
  }
) {
  const owner = await prisma.crmContact.findFirst({
    where: { id: params.ownerContactId, tenantId }
  });
  if (!owner) throw notFound('Contact proprietaire introuvable');

  const [yearStr, monthStr] = params.period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month || month < 1 || month > 12) {
    throw badRequest('Periode invalide, format attendu YYYY-MM');
  }

  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const properties = await prisma.property.findMany({
    where: { tenantId, id: { in: params.propertyIds } },
    select: { id: true, title: true, internalReference: true }
  });
  if (properties.length !== params.propertyIds.length) {
    throw badRequest('Un ou plusieurs biens sont introuvables ou hors tenant');
  }

  const [leases, expenses] = await Promise.all([
    prisma.rentalLease.findMany({
      where: {
        tenant_id: tenantId,
        property_id: { in: params.propertyIds },
        status: 'ACTIVE'
      },
      select: { property_id: true, rent_amount: true }
    }),
    prisma.propertyExpense.findMany({
      where: {
        tenantId,
        propertyId: { in: params.propertyIds },
        paidAt: { gte: periodStart, lte: periodEnd }
      },
      select: { propertyId: true, label: true, amount: true }
    })
  ]);

  const statementItemsData: Array<{
    propertyId: string;
    label: string;
    type: 'RENT_COLLECTED' | 'EXPENSE_DEDUCTED';
    amount: Prisma.Decimal;
  }> = [];

  for (const lease of leases) {
    statementItemsData.push({
      propertyId: lease.property_id,
      label: 'Loyer collecte',
      type: 'RENT_COLLECTED',
      amount: new Prisma.Decimal(lease.rent_amount)
    });
  }

  for (const expense of expenses) {
    statementItemsData.push({
      propertyId: expense.propertyId,
      label: expense.label,
      type: 'EXPENSE_DEDUCTED',
      amount: new Prisma.Decimal(expense.amount)
    });
  }

  const totalRevenue = statementItemsData
    .filter(item => item.type === 'RENT_COLLECTED')
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpenses = statementItemsData
    .filter(item => item.type === 'EXPENSE_DEDUCTED')
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const netAmount = totalRevenue - totalExpenses;

  return prisma.$transaction(async tx => {
    const statement = await tx.ownerStatement.create({
      data: {
        tenantId,
        ownerContactId: params.ownerContactId,
        period: params.period,
        totalRevenue: new Prisma.Decimal(totalRevenue),
        totalExpenses: new Prisma.Decimal(totalExpenses),
        netAmount: new Prisma.Decimal(netAmount),
        status: StatementStatus.DRAFT
      }
    });

    if (statementItemsData.length > 0) {
      await tx.ownerStatementItem.createMany({
        data: statementItemsData.map(item => ({
          statementId: statement.id,
          propertyId: item.propertyId,
          label: item.label,
          type: item.type,
          amount: item.amount
        }))
      });
    }

    return tx.ownerStatement.findUnique({
      where: { id: statement.id },
      include: {
        owner: true,
        items: { include: { property: true } }
      }
    });
  });
}

export async function updateOwnerStatement(
  tenantId: string,
  statementId: string,
  data: {
    status?: 'DRAFT' | 'SENT' | 'PAID';
    paidAt?: Date;
  }
) {
  const existing = await prisma.ownerStatement.findFirst({
    where: { id: statementId, tenantId }
  });
  if (!existing) throw notFound('Releve introuvable');

  return prisma.ownerStatement.update({
    where: { id: statementId },
    data: {
      status: data.status,
      paidAt: data.paidAt
    },
    include: {
      owner: true,
      items: { include: { property: true } }
    }
  });
}
