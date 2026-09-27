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

// ---------------------------------------------------------------------------
// Lot S5 (besoin 2) — paiements, quittances, suivi mensuel, fiche de la
// copropriété. Toujours limité aux lots du copropriétaire connecté, jamais de
// paiement en ligne. Types alignés sur
// `packages/api/src/lib/syndics/coowner-portal-finance.ts` et
// `coowner-portal-syndicate.ts`.
// ---------------------------------------------------------------------------

export type CoOwnerAllocationSource = 'PAYMENT' | 'ADVANCE';
export type CoOwnerDocumentKind = 'RECEIPT' | 'QUITTANCE';

export interface CoOwnerPaymentAllocation {
  chargeCallId: string;
  period: string;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string;
  amount: number;
  source: CoOwnerAllocationSource;
}

export interface CoOwnerPaymentDocument {
  id: string;
  kind: CoOwnerDocumentKind;
  number: string;
  /** Relatif à la base de l'API : à passer tel quel à `apiClient`. */
  downloadPath: string;
}

export interface CoOwnerPayment {
  id: string;
  paidAt: string;
  amount: number;
  currency: string;
  method: string | null;
  methodLabel: string | null;
  reference: string | null;
  lot: { id: string; lotNumber: string };
  syndicate: { id: string; name: string | null };
  allocations: CoOwnerPaymentAllocation[];
  /** Part du paiement non affectée à un appel : devient une avance sur le lot. */
  remainingAdvance: number;
  documents: CoOwnerPaymentDocument[];
}

export interface CoOwnerAdvance {
  lot: { id: string; lotNumber: string };
  syndicate: { id: string; name: string | null };
  advance: number;
  currency: string;
}

export interface CoOwnerPaymentsResult {
  items: CoOwnerPayment[];
  advances: CoOwnerAdvance[];
}

/** `GET /paiements?lotId=&year=` */
export async function listMyPayments(params: { lotId?: string; year?: number } = {}): Promise<CoOwnerPaymentsResult> {
  const response = await apiClient.get<ApiResponse<CoOwnerPaymentsResult>>(`${BASE}/paiements`, { params });
  return response.data.data;
}

export interface CoOwnerReceipt {
  id: string;
  kind: CoOwnerDocumentKind;
  number: string;
  lot: { id: string; lotNumber: string };
  syndicate: { id: string; name: string | null };
  chargeCallId: string | null;
  chargePaymentId: string | null;
  periodLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number;
  currency: string;
  issuedAt: string;
  emailedAt: string | null;
  downloadPath: string;
}

export interface CoOwnerPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CoOwnerReceiptsResult {
  items: CoOwnerReceipt[];
  pagination: CoOwnerPagination;
}

export interface CoOwnerReceiptsQuery {
  lotId?: string;
  kind?: CoOwnerDocumentKind;
  /** `AAAA-MM-JJ` */
  from?: string;
  /** `AAAA-MM-JJ` */
  to?: string;
  page?: number;
  limit?: number;
}

/** `GET /quittances?lotId=&kind=&from=&to=&page=&limit=` */
export async function listMyReceipts(params: CoOwnerReceiptsQuery = {}): Promise<CoOwnerReceiptsResult> {
  const response = await apiClient.get<ApiResponse<CoOwnerReceiptsResult>>(`${BASE}/quittances`, { params });
  return response.data.data;
}

/** Télécharge le PDF d'un reçu/d'une quittance ; `downloadPath` vient de la liste. */
export async function downloadCoOwnerReceiptFile(
  downloadPath: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(downloadPath, { responseType: 'blob' });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

/** `GET /lots/:lotId/releve?from=&to=` — relevé de compte du lot, en PDF. */
export async function downloadCoOwnerLotStatement(
  lotId: string,
  params: { from?: string; to?: string } = {},
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`${BASE}/lots/${encodeURIComponent(lotId)}/releve`, {
    params,
    responseType: 'blob'
  });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

export type CoOwnerMonthStatus = 'NONE' | 'PAID' | 'PARTIAL' | 'DUE' | 'OVERDUE';

export interface CoOwnerMonthCell {
  month: number;
  due: number;
  paid: number;
  status: CoOwnerMonthStatus;
}

export interface CoOwnerLotMonthlyTracking {
  year: number;
  currency: string;
  lot: { id: string; lotNumber: string };
  syndicate: { id: string; name: string | null };
  /**
   * `AAAA-MM-JJ` : date d'acquisition du lot par le copropriétaire connecté.
   * Les mois qui la précèdent arrivent à zéro (`NONE`) — ceux de l'ancien
   * propriétaire, jamais montrés ici (audit S5).
   */
  ownedSince: string;
  advance: number;
  totals: { due: number; paid: number; outstanding: number };
  months: CoOwnerMonthCell[];
}

/** `GET /lots/:lotId/suivi-mensuel?year=` */
export async function getCoOwnerLotMonthlyTracking(lotId: string, year: number): Promise<CoOwnerLotMonthlyTracking> {
  const response = await apiClient.get<ApiResponse<CoOwnerLotMonthlyTracking>>(
    `${BASE}/lots/${encodeURIComponent(lotId)}/suivi-mensuel`,
    { params: { year } }
  );
  return response.data.data;
}

export type CoOwnerIssuerKind = 'MANDANT' | 'AGENCY';

export interface CoOwnerSyndicateIssuer {
  kind: CoOwnerIssuerKind;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

/** Contact du syndic : nom et e-mail seulement (audit S5, pas de téléphone). */
export interface CoOwnerSyndicateContact {
  name: string | null;
  email: string | null;
}

export interface CoOwnerSyndicateSheet {
  id: string;
  name: string;
  address: string;
  registrationNo: string | null;
  cadastralReference: string | null;
  lotCount: number;
  myLots: Array<{ id: string; lotNumber: string; lotType: CoOwnerLotType }>;
  issuer: CoOwnerSyndicateIssuer;
  syndicContact: CoOwnerSyndicateContact | null;
  hasLogo: boolean;
  logoDownloadPath: string | null;
  hasIssuerLogo: boolean;
  issuerLogoDownloadPath: string | null;
}

/** `GET /coproprietes/:syndicId` */
export async function getCoOwnerSyndicate(syndicId: string): Promise<CoOwnerSyndicateSheet> {
  const response = await apiClient.get<ApiResponse<CoOwnerSyndicateSheet>>(
    `${BASE}/coproprietes/${encodeURIComponent(syndicId)}`
  );
  return response.data.data;
}

/**
 * Logos de la copropriété et de l'émetteur : images privées, chargées en
 * blob et jamais posées en `<img src>` direct (l'URL exigerait le cookie de
 * session sur une balise qui ne l'envoie pas partout).
 */
export async function fetchCoOwnerSyndicateLogo(syndicId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`${BASE}/coproprietes/${encodeURIComponent(syndicId)}/logo`, {
    responseType: 'blob'
  });
  return response.data;
}

export async function fetchCoOwnerIssuerLogo(syndicId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`${BASE}/coproprietes/${encodeURIComponent(syndicId)}/logo-emetteur`, {
    responseType: 'blob'
  });
  return response.data;
}

/**
 * Avis d'appel (PDF) — route `GET /appels/:chargeCallId/avis` posée par un
 * autre lot en parallèle : peut répondre 404 tant qu'elle n'existe pas
 * encore, à traiter comme « indisponible », pas comme une erreur.
 */
export async function downloadCoOwnerChargeCallNotice(
  chargeCallId: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`${BASE}/appels/${encodeURIComponent(chargeCallId)}/avis`, {
    responseType: 'blob'
  });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}
