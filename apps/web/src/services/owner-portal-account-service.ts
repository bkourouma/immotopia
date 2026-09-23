/**
 * Frontière réseau du compte courant propriétaire — portail, lot 3.
 *
 * Un seul point d'entrée, pour le propriétaire connecté : la session résout
 * seule le `TenantClient` concerné, comme les autres routes `/portal/owner/*`
 * (voir `ownerPortalService.ts`). Fichier séparé de ce dernier pour ne pas le
 * modifier pendant qu'un autre agent y travaille en parallèle — même
 * fonctionnement, mêmes conventions.
 *
 * Contrat gelé (lu en entier avant d'écrire ce fichier) :
 * `scratchpad/lot3-contrat-api.md`, section 2. L'API n'est pas encore
 * disponible : cet écran se construit contre ce contrat, avec des mocks côté
 * test.
 */

import apiClient from '../utils/api-client';

/** Nature d'un mouvement du compte courant. */
export type OwnerMovementType =
  | 'RENT_COLLECTED' // loyer encaissé (crédit)
  | 'MANAGEMENT_FEE' // honoraires HT (débit)
  | 'MANAGEMENT_FEE_VAT' // TVA sur honoraires (débit)
  | 'EXPENSE' // dépense d'un bien (débit)
  | 'PAYOUT' // reversement au propriétaire (débit)
  | 'VOID'; // contre-passation d'un mouvement annulé (sens inverse)

/** Une ligne du compte courant, déjà soldée par le serveur. */
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

export type PayoutMethod = 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'MOBILE_MONEY' | 'OTHER';

/** Un reversement au propriétaire : validé dès l'enregistrement, jamais modifié — seulement annulé. */
export interface OwnerPayout {
  id: string;
  /** REV-2026-0001 */
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

/** Compte courant complet d'un propriétaire — ce que rend `GET /portal/owner/account`. */
export interface OwnerAccountDetail {
  ownerClientId: string;
  ownerName: string;
  email: string | null;
  /** Montant que l'agence doit au propriétaire. Négatif : le propriétaire doit à l'agence. */
  balance: number;
  totals: OwnerAccountTotals;
  /** Du plus ancien au plus récent. */
  movements: OwnerMovement[];
  /** Du plus récent au plus ancien. */
  payouts: OwnerPayout[];
}

type ApiResponse<T> = { success: boolean; data: T };

/**
 * Compte courant du propriétaire connecté.
 *
 * Aucun identifiant n'est passé : comme `getMyStatement` côté locataire, la
 * session résout seule le propriétaire, ce qui garantit qu'aucun appel ne
 * peut atteindre le compte d'un autre propriétaire depuis cet écran.
 */
export async function getOwnerAccount(): Promise<OwnerAccountDetail> {
  const response = await apiClient.get<ApiResponse<OwnerAccountDetail>>('/portal/owner/account');
  return response.data.data;
}
