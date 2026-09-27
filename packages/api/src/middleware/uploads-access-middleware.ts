import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Access control for the /uploads static mount.
 *
 * The uploads tree mixes public marketing material with private agency data.
 * AGENTS.md: private documents are NEVER served as static files. This guard
 * runs before express.static and lets through only what is public by nature;
 * everything else answers 404, whatever the session — the same answer as a
 * file that does not exist.
 *
 * Public (exact shapes):
 *   properties/<propertyId>/<file>            listing photos and videos
 *   properties/agency-logos/<tenantId>/<file> agency logos
 *   whatsapp/**                               fetched by the WhatsApp provider
 *
 * Private, never static — each file leaves only through an authenticated
 * route that checks the caller's right on the object it belongs to:
 *   properties/<propertyId>/documents/**  lib/properties/document-files.ts
 *   maintenance/**                        lib/maintenance/attachment-files.ts
 *   portal/payments/**                    lib/rental/proof-files.ts
 *   rental/penalties/**                   lib/rental/proof-files.ts
 *   syndics/**                            lib/syndics/document-files.ts
 *   lease-inspections/**, anything else   their own routes, or nothing
 *
 * Until now the private folders were served to "a member of the agency's
 * staff" (and, for maintenance, to any portal client of the agency): the
 * static guard could only check the agency, never the ticket, the module
 * permission or the object. That is why they moved behind routes.
 */

/**
 * Exact shapes only (an allow-list, not a deny-list): on a case-insensitive
 * file system that also ignores trailing dots — Windows — `DOCUMENTS/` or
 * `documents./` would reach the private folder through a deny-list.
 */
function isPublic(segments: string[]): boolean {
  const [root, ...rest] = segments;

  switch (root) {
    case 'properties':
      // properties/<propertyId>/<file> — listing media, files only: the
      // private documents live one level deeper, in <propertyId>/documents/.
      if (rest.length === 2) return true;
      // properties/agency-logos/<tenantId>/<file>
      return rest.length === 3 && rest[0] === 'agency-logos';

    // Broadcast images are fetched by the WhatsApp provider over the public
    // internet: they must stay reachable without a session.
    case 'whatsapp':
      return rest.length >= 1;

    default:
      return false;
  }
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
    // attempts before we use the segments for the decision.
    if (decodedPath.includes('..') || decodedPath.includes('\0')) {
      deny(res, 400, 'Chemin de fichier invalide.');
      return;
    }

    const segments = decodedPath.split('/').filter(Boolean);
    if (segments.length > 0 && isPublic(segments)) {
      next();
      return;
    }

    deny(res, 404, 'Fichier introuvable.');
  } catch (error) {
    logger.error('Uploads access check failed', { error, path: req.path });
    deny(res, 500, 'Erreur lors de la vérification des accès au fichier.');
  }
}
