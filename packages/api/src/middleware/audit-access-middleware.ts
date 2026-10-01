import { NextFunction, Request, Response } from 'express';
import { logAuditEvent } from '../services/audit-service';
import { AuditActionKey, AuditLogEntry } from '../types/audit-types';
import { getRequestContext, RequestContextData, runWithRequestContext } from '../utils/request-context';
import { logger } from '../utils/logger';

/**
 * Événements d'accès du journal d'audit (ADR-006, phase 3), posés à partir de
 * la RÉPONSE plutôt que route par route :
 *
 *   - **refus de droit** (403) → `ACCESS_DENIED`, ou `TENANT_ACCESS_DENIED`
 *     quand l'utilisateur vise l'URL d'une agence dont il n'est pas membre ;
 *   - **fichier ou export servi** (200 avec un PDF, un Word, un CSV, un classeur,
 *     une archive, ou un `Content-Disposition: attachment`) →
 *     `DOCUMENT_DOWNLOADED` ou `DATA_EXPORTED`.
 *
 * Un seul point d'observation couvre ainsi des dizaines de routes (dont les
 * portails) et celles qu'on ajoutera, sans que chaque contrôleur ait à y penser.
 * Monté une fois, tôt (après `requestContextMiddleware`) : le contexte de
 * requête est capturé à ce moment, puis rempli par `authenticate` et les
 * middlewares d'agence ; il est relu à la fin de la réponse.
 */

/** Codes 403 qui sont de la politique commerciale, pas un refus de droit. */
const BUSINESS_403_CODES = new Set([
  'TENANT_SUSPENDED',
  'SUBSCRIPTION_READ_ONLY',
  'MODULE_NOT_INCLUDED',
  'MODULE_READ_ONLY',
  'QUOTA_EXCEEDED',
  'OWN_ASSETS_ONLY'
]);

/** Déjà audités par leurs propres événements (`TENANT_DATA_EXPORT_DOWNLOADED`, `AUDIT_EXPORTED`). */
const ALREADY_AUDITED_PATHS = /\/data-exports(\/|$)|\/admin\/audit\/export$/;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const FILE_CONTENT_TYPE = /pdf|csv|spreadsheetml|ms-excel|zip|wordprocessingml|msword|octet-stream/i;
const TABULAR_CONTENT_TYPE = /csv|spreadsheetml|ms-excel|zip/i;

const MAX_TEXT = 200;

// Anti-inondation des refus : un utilisateur qui rejoue une route interdite en
// boucle ne remplit pas le journal. Même refus = une ligne par minute ; et au
// plus DENIAL_USER_LIMIT refus tracés par minute et par utilisateur.
const DENIAL_WINDOW_MS = 60_000;
const DENIAL_USER_LIMIT = 30;
const DENIAL_MAP_MAX = 5000;
const recentDenials = new Map<string, number>();
const userDenialCounts = new Map<string, { windowStart: number; count: number }>();

/** Pour les tests. */
export function resetAuditAccessState(): void {
  recentDenials.clear();
  userDenialCounts.clear();
}

function shouldRecordDenial(userId: string, signature: string, now: number): boolean {
  const seenAt = recentDenials.get(signature);
  if (seenAt !== undefined && now - seenAt < DENIAL_WINDOW_MS) {
    return false;
  }

  const counter = userDenialCounts.get(userId);
  if (!counter || now - counter.windowStart >= DENIAL_WINDOW_MS) {
    userDenialCounts.set(userId, { windowStart: now, count: 1 });
  } else if (counter.count >= DENIAL_USER_LIMIT) {
    return false;
  } else {
    counter.count += 1;
  }

  if (recentDenials.size >= DENIAL_MAP_MAX) {
    for (const [key, at] of recentDenials) {
      if (now - at >= DENIAL_WINDOW_MS) recentDenials.delete(key);
    }
    if (recentDenials.size >= DENIAL_MAP_MAX) recentDenials.clear();
  }
  recentDenials.set(signature, now);
  return true;
}

/** `/api/tenants/<uuid>/rental/documents/<uuid>/pdf` → `/api/tenants/:id/rental/documents/:id/pdf`. */
export function normalizeAuditPath(originalUrl: string): string {
  return originalUrl.split('?')[0].replace(UUID, ':id').slice(0, MAX_TEXT);
}

/** Dernier identifiant de l'URL qui n'est pas l'agence (l'objet visé), sinon le chemin normalisé. */
function targetOf(originalUrl: string, tenantId: string | undefined, fallback: string): string {
  const ids = (originalUrl.split('?')[0].match(UUID) ?? []).filter(id => id !== tenantId);
  return ids.length > 0 ? ids[ids.length - 1] : fallback;
}

function summarizeDenial(body: unknown): { code?: string; message?: string } {
  if (!body || typeof body !== 'object') return {};
  const { code, message } = body as { code?: unknown; message?: unknown };
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message.slice(0, MAX_TEXT) : undefined
  };
}

function denialEntry(
  req: Request,
  ctx: RequestContextData,
  body: { code?: string; message?: string }
): AuditLogEntry | null {
  const actor = ctx.actor;
  if (!actor?.userId) return null;
  if (body.code && BUSINESS_403_CODES.has(body.code)) return null;

  const path = normalizeAuditPath(req.originalUrl);
  const permission = /^Permission denied: (\w+)/.exec(body.message ?? '')?.[1];
  const urlTenantId = (req.originalUrl.match(/\/tenants?\/([0-9a-f-]{36})/i) ?? [])[1];

  const payload = { method: req.method, path, ...(permission ? { permission } : {}) };
  const base = { entityType: 'Route', outcome: 'DENIED' as const };

  // Un étranger qui vise l'URL d'une agence : jamais rattaché à cette agence
  // (la visibilité TENANT dévoilerait son identité à l'agence, et un identifiant
  // inventé ne doit pas polluer la table d'une agence inexistante).
  if (!actor.tenantId && urlTenantId) {
    return {
      ...base,
      actionKey: AuditActionKey.TENANT_ACCESS_DENIED,
      tenantId: null,
      entityId: urlTenantId,
      payload: { ...payload, targetTenantId: urlTenantId }
    };
  }
  return { ...base, actionKey: AuditActionKey.ACCESS_DENIED, entityId: permission ?? path, payload };
}

function filenameOf(disposition: string | undefined): string | undefined {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '');
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]).slice(0, MAX_TEXT);
  } catch {
    return match[1].slice(0, MAX_TEXT);
  }
}

function downloadEntry(req: Request, res: Response, ctx: RequestContextData): AuditLogEntry | null {
  if (!ctx.actor?.userId) return null;
  const path = normalizeAuditPath(req.originalUrl);
  if (ALREADY_AUDITED_PATHS.test(path)) return null;

  const contentType = String(res.getHeader('content-type') ?? '');
  const disposition = res.getHeader('content-disposition');
  const dispositionText = typeof disposition === 'string' ? disposition : undefined;
  const isFile = /^\s*attachment/i.test(dispositionText ?? '') || FILE_CONTENT_TYPE.test(contentType);
  if (!isFile) return null;

  return {
    actionKey: TABULAR_CONTENT_TYPE.test(contentType)
      ? AuditActionKey.DATA_EXPORTED
      : AuditActionKey.DOCUMENT_DOWNLOADED,
    entityType: 'File',
    entityId: targetOf(req.originalUrl, ctx.actor.tenantId, path),
    payload: {
      method: req.method,
      path,
      contentType: contentType.split(';')[0].slice(0, 100),
      ...(filenameOf(dispositionText) ? { filename: filenameOf(dispositionText) } : {})
    }
  };
}

function record(
  req: Request,
  res: Response,
  ctx: RequestContextData,
  denialBody: { code?: string; message?: string }
): void {
  let entry: AuditLogEntry | null = null;
  if (res.statusCode === 403) {
    entry = denialEntry(req, ctx, denialBody);
    if (
      entry &&
      !shouldRecordDenial(
        ctx.actor?.userId as string,
        `${ctx.actor?.userId}|${entry.actionKey}|${req.method}|${(entry.payload as { path: string }).path}|${entry.entityId}`,
        Date.now()
      )
    ) {
      entry = null;
    }
  } else if (res.statusCode === 200 && (req.method === 'GET' || req.method === 'POST')) {
    entry = downloadEntry(req, res, ctx);
  }
  // `finish` s'exécute hors du contexte de la requête : on le rétablit pour que
  // l'enrichissement (acteur, agence, requestId, IP) se fasse comme partout.
  if (entry) {
    const toLog = entry;
    runWithRequestContext(ctx, () => logAuditEvent(toLog));
  }
}

export function auditAccessMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ctx = getRequestContext();
  if (!ctx) {
    next();
    return;
  }

  let denialBody: { code?: string; message?: string } = {};
  const originalJson = res.json.bind(res);
  res.json = ((body?: unknown) => {
    if (res.statusCode === 403) denialBody = summarizeDenial(body);
    return originalJson(body);
  }) as typeof res.json;

  res.on('finish', () => {
    try {
      record(req, res, ctx, denialBody);
    } catch (error) {
      // L'observation ne doit jamais perturber une réponse déjà envoyée.
      logger.warn('Audit access: événement non enregistré', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  next();
}
