/**
 * Adaptateur Yousign API v3 (spec 044, lot S6) : implémentation de référence,
 * remplaçable, de `ExternalSignatureClient`.
 *
 * Sources lues le 16/10/2026 : documentation développeur Yousign, désormais servie
 * sous developers.youtrust.com (redirection 301 depuis developers.yousign.com).
 *
 * NON VÉRIFIÉ (à valider en sandbox avant toute mise en production) :
 *  1. Unité et origine des coordonnées `x`/`y`/`width`/`height` du champ de signature
 *     (points ? origine en haut à gauche ?) : voir DEFAULT_SIGNATURE_BOX.
 *  2. Téléchargement du document signé : `GET .../documents/download?version=completed`
 *     renvoie un PDF ou un ZIP ; la doc ne dit pas quand. Seul un PDF (signature `%PDF`)
 *     est accepté ; un ZIP lève INVALID_RESPONSE (une seule pièce téléversée, donc PDF attendu).
 *  3. Dossier de preuve : `GET .../audit_trails/download?merge=true` ; route « restreinte par
 *     défaut » (activation à demander au support Yousign), réservée aux demandes `done`.
 *  4. Date de signature par signataire : absente de la réponse de la demande ; `signedAt`
 *     vaut toujours null (la date de fin de demande n'est pas celle d'un signataire).
 *  5. Annulation d'une demande déjà terminée : le code HTTP renvoyé n'est pas documenté ;
 *     on relit donc l'état pour décider (voir cancel()).
 *  6. Suppression d'une demande brouillon (nettoyage après échec) : `DELETE /signature_requests/{id}`
 *     figure à l'index de la doc, corps et effet non lus ; opération best effort.
 *  7. Ordre de signature : `ordered_signers: true` + `insert_after_id` du signataire précédent ;
 *     l'effet exact sur l'ordre n'a pas été éprouvé.
 *  8. Langue arabe : `locale` n'accepte pas `ar` (en, fr, de, it, nl, es, pl, pt, ro) ni
 *     `audit_trail_locale` ; repli sur `fr` (ARABIC_FALLBACK_LOCALE).
 *  9. Nom de famille obligatoire (1 à 255 caractères) : un nom en un seul mot est répété
 *     comme nom de famille (voir splitName).
 * 10. Niveau de signature : `electronic_signature` + `otp_email` par défaut (option
 *     `signatureLevel`). Le choix du niveau juridique relève d'un avis juridique non rendu.
 * 11. Valeurs `reason` de l'annulation : `other` utilisé (enum documenté : contractualization_aborted,
 *     errors_in_document, other).
 * 12. Fuseau et format de `expiration_date` : envoyé en UTC (`timezone: "UTC"`),
 *     `yyyy-mm-ddTHH:mm:ss`, borné entre maintenant+1 min et 364 jours.
 * 13. Les noms d'événements exploités par l'intégration (signature_request.done, .declined,
 *     .expired, .canceled, signer.done, signer.declined) sont documentés ; la liste à cocher
 *     chez Yousign est dans docs/integrations/signature-prestataire.md.
 *
 * 14. Lien de signature d'un signataire (`signature_link` de la ressource signataire) : présent
 *     seulement pour une demande en `delivery_mode: 'none'` ; lu en direct, jamais stocké ni journalisé.
 *
 * Vérifié dans la doc : bases `https://api-sandbox.yousign.app/v3` (sandbox) et
 * `https://api.yousign.app/v3` (production), authentification Bearer, routes de création,
 * document (multipart `file`, `nature=signable_document`), signataire (info, signature_level,
 * signature_authentication_mode, fields[type=signature, document_id, page, x, y, width, height]),
 * activation, annulation (`reason`), lecture, statuts, webhooks (en-tête `X-Yousign-Signature-256`
 * = `sha256=` + HMAC-SHA256 hex du corps brut ; `event_id`, `event_name`, `data.signature_request.id`).
 *
 * Aucun secret, PDF ni corps de réponse dans les messages d'erreur ou les journaux.
 */
import crypto from 'crypto';
import type {
  ExternalCreateInput,
  ExternalCreated,
  ExternalLocale,
  ExternalRequestSnapshot,
  ExternalRequestState,
  ExternalSignatureClient,
  ExternalSignerState,
  ExternalWebhookEvent
} from './types';
import { ExternalProviderError } from './types';

export const YOUSIGN_SANDBOX_BASE_URL = 'https://api-sandbox.yousign.app/v3';
export const YOUSIGN_PRODUCTION_BASE_URL = 'https://api.yousign.app/v3';
export const YOUSIGN_SIGNATURE_HEADER = 'x-yousign-signature-256';
/** Langue arabe non prise en charge par Yousign : les invitations partent en français. */
export const ARABIC_FALLBACK_LOCALE = 'fr';

/** Position par défaut du champ de signature (NON VÉRIFIÉ : unité et origine). Un cadre par signataire. */
export const DEFAULT_SIGNATURE_BOX = { page: 1, x: 40, y: 640, width: 200, height: 60, stepX: 260, stepY: 70 } as const;

export type YousignSignatureLevel =
  'electronic_signature' | 'advanced_electronic_signature' | 'qualified_electronic_signature';

export interface YousignHttpRequest {
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  json?: unknown;
  multipart?: {
    fields: Record<string, string>;
    file: { field: string; filename: string; contentType: string; content: Buffer };
  };
  timeoutMs: number;
}
export interface YousignHttpResponse {
  status: number;
  body: Buffer;
}
export type YousignHttp = (request: YousignHttpRequest) => Promise<YousignHttpResponse>;

export interface YousignClientOptions {
  apiKey?: string;
  baseUrl?: string;
  webhookSecret?: string;
  timeoutMs?: number;
  http?: YousignHttp;
  signatureLevel?: YousignSignatureLevel;
  now?: () => Date;
}

/** Plafond d'une réponse (PDF signé, dossier de preuve) : 50 Mo. */
export const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

/** Lit le corps en s'arrêtant au plafond : content-length d'abord, puis cumul des morceaux. */
async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ExternalProviderError('INVALID_RESPONSE');
  if (!response.body) return Buffer.from(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ExternalProviderError('INVALID_RESPONSE');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

/** Transport par défaut : fetch natif de Node, annulé par AbortController. Aucune redirection suivie. */
export const fetchTransport: YousignHttp = async request => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    let body: BodyInit | undefined;
    const headers = { ...request.headers };
    if (request.multipart) {
      const form = new FormData();
      for (const [key, value] of Object.entries(request.multipart.fields)) form.append(key, value);
      const file = request.multipart.file;
      form.append(file.field, new Blob([new Uint8Array(file.content)], { type: file.contentType }), file.filename);
      body = form;
    } else if (request.json !== undefined) {
      body = JSON.stringify(request.json);
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(request.url, {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
      redirect: 'error'
    });
    return { status: response.status, body: await readCapped(response, MAX_RESPONSE_BYTES) };
  } finally {
    clearTimeout(timer);
  }
};

/** Table explicite des statuts de demande Yousign. Un statut absent de la table est une erreur, jamais DONE. */
export const REQUEST_STATE_MAP: Record<string, ExternalRequestState> = {
  draft: 'ONGOING',
  approval: 'ONGOING',
  ongoing: 'ONGOING',
  paused: 'ONGOING',
  done: 'DONE',
  declined: 'DECLINED',
  rejected: 'DECLINED',
  expired: 'EXPIRED',
  canceled: 'CANCELED',
  deleted: 'CANCELED'
};

/** Statuts de signataire. `aborted` et `error` restent non signés (PENDING) : prudence. */
export const SIGNER_STATE_MAP: Record<string, ExternalSignerState> = {
  initiated: 'PENDING',
  notified: 'PENDING',
  aborted: 'PENDING',
  error: 'PENDING',
  verified: 'OPENED',
  processing: 'OPENED',
  consent_given: 'OPENED',
  signed: 'SIGNED',
  declined: 'DECLINED'
};

const TERMINAL_STATES: ExternalRequestState[] = ['DONE', 'CANCELED', 'EXPIRED', 'DECLINED'];

function mapLocale(language: ExternalLocale): 'fr' | 'en' {
  return language === 'en' ? 'en' : ARABIC_FALLBACK_LOCALE;
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? 'Signataire').slice(0, 255);
  const last = (parts.length > 1 ? parts.slice(1).join(' ') : first).slice(0, 255);
  return { first, last };
}

function formatExpiration(expiresAt: Date, now: Date): string {
  const min = now.getTime() + 60_000;
  const max = now.getTime() + 364 * 86_400_000;
  const clamped = new Date(Math.min(Math.max(expiresAt.getTime(), min), max));
  return clamped.toISOString().slice(0, 19);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    const first = Array.isArray(value) ? value[0] : value;
    return typeof first === 'string' ? first : null;
  }
  return null;
}

export function createYousignClient(options: YousignClientOptions = {}): ExternalSignatureClient {
  const apiKey = options.apiKey;
  const baseUrl = (options.baseUrl ?? YOUSIGN_SANDBOX_BASE_URL).replace(/\/+$/, '');
  const webhookSecret = options.webhookSecret;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const http = options.http ?? fetchTransport;
  const signatureLevel = options.signatureLevel ?? 'electronic_signature';
  const now = options.now ?? (() => new Date());

  async function send(
    request: Omit<YousignHttpRequest, 'url' | 'timeoutMs' | 'headers'> & { path: string }
  ): Promise<Buffer> {
    if (!apiKey) throw new ExternalProviderError('UNAUTHORIZED', null, 'Prestataire de signature : clé API absente');
    const { path, ...rest } = request;
    let response: YousignHttpResponse;
    try {
      response = await http({
        ...rest,
        url: `${baseUrl}${path}`,
        headers: { Authorization: `Bearer ${apiKey}`, Accept: '*/*' },
        timeoutMs
      });
    } catch (error) {
      if (error instanceof ExternalProviderError) throw error;
      const name = error instanceof Error ? error.name : '';
      throw new ExternalProviderError(name === 'AbortError' || name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK');
    }
    const { status } = response;
    if (status >= 200 && status < 300) return response.body;
    if (status === 401 || status === 403) throw new ExternalProviderError('UNAUTHORIZED', status);
    if (status === 404) throw new ExternalProviderError('NOT_FOUND', status);
    if (status === 429) throw new ExternalProviderError('RATE_LIMITED', status);
    if (status >= 500) throw new ExternalProviderError('SERVER', status);
    throw new ExternalProviderError('REJECTED', status);
  }

  async function sendJson(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    json?: unknown
  ): Promise<Record<string, unknown>> {
    const body = await send({ method, path, json });
    if (body.length === 0) return {};
    try {
      const parsed = asRecord(JSON.parse(body.toString('utf8')));
      if (parsed) return parsed;
    } catch {
      /* corps illisible : erreur typée ci-dessous, sans le citer */
    }
    throw new ExternalProviderError('INVALID_RESPONSE');
  }

  function idOf(payload: Record<string, unknown>): string {
    if (typeof payload.id !== 'string' || !payload.id) throw new ExternalProviderError('INVALID_RESPONSE');
    return payload.id;
  }

  async function discard(providerRef: string): Promise<void> {
    try {
      await send({ method: 'DELETE', path: `/signature_requests/${encodeURIComponent(providerRef)}` });
    } catch {
      /* best effort : l'erreur d'origine prime */
    }
  }

  async function addSigners(ref: string, documentId: string, input: ExternalCreateInput): Promise<string[]> {
    const ordered = [...input.signers].sort((a, b) => a.position - b.position);
    const refs: string[] = [];
    for (const [index, signer] of ordered.entries()) {
      const { first, last } = splitName(signer.fullName);
      const box = DEFAULT_SIGNATURE_BOX;
      const body: Record<string, unknown> = {
        info: { first_name: first, last_name: last, email: signer.email, locale: mapLocale(input.language) },
        signature_level: signatureLevel,
        signature_authentication_mode: 'otp_email',
        fields: [
          {
            type: 'signature',
            document_id: documentId,
            page: box.page,
            x: box.x + (index % 2) * box.stepX,
            y: box.y + Math.floor(index / 2) * box.stepY,
            width: box.width,
            height: box.height
          }
        ]
      };
      if (input.sequential && refs.length > 0) body.insert_after_id = refs[refs.length - 1];
      refs.push(idOf(await sendJson('POST', `/signature_requests/${encodeURIComponent(ref)}/signers`, body)));
    }
    return refs;
  }

  async function create(input: ExternalCreateInput): Promise<ExternalCreated> {
    const created = await sendJson('POST', '/signature_requests', {
      name: input.title.slice(0, 128),
      delivery_mode: input.deliveryMode ?? 'email',
      ordered_signers: input.sequential,
      timezone: 'UTC',
      expiration_date: formatExpiration(input.expiresAt, now()),
      external_id: input.requestId.replace(/[^\w\-@.%+]/g, '').slice(0, 255) || undefined,
      audit_trail_locale: mapLocale(input.language)
    });
    const providerRef = idOf(created);
    try {
      const form = await send({
        method: 'POST',
        path: `/signature_requests/${encodeURIComponent(providerRef)}/documents`,
        multipart: {
          fields: { nature: 'signable_document', name: 'document' },
          file: { field: 'file', filename: 'document.pdf', contentType: 'application/pdf', content: input.pdf }
        }
      });
      let documentId: string;
      try {
        documentId = idOf(asRecord(JSON.parse(form.toString('utf8'))) ?? {});
      } catch (error) {
        throw error instanceof ExternalProviderError ? error : new ExternalProviderError('INVALID_RESPONSE');
      }
      const signerRefs = await addSigners(providerRef, documentId, input);
      await sendJson('POST', `/signature_requests/${encodeURIComponent(providerRef)}/activate`);
      return { providerRef, signerRefs };
    } catch (error) {
      await discard(providerRef);
      throw error;
    }
  }

  async function getSnapshot(providerRef: string): Promise<ExternalRequestSnapshot> {
    const payload = await sendJson('GET', `/signature_requests/${encodeURIComponent(providerRef)}`);
    const state = typeof payload.status === 'string' ? REQUEST_STATE_MAP[payload.status] : undefined;
    if (!state || !Array.isArray(payload.signers)) throw new ExternalProviderError('INVALID_RESPONSE');
    const signers = payload.signers.map(item => {
      const signer = asRecord(item);
      const signerState = signer && typeof signer.status === 'string' ? SIGNER_STATE_MAP[signer.status] : undefined;
      if (!signer || typeof signer.id !== 'string' || !signerState) throw new ExternalProviderError('INVALID_RESPONSE');
      return { ref: signer.id, state: signerState, signedAt: null };
    });
    return { ref: idOf(payload), state, signers };
  }

  async function getSignerLink(providerRef: string, signerRef: string): Promise<string> {
    const signer = await sendJson(
      'GET',
      `/signature_requests/${encodeURIComponent(providerRef)}/signers/${encodeURIComponent(signerRef)}`
    );
    const link = signer.signature_link;
    if (typeof link !== 'string' || link.length > 2048) throw new ExternalProviderError('INVALID_RESPONSE');
    let parsed: URL;
    try {
      parsed = new URL(link);
    } catch {
      throw new ExternalProviderError('INVALID_RESPONSE');
    }
    // Seul un lien https est remis au navigateur du signataire (jamais javascript:, data:, http:).
    if (parsed.protocol !== 'https:') throw new ExternalProviderError('INVALID_RESPONSE');
    return parsed.toString();
  }

  async function cancel(providerRef: string): Promise<void> {
    try {
      await sendJson('POST', `/signature_requests/${encodeURIComponent(providerRef)}/cancel`, {
        reason: 'other',
        custom_note: 'Annulée depuis ImmoTopia'
      });
    } catch (error) {
      if (!(error instanceof ExternalProviderError)) throw error;
      if (error.code === 'NOT_FOUND') return;
      if (error.code !== 'REJECTED') throw error;
      // Déjà annulée ou terminée : le code exact n'est pas documenté, on relit l'état.
      const snapshot = await getSnapshot(providerRef);
      if (!TERMINAL_STATES.includes(snapshot.state)) throw error;
    }
  }

  async function downloadSigned(providerRef: string): Promise<Buffer> {
    const body = await send({
      method: 'GET',
      path: `/signature_requests/${encodeURIComponent(providerRef)}/documents/download?version=completed`
    });
    if (body.subarray(0, 4).toString('latin1') !== '%PDF') throw new ExternalProviderError('INVALID_RESPONSE');
    return body;
  }

  async function downloadEvidence(providerRef: string): Promise<Buffer> {
    const body = await send({
      method: 'GET',
      path: `/signature_requests/${encodeURIComponent(providerRef)}/audit_trails/download?merge=true`
    });
    if (body.subarray(0, 4).toString('latin1') !== '%PDF') throw new ExternalProviderError('INVALID_RESPONSE');
    return body;
  }

  function verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    if (!webhookSecret) return false;
    const received = headerValue(headers, YOUSIGN_SIGNATURE_HEADER);
    if (!received || !/^sha256=[0-9a-f]{64}$/i.test(received.trim())) return false;
    const expected = Buffer.from(
      `sha256=${crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex')}`,
      'utf8'
    );
    const actual = Buffer.from(received.trim().toLowerCase(), 'utf8');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  function parseWebhook(rawBody: Buffer): ExternalWebhookEvent | null {
    try {
      const payload = asRecord(JSON.parse(rawBody.toString('utf8')));
      const eventName = payload?.event_name;
      const ref = asRecord(asRecord(payload?.data)?.signature_request)?.id;
      if (typeof eventName !== 'string' || !eventName || typeof ref !== 'string' || !ref) return null;
      return { eventId: typeof payload?.event_id === 'string' ? payload.event_id : null, eventName, ref };
    } catch {
      return null;
    }
  }

  return {
    id: 'yousign',
    create,
    cancel,
    getSignerLink,
    getSnapshot,
    downloadSigned,
    downloadEvidence,
    verifyWebhook,
    parseWebhook
  };
}
