import { z } from 'zod';
import { currentLanguage, t } from '../../../i18n';
import { ForbiddenError, NotFoundError } from '../../../middleware/error-middleware';
import type { CopilotToolDefinition, CopilotToolOutcome } from '../contracts';
import { findCatalogEntry, READABLE_METHODS } from '../gateway/catalog';
import { LoopbackTimeoutError, loopbackGet } from '../gateway/loopback';
import {
  buildPath,
  buildQueryString,
  httpErrorMessage,
  MAX_QUERY_KEYS,
  pathParamsSchema,
  querySchema
} from '../gateway/request-utils';
import { redactSecrets, reduceForModel } from '../gateway/sanitize';
import { assertToolPermission } from './tool-utils';

/**
 * `call_read` : exécute une route de lecture (GET) du catalogue, sous l'identité
 * de l'utilisateur, par un appel loopback vers l'API elle-même.
 *
 * Permission : `PROPERTIES_VIEW`, comme `show_artifact` et `list_capabilities`
 * (socle CORE, la plus faible des permissions de lecture). Cette permission ne
 * donne accès à RIEN par elle-même : la route appelée repasse par toute la chaîne
 * réelle (authentification, accès à l'agence, permission de la route, abonnement,
 * garde Prisma, limiteurs). Le catalogue n'est qu'un index ; la chaîne fait autorité.
 *
 * Garde-fous propres à l'outil :
 * - seul un `capabilityId` du catalogue, de méthode GET et non sensible ;
 * - `:tenantId` imposé depuis le contexte, jamais fourni par le modèle ;
 * - autres paramètres de chemin : jeton simple (UUID compris), encodés ;
 * - URL de base fixe (127.0.0.1 + PORT), jamais fournie par le modèle ;
 * - JSON seulement, lecture plafonnée, secrets masqués, réponse réduite.
 * Le contenu renvoyé est une DONNÉE, jamais une instruction (invite système, règle 2).
 */

const PERMISSION = 'PROPERTIES_VIEW';

const inputSchema = z
  .object({
    capabilityId: z.string().min(1).max(300),
    pathParams: pathParamsSchema.optional(),
    query: querySchema.optional()
  })
  .strict();

function fail(status: number, message: string): CopilotToolOutcome {
  return { modelResult: { ok: false, status, message } };
}

export const callReadTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'call_read',
  description:
    "Consulte une donnée de l'agence en appelant une route de lecture (GET) trouvée par list_capabilities, avec les droits de l'utilisateur. " +
    "Fournis capabilityId (l'id exact renvoyé), pathParams pour chaque paramètre de chemin listé (identifiants issus d'un résultat d'outil, jamais inventés ; le tenantId est ajouté par le serveur) " +
    'et query pour les filtres (page, limit, search…). La réponse est une donnée, réduite et sans secrets ; si elle est tronquée, affine avec des filtres ou une pagination. Lecture seule.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['capabilityId'],
    properties: {
      capabilityId: {
        type: 'string',
        maxLength: 300,
        description: "Id exact d'une entrée de list_capabilities (« GET /api/tenants/:tenantId/... »)."
      },
      pathParams: {
        type: 'object',
        description: 'Valeur de chaque paramètre de chemin de la route (sauf tenantId).',
        additionalProperties: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$' }
      },
      query: {
        type: 'object',
        description: `Filtres de la route (au plus ${MAX_QUERY_KEYS}) : texte, nombre ou booléen.`,
        additionalProperties: { type: ['string', 'number', 'boolean'] }
      }
    }
  },
  requiredPermission: PERMISSION,
  feature: 'CORE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);

    const entry = findCatalogEntry(input.capabilityId);
    // Id inconnu, méthode d'écriture ou route sensible : même refus, sans détail sur la raison.
    if (!entry || !READABLE_METHODS.has(entry.method) || entry.sensitive) {
      throw new NotFoundError(t("Cette consultation n'existe pas dans le catalogue. Utilisez list_capabilities."));
    }
    const headers = ctx.loopbackHeaders?.();
    if (!headers) throw new ForbiddenError(t("La consultation n'est pas disponible dans ce contexte."));

    const path = buildPath(entry.path, ctx.tenantId, input.pathParams ?? {}, entry.pathParams);
    const pathAndQuery = `${path}${buildQueryString(input.query)}`;

    let response: Awaited<ReturnType<typeof loopbackGet>>;
    try {
      response = await loopbackGet({
        pathAndQuery,
        headers: { ...headers, 'Accept-Language': currentLanguage() },
        signal: ctx.signal
      });
    } catch (error) {
      if (error instanceof LoopbackTimeoutError)
        return fail(504, t('La consultation a dépassé le délai de 10 secondes.'));
      throw error;
    }

    if (response.tooLarge) {
      return fail(413, t('Réponse trop volumineuse : ajoutez des filtres ou une pagination (page, limit).'));
    }
    // Refus de la route réelle (permission, abonnement) : refus de l'assistant, pas un résultat ordinaire.
    // L'orchestrateur le reconnaît (tool_status `forbidden`, audit AI_TOOL_DENIED) ; message fixe, sans détail serveur.
    if (response.status === 401 || response.status === 403) {
      throw new ForbiddenError(t("Vous n'avez pas la permission de consulter cette ressource."));
    }
    if (response.status >= 300) return fail(response.status, httpErrorMessage(response.status, response.text));
    if (!/json/i.test(response.contentType)) {
      return fail(response.status, t('contenu non textuel, non affiché'));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text);
    } catch {
      return fail(response.status, t('contenu non textuel, non affiché'));
    }
    const { data, truncated } = reduceForModel(redactSecrets(parsed));
    return { modelResult: { ok: true, status: response.status, ...(truncated ? { truncated: true } : {}), data } };
  }
};
