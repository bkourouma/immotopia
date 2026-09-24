import apiClient from '../utils/api-client';

/**
 * Trésorerie — Lot 10, conformité SYSCOHADA (contrat commun `LOT10-CONTRAT.md`,
 * section « Trésorerie (agent B) »).
 *
 * Les comptes de trésorerie (caisses, banques, Mobile Money, chèques et
 * cartes à encaisser) portent tous les mouvements en espèces ou assimilés de
 * l'agence, numérotés selon le plan SYSCOHADA (5711x caisses, 5211x banques,
 * 552x Mobile Money, 513 chèques à encaisser, 515 cartes). Les virements
 * internes déplacent des fonds d'un compte à l'autre sans toucher le résultat.
 * La retenue à la source (impôt prélevé sur les loyers pour le compte du
 * propriétaire) se suit à part : ce qui a été collecté, ce qui a été reversé
 * à la DGI, ce qui reste dû.
 *
 * Écrit contre le contrat, l'API n'existant pas encore : mêmes types, mêmes
 * routes, même enveloppe `{ success, data }` que les autres services finance
 * (`cash-sessions-service.ts`). Les tests (`__tests__/finance/
 * tresorerie.test.tsx`) mockent ce service.
 */

const BASE = (tenantId: string) => `/tenants/${tenantId}/treasury`;

export type TreasuryAccountKind = 'CASH' | 'BANK' | 'MOBILE_MONEY' | 'CHECKS_TO_CASH' | 'CARDS_TO_CASH';

export interface TreasuryAccountDto {
  id: string;
  kind: TreasuryAccountKind;
  label: string;
  accountNumber: string;
  mmOperator: string | null;
  bankName: string | null;
  bankAccountRef: string | null;
  isDefault: boolean;
  isActive: boolean;
  /** Σ débit − Σ crédit des lignes de son compte du plan, en FCFA. */
  balance: number;
}

export interface CreateTreasuryAccountInput {
  kind: TreasuryAccountKind;
  label: string;
  accountNumber: string;
  mmOperator?: string;
  bankName?: string;
  bankAccountRef?: string;
  isDefault?: boolean;
}

export interface UpdateTreasuryAccountInput {
  label?: string;
  bankName?: string;
  bankAccountRef?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

export type TreasuryDocumentStatus = 'VALIDATED' | 'VOIDED';

export interface TreasuryTransferDto {
  id: string;
  /** VIR-2026-0001. */
  number: string;
  fromTreasuryAccountId: string;
  fromLabel: string;
  toTreasuryAccountId: string;
  toLabel: string;
  amount: number;
  transferredAt: string;
  reference: string | null;
  notes: string | null;
  status: TreasuryDocumentStatus;
  voidReason: string | null;
  voidedAt: string | null;
  createdByName: string;
}

export interface CreateTreasuryTransferInput {
  fromTreasuryAccountId: string;
  toTreasuryAccountId: string;
  amount: number;
  transferredAt: string;
  reference?: string;
  notes?: string;
}

export interface VoidInput {
  reason: string;
}

export interface WithholdingSummaryDto {
  enabled: boolean;
  accountNumber: string;
  collected: number;
  remitted: number;
  due: number;
}

export interface TaxRemittanceDto {
  id: string;
  /** DGI-2026-0001. */
  number: string;
  amount: number;
  paidAt: string;
  periodLabel: string;
  treasuryAccountId: string;
  treasuryLabel: string;
  reference: string | null;
  status: TreasuryDocumentStatus;
  voidReason: string | null;
  voidedAt: string | null;
  createdByName: string;
}

export interface CreateTaxRemittanceInput {
  amount: number;
  paidAt: string;
  periodLabel: string;
  treasuryAccountId: string;
  reference?: string;
}

/** Liste les comptes de trésorerie — `GET /treasury/accounts`. */
export async function listTreasuryAccounts(tenantId: string): Promise<TreasuryAccountDto[]> {
  const response = await apiClient.get(`${BASE(tenantId)}/accounts`);
  return response.data.data;
}

/** Crée un compte de trésorerie — `POST /treasury/accounts`. */
export async function createTreasuryAccount(
  tenantId: string,
  input: CreateTreasuryAccountInput
): Promise<TreasuryAccountDto> {
  const response = await apiClient.post(`${BASE(tenantId)}/accounts`, input);
  return response.data.data;
}

/** Modifie un compte de trésorerie — `PATCH /treasury/accounts/:id`. */
export async function updateTreasuryAccount(
  tenantId: string,
  id: string,
  input: UpdateTreasuryAccountInput
): Promise<TreasuryAccountDto> {
  const response = await apiClient.patch(`${BASE(tenantId)}/accounts/${id}`, input);
  return response.data.data;
}

/** Liste les virements internes — `GET /treasury/transfers`. */
export async function listTreasuryTransfers(tenantId: string): Promise<TreasuryTransferDto[]> {
  const response = await apiClient.get(`${BASE(tenantId)}/transfers`);
  return response.data.data;
}

/** Crée un virement interne — `POST /treasury/transfers`. */
export async function createTreasuryTransfer(
  tenantId: string,
  input: CreateTreasuryTransferInput
): Promise<TreasuryTransferDto> {
  const response = await apiClient.post(`${BASE(tenantId)}/transfers`, input);
  return response.data.data;
}

/** Annule un virement interne — `POST /treasury/transfers/:id/void`. */
export async function voidTreasuryTransfer(
  tenantId: string,
  id: string,
  input: VoidInput
): Promise<TreasuryTransferDto> {
  const response = await apiClient.post(`${BASE(tenantId)}/transfers/${id}/void`, input);
  return response.data.data;
}

/** Résumé de la retenue à la source — `GET /treasury/withholding`. */
export async function getWithholdingSummary(tenantId: string): Promise<WithholdingSummaryDto> {
  const response = await apiClient.get(`${BASE(tenantId)}/withholding`);
  return response.data.data;
}

/** Liste les versements de retenue à la source à la DGI — `GET /treasury/tax-remittances`. */
export async function listTaxRemittances(tenantId: string): Promise<TaxRemittanceDto[]> {
  const response = await apiClient.get(`${BASE(tenantId)}/tax-remittances`);
  return response.data.data;
}

/** Enregistre un versement de retenue à la source à la DGI — `POST /treasury/tax-remittances`. */
export async function createTaxRemittance(
  tenantId: string,
  input: CreateTaxRemittanceInput
): Promise<TaxRemittanceDto> {
  const response = await apiClient.post(`${BASE(tenantId)}/tax-remittances`, input);
  return response.data.data;
}

/** Annule un versement de retenue à la source — `POST /treasury/tax-remittances/:id/void`. */
export async function voidTaxRemittance(tenantId: string, id: string, input: VoidInput): Promise<TaxRemittanceDto> {
  const response = await apiClient.post(`${BASE(tenantId)}/tax-remittances/${id}/void`, input);
  return response.data.data;
}
