import type { Prisma } from '@prisma/client';

/**
 * Ce que les portails (locataire, propriétaire) disent d'un fichier.
 *
 * Jamais de chemin disque (`file_path`, `filePath`), jamais d'identifiant de
 * stockage (`file_url` / `fileUrl` en `/uploads/...` d'un dossier privé) : le
 * premier révèle l'arborescence du serveur, le second ne mène plus à rien
 * (le service statique répond 404) et n'a pas à sortir. Un fichier se
 * présente par son identifiant, son nom, son type, sa taille, sa date — et le
 * chemin de la route authentifiée qui le sert (`downloadPath`, relatif à la
 * base de l'API, tel que `api-client` l'attend), quand il y en a une.
 *
 * Seules exceptions : les médias d'annonce d'un bien, publics par nature
 * (`/uploads/properties/<bien>/<fichier>`), dont l'URL est rendue telle quelle.
 */

export type PortalKind = 'tenant' | 'owner';

// ---------------------------------------------------------------------------
// Documents locatifs (quittances, baux, avis d'échéance...)
// ---------------------------------------------------------------------------

/** Colonnes lues ; `file_path` et `file_url` ne servent qu'à savoir s'il y a un fichier. */
export const PORTAL_RENTAL_DOCUMENT_SELECT = {
  id: true,
  type: true,
  status: true,
  document_number: true,
  title: true,
  mime_type: true,
  issued_at: true,
  created_at: true,
  lease_id: true,
  file_path: true,
  file_url: true
} satisfies Prisma.RentalDocumentSelect;

type StoredRentalDocument = Prisma.RentalDocumentGetPayload<{ select: typeof PORTAL_RENTAL_DOCUMENT_SELECT }>;

export function toPortalRentalDocument<T extends StoredRentalDocument>(document: T, portal: PortalKind) {
  const { file_path: filePath, file_url: fileUrl, ...visible } = document;
  return {
    ...visible,
    downloadPath: filePath || fileUrl ? `/portal/${portal}/documents/${document.id}/download` : null
  };
}

// ---------------------------------------------------------------------------
// Pièces jointes de maintenance
// ---------------------------------------------------------------------------

export const PORTAL_ATTACHMENT_SELECT = {
  id: true,
  file_name: true,
  mime_type: true,
  file_size: true,
  created_at: true
} satisfies Prisma.MaintenanceTicketAttachmentSelect;

type StoredAttachment = Prisma.MaintenanceTicketAttachmentGetPayload<{ select: typeof PORTAL_ATTACHMENT_SELECT }>;

export function toPortalAttachment(attachment: StoredAttachment, ticketId: string, portal: PortalKind) {
  return {
    id: attachment.id,
    file_name: attachment.file_name,
    mime_type: attachment.mime_type,
    file_size: attachment.file_size,
    created_at: attachment.created_at,
    downloadPath: `/portal/${portal}/maintenance/${ticketId}/attachments/${attachment.id}`
  };
}

// ---------------------------------------------------------------------------
// Médias et documents d'un bien (portail propriétaire)
// ---------------------------------------------------------------------------

/** Médias d'annonce : publics, leur URL `/uploads/properties/<bien>/<fichier>` est rendue. */
export const PORTAL_PROPERTY_MEDIA_SELECT = {
  id: true,
  mediaType: true,
  fileUrl: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  displayOrder: true,
  isPrimary: true,
  createdAt: true
} satisfies Prisma.PropertyMediaSelect;

/**
 * Documents du bien (titre, acte, diagnostics) : privés, et aucune route de
 * portail ne les sert — ni chemin, ni URL, seulement leur description.
 */
export const PORTAL_PROPERTY_DOCUMENT_SELECT = {
  id: true,
  documentType: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  expirationDate: true,
  isValid: true,
  createdAt: true
} satisfies Prisma.PropertyDocumentSelect;
