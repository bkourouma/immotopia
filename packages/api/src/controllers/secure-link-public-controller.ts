import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-middleware';
import { getOwnerMonthlyReportByToken } from '../lib/patrimoine/owner-monthly-report';
import { invalidSecureLinkError, TOKEN_MAX_LENGTH } from '../lib/secure-links';

/**
 * Points d'entrée publics des liens sécurisés (lot A3). Le jeton est dans le
 * CORPS d'un POST, jamais dans l'URL : il n'atterrit dans aucun journal d'accès.
 */

/** Pose les en-têtes qui empêchent toute mise en cache ou indexation, succès comme échec. */
export function secureLinkNoStoreHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

const bodySchema = z.object({ token: z.string().min(1).max(TOKEN_MAX_LENGTH) });

export const ownerMonthlyReportPublicHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  // Corps invalide : même refus que jeton inconnu, aucun indice distinctif.
  if (!parsed.success) throw invalidSecureLinkError();

  const data = await getOwnerMonthlyReportByToken(parsed.data.token, {
    ip: req.ip || undefined,
    userAgent: req.get('user-agent') || undefined
  });

  res.status(200).json({ success: true, data });
});
