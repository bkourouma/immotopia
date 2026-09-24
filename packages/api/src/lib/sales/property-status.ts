import { PropertyAvailability, PropertyStatus } from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';
import { validateStatusTransition } from '../../services/property-status-service';
import { conflict } from '../errors';

/**
 * Variante transactionnelle de `updatePropertyStatus`
 * (`services/property-status-service.ts`).
 *
 * Ce service existant écrit toujours par le client `prisma` global : il ne
 * prend pas de client de transaction, et son historique (`recordStatusHistory`)
 * non plus. Le lot 9 a besoin que le changement de statut du bien vive dans la
 * même transaction que l'offre acceptée, le compromis signé ou l'acte — la
 * même règle que partout ailleurs dans ce lot (P6, PRD §3). On ne modifie pas
 * `property-status-service.ts` (son API ne bouge pas pour les appelants
 * existants) : cette fonction réutilise sa seule partie pure, la validation
 * des transitions (`validateStatusTransition`), et réécrit elle-même les deux
 * lignes d'écriture (bien + historique) sous `tx`.
 *
 * Ne fait rien si le bien est déjà dans le statut visé : plusieurs chemins du
 * lot 9 (offre acceptée, compromis annulé...) peuvent retomber sur un statut
 * que le bien porte déjà, et `validateStatusTransition` refuse une transition
 * vers soi-même.
 */
export async function setPropertyStatusTx(
  tx: PrismaTransactionClient,
  params: {
    propertyId: string;
    tenantId: string;
    newStatus: PropertyStatus;
    actorUserId: string;
    notes?: string;
  }
): Promise<void> {
  const property = await tx.property.findFirst({
    where: { id: params.propertyId, tenantId: params.tenantId },
    select: { id: true, tenantId: true, status: true, ownershipType: true }
  });
  if (!property) {
    throw conflict('Bien introuvable pour le changement de statut de la vente.');
  }
  if (property.status === params.newStatus) {
    return;
  }

  const validation = validateStatusTransition(property.status, params.newStatus, property.ownershipType, true);
  if (!validation.valid) {
    throw conflict(validation.error || 'Transition de statut du bien invalide.');
  }

  const availability =
    params.newStatus === PropertyStatus.SOLD
      ? PropertyAvailability.UNAVAILABLE
      : params.newStatus === PropertyStatus.AVAILABLE
        ? PropertyAvailability.AVAILABLE
        : undefined;

  await tx.property.update({
    where: { id: property.id },
    data: {
      status: params.newStatus,
      version: { increment: 1 },
      ...(availability ? { availability } : {})
    }
  });

  await tx.propertyStatusHistory.create({
    data: {
      propertyId: property.id,
      tenantId: property.tenantId,
      previousStatus: property.status,
      newStatus: params.newStatus,
      changedByUserId: params.actorUserId,
      notes: params.notes || null
    }
  });
}
