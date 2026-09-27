import apiClient from '../utils/api-client';
import {
  LotAdvance,
  LotOpenChargeCall,
  LotPaymentResult,
  MonthlyTracking,
  RecordLotPaymentRequest
} from '../types/syndic-types';

/**
 * Paiements par lot, avance et suivi mensuel des charges (lot S2, besoins 4
 * et 5). Contrat : `packages/api/src/routes/syndic-lot-payments-routes.ts`.
 */

export async function recordLotPayment(
  tenantId: string,
  syndicId: string,
  lotId: string,
  data: RecordLotPaymentRequest
): Promise<LotPaymentResult> {
  const response = await apiClient.post<{ success: boolean; data: LotPaymentResult }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}/paiements`,
    data
  );
  return response.data.data;
}

/** Aperçu du même calcul, sans aucune écriture (`payment.id` vaut `null`). */
export async function previewLotPayment(
  tenantId: string,
  syndicId: string,
  lotId: string,
  data: RecordLotPaymentRequest
): Promise<LotPaymentResult> {
  const response = await apiClient.post<{ success: boolean; data: LotPaymentResult }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}/paiements/apercu`,
    data
  );
  return response.data.data;
}

export async function getLotAdvance(tenantId: string, syndicId: string, lotId: string): Promise<LotAdvance> {
  const response = await apiClient.get<{ success: boolean; data: LotAdvance }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}/avance`
  );
  return response.data.data;
}

/** Appels non soldés du lot, échéance croissante — pour les cases à cocher de la modale de paiement. */
export async function listOpenLotCharges(
  tenantId: string,
  syndicId: string,
  lotId: string
): Promise<LotOpenChargeCall[]> {
  const response = await apiClient.get<{ success: boolean; data: LotOpenChargeCall[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}/appels-ouverts`
  );
  return response.data.data;
}

export async function getMonthlyTracking(
  tenantId: string,
  syndicId: string,
  year: number
): Promise<MonthlyTracking> {
  const response = await apiClient.get<{ success: boolean; data: MonthlyTracking }>(
    `/tenants/${tenantId}/syndics/${syndicId}/suivi-mensuel`,
    { params: { year } }
  );
  return response.data.data;
}
