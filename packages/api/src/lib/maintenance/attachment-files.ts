import { promises as fs } from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { env } from '../../config/env';
import { getProjectRoot, getUploadsRoot } from '../../utils/project-root';
import { NotFoundError } from '../../middleware/error-middleware';
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
 * ---------------------------------------------------------------------------
 * Où les fichiers sont relus
 * ---------------------------------------------------------------------------
 *
 * Le service d'upload (services/maintenance-attachment-service.ts) écrit sous
 * `<racine du monorepo>/uploads`, sans tenir compte de `UPLOADS_DIR` ; le
 * serveur statique, lui, lisait `getUploadsRoot(env.UPLOADS_DIR)`. On relit
 * donc la racine de référence d'abord, puis `<racine>/uploads` : les deux
 * coïncident quand `UPLOADS_DIR` n'est pas posé.
 */

// Règles de visibilité d'un ticket dans les portails : ./portal-visibility.ts,
// partagées avec la liste, le détail et les commentaires de chaque portail.

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

export interface MaintenanceAttachmentFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

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

/** Racines relues, dans l'ordre (voir l'en-tête). */
export function maintenanceAttachmentReadRoots(): string[] {
  const reference = getUploadsRoot(env.UPLOADS_DIR);
  const writer = path.join(getProjectRoot(), 'uploads');
  return path.resolve(reference) === path.resolve(writer) ? [reference] : [reference, writer];
}

/**
 * Chemin relatif (`maintenance/<agence>/<ticket>/<fichier>`) d'un fichier
 * déposé pour CE ticket de CETTE agence, ou `null` (autre ticket, chemin
 * suspect).
 */
export function localMaintenanceAttachmentPath(attachment: StoredAttachment): string | null {
  const match = /^\/uploads\/(maintenance\/([^/\\]+)\/([^/\\]+)\/([^/\\]+))$/.exec(attachment.file_url);
  if (!match) return null;
  const [, relative, tenantId, ticketId, fileName] = match;
  if (tenantId !== attachment.tenant_id || ticketId !== attachment.ticket_id) return null;
  if (fileName.includes('..') || fileName.includes('\0')) return null;
  return relative;
}

/** Lit le fichier d'une pièce jointe DÉJÀ AUTORISÉE. 404 si absent. */
export async function readMaintenanceAttachmentFile(attachment: StoredAttachment): Promise<MaintenanceAttachmentFile> {
  const relative = localMaintenanceAttachmentPath(attachment);
  if (!relative) throw new NotFoundError(NOT_FOUND);

  for (const root of maintenanceAttachmentReadRoots()) {
    const absolute = path.resolve(root, relative);
    // Défense en profondeur : le chemin reste sous la racine.
    if (!absolute.startsWith(path.resolve(root) + path.sep)) continue;
    try {
      const buffer = await fs.readFile(absolute);
      const extension = path.extname(absolute).toLowerCase();
      const safeName = attachment.file_name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || `piece-jointe${extension}`;
      return {
        buffer,
        fileName: safeName,
        // Le type vient de l'extension du fichier stocké, pas du type déclaré
        // par le navigateur au dépôt : jamais de `text/html` servi par l'API.
        mimeType: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
      };
    } catch {
      // Essayer la racine suivante.
    }
  }
  throw new NotFoundError(NOT_FOUND);
}

async function findAttachment(tenantId: string, attachmentId: string) {
  return prisma.maintenanceTicketAttachment.findFirst({
    where: { id: assertId(attachmentId), tenant_id: tenantId },
    select: { tenant_id: true, ticket_id: true, file_url: true, file_name: true }
  });
}

/**
 * Gestion : une pièce jointe de l'agence. Le droit sur le module est vérifié
 * par la route (`requireTenantAccess` + permission maintenance) : tout ticket
 * de l'agence est alors consultable par l'écran de gestion.
 */
export async function getMaintenanceAttachmentFileForTenant(
  tenantId: string,
  attachmentId: string
): Promise<MaintenanceAttachmentFile> {
  const attachment = await findAttachment(tenantId, attachmentId);
  if (!attachment) throw new NotFoundError(NOT_FOUND);
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
