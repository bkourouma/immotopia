import type { Request, Response } from 'express';
import { z } from 'zod';
import { t } from '../i18n';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { FORM_REGISTRY } from '../lib/form-settings/registry';
import { findUnlockAuthors, listUnlocks, setUnlock, tenantExists } from '../lib/form-settings/settings-store';
import { findForm } from './form-settings-controller';

/**
 * Déverrouillage, par le super-admin, des champs « sous condition » (GATED)
 * d'une agence (contrat §5). Monté sous `/api/admin` (déjà authentifié) ;
 * permissions PLATFORM_TENANTS_VIEW / EDIT posées par le routeur.
 */

export const setFormUnlockSchema = z
  .object({
    formKey: z.string().min(1).max(200),
    fieldKey: z.string().min(1).max(200),
    unlocked: z.boolean(),
    reason: z.string().trim().max(500).optional()
  })
  .strict();

async function assertTenant(tenantId: string | undefined): Promise<string> {
  if (!tenantId || !(await tenantExists(tenantId))) throw new NotFoundError(t('Agence introuvable.'));
  return tenantId;
}

/** Le compte ne porte qu'un nom complet : prénom = premier mot, nom = le reste. */
function splitAuthor(author: { id: string; fullName: string | null; email: string }) {
  const [firstName = '', ...rest] = (author.fullName ?? '').trim().split(/\s+/);
  return { id: author.id, firstName, lastName: rest.join(' '), email: author.email };
}

/** GET /api/admin/tenants/:tenantId/form-unlocks : champs GATED du registre et leur état. */
export const listFormUnlocksHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await assertTenant(req.params.tenantId);
  const rows = await listUnlocks(tenantId);
  const byField = new Map(rows.map(row => [`${row.formKey}\u0000${row.fieldKey}`, row]));
  const authors = await findUnlockAuthors(rows.map(row => row.unlockedById));

  const entries = Object.values(FORM_REGISTRY).flatMap(form =>
    form.fields
      .filter(field => field.fieldClass === 'GATED')
      .map(field => {
        const row = byField.get(`${form.formKey}\u0000${field.key}`);
        const author = row ? authors.get(row.unlockedById) : undefined;
        return {
          formKey: form.formKey,
          formLabel: t(form.label),
          module: form.module,
          fieldKey: field.key,
          fieldLabel: t(field.label),
          consequence: t(field.consequence),
          unlocked: Boolean(row),
          ...(author ? { unlockedBy: splitAuthor(author) } : {}),
          ...(row ? { unlockedAt: row.createdAt.toISOString() } : {}),
          ...(row?.reason ? { reason: row.reason } : {})
        };
      })
  );
  res.json({ success: true, data: { entries } });
});

/** PUT /api/admin/tenants/:tenantId/form-unlocks : `{ formKey, fieldKey, unlocked, reason? }`. */
export const setFormUnlockHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = setFormUnlockSchema.parse(req.body);
  const tenantId = await assertTenant(req.params.tenantId);
  const form = findForm(input.formKey);
  const field = form.fields.find(candidate => candidate.key === input.fieldKey);
  if (!field) throw new BadRequestError(t('Champ inconnu : {{fieldKey}}.', { fieldKey: input.fieldKey }));
  if (field.fieldClass !== 'GATED') {
    throw new BadRequestError(t("Ce champ n'est pas soumis à déverrouillage."));
  }
  const userId = req.user?.userId;
  if (!userId) throw new BadRequestError('Utilisateur requis.');

  await setUnlock({
    tenantId,
    formKey: form.formKey,
    fieldKey: field.key,
    unlocked: input.unlocked,
    reason: input.reason || undefined,
    userId
  });
  res.json({ success: true, data: { formKey: form.formKey, fieldKey: field.key, unlocked: input.unlocked } });
});
