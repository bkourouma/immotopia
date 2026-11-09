import apiClient from '../utils/api-client';
import type {
  ApproveDeclarationBody,
  ApproveDeclarationResponse,
  CreateDeclarationForThirdPartyBody,
  CreateRentalReceivingNumberBody,
  PendingCountDto,
  RejectDeclarationBody,
  RentalDeclaredPaymentSettingsDto,
  RentalPaymentDeclarationDto,
  RentalReceivingNumberDto,
  UpdateRentalDeclaredPaymentSettingsBody,
  UpdateRentalReceivingNumberBody
} from '../types/rental-declared-payment';

/**
 * Paiement mobile money déclaré, côté gestionnaire du locatif (spec 049, famille « Déclarations »).
 * Contrat : specs/049-locatif-paiement-parite-syndic/contracts.md §1.1, 1.2 et 1.6.
 * Les routes d'écriture existantes (liste legacy, approve, reject) restent dans `rental-service.ts`.
 */

type Envelope<T> = { success: boolean; data: T };

const base = (tenantId: string) => `/tenants/${tenantId}/rental`;
const declarations = (tenantId: string) => `${base(tenantId)}/payment-declarations`;

/** 1.1 */
export async function listRentalReceivingNumbers(
  tenantId: string,
  active?: boolean
): Promise<RentalReceivingNumberDto[]> {
  const response = await apiClient.get<Envelope<RentalReceivingNumberDto[]>>(`${base(tenantId)}/receiving-numbers`, {
    params: active === undefined ? undefined : { active: String(active) }
  });
  return response.data.data;
}

export async function createRentalReceivingNumber(
  tenantId: string,
  body: CreateRentalReceivingNumberBody
): Promise<RentalReceivingNumberDto> {
  const response = await apiClient.post<Envelope<RentalReceivingNumberDto>>(
    `${base(tenantId)}/receiving-numbers`,
    body
  );
  return response.data.data;
}

export async function updateRentalReceivingNumber(
  tenantId: string,
  numberId: string,
  body: UpdateRentalReceivingNumberBody
): Promise<RentalReceivingNumberDto> {
  const response = await apiClient.patch<Envelope<RentalReceivingNumberDto>>(
    `${base(tenantId)}/receiving-numbers/${encodeURIComponent(numberId)}`,
    body
  );
  return response.data.data;
}

/** Suppression définitive sans déclaration liée, sinon désactivation douce (jamais d'erreur). */
export async function deleteRentalReceivingNumber(
  tenantId: string,
  numberId: string
): Promise<{ id: string; deleted: boolean; deactivated: boolean }> {
  const response = await apiClient.delete<Envelope<{ id: string; deleted: boolean; deactivated: boolean }>>(
    `${base(tenantId)}/receiving-numbers/${encodeURIComponent(numberId)}`
  );
  return response.data.data;
}

/** 1.2 */
export async function getRentalDeclaredSettings(tenantId: string): Promise<RentalDeclaredPaymentSettingsDto> {
  const response = await apiClient.get<Envelope<RentalDeclaredPaymentSettingsDto>>(
    `${base(tenantId)}/declared-payment/settings`
  );
  return response.data.data;
}

export async function updateRentalDeclaredSettings(
  tenantId: string,
  body: UpdateRentalDeclaredPaymentSettingsBody
): Promise<RentalDeclaredPaymentSettingsDto> {
  const response = await apiClient.put<Envelope<RentalDeclaredPaymentSettingsDto>>(
    `${base(tenantId)}/declared-payment/settings`,
    body
  );
  return response.data.data;
}

export async function getRentalPendingCount(tenantId: string): Promise<PendingCountDto> {
  const response = await apiClient.get<Envelope<PendingCountDto>>(`${declarations(tenantId)}/pending-count`);
  return response.data.data;
}

export async function getRentalDeclaration(
  tenantId: string,
  declarationId: string
): Promise<RentalPaymentDeclarationDto> {
  // L'API répond `{ ...ligneSnakeCase, view }` : le DTO camelCase est dans `view`.
  const response = await apiClient.get<Envelope<{ view?: RentalPaymentDeclarationDto } & RentalPaymentDeclarationDto>>(
    `${declarations(tenantId)}/${encodeURIComponent(declarationId)}`
  );
  return response.data.data.view ?? response.data.data;
}

/** Capture : flux privé authentifié par l'api-client, jamais d'URL statique. */
export async function getRentalDeclarationProof(tenantId: string, declarationId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`${declarations(tenantId)}/${encodeURIComponent(declarationId)}/proof`, {
    responseType: 'blob'
  });
  return response.data;
}

export async function approveRentalDeclaration(
  tenantId: string,
  declarationId: string,
  body: ApproveDeclarationBody & { treasuryAccountId?: string | null }
): Promise<ApproveDeclarationResponse> {
  const response = await apiClient.post<Envelope<ApproveDeclarationResponse>>(
    `${declarations(tenantId)}/${encodeURIComponent(declarationId)}/approve`,
    body
  );
  return response.data.data;
}

export async function rejectRentalDeclaration(
  tenantId: string,
  declarationId: string,
  body: RejectDeclarationBody
): Promise<RentalPaymentDeclarationDto> {
  const response = await apiClient.post<Envelope<RentalPaymentDeclarationDto>>(
    `${declarations(tenantId)}/${encodeURIComponent(declarationId)}/reject`,
    body
  );
  return response.data.data;
}

/** Déclaration pour un tiers : multipart, `payload` = JSON du corps, `proof` = capture facultative. */
export async function createRentalDeclarationForThirdParty(
  tenantId: string,
  body: CreateDeclarationForThirdPartyBody,
  proof?: File
): Promise<RentalPaymentDeclarationDto> {
  const formData = new FormData();
  formData.append('payload', JSON.stringify(body));
  if (proof) formData.append('proof', proof);
  const response = await apiClient.post<Envelope<RentalPaymentDeclarationDto>>(declarations(tenantId), formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.data;
}
