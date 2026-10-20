import apiClient from '../utils/api-client';
import type { LotType } from '../types/syndic-types';

/**
 * Barème par type de lot d'une copropriété (menu lot 2) : montant PAR LOT et
 * par type de lot, paramétré une fois par l'administrateur puis appliqué
 * automatiquement par le mode de répartition « Par type de lot ».
 * Contrat : `packages/api/src/routes/syndic-charge-schedules-routes.ts`
 * (`GET` et `PUT .../syndics/:syndicId/bareme-types-lots`).
 */

export type LotTypeRates = Partial<Record<LotType, number>>;

export interface LotTypeRatesView {
  /** Montant par lot, par type. Un type absent n'a pas de montant. */
  rates: LotTypeRates;
  /** Nombre de lots de la copropriété par type de lot présent. */
  lotTypesPresent: Array<{ lotType: LotType; count: number }>;
  /** Types présents dans la copropriété sans montant au barème. */
  missingTypes: LotType[];
  /** Aucun montant enregistré. */
  isEmpty: boolean;
  updatedAt: string | null;
}

const url = (tenantId: string, syndicId: string) => `/tenants/${tenantId}/syndics/${syndicId}/bareme-types-lots`;

export async function getLotTypeRates(tenantId: string, syndicId: string): Promise<LotTypeRatesView> {
  const response = await apiClient.get<{ success: boolean; data: LotTypeRatesView }>(url(tenantId, syndicId));
  return response.data.data;
}

/** Remplace le barème (PUT) : au moins un montant, montants >= 0. */
export async function updateLotTypeRates(
  tenantId: string,
  syndicId: string,
  rates: LotTypeRates
): Promise<LotTypeRatesView> {
  const response = await apiClient.put<{ success: boolean; data: LotTypeRatesView }>(url(tenantId, syndicId), {
    rates
  });
  return response.data.data;
}
