import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { validateFileUpload, sanitizeFilename } from '../utils/maintenance-validators';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';

/**
 * Upload attachment for a maintenance ticket
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @param file - Uploaded file (from multer)
 * @param actorUserId - User uploading (optional)
 * @param actorContactId - Contact uploading (optional)
 * @returns Created attachment record
 */
export async function uploadAttachment(
  tenantId: string,
  ticketId: string,
  file: Express.Multer.File,
  actorUserId?: string,
  actorContactId?: string
) {
  // Verify ticket exists and belongs to tenant
  const ticket = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenant_id: tenantId
    }
  });

  if (!ticket) {
    throw new Error('Ticket introuvable');
  }

  // Count existing attachments for this ticket
  const existingCount = await prisma.maintenanceTicketAttachment.count({
    where: {
      ticket_id: ticketId,
      tenant_id: tenantId
    }
  });

  // Validate file upload
  const validation = validateFileUpload(file, existingCount);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Fichier invalide');
  }

  // Determine project root (similar to property-media-service)
  const cwd = process.cwd();
  const projectRoot =
    path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
      ? path.resolve(cwd, '..', '..')
      : cwd;

  // Create directory structure: uploads/maintenance/<tenantId>/<ticketId>/
  const uploadDir = path.join(projectRoot, 'uploads', 'maintenance', tenantId, ticketId);
  await fs.mkdir(uploadDir, { recursive: true });

  // Sanitize filename and generate unique filename
  const sanitizedOriginalName = sanitizeFilename(file.originalname);
  const fileExtension = path.extname(sanitizedOriginalName);
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
  const filePath = path.join(uploadDir, fileName);

  // Save file
  await fs.writeFile(filePath, file.buffer);

  // Generate relative URL for serving
  const fileUrl = `/uploads/maintenance/${tenantId}/${ticketId}/${fileName}`;

  // Create attachment record
  const attachment = await prisma.maintenanceTicketAttachment.create({
    data: {
      tenant_id: tenantId,
      ticket_id: ticketId,
      file_url: fileUrl,
      file_name: sanitizedOriginalName,
      mime_type: file.mimetype || 'application/octet-stream',
      file_size: file.size,
      uploaded_by_user_id: actorUserId || null,
      uploaded_by_contact_id: actorContactId || null
    }
  });

  logger.info('Maintenance attachment uploaded', {
    attachmentId: attachment.id,
    ticketId,
    tenantId,
    fileName: sanitizedOriginalName,
    fileSize: file.size
  });

  return attachment;
}

/**
 * Get attachment by ID with access validation
 * @param tenantId - Tenant ID
 * @param attachmentId - Attachment ID
 * @param tenantContactId - Tenant contact ID (for access validation, optional)
 * @returns Attachment metadata
 */
export async function getAttachmentById(tenantId: string, attachmentId: string, tenantContactId?: string) {
  const attachment = await prisma.maintenanceTicketAttachment.findFirst({
    where: {
      id: attachmentId,
      tenant_id: tenantId
    },
    include: {
      ticket: {
        select: {
          id: true,
          tenant_contact_id: true,
          status: true
        }
      }
    }
  });

  if (!attachment) {
    throw new Error('Pièce jointe introuvable');
  }

  // If tenantContactId provided, verify access (tenant can only access their own ticket attachments)
  if (tenantContactId && attachment.ticket.tenant_contact_id !== tenantContactId) {
    throw new Error('Accès non autorisé à cette pièce jointe');
  }

  return attachment;
}

/**
 * Download attachment file
 * @param tenantId - Tenant ID
 * @param attachmentId - Attachment ID
 * @param tenantContactId - Tenant contact ID (for access validation, optional)
 * @returns File stream and metadata
 */
export async function downloadAttachment(tenantId: string, attachmentId: string, tenantContactId?: string) {
  const attachment = await getAttachmentById(tenantId, attachmentId, tenantContactId);

  // Determine project root
  const cwd = process.cwd();
  const projectRoot =
    path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
      ? path.resolve(cwd, '..', '..')
      : cwd;

  // Construct full file path
  const filePath = path.join(projectRoot, attachment.file_url);

  // Verify file exists
  try {
    await fs.access(filePath);
  } catch (error) {
    logger.error('Attachment file not found', {
      attachmentId,
      filePath,
      fileUrl: attachment.file_url
    });
    throw new Error('Fichier introuvable sur le serveur');
  }

  // Return file stream and metadata
  const fileStream = createReadStream(filePath);

  return {
    stream: fileStream,
    metadata: {
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      fileSize: attachment.file_size
    }
  };
}

/**
 * Cleanup orphaned attachment files
 * Removes files that are no longer referenced in the database
 * @param tenantId - Tenant ID (optional, for tenant-scoped cleanup)
 * @returns Number of files cleaned up
 */
export async function cleanupOrphanedFiles(tenantId?: string): Promise<number> {
  let cleanedCount = 0;

  try {
    // Determine project root
    const cwd = process.cwd();
    const projectRoot =
      path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages'
        ? path.resolve(cwd, '..', '..')
        : cwd;

    const baseUploadDir = path.join(projectRoot, 'uploads', 'maintenance');

    // Get all attachment records from database
    const whereClause: any = {};
    if (tenantId) {
      whereClause.tenant_id = tenantId;
    }

    const attachments = await prisma.maintenanceTicketAttachment.findMany({
      where: whereClause,
      select: {
        id: true,
        file_url: true,
        tenant_id: true
      }
    });

    // Create a set of valid file URLs
    const validFileUrls = new Set(attachments.map(att => att.file_url));

    // Scan upload directory for files
    const scanDirectory = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            // Construct relative URL from file path
            const relativePath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');
            const fileUrl = `/${relativePath}`;

            // If file is not in database, it's orphaned
            if (!validFileUrls.has(fileUrl)) {
              try {
                await fs.unlink(fullPath);
                cleanedCount++;
                logger.info('Cleaned up orphaned file', {
                  filePath: fullPath,
                  fileUrl,
                  tenantId
                });
              } catch (error) {
                logger.error('Error deleting orphaned file', {
                  filePath: fullPath,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
          }
        }
      } catch (error) {
        // Directory might not exist, which is fine
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.error('Error scanning directory', {
            dirPath,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    };

    // Start scanning from base directory
    if (tenantId) {
      const tenantDir = path.join(baseUploadDir, tenantId);
      await scanDirectory(tenantDir);
    } else {
      await scanDirectory(baseUploadDir);
    }

    logger.info('Orphaned files cleanup completed', {
      cleanedCount,
      tenantId: tenantId || 'all'
    });
  } catch (error) {
    logger.error('Error in cleanupOrphanedFiles', {
      tenantId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  return cleanedCount;
}
