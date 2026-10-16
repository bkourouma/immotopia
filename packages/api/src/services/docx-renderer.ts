import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { logger } from '../utils/logger';
import { DocumentTemplate } from '@prisma/client';
import { AppError, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { getGeneratedDocumentsDir, getShippedTemplatesDir, getTemplatesWriteDir } from '../utils/assets-paths';
import {
  DOCX_IMAGES_CONTEXT_KEY,
  injectDocxImages,
  isOptionalBrandingKey,
  logoMarkerContext,
  type DocxImages
} from '../lib/documents/docx-branding';

/**
 * Sanitize context data: replace undefined, null, or empty values with the variable name
 */
function sanitizeContext(context: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(context)) {
    if (value === null || value === undefined || value === '') {
      // Identité de l'émetteur, copropriété, logos : un vide reste vide (jamais `{{NOM}}`).
      // Autre donnée : le nom de la variable, pour que l'utilisateur sache ce qui manque.
      sanitized[key] = isOptionalBrandingKey(key) ? '' : `{{${key}}}`;
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

  // Reconstruct path from stored filename : dossier d'ecriture (volume), puis
  // modeles livres / ancien emplacement sous `<racine>/assets/modeles_documents`.
  const relative = template.tenant_id
    ? path.join('tenants', template.tenant_id, template.stored_filename)
    : path.join('default', template.stored_filename);
  const candidates = [path.join(getTemplatesWriteDir(), relative), path.join(getShippedTemplatesDir(), relative)];

  let templatePath = candidates[0];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      templatePath = candidate;
      break;
    } catch {
      // essayer le suivant
    }
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

/** Sépare les images (clé réservée) des données textuelles du contexte. */
function splitContextImages(context: Record<string, any>): { data: Record<string, any>; images: DocxImages } {
  const { [DOCX_IMAGES_CONTEXT_KEY]: images, ...data } = context;
  return { data, images: (images as DocxImages | undefined) ?? {} };
}

/**
 * La quittance reçoit son numéro définitif (RCU-…) après la construction du
 * contexte : la référence du document le suit.
 */
function syncDocumentReference(data: Record<string, any>): Record<string, any> {
  const receiptNumber = data.RECU_NUMERO;
  return typeof receiptNumber === 'string' && receiptNumber ? { ...data, REFERENCE_DOCUMENT: receiptNumber } : data;
}

export interface RenderDocxBufferOptions {
  /** Remplace une donnée vide par `{{NOM}}` (modèles locatifs). Vrai par défaut. */
  sanitize?: boolean;
}

/**
 * Rend un modèle DOCX (octets) avec le contexte, puis injecte les logos.
 * Pur : ni base de données ni disque, donc testable seul.
 */
export function renderDocxBuffer(
  templateBuffer: Buffer,
  context: Record<string, any>,
  options: RenderDocxBufferOptions = {}
): Buffer {
  const { sanitize = true } = options;
  const { data, images } = splitContextImages(context);
  const synced = syncDocumentReference(data);
  const values = { ...(sanitize ? sanitizeContext(synced) : synced), ...logoMarkerContext() };

  const doc = new Docxtemplater(new PizZip(templateBuffer), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    // Le nom de la variable manquante, pour que l'utilisateur sache ce qui manque.
    nullGetter: (part: any) => {
      const varName = part.value || part.module || (typeof part === 'string' ? part : 'VARIABLE');
      return `{{${varName}}}`;
    }
  });
  doc.setData(values);

  try {
    doc.render();
  } catch (error: any) {
    if (error.properties && error.properties.errors instanceof Array) {
      const errors = error.properties.errors.map((e: any) => `${e.name}: ${e.message}`).join(', ');
      throw new Error(`Template rendering error: ${errors}`);
    }
    throw error;
  }

  const zip = doc.getZip();
  injectDocxImages(zip, images);
  return Buffer.from(zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

/**
 * Render DOCX template with context data
 */
export async function renderDocx(template: DocumentTemplate, context: Record<string, any>): Promise<Buffer> {
  try {
    // Resolve template file path (handles missing files gracefully)
    const templatePath = await resolveTemplatePath(template);
    const templateBuffer = await fs.readFile(templatePath);
    return renderDocxBuffer(templateBuffer, context);
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

  // Build path: <UPLOADS_DIR>/generated_documents/{tenantId}/{docType}/{YYYY}/{MM}/
  // (ancien emplacement `assets/generated_documents` hors UPLOADS_DIR, voir utils/assets-paths.ts)
  const basePath = getGeneratedDocumentsDir();
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
