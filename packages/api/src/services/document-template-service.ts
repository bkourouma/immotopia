import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { badRequest, notFound } from '../lib/errors';
import { logAuditEvent } from './audit-service';
import { DocumentTemplateStatus, DocumentType } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import PizZip from 'pizzip';

/**
 * Get project root directory
 */
function getProjectRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
    ? path.resolve(cwd, '..', '..')
    : cwd;
}

/**
 * Get templates base path
 */
function getTemplatesBasePath(): string {
  const projectRoot = getProjectRoot();
  return path.join(projectRoot, 'assets', 'modeles_documents');
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Extract placeholders from DOCX template
 * @param filePath - Path to DOCX file
 * @returns Array of placeholder names
 */
export async function extractPlaceholders(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath);
    const zip = new PizZip(content);

    // Extract placeholders from the main document XML
    const docXml = zip.files['word/document.xml'];
    if (!docXml) {
      logger.warn('word/document.xml not found in DOCX file', { filePath });
      return [];
    }

    // Get XML as text (PizZip handles binary to text conversion)
    let xmlContent: string;
    try {
      xmlContent = docXml.asText();
    } catch (error: any) {
      // If asText fails, try as binary and convert
      const buffer = docXml.asArrayBuffer();
      xmlContent = Buffer.from(buffer).toString('utf-8');
    }

    // Extract all text content from XML by removing tags and decoding entities
    // This handles placeholders that might be split across XML tags
    const textContent = xmlContent
      .replace(/<[^>]+>/g, ' ') // Remove all XML tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' '); // Normalize whitespace

    // Extract placeholders in format {{VARIABLE}}
    const placeholderRegex = /\{\{([A-Z_][A-Z0-9_]*)\}\}/g;
    const placeholders = new Set<string>();
    let match;

    while ((match = placeholderRegex.exec(textContent)) !== null) {
      placeholders.add(match[1]);
    }

    return Array.from(placeholders).sort();
  } catch (error: any) {
    logger.error('Error extracting placeholders', {
      error: error.message || error,
      stack: error.stack,
      filePath
    });
    throw new Error(`Failed to extract placeholders from template: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Calculate SHA-256 hash of file
 */
function calculateFileHash(fileBuffer: Buffer): string {
  return createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Upload a document template
 */
export async function uploadTemplate(
  tenantId: string | null,
  docType: DocumentType,
  fileBuffer: Buffer,
  originalFilename: string,
  name: string,
  actorUserId: string
) {
  // Validate file size
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw badRequest('Le fichier dépasse la taille maximale autorisée (10 Mo).');
  }

  // Validate MIME type
  const mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (!originalFilename.toLowerCase().endsWith('.docx')) {
    throw badRequest('Seuls les fichiers DOCX sont acceptés.');
  }

  // Calculate file hash
  const fileHash = calculateFileHash(fileBuffer);

  // Check for duplicate (same hash, same tenant, same docType)
  const existing = await prisma.documentTemplate.findFirst({
    where: {
      tenant_id: tenantId,
      doc_type: docType,
      file_hash_sha256: fileHash,
      status: {
        not: DocumentTemplateStatus.DELETED
      }
    }
  });

  if (existing) {
    throw badRequest('Un modèle au contenu identique existe déjà pour ce type de document.');
  }

  // Determine storage path
  const templatesBasePath = getTemplatesBasePath();
  const storageDir = tenantId
    ? path.join(templatesBasePath, 'tenants', tenantId)
    : path.join(templatesBasePath, 'default');

  await fs.mkdir(storageDir, { recursive: true });

  // Generate stored filename
  const timestamp = Date.now();
  const storedFilename = `${docType}_${timestamp}.docx`;
  const storagePath = path.join(storageDir, storedFilename);

  // Save file
  await fs.writeFile(storagePath, fileBuffer);

  // Extract placeholders (with better error handling)
  let placeholders: string[] = [];
  try {
    placeholders = await extractPlaceholders(storagePath);
  } catch (error: any) {
    // Log error but don't fail the upload - templates might not have placeholders
    logger.warn('Could not extract placeholders from template', {
      error: error.message,
      filePath: storagePath
    });
    // Continue with empty placeholders array - user can still use the template
  }

  // If this is set as default, unset other defaults for this tenant/docType
  let isDefault = false;
  if (tenantId) {
    // Check if this should be default (first template for this tenant/docType)
    const existingCount = await prisma.documentTemplate.count({
      where: {
        tenant_id: tenantId,
        doc_type: docType,
        status: {
          not: DocumentTemplateStatus.DELETED
        }
      }
    });

    if (existingCount === 0) {
      isDefault = true;
    }
  }

  // Create template record
  const template = await prisma.documentTemplate.create({
    data: {
      tenant_id: tenantId,
      doc_type: docType,
      name,
      status: DocumentTemplateStatus.ACTIVE,
      is_default: isDefault,
      original_filename: originalFilename,
      stored_filename: storedFilename,
      storage_path: storagePath,
      file_size: fileBuffer.length,
      mime_type: mimeType,
      file_hash_sha256: fileHash,
      placeholders: placeholders,
      version: 1,
      created_by_user_id: actorUserId
    }
  });

  logger.info('Template uploaded', {
    templateId: template.id,
    tenantId,
    docType,
    placeholdersCount: placeholders.length
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId: tenantId || undefined,
    actionKey: 'DOCUMENT_TEMPLATE_UPLOADED',
    entityType: 'DOCUMENT_TEMPLATE',
    entityId: template.id,
    payload: {
      docType,
      name,
      placeholdersCount: placeholders.length
    }
  });

  return template;
}

/**
 * List templates for a tenant
 */
export async function listTemplates(
  tenantId: string | null,
  filters?: {
    docType?: DocumentType;
    status?: DocumentTemplateStatus;
  }
) {
  try {
    const where: any = {
      status: {
        not: DocumentTemplateStatus.DELETED
      }
    };

    // Only filter by tenant_id if it's provided (null means global templates)
    if (tenantId !== null && tenantId !== undefined) {
      where.tenant_id = tenantId;
    } else {
      where.tenant_id = null;
    }

    if (filters?.docType) {
      where.doc_type = filters.docType;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const templates = await prisma.documentTemplate.findMany({
      where,
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        }
      }
    });

    return templates;
  } catch (error) {
    logger.error('Error listing templates', { error, tenantId, filters });
    throw error;
  }
}

/**
 * Activate a template
 */
export async function activateTemplate(tenantId: string | null, templateId: string, actorUserId: string) {
  const template = await prisma.documentTemplate.findFirst({
    where: {
      id: templateId,
      tenant_id: tenantId,
      status: {
        not: DocumentTemplateStatus.DELETED
      }
    }
  });

  if (!template) {
    throw notFound('Ce modèle est introuvable.');
  }

  const updated = await prisma.documentTemplate.update({
    where: { id: templateId },
    data: { status: DocumentTemplateStatus.ACTIVE }
  });

  logAuditEvent({
    actorUserId,
    tenantId: tenantId || undefined,
    actionKey: 'DOCUMENT_TEMPLATE_ACTIVATED',
    entityType: 'DOCUMENT_TEMPLATE',
    entityId: templateId
  });

  return updated;
}

/**
 * Deactivate a template
 */
export async function deactivateTemplate(tenantId: string | null, templateId: string, actorUserId: string) {
  const template = await prisma.documentTemplate.findFirst({
    where: {
      id: templateId,
      tenant_id: tenantId,
      status: {
        not: DocumentTemplateStatus.DELETED
      }
    }
  });

  if (!template) {
    throw notFound('Ce modèle est introuvable.');
  }

  // Un modele desactive ne garde pas le defaut : l'ecran affichait sinon
  // « Par defaut » et « Inactif » sur la meme ligne, alors que la generation
  // d'un document, qui n'accepte que les modeles actifs, prenait en realite un
  // autre modele. Le badge annoncait un modele qui ne servait plus.
  let successorId: string | null = null;
  if (template.is_default && tenantId) {
    const alternative = await prisma.documentTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        doc_type: template.doc_type,
        status: DocumentTemplateStatus.ACTIVE,
        id: { not: templateId }
      },
      orderBy: { created_at: 'desc' }
    });

    successorId = alternative?.id ?? null;
  }

  const [updated] = await prisma.$transaction([
    prisma.documentTemplate.update({
      where: { id: templateId },
      data: {
        status: DocumentTemplateStatus.INACTIVE,
        ...(template.is_default && tenantId ? { is_default: false } : {})
      }
    }),
    ...(successorId
      ? [
          prisma.documentTemplate.update({
            where: { id: successorId },
            data: { is_default: true }
          })
        ]
      : [])
  ]);

  logAuditEvent({
    actorUserId,
    tenantId: tenantId || undefined,
    actionKey: 'DOCUMENT_TEMPLATE_DEACTIVATED',
    entityType: 'DOCUMENT_TEMPLATE',
    entityId: templateId
  });

  return updated;
}

/**
 * Set template as default
 */
export async function setDefaultTemplate(tenantId: string | null, templateId: string, actorUserId: string) {
  if (!tenantId) {
    throw badRequest("Un modèle global n'a pas de modèle par défaut d'agence.");
  }

  const template = await prisma.documentTemplate.findFirst({
    where: {
      id: templateId,
      tenant_id: tenantId,
      status: DocumentTemplateStatus.ACTIVE
    }
  });

  if (!template) {
    throw notFound("Ce modèle est introuvable ou n'est pas actif.");
  }

  // Retirer le defaut aux autres, puis le poser ici — dans la meme
  // transaction. Entre les deux ecritures, la base porte zero modele par
  // defaut pour ce type : une generation de document qui tomberait dans cet
  // intervalle ne trouverait aucun modele.
  const [, updated] = await prisma.$transaction([
    prisma.documentTemplate.updateMany({
      where: {
        tenant_id: tenantId,
        doc_type: template.doc_type,
        is_default: true,
        id: {
          not: templateId
        }
      },
      data: {
        is_default: false
      }
    }),
    prisma.documentTemplate.update({
      where: { id: templateId },
      data: { is_default: true }
    })
  ]);

  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'DOCUMENT_TEMPLATE_SET_DEFAULT',
    entityType: 'DOCUMENT_TEMPLATE',
    entityId: templateId
  });

  return updated;
}

/**
 * Delete (soft delete) a template
 */
export async function deleteTemplate(tenantId: string | null, templateId: string, actorUserId: string) {
  const template = await prisma.documentTemplate.findFirst({
    where: {
      id: templateId,
      tenant_id: tenantId,
      status: {
        not: DocumentTemplateStatus.DELETED
      }
    }
  });

  if (!template) {
    throw notFound('Ce modèle est introuvable.');
  }

  // Si le modele supprime portait le defaut, il passe a un remplacant. Le
  // drapeau doit quitter le modele supprime dans le meme mouvement : le
  // laisser a true donnerait deux modeles par defaut pour un meme type, ce que
  // l'index partiel refuse — et ce qui, avant lui, faisait silencieusement
  // resservir un modele supprime.
  let successorId: string | null = null;
  if (template.is_default && tenantId) {
    const alternative = await prisma.documentTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        doc_type: template.doc_type,
        status: DocumentTemplateStatus.ACTIVE,
        id: {
          not: templateId
        }
      },
      orderBy: { created_at: 'desc' }
    });

    successorId = alternative?.id ?? null;
  }

  const [updated] = await prisma.$transaction([
    prisma.documentTemplate.update({
      where: { id: templateId },
      data: { status: DocumentTemplateStatus.DELETED, is_default: false }
    }),
    ...(successorId
      ? [
          prisma.documentTemplate.update({
            where: { id: successorId },
            data: { is_default: true }
          })
        ]
      : [])
  ]);

  logAuditEvent({
    actorUserId,
    tenantId: tenantId || undefined,
    actionKey: 'DOCUMENT_TEMPLATE_DELETED',
    entityType: 'DOCUMENT_TEMPLATE',
    entityId: templateId
  });

  return updated;
}

/**
 * Resolve template based on priority rules
 */
export async function resolveTemplate(tenantId: string | null, docType: DocumentType, templateId?: string) {
  // 1. If templateId provided, use it (if it belongs to tenant, matches docType, and is ACTIVE)
  if (templateId) {
    const template = await prisma.documentTemplate.findFirst({
      where: {
        id: templateId,
        tenant_id: tenantId,
        doc_type: docType,
        status: DocumentTemplateStatus.ACTIVE
      }
    });

    if (template) {
      return template;
    }
  }

  // 2. Use default template for tenant
  if (tenantId) {
    const defaultTemplate = await prisma.documentTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        doc_type: docType,
        is_default: true,
        status: DocumentTemplateStatus.ACTIVE
      }
    });

    if (defaultTemplate) {
      return defaultTemplate;
    }

    // 3. Use last active template for tenant
    const lastActive = await prisma.documentTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        doc_type: docType,
        status: DocumentTemplateStatus.ACTIVE
      },
      orderBy: { created_at: 'desc' }
    });

    if (lastActive) {
      return lastActive;
    }
  }

  // 4. Fallback to global default
  const globalDefault = await prisma.documentTemplate.findFirst({
    where: {
      tenant_id: null,
      doc_type: docType,
      is_default: true,
      status: DocumentTemplateStatus.ACTIVE
    }
  });

  if (globalDefault) {
    return globalDefault;
  }

  // 5. Fallback to last global active
  const lastGlobal = await prisma.documentTemplate.findFirst({
    where: {
      tenant_id: null,
      doc_type: docType,
      status: DocumentTemplateStatus.ACTIVE
    },
    orderBy: { created_at: 'desc' }
  });

  if (lastGlobal) {
    return lastGlobal;
  }

  // 6. No template found
  const docTypeName =
    docType === 'LEASE_HABITATION'
      ? 'bail habitation'
      : docType === 'LEASE_COMMERCIAL'
        ? 'bail commercial'
        : docType === 'RENT_RECEIPT'
          ? 'reçu de loyer'
          : docType === 'RENT_STATEMENT'
            ? 'relevé de compte'
            : docType;

  throw new Error(
    `Aucun template disponible pour le type de document "${docTypeName}". ` +
      `Veuillez d'abord uploader un template DOCX via l'interface de gestion des templates ` +
      `(POST /api/tenants/:tenantId/documents/templates/upload)`
  );
}
