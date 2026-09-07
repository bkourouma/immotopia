import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { RentalDocumentType, RentalDocumentStatus } from '@prisma/client';

/**
 * Generate document number in format YYYY-NNN (sequential per tenant per year)
 * @param tenantId - Tenant ID
 * @param year - Year (defaults to current year)
 * @returns Document number
 */
export async function generateDocumentNumber(tenantId: string, year?: number): Promise<string> {
  const currentYear = year || new Date().getFullYear();

  // Count existing documents for this tenant in this year
  const count = await prisma.rentalDocument.count({
    where: {
      tenant_id: tenantId,
      created_at: {
        gte: new Date(`${currentYear}-01-01`),
        lt: new Date(`${currentYear + 1}-01-01`)
      }
    }
  });

  // Generate sequential number (1-indexed, zero-padded to 3 digits)
  const sequenceNumber = (count + 1).toString().padStart(3, '0');

  return `${currentYear}-${sequenceNumber}`;
}

/**
 * Generate a rental document
 * @param tenantId - Tenant ID
 * @param type - Document type
 * @param leaseId - Optional lease ID
 * @param installmentId - Optional installment ID
 * @param paymentId - Optional payment ID
 * @param title - Optional title
 * @param description - Optional description
 * @param actorUserId - User generating the document
 * @returns Generated document
 */
export async function generateDocument(
  tenantId: string,
  type: RentalDocumentType,
  leaseId?: string,
  installmentId?: string,
  paymentId?: string,
  title?: string,
  description?: string,
  actorUserId: string
) {
  // Validate relationships
  if (leaseId) {
    const lease = await prisma.rentalLease.findFirst({
      where: {
        id: leaseId,
        tenant_id: tenantId
      }
    });
    if (!lease) {
      throw new Error('Lease not found');
    }
  }

  if (installmentId) {
    const installment = await prisma.rentalInstallment.findFirst({
      where: {
        id: installmentId,
        tenant_id: tenantId
      }
    });
    if (!installment) {
      throw new Error('Installment not found');
    }
  }

  if (paymentId) {
    const payment = await prisma.rentalPayment.findFirst({
      where: {
        id: paymentId,
        tenant_id: tenantId
      }
    });
    if (!payment) {
      throw new Error('Payment not found');
    }
  }

  // Generate document number
  const documentNumber = await generateDocumentNumber(tenantId);

  // Create document (file storage integration would happen here)
  // For now, we create the document record without file storage
  const document = await prisma.rentalDocument.create({
    data: {
      tenant_id: tenantId,
      type: type,
      status: RentalDocumentStatus.DRAFT,
      lease_id: leaseId || null,
      installment_id: installmentId || null,
      payment_id: paymentId || null,
      document_number: documentNumber,
      title: title || null,
      description: description || null,
      issued_at: new Date(),
      created_by_user_id: actorUserId
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
      },
      payment: {
        select: {
          id: true,
          amount: true,
          method: true
        }
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    }
  });

  logger.info('Document generated', {
    documentId: document.id,
    tenantId,
    type,
    documentNumber
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_DOCUMENT_GENERATED',
    entityType: 'RENTAL_DOCUMENT',
    entityId: document.id,
    payload: {
      type,
      documentNumber,
      leaseId
    }
  });

  return document;
}

/**
 * Update document status
 * @param tenantId - Tenant ID
 * @param documentId - Document ID
 * @param status - New status
 * @param actorUserId - User updating the status
 * @returns Updated document
 */
export async function updateDocumentStatus(
  tenantId: string,
  documentId: string,
  status: RentalDocumentStatus,
  actorUserId: string
) {
  const document = await prisma.rentalDocument.findFirst({
    where: {
      id: documentId,
      tenant_id: tenantId
    }
  });

  if (!document) {
    throw new Error('Document not found');
  }

  const updatedDocument = await prisma.rentalDocument.update({
    where: {
      id: documentId
    },
    data: {
      status: status
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
      },
      payment: {
        select: {
          id: true,
          amount: true,
          method: true
        }
      }
    }
  });

  logger.info('Document status updated', {
    documentId,
    tenantId,
    oldStatus: document.status,
    newStatus: status
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'RENTAL_DOCUMENT_STATUS_UPDATED',
    entityType: 'RENTAL_DOCUMENT',
    entityId: documentId,
    payload: {
      oldStatus: document.status,
      newStatus: status
    }
  });

  return updatedDocument;
}

/**
 * Get document by ID
 * @param tenantId - Tenant ID
 * @param documentId - Document ID
 * @returns Document or null
 */
export async function getDocumentById(tenantId: string, documentId: string) {
  const document = await prisma.rentalDocument.findFirst({
    where: {
      id: documentId,
      tenant_id: tenantId
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
      },
      payment: {
        select: {
          id: true,
          amount: true,
          method: true
        }
      },
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    }
  });

  return document;
}

/**
 * List documents with filters
 * @param tenantId - Tenant ID
 * @param filters - Optional filters
 * @param pagination - Optional pagination (page, limit)
 * @returns List of documents with pagination metadata
 */
export async function listDocuments(
  tenantId: string,
  filters?: {
    type?: RentalDocumentType;
    status?: RentalDocumentStatus;
    leaseId?: string;
    installmentId?: string;
    paymentId?: string;
  },
  pagination?: {
    page?: number;
    limit?: number;
  }
) {
  const where: any = {
    tenant_id: tenantId
  };

  if (filters?.type) {
    where.type = filters.type;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.leaseId) {
    where.lease_id = filters.leaseId;
  }

  if (filters?.installmentId) {
    where.installment_id = filters.installmentId;
  }

  if (filters?.paymentId) {
    where.payment_id = filters.paymentId;
  }

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 50;
  const skip = (page - 1) * limit;

  const [documents, total] = await Promise.all([
    prisma.rentalDocument.findMany({
      where,
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
        },
        payment: {
          select: {
            id: true,
            amount: true,
            method: true
          }
        },
        template: {
          select: {
            id: true,
            name: true,
            doc_type: true
          }
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      },
      orderBy: {
        issued_at: 'desc'
      },
      skip,
      take: limit
    }),
    prisma.rentalDocument.count({ where })
  ]);

  return {
    data: documents,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}
