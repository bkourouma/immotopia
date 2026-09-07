import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { verifyToken } from '../utils/jwt-utils';
import { userHasTenantAccess } from '../utils/tenant-access';

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
 *   - requires an authenticated user with access to the owning tenant for
 *     everything else;
 *   - denies anything it cannot classify (fail closed).
 *
 * Layout handled:
 *   properties/<propertyId>/<file>              public  (listing photos/videos)
 *   properties/<propertyId>/documents/<file>    private (property.tenantId)
 *   whatsapp/**                                 public  (fetched by the WhatsApp provider)
 *   maintenance/<tenantId>/<ticketId>/<file>    private
 *   portal/payments/<tenantId>/<file>           private
 *   rental/penalties/<penaltyId>/<file>         private (penalty.tenant_id)
 *   syndics/<syndicateId>/documents/<file>      private (syndicate.tenantId)
 */

type Classification =
  | { kind: 'public' }
  | { kind: 'tenant'; tenantId: string }
  | { kind: 'property'; propertyId: string }
  | { kind: 'penalty'; penaltyId: string }
  | { kind: 'syndicate'; syndicateId: string }
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

    case 'maintenance':
      return rest.length >= 1 ? { kind: 'tenant', tenantId: rest[0] } : { kind: 'deny' };

    case 'portal':
      return rest.length >= 2 && rest[0] === 'payments' ? { kind: 'tenant', tenantId: rest[1] } : { kind: 'deny' };

    case 'rental':
      return rest.length >= 2 && rest[0] === 'penalties' ? { kind: 'penalty', penaltyId: rest[1] } : { kind: 'deny' };

    case 'syndics':
      return rest.length >= 1 ? { kind: 'syndicate', syndicateId: rest[0] } : { kind: 'deny' };

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

    case 'syndicate': {
      const syndicate = await prisma.syndicate.findUnique({
        where: { id: classification.syndicateId },
        select: { tenantId: true }
      });
      return syndicate?.tenantId ?? null;
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

    const allowed = await userHasTenantAccess(user.userId, tenantId, user.globalRole);

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
