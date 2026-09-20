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
import { API_URL } from '../config/api';
import type {
  CashVoucher,
  ConstructionSite,
  CostCategory,
  CreateCashVoucherInput,
  CreateSupplierInvoiceInput,
  CreateSupplierPaymentInput,
  PendingDocument,
  SiteAllocationLine,
  SiteDetail,
  Supplier,
  SupplierInvoice,
  SupplierPayment,
  SuppliersBalance,
  SuppliersBalanceFilters
} from '../types/finance-lot2-types';
import { t } from '../i18n/t';

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
  params: { name: string; kind: Supplier['kind']; contactName?: string; contactPhone?: string; contactEmail?: string }
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

/**
 * Annule un règlement validé, par une pièce d'annulation liée.
 *
 * Le principe P-6 du PRD veut qu'une pièce validée ne se modifie plus : on la
 * corrige par une annulation, qui produit l'écriture inverse, et l'historique
 * montre les deux. Le motif est obligatoire, sans quoi le grand livre garde une
 * annulation inexpliquée.
 */
export async function voidSupplierPayment(tenantId: string, paymentId: string, reason: string): Promise<void> {
  await apiClient.post(`${base(tenantId)}/supplier-payments/${paymentId}/void`, { reason });
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
 * Forme réseau du détail d'un chantier, telle que le contrat gelé la décrit
 * (`specs/017-.../contracts/openapi.yaml`, `ConstructionSiteDetailResponseWrapper`).
 *
 * Elle ne coïncide pas avec `SiteDetail`, le type que les écrans manipulent :
 * le serveur nomme les sous-totaux `subtotalsByCategory` et leur montant
 * `total`, là où l'écran attend `byCostCategory` et `amount`. La conversion se
 * fait ici, comme pour `createCashVoucher` plus bas : le service est la seule
 * couture entre le vocabulaire du réseau et celui de l'interface, et aucun
 * composant ne doit connaître les deux.
 */
interface SiteDetailReseau {
  siteId: string;
  site?: SiteDetail['site'];
  actualCost: number;
  allocations: SiteAllocationLine[];
  subtotalsByCategory: Array<{ costCategoryId: string; label: string; total: number }>;
}

/**
 * Le détail d'un chantier : le chantier lui-même, ses imputations et leurs
 * sous-totaux par poste.
 *
 * Le coût réel arrive **calculé** par le serveur. L'écran ne l'additionne pas,
 * et n'offre aucun moyen de le saisir.
 *
 * **Pourquoi cette fonction traduit au lieu de rendre la réponse telle quelle.**
 * Elle le faisait, jusqu'au 20 septembre 2026 : elle annonçait rendre un
 * `SiteDetail` et rendait en réalité la charge utile brute, dont la forme
 * diffère. `ChantierDetail.tsx` lisait donc `site.name` sur un objet absent,
 * et la fiche d'un chantier tombait sur l'écran d'erreur global de
 * l'application — pas sur son propre état d'erreur, qui aurait au moins laissé
 * la navigation debout. Le compilateur ne voyait rien : le mensonge était dans
 * l'annotation de type de la réponse.
 */
export async function getSiteDetail(tenantId: string, siteId: string): Promise<SiteDetail> {
  const response = await apiClient.get<ApiResponse<SiteDetailReseau>>(`${base(tenantId)}/sites/${siteId}/detail`);
  const charge = response.data.data;

  // Un serveur antérieur au 20 septembre 2026 ne renvoie pas le chantier. On
  // le dit franchement plutôt que de rendre un objet incomplet : react-query
  // bascule alors l'écran sur son propre état d'erreur, qui porte un bouton
  // « Réessayer », au lieu de laisser un composant tomber plus loin sur un
  // champ manquant.
  if (!charge?.site) {
    throw new Error(t('La réponse du serveur ne porte pas le chantier : détail indisponible.'));
  }

  return {
    site: charge.site,
    allocations: charge.allocations ?? [],
    byCostCategory: (charge.subtotalsByCategory ?? []).map(poste => ({
      costCategoryId: poste.costCategoryId,
      label: poste.label,
      amount: poste.total
    }))
  };
}

export async function listCostCategories(tenantId: string): Promise<CostCategory[]> {
  const response = await apiClient.get<ApiResponse<CostCategory[]>>(`${base(tenantId)}/cost-categories`);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Caisse
// ---------------------------------------------------------------------------

/**
 * Remet une pièce de caisse au vocabulaire des écrans.
 *
 * Le serveur nomme le bénéficiaire `beneficiaryName`, du nom de sa colonne et
 * de son contrat ; le type `CashVoucher` des écrans l'appelle `beneficiary`.
 * L'aller était déjà traduit depuis le 19 septembre 2026 — le retour, non.
 *
 * Conséquence, corrigée le 20 septembre 2026 : `piece.beneficiary` valait
 * `undefined`, la ligne « Bénéficiaire : » de la carte restait vide, et les
 * titres interpolés affichaient leur gabarit en clair — « Pièce à valider —
 * {{beneficiary}} ». i18next laisse en effet le motif intact quand la valeur
 * manque, plutôt que d'écrire « undefined ».
 */
function versLaPieceDeLEcran(charge: CashVoucher & { beneficiaryName?: string }): CashVoucher {
  return { ...charge, beneficiary: charge.beneficiary ?? charge.beneficiaryName ?? '' };
}

export async function createCashVoucher(tenantId: string, params: CreateCashVoucherInput): Promise<CashVoucher> {
  // DEUX ecarts avec le serveur, tous deux corriges ici le 19 septembre 2026.
  //
  // 1. Le corps repetait `siteId`, que le chemin porte deja. Le schema Zod du
  //    serveur est en mode strict : un champ inattendu fait echouer la
  //    requete en 400.
  // 2. Le serveur attend `beneficiaryName`, du nom de sa colonne ; ce service
  //    envoyait `beneficiary`, du nom que la REPONSE porte. Le champ attendu
  //    manquait donc, et un champ inconnu s'y ajoutait.
  //
  // La creation d'une piece de caisse echouait ainsi a tous les coups, depuis
  // le lot 2, sans que rien ne le dise : les tests d'ecran remplacent ce
  // service par une doublure, et le parcours de bout en bout appelle les
  // fonctions de domaine sans passer par HTTP.
  const { siteId, beneficiary, ...reste } = params;
  const response = await apiClient.post<ApiResponse<CashVoucher>>(`${base(tenantId)}/sites/${siteId}/cash-vouchers`, {
    ...reste,
    beneficiaryName: beneficiary
  });
  return versLaPieceDeLEcran(response.data.data);
}

export async function validateCashVoucher(tenantId: string, voucherId: string): Promise<CashVoucher> {
  const response = await apiClient.post<ApiResponse<CashVoucher>>(
    `${base(tenantId)}/cash-vouchers/${voucherId}/validate`,
    {}
  );
  return versLaPieceDeLEcran(response.data.data);
}

/**
 * Annule une pièce de caisse validée, par une pièce d'annulation liée.
 *
 * Le coût du chantier retombe de lui-même : il est dérivé des imputations
 * validées et non annulées, jamais stocké (principe P-4). Rien à recalculer à
 * l'écran, rien à corriger à la main.
 */
export async function voidCashVoucher(tenantId: string, voucherId: string, reason: string): Promise<void> {
  await apiClient.post(`${base(tenantId)}/cash-vouchers/${voucherId}/void`, { reason });
}

/**
 * URL du bon imprimable.
 *
 * **Absolue, et c'est tout l'enjeu.** Les autres fonctions de ce fichier
 * passent par `apiClient`, qui porte déjà `API_URL` en base ; celle-ci rend
 * une adresse que `window.open` ouvrira lui-même, sans passer par le client.
 * Un chemin relatif s'y résolvait donc contre l'origine du FRONT — le
 * navigateur demandait `localhost:3000/tenants/…/….pdf`, recevait la coquille
 * de l'application en HTML, et l'onglet restait vide sans la moindre erreur.
 * Trouvé par le test de bout en bout du 20 septembre 2026.
 */
export function getCashVoucherPdfUrl(tenantId: string, voucherId: string): string {
  return `${API_URL}${base(tenantId)}/cash-vouchers/${voucherId}.pdf`;
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
