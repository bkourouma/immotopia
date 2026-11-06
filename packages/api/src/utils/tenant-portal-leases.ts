/**
 * Périmètre de baux du portail locataire (BUG-2026-11-04-049, H29).
 *
 * Un locataire peut avoir plusieurs baux ACTIFS dans la même agence. Le portail
 * les montre tous, mais UNIQUEMENT ceux dont le client connecté est locataire
 * principal ou co-locataire, toujours dans son agence. Tout identifiant de bail
 * ou d'échéance reçu est contrôlé contre cette liste : hors périmètre, c'est la
 * même 404 qu'un objet inexistant.
 */

import { RentalLeaseStatus } from '@prisma/client';
import { prisma } from './database';
import { NotFoundError } from '../middleware/error-middleware';
import { isUuid } from '../lib/signature/sources/guards';

/** Filtre « baux actifs de ce locataire » — le même que celui du middleware d'accès. */
export function portalLeaseWhere(tenantId: string, tenantClientId: string) {
  return {
    tenant_id: tenantId,
    status: RentalLeaseStatus.ACTIVE,
    OR: [{ primary_renter_client_id: tenantClientId }, { coRenters: { some: { renter_client_id: tenantClientId } } }]
  };
}

/** Identifiants des baux actifs du locataire, du plus ancien au plus récent (ordre stable). */
export async function listPortalLeaseIds(tenantId: string, tenantClientId: string): Promise<string[]> {
  const leases = await prisma.rentalLease.findMany({
    where: portalLeaseWhere(tenantId, tenantClientId),
    select: { id: true },
    orderBy: [{ start_date: 'asc' }, { id: 'asc' }]
  });
  return leases.map(lease => lease.id);
}

/**
 * Bail demandé par `?leaseId=` : absent, on garde `fallback` ; présent, il doit
 * appartenir au périmètre, sinon 404.
 */
export function resolveRequestedLeaseId(
  leaseIds: string[],
  requested: unknown,
  fallback: string
): { leaseId: string; explicit: boolean } {
  if (requested === undefined || requested === null || requested === '') {
    return { leaseId: fallback, explicit: false };
  }
  if (typeof requested !== 'string' || !isUuid(requested) || !leaseIds.includes(requested)) {
    throw new NotFoundError('Bail non trouvé');
  }
  return { leaseId: requested, explicit: true };
}
