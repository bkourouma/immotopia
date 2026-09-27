import apiClient from '../utils/api-client';
import {
  ChargeSchedule,
  ChargeSchedulePreview,
  ChargeScheduleRun,
  CreateChargeScheduleRequest,
  DeleteChargeScheduleResult,
  ExecuteChargeScheduleResult,
  UpdateChargeScheduleRequest
} from '../types/syndic-types';

/**
 * Programmations des appels de charges automatiques et avis d'appel PDF
 * (lot S4, besoin 6). Contrat :
 * `packages/api/src/routes/syndic-charge-schedules-routes.ts`.
 */

const base = (tenantId: string, syndicId: string) => `/tenants/${tenantId}/syndics/${syndicId}`;
const scheduleBase = (tenantId: string, syndicId: string, scheduleId: string) =>
  `${base(tenantId, syndicId)}/programmations/${scheduleId}`;

export async function listChargeSchedules(tenantId: string, syndicId: string): Promise<ChargeSchedule[]> {
  const response = await apiClient.get<{ success: boolean; data: ChargeSchedule[] }>(
    `${base(tenantId, syndicId)}/programmations`
  );
  return response.data.data;
}

export async function getChargeSchedule(
  tenantId: string,
  syndicId: string,
  scheduleId: string
): Promise<ChargeSchedule> {
  const response = await apiClient.get<{ success: boolean; data: ChargeSchedule }>(
    scheduleBase(tenantId, syndicId, scheduleId)
  );
  return response.data.data;
}

export async function createChargeSchedule(
  tenantId: string,
  syndicId: string,
  data: CreateChargeScheduleRequest
): Promise<ChargeSchedule> {
  const response = await apiClient.post<{ success: boolean; data: ChargeSchedule }>(
    `${base(tenantId, syndicId)}/programmations`,
    data
  );
  return response.data.data;
}

export async function updateChargeSchedule(
  tenantId: string,
  syndicId: string,
  scheduleId: string,
  data: UpdateChargeScheduleRequest
): Promise<ChargeSchedule> {
  const response = await apiClient.patch<{ success: boolean; data: ChargeSchedule }>(
    scheduleBase(tenantId, syndicId, scheduleId),
    data
  );
  return response.data.data;
}

export async function deleteChargeSchedule(
  tenantId: string,
  syndicId: string,
  scheduleId: string
): Promise<DeleteChargeScheduleResult> {
  const response = await apiClient.delete<{ success: boolean; data: DeleteChargeScheduleResult }>(
    scheduleBase(tenantId, syndicId, scheduleId)
  );
  return response.data.data;
}

export async function pauseChargeSchedule(
  tenantId: string,
  syndicId: string,
  scheduleId: string
): Promise<ChargeSchedule> {
  const response = await apiClient.post<{ success: boolean; data: ChargeSchedule }>(
    `${scheduleBase(tenantId, syndicId, scheduleId)}/pause`,
    {}
  );
  return response.data.data;
}

export async function resumeChargeSchedule(
  tenantId: string,
  syndicId: string,
  scheduleId: string
): Promise<ChargeSchedule> {
  const response = await apiClient.post<{ success: boolean; data: ChargeSchedule }>(
    `${scheduleBase(tenantId, syndicId, scheduleId)}/reprise`,
    {}
  );
  return response.data.data;
}

export async function executeChargeScheduleNow(
  tenantId: string,
  syndicId: string,
  scheduleId: string
): Promise<ExecuteChargeScheduleResult> {
  const response = await apiClient.post<{ success: boolean; data: ExecuteChargeScheduleResult }>(
    `${scheduleBase(tenantId, syndicId, scheduleId)}/executer`,
    {}
  );
  return response.data.data;
}

export async function listChargeScheduleRuns(
  tenantId: string,
  syndicId: string,
  scheduleId: string,
  limit?: number
): Promise<ChargeScheduleRun[]> {
  const response = await apiClient.get<{ success: boolean; data: ChargeScheduleRun[] }>(
    `${scheduleBase(tenantId, syndicId, scheduleId)}/executions`,
    { params: limit ? { limit } : undefined }
  );
  return response.data.data;
}

export async function previewChargeSchedule(
  tenantId: string,
  syndicId: string,
  scheduleId: string
): Promise<ChargeSchedulePreview> {
  const response = await apiClient.get<{ success: boolean; data: ChargeSchedulePreview }>(
    `${scheduleBase(tenantId, syndicId, scheduleId)}/apercu`
  );
  return response.data.data;
}

/** Déclenche le téléchargement direct de l'avis d'appel (PDF, fichier privé). */
export async function downloadChargeCallNotice(
  tenantId: string,
  syndicId: string,
  chargeId: string,
  filename = `avis-appel-${chargeId}.pdf`
): Promise<void> {
  const response = await apiClient.get(`${base(tenantId, syndicId)}/charges/${chargeId}/avis`, {
    responseType: 'blob'
  });
  const url = window.URL.createObjectURL(response.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
