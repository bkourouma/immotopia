import {
  STOCK_VISION_EXPLANATION_MAX,
  STOCK_VISION_MAX_TOTAL,
  STOCK_VISION_METHODS,
  STOCK_VISION_QUALITIES,
  stockVisionResultSchema,
  type StockVisionCandidate,
  type StockVisionFailureReason,
  type StockVisionOutcome,
  type StockVisionRequest,
  type StockVisionResult
} from '../types';

/**
 * Sortie de l'analyse d'image (spec 041, W8-R5) : schéma Zod (l'autorité),
 * sa version JSON Schema envoyée aux fournisseurs, et l'exécution commune
 * d'un appel (délai, validation, garantie « ne lève jamais »).
 *
 * Le schéma Zod est défini une seule fois, par les fondations, dans
 * `../types.ts` : il est seulement réexporté ici.
 */
export { stockVisionResultSchema };
export type { StockVisionResult };

/**
 * Version JSON Schema de `stockVisionResultSchema`, commune à Gemini
 * (`generationConfig.responseJsonSchema`) et à OpenRouter
 * (`response_format.json_schema.schema`, `strict: true`).
 *
 * N'emploie que les mots-clés que Gemini documente pour `responseJsonSchema`
 * (`type`, `enum`, `minimum`, `maximum`, `properties`, `required`,
 * `additionalProperties`, `description`) ; le mode strict d'OpenRouter exige en
 * plus que toutes les propriétés soient requises et `additionalProperties:
 * false`, ce qui est le cas : une valeur absente s'écrit `null`. Les bornes que
 * ce sous-ensemble ne sait pas dire (300 caractères, `itemId` pris dans la
 * liste) restent à la validation Zod, qui fait seule autorité : le respect du
 * schéma varie selon le fournisseur. Un `proposedTotal` plus précis que quatre
 * décimales n'est pas rejeté : la validation l'arrondit (`types.ts`).
 */
export const STOCK_VISION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    quality: {
      type: 'string',
      enum: [...STOCK_VISION_QUALITIES],
      description:
        'OK si la photo permet de compter ; TOO_DARK si elle est trop sombre ; BLURRY si elle est floue ; NOT_STOCK si aucun matériau de chantier n’est visible.'
    },
    itemId: {
      type: ['string', 'null'],
      description: 'Identifiant (champ id) d’un article de la liste fournie, ou null si l’article est douteux.'
    },
    itemConfidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Certitude sur l’article, de 0 à 1.'
    },
    visibleUnits: {
      type: 'integer',
      minimum: 0,
      description: 'Unités réellement visibles sur la photo (face, sections en bout de fagot, blocs par couche).'
    },
    layers: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Nombre de couches superposées, ou null.'
    },
    columns: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Nombre de colonnes (ou de blocs par couche), ou null.'
    },
    depthRows: {
      type: ['integer', 'null'],
      minimum: 1,
      description: 'Nombre de rangées en profondeur, ou null.'
    },
    proposedTotal: {
      type: 'number',
      minimum: 0,
      maximum: STOCK_VISION_MAX_TOTAL,
      description: 'Total proposé dans l’unité de l’article.'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Certitude sur le total, de 0 à 1.'
    },
    method: {
      type: 'string',
      enum: [...STOCK_VISION_METHODS],
      description:
        'SACKS_STACKED pour des sacs empilés ; BARS_BUNDLE pour des barres ou des tubes ; BLOCKS_PALLET pour des blocs palettisés ; OTHER sinon.'
    },
    explanation: {
      type: 'string',
      description: `Explication courte du comptage, en français, ${STOCK_VISION_EXPLANATION_MAX} caractères au plus.`
    }
  },
  required: [
    'quality',
    'itemId',
    'itemConfidence',
    'visibleUnits',
    'layers',
    'columns',
    'depthRows',
    'proposedTotal',
    'confidence',
    'method',
    'explanation'
  ],
  additionalProperties: false
} as const;

/** Nom du schéma chez OpenRouter (W8-R3). */
export const STOCK_VISION_SCHEMA_NAME = 'stock_count';

/**
 * Valide une sortie brute et applique les deux règles qui dépendent de la
 * requête :
 * - un `itemId` absent de la liste des candidats vaut `null` (W8-R5) ;
 * - un article imposé par le chef l'emporte sur ce que rend l'IA (W9-R4).
 *
 * Rend `null` si la sortie ne respecte pas `stockVisionResultSchema`.
 */
export function finalizeVisionResult(
  raw: unknown,
  request: Pick<StockVisionRequest, 'candidates' | 'imposedItemId'>
): StockVisionResult | null {
  const parsed = stockVisionResultSchema.safeParse(raw);
  if (!parsed.success) return null;
  const result: StockVisionResult = { ...parsed.data };
  const known = new Set(request.candidates.map((candidate: StockVisionCandidate) => candidate.id));
  if (result.itemId !== null && !known.has(result.itemId)) result.itemId = null;
  if (request.imposedItemId) result.itemId = request.imposedItemId;
  return result;
}

/**
 * Échec typé d'un appel au fournisseur. Le message ne contient jamais la
 * réponse brute, l'image ni une clé : il peut être journalisé.
 */
export class VisionCallError extends Error {
  constructor(
    readonly reason: Exclude<StockVisionFailureReason, 'DISABLED'>,
    message: string
  ) {
    super(message);
    this.name = 'VisionCallError';
  }
}

/** Erreur levée par `fetch` (ou un client simulé) à l'abandon du signal. */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    ((error as { name?: unknown }).name === 'AbortError' || (error as { name?: unknown }).name === 'TimeoutError')
  );
}

export type VisionCallMeta = { provider: string; model: string; timeoutMs: number };

/**
 * Exécute un appel de fournisseur avec ses garanties communes :
 * - abandon au premier des deux : le signal de l'appelant ou le délai
 *   `timeoutMs` (W8-R7) — l'appel est alors coupé, et l'issue rendue sans
 *   attendre un client qui ignorerait le signal ;
 * - le texte rendu est lu comme du JSON, puis validé (`finalizeVisionResult`) ;
 * - ne lève JAMAIS : toute erreur devient une issue `ok: false`.
 *
 * `call` rend la sortie de l'IA, en texte JSON ou déjà lue ; il lève
 * `VisionCallError` pour un échec qualifié. Aucune journalisation ici : ni
 * l'image ni la réponse brute ne sortent de cette fonction.
 */
export async function runVisionCall(
  meta: VisionCallMeta,
  request: StockVisionRequest,
  signal: AbortSignal,
  call: (signal: AbortSignal) => Promise<unknown>
): Promise<StockVisionOutcome> {
  const startedAt = Date.now();
  const done = (
    outcome: { ok: true; result: StockVisionResult } | { ok: false; reason: StockVisionFailureReason }
  ): StockVisionOutcome => ({
    ...outcome,
    provider: meta.provider,
    model: meta.model,
    latencyMs: Date.now() - startedAt
  });

  if (signal.aborted) return done({ ok: false, reason: 'TIMEOUT' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), meta.timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal.addEventListener('abort', onCallerAbort, { once: true });
  const aborted = new Promise<'ABORTED'>(resolve => {
    controller.signal.addEventListener('abort', () => resolve('ABORTED'), { once: true });
  });

  try {
    const work = call(controller.signal).then(
      value => ({ value }),
      (error: unknown) => ({ error })
    );
    const settled = await Promise.race([work, aborted]);
    if (settled === 'ABORTED') return done({ ok: false, reason: 'TIMEOUT' });
    if ('error' in settled) {
      const { error } = settled;
      if (controller.signal.aborted || isAbortError(error)) return done({ ok: false, reason: 'TIMEOUT' });
      if (error instanceof VisionCallError) return done({ ok: false, reason: error.reason });
      return done({ ok: false, reason: 'PROVIDER_ERROR' });
    }
    let raw: unknown = settled.value;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        return done({ ok: false, reason: 'INVALID_OUTPUT' });
      }
    }
    const result = finalizeVisionResult(raw, request);
    if (!result) return done({ ok: false, reason: 'INVALID_OUTPUT' });
    return done({ ok: true, result });
  } catch {
    // Filet : rien ne doit remonter à l'appelant (W8-R1, « ne lève jamais »).
    return done({ ok: false, reason: 'PROVIDER_ERROR' });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onCallerAbort);
  }
}

/** Image en base64, sans préfixe. */
export function imageToBase64(image: Buffer): string {
  return image.toString('base64');
}
