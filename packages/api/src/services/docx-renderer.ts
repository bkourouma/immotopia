import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { logger } from '../utils/logger';
import { DocumentTemplate } from '@prisma/client';

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
 * Render DOCX template with context data
 */
export async function renderDocx(
  template: DocumentTemplate,
  context: Record<string, any>
): Promise<Buffer> {
  try {
    // Read template file
    const templatePath = template.storage_path;
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
        const errors = error.properties.errors
          .map((e: any) => `${e.name}: ${e.message}`)
          .join(', ');
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
    throw new Error(`Failed to render document: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    filePath
  });

  return filePath;
}


