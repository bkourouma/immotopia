/**
 * Carnet des preneurs — lot 040, B2.
 *
 * Le preneur est la personne qui emporte la marchandise lors d'une sortie ou
 * d'un transfert. Elle n'a pas de compte. Le carnet est minimal à dessein
 * (spec §10) : nom complet, équipe ou entreprise, téléphone facultatif et
 * effaçable, lien facultatif vers un employé OU un tâcheron de l'agence.
 *
 * - Pas de suppression : un preneur se désactive (B2-R4), ses sorties restent
 *   lisibles et ses bons gardent son nom.
 * - Pas de doublon silencieux (B2-R5) : un preneur actif de même nom
 *   (insensible à la casse et aux accents) et de même équipe lève
 *   `409 STOCK_TAKER_DUPLICATE` avec `data.existingTakerId`.
 * - Minimisation à la lecture (B2-R6) : le téléphone n'est rendu qu'à un
 *   détenteur de STOCK_TAKERS_MANAGE ; `phone = null` sinon.
 * - Tout identifiant d'employé ou de tâcheron reçu est vérifié par
 *   `assertBelongsToTenant` (B2-R2) : une référence d'une autre agence lève la
 *   même `NotFoundError` qu'un objet inexistant.
 *
 * Les événements d'audit (`STOCK_TAKER_CREATED`, `STOCK_TAKER_UPDATED`) ne
 * sont pas critiques : le contrôleur les écrit APRÈS la transaction
 * (`logAuditEvent`, B6-R5), à partir de ce que renvoient ces fonctions. Le
 * catalogue masque `phone` (`redact: ['phone']`).
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { BadRequestError, ErrorCode, NotFoundError } from '../../middleware/error-middleware';
import { assertBelongsToTenant } from '../../utils/tenant-ownership';
import { stockError } from './stock-controles';
import type { PrismaLike, StockCallerContext, TakerView } from './types-040-controle';

// ---------------------------------------------------------------------------
// Libellés et normalisation
// ---------------------------------------------------------------------------

/**
 * Forme de comparaison d'un nom : minuscules, sans accents, espaces réduits.
 * C'est elle que porte `StockTaker.normalizedName` (data-model §2.5).
 */
export function normalizeTakerName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Équipe comparée comme le nom ; vide ou absente valent la même chose. */
function normalizeTeam(value: string | null | undefined): string {
  return typeof value === 'string' ? normalizeTakerName(value) : '';
}

/** Texte facultatif élagué : une chaîne vide n'est pas une valeur. */
function optionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Téléphone : format libre, normalisé — espaces réduits, séparateurs usuels
 * (points, tirets, parenthèses) ramenés à des espaces. Vide → `null`.
 */
export function normalizeTakerPhone(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value
    .replace(/[.\-()/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** « Koné Ibrahim — Équipe maçonnerie », ou le nom seul sans équipe. */
export function formatTakerLabel(fullName: string, teamOrCompany?: string | null): string {
  return teamOrCompany ? `${fullName} — ${teamOrCompany}` : fullName;
}

// ---------------------------------------------------------------------------
// Conversion Prisma -> contrat
// ---------------------------------------------------------------------------

/** Ce que les lectures du carnet chargent avec un preneur. */
export const TAKER_VIEW_SELECT = {
  id: true,
  fullName: true,
  teamOrCompany: true,
  phone: true,
  employeeId: true,
  contractorId: true,
  isActive: true,
  createdAt: true,
  employee: { select: { fullName: true } },
  contractor: { select: { fullName: true } }
} as const;

interface TakerRow {
  id: string;
  fullName: string;
  teamOrCompany: string | null;
  phone: string | null;
  employeeId: string | null;
  contractorId: string | null;
  isActive: boolean;
  createdAt: Date;
  employee?: { fullName: string } | null;
  contractor?: { fullName: string } | null;
}

/** Un preneur vu par l'appelant : téléphone masqué sans STOCK_TAKERS_MANAGE (B2-R6). */
export function toTakerView(row: TakerRow, ctx: Pick<StockCallerContext, 'canManageTakers'>): TakerView {
  return {
    id: row.id,
    label: formatTakerLabel(row.fullName, row.teamOrCompany),
    fullName: row.fullName,
    teamOrCompany: row.teamOrCompany ?? null,
    phone: ctx.canManageTakers ? (row.phone ?? null) : null,
    employeeId: row.employeeId ?? null,
    contractorId: row.contractorId ?? null,
    linkedPersonLabel: row.employee?.fullName ?? row.contractor?.fullName ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt
  };
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Le carnet de l'agence, trié par nom. `onlyActive` vaut vrai par défaut
 * (contrat) ; la recherche porte sur le nom et l'équipe.
 */
export async function listStockTakers(
  tenantId: string,
  ctx: Pick<StockCallerContext, 'canManageTakers'>,
  filters?: { onlyActive?: boolean; search?: string },
  db: PrismaLike = prisma
): Promise<TakerView[]> {
  const onlyActive = filters?.onlyActive ?? true;
  const search = filters?.search?.trim();
  const rows = await db.stockTaker.findMany({
    where: {
      tenantId,
      ...(onlyActive ? { isActive: true } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' as const } },
              { normalizedName: { contains: normalizeTakerName(search) } },
              { teamOrCompany: { contains: search, mode: 'insensitive' as const } }
            ]
          }
        : {})
    },
    select: TAKER_VIEW_SELECT,
    orderBy: [{ fullName: 'asc' }, { createdAt: 'asc' }]
  });
  return rows.map(row => toTakerView(row, ctx));
}

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

/** Ce qu'une écriture du carnet rend : la vue, et l'état complet pour l'audit du contrôleur. */
export interface TakerWriteResult {
  taker: TakerView;
  /** Champs modifiés `{ champ: { before, after } }` ; vide à la création. */
  changes: Record<string, { before: unknown; after: unknown }>;
  /** Champs enregistrés, pour la charge de l'audit (`phone` y est masqué par le catalogue). */
  snapshot: {
    fullName: string;
    teamOrCompany: string | null;
    phone: string | null;
    employeeId: string | null;
    contractorId: string | null;
    isActive: boolean;
  };
}

/** Vérifie l'employé et le tâcheron reçus : même 404 qu'un objet inexistant pour une autre agence. */
async function assertLinkedPeople(
  tx: PrismaTransactionClient,
  tenantId: string,
  employeeId: string | null | undefined,
  contractorId: string | null | undefined
): Promise<void> {
  await assertBelongsToTenant(tx, 'employee', employeeId, tenantId, { message: 'Employé introuvable.' });
  await assertBelongsToTenant(tx, 'contractor', contractorId, tenantId, { message: 'Tâcheron introuvable.' });
}

/**
 * Refuse un doublon actif : même nom normalisé, même équipe normalisée
 * (B2-R5). `excludeId` écarte le preneur corrigé lui-même.
 */
async function assertNoDuplicate(
  tx: PrismaTransactionClient,
  tenantId: string,
  normalizedName: string,
  teamOrCompany: string | null,
  excludeId?: string
): Promise<void> {
  const candidates = await tx.stockTaker.findMany({
    where: {
      tenantId,
      normalizedName,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true, teamOrCompany: true },
    orderBy: { createdAt: 'asc' }
  });
  const team = normalizeTeam(teamOrCompany);
  const existing = candidates.find(candidate => normalizeTeam(candidate.teamOrCompany) === team);
  if (existing) {
    throw stockError(409, ErrorCode.STOCK_TAKER_DUPLICATE, 'Un preneur actif porte déjà ce nom dans cette équipe.', {
      existingTakerId: existing.id
    });
  }
}

/** Ajoute un preneur au carnet. */
export async function createStockTakerTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  input: {
    fullName: string;
    teamOrCompany?: string | null;
    phone?: string | null;
    employeeId?: string | null;
    contractorId?: string | null;
    createdByUserId: string;
  },
  ctx: Pick<StockCallerContext, 'canManageTakers'>
): Promise<TakerWriteResult> {
  const fullName = optionalText(input.fullName);
  if (!fullName || fullName.length < 2) {
    throw new BadRequestError('Le nom complet du preneur compte au moins 2 caractères.');
  }
  const teamOrCompany = optionalText(input.teamOrCompany);
  const phone = normalizeTakerPhone(input.phone);
  const employeeId = input.employeeId ?? null;
  const contractorId = input.contractorId ?? null;
  if (employeeId && contractorId) {
    throw new BadRequestError('Liez le preneur à un employé ou à un tâcheron, pas aux deux.');
  }

  await assertLinkedPeople(tx, tenantId, employeeId, contractorId);
  const normalizedName = normalizeTakerName(fullName);
  await assertNoDuplicate(tx, tenantId, normalizedName, teamOrCompany);

  const created = await tx.stockTaker.create({
    data: {
      tenantId,
      fullName,
      normalizedName,
      teamOrCompany,
      phone,
      employeeId,
      contractorId,
      createdByUserId: input.createdByUserId
    },
    select: TAKER_VIEW_SELECT
  });

  return {
    taker: toTakerView(created, ctx),
    changes: {},
    snapshot: { fullName, teamOrCompany, phone, employeeId, contractorId, isActive: created.isActive }
  };
}

/**
 * Corrige, désactive ou réactive un preneur, ou efface son téléphone
 * (`phone: null`). Lier à un employé détache le tâcheron, et inversement : un
 * preneur n'est jamais lié aux deux.
 */
export async function updateStockTakerTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  takerId: string,
  patch: {
    fullName?: string;
    teamOrCompany?: string | null;
    phone?: string | null;
    employeeId?: string | null;
    contractorId?: string | null;
    isActive?: boolean;
  },
  ctx: Pick<StockCallerContext, 'canManageTakers'>
): Promise<TakerWriteResult> {
  const existing = await tx.stockTaker.findFirst({
    where: { id: takerId, tenantId },
    select: { ...TAKER_VIEW_SELECT, normalizedName: true }
  });
  if (!existing) {
    throw new NotFoundError('Preneur introuvable.');
  }

  if (patch.employeeId && patch.contractorId) {
    throw new BadRequestError('Liez le preneur à un employé ou à un tâcheron, pas aux deux.');
  }

  const next = {
    fullName: existing.fullName,
    teamOrCompany: existing.teamOrCompany ?? null,
    phone: existing.phone ?? null,
    employeeId: existing.employeeId ?? null,
    contractorId: existing.contractorId ?? null,
    isActive: existing.isActive
  };

  if (patch.fullName !== undefined) {
    const fullName = optionalText(patch.fullName);
    if (!fullName || fullName.length < 2) {
      throw new BadRequestError('Le nom complet du preneur compte au moins 2 caractères.');
    }
    next.fullName = fullName;
  }
  if (patch.teamOrCompany !== undefined) {
    next.teamOrCompany = optionalText(patch.teamOrCompany);
  }
  if (patch.phone !== undefined) {
    next.phone = normalizeTakerPhone(patch.phone);
  }
  if (patch.employeeId !== undefined) {
    next.employeeId = patch.employeeId;
    if (patch.employeeId) {
      next.contractorId = null;
    }
  }
  if (patch.contractorId !== undefined) {
    next.contractorId = patch.contractorId;
    if (patch.contractorId) {
      next.employeeId = null;
    }
  }
  if (patch.isActive !== undefined) {
    next.isActive = patch.isActive;
  }

  // Seuls les liens CHANGÉS se vérifient : un lien inchangé a été vérifié à sa pose.
  await assertLinkedPeople(
    tx,
    tenantId,
    next.employeeId !== existing.employeeId ? next.employeeId : null,
    next.contractorId !== existing.contractorId ? next.contractorId : null
  );

  const normalizedName = normalizeTakerName(next.fullName);
  const identityChanged =
    normalizedName !== existing.normalizedName ||
    normalizeTeam(next.teamOrCompany) !== normalizeTeam(existing.teamOrCompany);
  const reactivated = next.isActive && !existing.isActive;
  if (next.isActive && (identityChanged || reactivated)) {
    await assertNoDuplicate(tx, tenantId, normalizedName, next.teamOrCompany, takerId);
  }

  const changes: TakerWriteResult['changes'] = {};
  const before: Record<string, unknown> = {
    fullName: existing.fullName,
    teamOrCompany: existing.teamOrCompany ?? null,
    phone: existing.phone ?? null,
    employeeId: existing.employeeId ?? null,
    contractorId: existing.contractorId ?? null,
    isActive: existing.isActive
  };
  for (const [key, value] of Object.entries(next)) {
    if (before[key] !== value) {
      changes[key] = { before: before[key], after: value };
    }
  }

  const updated =
    Object.keys(changes).length === 0
      ? existing
      : await tx.stockTaker.update({
          where: { id: takerId, tenantId },
          data: { ...next, normalizedName },
          select: TAKER_VIEW_SELECT
        });

  return { taker: toTakerView(updated, ctx), changes, snapshot: next };
}
