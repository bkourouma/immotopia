import apiClient from '../utils/api-client';
import type {
  BatchReminderBody,
  BatchReminderResultDto,
  ListRemindersQuery,
  RentalPaymentReminderDto,
  RentalReminderPaginated,
  RentalReminderPreviewDto,
  RentalReminderPreviewQuery,
  SendReminderBody,
  SendReminderResultDto
} from '../types/rental-payment-reminder';

/** Contrat 049 section 3 : préfixe `/tenants/:tenantId/rental`. Les réponses sont enveloppées `{ success, data }`. */
type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/rental`;
}

/** Aperçu des échéances à relancer (aucune écriture, aucun envoi). */
export async function previewPaymentReminders(
  tenantId: string,
  query: RentalReminderPreviewQuery = {}
): Promise<RentalReminderPreviewDto> {
  const response = await apiClient.get<ApiResponse<RentalReminderPreviewDto>>(
    `${base(tenantId)}/payment-reminders/preview`,
    { params: query }
  );
  return response.data.data;
}

/** Relance d'une échéance. Une échéance exclue répond 409 (`RENTAL_REMINDER_TOO_SOON` / `_NOT_ELIGIBLE`). */
export async function sendInstallmentReminder(
  tenantId: string,
  installmentId: string,
  body: SendReminderBody = {}
): Promise<SendReminderResultDto> {
  const response = await apiClient.post<ApiResponse<SendReminderResultDto>>(
    `${base(tenantId)}/installments/${installmentId}/reminder`,
    body
  );
  return response.data.data;
}

/** Relance par lot (1 à 100 échéances) : le serveur recalcule le plan de chaque ligne. */
export async function sendReminderBatch(tenantId: string, body: BatchReminderBody): Promise<BatchReminderResultDto> {
  const response = await apiClient.post<ApiResponse<BatchReminderResultDto>>(
    `${base(tenantId)}/payment-reminders/batch`,
    body
  );
  return response.data.data;
}

/** Journal paginé des relances de l'agence. */
export async function listPaymentReminders(
  tenantId: string,
  query: ListRemindersQuery = {}
): Promise<RentalReminderPaginated<RentalPaymentReminderDto>> {
  const response = await apiClient.get<ApiResponse<RentalReminderPaginated<RentalPaymentReminderDto>>>(
    `${base(tenantId)}/payment-reminders`,
    { params: query }
  );
  return response.data.data;
}

/** Historique d'une échéance, plus récente d'abord (max 50). */
export async function listInstallmentReminders(
  tenantId: string,
  installmentId: string
): Promise<RentalPaymentReminderDto[]> {
  const response = await apiClient.get<ApiResponse<RentalPaymentReminderDto[]>>(
    `${base(tenantId)}/installments/${installmentId}/reminders`
  );
  return response.data.data;
}
