/**
 * Appel d'un modèle de vision, partagé par les fonctionnalités qui lisent une
 * image (spec 041 : photos de stock ; spec 047 : captures de paiement).
 *
 * Ce module ne connaît AUCUNE consigne ni AUCUN schéma métier : l'appelant
 * fournit la validation de la sortie (`finalize`). Il garantit seulement :
 * - abandon au premier des deux : le signal de l'appelant ou le délai ;
 * - le texte rendu est lu comme du JSON puis validé par l'appelant ;
 * - ne lève JAMAIS : toute erreur devient une issue `ok: false` ;
 * - ni l'image, ni la réponse brute, ni une clé ne sortent d'ici.
 */

export type VisionFailureReason = 'TIMEOUT' | 'PROVIDER_ERROR' | 'INVALID_OUTPUT' | 'DISABLED';

/**
 * Échec typé d'un appel au fournisseur. Le message ne contient jamais la
 * réponse brute, l'image ni une clé : il peut être journalisé.
 */
export class VisionCallError extends Error {
  constructor(
    readonly reason: Exclude<VisionFailureReason, 'DISABLED'>,
    message: string
  ) {
    super(message);
    this.name = 'VisionCallError';
  }
}

export type VisionCallMeta = { provider: string; model: string; timeoutMs: number };

export type VisionOutcome<T> =
  | { ok: true; result: T; provider: string; model: string; latencyMs: number }
  | { ok: false; reason: VisionFailureReason; provider: string; model: string; latencyMs: number };

/** Ce qu'un fournisseur reçoit : consigne, image et schéma JSON de la sortie attendue. */
export interface VisionPayload {
  prompt: string;
  image: Buffer;
  mimeType: string;
  jsonSchema: Record<string, unknown>;
  /** Nom du schéma chez OpenRouter (lettres, chiffres, souligné). */
  schemaName: string;
}

export type VisionFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Erreur levée par `fetch` (ou un client simulé) à l'abandon du signal. */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    ((error as { name?: unknown }).name === 'AbortError' || (error as { name?: unknown }).name === 'TimeoutError')
  );
}

/**
 * Exécute un appel de fournisseur avec ses garanties communes. `call` rend la
 * sortie de l'IA, en texte JSON ou déjà lue ; il lève `VisionCallError` pour un
 * échec qualifié. `finalize` valide la sortie lue et rend `null` si elle est
 * invalide (`INVALID_OUTPUT`).
 */
export async function runVisionCall<T>(
  meta: VisionCallMeta,
  signal: AbortSignal,
  call: (signal: AbortSignal) => Promise<unknown>,
  finalize: (raw: unknown) => T | null
): Promise<VisionOutcome<T>> {
  const startedAt = Date.now();
  const done = (outcome: { ok: true; result: T } | { ok: false; reason: VisionFailureReason }): VisionOutcome<T> => ({
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
    const result = finalize(raw);
    if (result === null) return done({ ok: false, reason: 'INVALID_OUTPUT' });
    return done({ ok: true, result });
  } catch {
    // Filet : rien ne doit remonter à l'appelant (« ne lève jamais »).
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
