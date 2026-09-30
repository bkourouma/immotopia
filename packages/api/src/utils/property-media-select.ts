import { Prisma } from '@prisma/client';

/**
 * `filePath` (chemin disque absolu) n'est jamais renvoye au client : select
 * explicite partout ou un media de bien part en JSON (reponse directe ou
 * relation `media` d'un bien). Seule la suppression relit le chemin, en
 * interne.
 */
export const PROPERTY_MEDIA_SELECT = {
  id: true,
  propertyId: true,
  tenantId: true,
  mediaType: true,
  fileUrl: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  displayOrder: true,
  isPrimary: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.PropertyMediaSelect;
