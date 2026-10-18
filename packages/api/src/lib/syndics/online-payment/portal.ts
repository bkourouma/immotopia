import { z } from 'zod';
import { prisma } from '../../../utils/database';
import { t } from '../../../i18n';
import { NotFoundError } from '../../../middleware/error-middleware';
import { isSyndicCodePaiement } from '../../payment-gateway/codes';
import { loadSyndicates, ownedChargeCallsWhere, scopeOrThrow, type CoOwnerPortalScope } from '../coowner-portal';
import { lotBounds } from '../declared-payment/declaration-queries';
import { assertSyndicOnlinePaymentAllowed } from './feature-gate';
import { getSyndicOnlineAvailabilities } from './gateway-config';
import { MAX_CHARGE_CALLS_PER_CHECKOUT, startSyndicCheckout } from './checkout-start';
import { refreshSyndicCheckout } from './checkout-reconcile';
import { toCoOwnerCheckout } from './checkout-queries';
import { ONLINE_PAYMENT_CHANNELS } from './types';
import type {
  CoOwnerOnlineCheckout,
  FeesPaidBy,
  GatewayMode,
  OnlinePaymentChannel,
  OnlineUnavailableReason
} from './types';

/**
 * Paiement en ligne des charges, côté portail copropriétaire (spec 042,
 * contracts §2). Aucun identifiant d'agence, de copropriétaire, de contact ou
 * de montant n'est lu d'une requête : l'agence, le lot et le payeur viennent du
 * périmètre calculé par la garde du portail. Un lot, un appel ou un code hors
 * de ce périmètre répond comme un objet inexistant (404).
 */

/** Corps de `POST /paiements-en-ligne` : `.strict()`, aucun montant. */
export const startCoOwnerOnlinePaymentSchema = z
  .object({
    lotId: z.string().uuid(),
    chargeCallIds: z.array(z.string().uuid()).min(1).max(MAX_CHARGE_CALLS_PER_CHECKOUT)
  })
  .strict()
  .refine(body => new Set(body.chargeCallIds).size === body.chargeCallIds.length, {
    message: 'Les appels sélectionnés doivent être distincts.',
    path: ['chargeCallIds']
  });

export type StartCoOwnerOnlinePaymentBody = z.infer<typeof startCoOwnerOnlinePaymentSchema>;

export interface CoOwnerOnlinePaymentAvailability {
  syndicates: Array<{
    syndicateId: string;
    name: string;
    available: boolean;
    unavailableReason: OnlineUnavailableReason | null;
    mode: GatewayMode | null;
    simulated: boolean;
    feesPaidBy: FeesPaidBy;
  }>;
  paymentMethods: OnlinePaymentChannel[];
}

/** Une entrée par copropriété du périmètre (contracts §2.1). Un droit refusé = `available:false`. */
export async function getCoOwnerAvailability(scope: CoOwnerPortalScope): Promise<CoOwnerOnlinePaymentAvailability> {
  const [availabilities, syndicates] = await Promise.all([
    getSyndicOnlineAvailabilities(scope.tenantId, scope.syndicateIds),
    loadSyndicates(scope)
  ]);
  return {
    syndicates: scope.syndicateIds.flatMap(syndicateId => {
      const availability = availabilities.get(syndicateId);
      const syndicate = syndicates.get(syndicateId);
      if (!availability || !syndicate) return [];
      return [
        {
          syndicateId,
          name: syndicate.name,
          available: availability.available,
          unavailableReason: availability.unavailableReason,
          mode: availability.mode,
          simulated: availability.simulated,
          feesPaidBy: availability.feesPaidBy
        }
      ];
    }),
    paymentMethods: [...ONLINE_PAYMENT_CHANNELS]
  };
}

/** `checkoutUrl` n'est livré qu'au compte portail qui a lancé le paiement. */
async function toPortalCheckout(
  row: Parameters<typeof toCoOwnerCheckout>[0],
  tenantClientId: string,
  reused: boolean
): Promise<CoOwnerOnlineCheckout> {
  const dto = await toCoOwnerCheckout(row, { reused });
  return row.origin === 'PORTAL' && row.tenantClientId === tenantClientId ? dto : { ...dto, checkoutUrl: null };
}

/**
 * Démarre (ou reprend) le paiement d'appels d'UN lot du périmètre. Le droit
 * SYNDIC d'abord (403), puis le lot et chaque appel contre `scope` /
 * `ownedChargeCallsWhere` (appel antérieur à l'acquisition = introuvable, seulement
 * s'il y a eu un autre propriétaire avant), puis
 * le moteur, qui revérifie configuration, montant et chevauchements.
 */
export async function startCoOwnerCheckout(
  scope: CoOwnerPortalScope,
  tenantClientId: string,
  body: StartCoOwnerOnlinePaymentBody
): Promise<{ checkout: CoOwnerOnlineCheckout; reused: boolean }> {
  await assertSyndicOnlinePaymentAllowed(scope.tenantId);

  const lot = scopeOrThrow(scope, body.lotId);
  const ids = Array.from(new Set(body.chargeCallIds));
  const calls = await prisma.chargeCall.findMany({
    where: { AND: [ownedChargeCallsWhere(scope, [lot.lotId]), { id: { in: ids }, lotId: lot.lotId }] },
    select: { id: true }
  });
  if (calls.length !== ids.length) throw new NotFoundError(t('Appel de charges introuvable.'));

  const { checkout, reused } = await startSyndicCheckout({
    tenantId: scope.tenantId,
    syndicateId: lot.syndicateId,
    lotId: lot.lotId,
    chargeCallIds: ids,
    origin: 'PORTAL',
    tenantClientId,
    payerContactId: lot.contactId,
    visibleSinceByLot: lotBounds(scope)
  });
  return { checkout: await toPortalCheckout(checkout, tenantClientId, reused), reused };
}

/**
 * Statut d'un paiement du périmètre (contracts §2.4). Au plus une vérification
 * auprès du fournisseur par fenêtre de 10 s ; une erreur fournisseur est avalée.
 * Pas de contrôle du droit SYNDIC : un paiement déjà lancé se rapproche toujours.
 */
export async function getCoOwnerCheckout(
  scope: CoOwnerPortalScope,
  tenantClientId: string,
  codePaiement: string
): Promise<CoOwnerOnlineCheckout> {
  const notFound = () => new NotFoundError(t('Paiement en ligne introuvable.'));
  if (!isSyndicCodePaiement(codePaiement)) throw notFound();

  const row = await prisma.syndicOnlineCheckout.findFirst({
    where: { tenantId: scope.tenantId, codePaiement, lotId: { in: scope.lotIds } }
  });
  if (!row) throw notFound();
  const lot = scope.lots.find(candidate => candidate.lotId === row.lotId);
  // Un paiement lancé avant l'acquisition du lot est celui de l'ancien propriétaire, mais seulement s'il y en a eu
  // un (`visibleSince` nul : aucune borne, tout l'historique du lot est visible).
  if (
    !lot ||
    lot.syndicateId !== row.syndicateId ||
    (lot.visibleSince !== null && row.createdAt.getTime() < lot.visibleSince.getTime())
  ) {
    throw notFound();
  }

  const fresh = await refreshSyndicCheckout(row);
  return toPortalCheckout(fresh, tenantClientId, false);
}
