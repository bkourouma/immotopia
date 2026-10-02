/**
 * Application de la montee de palier au reglement de la facture d'upgrade
 * (lot 4D). Appelee par `settlePlatformInvoiceTx` (porte unique de reglement,
 * en ligne comme constat manuel), DANS la meme transaction et sous le verrou
 * de ligne de la facture ; rien n'est cru sur parole : ce module ne lit que
 * la base (facture reglee, ligne marquee, abonnement, catalogue).
 *
 * IDEMPOTENT : une facture n'est reglee qu'une fois (`settlePlatformInvoiceTx`
 * rend `created: false` aux rejeux) ; en plus, un abonnement deja sur le pack
 * cible n'est jamais rechange.
 */

import { SubscriptionItemStatus, SubscriptionStatus } from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { addBillingPeriod } from '../../lib/subscription';
import { loadCatalogItem, syncTenantModulesTx } from '../subscription-v2-service';
import { UPGRADE_SOURCE_PACK, UpgradeTarget, readUpgradeTarget } from './constants';

export interface UpgradeApplication {
  /** Vrai : l'abonnement est passe du gratuit au palier cible dans cette transaction. */
  applied: boolean;
  target: UpgradeTarget | null;
  /** Raison quand `applied` est faux alors que la facture est une facture d'upgrade. */
  reason?: 'ALREADY_ON_TARGET' | 'NOT_ELIGIBLE';
  periodEnd?: Date;
}

const NOT_AN_UPGRADE: UpgradeApplication = { applied: false, target: null };

/**
 * Si `invoice` est une facture d'upgrade que l'on vient de regler, fait
 * passer l'abonnement de `PARTICULIER_GRATUIT` a la cible : element gratuit
 * termine, element payant au prix FIGE de la ligne d'upgrade de la facture, abonnement
 * `ACTIVE` en cycle mensuel dont la periode demarre a `now` (date du
 * paiement) et dont le premier mois est deja facture (`billedThrough`).
 * Sans effet pour toute autre facture.
 */
export async function applyUpgradeForInvoiceTx(
  tx: PrismaTransactionClient,
  input: { tenantId: string; invoiceId: string; actorUserId: string | null; now: Date }
): Promise<UpgradeApplication> {
  const { tenantId, invoiceId, actorUserId, now } = input;

  const packLines = await tx.invoiceLine.findMany({
    where: { invoiceId, tenantId, kind: 'PACK' },
    select: { id: true, metadata: true, unitPrice: true }
  });
  const upgradeLine = packLines.find(l => readUpgradeTarget(l.metadata) !== null);
  const target = upgradeLine ? readUpgradeTarget(upgradeLine.metadata) : null;
  if (!upgradeLine || !target) return NOT_AN_UPGRADE;

  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, tenantId, kind: 'PLATFORM' },
    select: { subscriptionId: true }
  });
  const subscription = await tx.subscription.findUnique({ where: { tenantId } });
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { type: true } });
  if (
    !invoice ||
    !subscription ||
    tenant?.type !== 'PARTICULIER' ||
    invoice.subscriptionId !== subscription.id ||
    subscription.status !== SubscriptionStatus.ACTIVE
  ) {
    // Argent encaissé sans changement de palier : à traiter par le support (erreur, pas avertissement).
    logger.error('applyUpgradeForInvoiceTx: abonnement non éligible, changement de pack non appliqué', {
      tenantId,
      invoiceId,
      target
    });
    return { applied: false, target, reason: 'NOT_ELIGIBLE' };
  }

  // Verrou de l'abonnement : un changement de pack concurrent attend.
  await tx.$queryRaw`SELECT id FROM subscriptions WHERE id = ${subscription.id} AND tenant_id = ${tenantId} FOR UPDATE`;

  const packItems = await tx.subscriptionItem.findMany({
    where: {
      tenantId,
      subscriptionId: subscription.id,
      status: { not: SubscriptionItemStatus.ENDED },
      endsAt: null,
      catalogItem: { kind: 'PACK' }
    },
    include: { catalogItem: { select: { code: true } } }
  });
  if (packItems.some(i => i.catalogItem.code === target)) {
    logger.error('applyUpgradeForInvoiceTx: abonnement déjà sur le palier cible, facture encaissée sans effet', {
      tenantId,
      invoiceId,
      target
    });
    return { applied: false, target, reason: 'ALREADY_ON_TARGET' };
  }
  const free = packItems.filter(i => i.catalogItem.code === UPGRADE_SOURCE_PACK);
  if (free.length === 0 || packItems.length !== free.length) {
    logger.error("applyUpgradeForInvoiceTx: le pack gratuit n'est pas le seul pack, changement non appliqué", {
      tenantId,
      invoiceId,
      target
    });
    return { applied: false, target, reason: 'NOT_ELIGIBLE' };
  }

  const catalog = await loadCatalogItem(tx, target);
  const periodEnd = addBillingPeriod(now, 'MONTHLY');

  for (const item of free) {
    // eslint-disable-next-line no-await-in-loop -- un seul element gratuit en pratique.
    await tx.subscriptionItem.update({
      where: { id: item.id, tenantId },
      data: {
        status: SubscriptionItemStatus.ENDED,
        endsAt: now,
        endReason: 'UPGRADE',
        endedByUserId: actorUserId
      }
    });
  }
  const created = await tx.subscriptionItem.create({
    data: {
      subscriptionId: subscription.id,
      tenantId,
      catalogItemId: catalog.id,
      quantity: 1,
      // Prix FIGÉ sur celui de la facture réglée (ligne d'upgrade), jamais celui du
      // catalogue à l'instant du règlement : le client paie ce qu'on lui a facturé.
      unitMonthlyPrice: upgradeLine.unitPrice,
      status: SubscriptionItemStatus.ACTIVE,
      startsAt: now,
      replacesItemId: free[0].id,
      addedByUserId: actorUserId,
      // Le premier mois est celui de la facture qui vient d'etre reglee.
      billedThrough: periodEnd
    }
  });
  await tx.subscription.update({
    where: { id: subscription.id, tenantId },
    data: {
      billingCycle: 'MONTHLY',
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      nextBillingAt: periodEnd,
      pastDueAt: null
    }
  });
  // La facture reglee couvre exactement la periode qui demarre au paiement.
  await tx.invoice.update({
    where: { id: invoiceId, tenantId },
    data: { periodStart: now, periodEnd }
  });
  await tx.invoiceLine.updateMany({
    where: { invoiceId, tenantId, kind: 'PACK' },
    data: { periodStart: now, periodEnd, subscriptionItemId: created.id }
  });
  await syncTenantModulesTx(tx, tenantId, { now, actorUserId });

  return { applied: true, target, periodEnd };
}
