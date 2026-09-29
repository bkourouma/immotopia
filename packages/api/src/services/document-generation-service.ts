import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { logAuditEvent } from './audit-service';
import { DocumentType, RentalDocumentStatus, RentalDocumentType } from '@prisma/client';
import { resolveTemplate } from './document-template-service';
import { buildDocumentContext, validateContext } from './document-context-builder';
import { renderDocx, calculateHash, saveGeneratedDocument } from './docx-renderer';
import * as fs from 'fs/promises';
import * as path from 'path';

/** Violation de l'index unique (tenant_id, document_number) de `RentalDocument`. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

/**
 * Le numéro d'un contrat de bail est le numéro du bail : un bail n'a donc qu'un
 * contrat. Un second `generateDocument` sur le même bail buterait sur l'index
 * unique (erreur brute) : on répond explicitement, avant d'écrire le fichier, et
 * on renvoie vers « Régénérer », qui met à jour le contrat existant.
 */
function contractAlreadyExistsError(): ConflictError {
  return new ConflictError(
    t(
      'Un contrat existe déjà pour ce bail. Utilisez « Régénérer » pour le mettre à jour à partir des données actuelles.'
    )
  );
}

/**
 * Generate document number based on type and period
 */
async function generateDocumentNumber(tenantId: string, docType: DocumentType, periodKey: string): Promise<string> {
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
    case DocumentType.LEASE_COMMERCIAL: {
      // BAIL-YYYY-XXXX
      const year = new Date().getFullYear();
      documentNumber = `BAIL-${year}-${paddedNumber}`;
      break;
    }

    case DocumentType.RENT_RECEIPT: {
      // RCU-YYYYMM-XXXX
      const now = new Date();
      const receiptYear = now.getFullYear();
      const receiptMonth = String(now.getMonth() + 1).padStart(2, '0');
      documentNumber = `RCU-${receiptYear}${receiptMonth}-${paddedNumber}`;
      break;
    }

    case DocumentType.RENT_STATEMENT: {
      // RLV-YYYYMM-XXXX
      const stmtNow = new Date();
      const stmtYear = stmtNow.getFullYear();
      const stmtMonth = String(stmtNow.getMonth() + 1).padStart(2, '0');
      documentNumber = `RLV-${stmtYear}${stmtMonth}-${paddedNumber}`;
      break;
    }

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
  templateId: string | undefined,
  additionalParams:
    | {
        installmentId?: string;
        startDate?: Date;
        endDate?: Date;
      }
    | undefined,
  actorUserId: string
) {
  logger.info('generateDocument: Starting document generation', {
    tenantId,
    docType,
    sourceKey,
    templateId,
    actorUserId
  });

  // 1. Resolve template
  const template = await resolveTemplate(tenantId, docType, templateId);
  logger.info('generateDocument: Template resolved', {
    templateId: template.id,
    templateName: template.name,
    placeholdersCount: (template.placeholders as string[])?.length || 0
  });

  // 2. Build context
  logger.info('generateDocument: Building document context', {
    tenantId,
    docType,
    sourceKey
  });
  const context = await buildDocumentContext(tenantId, docType, sourceKey, additionalParams);
  logger.info('generateDocument: Context built', {
    contextKeys: Object.keys(context),
    hasBAILLEUR_TELEPHONE: !!context.BAILLEUR_TELEPHONE,
    hasLOCATAIRE_TELEPHONE: !!context.LOCATAIRE_TELEPHONE,
    hasAGENCE_ADRESSE: !!context.AGENCE_ADRESSE,
    hasAGENCE_TELEPHONE: !!context.AGENCE_TELEPHONE
  });

  // 3. Validate context against template placeholders
  const validation = validateContext(context, template.placeholders as string[]);
  if (validation.missing.length > 0) {
    throw new BadRequestError(`Champs critiques manquants: ${validation.missing.join(', ')}`);
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

  // 6. Determine related entity IDs (before generating document number)
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

  // 7. Generate document number
  // For lease contracts, use the lease_number as document_number
  let documentNumber: string;
  if (docType === DocumentType.LEASE_HABITATION || docType === DocumentType.LEASE_COMMERCIAL) {
    if (leaseId) {
      // Fetch the lease to get its lease_number
      const lease = await prisma.rentalLease.findFirst({
        where: { id: leaseId, tenant_id: tenantId },
        select: { lease_number: true }
      });

      if (lease?.lease_number) {
        documentNumber = lease.lease_number;
        const existingContract = await prisma.rentalDocument.findFirst({
          where: { tenant_id: tenantId, document_number: documentNumber },
          select: { id: true }
        });
        if (existingContract) {
          logger.warn('generateDocument: a contract already exists for this lease', {
            tenantId,
            leaseId,
            existingDocumentId: existingContract.id
          });
          throw contractAlreadyExistsError();
        }
        logger.info('Using lease_number as document_number', {
          leaseId,
          leaseNumber: lease.lease_number,
          documentNumber
        });
      } else {
        // Fallback: generate document number if lease not found
        const periodKey = getPeriodKey(docType);
        documentNumber = await generateDocumentNumber(tenantId, docType, periodKey);
        logger.warn('Lease not found, generated document number instead', {
          leaseId,
          documentNumber
        });
      }
    } else {
      // Fallback: generate document number if no leaseId
      const periodKey = getPeriodKey(docType);
      documentNumber = await generateDocumentNumber(tenantId, docType, periodKey);
      logger.warn('No leaseId, generated document number instead', {
        documentNumber
      });
    }
  } else {
    // For other document types, generate document number as before
    const periodKey = getPeriodKey(docType);
    documentNumber = await generateDocumentNumber(tenantId, docType, periodKey);
  }

  // 8. Save file
  const filePath = await saveGeneratedDocument(tenantId, docType, documentNumber, sourceKey, docxBuffer);

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
  const document = await prisma.rentalDocument
    .create({
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
    })
    .catch((error: unknown) => {
      // Course entre deux générations du même contrat : l'index unique a tranché.
      if (rentalDocType === RentalDocumentType.LEASE_CONTRACT && isUniqueViolation(error)) {
        throw contractAlreadyExistsError();
      }
      throw error;
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
  templateId: string | undefined,
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
    throw new NotFoundError(t('Document introuvable.'));
  }

  // Determine source key and docType
  const sourceKey = existingDoc.lease_id || existingDoc.payment_id || '';
  const docType = existingDoc.template?.doc_type || DocumentType.LEASE_HABITATION;
  const templateToUse = templateId || existingDoc.template_id;

  // Resolve template
  const template = await resolveTemplate(tenantId, docType as DocumentType, templateToUse || undefined);

  // Build context
  const context = await buildDocumentContext(tenantId, docType as DocumentType, sourceKey, {
    installmentId: existingDoc.installment_id || undefined
  });

  // Validate context
  const validation = validateContext(context, template.placeholders as string[]);
  if (validation.missing.length > 0) {
    throw new BadRequestError(`Champs critiques manquants: ${validation.missing.join(', ')}`);
  }

  // Render DOCX
  const docxBuffer = await renderDocx(template, context);

  // Calculate hashes
  const fileHash = calculateHash(docxBuffer);
  const templateHash = template.file_hash_sha256;

  // Determine document number
  // For lease contracts, use the lease_number as document_number (even on regeneration)
  let documentNumber: string;
  if (docType === DocumentType.LEASE_HABITATION || docType === DocumentType.LEASE_COMMERCIAL) {
    if (existingDoc.lease_id) {
      // Fetch the lease to get its lease_number
      const lease = await prisma.rentalLease.findFirst({
        where: { id: existingDoc.lease_id, tenant_id: tenantId },
        select: { lease_number: true }
      });

      if (lease?.lease_number) {
        documentNumber = lease.lease_number;
        logger.info('Regenerate: Using lease_number as document_number', {
          leaseId: existingDoc.lease_id,
          leaseNumber: lease.lease_number,
          documentNumber,
          previousDocumentNumber: existingDoc.document_number
        });
      } else {
        // Fallback: use existing document_number if lease not found
        documentNumber = existingDoc.document_number || 'REGENERATED';
        logger.warn('Regenerate: Lease not found, keeping existing document_number', {
          leaseId: existingDoc.lease_id,
          documentNumber
        });
      }
    } else {
      // Fallback: use existing document_number if no leaseId
      documentNumber = existingDoc.document_number || 'REGENERATED';
    }
  } else {
    // For other document types, keep existing document_number
    documentNumber = existingDoc.document_number || 'REGENERATED';
  }

  // Save new file (overwrite old one or create new path)
  const filePath = await saveGeneratedDocument(
    tenantId,
    docType as DocumentType,
    documentNumber,
    sourceKey,
    docxBuffer
  );

  // Update existing document with new file and increment revision
  // Also update document_number if it changed (e.g., corrected from wrong lease number)
  const updatedDocument = await prisma.rentalDocument.update({
    where: { id: documentId },
    data: {
      revision: existingDoc.revision + 1,
      document_number: documentNumber, // Update document_number if it changed
      file_path: filePath,
      file_hash: fileHash,
      template_id: template.id,
      template_hash: templateHash,
      status: RentalDocumentStatus.FINAL,
      issued_at: new Date()
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
    documentId: updatedDocument.id,
    documentNumber: updatedDocument.document_number,
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
      documentId: updatedDocument.id,
      revision: updatedDocument.revision,
      documentNumber: updatedDocument.document_number
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
    throw new NotFoundError(t('Document introuvable.'));
  }

  if (!document.file_path) {
    throw new NotFoundError(t('Fichier du document introuvable.'));
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
    throw new BadRequestError(t('Fichier du document invalide.'));
  }

  // Read file
  const buffer = await fs.readFile(document.file_path);

  return buffer;
}
