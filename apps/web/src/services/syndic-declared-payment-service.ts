import apiClient from '../utils/api-client';

/**
 * Paiement mobile money déclaré, côté gestionnaire (spec 047).
 * Contrat : `specs/047-syndic-paiement-declare/contracts.md` §0.1 et §1. Les
 * types sont recopiés de l'API, jamais importés.
 */

export type MobileMoneyOperator = 'ORANGE' | 'MTN' | 'MOOV' | 'WAVE' | 'OTHER';
export type DeclarationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
export type DeclarationRejectReason = 'NOT_FOUND' | 'AMOUNT_MISMATCH' | 'REFERENCE_USED' | 'WRONG_NUMBER' | 'OTHER';
/** Champs que l'IA peut proposer et dont on suit la retouche. */
export type PrefillField = 'operator' | 'amount' | 'paidAt' | 'transactionReference' | 'payerPhone';

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DocumentRef {
  id: string;
  kind: 'RECEIPT' | 'QUITTANCE';
  number: string;
}

export interface ReceivingNumber {
  id: string;
  operator: MobileMoneyOperator;
  phoneNumber: string; // E.164
  holderName: string;
  label: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** Vue gestionnaire d'un numéro. */
export interface ReceivingNumberAdmin extends ReceivingNumber {
  treasuryAccountNumber: string;
  treasuryBalance: number;
  sharedWithCount: number;
  pendingDeclarations: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeclaredPaymentSettings {
  syndicateId: string;
  enabled: boolean;
  reviewAlertBusinessDays: number;
  proofRequired: boolean;
  payerInstructions: string | null;
  aiPrefillEnabled: boolean;
  aiPrefillAvailable: boolean;
  aiReadsThisMonth: number;
  aiReadsMonthlyQuota: number;
  usable: boolean;
}

export interface DeclarationLineInput {
  lotId: string;
  amount: number;
  chargeCallIds: string[];
}

export type DeclarationAlert =
  | { kind: 'REFERENCE_ON_EXISTING_PAYMENT'; chargePaymentId: string; paidAt: string; amount: number }
  | { kind: 'PROBABLE_DUPLICATE'; declarationId: string; createdAt: string }
  | { kind: 'EXCESS'; lotId: string; excess: number }
  | { kind: 'PARTIAL'; lotId: string; remaining: number }
  | { kind: 'DECLARANT_NOT_CURRENT_OWNER'; lotId: string }
  | { kind: 'AI_FIELDS_EDITED'; fields: PrefillField[] }
  | { kind: 'RECIPIENT_MISMATCH'; recipientPhone: string }
  | { kind: 'FISCAL_YEAR_CLOSED' }
  | { kind: 'OVERDUE'; businessDays: number };

export interface DeclarationLineView {
  id: string;
  lot: { id: string; lotNumber: string };
  amount: number;
  acceptedAmount: number | null;
  chargeCalls: Array<{ id: string; period: string; remainingDue: number }>;
  chargePaymentId: string | null;
  documents: DocumentRef[];
}

export interface SyndicDeclarationRow {
  id: string;
  status: DeclarationStatus;
  receivingNumber: { id: string; operator: MobileMoneyOperator; phoneNumber: string; holderName: string };
  declaredBy: { type: 'COOWNER'; contactId: string; name: string } | { type: 'MANAGER'; userId: string; name: string };
  payerPhone: string;
  amount: number;
  acceptedAmount: number | null;
  paidAt: string;
  acceptedPaidAt: string | null;
  transactionReference: string;
  lines: DeclarationLineView[];
  hasProof: boolean;
  aiPrefilled: boolean;
  aiEditedFields: PrefillField[];
  overdue: boolean;
  alerts: DeclarationAlert[];
  comment: string | null;
  rejectReason: DeclarationRejectReason | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  createdAt: string;
}

/** 1.2 */
export interface CreateReceivingNumberBody {
  operator: MobileMoneyOperator;
  phoneNumber: string;
  holderName: string;
  label?: string | null;
  isActive?: boolean;
}

/** 1.3 */
export type UpdateReceivingNumberBody = Partial<CreateReceivingNumberBody> & { sortOrder?: number };

/** 1.5 */
export interface UpdateDeclaredPaymentSettingsBody {
  enabled?: boolean;
  reviewAlertBusinessDays?: number;
  proofRequired?: boolean;
  payerInstructions?: string | null;
  aiPrefillEnabled?: boolean;
}

/** 1.6 */
export interface ListDeclarationsQuery {
  status?: DeclarationStatus | 'ALL';
  receivingNumberId?: string;
  lotId?: string;
  from?: string;
  to?: string;
  overdue?: boolean;
  page?: number;
  limit?: number;
}

export interface ListDeclarationsResponse {
  items: SyndicDeclarationRow[];
  pagination: Pagination;
  counts: { pending: number; overdue: number; suspectedDuplicate: number };
}

/** 1.9 */
export interface ApproveDeclarationBody {
  correction?: {
    paidAt?: string;
    lines?: Array<{ lineId: string; acceptedAmount: number; chargeCallIds?: string[] }>;
  } | null;
  note?: string | null;
}

export interface ApproveDeclarationResponse {
  declaration: SyndicDeclarationRow;
  documents: DocumentRef[];
}

/** 1.10 */
export interface RejectDeclarationBody {
  reason: DeclarationRejectReason;
  note: string;
}

/** 1.11 */
export interface CreateManagerDeclarationInput {
  receivingNumberId: string;
  payerPhone: string;
  amount: number;
  paidAt: string;
  transactionReference: string;
  lines: DeclarationLineInput[];
  comment?: string | null;
  declaredForContactId?: string;
}

type Envelope<T> = { success: boolean; data: T };

const base = (tenantId: string, syndicId: string) => `/tenants/${tenantId}/syndics/${syndicId}`;

/** 1.1 */
export async function listSyndicReceivingNumbers(tenantId: string, syndicId: string): Promise<ReceivingNumberAdmin[]> {
  const response = await apiClient.get<Envelope<ReceivingNumberAdmin[]>>(
    `${base(tenantId, syndicId)}/numeros-reception`
  );
  return response.data.data;
}

/** 1.2 */
export async function createSyndicReceivingNumber(
  tenantId: string,
  syndicId: string,
  body: CreateReceivingNumberBody
): Promise<ReceivingNumberAdmin> {
  const response = await apiClient.post<Envelope<ReceivingNumberAdmin>>(
    `${base(tenantId, syndicId)}/numeros-reception`,
    body
  );
  return response.data.data;
}

/** 1.3 */
export async function updateSyndicReceivingNumber(
  tenantId: string,
  syndicId: string,
  numberId: string,
  body: UpdateReceivingNumberBody
): Promise<ReceivingNumberAdmin> {
  const response = await apiClient.patch<Envelope<ReceivingNumberAdmin>>(
    `${base(tenantId, syndicId)}/numeros-reception/${numberId}`,
    body
  );
  return response.data.data;
}

/** 1.4 */
export async function deleteSyndicReceivingNumber(tenantId: string, syndicId: string, numberId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId, syndicId)}/numeros-reception/${numberId}`);
}

/** 1.5 */
export async function getSyndicDeclaredSettings(tenantId: string, syndicId: string): Promise<DeclaredPaymentSettings> {
  const response = await apiClient.get<Envelope<DeclaredPaymentSettings>>(
    `${base(tenantId, syndicId)}/paiements-declares/reglages`
  );
  return response.data.data;
}

export async function updateSyndicDeclaredSettings(
  tenantId: string,
  syndicId: string,
  body: UpdateDeclaredPaymentSettingsBody
): Promise<DeclaredPaymentSettings> {
  const response = await apiClient.put<Envelope<DeclaredPaymentSettings>>(
    `${base(tenantId, syndicId)}/paiements-declares/reglages`,
    body
  );
  return response.data.data;
}

/** 1.6 */
export async function listSyndicDeclarations(
  tenantId: string,
  syndicId: string,
  query: ListDeclarationsQuery = {}
): Promise<ListDeclarationsResponse> {
  const response = await apiClient.get<Envelope<ListDeclarationsResponse>>(
    `${base(tenantId, syndicId)}/paiements-declares`,
    {
      params: {
        status: query.status || undefined,
        receivingNumberId: query.receivingNumberId || undefined,
        lotId: query.lotId || undefined,
        from: query.from || undefined,
        to: query.to || undefined,
        overdue: query.overdue ? true : undefined,
        page: query.page,
        limit: query.limit
      }
    }
  );
  return response.data.data;
}

/** 1.7 */
export async function getSyndicDeclaration(
  tenantId: string,
  syndicId: string,
  declarationId: string
): Promise<SyndicDeclarationRow> {
  const response = await apiClient.get<Envelope<SyndicDeclarationRow>>(
    `${base(tenantId, syndicId)}/paiements-declares/${declarationId}`
  );
  return response.data.data;
}

/** 1.8 : flux privé, authentifié par l'api-client ; jamais d'URL statique. */
export async function getSyndicDeclarationProof(
  tenantId: string,
  syndicId: string,
  declarationId: string
): Promise<Blob> {
  const response = await apiClient.get<Blob>(`${base(tenantId, syndicId)}/paiements-declares/${declarationId}/preuve`, {
    responseType: 'blob'
  });
  return response.data;
}

/** 1.9 */
export async function approveSyndicDeclaration(
  tenantId: string,
  syndicId: string,
  declarationId: string,
  body: ApproveDeclarationBody
): Promise<ApproveDeclarationResponse> {
  const response = await apiClient.post<Envelope<ApproveDeclarationResponse>>(
    `${base(tenantId, syndicId)}/paiements-declares/${declarationId}/validation`,
    body
  );
  return response.data.data;
}

/** 1.10 */
export async function rejectSyndicDeclaration(
  tenantId: string,
  syndicId: string,
  declarationId: string,
  body: RejectDeclarationBody
): Promise<SyndicDeclarationRow> {
  const response = await apiClient.post<Envelope<SyndicDeclarationRow>>(
    `${base(tenantId, syndicId)}/paiements-declares/${declarationId}/rejet`,
    body
  );
  return response.data.data;
}

/** 1.11 : multipart, `payload` = JSON de l'entrée, `proof` = capture facultative. */
export async function createSyndicDeclaration(
  tenantId: string,
  syndicId: string,
  input: CreateManagerDeclarationInput,
  proof?: File
): Promise<SyndicDeclarationRow> {
  const formData = new FormData();
  formData.append('payload', JSON.stringify(input));
  if (proof) formData.append('proof', proof);
  const response = await apiClient.post<Envelope<SyndicDeclarationRow>>(
    `${base(tenantId, syndicId)}/paiements-declares`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data.data;
}
