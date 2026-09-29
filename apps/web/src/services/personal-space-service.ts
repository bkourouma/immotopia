import apiClient from '../utils/api-client';

/**
 * Espace personnel en libre-service (lot 4 — specs/026-particuliers-libre-service).
 * Contrats : `plan.md`, section « Contrats API des sous-lots 4B et 4D ».
 * Réseau uniquement via `utils/api-client`.
 */

/** Pays de l'UEMOA acceptés par `POST /api/personal-space`, avec leur indicatif. */
export const UEMOA_COUNTRIES = [
  { code: 'CI', dial: '225' },
  { code: 'SN', dial: '221' },
  { code: 'BF', dial: '226' },
  { code: 'ML', dial: '223' },
  { code: 'NE', dial: '227' },
  { code: 'TG', dial: '228' },
  { code: 'BJ', dial: '229' },
  { code: 'GW', dial: '245' }
] as const;

export type UemoaCountryCode = (typeof UEMOA_COUNTRIES)[number]['code'];

export interface CreatePersonalSpaceInput {
  displayName: string;
  country: UemoaCountryCode;
  phone?: string;
}

export interface PersonalSpaceCreated {
  tenantId: string;
  slug: string;
  name: string;
}

/** Clé de cache de l'usage, à invalider après création ou archivage d'un actif et après une montée de palier. */
export const ASSET_USAGE_QUERY_KEY = 'patrimoine-usage';

export type AssetUsagePlan = 'FREE' | 'PAID' | 'AGENCY';

export interface UpgradeOffer {
  target: 'PARTICULIER_PLUS';
  priceMonthly: number;
  currency: 'XOF';
  limit: number;
}

/** `GET /api/tenants/:tenantId/patrimoine/usage`. */
export interface AssetUsage {
  plan: AssetUsagePlan;
  limit: number | null;
  used: number;
  canAdd: boolean;
  upgrade: UpgradeOffer | null;
}

/** `POST /api/tenants/:tenantId/subscription/upgrade`. */
export interface UpgradeStarted {
  invoiceId: string;
  checkoutUrl: string | null;
  code: string;
}

/** Codes d'erreur métier des routes ci-dessus (`response.data.code`). */
export const PERSONAL_SPACE_ERROR = {
  EXISTS: 'PERSONAL_SPACE_EXISTS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  SIGNUP_UNAVAILABLE: 'SIGNUP_UNAVAILABLE',
  FREE_TIER_LIMIT: 'FREE_TIER_LIMIT',
  ALREADY_ON_TARGET: 'ALREADY_ON_TARGET',
  PAYMENT_IN_PROGRESS: 'PAYMENT_IN_PROGRESS',
  PHONE_REQUIRED: 'PHONE_REQUIRED'
} as const;

interface ApiErrorShape {
  status?: number;
  code?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/** Statut, code métier et données d'une erreur Axios ; tout est facultatif (erreur réseau). */
export function readApiError(error: unknown): ApiErrorShape {
  const response = (
    error as {
      response?: { status?: number; data?: { code?: unknown; message?: unknown; data?: unknown } };
    } | null
  )?.response;
  const body = response?.data;
  return {
    status: response?.status,
    code: typeof body?.code === 'string' ? body.code : undefined,
    message: typeof body?.message === 'string' ? body.message : undefined,
    data: body?.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : undefined
  };
}

export async function createPersonalSpace(
  input: CreatePersonalSpaceInput,
  idempotencyKey: string
): Promise<PersonalSpaceCreated> {
  const response = await apiClient.post<{ data: PersonalSpaceCreated }>('/personal-space', input, {
    headers: { 'Idempotency-Key': idempotencyKey }
  });
  return response.data.data;
}

export async function getAssetUsage(tenantId: string): Promise<AssetUsage> {
  const response = await apiClient.get<{ data: AssetUsage }>(`/tenants/${tenantId}/patrimoine/usage`);
  return response.data.data;
}

export async function startPersonalUpgrade(
  tenantId: string,
  target: UpgradeOffer['target'] = 'PARTICULIER_PLUS'
): Promise<UpgradeStarted> {
  const response = await apiClient.post<{ data: UpgradeStarted }>(`/tenants/${tenantId}/subscription/upgrade`, {
    target
  });
  return response.data.data;
}

/** Type et téléphone de contact de l'espace, lus dans la fiche de l'espace (`GET /tenants/:tenantId`). */
export async function getTenantIdentity(
  tenantId: string
): Promise<{ type: string | null; contactPhone: string | null }> {
  const response = await apiClient.get<{ data?: { type?: string | null; contactPhone?: string | null } }>(
    `/tenants/${tenantId}`
  );
  const tenant = response.data?.data;
  return { type: tenant?.type ?? null, contactPhone: tenant?.contactPhone ?? null };
}

/** Renseigne le téléphone de contact de l'espace (`PATCH /tenants/:tenantId`, `TENANT_SETTINGS_EDIT`). */
export async function updateTenantContactPhone(tenantId: string, contactPhone: string): Promise<void> {
  await apiClient.patch(`/tenants/${tenantId}`, { contactPhone });
}

/**
 * Validation du téléphone, alignée sur `isValidUemoaPhone`
 * (packages/api/src/services/personal-space/schemas.ts) : format
 * international à indicatif UEMOA, 8 à 15 chiffres indicatif compris. Le
 * serveur reste juge. Dans ce fichier plutôt qu'à part : un module partagé de
 * plus devient un chunk de plus dans la table de préchargement du chunk
 * d'entrée (budget §8.1, `npm run measure:entry`).
 */
const PHONE_MIN_DIGITS = 8;
const PHONE_MAX_DIGITS = 15;

/** `+225 07 12 34 56 78` devient `+2250712345678` (espaces, points, tirets, parenthèses tolérés). */
export function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s.\-()]/g, '');
}

export function isValidUemoaPhone(raw: string): boolean {
  const normalized = normalizePhone(raw);
  if (!/^\+\d+$/.test(normalized)) return false;
  const digits = normalized.slice(1);
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) return false;
  return UEMOA_COUNTRIES.some(country => digits.startsWith(country.dial));
}
