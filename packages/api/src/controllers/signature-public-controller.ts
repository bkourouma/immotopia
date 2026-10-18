import { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { asyncHandler } from '../middleware/error-middleware';
import { invalidSecureLinkError } from '../lib/secure-links';
import {
  declinePublic,
  getPublicExternalLink,
  getPublicSignature,
  getPublicSourceFile,
  sendPublicOtp,
  signPublic,
  verifyPublicOtp
} from '../services/signature-public-service';
import { VIEW_TOKEN_HEADER } from '../lib/signature/view-grant';

/**
 * Points d'entrée PUBLICS de la signature électronique (spec 044, lot S1) :
 * `/api/public/signatures/:token`. Le jeton est dans le chemin (contrat du
 * lien `/signer/:jeton`) ; il est masqué du journal des requêtes
 * (`utils/sensitive-path.ts`). Tout corps ou paramètre invalide répond comme
 * un jeton inconnu : aucun indice distinctif.
 */

const signBodySchema = z
  .object({
    code: z.string().trim().max(20).optional(),
    consent: z.literal(true),
    signature: z.object({ mode: z.enum(['TYPED', 'DRAWN']), value: z.string().min(1).max(300_000) }).strict()
  })
  .strict();

const verifyBodySchema = z.object({ code: z.string().trim().max(20) }).strict();

const declineBodySchema = z.object({ reason: z.string().max(1000).optional() }).strict();

/** Jeton de consultation : en-tête seulement (jamais l'URL ni le corps) ; jamais journalisé. */
function viewTokenOf(req: Request): string | undefined {
  const value = req.get(VIEW_TOKEN_HEADER);
  return value ? value : undefined;
}

function metaOf(req: Request) {
  return { ip: req.ip || undefined, userAgent: req.get('user-agent') || undefined };
}

function tokenOf(req: Request): string {
  const token = req.params.token;
  if (typeof token !== 'string') throw invalidSecureLinkError();
  return token;
}

export const getPublicSignatureHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPublicSignature(tokenOf(req));
  res.json({ success: true, data });
});

export const getPublicSignatureFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = await getPublicSourceFile(tokenOf(req), viewTokenOf(req));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
  res.setHeader('Content-Length', file.buffer.length.toString());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Le PDF s'affiche dans la page de signature (autre origine en développement) :
  // seul le site de l'application peut l'encadrer.
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${env.FRONTEND_URL}`);
  res.send(file.buffer);
});

export const sendPublicOtpHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await sendPublicOtp(tokenOf(req));
  res.json({ success: true, data });
});

export const signPublicHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = signBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    // Champ manquant ou consentement absent : refus de validation lisible, sans révéler le jeton.
    throw parsed.error;
  }
  const data = await signPublic(
    tokenOf(req),
    parsed.data as Parameters<typeof signPublic>[1],
    metaOf(req),
    viewTokenOf(req)
  );
  res.json({ success: true, data });
});

export const verifyPublicOtpHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = verifyBodySchema.safeParse(req.body ?? {});
  // Corps invalide : même réponse qu'un jeton inconnu, aucun indice.
  if (!parsed.success) throw invalidSecureLinkError();
  const data = await verifyPublicOtp(tokenOf(req), parsed.data.code);
  res.json({ success: true, data });
});

export const getPublicExternalLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPublicExternalLink(tokenOf(req), viewTokenOf(req));
  // L'URL du prestataire est un secret à courte vie : jamais en cache.
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data });
});

export const declinePublicHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = declineBodySchema.parse(req.body ?? {});
  const data = await declinePublic(tokenOf(req), body.reason, viewTokenOf(req));
  res.json({ success: true, data });
});
