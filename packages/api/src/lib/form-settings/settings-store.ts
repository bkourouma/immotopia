import { prisma } from '../../utils/database';
import { recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { invalidateFieldModes } from './service';
import type { FieldMode, FormFieldDefinition } from './types';

/**
 * Accès aux deux tables de réglage des formulaires paramétrables
 * (`TenantFormFieldSetting`, `TenantFormFieldUnlock`). Tout est filtré par
 * `tenantId`. Chaque écriture invalide le cache des modes effectifs.
 *
 * Le service du moteur (`service.ts`) lit ces mêmes tables pour résoudre les
 * modes ; ici on lit/écrit pour les écrans de réglage.
 */

export interface StoredSettingRow {
  formKey: string;
  fieldKey: string;
  mode: string;
}

export interface UnlockRow {
  formKey: string;
  fieldKey: string;
  reason: string | null;
  unlockedById: string;
  createdAt: Date;
}

export interface UnlockAuthor {
  id: string;
  fullName: string | null;
  email: string;
}

/** Réglages enregistrés d'une agence (un formulaire, ou tous). */
export async function listStoredSettings(tenantId: string, formKey?: string): Promise<StoredSettingRow[]> {
  return prisma.tenantFormFieldSetting.findMany({
    where: { tenantId, ...(formKey ? { formKey } : {}) },
    select: { formKey: true, fieldKey: true, mode: true }
  });
}

/** Déverrouillages d'une agence (un formulaire, ou tous). */
export async function listUnlocks(tenantId: string, formKey?: string): Promise<UnlockRow[]> {
  return prisma.tenantFormFieldUnlock.findMany({
    where: { tenantId, ...(formKey ? { formKey } : {}) },
    select: { formKey: true, fieldKey: true, reason: true, unlockedById: true, createdAt: true }
  });
}

/** Auteurs des déverrouillages : `select` strict, jamais l'objet User complet. */
export async function findUnlockAuthors(userIds: string[]): Promise<Map<string, UnlockAuthor>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true, email: true }
  });
  return new Map(users.map(user => [user.id, user]));
}

export const unlockKey = (formKey: string, fieldKey: string) => `${formKey}\u0000${fieldKey}`;

/**
 * Mode effectif d'un champ (même règle que le service du moteur) : OPEN →
 * réglage sinon défaut ; GATED → réglage seulement si déverrouillé ; mode
 * stocké hors `allowedModes` → défaut.
 */
export function resolveFieldMode(field: FormFieldDefinition, stored: string | undefined, unlocked: boolean): FieldMode {
  if (field.fieldClass === 'GATED' && !unlocked) return field.defaultMode;
  if (stored && (field.allowedModes as string[]).includes(stored)) return stored as FieldMode;
  return field.defaultMode;
}

/**
 * Applique des changements de réglage (`null` = supprimer la ligne, retour au
 * défaut) en une transaction avec sa trace d'audit (avant/après), puis
 * invalide le cache. Renvoie les champs réellement modifiés.
 */
export async function saveFieldSettings(params: {
  tenantId: string;
  formKey: string;
  changes: Record<string, FieldMode | null>;
  userId: string | undefined;
}): Promise<Record<string, { before: string | null; after: string | null }>> {
  const { tenantId, formKey, changes, userId } = params;
  const diff: Record<string, { before: string | null; after: string | null }> = {};

  await prisma.$transaction(async tx => {
    const existing = await tx.tenantFormFieldSetting.findMany({
      where: { tenantId, formKey },
      select: { fieldKey: true, mode: true }
    });
    const before = new Map<string, string>(existing.map(row => [row.fieldKey, row.mode]));

    for (const [fieldKey, mode] of Object.entries(changes)) {
      const previous = before.get(fieldKey) ?? null;
      if (previous === mode) continue;
      diff[fieldKey] = { before: previous, after: mode };
      if (mode === null) {
        await tx.tenantFormFieldSetting.deleteMany({ where: { tenantId, formKey, fieldKey } });
      } else {
        await tx.tenantFormFieldSetting.upsert({
          where: { tenantId_formKey_fieldKey: { tenantId, formKey, fieldKey } },
          create: { tenantId, formKey, fieldKey, mode, updatedById: userId ?? null },
          update: { mode, updatedById: userId ?? null }
        });
      }
    }

    if (Object.keys(diff).length > 0) {
      await recordAuditEvent(tx, {
        tenantId,
        actorUserId: userId,
        actionKey: AuditActionKey.TENANT_FORM_FIELD_SETTINGS_UPDATED,
        entityType: 'TenantFormFieldSetting',
        entityId: formKey,
        payload: { formKey, fields: Object.keys(diff) },
        changes: diff
      });
    }
  });

  if (Object.keys(diff).length > 0) invalidateFieldModes(tenantId, formKey);
  return diff;
}

/**
 * Pose ou retire un déverrouillage (idempotent) avec sa trace d'audit
 * plateforme, puis invalide le cache. Renvoie `false` si rien n'a changé.
 */
export async function setUnlock(params: {
  tenantId: string;
  formKey: string;
  fieldKey: string;
  unlocked: boolean;
  reason?: string;
  userId: string;
}): Promise<boolean> {
  const { tenantId, formKey, fieldKey, unlocked, reason, userId } = params;
  let changed = false;

  await prisma.$transaction(async tx => {
    const current = await tx.tenantFormFieldUnlock.findFirst({
      where: { tenantId, formKey, fieldKey },
      select: { id: true, reason: true }
    });
    if (unlocked) {
      if (current) {
        // Déjà déverrouillé : seul un nouveau motif est enregistré.
        if (reason !== undefined && reason !== current.reason) {
          await tx.tenantFormFieldUnlock.update({ where: { id: current.id }, data: { reason } });
          changed = true;
        }
      } else {
        await tx.tenantFormFieldUnlock.create({
          data: { tenantId, formKey, fieldKey, reason: reason ?? null, unlockedById: userId }
        });
        changed = true;
      }
    } else if (current) {
      await tx.tenantFormFieldUnlock.deleteMany({ where: { tenantId, formKey, fieldKey } });
      changed = true;
    }

    if (changed) {
      await recordAuditEvent(tx, {
        tenantId,
        actorUserId: userId,
        actionKey: AuditActionKey.PLATFORM_FORM_FIELD_UNLOCK_CHANGED,
        entityType: 'TenantFormFieldUnlock',
        entityId: `${formKey}:${fieldKey}`,
        payload: { formKey, fieldKey, unlocked, reason: reason ?? null }
      });
    }
  });

  if (changed) invalidateFieldModes(tenantId, formKey);
  return changed;
}

/** Existence de l'agence (le tenant du chemin admin n'est pas déjà vérifié par une garde). */
export async function tenantExists(tenantId: string): Promise<boolean> {
  const row = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  return Boolean(row);
}
