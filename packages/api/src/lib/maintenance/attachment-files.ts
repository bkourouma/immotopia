import { z } from 'zod';
import { NotFoundError } from '../../middleware/error-middleware';
import { privateUploadPath, readPrivateUpload, type PrivateFile } from '../files/private-files';
import { prisma } from '../../utils/database';
import { findTenantPortalTicket, ownerPortalTicketWhere, type TenantPortalContext } from './portal-visibility';

/**
 * Fichiers des pièces jointes de maintenance (`MaintenanceTicketAttachment`).
 *
 * ---------------------------------------------------------------------------
 * Jamais servis en statique
 * ---------------------------------------------------------------------------
 *
 * Une pièce jointe de ticket est privée : photo d'un logement, facture, devis.
 * `/uploads/maintenance/...` est refusé par `uploadsAccessGuard`
 * (middleware/uploads-access-middleware.ts), quelle que soit la session, comme
 * `/uploads/syndics/...`. Avant ce correctif, la garde statique laissait passer
 * tout membre OU CLIENT de l'agence : un locataire qui connaissait l'URL
 * ouvrait la photo du ticket d'un autre locataire, ou d'un propriétaire.
 *
 * Le fichier ne sort plus que par une route qui a d'abord vérifié le droit de
 * l'appelant sur CE ticket :
 *   - gestion : `GET /api/tenants/:tenantId/maintenance/files/:attachmentId`
 *     (`requireTenantAccess` + permission maintenance, pièce de l'agence) ;
 *   - portail locataire : `GET /api/portal/tenant/maintenance/:id/attachments/:attachmentId`
 *     (ticket visible dans SON portail : son bail actif ou sa fiche CRM,
 *     voir portal-visibility.ts) ;
 *   - portail propriétaire : `GET /api/portal/owner/maintenance/:id/attachments/:attachmentId`
 *     (ticket d'un de SES biens, voir `ownerPortalTicketWhere`).
 * Toute autre situation — pièce inexistante, d'un autre ticket, d'une autre
 * agence, ticket hors du périmètre du portail — répond le même 404.
 *
 * `file_url` garde sa forme historique `/uploads/maintenance/<agence>/<ticket>/<f>` :
 * c'est un identifiant de stockage, plus une URL à ouvrir.
 *
 * Lecture et envoi : lib/files/private-files.ts, commun à tous les fichiers
 * privés.
 */

// Règles de visibilité d'un ticket dans les portails : ./portal-visibility.ts,
// partagées avec la liste, le détail et les commentaires de chaque portail.

export type MaintenanceAttachmentFile = PrivateFile;

interface StoredAttachment {
  tenant_id: string;
  ticket_id: string;
  file_url: string;
  file_name: string;
}

const NOT_FOUND = 'Pièce jointe introuvable.';
const idSchema = z.string().uuid();

/** Un identifiant qui n'est pas un UUID ne désigne rien : 404, pas 400 ni 500. */
function assertId(value: unknown): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new NotFoundError(NOT_FOUND);
  return parsed.data;
}

/**
 * Chemin relatif (`maintenance/<agence>/<ticket>/<fichier>`) d'un fichier
 * déposé pour CE ticket de CETTE agence, ou `null` (autre ticket, chemin
 * suspect).
 */
export function localMaintenanceAttachmentPath(attachment: StoredAttachment): string | null {
  return privateUploadPath(attachment.file_url, ['maintenance', attachment.tenant_id, attachment.ticket_id]);
}

/** Lit le fichier d'une pièce jointe DÉJÀ AUTORISÉE. 404 si absent. */
export function readMaintenanceAttachmentFile(attachment: StoredAttachment): Promise<MaintenanceAttachmentFile> {
  return readPrivateUpload(localMaintenanceAttachmentPath(attachment), attachment.file_name, NOT_FOUND);
}

async function findAttachment(tenantId: string, attachmentId: string) {
  return prisma.maintenanceTicketAttachment.findFirst({
    where: { id: assertId(attachmentId), tenant_id: tenantId },
    select: { tenant_id: true, ticket_id: true, file_url: true, file_name: true }
  });
}

/**
 * Gestion : une pièce jointe de l'agence. Le droit sur le module est vérifié
 * par la route (`requireTenantAccess` + permission maintenance). Avec
 * `requesterUserId` (appelant sans `MAINTENANCE_ADMIN`), la pièce doit
 * appartenir à un ticket qu'il a lui-même déclaré.
 */
export async function getMaintenanceAttachmentFileForTenant(
  tenantId: string,
  attachmentId: string,
  requesterUserId?: string
): Promise<MaintenanceAttachmentFile> {
  const attachment = await findAttachment(tenantId, attachmentId);
  if (!attachment) throw new NotFoundError(NOT_FOUND);
  // Sans droit de gestion : seule une pièce d'un ticket déclaré par l'appelant.
  if (requesterUserId) {
    const own = await prisma.maintenanceTicket.findFirst({
      where: { id: attachment.ticket_id, tenant_id: tenantId, created_by_user_id: requesterUserId },
      select: { id: true }
    });
    if (!own) throw new NotFoundError(NOT_FOUND);
  }
  return readMaintenanceAttachmentFile(attachment);
}

/**
 * Portails : la pièce `attachmentId` du ticket `ticket`, déjà reconnu visible
 * dans le portail (`null` sinon). Toute autre situation répond 404, comme une
 * pièce inexistante.
 */
async function getPortalAttachmentFile(
  tenantId: string,
  ticket: { id: string } | null,
  attachmentId: string
): Promise<MaintenanceAttachmentFile> {
  if (!ticket) throw new NotFoundError(NOT_FOUND);
  const attachment = await findAttachment(tenantId, attachmentId);
  if (!attachment || attachment.ticket_id !== ticket.id) throw new NotFoundError(NOT_FOUND);
  return readMaintenanceAttachmentFile(attachment);
}

export async function getMaintenanceAttachmentFileForTenantPortal(
  portal: TenantPortalContext,
  ticketId: string,
  attachmentId: string
): Promise<MaintenanceAttachmentFile> {
  const ticket = await findTenantPortalTicket(portal, ticketId);
  return getPortalAttachmentFile(portal.tenantId, ticket, attachmentId);
}

export async function getMaintenanceAttachmentFileForOwnerPortal(
  portal: { tenantId: string; propertyIds: string[] },
  ticketId: string,
  attachmentId: string
): Promise<MaintenanceAttachmentFile> {
  if (portal.propertyIds.length === 0) throw new NotFoundError(NOT_FOUND);
  const ticket = await prisma.maintenanceTicket.findFirst({
    where: { AND: [ownerPortalTicketWhere(portal), { id: assertId(ticketId), tenant_id: portal.tenantId }] },
    select: { id: true }
  });
  return getPortalAttachmentFile(portal.tenantId, ticket, attachmentId);
}
