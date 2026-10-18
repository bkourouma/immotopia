import type { Request, Response } from 'express';
import { z } from 'zod';
import { t } from '../i18n';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import { logAuditEvent } from '../services/audit-service';
import { AuditActionKey } from '../types/audit-types';
import { parseIsoDay } from '../lib/syndics/period';
import {
  getSyndicGatewaySettings,
  getSyndicProviderBalance,
  testSyndicGatewayConnection,
  updateSyndicGatewaySettings,
  updateSyndicGatewaySettingsSchema
} from '../lib/syndics/online-payment/gateway-settings';
import { listSyndicCheckouts } from '../lib/syndics/online-payment/checkout-queries';
import { verifySyndicCheckout } from '../lib/syndics/online-payment/checkout-reconcile';
import { decideSyndicCheckout } from '../lib/syndics/online-payment/checkout-review';
import {
  createChargeCallPaymentLink,
  listChargeCallPaymentLinks,
  revokeChargeCallPaymentLink
} from '../lib/syndics/online-payment/charge-call-link';
import { sendChargeCallPaymentLink } from '../lib/syndics/online-payment/charge-call-link-send';
import {
  GATEWAY_PAYOUT_MAX_AMOUNT,
  listGatewayPayouts,
  recordGatewayPayout
} from '../lib/syndics/online-payment/payout';

/**
 * Paiement mobile des copropriétaires, côté gestionnaire (spec 042, contrat §1).
 * Les gardes (session, agence, permission) sont posées par
 * `routes/syndic-online-payment-routes.ts` ; l'appartenance de la copropriété à
 * l'agence est vérifiée par chaque service (404 sinon).
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError(t('Agence manquante dans la requête.'));
  return tenantId;
}

const syndicIdOf = (req: Request) =>
  assertUuidOrNotFound(req.params.syndicId, t('Copropriété introuvable ou inaccessible.'));

const actorOf = (req: Request): string | null => req.user?.userId ?? null;

// --- 1.1 à 1.4 : configuration, test, solde -------------------------------

export const getGatewaySettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getSyndicGatewaySettings(tenantIdOf(req), syndicIdOf(req)) });
});

export const updateGatewaySettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateSyndicGatewaySettingsSchema.parse(req.body ?? {});
  const data = await updateSyndicGatewaySettings(tenantIdOf(req), syndicIdOf(req), input, actorOf(req));
  res.json({ success: true, data });
});

export const testGatewayConnectionHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await testSyndicGatewayConnection(tenantIdOf(req), syndicIdOf(req)) });
});

export const getProviderBalanceHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getSyndicProviderBalance(tenantIdOf(req), syndicIdOf(req)) });
});

const ONLINE_CHECKOUT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'EXPIRED', 'REVIEW'] as const;

const isoDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value, ctx) => {
    const day = parseIsoDay(value);
    if (!day) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date invalide.' });
      return z.NEVER;
    }
    return day;
  });

// --- 1.5 à 1.7 : suivi, vérification, décision ----------------------------

const isoDayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const checkoutsQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform(value =>
      value
        ? value
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
        : undefined
    )
    .pipe(z.array(z.enum(ONLINE_CHECKOUT_STATUSES)).optional()),
  origin: z.enum(['PORTAL', 'SECURE_LINK']).optional(),
  lotId: z.string().uuid().optional(),
  from: isoDayString.optional(),
  to: isoDayString.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const listCheckoutsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = checkoutsQuerySchema.parse(req.query);
  res.json({ success: true, data: await listSyndicCheckouts(tenantIdOf(req), syndicIdOf(req), query) });
});

const checkoutIdOf = (req: Request) => assertUuidOrNotFound(req.params.checkoutId, t('Paiement en ligne introuvable.'));

export const verifyCheckoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await verifySyndicCheckout(tenantIdOf(req), syndicIdOf(req), checkoutIdOf(req));
  res.json({ success: true, data });
});

const decideBodySchema = z
  .object({
    decision: z.enum(['ACCEPT', 'REJECT']),
    note: z.string().trim().min(1).max(500),
    paidAt: isoDaySchema.optional()
  })
  .strict();

export const decideCheckoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = decideBodySchema.parse(req.body ?? {});
  const actorUserId = actorOf(req);
  if (!actorUserId) throw new BadRequestError(t('Utilisateur manquant dans la requête.'));
  const data = await decideSyndicCheckout({
    tenantId: tenantIdOf(req),
    syndicateId: syndicIdOf(req),
    checkoutId: checkoutIdOf(req),
    decision: body.decision,
    note: body.note,
    paidAt: body.paidAt ?? null,
    actorUserId
  });
  res.json({ success: true, data });
});

// --- 1.8 et 1.9 : reversements ---------------------------------------------

const payoutsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() });

export const listPayoutsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { limit } = payoutsQuerySchema.parse(req.query);
  res.json({ success: true, data: await listGatewayPayouts(tenantIdOf(req), syndicIdOf(req), { limit }) });
});

const payoutBodySchema = z
  .object({
    amount: z.number().positive().max(GATEWAY_PAYOUT_MAX_AMOUNT),
    date: isoDaySchema,
    reference: z.string().trim().min(1).max(120),
    note: z.string().trim().max(250).nullish()
  })
  .strict();

export const recordPayoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = payoutBodySchema.parse(req.body ?? {});
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (body.date.getTime() > today.getTime()) {
    throw new BadRequestError(t('La date du reversement ne peut pas être dans le futur.'), [
      { field: 'date', message: t('La date du reversement ne peut pas être dans le futur.') }
    ]);
  }
  const tenantId = tenantIdOf(req);
  const syndicateId = syndicIdOf(req);
  const actorUserId = actorOf(req);
  const result = await recordGatewayPayout({
    tenantId,
    syndicateId,
    amount: body.amount,
    date: body.date,
    reference: body.reference,
    note: body.note ?? null,
    actorUserId
  });
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SYNDIC_GATEWAY_PAYOUT_RECORDED,
      entityType: 'JournalEntry',
      entityId: result.entryId,
      payload: { syndicateId, reference: result.reference, amount: result.amount, date: result.date }
    });
  }
  res.status(201).json({ success: true, data: result });
});

// --- 1.10 : lien « Payer cet appel » ------------------------------------------

const createPaymentLinkSchema = z
  .object({
    delivery: z.enum(['SEND', 'COPY']),
    ttlDays: z.number().int().min(1).max(30).optional()
  })
  .strict();

const chargeIdOf = (req: Request) => assertUuidOrNotFound(req.params.chargeId, t('Appel de charges introuvable.'));
const linkIdSchema = z.string().min(1).max(64);

/**
 * Le montant, le destinataire et la durée maximale viennent du serveur ; seule la
 * durée (1 à 30 jours, jamais tronquée) peut être demandée. L'URL (porteuse du
 * jeton) n'est renvoyée qu'une fois, à la copie ; ni la liste ni l'envoi ne la
 * renvoient.
 */
export const createChargeCallPaymentLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = tenantIdOf(req);
  const syndicateId = syndicIdOf(req);
  const chargeCallId = chargeIdOf(req);
  const body = createPaymentLinkSchema.parse(req.body ?? {});
  const actorUserId = actorOf(req);

  // La réponse COPY porte l'URL à jeton : jamais en cache (modèle : signature-controller.ts).
  // Posé pour les deux modes de remise : aucune réponse de cette route n'a à être mise en cache.
  res.setHeader('Cache-Control', 'no-store');

  if (body.delivery === 'COPY') {
    const { link, context } = await createChargeCallPaymentLink(tenantId, syndicateId, chargeCallId, actorUserId, {
      ttlDays: body.ttlDays
    });
    res.status(201).json({
      success: true,
      data: {
        linkId: link.id,
        url: link.url,
        expiresAt: link.expiresAt.toISOString(),
        amountDue: context.amountDue,
        currency: context.currency
      }
    });
    return;
  }

  const result = await sendChargeCallPaymentLink(tenantId, syndicateId, chargeCallId, actorUserId, {
    ttlDays: body.ttlDays
  });
  if (!result.sent) {
    res.status(200).json({ success: true, data: { sent: false, reason: result.reason } });
    return;
  }
  res.status(201).json({
    success: true,
    data: {
      sent: true,
      channel: result.channel,
      linkId: result.linkId,
      expiresAt: result.expiresAt,
      amountDue: result.amountDue,
      currency: result.currency
    }
  });
});

export const listChargeCallPaymentLinksHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listChargeCallPaymentLinks(tenantIdOf(req), syndicIdOf(req), chargeIdOf(req));
  res.json({ success: true, data });
});

export const revokeChargeCallPaymentLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const linkId = linkIdSchema.parse(req.params.linkId);
  await revokeChargeCallPaymentLink(
    tenantIdOf(req),
    syndicIdOf(req),
    chargeIdOf(req),
    linkId,
    actorOf(req) ?? 'system'
  );
  res.json({ success: true, data: { revoked: true } });
});
