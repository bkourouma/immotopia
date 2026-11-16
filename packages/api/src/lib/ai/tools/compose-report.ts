import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { t } from '../../../i18n';
import { NotFoundError } from '../../../middleware/error-middleware';
import type { ArtifactDocumentBlock, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const schema = z
  .object({
    title: z.string().trim().min(1).max(120),
    blocks: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('text'), content: z.string().trim().min(1).max(4000) }).strict(),
          z.object({ kind: z.literal('table'), sourceId: z.string().uuid() }).strict()
        ])
      )
      .min(1)
      .max(20)
  })
  .strict();

const permission = 'PROPERTIES_VIEW';

export const composeReportTool: CopilotToolDefinition<typeof schema> = {
  name: 'compose_report',
  description:
    'Crée un rapport structuré avec des paragraphes Markdown et des tableaux calculés de la conversation. Insère les tableaux en référant leur artifactId. Dans le texte, commente les tendances et place les chiffres dans les tableaux.',
  inputSchema: schema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'blocks'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 120 },
      blocks: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'content'],
              properties: { kind: { const: 'text' }, content: { type: 'string', minLength: 1, maxLength: 4000 } }
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'sourceId'],
              properties: { kind: { const: 'table' }, sourceId: { type: 'string', format: 'uuid' } }
            }
          ]
        }
      }
    }
  },
  requiredPermission: permission,
  feature: 'CORE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, permission);
    const blocks: ArtifactDocumentBlock[] = [];
    const sources = new Set<string>();
    for (const block of input.blocks) {
      if (block.kind === 'text') {
        blocks.push(block);
        continue;
      }
      if (sources.has(block.sourceId)) continue;
      const table = ctx.analysisTables?.get(block.sourceId);
      if (!table?.provenance) throw new NotFoundError(t('Le résultat de cette analyse est indisponible.'));
      if (sources.size >= 5 || table.truncated || table.rows.length > 200)
        return outcome({ error: 'REPORT_TABLE_LIMIT' });
      sources.add(block.sourceId);
      blocks.push({ kind: 'table', table });
    }
    const id = randomUUID();
    return outcome(
      { artifactId: id, sourceIds: [...sources] },
      {
        type: 'artifact',
        artifact: { id, kind: 'document', title: input.title, blocks }
      }
    );
  }
};
