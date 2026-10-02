import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-middleware';
import {
  getInstallmentPaymentByToken,
  getInstallmentPaymentStatusByCode,
  startInstallmentPaymentByToken
} from '../lib/payment-gateway/installment-payment-link';
import { invalidSecureLinkError, TOKEN_MAX_LENGTH } from '../lib/secure-links';

/**
 * Points d'entrée publics du lien de paiement d'un loyer (spec 039). Le jeton
 * (ou le code de paiement) est dans le CORPS d'un POST, jamais dans l'URL.
 * Seuls `token` / `codePaiement` sont lus : montant, échéance, agence ou URL
 * de retour éventuellement envoyés sont ignorés et n'atteignent pas le service.
 */

const tokenSchema = z.object({ token: z.string().min(1).max(TOKEN_MAX_LENGTH) });
const statusSchema = z.object({ codePaiement: z.string().regex(/^IMT-[A-Za-z0-9]{20}$/) });

function readToken(req: Request): string {
  const parsed = tokenSchema.safeParse(req.body);
  // Corps invalide : même refus que jeton inconnu, aucun indice distinctif.
  if (!parsed.success) throw invalidSecureLinkError();
  return parsed.data.token;
}

function visitor(req: Request) {
  return { ip: req.ip || undefined, userAgent: req.get('user-agent') || undefined };
}

export const installmentPaymentPublicHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getInstallmentPaymentByToken(readToken(req), visitor(req));
  res.status(200).json({ success: true, data });
});

export const installmentPaymentStartHandler = asyncHandler(async (req: Request, res: Response) => {
  const { checkoutUrl } = await startInstallmentPaymentByToken(readToken(req), visitor(req));
  res.status(200).json({ success: true, data: { checkoutUrl } });
});

export const installmentPaymentStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) throw invalidSecureLinkError();
  const data = await getInstallmentPaymentStatusByCode(parsed.data.codePaiement);
  res.status(200).json({ success: true, data });
});
