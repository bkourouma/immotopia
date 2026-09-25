import { env } from '../../../config/env';
import {
  SmsBalance,
  SmsBalanceContract,
  SmsProvider,
  SmsProviderError,
  SmsSendOptions,
  SmsSendResult,
  SmsTestConnectionResult
} from './types';

/**
 * Fournisseur SMS Orange (SMS API CI v2.0) — lot SMS-1, compte plateforme
 * unique (décision produit : pas d'identifiants propres par agence).
 *
 * OAuth2 `client_credentials` (jeton mémorisé en process jusqu'à son
 * expiration, marge de sécurité de 60 s), envoi via `smsmessaging/v1`, solde
 * via `sms/admin/v1/contracts`. Le jeton et le secret ne sont jamais
 * journalisés.
 */

const REQUEST_TIMEOUT_MS = 15000;
const TOKEN_SAFETY_MARGIN_MS = 60_000;

interface CachedToken {
  accessToken: string;
  /** Epoch ms — déjà réduit de la marge de sécurité. */
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

function getObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function getArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function getStringProp(input: Record<string, unknown> | null, key: string): string | undefined {
  if (!input) return undefined;
  const value = input[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumberProp(input: Record<string, unknown> | null, key: string): number | undefined {
  if (!input) return undefined;
  const value = input[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new SmsProviderError(
      "Impossible de contacter Orange (réseau ou délai dépassé).",
      error instanceof Error ? error.message : error
    );
  } finally {
    clearTimeout(timer);
  }
}

function baseUrl(): string {
  return env.ORANGE_SMS_API_BASE_URL.replace(/\/+$/, '');
}

async function fetchToken(): Promise<string> {
  const clientId = env.ORANGE_SMS_CLIENT_ID;
  const clientSecret = env.ORANGE_SMS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new SmsProviderError("Fournisseur Orange non configuré (identifiants manquants).");
  }

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

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // laisse `data` à null : traité comme une réponse invalide ci-dessous.
  }

  if (!response.ok) {
    throw new SmsProviderError(`Orange a refusé l'authentification (HTTP ${response.status}).`);
  }

  const obj = getObject(data);
  const accessToken = getStringProp(obj, 'access_token');
  const expiresIn = getNumberProp(obj, 'expires_in') ?? 3600;
  if (!accessToken) {
    throw new SmsProviderError("Réponse Orange invalide : jeton d'accès manquant.");
  }

  cachedToken = {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000 - TOKEN_SAFETY_MARGIN_MS
  };

  return accessToken;
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }
  return fetchToken();
}

/** Dernier segment de `resourceURL`, ex. `.../outbound/tel%3A.../requests/abc123` -> `abc123`. */
function lastSegment(url: string): string | null {
  const trimmed = url.replace(/\/+$/, '');
  const parts = trimmed.split('/');
  const last = parts[parts.length - 1];
  return last || null;
}

function mapContract(raw: unknown): SmsBalanceContract | null {
  const obj = getObject(raw);
  if (!obj) return null;
  // Format à confirmer avec un vrai compte Orange : mapping défensif, les
  // champs inconnus sont ignorés plutôt que de faire échouer la lecture.
  const availableUnits =
    getNumberProp(obj, 'availableUnits') ??
    getNumberProp(obj, 'available_units') ??
    getNumberProp(obj, 'remainingUnits') ??
    getNumberProp(obj, 'balance') ??
    0;
  return {
    country: getStringProp(obj, 'country') ?? getStringProp(obj, 'countryCode') ?? undefined,
    availableUnits,
    expiresAt: getStringProp(obj, 'expiresAt') ?? getStringProp(obj, 'expirationDate') ?? null,
    status: getStringProp(obj, 'status') ?? undefined
  };
}

export class OrangeSmsProvider implements SmsProvider {
  readonly kind = 'orange' as const;

  async sendText(options: SmsSendOptions): Promise<SmsSendResult> {
    const token = await getToken();
    const senderAddress = env.ORANGE_SMS_SENDER_ADDRESS;

    const outboundSMSTextMessage = { message: options.body };
    const outboundSMSMessageRequest: Record<string, unknown> = {
      address: `tel:${options.to}`,
      senderAddress,
      outboundSMSTextMessage
    };
    if (options.senderName) {
      outboundSMSMessageRequest.senderName = options.senderName;
    }

    const response = await fetchWithTimeout(
      `${baseUrl()}/smsmessaging/v1/outbound/${encodeURIComponent(senderAddress)}/requests`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ outboundSMSMessageRequest })
      }
    );

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // corps non JSON : traité comme une réponse invalide ci-dessous.
    }

    if (!response.ok) {
      throw new SmsProviderError(`Orange a refusé l'envoi du SMS (HTTP ${response.status}).`);
    }

    const responseRequest = getObject(getObject(data)?.outboundSMSMessageRequest);
    const resourceUrl = getStringProp(responseRequest, 'resourceURL');
    const providerMessageId = resourceUrl ? lastSegment(resourceUrl) : null;
    if (!providerMessageId) {
      throw new SmsProviderError("Réponse Orange invalide : resourceURL manquante.");
    }

    return { providerMessageId };
  }

  async getBalance(): Promise<SmsBalance | null> {
    const token = await getToken();
    const response = await fetchWithTimeout(`${baseUrl()}/sms/admin/v1/contracts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // corps non JSON : traité comme une liste vide ci-dessous.
    }

    if (!response.ok) {
      throw new SmsProviderError(`Orange a refusé la lecture du solde (HTTP ${response.status}).`);
    }

    // Forme exacte non confirmée par la documentation lue (à vérifier avec un
    // vrai compte) : on accepte un tableau à la racine, ou sous `contracts`.
    const obj = getObject(data);
    const rawList = getArray(data) ?? getArray(obj?.contracts) ?? getArray(obj?.partnerContracts) ?? [];
    const contracts = rawList.map(mapContract).filter((c): c is SmsBalanceContract => c !== null);

    return { contracts };
  }

  async testConnection(): Promise<SmsTestConnectionResult> {
    try {
      await this.getBalance();
      return { ok: true, message: 'Connexion Orange réussie.' };
    } catch (error) {
      const message = error instanceof SmsProviderError ? error.message : 'Impossible de contacter Orange.';
      return { ok: false, message };
    }
  }
}
