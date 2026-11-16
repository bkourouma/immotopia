import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import type { EffectiveForm, FieldMode, FormDefinition, FormRegistry } from './types';
import { isFieldMode } from './types';

/** Durée de vie d'une entrée de cache : les écritures l'invalident explicitement. */
export const FORM_MODES_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  expiresAt: number;
  registry: FormRegistry;
  value: EffectiveForm;
}

const cache = new Map<string, CacheEntry>();

const SEPARATOR = '|';

function cacheKey(tenantId: string, formKey: string): string {
  return `${tenantId}${SEPARATOR}${formKey}`;
}

async function loadRegistry(registry?: FormRegistry): Promise<FormRegistry> {
  if (registry) return registry;
  // Chargé à la demande : le registre assemble les fichiers de chaque lot Syndic.
  const module = await import('./registry');
  return module.FORM_REGISTRY;
}

function resolveMode(
  field: FormDefinition['fields'][number],
  stored: string | undefined,
  unlocked: boolean
): FieldMode {
  if (stored === undefined) return field.defaultMode;
  if (field.fieldClass === 'GATED' && !unlocked) return field.defaultMode;
  if (!isFieldMode(stored) || !field.allowedModes.includes(stored)) return field.defaultMode;
  return stored;
}

function buildEffectiveForm(
  form: FormDefinition,
  storedByKey: Map<string, string>,
  unlockedKeys: Set<string>
): EffectiveForm {
  const fields: Record<string, FieldMode> = {};
  const labels: Record<string, string> = {};
  for (const field of form.fields) {
    fields[field.key] = resolveMode(field, storedByKey.get(field.key), unlockedKeys.has(field.key));
    labels[field.key] = field.label;
  }
  const value: EffectiveForm = { formKey: form.formKey, fields };
  Object.defineProperty(value, 'labels', { value: labels, enumerable: false });
  return value;
}

/**
 * Modes effectifs d'un formulaire pour une agence : réglage de l'agence si le champ est
 * `OPEN`, ou `GATED` et déverrouillé ; sinon comportement actuel (`defaultMode`).
 * Mis en cache 30 s par agence et formulaire. `formKey` inconnu : `NotFoundError`.
 */
export async function getEffectiveFieldModes(
  tenantId: string,
  formKey: string,
  registry?: FormRegistry
): Promise<EffectiveForm> {
  const reg = await loadRegistry(registry);
  const form = reg[formKey];
  if (!form) throw new NotFoundError(t('Formulaire introuvable.'));

  const key = cacheKey(tenantId, formKey);
  const hit = cache.get(key);
  if (hit && hit.registry === reg && hit.expiresAt > Date.now()) return hit.value;

  const hasGated = form.fields.some(field => field.fieldClass === 'GATED');
  let value: EffectiveForm;
  try {
    const [settings, unlocks] = await Promise.all([
      prisma.tenantFormFieldSetting.findMany({
        where: { tenantId, formKey },
        select: { fieldKey: true, mode: true }
      }),
      hasGated
        ? prisma.tenantFormFieldUnlock.findMany({
            where: { tenantId, formKey },
            select: { fieldKey: true }
          })
        : Promise.resolve([] as Array<{ fieldKey: string }>)
    ]);
    value = buildEffectiveForm(
      form,
      new Map(settings.map(row => [row.fieldKey, row.mode])),
      new Set(unlocks.map(row => row.fieldKey))
    );
  } catch (error) {
    // Dégradation sûre : comportement d'avant (le plus strict), sans mise en cache.
    logger.warn('Lecture des réglages de formulaire impossible, modes par défaut appliqués', {
      tenantId,
      formKey,
      error: error instanceof Error ? error.message : String(error)
    });
    return buildEffectiveForm(form, new Map(), new Set());
  }

  cache.set(key, { expiresAt: Date.now() + FORM_MODES_CACHE_TTL_MS, registry: reg, value });
  return value;
}

/**
 * Invalide le cache : celui d'un formulaire de l'agence, ou de tous ses formulaires.
 * Appelé par les écritures (réglage de l'agence, déverrouillage du super-admin).
 */
export function invalidateFieldModes(tenantId: string, formKey?: string): void {
  if (formKey) {
    cache.delete(cacheKey(tenantId, formKey));
    return;
  }
  const prefix = `${tenantId}${SEPARATOR}`;
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
