import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { logger } from '../utils/logger';
import { DocumentTemplate } from '@prisma/client';
import { AppError, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';

/**
 * Sanitize context data: replace undefined, null, or empty values with the variable name
 */
function sanitizeContext(context: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(context)) {
    if (value === null || value === undefined || value === '') {
      // Return the variable name wrapped in brackets so users know what goes there
      sanitized[key] = `{{${key}}}`;
    } else if (Array.isArray(value)) {
      // Recursively sanitize array items
      sanitized[key] = value.map((item, index) => {
        if (typeof item === 'object' && item !== null) {
          return sanitizeContext(item);
        }
        return item === null || item === undefined || item === '' ? `{{${key}[${index}]}}` : item;
      });
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeContext(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

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
 * Resolve template file path
 * Tries the stored path first, then reconstructs it if needed
 */
async function resolveTemplatePath(template: DocumentTemplate): Promise<string> {
  // First, try the stored path
  if (template.storage_path) {
    try {
      await fs.access(template.storage_path);
      return template.storage_path;
    } catch {
      // File doesn't exist at stored path, try to reconstruct
      logger.warn('Template file not found at stored path, attempting to reconstruct', {
        templateId: template.id,
        hasStoredPath: true,
        storedFilename: template.stored_filename
      });
    }
  }

  // Reconstruct path from stored filename
  const projectRoot = getProjectRoot();
  const templatesBasePath = path.join(projectRoot, 'assets', 'modeles_documents');

  let templatePath: string;
  if (template.tenant_id) {
    templatePath = path.join(templatesBasePath, 'tenants', template.tenant_id, template.stored_filename);
  } else {
    templatePath = path.join(templatesBasePath, 'default', template.stored_filename);
  }

  // Verify the reconstructed path exists
  try {
    await fs.access(templatePath);
    logger.info('Template file found at reconstructed path', {
      templateId: template.id,
      reconstructedFilename: path.basename(templatePath)
    });
    return templatePath;
  } catch {
    // Les chemins disque restent dans les journaux : jamais dans le message,
    // qui peut atteindre une réponse HTTP.
    logger.error('Template file not found', {
      templateId: template.id,
      storedPath: template.storage_path,
      reconstructedPath: templatePath
    });
    throw new NotFoundError(t('Modèle de document introuvable : ré-importez le modèle.'));
  }
}

/**
 * Render DOCX template with context data
 */
export async function renderDocx(template: DocumentTemplate, context: Record<string, any>): Promise<Buffer> {
  try {
    // Resolve template file path (handles missing files gracefully)
    const templatePath = await resolveTemplatePath(template);
    const templateBuffer = await fs.readFile(templatePath);

    // Load DOCX as zip
    const zip = new PizZip(templateBuffer);

    // Create Docxtemplater instance with nullGetter to show variable name when undefined
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: {
        start: '{{',
        end: '}}'
      },
      nullGetter: (part: any) => {
        // Return the variable name so users know what data is missing
        // The part object contains the tag name in different properties depending on the tag type
        const varName = part.value || part.module || (typeof part === 'string' ? part : 'VARIABLE');
        return `{{${varName}}}`;
      }
    });

    // Sanitize context data: replace undefined/null/empty with variable name
    const sanitizedContext = sanitizeContext(context);

    // Set data
    doc.setData(sanitizedContext);

    // Render
    try {
      doc.render();
    } catch (error: any) {
      // Handle template errors
      if (error.properties && error.properties.errors instanceof Array) {
        const errors = error.properties.errors.map((e: any) => `${e.name}: ${e.message}`).join(', ');
        throw new Error(`Template rendering error: ${errors}`);
      }
      throw error;
    }

    // Generate buffer
    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });

    return Buffer.from(buffer);
  } catch (error) {
    logger.error('Error rendering DOCX', { error, templateId: template.id });
    // Une erreur typée (modèle introuvable) garde son statut et son message ;
    // toute autre (ENOENT, moteur de gabarit) peut citer un chemin : message
    // générique, détail dans les journaux seulement.
    if (error instanceof AppError) throw error;
    throw new BadRequestError(t('Impossible de générer le document à partir de ce modèle.'));
  }
}

/**
 * Calculate SHA-256 hash of buffer
 */
export function calculateHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Save generated document to disk
 */
export async function saveGeneratedDocument(
  tenantId: string,
  docType: string,
  documentNumber: string,
  sourceKey: string,
  buffer: Buffer
): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  // Build path: assets/generated_documents/{tenantId}/{docType}/{YYYY}/{MM}/
  // Use same project root detection as in index.ts
  const cwd = process.cwd();
  const projectRoot =
    path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
      ? path.resolve(cwd, '..', '..')
      : cwd;
  const basePath = path.join(projectRoot, 'assets', 'generated_documents');
  const dirPath = path.join(basePath, tenantId, docType, String(year), month);

  // Create directory if it doesn't exist
  await fs.mkdir(dirPath, { recursive: true });

  // Generate filename: {DOCUMENT_NUMBER}_{docType}_{sourceKey}.docx
  const filename = `${documentNumber}_${docType}_${sourceKey.substring(0, 8)}.docx`;
  const filePath = path.join(dirPath, filename);

  // Save file
  await fs.writeFile(filePath, buffer);

  logger.info('Document saved', {
    tenantId,
    docType,
    documentNumber,
    filename
  });

  return filePath;
}
