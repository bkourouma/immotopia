import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { privateUploadPath, readPrivateUpload, type PrivateFile } from '../files/private-files';

/**
 * Fichiers des documents de bien (`PropertyDocument` : titre de propriété,
 * acte notarié, diagnostics...), stockés sous
 * `uploads/properties/<bien>/documents/`.
 *
 * Jamais servis en statique : `/uploads/properties/<bien>/documents/...`
 * répond 404 (middleware/uploads-access-middleware.ts), comme les documents
 * de copropriété et les pièces jointes de maintenance. Le fichier ne sort que
 * par `GET /api/tenants/:tenantId/properties/:id/documents/:documentId/file`
 * (`requireTenantAccess` + `PROPERTIES_VIEW`), qui vérifie que le bien
 * appartient à l'agence et que le document appartient au bien. Toute autre
 * situation répond le même 404.
 *
 * Le portail propriétaire les sert désormais aussi (lot P5), par
 * `GET /api/portal/owner/patrimoine/properties/:propertyId/documents/:documentId/file`,
 * après contrôle du périmètre du propriétaire et du réglage de l'agence
 * (`lib/patrimoine/owner-portal-view.ts`,
 * `assertOwnerPortalDocumentAccessible`).
 */

const NOT_FOUND = 'Document introuvable.';

export async function getPropertyDocumentFileForTenant(
  tenantId: string,
  propertyId: string,
  documentId: string
): Promise<PrivateFile> {
  // Le bien d'abord, par l'agence (property-tenant-guard) : `PropertyDocument.tenantId`
  // est nullable sur les anciennes lignes, le bien, lui, porte toujours son agence.
  const property = await prisma.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true }
  });
  if (!property) throw new NotFoundError(NOT_FOUND);

  const document = await prisma.propertyDocument.findFirst({
    where: { id: documentId, propertyId: property.id, OR: [{ tenantId }, { tenantId: null }] },
    select: { propertyId: true, fileUrl: true, fileName: true }
  });
  if (!document) throw new NotFoundError(NOT_FOUND);

  return readPrivateUpload(
    privateUploadPath(document.fileUrl, ['properties', document.propertyId, 'documents']),
    document.fileName,
    NOT_FOUND
  );
}
