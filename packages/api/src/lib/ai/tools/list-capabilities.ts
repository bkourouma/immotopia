import { z } from 'zod';
import type { CopilotToolDefinition } from '../contracts';
import { getCatalogEntries, listReadableModules, searchCapabilities, MAX_CAPABILITY_RESULTS } from '../gateway/catalog';
import { assertToolPermission, outcome } from './tool-utils';

/**
 * `list_capabilities` : cherche dans le catalogue généré (`gateway/catalog.generated.json`)
 * les routes de LECTURE (GET, défaut) ou, avec `kind: 'write'`, d'ÉCRITURE
 * (POST/PUT/PATCH, jamais DELETE) de l'agence, pour que le modèle sache quoi demander
 * ensuite à `call_read` ou à `plan_write`. En mode écriture, seules sont renvoyées
 * les routes que `findWritableEntry` accepte (ni sensibles, ni destructives).
 *
 * Permission : `PROPERTIES_VIEW`, comme `show_artifact` — la plus faible des
 * permissions des outils de lecture (socle CORE). L'outil ne lit aucune donnée
 * d'agence : il consulte un index statique, filtré selon les permissions connues
 * de l'utilisateur. Le droit réel est vérifié par la chaîne de middlewares à
 * chaque `call_read`. Limite connue : un rôle sans `PROPERTIES_VIEW` ne reçoit
 * pas la passerelle (voir `show_artifact`).
 *
 * Les routes sensibles (chemin évoquant un secret) n'apparaissent jamais ; une route
 * que l'utilisateur n'a pas le droit d'utiliser (permissions du catalogue) non plus.
 */

const PERMISSION = 'PROPERTIES_VIEW';

const inputSchema = z
  .object({
    query: z.string().trim().min(1).max(100).optional(),
    module: z.string().trim().min(1).max(60).optional(),
    kind: z.enum(['read', 'write']).optional()
  })
  .strict();

export const listCapabilitiesTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'list_capabilities',
  description:
    `Cherche dans le catalogue des routes que l'interface offre à l'utilisateur : consultations (kind « read », défaut, routes GET pour call_read) ou écritures (kind « write », routes POST/PUT/PATCH pour plan_write, jamais de suppression) ; par mots-clés (query, en anglais ou en français, ex. « contacts », « finance accounts ») et/ou par module (ex. « finance », « rental », « crm », « syndics »). ` +
    `Renvoie au plus ${MAX_CAPABILITY_RESULTS} entrées (id, méthode, chemin, module, résumé, paramètres de chemin). Sans query ni module, renvoie la liste des modules. Utilise ensuite call_read (lecture) ou plan_write (écriture) avec l'id choisi.`,
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
      },
      kind: {
        type: 'string',
        enum: ['read', 'write'],
        description:
          'read (défaut) : consultations GET pour call_read. write : écritures POST/PUT/PATCH pour plan_write.'
      }
    }
  },
  requiredPermission: PERMISSION,
  feature: 'CORE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    if (!input.query && !input.module) {
      const modules = listReadableModules(ctx.permissions, input.kind);
      return outcome({ catalogSize: getCatalogEntries().length, modules });
    }
    const { total, entries } = searchCapabilities({
      query: input.query,
      module: input.module,
      kind: input.kind,
      permissions: ctx.permissions
    });
    return outcome({
      total,
      count: entries.length,
      ...(total > entries.length ? { truncated: true } : {}),
      items: entries.map(entry => ({
        id: entry.id,
        method: entry.method,
        path: entry.path,
        module: entry.module,
        summary: entry.summary,
        pathParams: entry.pathParams
      }))
    });
  }
};
