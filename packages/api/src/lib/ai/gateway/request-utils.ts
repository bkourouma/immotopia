import { z } from 'zod';
import { t } from '../../../i18n';
import { BadRequestError } from '../../../middleware/error-middleware';

/**
 * Construction d'une requête loopback depuis une entrée du catalogue, partagée par
 * `call_read` et `plan_write` : mêmes règles pour les paramètres de chemin et de requête.
 * `:tenantId` est toujours imposé par le serveur, jamais fourni par le modèle.
 */

export const MAX_QUERY_KEYS = 20;
export const MAX_QUERY_VALUE_CHARS = 200;
/** UUID ou jeton simple. */
export const PATH_PARAM_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const QUERY_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MAX_ERROR_MESSAGE_CHARS = 300;

export const pathParamsSchema = z.record(
  z.string(),
  z.string().regex(PATH_PARAM_PATTERN, 'jeton simple attendu (lettres, chiffres, _ et -)')
);

export const querySchema = z
  .record(
    z.string().regex(QUERY_KEY_PATTERN),
    z.union([z.string().max(MAX_QUERY_VALUE_CHARS), z.number().finite(), z.boolean()])
  )
  .refine(query => Object.keys(query).length <= MAX_QUERY_KEYS, `${MAX_QUERY_KEYS} paramètres de requête au plus`);

export type QueryInput = z.infer<typeof querySchema>;

/** `message` (ou `error`) texte court d'un corps JSON d'erreur, sinon null : jamais de pile ni de détail. */
export function extractErrorMessage(text: string): string | null {
  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown };
    const message =
      typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : null;
    return message ? message.slice(0, MAX_ERROR_MESSAGE_CHARS) : null;
  } catch {
    return null; // corps non JSON : message générique
  }
}

/** Message d'erreur d'une réponse HTTP de lecture, sans pile ni détail. */
export function httpErrorMessage(status: number, text: string, fallback?: string): string {
  const message = extractErrorMessage(text);
  if (message) return message;
  if (status === 401) return t('Authentification refusée.');
  if (status === 403) return t("Vous n'avez pas la permission de consulter cette ressource.");
  if (status === 404) return t('Ressource introuvable.');
  if (status === 429) return t('Trop de requêtes, réessayez dans un instant.');
  return fallback ?? t('La consultation a échoué.');
}

export function buildPath(
  template: string,
  tenantId: string,
  params: Record<string, string>,
  expected: string[]
): string {
  for (const key of Object.keys(params)) {
    if (!expected.includes(key)) {
      throw new BadRequestError(
        t('Paramètre de chemin inattendu : {{name}}. Le tenantId est imposé par le serveur.', { name: key })
      );
    }
  }
  const missing = expected.filter(key => !params[key]);
  if (missing.length > 0) {
    throw new BadRequestError(t('Paramètre(s) de chemin manquant(s) : {{names}}.', { names: missing.join(', ') }));
  }
  return template.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) =>
    name === 'tenantId' ? encodeURIComponent(tenantId) : encodeURIComponent(params[name] ?? '')
  );
}

export function buildQueryString(query: QueryInput | undefined): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) search.append(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
}
