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

/**
 * Mode lecture seule (H4) : le client n'a AUCUN bail actif mais au moins un bail
 * terminé ou suspendu. Il voit alors ces baux-là (jamais les actifs d'un autre
 * client). Le mode est passé explicitement, jamais lu dans un état global.
 */
export const READ_ONLY_LEASE_STATUSES: RentalLeaseStatus[] = [RentalLeaseStatus.ENDED, RentalLeaseStatus.SUSPENDED];

/** Filtre « baux de ce locataire » — le même que celui du middleware d'accès. */
export function portalLeaseWhere(tenantId: string, tenantClientId: string, readOnly = false) {
  return {
    tenant_id: tenantId,
    status: readOnly ? { in: READ_ONLY_LEASE_STATUSES } : RentalLeaseStatus.ACTIVE,
    OR: [{ primary_renter_client_id: tenantClientId }, { coRenters: { some: { renter_client_id: tenantClientId } } }]
  };
}

/** Identifiants des baux du locataire (actifs, ou terminés/suspendus en lecture seule), ordre stable. */
export async function listPortalLeaseIds(
  tenantId: string,
  tenantClientId: string,
  readOnly = false
): Promise<string[]> {
  const leases = await prisma.rentalLease.findMany({
    where: portalLeaseWhere(tenantId, tenantClientId, readOnly),
    select: { id: true },
    orderBy: readOnly ? [{ start_date: 'desc' }, { id: 'asc' }] : [{ start_date: 'asc' }, { id: 'asc' }]
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
