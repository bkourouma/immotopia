import apiClient from '../utils/api-client';

/**
 * Caisse d'agence — Lot 6 (scratchpad `lot6-contrat-api.md`).
 *
 * Chaque caissier ouvre sa propre session avec un fond de caisse. Le montant
 * attendu se calcule tout seul, côté serveur, à partir des opérations en
 * espèces enregistrées pendant la session (loyers encaissés, reversements
 * payés en espèces, pièces de caisse de chantier). À la clôture, le caissier
 * compte ses espèces — de préférence par billetage — et un responsable,
 * différent du caissier, valide ensuite la session.
 *
 * Écrit contre le contrat, l'API n'existant pas encore : mêmes types, mêmes
 * routes, même enveloppe `{ success, data }` que les autres services finance
 * (`accounting-exports-service.ts`). Les tests (`__tests__/finance/
 * caisse.test.tsx`) mockent ce service.
 */

const BASE = (tenantId: string) => `/tenants/${tenantId}/cash-sessions`;

export type CashSessionStatus = 'OPEN' | 'CLOSED' | 'VALIDATED';

export type ExpectedLineKind = 'RENT_PAYMENT' | 'OWNER_PAYOUT' | 'CASH_VOUCHER';

export interface ExpectedLine {
  kind: ExpectedLineKind;
  /** Déjà formé côté serveur : « Loyer — BAIL-2026-0012 », etc. */
  label: string;
  /** Positif pour un encaissement, négatif pour un décaissement. */
  amount: number;
  at: string;
}

export interface CashSessionExpected {
  receipts: number;
  disbursements: number;
  /** `openingFloat + receipts − disbursements`. */
  amount: number;
  lines: ExpectedLine[];
}

/** Clés de billetage : valeurs des billets et pièces en FCFA. */
export type DenominationValue =
  '10000' | '5000' | '2000' | '1000' | '500' | '250' | '200' | '100' | '50' | '25' | '10' | '5';

export interface CashSession {
  id: string;
  /** CAI-2026-0001. */
  number: string;
  cashierUserId: string;
  cashierName: string;
  status: CashSessionStatus;
  openedAt: string;
  openingFloat: number;
  openingNote: string | null;
  closedAt: string | null;
  expected: CashSessionExpected;
  countedAmount: number | null;
  denominations: Partial<Record<DenominationValue, number>> | null;
  /** Compté − attendu. */
  difference: number | null;
  differenceReason: string | null;
  validatedAt: string | null;
  validatedByName: string | null;
  validationComment: string | null;
}

export interface OpenCashSessionInput {
  openingFloat: number;
  openingNote?: string;
}

export interface CloseCashSessionInput {
  countedAmount?: number;
  denominations?: Partial<Record<DenominationValue, number>>;
  differenceReason?: string;
}

export interface ValidateCashSessionInput {
  comment?: string;
}

export interface ListCashSessionsFilters {
  status?: CashSessionStatus;
  cashierUserId?: string;
}

/** La session OUVERTE de l'utilisateur connecté — `GET /current`. `null` si aucune. */
export async function getCurrentCashSession(tenantId: string): Promise<CashSession | null> {
  const response = await apiClient.get(`${BASE(tenantId)}/current`);
  return response.data.data;
}

/** Ouvre une session — `POST /`. */
export async function openCashSession(tenantId: string, input: OpenCashSessionInput): Promise<CashSession> {
  const response = await apiClient.post(BASE(tenantId), input);
  return response.data.data;
}

/** Clôt une session — `POST /:id/close`. */
export async function closeCashSession(
  tenantId: string,
  id: string,
  input: CloseCashSessionInput
): Promise<CashSession> {
  const response = await apiClient.post(`${BASE(tenantId)}/${id}/close`, input);
  return response.data.data;
}

/** Valide une session clôturée — `POST /:id/validate`. Le valideur ne peut pas être le caissier. */
export async function validateCashSession(
  tenantId: string,
  id: string,
  input: ValidateCashSessionInput
): Promise<CashSession> {
  const response = await apiClient.post(`${BASE(tenantId)}/${id}/validate`, input);
  return response.data.data;
}

/** Liste les sessions, de la plus récente à la plus ancienne — `GET /`. */
export async function listCashSessions(
  tenantId: string,
  filters: ListCashSessionsFilters = {}
): Promise<CashSession[]> {
  const response = await apiClient.get(BASE(tenantId), {
    params: { status: filters.status || undefined, cashierUserId: filters.cashierUserId || undefined }
  });
  return response.data.data;
}

/** Détail d'une session — `GET /:id`. */
export async function getCashSession(tenantId: string, id: string): Promise<CashSession> {
  const response = await apiClient.get(`${BASE(tenantId)}/${id}`);
  return response.data.data;
}
