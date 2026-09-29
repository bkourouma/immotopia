import { ForbiddenError, NotFoundError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { t } from '../../../i18n';
import type { CopilotToolContext, CopilotToolOutcome } from '../contracts';

/** Plafonds des sorties d'outil envoyées au LLM (plan §4, lot D). */
export const MAX_TOOL_ITEMS = 10;
export const MAX_MODEL_RESULT_BYTES = 8 * 1024;

/** Refuse l'exécution si la permission de l'outil manque (défense en profondeur). */
export function assertToolPermission(ctx: CopilotToolContext, permission: string): void {
  if (!ctx.permissions.has(permission)) {
    throw new ForbiddenError(t("Vous n'avez pas la permission d'utiliser cet outil."));
  }
}

/**
 * Ramène un résultat sous `MAX_MODEL_RESULT_BYTES` : retire des éléments de la
 * liste `items` en queue jusqu'à tenir, et marque `truncated`.
 */
export function capModelResult(result: Record<string, unknown>): Record<string, unknown> {
  const size = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (size(result) <= MAX_MODEL_RESULT_BYTES) return result;
  const items = Array.isArray(result.items) ? [...(result.items as unknown[])] : [];
  const next: Record<string, unknown> = { ...result, truncated: true };
  while (items.length > 0) {
    items.pop();
    next.items = items;
    if (size(next) <= MAX_MODEL_RESULT_BYTES) return next;
  }
  return { truncated: true };
}

/** Enveloppe un résultat : plafond de taille appliqué, événement d'interface facultatif. */
export function outcome(
  modelResult: Record<string, unknown>,
  uiEvent?: CopilotToolOutcome['uiEvent']
): CopilotToolOutcome {
  return uiEvent ? { modelResult: capModelResult(modelResult), uiEvent } : { modelResult: capModelResult(modelResult) };
}

export function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? MAX_TOOL_ITEMS, 1), MAX_TOOL_ITEMS);
}

/** Date `YYYY-MM-DD` (UTC) ou null. */
export function isoDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export interface LeaseSummary {
  id: string;
  leaseNumber: string;
  currency: string;
  propertyLabel: string;
  renterName: string | null;
}

/**
 * Charge un bail de l'agence avec une projection minimale (jamais d'e-mail).
 * @throws NotFoundError si le bail n'existe pas ou appartient à une autre agence.
 */
export async function loadLeaseSummary(tenantId: string, leaseId: string): Promise<LeaseSummary> {
  const lease = await prisma.rentalLease.findFirst({
    where: { id: leaseId, tenant_id: tenantId },
    select: {
      id: true,
      lease_number: true,
      currency: true,
      property: { select: { internalReference: true, title: true } },
      primaryRenter: { select: { user: { select: { fullName: true } } } }
    }
  });
  if (!lease) throw new NotFoundError(t('Bail introuvable.'));
  return {
    id: lease.id,
    leaseNumber: lease.lease_number,
    currency: lease.currency,
    propertyLabel: lease.property ? `${lease.property.internalReference} — ${lease.property.title}` : '',
    renterName: lease.primaryRenter?.user?.fullName ?? null
  };
}
