import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError, ForbiddenError, NotFoundError } from '../middleware/error-middleware';
import { assertRentalOnlinePaymentAllowed } from '../lib/payment-gateway/availability';
import { prisma } from '../utils/database';
import { listPortalLeaseIds } from '../utils/tenant-portal-leases';
import {
  getCheckoutForPortal,
  getOnlinePaymentAvailability,
  startCheckout,
  toOnlineCheckoutDto
} from '../lib/payment-gateway/checkout';

/**
 * Paiement en ligne — portail locataire (contrat §3.3).
 *
 * `req.tenantPortal` (posé par `requireTenantPortalAccess`) porte le contexte
 * de confiance : `leaseId` et `tenantClientId` n'arrivent jamais du corps de
 * la requête.
 */

function requirePortalContext(req: Request) {
  if (!req.tenantPortal) {
    throw new ForbiddenError('Accès portail locataire requis.');
  }
  return req.tenantPortal;
}

export const getOnlinePaymentAvailabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = requirePortalContext(req);
  const data = await getOnlinePaymentAvailability(tenantId);
  res.json({ success: true, data });
});

const startCheckoutSchema = z.object({
  installmentIds: z.array(z.string().uuid()).min(1).max(24)
});

/**
 * Garde RENTAL (contrat 049 §2.8) : une agence sans droit RENTAL (ou inactive) répond 403
 * `RENTAL_FEATURE_DENIED`. Le portail ne passe ni par `requireTenantAccess` ni par
 * `subscriptionRouteGuard`. `availability` n'est pas gardée : elle répond `available: false`.
 * Les limiteurs de débit sont posés sur les routes (`routes/tenant-portal-routes.ts`).
 */
export const startOnlinePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, tenantClientId } = requirePortalContext(req);
  await assertRentalOnlinePaymentAllowed(tenantId);
  const { installmentIds } = startCheckoutSchema.parse(req.body);

  // H29 : le bail à payer est celui des échéances choisies, contrôlé contre les
  // baux actifs du locataire connecté (jamais un `leaseId` du corps). Une échéance
  // hors périmètre répond 404 ; un paiement porte sur un seul bail.
  const scope = await listPortalLeaseIds(tenantId, tenantClientId);
  if (scope.length === 0) {
    throw new ForbiddenError('Aucun bail actif trouvé.');
  }
  const uniqueIds = [...new Set(installmentIds)];
  const owned = await prisma.rentalInstallment.findMany({
    where: { id: { in: uniqueIds }, tenant_id: tenantId, lease_id: { in: scope } },
    select: { id: true, lease_id: true }
  });
  if (owned.length !== uniqueIds.length) {
    throw new NotFoundError('Échéance non trouvée');
  }
  const leaseIdsOfSelection = new Set(owned.map(row => row.lease_id));
  if (leaseIdsOfSelection.size > 1) {
    throw new BadRequestError('Un paiement en ligne ne peut porter que sur les échéances d’un seul bail.');
  }
  const checkoutLeaseId = owned[0].lease_id;

  const checkout = await startCheckout(tenantId, tenantClientId, checkoutLeaseId, installmentIds, req.user?.userId);
  res.status(201).json({ success: true, data: checkout });
});

export const getOnlinePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, tenantClientId } = requirePortalContext(req);
  await assertRentalOnlinePaymentAllowed(tenantId);
  const { codePaiement } = req.params;

  const checkout = await getCheckoutForPortal(tenantId, tenantClientId, codePaiement);
  res.json({ success: true, data: toOnlineCheckoutDto(checkout) });
});
