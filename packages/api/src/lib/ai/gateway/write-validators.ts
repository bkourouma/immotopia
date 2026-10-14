import { z } from 'zod';
import { t } from '../../../i18n';
import { sanitizeBody } from '../../../middleware/validation-middleware';
import { logger } from '../../../utils/logger';
import { createPropertySchema, updatePropertySchema } from '../../properties/schemas';
import { createLeaseSchema, updateLeaseSchema } from '../../rental/schemas';
import {
  convertContactSchema,
  createActivitySchema,
  createContactSchema,
  createDealSchema,
  updateContactSchema,
  updateDealSchema
} from '../../../types/crm-types';
import type { CatalogEntry } from './catalog-builder';

/**
 * Validation À SEC du corps d'un plan d'écriture (`plan_write`), AVANT d'afficher le plan à
 * l'humain : le modèle ignore les champs obligatoires d'une route, et sans ce contrôle un
 * plan incomplet était affiché, approuvé, puis refusé à l'exécution (400 VALIDATION_ERROR).
 *
 * Le registre associe l'id d'une route du catalogue au schéma Zod QUE LA ROUTE RÉELLE applique
 * (même module de schéma, importé, jamais recopié). Une route absente du registre n'est pas
 * « valide » : elle est `unchecked` et le plan l'annonce à l'humain.
 *
 * Module feuille : aucun contrôleur, aucun service, aucun accès base (pas de cycle d'import).
 * Il ne réécrit JAMAIS le corps : ce qui est haché, signé, montré puis exécuté reste le brut
 * du modèle. La sortie ne contient jamais la valeur saisie ni le type reçu.
 */

export interface WriteBodyContext {
  tenantId: string;
  pathParams: Record<string, string>;
}

export interface WriteBodyValidator {
  schema: z.ZodTypeAny;
  /** Reproduit ce que fait la route AVANT d'appliquer le schéma (nettoyage, valeurs par défaut). */
  prepare?: (body: Record<string, unknown> | null, c: WriteBodyContext) => unknown;
}

export interface WriteBodyIssue {
  path: string;
  kind: 'missing' | 'invalid' | 'enum';
  message: string;
  allowedValues?: string[];
}

export type WriteBodyCheck =
  { status: 'unchecked' } | { status: 'valid' } | { status: 'invalid'; issues: WriteBodyIssue[] };

export const MAX_WRITE_BODY_ISSUES = 10;
const MAX_ISSUE_MESSAGE_CHARS = 200;
const MAX_ALLOWED_VALUES = 20;

/** Middleware `validate(schema)` : le corps est nettoyé (XSS) puis passé au schéma. */
const viaValidateMiddleware = (schema: z.ZodTypeAny): WriteBodyValidator => ({
  schema,
  prepare: body => sanitizeBody(body ?? {})
});

/**
 * Contrôleur des biens (`controllers/property-controller.ts`) : il recopie les champs connus avec
 * des défauts. Le schéma ignore les clés inconnues ; sont reproduits `currency` (`|| 'EUR'`) et
 * `ownerUserId ?? (ownerEmail ? undefined : userId)` : `null` retombe sur l'utilisateur courant (un uuid
 * valide, ici un uuid de remplacement) ou sur `undefined` si un e-mail de propriétaire est fourni.
 */
const CURRENT_USER_PLACEHOLDER = '00000000-0000-4000-8000-000000000000';
const propertyCreateValidator: WriteBodyValidator = {
  schema: createPropertySchema,
  prepare: body => {
    const source = body ?? {};
    return {
      ...source,
      ownerUserId: source.ownerUserId ?? (source.ownerEmail ? undefined : CURRENT_USER_PLACEHOLDER),
      currency: source.currency || 'EUR'
    };
  }
};

const direct = (schema: z.ZodTypeAny): WriteBodyValidator => ({ schema, prepare: body => body ?? {} });

const PREFIX = '/api/tenants/:tenantId';

export const WRITE_BODY_VALIDATORS: ReadonlyMap<string, WriteBodyValidator> = new Map<string, WriteBodyValidator>([
  [`POST ${PREFIX}/properties`, propertyCreateValidator],
  [`PUT ${PREFIX}/properties/:id`, direct(updatePropertySchema)],
  [`POST ${PREFIX}/crm/contacts`, viaValidateMiddleware(createContactSchema)],
  [`PATCH ${PREFIX}/crm/contacts/:contactId`, viaValidateMiddleware(updateContactSchema)],
  [`POST ${PREFIX}/crm/deals`, viaValidateMiddleware(createDealSchema)],
  [`PATCH ${PREFIX}/crm/deals/:dealId`, viaValidateMiddleware(updateDealSchema)],
  [`POST ${PREFIX}/crm/activities`, viaValidateMiddleware(createActivitySchema)],
  [`POST ${PREFIX}/crm/contacts/:contactId/convert`, viaValidateMiddleware(convertContactSchema)],
  [`PATCH ${PREFIX}/crm/contacts/:contactId/roles`, viaValidateMiddleware(convertContactSchema)],
  [`POST ${PREFIX}/rental/leases`, direct(createLeaseSchema)],
  [`PATCH ${PREFIX}/rental/leases/:leaseId`, direct(updateLeaseSchema)]
]);

/** « 'A' | 'B' » (forme de `expected` pour un enum absent) -> ['A', 'B'] ; autre forme -> undefined. */
function enumValuesFromExpected(expected: unknown): string[] | undefined {
  if (typeof expected !== 'string' || !/^'[^']*'(?: \| '[^']*')*$/.test(expected)) return undefined;
  return expected
    .split(' | ')
    .map(part => part.slice(1, -1))
    .slice(0, MAX_ALLOWED_VALUES);
}

function toIssue(issue: z.ZodIssue): WriteBodyIssue {
  const path = issue.path.join('.') || t('(corps)');
  const clip = (message: string) => message.slice(0, MAX_ISSUE_MESSAGE_CHARS);
  if (issue.code === 'invalid_enum_value') {
    const allowedValues = issue.options.filter((v): v is string => typeof v === 'string').slice(0, MAX_ALLOWED_VALUES);
    return {
      path,
      kind: 'enum',
      message: t('Valeur non permise.'),
      ...(allowedValues.length ? { allowedValues } : {})
    };
  }
  if (issue.code === 'invalid_type') {
    if (issue.received === 'undefined') {
      const allowedValues = enumValuesFromExpected(issue.expected);
      return {
        path,
        kind: 'missing',
        message: t('Champ obligatoire.'),
        ...(allowedValues?.length ? { allowedValues } : {})
      };
    }
    const allowedValues = enumValuesFromExpected(issue.expected);
    return {
      path,
      kind: allowedValues ? 'enum' : 'invalid',
      message: allowedValues
        ? t('Valeur non permise.')
        : clip(t('Type attendu : {{expected}}.', { expected: String(issue.expected) })),
      ...(allowedValues?.length ? { allowedValues } : {})
    };
  }
  return { path, kind: 'invalid', message: clip(issue.message) };
}

/** Valide le corps proposé comme la route réelle le ferait. Ne lève jamais : toute panne -> `unchecked`. */
export function checkWriteBody(
  entry: CatalogEntry,
  body: Record<string, unknown> | null,
  ctx: WriteBodyContext
): WriteBodyCheck {
  const validator = WRITE_BODY_VALIDATORS.get(entry.id);
  if (!validator) return { status: 'unchecked' };
  try {
    const input = validator.prepare ? validator.prepare(body, ctx) : (body ?? {});
    const parsed = validator.schema.safeParse(input);
    if (parsed.success) return { status: 'valid' };
    return { status: 'invalid', issues: parsed.error.issues.slice(0, MAX_WRITE_BODY_ISSUES).map(toIssue) };
  } catch (error) {
    // Exception non-Zod, schéma asynchrone : on n'invente pas un refus (le serveur contrôlera à l'exécution).
    logger.warn('ImmoCopilot : validation à sec impossible', {
      capabilityId: entry.id,
      error: error instanceof Error ? error.message : 'inconnue'
    });
    return { status: 'unchecked' };
  }
}
