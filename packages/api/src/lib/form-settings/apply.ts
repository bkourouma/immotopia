import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError, BadRequestError, ErrorCode, ForbiddenError } from '../../middleware/error-middleware';
import { getTenantContext } from '../../utils/tenant-context';
import { t } from '../../i18n';
import { getEffectiveFieldModes } from './service';
import type { EffectiveForm, FormRegistry } from './types';

export interface ApplyFieldModesOptions {
  /** HIDDEN : met la clé à `null` au lieu de la supprimer (uniquement si la clé est présente). */
  nullOnHidden?: boolean;
  /**
   * Mise à jour partielle (PATCH) : un champ REQUIRED absent du corps est accepté
   * (non modifié) ; il n'est refusé que s'il est présent et vide.
   */
  partial?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** « Vide » : undefined, null, chaîne vide après trim, tableau vide. */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Parcourt un chemin `a`, `a.b` ou `a[].b` et appelle `visit(conteneur, cléFinale)` pour
 * chaque conteneur atteint (un par élément de tableau). Un tableau absent ou d'un autre
 * type n'est pas visité : il n'y a alors aucun élément à contrôler.
 */
function visitPath(
  node: unknown,
  segments: string[],
  visit: (container: Record<string, unknown>, key: string) => void
): void {
  if (!isRecord(node) || segments.length === 0) return;
  const [head, ...rest] = segments;
  const isArraySegment = head.endsWith('[]');
  const name = isArraySegment ? head.slice(0, -2) : head;

  if (rest.length === 0) {
    if (!isArraySegment) visit(node, name);
    return;
  }
  const child = node[name];
  if (isArraySegment) {
    if (!Array.isArray(child)) return;
    for (const element of child) visitPath(element, rest, visit);
    return;
  }
  visitPath(child, rest, visit);
}

/**
 * Applique les modes à un corps déjà parsé (modifié en place).
 * REQUIRED vide : `AppError` 400 `FORM_FIELD_REQUIRED` ; HIDDEN : clé supprimée (ou `null`
 * avec `nullOnHidden`) ; OPTIONAL : inchangé.
 */
export function applyFieldModes(body: unknown, modes: EffectiveForm, opts: ApplyFieldModesOptions = {}): void {
  if (!isRecord(body)) return;

  for (const [fieldKey, mode] of Object.entries(modes.fields)) {
    if (mode === 'OPTIONAL') continue;
    const segments = fieldKey.split('.');

    visitPath(body, segments, (container, key) => {
      if (mode === 'HIDDEN') {
        if (!(key in container)) return;
        if (opts.nullOnHidden) container[key] = null;
        else delete container[key];
        return;
      }
      // REQUIRED
      if (opts.partial && !(key in container)) return;
      if (isEmptyValue(container[key])) {
        const label = modes.labels?.[fieldKey] ?? fieldKey;
        throw new AppError(
          t('Le champ {{label}} est obligatoire.', { label: t(label) }),
          400,
          ErrorCode.FORM_FIELD_REQUIRED,
          undefined,
          { fieldKey }
        );
      }
    });
  }
}

export interface FormFieldModesMiddlewareOptions extends ApplyFieldModesOptions {
  /** Champ texte du multipart qui porte le corps JSON : parsé, contrôlé puis réécrit en JSON. */
  payloadField?: string;
  /** Registre injecté (tests) ; par défaut le registre du dépôt. */
  registry?: FormRegistry;
}

/**
 * Agence de la requête : `req.tenantContext` (écrans de l'agence, posé par
 * `requireTenantAccess`), sinon `req.coOwnerPortal.scope.tenantId` (portail copropriétaire,
 * posé par `requireCoOwnerPortalAccess`), sinon le contexte ambiant.
 */
function resolveTenantId(req: Request): string | undefined {
  const portal = (req as Request & { coOwnerPortal?: { scope?: { tenantId?: string } } }).coOwnerPortal;
  return req.tenantContext?.tenantId ?? portal?.scope?.tenantId ?? getTenantContext()?.tenantId;
}

/**
 * Middleware Express : lit l'agence, charge les modes effectifs puis les applique à
 * `req.body`. À placer APRÈS multer (routes multipart) et AVANT la validation zod.
 */
export function formFieldModes(formKey: string, opts: FormFieldModesMiddlewareOptions = {}): RequestHandler {
  const { payloadField, registry, ...applyOpts } = opts;

  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        throw new ForbiddenError(t('Agence introuvable pour cette requête.'));
      }
      const modes = await getEffectiveFieldModes(tenantId, formKey, registry);

      if (!payloadField) {
        applyFieldModes(req.body, modes, applyOpts);
        next();
        return;
      }

      const body = (req.body ??= {}) as Record<string, unknown>;
      const raw = body[payloadField];
      const hasRaw = raw !== undefined && raw !== null && raw !== '';
      let payload: unknown = {};
      if (hasRaw && typeof raw === 'string') {
        try {
          payload = JSON.parse(raw);
        } catch {
          throw new BadRequestError(t('Les données du formulaire sont illisibles.'));
        }
      } else if (hasRaw) {
        payload = raw;
      }
      if (!isRecord(payload)) {
        throw new BadRequestError(t('Les données du formulaire sont illisibles.'));
      }

      applyFieldModes(payload, modes, applyOpts);
      if (hasRaw) body[payloadField] = JSON.stringify(payload);
      next();
    } catch (error) {
      next(error);
    }
  };
}
