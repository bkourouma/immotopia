import type { Request, Response } from 'express';
import { z } from 'zod';
import { t } from '../i18n';
import { AppError, asyncHandler, BadRequestError, ErrorCode, NotFoundError } from '../middleware/error-middleware';
import { FORM_REGISTRY } from '../lib/form-settings/registry';
import { getEffectiveFieldModes } from '../lib/form-settings/service';
import {
  listStoredSettings,
  listUnlocks,
  resolveFieldMode,
  saveFieldSettings,
  unlockKey
} from '../lib/form-settings/settings-store';
import type { FieldMode, FormDefinition } from '../lib/form-settings/types';

/**
 * Réglage des formulaires paramétrables (contrat §5).
 *
 * L'agence vient TOUJOURS du chemin, après `requireTenantAccess` (jamais du
 * corps). Un champ « jamais facultatif » n'est pas dans le registre, donc
 * jamais réglable ; un champ GATED exige le déverrouillage du super-admin.
 */

const FIELD_MODES = ['REQUIRED', 'OPTIONAL', 'HIDDEN'] as const;

export const updateFormSettingsSchema = z
  .object({
    fields: z.record(z.string().min(1).max(200), z.enum(FIELD_MODES).nullable())
  })
  .strict();

function tenantIdOf(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

/** Définition du registre, ou 404 (un `formKey` inconnu ne dit rien de plus). */
export function findForm(formKey: string | undefined): FormDefinition {
  if (!formKey || !Object.prototype.hasOwnProperty.call(FORM_REGISTRY, formKey)) {
    throw new NotFoundError(t('Formulaire introuvable.'));
  }
  return FORM_REGISTRY[formKey];
}

const storedKey = (formKey: string, fieldKey: string) => `${formKey}\u0000${fieldKey}`;

function buildFormView(form: FormDefinition, stored: Map<string, string>, unlocks: Set<string>) {
  return {
    formKey: form.formKey,
    module: form.module,
    label: t(form.label),
    audience: form.audience,
    fields: form.fields.map(field => {
      // `unlocked` vaut true pour un champ OPEN (rien à déverrouiller).
      const unlocked = field.fieldClass === 'GATED' ? unlocks.has(unlockKey(form.formKey, field.key)) : true;
      const storedMode = stored.get(storedKey(form.formKey, field.key)) ?? null;
      return {
        key: field.key,
        label: t(field.label),
        consequence: t(field.consequence),
        fieldClass: field.fieldClass,
        allowedModes: field.allowedModes,
        defaultMode: field.defaultMode,
        mode: resolveFieldMode(field, storedMode ?? undefined, unlocked),
        storedMode,
        unlocked
      };
    })
  };
}

async function loadState(tenantId: string, formKey?: string) {
  const [settings, unlockRows] = await Promise.all([
    listStoredSettings(tenantId, formKey),
    listUnlocks(tenantId, formKey)
  ]);
  return {
    stored: new Map(settings.map(row => [storedKey(row.formKey, row.fieldKey), row.mode])),
    unlocks: new Set(unlockRows.map(row => unlockKey(row.formKey, row.fieldKey)))
  };
}

/** GET /api/tenants/:tenantId/settings/forms : registre complet et état de l'agence. */
export const getFormSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = tenantIdOf(req);
  const { stored, unlocks } = await loadState(tenantId);
  const forms = Object.values(FORM_REGISTRY).map(form => buildFormView(form, stored, unlocks));
  res.json({ success: true, data: { forms } });
});

/** PUT /api/tenants/:tenantId/settings/forms/:formKey : `{ fields: { [fieldKey]: mode | null } }`. */
export const updateFormSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = tenantIdOf(req);
  const form = findForm(req.params.formKey);
  const { fields } = updateFormSettingsSchema.parse(req.body);
  const { unlocks } = await loadState(tenantId, form.formKey);

  // Tout est validé avant la première écriture : un refus n'en laisse aucune.
  for (const [fieldKey, mode] of Object.entries(fields)) {
    const field = form.fields.find(candidate => candidate.key === fieldKey);
    if (!field) throw new BadRequestError(t('Champ inconnu : {{fieldKey}}.', { fieldKey }));
    if (field.fieldClass === 'GATED' && !unlocks.has(unlockKey(form.formKey, field.key))) {
      throw new AppError(
        t('Le réglage du champ {{label}} est soumis à ImmoTopia.', { label: t(field.label) }),
        403,
        ErrorCode.FORM_FIELD_LOCKED,
        undefined,
        { fieldKey }
      );
    }
    if (mode !== null && !(field.allowedModes as string[]).includes(mode)) {
      throw new BadRequestError(t('Mode non permis pour le champ {{label}}.', { label: t(field.label) }));
    }
  }

  await saveFieldSettings({
    tenantId,
    formKey: form.formKey,
    changes: fields as Record<string, FieldMode | null>,
    userId: req.user?.userId
  });

  const fresh = await loadState(tenantId, form.formKey);
  res.json({ success: true, data: buildFormView(form, fresh.stored, fresh.unlocks) });
});

/** GET /api/tenants/:tenantId/forms/:formKey/modes : modes effectifs, pour les écrans de saisie. */
export const getFormModesHandler = asyncHandler(async (req: Request, res: Response) => {
  const form = findForm(req.params.formKey);
  const data = await getEffectiveFieldModes(tenantIdOf(req), form.formKey);
  res.json({ success: true, data: { formKey: data.formKey, fields: data.fields } });
});

/** GET /api/portal/copropriete/forms/:formKey/modes : formulaires du portail copropriétaire seulement. */
export const getCoOwnerPortalFormModesHandler = asyncHandler(async (req: Request, res: Response) => {
  const scope = req.coOwnerPortal?.scope;
  if (!scope) throw new AppError('Accès portail copropriétaire refusé.', 403, ErrorCode.FORBIDDEN);
  const form = findForm(req.params.formKey);
  if (form.audience !== 'coowner-portal') throw new NotFoundError(t('Formulaire introuvable.'));
  const data = await getEffectiveFieldModes(scope.tenantId, form.formKey);
  res.json({ success: true, data: { formKey: data.formKey, fields: data.fields } });
});
