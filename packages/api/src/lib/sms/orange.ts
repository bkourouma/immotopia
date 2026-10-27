import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import type { SmsTransport } from './types';

/**
 * Transport Orange (SMS API CI). Vérifié contre
 * developer.orange.com/apis/sms/getting-started : jeton
 * `POST {base}/oauth/v3/token` (grant_type=client_credentials, réponse
 * `access_token` + `expires_in` en secondes, valable 1 h) ; envoi
 * `POST {base}/smsmessaging/v1/outbound/{senderAddress encodé}/requests`
 * (corps `outboundSMSMessageRequest`, réponse 201 avec `resourceURL`).
 *
 * Le jeton, le secret, le texte et le numéro ne sont jamais journalisés ;
 * `send` ne lève jamais. `fetch` est lu à l'exécution (mockable).
 */

const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_SAFETY_MARGIN_MS = 60_000;

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

/** Oublie le jeton mémorisé (tests). */
export function resetOrangeTokenForTests(): void {
  cachedToken = null;
}

function baseUrl(): string {
  return env.ORANGE_SMS_API_BASE_URL.replace(/\/+$/, '');
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await globalThis.fetch(url, { ...init, signal: controller.signal, redirect: 'error' });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await response.text());
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
    this.name = 'HttpStatusError';
  }
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.accessToken;
  const clientId = env.ORANGE_SMS_CLIENT_ID;
  const clientSecret = env.ORANGE_SMS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('IdentifiantsManquants');
  // À CONFIRMER : la doc parle de « authorization_header » sans le détailler ;
  // la convention Orange est « Basic base64(client_id:client_secret) ».
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetchWithTimeout(`${baseUrl()}/oauth/v3/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) throw new HttpStatusError(response.status);
  const data = await readJson(response);
  const accessToken = typeof data?.access_token === 'string' ? data.access_token : undefined;
  if (!accessToken) throw new Error('JetonManquant');
  // La doc donne `expires_in` en chaîne ("3600") : accepté en nombre ou en chaîne.
  const rawExpires = Number(data?.expires_in);
  const expiresIn = Number.isFinite(rawExpires) && rawExpires > 0 ? rawExpires : 3600;
  cachedToken = { accessToken, expiresAt: Date.now() + expiresIn * 1000 - TOKEN_SAFETY_MARGIN_MS };
  return accessToken;
}

function lastSegment(url: string): string | undefined {
  const last = url.replace(/\/+$/, '').split('/').pop();
  return last || undefined;
}

export function createOrangeSmsTransport(): SmsTransport {
  return {
    id: 'orange',
    async send({ to, text }) {
      try {
        const senderAddress = env.ORANGE_SMS_SENDER_ADDRESS;
        if (!senderAddress) throw new Error('ExpediteurManquant');
        const token = await getToken();
        const request: Record<string, unknown> = {
          address: `tel:${to}`,
          senderAddress,
          outboundSMSTextMessage: { message: text }
        };
        // Doc : `senderName` facultatif (11 caractères alphanumériques ou
        // espaces, nom préalablement approuvé par Orange, sinon HTTP 400).
        if (env.ORANGE_SMS_SENDER_NAME) request.senderName = env.ORANGE_SMS_SENDER_NAME;
        const response = await fetchWithTimeout(
          `${baseUrl()}/smsmessaging/v1/outbound/${encodeURIComponent(senderAddress)}/requests`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({ outboundSMSMessageRequest: request })
          }
        );
        if (!response.ok) {
          // Jeton expiré avant l'heure (HTTP 401, code 42) : oublié pour le prochain envoi.
          if (response.status === 401) cachedToken = null;
          throw new HttpStatusError(response.status);
        }
        const data = await readJson(response);
        const inner = data?.outboundSMSMessageRequest as Record<string, unknown> | undefined;
        const resourceUrl = typeof inner?.resourceURL === 'string' ? inner.resourceURL : undefined;
        return { ok: true, providerMessageId: resourceUrl ? lastSegment(resourceUrl) : undefined };
      } catch (error) {
        logger.warn('SMS (orange) : envoi échoué', {
          provider: 'orange',
          cause: error instanceof HttpStatusError ? error.message : error instanceof Error ? error.name : 'Erreur'
        });
        return { ok: false, reason: 'SEND_FAILED' };
      }
    }
  };
}
