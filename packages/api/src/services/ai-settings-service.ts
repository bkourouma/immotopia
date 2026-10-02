import { z } from 'zod';
import { env, fakeProviderAllowed } from '../config/env';
import { t } from '../i18n';
import { ValidationError } from '../middleware/error-middleware';
import { AuditActionKey } from '../types/audit-types';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { recordAuditEvent } from './audit-service';

/**
 * Réglage ImmoCopilot de la plateforme (fournisseur, modèle, effort, repli).
 *
 * Ordre de priorité : ligne `PlatformAiSettings` (édition super-admin) puis
 * variables `AI_*` de l'environnement, qui servent de VALEURS PAR DÉFAUT.
 * Les CLÉS API (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`) ne vivent qu'en
 * environnement : ce service n'en lit que la PRÉSENCE (booléen) et n'en
 * renvoie, ni n'en journalise, jamais aucun fragment.
 */

export const AI_PROVIDER_IDS = ['disabled', 'fake', 'anthropic', 'openrouter'] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];
export const AI_EFFORTS = ['low', 'medium', 'high'] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

const SETTINGS_ID = 'default';
const CONFIG_CACHE_TTL_MS = 30_000;
const MODELS_CACHE_TTL_MS = 10 * 60_000;
const MODELS_FETCH_TIMEOUT_MS = 5_000;

export const aiSettingsInputSchema = z
  .object({
    provider: z.enum(AI_PROVIDER_IDS),
    model: z.string().trim().min(1).max(200),
    effort: z.enum(AI_EFFORTS),
    refusalFallback: z.boolean()
  })
  .strict();
export type AiSettingsInput = z.infer<typeof aiSettingsInputSchema>;

export interface EffectiveAiConfig extends AiSettingsInput {
  source: 'database' | 'environment';
  updatedAt: Date | null;
}

export interface AiProviderAvailability {
  id: AiProviderId;
  label: string;
  available: boolean;
  reason?: string;
}

export interface AiSettingsView {
  provider: AiProviderId;
  model: string;
  effort: AiEffort;
  refusalFallback: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
  providers: AiProviderAvailability[];
  keys: { openrouter: boolean; anthropic: boolean };
  source: 'database' | 'environment';
}

export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number | null;
}

// --- Configuration effective --------------------------------------------------

function fromEnvironment(): EffectiveAiConfig {
  return {
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    effort: env.AI_EFFORT,
    refusalFallback: env.AI_REFUSAL_FALLBACK !== 'off',
    source: 'environment',
    updatedAt: null
  };
}

let configCache: { value: EffectiveAiConfig; expiresAt: number } | null = null;

/** Vide le cache de configuration (mise à jour, tests). */
export function invalidateAiConfigCache(): void {
  configCache = null;
}

/** Ligne en base si elle existe et est valide, sinon valeurs d'environnement. Cache de 30 s. */
export async function getEffectiveAiConfig(): Promise<EffectiveAiConfig> {
  const now = Date.now();
  if (configCache && configCache.expiresAt > now) return configCache.value;

  let value = fromEnvironment();
  try {
    const row = await prisma.platformAiSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (row) {
      const parsed = aiSettingsInputSchema.safeParse({
        provider: row.provider,
        model: row.model,
        effort: row.effort,
        refusalFallback: row.refusalFallback
      });
      if (parsed.success) {
        value = { ...parsed.data, source: 'database', updatedAt: row.updatedAt };
      } else {
        logger.warn("ImmoCopilot : réglage en base invalide, valeurs d'environnement utilisées");
      }
    }
  } catch (error) {
    // Base indisponible ou migration pas encore appliquée : l'assistant garde le comportement d'environnement.
    logger.warn("ImmoCopilot : lecture du réglage impossible, valeurs d'environnement utilisées", {
      errorName: error instanceof Error ? error.name : typeof error
    });
  }
  configCache = { value, expiresAt: now + CONFIG_CACHE_TTL_MS };
  return value;
}

// --- Disponibilité des fournisseurs -------------------------------------------

/** Présence des clés (booléens uniquement : la valeur ne sort jamais de `env`). */
export function aiKeysPresent(): { openrouter: boolean; anthropic: boolean } {
  return { openrouter: Boolean(env.OPENROUTER_API_KEY), anthropic: Boolean(env.ANTHROPIC_API_KEY) };
}

export function listAiProviders(): AiProviderAvailability[] {
  const keys = aiKeysPresent();
  const missingKey = t('Clé API absente du serveur.');
  return [
    { id: 'disabled', label: t('Désactivé'), available: true },
    !fakeProviderAllowed(process.env.NODE_ENV)
      ? { id: 'fake', label: t('Faux fournisseur (tests)'), available: false, reason: t('Interdit en production.') }
      : { id: 'fake', label: t('Faux fournisseur (tests)'), available: true },
    keys.anthropic
      ? { id: 'anthropic', label: 'Anthropic', available: true }
      : { id: 'anthropic', label: 'Anthropic', available: false, reason: missingKey },
    keys.openrouter
      ? { id: 'openrouter', label: 'OpenRouter', available: true }
      : { id: 'openrouter', label: 'OpenRouter', available: false, reason: missingKey }
  ];
}

/**
 * Le fournisseur désigné peut-il réellement servir ? Garde d'exécution : un
 * réglage en base ne doit jamais contourner « fake interdit en production »
 * ni faire planter l'assistant quand une clé manque.
 */
export function isProviderUsable(config: Pick<AiSettingsInput, 'provider' | 'model'>): boolean {
  switch (config.provider) {
    case 'disabled':
      return false;
    case 'fake':
      return fakeProviderAllowed(process.env.NODE_ENV);
    case 'anthropic':
      return Boolean(env.ANTHROPIC_API_KEY);
    case 'openrouter':
      return Boolean(env.OPENROUTER_API_KEY) && config.model.includes('/');
    default:
      return false;
  }
}

// --- Lecture / écriture --------------------------------------------------------

export async function getAiSettingsView(): Promise<AiSettingsView> {
  const config = await getEffectiveAiConfig();
  let updatedByName: string | null = null;
  if (config.source === 'database') {
    const row = await prisma.platformAiSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { updatedBy: { select: { fullName: true, email: true } } }
    });
    updatedByName = row?.updatedBy?.fullName || row?.updatedBy?.email || null;
  }
  return {
    provider: config.provider,
    model: config.model,
    effort: config.effort,
    refusalFallback: config.refusalFallback,
    updatedAt: config.updatedAt ? config.updatedAt.toISOString() : null,
    updatedByName,
    providers: listAiProviders(),
    keys: aiKeysPresent(),
    source: config.source
  };
}

function assertSettingsAllowed(input: AiSettingsInput): void {
  const errors: Array<{ field: string; message: string }> = [];
  const keys = aiKeysPresent();
  if (input.provider === 'openrouter') {
    if (!keys.openrouter) {
      errors.push({ field: 'provider', message: t("La clé OpenRouter n'est pas configurée sur le serveur.") });
    }
    if (!input.model.includes('/')) {
      errors.push({
        field: 'model',
        message: t('Un identifiant OpenRouter est requis (fournisseur/modèle, ex. anthropic/claude-sonnet-4.5).')
      });
    }
  }
  if (input.provider === 'anthropic' && !keys.anthropic) {
    errors.push({ field: 'provider', message: t("La clé Anthropic n'est pas configurée sur le serveur.") });
  }
  if (input.provider === 'fake' && !fakeProviderAllowed(process.env.NODE_ENV)) {
    errors.push({ field: 'provider', message: t('Le faux fournisseur est interdit en production.') });
  }
  if (errors.length > 0) throw new ValidationError(t('Réglage IA invalide.'), errors);
}

/** Enregistre le réglage (une seule ligne), invalide le cache et journalise sans secret. */
export async function updateAiSettings(input: AiSettingsInput, userId: string): Promise<AiSettingsView> {
  const data = aiSettingsInputSchema.parse(input);
  assertSettingsAllowed(data);

  const before = await getEffectiveAiConfig();
  // Critical action: audit trace in the same transaction as the settings write.
  await prisma.$transaction(async tx => {
    await tx.platformAiSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data, updatedById: userId },
      update: { ...data, updatedById: userId }
    });

    await recordAuditEvent(tx, {
      actorUserId: userId,
      tenantId: null,
      actionKey: AuditActionKey.AI_SETTINGS_UPDATED,
      entityType: 'PLATFORM_AI_SETTINGS',
      entityId: SETTINGS_ID,
      payload: {
        before: {
          provider: before.provider,
          model: before.model,
          effort: before.effort,
          refusalFallback: before.refusalFallback,
          source: before.source
        },
        after: data
      }
    });
  });
  invalidateAiConfigCache();

  return getAiSettingsView();
}

// --- Catalogue de modèles OpenRouter --------------------------------------------

export type ModelsFetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

let modelsCache: { models: OpenRouterModel[]; expiresAt: number } | null = null;

/** Vide tous les caches du service (tests). */
export function resetAiSettingsCaches(): void {
  configCache = null;
  modelsCache = null;
}

/**
 * Catalogue public d'OpenRouter (sans clé). Ne lève jamais : en cas d'échec,
 * liste vide et `unavailable: true` (l'interface bascule alors en saisie libre).
 */
export async function listOpenRouterModels(
  fetchImpl: ModelsFetch = (url, init) => fetch(url, init)
): Promise<{ models: OpenRouterModel[]; unavailable: boolean }> {
  const now = Date.now();
  if (modelsCache && modelsCache.expiresAt > now) return { models: modelsCache.models, unavailable: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODELS_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${env.OPENROUTER_BASE_URL.replace(/\/+$/, '')}/models`, {
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const body = (await response.json()) as { data?: unknown };
    const rows = Array.isArray(body.data) ? body.data : [];
    const models: OpenRouterModel[] = [];
    for (const row of rows) {
      const item = row as { id?: unknown; name?: unknown; context_length?: unknown };
      if (typeof item.id !== 'string' || !item.id) continue;
      models.push({
        id: item.id,
        name: typeof item.name === 'string' && item.name ? item.name : item.id,
        contextLength:
          typeof item.context_length === 'number' && Number.isFinite(item.context_length) ? item.context_length : null
      });
    }
    models.sort((a, b) => a.name.localeCompare(b.name));
    modelsCache = { models, expiresAt: now + MODELS_CACHE_TTL_MS };
    return { models, unavailable: false };
  } catch (error) {
    logger.warn('ImmoCopilot : catalogue OpenRouter indisponible', {
      errorName: error instanceof Error ? error.name : typeof error
    });
    return { models: [], unavailable: true };
  } finally {
    clearTimeout(timer);
  }
}
