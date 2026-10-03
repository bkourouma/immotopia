import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  COPILOT_ARTIFACT_MAX_CHART_POINTS,
  COPILOT_ARTIFACT_MAX_COLUMNS,
  COPILOT_ARTIFACT_MAX_MARKDOWN_CHARS,
  COPILOT_ARTIFACT_MAX_ROWS,
  COPILOT_ARTIFACT_MAX_SERIES,
  type ArtifactCell,
  type CopilotArtifact,
  type CopilotToolDefinition
} from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

/**
 * `show_artifact` : le modèle publie dans le panneau latéral un tableau, un
 * texte Markdown ou un graphique construit à partir de résultats d'outils qu'il
 * a déjà reçus.
 *
 * Permission : `PROPERTIES_VIEW`, la plus faible des permissions des outils de
 * lecture (socle CORE). L'outil ne lit RIEN en base : les données affichées ont
 * déjà traversé des outils soumis à leurs propres permissions, il n'élargit donc
 * aucun accès. On l'aligne sur le socle plutôt que sur une permission inventée,
 * pour qu'il n'apparaisse pas seul : un utilisateur sans aucun outil de lecture
 * garde `NO_TOOLS` (voir `GET /ai/status`). Limite connue : un rôle qui n'a que
 * des permissions de location (sans `PROPERTIES_VIEW`) ne reçoit pas l'outil.
 *
 * Données d'affichage seulement : jamais de HTML, `id` généré ici (jamais par le
 * modèle), tailles bornées, aucune écriture.
 */

const PERMISSION = 'PROPERTIES_VIEW';

/** Plafond d'entrée : au-delà de COPILOT_ARTIFACT_MAX_ROWS, les lignes sont tronquées, pas refusées. */
const MAX_INPUT_ROWS = 5000;
const MAX_TITLE = 120;
const MAX_LABEL = 80;
const MAX_CELL_CHARS = 1000;

/** Balise ou commentaire HTML : refusé partout (titres, libellés, cellules, Markdown). */
const HTML_PATTERN = /<\/?[a-z!?]/i;
/** Lien Markdown à schéma exécutable. */
const UNSAFE_LINK_PATTERN = /\]\(\s*(?:javascript|data|vbscript)\s*:/i;

const noHtml = (value: string) => !HTML_PATTERN.test(value);
const safeText = (max: number) => z.string().trim().min(1).max(max).refine(noHtml, 'le HTML est interdit');

/** Clé de colonne : commence par une lettre, ce qui exclut `__proto__`. */
const keySchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'clé invalide (lettres, chiffres, _ ; 40 max)');

const cellSchema = z.union([
  z.string().max(MAX_CELL_CHARS).refine(noHtml, 'le HTML est interdit'),
  z.number().finite(),
  z.null()
]);

const rowSchema = z
  .record(keySchema, cellSchema)
  .refine(row => Object.keys(row).length <= COPILOT_ARTIFACT_MAX_COLUMNS, 'trop de clés dans une ligne');

const columnSchema = z
  .object({
    key: keySchema,
    label: safeText(MAX_LABEL),
    type: z.enum(['text', 'number', 'currency', 'date']).optional()
  })
  .strict();

const seriesSchema = z.object({ key: keySchema, label: safeText(MAX_LABEL) }).strict();

const KIND_FIELDS = {
  table: ['columns', 'rows'],
  markdown: ['content'],
  chart: ['chartType', 'xKey', 'series', 'data']
} as const;
const ALL_KIND_FIELDS = ['columns', 'rows', 'content', 'chartType', 'xKey', 'series', 'data'] as const;

const baseSchema = z
  .object({
    kind: z.enum(['table', 'markdown', 'chart']),
    title: safeText(MAX_TITLE),
    columns: z.array(columnSchema).min(1).max(COPILOT_ARTIFACT_MAX_COLUMNS).optional(),
    rows: z.array(rowSchema).max(MAX_INPUT_ROWS).optional(),
    content: z.string().trim().min(1).max(COPILOT_ARTIFACT_MAX_MARKDOWN_CHARS).optional(),
    chartType: z.enum(['bar', 'line', 'pie']).optional(),
    xKey: keySchema.optional(),
    series: z.array(seriesSchema).min(1).max(COPILOT_ARTIFACT_MAX_SERIES).optional(),
    data: z.array(rowSchema).min(1).max(COPILOT_ARTIFACT_MAX_CHART_POINTS).optional()
  })
  .strict();

type RawInput = z.infer<typeof baseSchema>;
type Row = Record<string, ArtifactCell>;

const hasKey = (rows: Row[], key: string) => rows.some(row => Object.prototype.hasOwnProperty.call(row, key));

function checkInput(value: RawInput, ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

  // Un champ d'un autre type d'artefact est une erreur de forme, pas ignoré en silence.
  const allowed = new Set<string>(KIND_FIELDS[value.kind]);
  for (const field of ALL_KIND_FIELDS) {
    if (value[field] !== undefined && !allowed.has(field)) {
      issue([field], `« ${field} » n'est pas permis pour kind=${value.kind}`);
    }
  }
  for (const field of KIND_FIELDS[value.kind]) {
    if (value[field] === undefined) issue([field], `« ${field} » est requis pour kind=${value.kind}`);
  }

  if (value.kind === 'markdown' && value.content !== undefined) {
    if (HTML_PATTERN.test(value.content)) issue(['content'], 'le HTML est interdit');
    if (UNSAFE_LINK_PATTERN.test(value.content)) issue(['content'], 'lien à schéma non autorisé');
  }

  if (value.kind === 'table' && value.columns && value.rows) {
    const keys = value.columns.map(column => column.key);
    if (new Set(keys).size !== keys.length) issue(['columns'], 'clés de colonnes en double');
    const { rows } = value;
    keys.forEach((key, index) => {
      if (rows.length > 0 && !hasKey(rows, key)) {
        issue(['columns', index, 'key'], `la clé « ${key} » est absente des lignes`);
      }
    });
  }

  if (value.kind === 'chart' && value.series && value.data && value.xKey) {
    if (!hasKey(value.data, value.xKey)) issue(['xKey'], `la clé « ${value.xKey} » est absente des données`);
    const keys = value.series.map(entry => entry.key);
    if (new Set(keys).size !== keys.length) issue(['series'], 'clés de séries en double');
    if (value.chartType === 'pie' && value.series.length !== 1) issue(['series'], 'un camembert a une seule série');
    const { data } = value;
    value.series.forEach((entry, index) => {
      if (!hasKey(data, entry.key)) {
        issue(['series', index, 'key'], `la clé « ${entry.key} » est absente des données`);
        return;
      }
      if (entry.key === value.xKey) issue(['series', index, 'key'], 'la série ne peut pas être la clé de l’axe x');
      const bad = data.some(row => typeof row[entry.key] === 'string');
      if (bad) issue(['series', index, 'key'], `les valeurs de « ${entry.key} » doivent être numériques`);
    });
  }
}

export const showArtifactInputSchema = baseSchema.superRefine(checkInput);
type Input = z.infer<typeof showArtifactInputSchema>;

/** Ne garde que les clés déclarées ; une clé absente d'une ligne devient `null`. */
function projectRows(rows: Row[], keys: string[]): Row[] {
  return rows.map(row => Object.fromEntries(keys.map(key => [key, row[key] ?? null])));
}

/**
 * Construit l'artefact validé : `id` serveur, lignes tronquées à
 * COPILOT_ARTIFACT_MAX_ROWS (`truncated: true`), clés non déclarées écartées.
 * L'entrée doit déjà avoir passé `showArtifactInputSchema`.
 */
export function buildArtifact(input: Input, id: string = randomUUID()): CopilotArtifact {
  if (input.kind === 'markdown') {
    return { kind: 'markdown', id, title: input.title, content: input.content ?? '' };
  }
  if (input.kind === 'chart') {
    const series = input.series ?? [];
    return {
      kind: 'chart',
      id,
      title: input.title,
      chartType: input.chartType ?? 'bar',
      xKey: input.xKey ?? '',
      series,
      data: projectRows(input.data ?? [], [input.xKey ?? '', ...series.map(entry => entry.key)])
    };
  }
  const columns = input.columns ?? [];
  const rows = input.rows ?? [];
  const kept = rows.slice(0, COPILOT_ARTIFACT_MAX_ROWS);
  return {
    kind: 'table',
    id,
    title: input.title,
    columns,
    rows: projectRows(
      kept,
      columns.map(column => column.key)
    ),
    ...(rows.length > kept.length ? { truncated: true } : {})
  };
}

const jsonRow = {
  type: 'object',
  description: 'Une ligne : clés de colonnes (lettres, chiffres, _) vers texte, nombre ou null.',
  additionalProperties: { type: ['string', 'number', 'null'] }
};

export const showArtifactTool: CopilotToolDefinition<typeof showArtifactInputSchema> = {
  name: 'show_artifact',
  description:
    "Affiche dans le panneau latéral un tableau (kind=table), un texte Markdown (kind=markdown) ou un graphique (kind=chart) à partir de données DÉJÀ obtenues par tes autres outils. N'affiche rien d'inventé, aucun secret, aucun HTML. Lecture seule : ne lit ni n'écrit rien.",
  inputSchema: showArtifactInputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'title'],
    properties: {
      kind: { type: 'string', enum: ['table', 'markdown', 'chart'] },
      title: { type: 'string', maxLength: MAX_TITLE },
      columns: {
        type: 'array',
        description: 'kind=table : colonnes (clé, libellé, type facultatif).',
        minItems: 1,
        maxItems: COPILOT_ARTIFACT_MAX_COLUMNS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'label'],
          properties: {
            key: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,39}$' },
            label: { type: 'string', maxLength: MAX_LABEL },
            type: { type: 'string', enum: ['text', 'number', 'currency', 'date'] }
          }
        }
      },
      rows: {
        type: 'array',
        description: `kind=table : lignes (au-delà de ${COPILOT_ARTIFACT_MAX_ROWS}, tronquées).`,
        maxItems: MAX_INPUT_ROWS,
        items: jsonRow
      },
      content: {
        type: 'string',
        description: 'kind=markdown : texte Markdown, sans HTML.',
        maxLength: COPILOT_ARTIFACT_MAX_MARKDOWN_CHARS
      },
      chartType: { type: 'string', enum: ['bar', 'line', 'pie'], description: 'kind=chart.' },
      xKey: { type: 'string', description: "kind=chart : clé de l'axe des x (ou des parts), présente dans data." },
      series: {
        type: 'array',
        description: 'kind=chart : séries numériques (un camembert en a une seule).',
        minItems: 1,
        maxItems: COPILOT_ARTIFACT_MAX_SERIES,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'label'],
          properties: {
            key: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,39}$' },
            label: { type: 'string', maxLength: MAX_LABEL }
          }
        }
      },
      data: {
        type: 'array',
        description: `kind=chart : points (${COPILOT_ARTIFACT_MAX_CHART_POINTS} au plus).`,
        minItems: 1,
        maxItems: COPILOT_ARTIFACT_MAX_CHART_POINTS,
        items: jsonRow
      }
    }
  },
  requiredPermission: PERMISSION,
  feature: 'CORE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    const artifact = buildArtifact(input);
    const rows =
      artifact.kind === 'table' ? artifact.rows.length : artifact.kind === 'chart' ? artifact.data.length : 0;
    return outcome({ shown: true, id: artifact.id, rows }, { type: 'artifact', artifact });
  }
};
