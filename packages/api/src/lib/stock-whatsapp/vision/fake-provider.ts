import { env } from '../../../config/env';
import type {
  StockVisionCandidate,
  StockVisionOutcome,
  StockVisionProvider,
  StockVisionRequest,
  StockVisionResult
} from '../types';
import { VisionCallError, runVisionCall } from './schema';

/**
 * Faux fournisseur de vision (spec 041, W8-R9), déterministe : développement,
 * tests et recette navigateur (plan §9, R3 à R6). Il ne regarde pas l'image ;
 * il lit la légende de la photo (`fakeDirective`), et il est le SEUL à la lire.
 *
 * Directives (casse indifférente, espaces tolérés) :
 * - `fake:dark`, `fake:blurry`, `fake:notstock` : photo illisible (TOO_DARK,
 *   BLURRY, NOT_STOCK) ;
 * - `fake:unknown` : comptage sans article reconnu (`itemId` nul) ;
 * - `fake:fail` : erreur du fournisseur ; `fake:timeout` : attend l'abandon
 *   (délai) ; `fake:invalid` : sortie sans `method` (INVALID_OUTPUT) ;
 * - `fake:item=<référence>;total=<n>;conf=<0..1>` : article désigné par sa
 *   référence (inconnue : `itemId` nul), total et confiance ; chaque clé est
 *   facultative (défauts : premier candidat, 84, 0,92). Un total ou une
 *   confiance illisibles donnent INVALID_OUTPUT.
 *
 * Sans directive (ou légende qui ne commence pas par `fake:`) : premier
 * candidat par référence, total 84, confiance 0,92, `SACKS_STACKED`, 12 sacs de
 * face × 7 rangées.
 *
 * La sortie passe par la même validation que celle d'une vraie IA
 * (`runVisionCall`) : un article imposé par le chef l'emporte (W9-R4).
 */

export const FAKE_VISION_MODEL = 'fake-vision-1';

const DEFAULT_TOTAL = 84;
const DEFAULT_CONFIDENCE = 0.92;
const DEFAULT_FRONT = 12;
const DEFAULT_DEPTH = 7;

export type FakeDirective =
  | { kind: 'DEFAULT' }
  | { kind: 'QUALITY'; quality: 'TOO_DARK' | 'BLURRY' | 'NOT_STOCK' }
  | { kind: 'UNKNOWN' }
  | { kind: 'FAIL' }
  | { kind: 'TIMEOUT' }
  | { kind: 'INVALID' }
  | { kind: 'ITEM'; reference: string | null; total: number | null; confidence: number | null };

/** Lit la directive ; rend `null` pour une directive `fake:` mal formée. */
export function parseFakeDirective(caption: string | null): FakeDirective | null {
  const text = (caption ?? '').trim();
  if (!/^fake:/i.test(text)) return { kind: 'DEFAULT' };
  const body = text.slice('fake:'.length).trim();
  const keyword = body.toLowerCase();
  if (keyword === 'dark') return { kind: 'QUALITY', quality: 'TOO_DARK' };
  if (keyword === 'blurry') return { kind: 'QUALITY', quality: 'BLURRY' };
  if (keyword === 'notstock') return { kind: 'QUALITY', quality: 'NOT_STOCK' };
  if (keyword === 'unknown') return { kind: 'UNKNOWN' };
  if (keyword === 'fail') return { kind: 'FAIL' };
  if (keyword === 'timeout') return { kind: 'TIMEOUT' };
  if (keyword === 'invalid') return { kind: 'INVALID' };

  let reference: string | null = null;
  let total: number | null = null;
  let confidence: number | null = null;
  const pairs = body
    .split(';')
    .map(pair => pair.trim())
    .filter(Boolean);
  if (pairs.length === 0) return null;
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator <= 0) return null;
    const key = pair.slice(0, separator).trim().toLowerCase();
    const value = pair.slice(separator + 1).trim();
    if (key === 'item') reference = value || null;
    else if (key === 'total') {
      total = Number(value.replace(',', '.'));
      if (!value || !Number.isFinite(total)) return null;
    } else if (key === 'conf') {
      confidence = Number(value.replace(',', '.'));
      if (!value || !Number.isFinite(confidence)) return null;
    } else return null;
  }
  return { kind: 'ITEM', reference, total, confidence };
}

function firstByReference(candidates: StockVisionCandidate[]): StockVisionCandidate | null {
  const sorted = [...candidates].sort((a, b) => a.reference.localeCompare(b.reference, 'fr'));
  return sorted[0] ?? null;
}

function findByReference(candidates: StockVisionCandidate[], reference: string): StockVisionCandidate | null {
  const wanted = reference.trim().toLowerCase();
  return candidates.find(candidate => candidate.reference.trim().toLowerCase() === wanted) ?? null;
}

function unreadable(quality: 'TOO_DARK' | 'BLURRY' | 'NOT_STOCK'): StockVisionResult {
  return {
    quality,
    itemId: null,
    itemConfidence: 0,
    visibleUnits: 0,
    layers: null,
    columns: null,
    depthRows: null,
    proposedTotal: 0,
    confidence: 0,
    method: 'OTHER',
    explanation: 'Résultat simulé : photo inexploitable.'
  };
}

/** Comptage simulé : 12 de face × 7 rangées par défaut, sinon `total` sacs de face sur une rangée. */
function counted(itemId: string | null, total: number | null, confidence: number | null): StockVisionResult {
  if (total === null) {
    return {
      quality: 'OK',
      itemId,
      itemConfidence: itemId ? 0.95 : 0,
      visibleUnits: DEFAULT_FRONT,
      layers: null,
      columns: null,
      depthRows: DEFAULT_DEPTH,
      proposedTotal: DEFAULT_TOTAL,
      confidence: confidence ?? DEFAULT_CONFIDENCE,
      method: 'SACKS_STACKED',
      explanation: `Résultat simulé : ${DEFAULT_FRONT} sacs de face sur ${DEFAULT_DEPTH} rangées.`
    };
  }
  const whole = Number.isInteger(total);
  return {
    quality: 'OK',
    itemId,
    itemConfidence: itemId ? 0.95 : 0,
    visibleUnits: whole ? total : Math.max(0, Math.floor(total)),
    layers: null,
    columns: null,
    depthRows: whole ? 1 : null,
    proposedTotal: total,
    confidence: confidence ?? DEFAULT_CONFIDENCE,
    method: whole ? 'SACKS_STACKED' : 'OTHER',
    explanation: `Résultat simulé : total de ${total}.`
  };
}

/** Attend l'abandon du signal (directive `fake:timeout`). */
function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => reject(new VisionCallError('TIMEOUT', 'délai simulé'));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });
}

export interface FakeVisionProviderOptions {
  timeoutMs?: number;
}

export class FakeVisionProvider implements StockVisionProvider {
  readonly id = 'fake' as const;
  readonly model = FAKE_VISION_MODEL;
  private readonly timeoutMs: number;

  constructor(options: FakeVisionProviderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? env.STOCK_VISION_TIMEOUT_MS;
  }

  analyze(request: StockVisionRequest, signal: AbortSignal): Promise<StockVisionOutcome> {
    const meta = { provider: this.id, model: this.model, timeoutMs: this.timeoutMs };
    return runVisionCall(meta, request, signal, async callSignal => {
      const directive = parseFakeDirective(request.fakeDirective);
      if (!directive) throw new VisionCallError('INVALID_OUTPUT', 'directive simulée illisible');
      switch (directive.kind) {
        case 'QUALITY':
          return unreadable(directive.quality);
        case 'UNKNOWN':
          return counted(null, null, null);
        case 'FAIL':
          throw new VisionCallError('PROVIDER_ERROR', 'échec simulé');
        case 'TIMEOUT':
          return waitForAbort(callSignal);
        case 'INVALID': {
          const { method: _method, ...withoutMethod } = counted(
            firstByReference(request.candidates)?.id ?? null,
            null,
            null
          );
          return withoutMethod;
        }
        case 'ITEM': {
          const item = directive.reference
            ? findByReference(request.candidates, directive.reference)
            : firstByReference(request.candidates);
          return counted(item?.id ?? null, directive.total, directive.confidence);
        }
        case 'DEFAULT':
        default:
          return counted(firstByReference(request.candidates)?.id ?? null, null, null);
      }
    });
  }
}
