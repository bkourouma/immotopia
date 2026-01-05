import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { DocumentType, RentalDocumentStatus, RentalDocumentType } from '@prisma/client';
import { resolveTemplate } from './document-template-service';
import { buildDocumentContext, validateContext } from './document-context-builder';
import { renderDocx, calculateHash, saveGeneratedDocument } from './docx-renderer';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Generate document number based on type and period
 */
async function generateDocumentNumber(
  tenantId: string,
  docType: DocumentType,
  periodKey: string
): Promise<string> {
  // Get or create counter
  let counter = await prisma.documentCounter.findUnique({
    where: {
      tenant_id_doc_type_period_key: {
        tenant_id: tenantId,
        doc_type: docType,
        period_key: periodKey
      }
    }
  });

  if (!counter) {
    counter = await prisma.documentCounter.create({
      data: {
        tenant_id: tenantId,
        doc_type: docType,
        period_key: periodKey,
        last_number: 0
      }
    });
  }

  // Increment counter
  const newNumber = counter.last_number + 1;
  await prisma.documentCounter.update({
    where: { id: counter.id },
    data: { last_number: newNumber }
  });

  // Format document number based on type
  let documentNumber: string;
  const paddedNumber = String(newNumber).padStart(4, '0');

  switch (docType) {
    case DocumentType.LEASE_HABITATION:
    case DocumentType.LEASE_COMMERCIAL:
      // BAIL-YYYY-XXXX
      const year = new Date().getFullYear();
      documentNumber = `BAIL-${year}-${paddedNumber}`;
      break;

    case DocumentType.RENT_RECEIPT:
      // RCU-YYYYMM-XXXX
      const now = new Date();
      const receiptYear = now.getFullYear();
      const receiptMonth = String(now.getMonth() + 1).padStart(2, '0');
      documentNumber = `RCU-${receiptYear}${receiptMonth}-${paddedNumber}`;
      break;

    case DocumentType.RENT_STATEMENT:
      // RLV-YYYYMM-XXXX
      const stmtNow = new Date();
      const stmtYear = stmtNow.getFullYear();
      const stmtMonth = String(stmtNow.getMonth() + 1).padStart(2, '0');
      documentNumber = `RLV-${stmtYear}${stmtMonth}-${paddedNumber}`;
      break;

    default:
      documentNumber = `DOC-${paddedNumber}`;
  }

  return documentNumber;
}

/**
 * Get period key for document counter
 */
function getPeriodKey(docType: DocumentType, date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');

  switch (docType) {
    case DocumentType.LEASE_HABITATION:
    case DocumentType.LEASE_COMMERCIAL:
      return String(year); // Annual
    case DocumentType.RENT_RECEIPT:
    case DocumentType.RENT_STATEMENT:
      return `${year}-${month}`; // Monthly
    default:
      return String(year);
  }
}

/**
 * Generate a document
 */
export async function generateDocument(
  tenantId: string,
  docType: DocumentType,
  sourceKey: string, // leaseId or paymentId
  templateId?: string,
  additionalParams?: {
    installmentId?: string;
    startDate?: Date;
    endDate?: Date;
  },
  actorUserId: string
) {
  // 1. Resolve template
  const template = await resolveTemplate(tenantId, docType, templateId);

  // 2. Build context
  const context = await buildDocumentContext(tenantId, docType, sourceKey, additionalParams);

  // 3. Validate context against template placeholders
  const validation = validateContext(context, template.placeholders as string[]);
  if (validation.missing.length > 0) {
    throw new Error(`Champs critiques manquants: ${validation.missing.join(', ')}`);
  }

  if (validation.warnings.length > 0) {
    logger.warn('Missing optional placeholders', {
      templateId: template.id,
      warnings: validation.warnings
    });
  }

  // 4. Render DOCX
  const docxBuffer = await renderDocx(template, context);

  // 5. Calculate hashes
  const fileHash = calculateHash(docxBuffer);
  const templateHash = template.file_hash_sha256;

  // 6. Generate document number
  const periodKey = getPeriodKey(docType);
  const documentNumber = await generateDocumentNumber(tenantId, docType, periodKey);

  // 7. Save file
  const filePath = await saveGeneratedDocument(tenantId, docType, documentNumber, sourceKey, docxBuffer);

  // 8. Determine related entity IDs
  let leaseId: string | null = null;
  let installmentId: string | null = null;
  let paymentId: string | null = null;

  if (docType === DocumentType.LEASE_HABITATION || docType === DocumentType.LEASE_COMMERCIAL) {
    leaseId = sourceKey;
  } else if (docType === DocumentType.RENT_RECEIPT) {
    paymentId = sourceKey;
    if (additionalParams?.installmentId) {
      installmentId = additionalParams.installmentId;
    } else {
      // Try to find installment from payment
      const payment = await prisma.rentalPayment.findFirst({
        where: { id: sourceKey, tenant_id: tenantId },
        include: { allocations: true }
      });
      if (payment?.allocations && payment.allocations.length > 0) {
        installmentId = payment.allocations[0].installment_id;
      }
    }
    // Get lease from payment
    const payment = await prisma.rentalPayment.findFirst({
      where: { id: sourceKey, tenant_id: tenantId }
    });
    if (payment?.lease_id) {
      leaseId = payment.lease_id;
    }
  } else if (docType === DocumentType.RENT_STATEMENT) {
    leaseId = sourceKey;
  }

  // 9. Map DocumentType to RentalDocumentType
  let rentalDocType: RentalDocumentType;
  switch (docType) {
    case DocumentType.LEASE_HABITATION:
    case DocumentType.LEASE_COMMERCIAL:
      rentalDocType = RentalDocumentType.LEASE_CONTRACT;
      break;
    case DocumentType.RENT_RECEIPT:
      rentalDocType = RentalDocumentType.RENT_RECEIPT;
      break;
    case DocumentType.RENT_STATEMENT:
      rentalDocType = RentalDocumentType.STATEMENT;
      break;
    default:
      rentalDocType = RentalDocumentType.OTHER;
  }

  // 10. Create document record
  const document = await prisma.rentalDocument.create({
    data: {
      tenant_id: tenantId,
      type: rentalDocType,
      status: RentalDocumentStatus.FINAL,
      lease_id: leaseId,
      installment_id: installmentId,
      payment_id: paymentId,
      document_number: documentNumber,
      file_path: filePath,
      file_hash: fileHash,
      template_id: template.id,
      template_hash: templateHash,
      revision: 1,
      issued_at: new Date(),
      created_by_user_id: actorUserId,
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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
    }
  });

  logger.info('Document generated', {
    documentId: document.id,
    tenantId,
    docType,
    documentNumber,
    templateId: template.id
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'DOCUMENT_GENERATED',
    entityType: 'RENTAL_DOCUMENT',
    entityId: document.id,
    payload: {
      docType,
      documentNumber,
      templateId: template.id,
      sourceKey
    }
  });

  return document;
}

/**
 * Regenerate a document (creates new revision)
 */
export async function regenerateDocument(
  tenantId: string,
  documentId: string,
  templateId?: string,
  actorUserId: string
) {
  // Get existing document
  const existingDoc = await prisma.rentalDocument.findFirst({
    where: {
      id: documentId,
      tenant_id: tenantId
    },
    include: {
      template: true
    }
  });

  if (!existingDoc) {
    throw new Error('Document not found');
  }

  // Determine source key and docType
  const sourceKey = existingDoc.lease_id || existingDoc.payment_id || '';
  const docType = existingDoc.template?.doc_type || DocumentType.LEASE_HABITATION;

  // Generate new document
  const newDocument = await generateDocument(
    tenantId,
    docType as DocumentType,
    sourceKey,
    templateId || existingDoc.template_id || undefined,
    {
      installmentId: existingDoc.installment_id || undefined
    },
    actorUserId
  );

  // Mark old document as superseded
  await prisma.rentalDocument.update({
    where: { id: documentId },
    data: {
      status: RentalDocumentStatus.SUPERSEDED,
      superseded_by_id: newDocument.id
    }
  });

  // Update revision number and keep same document number
  const updatedDocument = await prisma.rentalDocument.update({
    where: { id: newDocument.id },
    data: {
      revision: existingDoc.revision + 1,
      document_number: existingDoc.document_number // Keep same document number
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
    }
  });

  logger.info('Document regenerated', {
    oldDocumentId: documentId,
    newDocumentId: updatedDocument.id,
    revision: updatedDocument.revision
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'DOCUMENT_REGENERATED',
    entityType: 'RENTAL_DOCUMENT',
    entityId: updatedDocument.id,
    payload: {
      oldDocumentId: documentId,
      revision: updatedDocument.revision
    }
  });

  return updatedDocument;
}

/**
 * Get document file buffer
 */
export async function getDocumentFile(tenantId: string, documentId: string): Promise<Buffer> {
  const document = await prisma.rentalDocument.findFirst({
    where: {
      id: documentId,
      tenant_id: tenantId
    }
  });

  if (!document) {
    throw new Error('Document not found');
  }

  if (!document.file_path) {
    throw new Error('Document file not found');
  }

  // Verify path is within allowed directory (security)
  // Use same project root detection as in index.ts
  const cwd = process.cwd();
  const projectRoot =
    path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
      ? path.resolve(cwd, '..', '..')
      : cwd;
  const allowedBase = path.join(projectRoot, 'assets', 'generated_documents');
  const resolvedPath = path.resolve(document.file_path);
  const resolvedBase = path.resolve(allowedBase);

  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new Error('Invalid file path');
  }

  // Read file
  const buffer = await fs.readFile(document.file_path);

  return buffer;
}

