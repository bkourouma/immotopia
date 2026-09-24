import apiClient from '../utils/api-client';

/**
 * Vie du bail — service (Lot 5 §A du contrat d'API).
 *
 * Toutes les routes vivent sous `/tenants/:tenantId/rental/leases/:leaseId`.
 * Le contrat complet est dans le scratchpad de la session ; il n'est pas
 * versionné ici. Types et formes de réponse repris tels quels.
 */

export type LeaseEventType = 'REVISION' | 'RENEWAL' | 'AMENDMENT' | 'TERMINATION';

export type LeaseEventInitiator = 'TENANT' | 'LANDLORD' | 'MUTUAL';

export interface LeaseEventDetails {
  installmentsUpdated?: number;
  installmentsCreated?: number;
  installmentsCanceled?: number;
  billedAfterEnd?: number;
}

export interface LeaseEvent {
  id: string;
  type: LeaseEventType;
  effectiveDate: string;
  previousRent: number | null;
  newRent: number | null;
  previousCharges: number | null;
  newCharges: number | null;
  revisionRate: number | null;
  previousEndDate: string | null;
  newEndDate: string | null;
  noticeDate: string | null;
  initiatedBy: LeaseEventInitiator | null;
  moveOutDate: string | null;
  summary: string | null;
  details: LeaseEventDetails | null;
  createdAt: string;
  createdByName: string | null;
}

/** Etat minimal du bail renvoyé avec l'historique : ce qu'affiche l'en-tête du panneau. */
export interface LeaseLifecycleState {
  status: string;
  startDate: string;
  endDate: string | null;
  rentAmount: number;
  serviceChargeAmount: number;
  moveOutDate: string | null;
  terminated: boolean;
}

export interface LeaseEventsData {
  events: LeaseEvent[];
  lease: LeaseLifecycleState;
}

export interface ReviseLeaseRequest {
  /** Mois d'effet, `YYYY-MM`. */
  effectiveMonth: string;
  newRent: number;
  newCharges?: number;
  revisionRate?: number;
  summary?: string;
}

export interface RenewLeaseRequest {
  /** Nouvelle date de fin, `YYYY-MM-DD`. */
  newEndDate: string;
  newRent?: number;
  newCharges?: number;
  summary?: string;
}

export interface RenewLeaseData {
  renewal: LeaseEvent;
  revision: LeaseEvent | null;
}

export interface AddAmendmentRequest {
  /** Date d'effet, `YYYY-MM-DD`. */
  effectiveDate: string;
  summary: string;
}

export interface TerminateLeaseRequest {
  /** Date de préavis, `YYYY-MM-DD`. */
  noticeDate: string;
  /** Date de fin effective, `YYYY-MM-DD`. */
  effectiveDate: string;
  initiatedBy: LeaseEventInitiator;
  moveOutDate?: string;
  summary?: string;
}

export type ExitInspectionStatus = 'NONE' | 'DRAFT' | 'FINALIZED';

export interface FinalSettlementDeduction {
  label: string;
  amount: number;
}

export interface FinalSettlement {
  depositHeld: number;
  arrears: number;
  deductions: FinalSettlementDeduction[];
  deductionsTotal: number;
  balanceToRefund: number;
  exitInspectionStatus: ExitInspectionStatus;
}

function basePath(tenantId: string, leaseId: string): string {
  return `/tenants/${tenantId}/rental/leases/${leaseId}`;
}

export async function getLeaseEvents(tenantId: string, leaseId: string): Promise<LeaseEventsData> {
  const response = await apiClient.get(`${basePath(tenantId, leaseId)}/events`);
  return response.data.data;
}

export async function reviseLease(tenantId: string, leaseId: string, data: ReviseLeaseRequest): Promise<LeaseEvent> {
  const response = await apiClient.post(`${basePath(tenantId, leaseId)}/events/revision`, data);
  return response.data.data;
}

export async function renewLease(tenantId: string, leaseId: string, data: RenewLeaseRequest): Promise<RenewLeaseData> {
  const response = await apiClient.post(`${basePath(tenantId, leaseId)}/events/renewal`, data);
  return response.data.data;
}

export async function addLeaseAmendment(
  tenantId: string,
  leaseId: string,
  data: AddAmendmentRequest
): Promise<LeaseEvent> {
  const response = await apiClient.post(`${basePath(tenantId, leaseId)}/events/amendment`, data);
  return response.data.data;
}

export async function terminateLease(
  tenantId: string,
  leaseId: string,
  data: TerminateLeaseRequest
): Promise<LeaseEvent> {
  const response = await apiClient.post(`${basePath(tenantId, leaseId)}/events/termination`, data);
  return response.data.data;
}

export async function getFinalSettlement(tenantId: string, leaseId: string): Promise<FinalSettlement> {
  const response = await apiClient.get(`${basePath(tenantId, leaseId)}/final-settlement`);
  return response.data.data;
}
