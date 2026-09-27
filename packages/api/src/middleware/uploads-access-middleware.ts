import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { verifyToken } from '../utils/jwt-utils';
import { userIsTenantStaff } from '../utils/tenant-access';

/**
 * Access control for the /uploads static mount.
 *
 * The uploads tree mixes public marketing material with private tenant data
 * (lease documents, maintenance attachments, tenant payment proofs, penalty
 * justifications, syndicate documents). Serving all of it as anonymous static
 * files exposes those documents to anyone who can guess a URL.
 *
 * This middleware runs before express.static and:
 *   - lets genuinely public assets through unchanged;
 *   - requires, for every private file still served here, an authenticated
 *     member of the owning agency's staff (`userIsTenantStaff`): these files
 *     are only opened by agency screens, and a portal client must not open
 *     another client's file by its URL;
 *   - denies anything it cannot classify (fail closed).
 *
 * Layout handled:
 *   properties/<propertyId>/<file>              public  (listing photos/videos, agency logos)
 *   properties/<propertyId>/documents/<file>    staff   (property.tenantId)
 *   whatsapp/**                                 public  (fetched by the WhatsApp provider)
 *   maintenance/**                              DENIED  (never static: served only by the
 *                                                        authenticated routes of
 *                                                        lib/maintenance/attachment-files.ts,
 *                                                        checked ticket by ticket)
 *   portal/payments/<tenantId>/<file>           staff   (payment proofs, validated by the agency)
 *   rental/penalties/<penaltyId>/<file>         staff   (penalty.tenant_id)
 *   syndics/**                                  DENIED  (never static: served only by the
 *                                                        authenticated routes of
 *                                                        lib/syndics/document-files.ts)
 *
 * Every other root is denied too. Private files with a root of their own and
 * a dedicated download route (lease inspections, platform invoice payment
 * proofs...) are therefore never reachable here — the same treatment
 * `syndics/` and `maintenance/` now get.
 */

type Classification =
  | { kind: 'public' }
  | { kind: 'tenant'; tenantId: string }
  | { kind: 'property'; propertyId: string }
  | { kind: 'penalty'; penaltyId: string }
  | { kind: 'deny' };

function classify(segments: string[]): Classification {
  const [root, ...rest] = segments;

  switch (root) {
    case 'properties': {
      // properties/<propertyId>/documents/... is private, the rest is public media
      if (rest.length >= 2 && rest[1] === 'documents') {
        return { kind: 'property', propertyId: rest[0] };
      }
      return rest.length >= 1 ? { kind: 'public' } : { kind: 'deny' };
    }

    // Broadcast images are fetched by the WhatsApp provider over the public
    // internet: they must stay reachable without a session.
    case 'whatsapp':
      return { kind: 'public' };

    // Pieces jointes de maintenance : jamais en statique. Cette garde ne
    // savait verifier que l'agence ; un locataire ouvrait donc la photo du
    // ticket d'un autre locataire, ou d'un proprietaire, en connaissant
    // l'URL. Elles sortent par les routes authentifiees de
    // lib/maintenance/attachment-files.ts, qui controlent le ticket.
    case 'maintenance':
      return { kind: 'deny' };

    case 'portal':
      return rest.length >= 2 && rest[0] === 'payments'
        ? { kind: 'tenant', tenantId: rest[1] }
        : { kind: 'deny' };

    case 'rental':
      return rest.length >= 2 && rest[0] === 'penalties'
        ? { kind: 'penalty', penaltyId: rest[1] }
        : { kind: 'deny' };

    // Documents de copropriete : jamais en statique (AGENTS.md, « les
    // documents prives ne sont jamais servis en statique »). Refuses comme
    // un chemin inconnu, sans meme verifier la session.
    case 'syndics':
      return { kind: 'deny' };

    default:
      return { kind: 'deny' };
  }
}

/** Resolve the owning tenant for a private resource, or null when unknown. */
async function resolveTenantId(classification: Classification): Promise<string | null> {
  switch (classification.kind) {
    case 'tenant':
      return classification.tenantId;

    case 'property': {
      const property = await prisma.property.findUnique({
        where: { id: classification.propertyId },
        select: { tenantId: true }
      });
      return property?.tenantId ?? null;
    }

    case 'penalty': {
      const penalty = await prisma.rentalPenalty.findUnique({
        where: { id: classification.penaltyId },
        select: { tenant_id: true }
      });
      return penalty?.tenant_id ?? null;
    }

    default:
      return null;
  }
}

/** Read the access token from the cookie or the Authorization header. */
function extractToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.accessToken;
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = req.headers.authorization;
  return authHeader ? authHeader.split(' ')[1] : undefined;
}

function deny(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, message });
}

export async function uploadsAccessGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Only GET/HEAD reach the static mount; anything else is not ours to serve.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      deny(res, 405, 'Méthode non autorisée.');
      return;
    }

    const decodedPath = decodeURIComponent(req.path);

    // Defence in depth: express.static normalises paths, but reject traversal
    // attempts before we use the segments for authorisation decisions.
    if (decodedPath.includes('..') || decodedPath.includes('\0')) {
      deny(res, 400, 'Chemin de fichier invalide.');
      return;
    }

    const segments = decodedPath.split('/').filter(Boolean);
    if (segments.length === 0) {
      deny(res, 404, 'Fichier introuvable.');
      return;
    }

    const classification = classify(segments);

    if (classification.kind === 'public') {
      next();
      return;
    }

    if (classification.kind === 'deny') {
      deny(res, 404, 'Fichier introuvable.');
      return;
    }

    // Private resource from here on: authentication is required.
    const token = extractToken(req);
    const user = token ? verifyToken(token) : null;

    if (!user?.userId) {
      deny(res, 401, 'Authentification requise pour accéder à ce document.');
      return;
    }

    const tenantId = await resolveTenantId(classification);

    if (!tenantId) {
      deny(res, 404, 'Fichier introuvable.');
      return;
    }

    // Tout fichier prive encore servi ici n'est ouvert que par des ecrans
    // d'agence : reserve au personnel. Un client de portail n'y a jamais
    // acces par l'URL.
    const allowed = await userIsTenantStaff(user.userId, tenantId, user.globalRole);

    if (!allowed) {
      logger.warn('Blocked cross-tenant upload access', {
        userId: user.userId,
        tenantId,
        path: decodedPath
      });
      deny(res, 403, "Vous n'avez pas accès à ce document.");
      return;
    }

    next();
  } catch (error) {
    logger.error('Uploads access check failed', { error, path: req.path });
    deny(res, 500, "Erreur lors de la vérification des accès au fichier.");
  }
}
