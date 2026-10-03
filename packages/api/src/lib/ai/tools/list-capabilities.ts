import { z } from 'zod';
import type { CopilotToolDefinition } from '../contracts';
import { getCatalogEntries, listReadableModules, searchCapabilities, MAX_CAPABILITY_RESULTS } from '../gateway/catalog';
import { assertToolPermission, outcome } from './tool-utils';

/**
 * `list_capabilities` : cherche dans le catalogue généré (`gateway/catalog.generated.json`)
 * les routes de LECTURE (GET) de l'agence, pour que le modèle sache quoi demander
 * ensuite à `call_read`.
 *
 * Permission : `PROPERTIES_VIEW`, comme `show_artifact` — la plus faible des
 * permissions des outils de lecture (socle CORE). L'outil ne lit aucune donnée
 * d'agence : il consulte un index statique, filtré selon les permissions connues
 * de l'utilisateur. Le droit réel est vérifié par la chaîne de middlewares à
 * chaque `call_read`. Limite connue : un rôle sans `PROPERTIES_VIEW` ne reçoit
 * pas la passerelle (voir `show_artifact`).
 *
 * Les routes sensibles (chemin évoquant un secret) n'apparaissent jamais.
 */

const PERMISSION = 'PROPERTIES_VIEW';

const inputSchema = z
  .object({
    query: z.string().trim().min(1).max(100).optional(),
    module: z.string().trim().min(1).max(60).optional()
  })
  .strict();

export const listCapabilitiesTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'list_capabilities',
  description:
    `Cherche dans le catalogue des consultations (routes GET) que l'interface offre à l'utilisateur : par mots-clés (query, en anglais ou en français, ex. « contacts », « finance accounts ») et/ou par module (ex. « finance », « rental », « crm », « syndics »). ` +
    `Renvoie au plus ${MAX_CAPABILITY_RESULTS} entrées (id, chemin, module, résumé, paramètres de chemin). Sans argument, renvoie la liste des modules. Utilise ensuite call_read avec l'id choisi.`,
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string', maxLength: 100, description: 'Mots-clés, tous requis (ex. « lease payments »).' },
      module: {
        type: 'string',
        maxLength: 60,
        description: 'Module exact (ex. finance, rental, crm, syndics, patrimoine).'
      }
    }
  },
  requiredPermission: PERMISSION,
  feature: 'CORE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    if (!input.query && !input.module) {
      const modules = listReadableModules(ctx.permissions);
      return outcome({ catalogSize: getCatalogEntries().length, modules });
    }
    const { total, entries } = searchCapabilities({
      query: input.query,
      module: input.module,
      permissions: ctx.permissions
    });
    return outcome({
      total,
      count: entries.length,
      ...(total > entries.length ? { truncated: true } : {}),
      items: entries.map(entry => ({
        id: entry.id,
        path: entry.path,
        module: entry.module,
        summary: entry.summary,
        pathParams: entry.pathParams
      }))
    });
  }
};
