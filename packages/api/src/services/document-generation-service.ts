import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { logAuditEvent } from './audit-service';
import { DocumentType, RentalDocumentStatus, RentalDocumentType } from '@prisma/client';
import { resolveTemplate } from './document-template-service';
import { buildDocumentContext, validateContext } from './document-context-builder';
import { renderDocx, calculateHash, saveGeneratedDocument } from './docx-renderer';
import { withDocumentNumberLock } from './document-number-lock';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Generate document number based on type and period
 */
async function generateDocumentNumber(tenantId: string, docType: DocumentType, periodKey: string): Promise<string> {
  // Incrément atomique (INSERT ... ON CONFLICT DO UPDATE) : deux générations
  // simultanées ne lisent plus le même « dernier numéro » (P2002 sur l'index unique).
  const counter = await prisma.documentCounter.upsert({
    where: {
      tenant_id_doc_type_period_key: {
        tenant_id: tenantId,
        doc_type: docType,
        period_key: periodKey
      }
    },
    create: {
      tenant_id: tenantId,
      doc_type: docType,
      period_key: periodKey,
      last_number: 1
    },
    update: { last_number: { increment: 1 } }
  });
  const newNumber = counter.last_number;

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

/** Échappe un texte pour l'insérer tel quel dans une expression régulière. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Numéro du prochain contrat d'un bail : le numéro du bail pour le premier
 * (« BAIL-2026-0012 »), puis « -A2 », « -A3 »… pour les suivants. À appeler
 * DANS `withDocumentNumberLock`, avec l'écriture du document : sans le verrou,
 * deux générations simultanées liraient le même dernier suffixe.
 */
export async function nextLeaseContractNumber(tenantId: string, leaseNumber: string): Promise<string> {
  const existing = await prisma.rentalDocument.findMany({
    where: {
      tenant_id: tenantId,
      OR: [{ document_number: leaseNumber }, { document_number: { startsWith: `${leaseNumber}-A` } }]
    },
    select: { document_number: true }
  });
  const pattern = new RegExp(`^${escapeRegExp(leaseNumber)}(?:-A(\\d+))?$`);
  let highest = 0; // 0 : aucun contrat ; 1 : le contrat au numéro du bail ; n : « -An »
  for (const row of existing) {
    const match = row.document_number ? pattern.exec(row.document_number) : null;
    if (!match) continue;
    highest = Math.max(highest, match[1] ? Number(match[1]) : 1);
  }
  return highest === 0 ? leaseNumber : `${leaseNumber}-A${highest + 1}`;
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

/** Types de bien dont la location releve du bail commercial. */
const COMMERCIAL_PROPERTY_TYPES = ['BUREAU', 'BOUTIQUE_COMMERCIAL', 'ENTREPOT_INDUSTRIEL'];

/**
 * Modele de contrat d'un bail : commercial pour un local professionnel
 * (bureau, boutique, entrepot), habitation sinon. Le bail est cherche dans
 * l'agence : un bail d'une autre agence est introuvable.
 */
export async function resolveLeaseDocumentType(tenantId: string, leaseId: string): Promise<DocumentType> {
  const lease = await prisma.rentalLease.findFirst({
    where: { id: leaseId, tenant_id: tenantId },
    select: { property: { select: { propertyType: true } } }
  });
  if (!lease) {
    throw new NotFoundError(t('Bail introuvable'));
  }
  return COMMERCIAL_PROPERTY_TYPES.includes(String(lease.property?.propertyType))
    ? DocumentType.LEASE_COMMERCIAL
    : DocumentType.LEASE_HABITATION;
}

/**
 * Paiement a l'origine d'une quittance. `sourceKey` est un paiement ; quand
 * c'est un bail (bouton « Quittance » du bail), la quittance porte sur le
 * paiement affecte a `installmentId`, sinon sur le dernier paiement encaisse.
 */
export async function resolveReceiptPaymentId(
  tenantId: string,
  sourceKey: string,
  installmentId?: string
): Promise<string> {
  const payment = await prisma.rentalPayment.findFirst({
    where: { id: sourceKey, tenant_id: tenantId },
    select: { id: true }
  });
  if (payment) return payment.id;

  const lease = await prisma.rentalLease.findFirst({
    where: { id: sourceKey, tenant_id: tenantId },
    select: { id: true }
  });
  if (!lease) {
    throw new NotFoundError(t('Paiement introuvable'));
  }

  const paid = await prisma.rentalPayment.findFirst({
    where: {
      tenant_id: tenantId,
      lease_id: lease.id,
      status: 'SUCCESS',
      ...(installmentId ? { allocations: { some: { installment_id: installmentId, tenant_id: tenantId } } } : {})
    },
    orderBy: [{ succeeded_at: 'desc' }, { initiated_at: 'desc' }],
    select: { id: true }
  });
  if (!paid) {
    throw new BadRequestError(
      t('Aucun paiement encaissé pour ce bail : générez la quittance depuis un paiement ou une échéance payée.')
    );
  }
  return paid.id;
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

  // Une quittance porte sur un paiement : un bail designe son dernier paiement encaisse.
  if (docType === DocumentType.RENT_RECEIPT) {
    sourceKey = await resolveReceiptPaymentId(tenantId, sourceKey, additionalParams?.installmentId);
  }

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

  // 3b. Numéro définitif de la quittance (RCU-…) : attribué AVANT le rendu pour
  // que « N° Reçu » du modèle soit le numéro du document enregistré, et non la
  // référence du paiement (valeur provisoire du contexte).
  let receiptNumber: string | null = null;
  if (docType === DocumentType.RENT_RECEIPT) {
    receiptNumber = await generateDocumentNumber(tenantId, docType, getPeriodKey(docType));
    context.RECU_NUMERO = receiptNumber;
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

  // 7. Document number
  const isLeaseContract = docType === DocumentType.LEASE_HABITATION || docType === DocumentType.LEASE_COMMERCIAL;
  // Un contrat de bail porte le numéro du bail (« BAIL-2026-0012 ») ; un bail peut
  // avoir plusieurs contrats : les suivants prennent « -A2 », « -A3 »…
  let leaseNumber: string | null = null;
  if (isLeaseContract && leaseId) {
    const lease = await prisma.rentalLease.findFirst({
      where: { id: leaseId, tenant_id: tenantId },
      select: { lease_number: true }
    });
    leaseNumber = lease?.lease_number || null;
  }
  // Hors contrat de bail (ou bail sans numéro) : compteur habituel.
  const counterNumber = async (): Promise<string> =>
    receiptNumber ?? (await generateDocumentNumber(tenantId, docType, getPeriodKey(docType)));

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

  // 8 + 10. Save file and create the document record
  const persist = async (documentNumber: string) => {
    const filePath = await saveGeneratedDocument(tenantId, docType, documentNumber, sourceKey, docxBuffer);
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
    return document;
  };

  // Choisir le suffixe puis écrire la ligne : une seule section critique par numéro de bail.
  const document = leaseNumber
    ? await withDocumentNumberLock(`lease-contract:${tenantId}:${leaseNumber}`, async () =>
        persist(await nextLeaseContractNumber(tenantId, leaseNumber as string))
      )
    : await persist(await counterNumber());

  logger.info('Document generated', {
    documentId: document.id,
    tenantId,
    docType,
    documentNumber: document.document_number,
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
      documentNumber: document.document_number,
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

  // Quittance : « N° Reçu » reste le numéro du document enregistré.
  if (docType === DocumentType.RENT_RECEIPT && existingDoc.document_number) {
    context.RECU_NUMERO = existingDoc.document_number;
  }

  // Render DOCX
  const docxBuffer = await renderDocx(template, context);

  // Calculate hashes
  const fileHash = calculateHash(docxBuffer);
  const templateHash = template.file_hash_sha256;

  // Determine document number : « Régénérer » garde le numéro du document (pour un
  // contrat de bail : « BAIL-2026-0012 », ou « BAIL-2026-0012-A2 » pour un
  // deuxième contrat du même bail). Seul un document sans numéro en reçoit un.
  let documentNumber: string | null = existingDoc.document_number;
  if (!documentNumber && existingDoc.lease_id) {
    const lease = await prisma.rentalLease.findFirst({
      where: { id: existingDoc.lease_id, tenant_id: tenantId },
      select: { lease_number: true }
    });
    documentNumber = lease?.lease_number || null;
  }
  documentNumber = documentNumber || 'REGENERATED';

  // Save new file (overwrite old one or create new path)
  const filePath = await saveGeneratedDocument(
    tenantId,
    docType as DocumentType,
    documentNumber,
    sourceKey,
    docxBuffer
  );

  // Update existing document with new file and increment revision
  const updatedDocument = await prisma.rentalDocument.update({
    where: { id: documentId },
    data: {
      revision: existingDoc.revision + 1,
      document_number: documentNumber,
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
