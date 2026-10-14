import crypto from 'crypto';
import { env } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { maskPhone } from '../../phone/e164';
import { CAPTURE_MAX_BYTES } from '../capture-files';
import { MediaFetchError, type WhatsappTransport } from '../types';
import { assertMediaUrlAllowed, systemHostLookup, type HostLookup } from './media-guard';
import { boundOutboundMessage, toMetaMessageBody } from './message-limits';
import { recordOutboundMessage } from './log-transport';

/**
 * Transport `meta` : API Graph de WhatsApp Cloud (lot 041, spec W1-R4 à R7,
 * W6-R9).
 *
 * - Envoi : `POST {base}/{version}/{phone-number-id}/messages`, jeton
 *   `Bearer`, bornes de Meta appliquées avant l'envoi ; un échec est réessayé
 *   UNE fois après 2 s, puis journalisé dans `StockWhatsappMessage.sendError`.
 * - Accusé de lecture sur la même route ; un échec ne bloque jamais.
 * - Médias : `GET /{version}/{media-id}`, puis l'URL rendue, après la garde
 *   SSRF, sans suivre de redirection, 10 Mo au plus, empreinte Meta vérifiée.
 *
 * Chaque appel porte un `AbortSignal` de 10 s et `redirect: 'manual'`. Le
 * client HTTP est injectable : les tests n'appellent jamais le réseau.
 * Aucun journal ne contient le jeton, une URL signée, le texte d'un message ni
 * un numéro en clair (`maskPhone`).
 */

export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;

export type MetaTransportConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphBaseUrl: string;
  graphVersion: string;
  mediaHosts: readonly string[];
};

export type MetaTransportDeps = {
  fetch?: HttpFetch;
  lookup?: HostLookup;
  sleep?: (ms: number) => Promise<void>;
  config?: MetaTransportConfig;
};

export const META_HTTP_TIMEOUT_MS = 10_000;
export const META_SEND_RETRY_DELAY_MS = 2_000;
export const META_MEDIA_MAX_BYTES = CAPTURE_MAX_BYTES;

const DEFAULT_MEDIA_HOSTS = ['lookaside.fbsbx.com'];

/** Identifiant de média Meta accepté dans une URL de l'API Graph (aucune barre, aucun point-virgule). */
const MEDIA_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

/** Configuration lue dans `env` ; `src/config/env.ts` exige ces variables en transport `meta`. */
export function metaTransportConfigFromEnv(): MetaTransportConfig {
  return {
    accessToken: env.META_WA_ACCESS_TOKEN ?? '',
    phoneNumberId: env.META_WA_PHONE_NUMBER_ID ?? '',
    graphBaseUrl: env.META_WA_GRAPH_BASE_URL.replace(/\/+$/, ''),
    graphVersion: env.META_WA_GRAPH_VERSION,
    mediaHosts: env.META_WA_MEDIA_HOSTS ?? DEFAULT_MEDIA_HOSTS
  };
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/** Résumé d'une réponse d'erreur de Meta, sans rien qui vienne de la requête. */
async function describeHttpError(response: Response): Promise<string> {
  let code = '';
  try {
    const body = (await response.json()) as { error?: { code?: unknown; error_subcode?: unknown } };
    if (body?.error && (typeof body.error.code === 'number' || typeof body.error.code === 'string')) {
      code = ` (code Meta ${String(body.error.code)}${
        body.error.error_subcode !== undefined ? `/${String(body.error.error_subcode)}` : ''
      })`;
    }
  } catch {
    // Corps illisible : le statut suffit.
  }
  return `HTTP ${response.status}${code}`;
}

/** Une empreinte annoncée par Meta (hexadécimale ou base64) vaut-elle celle des octets reçus ? */
export function providerShaMatches(provider: string, buffer: Buffer): boolean {
  const digest = crypto.createHash('sha256').update(buffer).digest();
  const trimmed = provider.trim();
  const candidates: Buffer[] = [];
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) candidates.push(Buffer.from(trimmed, 'hex'));
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(trimmed)) {
    candidates.push(Buffer.from(trimmed.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  }
  return candidates.some(candidate => candidate.length === digest.length && crypto.timingSafeEqual(candidate, digest));
}

/** Lit un corps de réponse en s'arrêtant au-delà de `max` octets. */
async function readBodyCapped(response: Response, max: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) {
    await response.body?.cancel().catch(() => undefined);
    throw new MediaFetchError('TOO_LARGE', 'Média de plus de 10 Mo.');
  }
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > max) throw new MediaFetchError('TOO_LARGE', 'Média de plus de 10 Mo.');
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new MediaFetchError('TOO_LARGE', 'Média de plus de 10 Mo.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

export function createMetaTransport(deps: MetaTransportDeps = {}): WhatsappTransport {
  const httpFetch: HttpFetch = deps.fetch ?? ((url, init) => fetch(url, init));
  const lookup = deps.lookup ?? systemHostLookup;
  const sleep = deps.sleep ?? defaultSleep;
  const config = (): MetaTransportConfig => deps.config ?? metaTransportConfigFromEnv();

  const authHeaders = (cfg: MetaTransportConfig): Record<string, string> => ({
    Authorization: `Bearer ${cfg.accessToken}`
  });

  const messagesUrl = (cfg: MetaTransportConfig) =>
    `${cfg.graphBaseUrl}/${cfg.graphVersion}/${encodeURIComponent(cfg.phoneNumberId)}/messages`;

  /** Un `POST /messages` ; rend l'identifiant du message, ou lève une erreur décrite. */
  async function postMessages(cfg: MetaTransportConfig, body: Record<string, unknown>): Promise<string | null> {
    const response = await httpFetch(messagesUrl(cfg), {
      method: 'POST',
      headers: { ...authHeaders(cfg), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(META_HTTP_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(await describeHttpError(response));
    try {
      const json = (await response.json()) as { messages?: Array<{ id?: unknown }> };
      const id = json?.messages?.[0]?.id;
      return typeof id === 'string' ? id : null;
    } catch {
      return null;
    }
  }

  function describeFailure(error: unknown): string {
    if (isAbortError(error)) return 'Délai de 10 s dépassé';
    if (error instanceof Error && /^HTTP \d{3}/.test(error.message)) return error.message;
    return 'Erreur réseau';
  }

  return {
    id: 'meta',

    async send({ toE164, message, log }) {
      const cfg = config();
      const bounded = boundOutboundMessage(message);
      const body = toMetaMessageBody(toE164, bounded);
      let result: { metaMessageId: string | null; error: string | null };
      try {
        result = { metaMessageId: await postMessages(cfg, body), error: null };
      } catch (firstError) {
        // W1-R7 : un seul nouvel essai, 2 s plus tard.
        await sleep(META_SEND_RETRY_DELAY_MS);
        try {
          result = { metaMessageId: await postMessages(cfg, body), error: null };
        } catch (secondError) {
          result = { metaMessageId: null, error: describeFailure(secondError) };
          logger.warn('Inventaire WhatsApp : envoi Meta en échec après un nouvel essai', {
            to: maskPhone(toE164),
            first: describeFailure(firstError),
            second: result.error
          });
        }
      }
      if (log) await recordOutboundMessage(log, bounded, result);
      return result;
    },

    async markRead(metaMessageId) {
      try {
        const cfg = config();
        await postMessages(cfg, { messaging_product: 'whatsapp', status: 'read', message_id: metaMessageId });
      } catch (error) {
        logger.warn('Inventaire WhatsApp : accusé de lecture Meta en échec', { error: describeFailure(error) });
      }
    },

    async fetchMedia(mediaId) {
      const cfg = config();
      if (!MEDIA_ID_PATTERN.test(mediaId)) {
        throw new MediaFetchError('NOT_FOUND', 'Identifiant de média invalide.');
      }

      // 1. Métadonnées : URL signée (5 minutes), type, empreinte, taille.
      let meta: { url?: unknown; mime_type?: unknown; sha256?: unknown; file_size?: unknown };
      try {
        const response = await httpFetch(`${cfg.graphBaseUrl}/${cfg.graphVersion}/${encodeURIComponent(mediaId)}`, {
          method: 'GET',
          headers: authHeaders(cfg),
          redirect: 'manual',
          signal: AbortSignal.timeout(META_HTTP_TIMEOUT_MS)
        });
        if (response.status === 404 || response.status === 400) {
          throw new MediaFetchError('NOT_FOUND', 'Média inconnu de Meta.');
        }
        if (!response.ok) throw new MediaFetchError('HTTP', `Métadonnées du média : HTTP ${response.status}.`);
        meta = (await response.json()) as typeof meta;
      } catch (error) {
        if (error instanceof MediaFetchError) throw error;
        if (isAbortError(error)) throw new MediaFetchError('TIMEOUT', 'Métadonnées du média : délai dépassé.');
        throw new MediaFetchError('HTTP', 'Métadonnées du média illisibles.');
      }
      if (typeof meta?.url !== 'string' || meta.url.length === 0) {
        throw new MediaFetchError('NOT_FOUND', 'Média sans URL de téléchargement.');
      }
      const announcedSize = Number(meta.file_size);
      if (Number.isFinite(announcedSize) && announcedSize > META_MEDIA_MAX_BYTES) {
        throw new MediaFetchError('TOO_LARGE', 'Média de plus de 10 Mo.');
      }
      const declaredMimeType = typeof meta.mime_type === 'string' ? meta.mime_type : 'application/octet-stream';
      const providerSha256 = typeof meta.sha256 === 'string' && meta.sha256.length > 0 ? meta.sha256 : null;

      // 2. Garde SSRF AVANT tout appel vers l'URL rendue.
      const url = await assertMediaUrlAllowed(meta.url, cfg.mediaHosts, lookup);

      // 3. Téléchargement immédiat, borné.
      let buffer: Buffer;
      try {
        const response = await httpFetch(url.toString(), {
          method: 'GET',
          headers: authHeaders(cfg),
          redirect: 'manual',
          signal: AbortSignal.timeout(META_HTTP_TIMEOUT_MS)
        });
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel().catch(() => undefined);
          throw new MediaFetchError('HTTP', 'Redirection refusée au téléchargement du média.');
        }
        if (response.status === 404) throw new MediaFetchError('NOT_FOUND', 'Média expiré ou introuvable.');
        if (!response.ok) throw new MediaFetchError('HTTP', `Téléchargement du média : HTTP ${response.status}.`);
        buffer = await readBodyCapped(response, META_MEDIA_MAX_BYTES);
      } catch (error) {
        if (error instanceof MediaFetchError) throw error;
        if (isAbortError(error)) throw new MediaFetchError('TIMEOUT', 'Téléchargement du média : délai dépassé.');
        throw new MediaFetchError('HTTP', 'Téléchargement du média interrompu.');
      }

      // 4. Empreinte annoncée par Meta, sur le fichier REÇU (avant retrait de l'EXIF).
      if (providerSha256 && !providerShaMatches(providerSha256, buffer)) {
        logger.warn('Inventaire WhatsApp : empreinte du média différente de celle annoncée par Meta', {
          sizeBytes: buffer.length
        });
        throw new MediaFetchError('HTTP', 'Empreinte du média différente de celle annoncée par Meta.');
      }

      return { buffer, declaredMimeType, providerSha256 };
    }
  };
}
