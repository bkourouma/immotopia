import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';

/**
 * Portail copropriétaire — `/api/portal/copropriete/*`, en lecture seule.
 *
 * Aucun identifiant de copropriétaire ni d'agence n'est jamais transmis : la
 * session suffit au serveur pour résoudre le copropriétaire et ses lots.
 * L'agence, pour un compte rattaché à plusieurs, part dans l'en-tête
 * `X-Portal-Tenant-Id` que pose `api-client` sur toute route `/portal/`.
 *
 * Les types ci-dessous décrivent ce que rend RÉELLEMENT l'API
 * (`packages/api/src/lib/syndics/coowner-portal.ts`), montants déjà
 * convertis en nombres.
 */

export type BalanceDirection = 'DEBITEUR' | 'CREDITEUR' | 'A_JOUR';
export type CoOwnerLotType = 'APARTMENT' | 'PARKING' | 'CELLAR' | 'OFFICE' | 'COMMERCIAL' | 'OTHER';
export type CoOwnerChargeCallStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';
export type CoOwnerTransactionType = 'CHARGE_CALL' | 'PAYMENT' | 'PENALTY' | 'WAIVER' | 'ADJUSTMENT' | 'FUND_TRANSFER';
export type CoOwnerMeetingStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type CoOwnerMajorityRule = 'ARTICLE_24' | 'ARTICLE_25' | 'ARTICLE_26' | 'UNANIMITE';

export interface CoOwnerBalance {
  /** Toujours positif : le sens est dans `direction`. */
  amount: number;
  direction: BalanceDirection;
}

export interface CoOwnerSyndicate {
  id: string;
  name: string;
  address: string;
}

export interface CoOwnerLot {
  id: string;
  lotNumber: string;
  lotType: CoOwnerLotType;
  generalShares: number;
  specialShares: number | null;
  ownershipPercentage: number;
  syndicate: CoOwnerSyndicate | null;
  /** `null` tant que l'agence n'a ouvert aucun compte pour ce lot. */
  balance: (CoOwnerBalance & { currency: string }) | null;
}

export interface CoOwnerTransaction {
  id: string;
  transactionDate: string;
  type: CoOwnerTransactionType;
  label: string;
  reference: string | null;
  debit: number | null;
  credit: number | null;
  balanceAfter: number;
  balanceAfterDirection: BalanceDirection;
}

export interface CoOwnerLotAccount {
  lot: Omit<CoOwnerLot, 'syndicate' | 'balance'>;
  syndicate: CoOwnerSyndicate;
  account: (CoOwnerBalance & { currency: string; lastUpdatedAt: string }) | null;
  transactions: CoOwnerTransaction[];
}

export interface CoOwnerChargeCall {
  id: string;
  period: string;
  amount: number;
  paid: number;
  outstanding: number;
  currency: string;
  dueDate: string;
  status: CoOwnerChargeCallStatus;
  lot: { id: string; lotNumber: string; lotType: CoOwnerLotType } | null;
  syndicate: string | null;
}

export interface CoOwnerDocument {
  id: string;
  title: string;
  type: 'REGULATION' | 'GENERAL_MEETING_MINUTES';
  createdAt: string;
  syndicate: string | null;
  /** Fichier déposé, téléchargeable par `downloadCoOwnerDocument`. */
  downloadable: boolean;
  /** Lien externe saisi par l'agence, à ouvrir tel quel. */
  externalUrl: string | null;
}

export interface CoOwnerResolution {
  id: string;
  title: string;
  description: string | null;
  rule: CoOwnerMajorityRule;
  result: 'APPROVED' | 'REJECTED' | 'DEFERRED' | null;
  sharesFor: number;
  sharesAgainst: number;
  sharesAbstain: number;
  totalShares: number;
  myVotes: Array<{ lotNumber: string; vote: 'FOR' | 'AGAINST' | 'ABSTAIN' }>;
}

export interface CoOwnerMeeting {
  id: string;
  type: 'ORDINARY' | 'EXTRAORDINARY';
  scheduledAt: string;
  location: string | null;
  status: CoOwnerMeetingStatus;
  syndicate: string | null;
  agenda: Array<{ id: string; orderIndex: number; title: string }>;
  /** Vide tant que l'assemblée n'est pas clôturée. */
  resolutions: CoOwnerResolution[];
}

type ApiResponse<T> = { success: boolean; data: T };

const BASE = '/portal/copropriete';

export async function listMyLots(): Promise<CoOwnerLot[]> {
  const response = await apiClient.get<ApiResponse<CoOwnerLot[]>>(`${BASE}/lots`);
  return response.data.data;
}

export async function getMyLotAccount(lotId: string): Promise<CoOwnerLotAccount> {
  const response = await apiClient.get<ApiResponse<CoOwnerLotAccount>>(
    `${BASE}/lots/${encodeURIComponent(lotId)}/compte`
  );
  return response.data.data;
}

export async function listMyChargeCalls(lotId?: string): Promise<CoOwnerChargeCall[]> {
  const response = await apiClient.get<ApiResponse<CoOwnerChargeCall[]>>(`${BASE}/appels`, {
    params: lotId ? { lotId } : undefined
  });
  return response.data.data;
}

export async function listMyDocuments(): Promise<CoOwnerDocument[]> {
  const response = await apiClient.get<ApiResponse<CoOwnerDocument[]>>(`${BASE}/documents`);
  return response.data.data;
}

export async function listMyMeetings(): Promise<CoOwnerMeeting[]> {
  const response = await apiClient.get<ApiResponse<CoOwnerMeeting[]>>(`${BASE}/assemblees`);
  return response.data.data;
}

/** Télécharge un document déposé ; le nom vient de `Content-Disposition`. */
export async function downloadCoOwnerDocument(
  documentId: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`${BASE}/documents/${encodeURIComponent(documentId)}/fichier`, {
    responseType: 'blob'
  });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}
