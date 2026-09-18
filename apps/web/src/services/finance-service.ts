/**
 * Frontière réseau du module financier — lot 1.
 *
 * Contrat gelé : les écrans appellent ces fonctions et rien d'autre. Aucun
 * écran ne construit d'URL ni n'appelle `apiClient` directement.
 *
 * Ce fichier est aussi le point d'insertion de l'atelier : la fausse API se
 * branche **sous** `apiClient`, au niveau de l'adaptateur axios, de sorte que
 * tout ce qui est au-dessus — ce service, React Query, l'écran lui-même —
 * s'exécute exactement comme en production. Les écrans peuvent donc être
 * construits et vérifiés avant que l'API n'existe.
 *
 * Contrat : `specs/016-finance-operationnelle/contracts/openapi.yaml`.
 */

import apiClient from '../utils/api-client';
import type {
  AccountStatement,
  BalanceFilters,
  BillingRun,
  ClientsAgingBalance,
  ClientsBalance,
  StatementFilters
} from '../types/finance-types';

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/finance`;
}

/**
 * Sérialise les filtres en chaîne de requête.
 *
 * Les valeurs absentes sont omises plutôt qu'envoyées vides : une borne de
 * date vide et une borne de date absente ne veulent pas dire la même chose
 * côté serveur, et l'URL de l'écran reste lisible.
 */
function toQuery(filters?: Record<string, string | number | undefined>): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/** Balance clients : une ligne par locataire, filtrable par période et par bien. */
export async function getClientsBalance(tenantId: string, filters?: BalanceFilters): Promise<ClientsBalance> {
  const response = await apiClient.get<ApiResponse<ClientsBalance>>(
    `${base(tenantId)}/clients/balance${toQuery(filters as Record<string, string | undefined>)}`
  );
  return response.data.data;
}

/** Balance âgée : la même balance, ventilée par ancienneté de créance. */
export async function getClientsAgingBalance(
  tenantId: string,
  filters?: BalanceFilters & { asOf?: string }
): Promise<ClientsAgingBalance> {
  const response = await apiClient.get<ApiResponse<ClientsAgingBalance>>(
    `${base(tenantId)}/clients/balance-agee${toQuery(filters as Record<string, string | undefined>)}`
  );
  return response.data.data;
}

/** Relevé chronologique d'un compte de tiers, borné par dates et paginé. */
export async function getAccountStatement(
  tenantId: string,
  accountId: string,
  filters?: StatementFilters
): Promise<AccountStatement> {
  const response = await apiClient.get<ApiResponse<AccountStatement>>(
    `${base(tenantId)}/accounts/${accountId}/statement${toQuery(filters as Record<string, string | number | undefined>)}`
  );
  return response.data.data;
}

/**
 * URL du relevé imprimable.
 *
 * Renvoie une URL plutôt que le fichier : l'impression passe par le
 * navigateur, et le jeton d'authentification est porté par `apiClient` lors
 * du téléchargement.
 */
export function getAccountStatementPdfUrl(tenantId: string, accountId: string, filters?: StatementFilters): string {
  return `${base(tenantId)}/accounts/${accountId}/statement.pdf${toQuery(
    filters as Record<string, string | number | undefined>
  )}`;
}

/**
 * Relevé du locataire connecté, pour son portail.
 *
 * Point d'entrée distinct de `getAccountStatement`, et non un raccourci :
 * le locataire ne connaît pas l'identifiant de son compte de tiers, et ne
 * doit surtout pas pouvoir en passer un. La route du portail ne prend donc
 * aucun paramètre — la session résout le locataire, comme le font déjà
 * `/portal/tenant/lease` et `/portal/tenant/payments`.
 *
 * C'est cette absence de paramètre qui garantit qu'un locataire ne peut pas
 * lire le relevé d'un autre.
 */
export async function getMyStatement(filters?: StatementFilters): Promise<AccountStatement> {
  const response = await apiClient.get<ApiResponse<AccountStatement>>(
    `/portal/tenant/finance/statement${toQuery(filters as Record<string, string | number | undefined>)}`
  );
  return response.data.data;
}

/** Historique des campagnes de facturation, de la plus récente à la plus ancienne. */
export async function listBillingRuns(tenantId: string): Promise<BillingRun[]> {
  const response = await apiClient.get<ApiResponse<BillingRun[]>>(`${base(tenantId)}/billing-runs`);
  return response.data.data;
}

/** Une campagne et son compte rendu détaillé. */
export async function getBillingRun(tenantId: string, runId: string): Promise<BillingRun> {
  const response = await apiClient.get<ApiResponse<BillingRun>>(`${base(tenantId)}/billing-runs/${runId}`);
  return response.data.data;
}

/**
 * Lance la facturation d'une période.
 *
 * **Idempotente** : relancer la même période ne duplique aucune échéance et
 * met à jour la même campagne. L'écran peut donc proposer « Relancer » sans
 * avertissement anxiogène.
 */
export async function runBilling(
  tenantId: string,
  params: { periodYear: number; periodMonth: number; label?: string }
): Promise<BillingRun> {
  const response = await apiClient.post<ApiResponse<BillingRun>>(`${base(tenantId)}/billing-runs`, params);
  return response.data.data;
}
