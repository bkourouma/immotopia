import { Request, Response } from 'express';
import { z } from 'zod';
import { t } from '../i18n';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  createInstallmentPaymentLink,
  listInstallmentPaymentLinks,
  revokeInstallmentPaymentLink
} from '../lib/payment-gateway/installment-payment-link';
import { sendInstallmentPaymentLink } from '../lib/payment-gateway/installment-payment-link-send';

/**
 * Lien de paiement Mobile Money d'un loyer (lot C5, spec 039), côté agence :
 * `/tenants/:tenantId/rental/installments/:installmentId/payment-link(s)`.
 *
 * `tenantId` vient UNIQUEMENT du contexte posé par `requireTenantAccess` ; les
 * identifiants de l'échéance et du lien sont revérifiés contre l'agence par les
 * services (une référence d'une autre agence répond comme une inexistante).
 * Le montant n'est jamais lu de la requête. L'URL (porteuse du jeton) n'est
 * renvoyée qu'une fois, à la copie ; ni la liste ni l'envoi ne la renvoient.
 */

const createPaymentLinkSchema = z
  .object({
    delivery: z.enum(['SEND', 'COPY']),
    ttlDays: z.number().int().min(1).max(30).optional()
  })
  .strict();

const installmentIdSchema = z.string().uuid();
const linkIdSchema = z.string().min(1).max(64);

function resolveTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError(t('TenantId manquant'));
  return tenantId;
}

export const createInstallmentPaymentLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const installmentId = installmentIdSchema.parse(req.params.installmentId);
  const body = createPaymentLinkSchema.parse(req.body ?? {});
  const actorUserId = req.user?.userId ?? null;

  if (body.delivery === 'COPY') {
    const { link, context } = await createInstallmentPaymentLink(tenantId, installmentId, actorUserId, {
      ttlDays: body.ttlDays
    });
    res.status(201).json({
      success: true,
      data: {
        linkId: link.id,
        url: link.url,
        expiresAt: link.expiresAt,
        amountDue: context.amountDue,
        currency: context.currency
      }
    });
    return;
  }

  const result = await sendInstallmentPaymentLink(tenantId, installmentId, actorUserId, { ttlDays: body.ttlDays });
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

export const listInstallmentPaymentLinksHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const installmentId = installmentIdSchema.parse(req.params.installmentId);
  const data = await listInstallmentPaymentLinks(tenantId, installmentId);
  res.json({ success: true, data });
});

export const revokeInstallmentPaymentLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const installmentId = installmentIdSchema.parse(req.params.installmentId);
  const linkId = linkIdSchema.parse(req.params.linkId);
  await revokeInstallmentPaymentLink(tenantId, installmentId, linkId, req.user?.userId ?? 'system');
  res.json({ success: true });
});
