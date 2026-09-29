/**
 * Demarrage de la montee de palier de l'espace particulier (lot 4D) :
 * facture du premier mois du pack cible, puis paiement PaySecureHub via
 * `startInvoiceCheckout` (reprise, montant entier, redemande du statut au
 * fournisseur : rien n'est duplique ici).
 *
 * Le changement de pack n'a lieu QU'AU reglement (`apply-upgrade.ts`, appele
 * par `settlePlatformInvoiceTx`) : ce service ne modifie ni l'abonnement ni
 * les droits.
 *
 * Contrat : specs/026-particuliers-libre-service/plan.md (« 4D »).
 */

import { SubscriptionItemStatus, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../utils/database';
import { AppError, ConflictError, ErrorCode, ForbiddenError, NotFoundError } from '../../middleware/error-middleware';
import { logAuditEvent } from '../audit-service';
import { getPlatformPaymentAvailability, startInvoiceCheckout } from '../platform-payment-service';
import { generateUpgradeInvoiceTx } from '../platform-invoice-service';
import { loadCatalogItem } from '../subscription-v2-service';
import { UPGRADE_AUDIT, UPGRADE_ERROR, UPGRADE_SOURCE_PACK, UpgradeTarget, isUpgradeTarget } from './constants';

export interface StartUpgradeResult {
  invoiceId: string;
  checkoutUrl: string | null;
  code: string;
}

/**
 * `tenantId` vient de l'URL verifiee par `requireTenantAccess`, jamais du corps.
 * Ordre des refus : cible hors liste, tenant non particulier ou pack non
 * gratuit (403), deja sur la cible (409), telephone absent (422), paiements
 * indisponibles (503), paiement deja en cours (409 avec reprise).
 */
export async function startSubscriptionUpgrade(
  tenantId: string,
  target: UpgradeTarget,
  actorUserId: string
): Promise<StartUpgradeResult> {
  if (!isUpgradeTarget(target)) throw new ForbiddenError('Palier cible non proposé.');

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { type: true, contactPhone: true }
  });
  if (!tenant) throw new NotFoundError('Espace introuvable.');
  if (tenant.type !== 'PARTICULIER') {
    throw new ForbiddenError("La montée de palier n'est proposée qu'aux espaces personnels.");
  }

  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription) throw new NotFoundError('Abonnement introuvable.');
  const packs = await prisma.subscriptionItem.findMany({
    where: {
      tenantId,
      subscriptionId: subscription.id,
      status: { not: SubscriptionItemStatus.ENDED },
      endsAt: null,
      catalogItem: { kind: 'PACK' }
    },
    select: { catalogItem: { select: { code: true } } }
  });
  const codes = packs.map(p => p.catalogItem.code);
  if (codes.includes(target)) {
    throw new AppError('Votre espace est déjà sur ce palier.', 409, UPGRADE_ERROR.ALREADY_ON_TARGET);
  }
  if (
    subscription.status !== SubscriptionStatus.ACTIVE ||
    codes.length === 0 ||
    codes.some(code => code !== UPGRADE_SOURCE_PACK)
  ) {
    throw new ForbiddenError("La montée de palier n'est proposée qu'au palier gratuit.");
  }

  if (!tenant.contactPhone || tenant.contactPhone.trim() === '') {
    throw new AppError('Renseignez un numéro de téléphone avant de payer.', 422, UPGRADE_ERROR.PHONE_REQUIRED, [
      { field: 'phone', message: 'Le numéro de téléphone est obligatoire pour payer.' }
    ]);
  }

  if (!getPlatformPaymentAvailability().available) {
    throw new AppError(
      "Le paiement en ligne n'est pas disponible pour le moment.",
      503,
      UPGRADE_ERROR.PAYMENTS_UNAVAILABLE
    );
  }

  const catalog = await loadCatalogItem(prisma, target);
  if (!catalog.isSellable) throw new ConflictError("Ce palier n'est plus commercialisé.");
  const { invoice } = await prisma.$transaction(tx =>
    generateUpgradeInvoiceTx(tx, tenantId, {
      subscriptionId: subscription.id,
      target,
      catalogItemId: catalog.id,
      packName: catalog.name,
      monthlyPrice: catalog.monthlyPrice
    })
  );

  try {
    const checkout = await startInvoiceCheckout(tenantId, invoice.id, actorUserId);
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: UPGRADE_AUDIT.STARTED,
      entityType: 'Invoice',
      entityId: invoice.id,
      payload: { invoiceId: invoice.id, from: UPGRADE_SOURCE_PACK, to: target, codePaiement: checkout.codePaiement }
    });
    return { invoiceId: invoice.id, checkoutUrl: checkout.checkoutUrl, code: checkout.codePaiement };
  } catch (error) {
    // Paiement de moins de 15 min deja en cours : meme donnees de reprise,
    // avec le code du contrat.
    if (error instanceof AppError && error.statusCode === 409 && error.code === ErrorCode.CONFLICT && error.data) {
      throw new AppError(
        'Un paiement est déjà en cours pour cette montée de palier.',
        409,
        UPGRADE_ERROR.PAYMENT_IN_PROGRESS,
        undefined,
        { ...(error.data as Record<string, unknown>), invoiceId: invoice.id }
      );
    }
    throw error;
  }
}
