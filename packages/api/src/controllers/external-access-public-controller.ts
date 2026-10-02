import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-middleware';
import { getExternalAccessDocumentByToken, getExternalAccessViewByToken } from '../lib/external-access';
import { invalidSecureLinkError, TOKEN_MAX_LENGTH } from '../lib/secure-links';

/**
 * Points d'entrée publics de l'accès des tiers de confiance (lot B3). Même
 * gabarit que `secure-link-public-controller.ts` : le jeton est dans le CORPS
 * d'un POST, jamais dans l'URL. Seuls `token` (et `documentRef` pour un
 * téléchargement) sont lus ; aucun identifiant de bien, d'agence ou de
 * document ne vient de l'appelant. Les en-têtes no-store/noindex/no-referrer
 * sont posés avant le handler par `secureLinkNoStoreHeaders` (succès comme refus).
 */

const viewBodySchema = z.object({ token: z.string().min(1).max(TOKEN_MAX_LENGTH) });
const downloadBodySchema = z.object({
  token: z.string().min(1).max(TOKEN_MAX_LENGTH),
  documentRef: z.string().min(1).max(64)
});

/** `encodeURIComponent` laisse passer ' ( ) * : RFC 5987 veut aussi les encoder. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function consultationContext(req: Request) {
  return { ip: req.ip || undefined, userAgent: req.get('user-agent') || undefined };
}

export const externalAccessViewPublicHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = viewBodySchema.safeParse(req.body);
  // Corps invalide : même refus que jeton inconnu, aucun indice distinctif.
  if (!parsed.success) throw invalidSecureLinkError();

  const data = await getExternalAccessViewByToken(parsed.data.token, consultationContext(req));
  res.status(200).json({ success: true, data });
});

export const externalAccessDocumentDownloadPublicHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = downloadBodySchema.safeParse(req.body);
  if (!parsed.success) throw invalidSecureLinkError();

  const file = await getExternalAccessDocumentByToken(
    parsed.data.token,
    parsed.data.documentRef,
    consultationContext(req)
  );

  // En-têtes écrits ici (et non `sendPrivateFile`) : `Cache-Control: no-store` comme
  // toutes les réponses publiques, pièce jointe forcée, aucun sniffing du type.
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeRfc5987(file.fileName)}`);
  res.setHeader('Content-Length', file.buffer.length.toString());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).send(file.buffer);
});
