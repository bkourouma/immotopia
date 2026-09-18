/**
 * Frontière réseau du module financier — lot 2.
 *
 * Contrat gelé : les écrans appellent ces fonctions et rien d'autre. Aucun
 * écran ne construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé de `finance-service.ts`, qui reste la frontière du lot 1.
 *
 * Comme au lot 1, c'est aussi le point d'insertion de l'atelier : la fausse API
 * se branche sous `apiClient`, au niveau de l'adaptateur axios, de sorte que ce
 * service, React Query et les écrans s'exécutent exactement comme en
 * production. Les écrans se construisent donc avant que l'API n'existe.
 *
 * Contrat : `specs/017-finance-fournisseurs-chantiers/contracts/openapi.yaml`.
 */

import apiClient from '../utils/api-client';
import type {
  CashVoucher,
  ConstructionSite,
  CostCategory,
  CreateCashVoucherInput,
  CreateSupplierInvoiceInput,
  CreateSupplierPaymentInput,
  PendingDocument,
  SiteDetail,
  Supplier,
  SupplierInvoice,
  SupplierPayment,
  SuppliersBalance,
  SuppliersBalanceFilters
} from '../types/finance-lot2-types';

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/finance`;
}

/** Même sérialisation qu'au lot 1 : une valeur absente est omise, jamais vide. */
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

// ---------------------------------------------------------------------------
// Fournisseurs
// ---------------------------------------------------------------------------

export async function listSuppliers(tenantId: string): Promise<Supplier[]> {
  const response = await apiClient.get<ApiResponse<Supplier[]>>(`${base(tenantId)}/suppliers`);
  return response.data.data;
}

export async function createSupplier(
  tenantId: string,
  params: { name: string; kind: Supplier['kind']; contactName?: string; phone?: string; email?: string }
): Promise<Supplier> {
  const response = await apiClient.post<ApiResponse<Supplier>>(`${base(tenantId)}/suppliers`, params);
  return response.data.data;
}

/** Balance fournisseurs : miroir de la balance clients, filtrable par chantier. */
export async function getSuppliersBalance(
  tenantId: string,
  filters?: SuppliersBalanceFilters
): Promise<SuppliersBalance> {
  const response = await apiClient.get<ApiResponse<SuppliersBalance>>(
    `${base(tenantId)}/suppliers/balance${toQuery(filters as Record<string, string | undefined>)}`
  );
  return response.data.data;
}

export async function listSupplierInvoices(tenantId: string, supplierId: string): Promise<SupplierInvoice[]> {
  const response = await apiClient.get<ApiResponse<SupplierInvoice[]>>(
    `${base(tenantId)}/suppliers/${supplierId}/invoices`
  );
  return response.data.data;
}

/**
 * Saisit une facture reçue. Elle naît **brouillon** : rien ne bouge au compte
 * du fournisseur ni au coût du chantier avant validation.
 */
export async function createSupplierInvoice(
  tenantId: string,
  params: CreateSupplierInvoiceInput
): Promise<SupplierInvoice> {
  const response = await apiClient.post<ApiResponse<SupplierInvoice>>(
    `${base(tenantId)}/suppliers/${params.supplierId}/invoices`,
    params
  );
  return response.data.data;
}

/**
 * Valide une facture : écriture, mouvement du compte, imputations, d'un bloc.
 *
 * **Irréversible.** Une pièce validée ne se modifie plus ; on corrige par une
 * annulation liée. L'écran doit le dire avant, pas après.
 */
export async function validateSupplierInvoice(tenantId: string, invoiceId: string): Promise<SupplierInvoice> {
  const response = await apiClient.post<ApiResponse<SupplierInvoice>>(
    `${base(tenantId)}/supplier-invoices/${invoiceId}/validate`,
    {}
  );
  return response.data.data;
}

/** Annule une facture validée par une pièce d'annulation. Le motif est exigé. */
export async function voidSupplierInvoice(
  tenantId: string,
  invoiceId: string,
  reason: string
): Promise<SupplierInvoice> {
  const response = await apiClient.post<ApiResponse<SupplierInvoice>>(
    `${base(tenantId)}/supplier-invoices/${invoiceId}/void`,
    { reason }
  );
  return response.data.data;
}

export async function createSupplierPayment(
  tenantId: string,
  params: CreateSupplierPaymentInput
): Promise<SupplierPayment> {
  const response = await apiClient.post<ApiResponse<SupplierPayment>>(
    `${base(tenantId)}/suppliers/${params.supplierId}/payments`,
    params
  );
  return response.data.data;
}

export async function validateSupplierPayment(tenantId: string, paymentId: string): Promise<SupplierPayment> {
  const response = await apiClient.post<ApiResponse<SupplierPayment>>(
    `${base(tenantId)}/supplier-payments/${paymentId}/validate`,
    {}
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Chantiers
// ---------------------------------------------------------------------------

export async function listConstructionSites(
  tenantId: string,
  filters?: { status?: string }
): Promise<ConstructionSite[]> {
  const response = await apiClient.get<ApiResponse<ConstructionSite[]>>(`${base(tenantId)}/sites${toQuery(filters)}`);
  return response.data.data;
}

export async function createConstructionSite(
  tenantId: string,
  params: { name: string; zone?: string; propertyId?: string; startDate?: string; plannedEndDate?: string }
): Promise<ConstructionSite> {
  const response = await apiClient.post<ApiResponse<ConstructionSite>>(`${base(tenantId)}/sites`, params);
  return response.data.data;
}

/**
 * Le détail d'un chantier : ses imputations et leurs sous-totaux par poste.
 *
 * Le coût réel arrive **calculé** par le serveur. L'écran ne l'additionne pas,
 * et n'offre aucun moyen de le saisir.
 */
export async function getSiteDetail(tenantId: string, siteId: string): Promise<SiteDetail> {
  const response = await apiClient.get<ApiResponse<SiteDetail>>(`${base(tenantId)}/sites/${siteId}/detail`);
  return response.data.data;
}

export async function listCostCategories(tenantId: string): Promise<CostCategory[]> {
  const response = await apiClient.get<ApiResponse<CostCategory[]>>(`${base(tenantId)}/cost-categories`);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Caisse
// ---------------------------------------------------------------------------

export async function createCashVoucher(tenantId: string, params: CreateCashVoucherInput): Promise<CashVoucher> {
  const response = await apiClient.post<ApiResponse<CashVoucher>>(
    `${base(tenantId)}/sites/${params.siteId}/cash-vouchers`,
    params
  );
  return response.data.data;
}

export async function validateCashVoucher(tenantId: string, voucherId: string): Promise<CashVoucher> {
  const response = await apiClient.post<ApiResponse<CashVoucher>>(
    `${base(tenantId)}/cash-vouchers/${voucherId}/validate`,
    {}
  );
  return response.data.data;
}

/** URL du bon imprimable. L'impression passe par le navigateur, comme le relevé. */
export function getCashVoucherPdfUrl(tenantId: string, voucherId: string): string {
  return `${base(tenantId)}/cash-vouchers/${voucherId}.pdf`;
}

// ---------------------------------------------------------------------------
// File de validation
// ---------------------------------------------------------------------------

/** Les pièces en attente, toutes natures confondues, avec leur auteur. */
export async function getValidationQueue(
  tenantId: string,
  filters?: { createdByUserId?: string }
): Promise<PendingDocument[]> {
  const response = await apiClient.get<ApiResponse<PendingDocument[]>>(
    `${base(tenantId)}/validation-queue${toQuery(filters)}`
  );
  return response.data.data;
}
