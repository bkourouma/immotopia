import { MaintenanceTicketStatus } from '@prisma/client';

/**
 * Validates status transition according to workflow rules
 * State machine pattern: DECLARED → IN_PROGRESS → ASSIGNED → RESOLVED
 *
 * Allowed transitions:
 * - DECLARED → IN_PROGRESS (manager starts work)
 * - DECLARED → CANCELED (tenant or manager cancels)
 * - IN_PROGRESS → ASSIGNED (requires vendor or user assignment)
 * - IN_PROGRESS → CANCELED (manager cancels)
 * - ASSIGNED → RESOLVED (work completed)
 *
 * @param fromStatus - Current status
 * @param toStatus - Desired new status
 * @param hasAssignment - Whether vendor or user is assigned (required for ASSIGNED status)
 * @returns Object with isValid boolean and error message if invalid
 */
export function validateStatusTransition(
  fromStatus: MaintenanceTicketStatus,
  toStatus: MaintenanceTicketStatus,
  hasAssignment: boolean = false
): { isValid: boolean; error?: string } {
  // Same status is always valid (no-op)
  if (fromStatus === toStatus) {
    return { isValid: true };
  }

  // Define valid transitions
  const validTransitions: Record<MaintenanceTicketStatus, MaintenanceTicketStatus[]> = {
    DECLARED: [MaintenanceTicketStatus.IN_PROGRESS, MaintenanceTicketStatus.CANCELED],
    IN_PROGRESS: [MaintenanceTicketStatus.ASSIGNED, MaintenanceTicketStatus.CANCELED],
    ASSIGNED: [MaintenanceTicketStatus.RESOLVED],
    RESOLVED: [], // RESOLVED is terminal
    CANCELED: [] // CANCELED is terminal
  };

  const allowedNextStatuses = validTransitions[fromStatus] || [];

  if (!allowedNextStatuses.includes(toStatus)) {
    return {
      isValid: false,
      error: `Transition invalide de ${fromStatus} vers ${toStatus}. Transitions autorisées: ${allowedNextStatuses.join(', ')}`
    };
  }

  // Special validation: ASSIGNED status requires vendor or user assignment
  if (toStatus === MaintenanceTicketStatus.ASSIGNED && !hasAssignment) {
    return {
      isValid: false,
      error: "Le statut ASSIGNED nécessite l'attribution d'un prestataire ou d'un utilisateur"
    };
  }

  return { isValid: true };
}

/**
 * Validates file upload according to maintenance module rules
 *
 * Rules:
 * - File type: Images (JPEG, PNG, WebP) or PDFs only
 * - File size: Maximum 5MB per file
 * - File count: Maximum 10 files per ticket (enforced at service layer)
 *
 * @param file - File to validate
 * @param existingFileCount - Number of files already attached to ticket
 * @returns Object with isValid boolean and error message if invalid
 */
export function validateFileUpload(
  file: Express.Multer.File,
  existingFileCount: number = 0
): { isValid: boolean; error?: string } {
  // Validate file type
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

  if (!file.mimetype || !allowedMimeTypes.includes(file.mimetype)) {
    return {
      isValid: false,
      error: `Type de fichier non autorisé: ${file.mimetype}. Types autorisés: JPEG, PNG, WebP, PDF`
    };
  }

  // Validate file size (5MB = 5,242,880 bytes)
  const maxFileSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxFileSize) {
    return {
      isValid: false,
      error: `Fichier trop volumineux: ${(file.size / 1024 / 1024).toFixed(2)}MB. Taille maximale: 5MB`
    };
  }

  // Validate file count (enforced at service layer, but check here for early validation)
  const maxFilesPerTicket = 10;
  if (existingFileCount >= maxFilesPerTicket) {
    return {
      isValid: false,
      error: `Nombre maximum de fichiers atteint (${maxFilesPerTicket}). Impossible d'ajouter plus de fichiers.`
    };
  }

  return { isValid: true };
}

/**
 * Sanitizes filename to prevent path traversal attacks
 * @param filename - Original filename
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and dangerous characters
  return filename
    .replace(/[/\\]/g, '') // Remove path separators
    .replace(/\.\./g, '') // Remove parent directory references
    .replace(/[<>:"|?*]/g, '') // Remove Windows reserved characters
    .trim();
}
