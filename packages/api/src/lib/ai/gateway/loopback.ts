import { env } from '../../../config/env';
import { createAbortError } from '../providers/anthropic-provider';

/**
 * Appel de l'API par elle-même (loopback), sous l'identité de l'utilisateur.
 *
 * L'URL de base est FIXE : `127.0.0.1` et le `PORT` de `config/env.ts`. Jamais
 * une URL, un hôte ou un port venant du modèle ou de la requête. Seul le chemin
 * est composé, depuis une entrée du catalogue.
 */

export const LOOPBACK_TIMEOUT_MS = 10_000;
/** Délai d'une écriture confirmée (plus long qu'une lecture : calculs, génération de pièces). */
export const LOOPBACK_WRITE_TIMEOUT_MS = 30_000;
/** Octets lus au plus : au-delà, la réponse est refusée (le modèle doit filtrer ou paginer). */
export const LOOPBACK_MAX_BODY_BYTES = 2 * 1024 * 1024;

let baseUrlForTests: string | null = null;

/** Tests seulement : vise une mini-app sur un port éphémère. Refusé hors `NODE_ENV=test`. */
export function setLoopbackBaseUrlForTests(url: string | null): void {
  if (env.NODE_ENV !== 'test') throw new Error('setLoopbackBaseUrlForTests est réservé aux tests.');
  baseUrlForTests = url;
}

export function loopbackBaseUrl(): string {
  return baseUrlForTests ?? `http://127.0.0.1:${env.PORT}`;
}

export interface LoopbackResponse {
  status: number;
  contentType: string;
  /** Corps lu (texte), tronqué à `LOOPBACK_MAX_BODY_BYTES`. */
  text: string;
  tooLarge: boolean;
}

export class LoopbackTimeoutError extends Error {
  constructor() {
    super('loopback timeout');
    this.name = 'LoopbackTimeoutError';
  }
}

async function readCapped(response: Response): Promise<{ text: string; tooLarge: boolean }> {
  if (!response.body) return { text: '', tooLarge: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > LOOPBACK_MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { text: '', tooLarge: true };
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), tooLarge: false };
}

/**
 * GET loopback. `headers` porte l'authentification de l'utilisateur : jamais
 * journalisée ici, jamais renvoyée. Abandon par `signal` (relève l'erreur
 * d'abandon de l'appelant) ; dépassement de `LOOPBACK_TIMEOUT_MS` ->
 * `LoopbackTimeoutError`. Les redirections ne sont pas suivies.
 */
export async function loopbackGet(args: {
  pathAndQuery: string;
  headers: Record<string, string>;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<LoopbackResponse> {
  const timeout = AbortSignal.timeout(args.timeoutMs ?? LOOPBACK_TIMEOUT_MS);
  const signal = AbortSignal.any([args.signal, timeout]);
  try {
    const response = await fetch(`${loopbackBaseUrl()}${args.pathAndQuery}`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...args.headers },
      redirect: 'manual',
      signal
    });
    const { text, tooLarge } = await readCapped(response);
    return { status: response.status, contentType: response.headers.get('content-type') ?? '', text, tooLarge };
  } catch (error) {
    // Abandon de l'appelant : erreur d'abandon normalisée (celle que l'orchestrateur reconnaît).
    if (args.signal.aborted) throw createAbortError();
    if (timeout.aborted) throw new LoopbackTimeoutError();
    throw error;
  }
}

/**
 * Écriture loopback (POST/PUT/PATCH), RÉSERVÉE à l'exécution confirmée par un humain
 * (`actions/execute-capability.ts`) : aucun outil du modèle ne l'importe. `headers` porte
 * l'authentification de l'utilisateur QUI CONFIRME. Corps JSON, délai
 * `LOOPBACK_WRITE_TIMEOUT_MS`, redirections non suivies. Pas de relance automatique :
 * une écriture n'est jamais rejouée (après un délai, elle a pu aboutir).
 */
export async function loopbackWrite(args: {
  method: 'POST' | 'PUT' | 'PATCH';
  pathAndQuery: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<LoopbackResponse> {
  const timeout = AbortSignal.timeout(args.timeoutMs ?? LOOPBACK_WRITE_TIMEOUT_MS);
  const signal = AbortSignal.any([args.signal, timeout]);
  try {
    const response = await fetch(`${loopbackBaseUrl()}${args.pathAndQuery}`, {
      method: args.method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...args.headers },
      body: JSON.stringify(args.body ?? {}),
      redirect: 'manual',
      signal
    });
    const { text, tooLarge } = await readCapped(response);
    return { status: response.status, contentType: response.headers.get('content-type') ?? '', text, tooLarge };
  } catch (error) {
    if (args.signal.aborted) throw createAbortError();
    if (timeout.aborted) throw new LoopbackTimeoutError();
    throw error;
  }
}
