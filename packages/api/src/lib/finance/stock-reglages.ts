/**
 * Réglages de contrôle du stock — lot 040 (spec A5-R4, B2-R3, B7-R1, A9-R1 ;
 * contrat `ControlsSettings`, `ControlsSettingsPatch` ; data-model §2.2).
 *
 * Lecture (`GET /stock/settings/controls`) SANS création de ligne : une agence
 * qui n'a jamais ouvert l'écran lit les défauts (`readStockAlertSettings`,
 * fondations). Écriture (`PATCH`) : la ligne est matérialisée par
 * `ensureStockSettingsTx` (référentiel), puis mise à jour, et la décision est
 * tracée par `STOCK_CONTROLS_UPDATED` (critique, avec `changes`) dans la même
 * transaction.
 *
 * Postes « matériaux » (A9-R1) : la liste saisie, ou, si elle est vide, les
 * postes proposés (`defaultCostCategoryId`) des articles actifs. Chaque poste
 * envoyé est vérifié comme appartenant à l'agence (`assertBelongsToTenant`) :
 * une référence d'une autre agence répond 404, comme un poste inexistant.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { assertBelongsToTenant } from '../../utils/tenant-ownership';
import { recordAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { readStockAlertSettings } from './stock-alertes';
import { ensureStockSettingsTx } from './stock-referentiel';
import type { ControlsSettings, PrismaLike, StockControlsSettingsValues } from './types-040-controle';

/** Champs modifiables par `PATCH /stock/settings/controls`. */
export interface ControlsSettingsPatch {
  backdatingLimitDays?: number;
  requireTaker?: boolean;
  issueAlertAmount?: number | null;
  countVarianceAlertAmount?: number | null;
  countVarianceAlertPercent?: number | null;
  cashMaterialAlertAmount?: number | null;
  materialCostCategoryIds?: string[];
}

const PATCH_FIELDS: Array<keyof ControlsSettingsPatch> = [
  'backdatingLimitDays',
  'requireTaker',
  'issueAlertAmount',
  'countVarianceAlertAmount',
  'countVarianceAlertPercent',
  'cashMaterialAlertAmount',
  'materialCostCategoryIds'
];

/**
 * Postes réellement traités comme « matériaux » (A9-R1) : la liste saisie,
 * ou, si elle est vide, les postes proposés par les articles ACTIFS. Ne crée
 * rien ; utilisable dans la transaction d'une pièce de caisse.
 */
export async function resolveMaterialCostCategoryIds(
  db: PrismaLike,
  tenantId: string,
  configured: readonly string[]
): Promise<string[]> {
  if (configured.length > 0) {
    return [...new Set(configured)];
  }
  const items = await db.stockItem.findMany({
    where: { tenantId, isActive: true, defaultCostCategoryId: { not: null } },
    select: { defaultCostCategoryId: true }
  });
  return [...new Set(items.map(item => item.defaultCostCategoryId).filter((id): id is string => Boolean(id)))].sort();
}

/** Libellé d'un utilisateur : son nom, sinon son adresse. */
function userLabel(user: { fullName: string | null; email: string } | null | undefined): string | null {
  if (!user) {
    return null;
  }
  return user.fullName?.trim() || user.email;
}

async function readControlsTrace(
  db: PrismaLike,
  tenantId: string
): Promise<{ updatedAt: Date | null; updatedByLabel: string | null }> {
  const row = await db.stockSettings.findUnique({
    where: { tenantId },
    select: { controlsUpdatedAt: true, controlsUpdatedByUserId: true }
  });
  if (!row?.controlsUpdatedByUserId) {
    return { updatedAt: row?.controlsUpdatedAt ?? null, updatedByLabel: null };
  }
  const user = await db.user.findUnique({
    where: { id: row.controlsUpdatedByUserId },
    select: { fullName: true, email: true }
  });
  return { updatedAt: row.controlsUpdatedAt ?? null, updatedByLabel: userLabel(user) };
}

async function buildControlsSettings(
  db: PrismaLike,
  tenantId: string,
  values: StockControlsSettingsValues
): Promise<ControlsSettings> {
  const [effectiveMaterialCostCategoryIds, trace] = await Promise.all([
    resolveMaterialCostCategoryIds(db, tenantId, values.materialCostCategoryIds),
    readControlsTrace(db, tenantId)
  ]);
  return { ...values, effectiveMaterialCostCategoryIds, ...trace };
}

/** `GET /stock/settings/controls` : les réglages, défauts appliqués, sans créer de ligne. */
export async function getStockControls(tenantId: string): Promise<ControlsSettings> {
  const values = await readStockAlertSettings(prisma, tenantId);
  return buildControlsSettings(prisma, tenantId, values);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    const left = [...a].sort();
    const right = [...b].sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return a === b;
}

/**
 * `PATCH /stock/settings/controls`. Seuls les champs PRÉSENTS changent ; `null`
 * désactive une nature d'alerte. Aucune trace si rien ne change réellement.
 */
export async function updateStockControlsTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  userId: string,
  patch: ControlsSettingsPatch
): Promise<ControlsSettings> {
  if (patch.materialCostCategoryIds) {
    for (const id of [...new Set(patch.materialCostCategoryIds)]) {
      await assertBelongsToTenant(tx, 'costCategory', id, tenantId, { message: 'Poste de dépense introuvable.' });
    }
  }

  await ensureStockSettingsTx(tx, tenantId);
  const before = await readStockAlertSettings(tx, tenantId);

  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const data: Record<string, unknown> = {};
  for (const field of PATCH_FIELDS) {
    if (!(field in patch) || patch[field] === undefined) {
      continue;
    }
    const after =
      field === 'materialCostCategoryIds' ? [...new Set(patch.materialCostCategoryIds ?? [])] : patch[field];
    if (sameValue(before[field], after)) {
      continue;
    }
    changes[field] = { before: before[field], after };
    data[field] = after;
  }

  if (Object.keys(data).length > 0) {
    const now = new Date();
    const updated = await tx.stockSettings.update({
      where: { tenantId },
      data: { ...data, controlsUpdatedAt: now, controlsUpdatedByUserId: userId },
      select: { id: true }
    });
    await recordAuditEvent(tx, {
      tenantId,
      actorUserId: userId,
      actionKey: AuditActionKey.STOCK_CONTROLS_UPDATED,
      entityType: 'StockSettings',
      entityId: updated.id,
      payload: { fields: Object.keys(changes) },
      changes
    });
  }

  const values = await readStockAlertSettings(tx, tenantId);
  return buildControlsSettings(tx, tenantId, values);
}
