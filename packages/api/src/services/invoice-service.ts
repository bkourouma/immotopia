import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { InvoiceStatus } from '@prisma/client';
import { CreateInvoiceRequest, UpdateInvoiceRequest } from '../types/subscription-types';
import { logAuditEvent, AuditActionKey } from './audit-service';

/**
 * Generate unique invoice number
 */
function generateInvoiceNumber(tenantId: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${timestamp}-${random}`;
}

/**
 * Create an invoice
 * @param data - Invoice creation data
 * @param actorUserId - User creating the invoice (for audit)
 * @returns Created invoice
 */
export async function createInvoice(data: CreateInvoiceRequest, actorUserId?: string) {
  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: data.tenantId }
  });

  if (!tenant) {
    throw new Error('Tenant introuvable.');
  }

  // Verify subscription exists if provided
  if (data.subscriptionId) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: data.subscriptionId }
    });

    if (!subscription) {
      throw new Error('Abonnement introuvable.');
    }

    if (subscription.tenantId !== data.tenantId) {
      throw new Error("L'abonnement n'appartient pas à ce tenant.");
    }
  }

  // Generate invoice number
  let invoiceNumber = generateInvoiceNumber(data.tenantId);
  let attempts = 0;
  while (await prisma.invoice.findUnique({ where: { invoiceNumber } })) {
    invoiceNumber = generateInvoiceNumber(data.tenantId);
    attempts++;
    if (attempts > 10) {
      throw new Error('Impossible de générer un numéro de facture unique.');
    }
  }

  // Set issue date to today if not provided
  const issueDate = data.issueDate || new Date();

  // Create invoice
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: data.tenantId,
      subscriptionId: data.subscriptionId || null,
      invoiceNumber,
      issueDate,
      dueDate: data.dueDate,
      currency: data.currency || 'FCFA',
      amountTotal: data.amountTotal,
      status: InvoiceStatus.DRAFT,
      notes: data.notes || null
    }
  });

  logger.info('Invoice created', {
    invoiceId: invoice.id,
    invoiceNumber,
    tenantId: data.tenantId,
    amount: data.amountTotal
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: data.tenantId,
      actionKey: AuditActionKey.INVOICE_CREATED,
      entityType: 'Invoice',
      entityId: invoice.id,
      payload: {
        invoiceNumber,
        amountTotal: data.amountTotal,
        dueDate: data.dueDate
      }
    });
  }

  return invoice;
}

/**
 * Update an invoice
 * @param invoiceId - Invoice ID
 * @param data - Update data
 * @param actorUserId - User performing the update (for audit)
 * @returns Updated invoice
 */
export async function updateInvoice(invoiceId: string, data: UpdateInvoiceRequest, actorUserId?: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId }
  });

  if (!invoice) {
    throw new Error('Facture introuvable.');
  }

  // Update invoice
  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: data.status,
      paidAt: data.paidAt,
      notes: data.notes,
      // Set paidAt if status is PAID and paidAt not provided
      ...(data.status === InvoiceStatus.PAID && !data.paidAt && !invoice.paidAt ? { paidAt: new Date() } : {})
    }
  });

  logger.info('Invoice updated', {
    invoiceId,
    changes: Object.keys(data)
  });

  // Audit log
  if (actorUserId) {
    const actionKey =
      data.status === InvoiceStatus.PAID
        ? AuditActionKey.INVOICE_MARKED_PAID
        : data.status === InvoiceStatus.CANCELED
          ? AuditActionKey.INVOICE_CANCELED
          : AuditActionKey.INVOICE_CREATED; // Generic update

    logAuditEvent({
      actorUserId,
      tenantId: invoice.tenantId,
      actionKey,
      entityType: 'Invoice',
      entityId: invoiceId,
      payload: {
        previousStatus: invoice.status,
        newStatus: updated.status,
        paidAt: updated.paidAt
      }
    });
  }

  return updated;
}

/**
 * Get invoice by ID
 * @param invoiceId - Invoice ID
 * @returns Invoice with tenant and subscription
 */
export async function getInvoiceById(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          contactEmail: true
        }
      },
      subscription: {
        select: {
          id: true,
          planKey: true,
          billingCycle: true
        }
      }
    }
  });
}

/**
 * List invoices for a tenant
 * @param tenantId - Tenant ID
 * @param filters - Optional filters
 * @returns List of invoices with pagination
 */
export async function listInvoices(
  tenantId: string,
  filters: {
    status?: InvoiceStatus;
    subscriptionId?: string;
    page?: number;
    limit?: number;
  } = {}
) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = {
    tenantId
  };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.subscriptionId) {
    where.subscriptionId = filters.subscriptionId;
  }

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip,
      take: limit,
      orderBy: { issueDate: 'desc' }
    }),
    prisma.invoice.count({ where })
  ]);

  return {
    invoices,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Mark invoice as paid
 * @param invoiceId - Invoice ID
 * @param paidAt - Optional payment date (defaults to now)
 * @param actorUserId - User marking as paid (for audit)
 * @returns Updated invoice
 */
export async function markInvoiceAsPaid(invoiceId: string, paidAt?: Date, actorUserId?: string) {
  return updateInvoice(
    invoiceId,
    {
      status: InvoiceStatus.PAID,
      paidAt: paidAt || new Date()
    },
    actorUserId
  );
}




