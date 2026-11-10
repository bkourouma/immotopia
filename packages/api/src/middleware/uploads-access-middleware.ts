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
const PUBLIC_EXTENSION = /\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i;

function isPublic(segments: string[]): boolean {
  // Allow-list d'extensions : un fichier sans extension ou d'un autre type
  // (.html, .svg, .js, .xml…) n'est jamais servi, même dans un dossier public ;
  // sous /uploads il s'exécuterait dans l'origine de l'application.
  const last = segments[segments.length - 1];
  if (!last || !PUBLIC_EXTENSION.test(last)) return false;

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

/**
 * En-têtes des réponses statiques de /uploads (CORS, CORP, Content-Type par
 * extension), plus `sandbox` et `nosniff` : un fichier qui s'afficherait comme
 * une page ne pourrait ni exécuter de script ni être deviné d'un autre type.
 */
export function applyUploadsResponseHeaders(res: Response, filePath: string, frontendUrl: string): void {
  // Credentialed requests cannot use a wildcard origin: scope to the app.
  res.setHeader('Access-Control-Allow-Origin', frontendUrl);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  // Set appropriate content type for images and documents
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
    res.setHeader('Content-Type', 'image/jpeg');
  } else if (filePath.endsWith('.png')) {
    res.setHeader('Content-Type', 'image/png');
  } else if (filePath.endsWith('.webp')) {
    res.setHeader('Content-Type', 'image/webp');
  } else if (filePath.endsWith('.pdf')) {
    res.setHeader('Content-Type', 'application/pdf');
  } else if (filePath.endsWith('.doc')) {
    res.setHeader('Content-Type', 'application/msword');
  } else if (filePath.endsWith('.docx')) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  }
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
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

    // Un pourcentage mal formé (`%E0%A4%A`) est une requête du client, pas une
    // panne : même 404 qu'un fichier absent, sans journal d'erreur.
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(req.path);
    } catch {
      deny(res, 404, 'Fichier introuvable.');
      return;
    }

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
