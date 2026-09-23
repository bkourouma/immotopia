import apiClient from '../utils/api-client';

/**
 * Frontière réseau du compte courant des propriétaires — lot 3 de la gestion
 * locative.
 *
 * Contrat : `lot3-contrat-api.md` (scratchpad de l'atelier), section 1 — côté
 * agence. L'API n'est pas encore disponible : ce service est le point
 * d'insertion des mocks du test (`__tests__/finance/owner-accounts.test.tsx`),
 * qui déclare un `vi.mock` sur ce module plutôt que sur `apiClient` lui-même.
 *
 * `balance` désigne le montant que l'agence doit au propriétaire (contrat,
 * §Principe). Positif : l'agence lui doit de l'argent. Négatif : c'est le
 * propriétaire qui doit à l'agence.
 */

type ApiResponse<T> = { success: boolean; data: T };

export type OwnerMovementType =
  'RENT_COLLECTED' | 'MANAGEMENT_FEE' | 'MANAGEMENT_FEE_VAT' | 'EXPENSE' | 'PAYOUT' | 'VOID';

export type PayoutMethod = 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'MOBILE_MONEY' | 'OTHER';

export interface OwnerAccountSummary {
  ownerClientId: string;
  ownerName: string;
  email: string | null;
  balance: number;
  lastMovementAt: string | null;
  lastPayout: { number: string; amount: number; paidAt: string } | null;
}

export interface OwnerMovement {
  id: string;
  date: string;
  type: OwnerMovementType;
  label: string;
  /** 0 si le mouvement est un crédit. */
  debit: number;
  /** 0 si le mouvement est un débit. */
  credit: number;
  /** Montant dû au propriétaire après ce mouvement — même convention que `balance`. */
  balanceAfter: number;
  leaseNumber: string | null;
  propertyTitle: string | null;
}

export interface OwnerPayout {
  id: string;
  /** `REV-2026-0001`. */
  number: string;
  amount: number;
  paidAt: string;
  method: PayoutMethod;
  reference: string | null;
  notes: string | null;
  statementId: string | null;
  status: 'VALIDATED' | 'VOIDED';
  voidReason: string | null;
  voidedAt: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface OwnerAccountTotals {
  rentCollected: number;
  fees: number;
  vat: number;
  expenses: number;
  payouts: number;
}

export interface OwnerAccountDetail {
  ownerClientId: string;
  ownerName: string;
  email: string | null;
  balance: number;
  totals: OwnerAccountTotals;
  /** Du plus ancien au plus récent. */
  movements: OwnerMovement[];
  /** Du plus récent au plus ancien. */
  payouts: OwnerPayout[];
}

export interface CreateOwnerPayoutPayload {
  amount: number;
  /** `YYYY-MM-DD`. */
  paidAt: string;
  method: PayoutMethod;
  reference?: string;
  notes?: string;
  statementId?: string;
}

/** Comptes courants des propriétaires d'une agence, pour la liste. */
export async function listOwnerAccounts(tenantId: string): Promise<OwnerAccountSummary[]> {
  const response = await apiClient.get<ApiResponse<OwnerAccountSummary[]>>(`/tenants/${tenantId}/owner-accounts`);
  return response.data.data;
}

/** Détail du compte courant d'un propriétaire : mouvements et reversements. */
export async function getOwnerAccount(tenantId: string, ownerClientId: string): Promise<OwnerAccountDetail> {
  const response = await apiClient.get<ApiResponse<OwnerAccountDetail>>(
    `/tenants/${tenantId}/owner-accounts/${ownerClientId}`
  );
  return response.data.data;
}

/**
 * Enregistre un reversement, validé dès sa création (contrat, §Principe).
 *
 * Refus possibles : 409 si `amount` dépasse le solde dû, 400 si la date est
 * dans le futur ou si le montant n'est pas strictement positif. Le message
 * renvoyé par l'API est affiché tel quel par l'écran appelant.
 */
export async function createOwnerPayout(
  tenantId: string,
  ownerClientId: string,
  payload: CreateOwnerPayoutPayload
): Promise<OwnerPayout> {
  const response = await apiClient.post<ApiResponse<OwnerPayout>>(
    `/tenants/${tenantId}/owner-accounts/${ownerClientId}/payouts`,
    payload
  );
  return response.data.data;
}

/**
 * Annule un reversement validé, par une pièce d'annulation qui reste visible.
 *
 * Un reversement ne se modifie pas : on ne l'annule qu'avec un motif d'au
 * moins 3 caractères (contrat, §1). 409 si le reversement est déjà annulé.
 */
export async function voidOwnerPayout(
  tenantId: string,
  ownerClientId: string,
  payoutId: string,
  reason: string
): Promise<OwnerPayout> {
  const response = await apiClient.post<ApiResponse<OwnerPayout>>(
    `/tenants/${tenantId}/owner-accounts/${ownerClientId}/payouts/${payoutId}/void`,
    { reason }
  );
  return response.data.data;
}
