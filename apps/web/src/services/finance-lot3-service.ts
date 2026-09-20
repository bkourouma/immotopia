/**
 * Frontière réseau du module financier — lot 3.
 *
 * Contrat gelé : les écrans appellent ces fonctions et rien d'autre. Aucun
 * écran ne construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé de `finance-service.ts` (lot 1) et `finance-lot2-service.ts`
 * (lot 2), tous deux gelés. Les fonctions de référence déjà exposées par le
 * lot 2 — `listConstructionSites`, `listSuppliers`, `listCostCategories` —
 * ne sont PAS dupliquées ici : les écrans du lot 3 les importent directement
 * de `finance-lot2-service.ts`, comme `FactureFournisseur.tsx` le fait déjà
 * pour les chantiers et les postes.
 *
 * `base()` et `toQuery()` sont recopiées plutôt qu'importées du lot 2 : ce
 * sont deux fonctions privées (non exportées) de ce fichier-là, et la
 * frontière de chaque lot doit pouvoir évoluer sans dépendre du détail
 * d'implémentation d'un autre lot.
 *
 * Comme aux lots précédents, c'est aussi le point d'insertion de l'atelier :
 * la fausse API se branche sous `apiClient`, au niveau de l'adaptateur axios,
 * de sorte que ce service, React Query et les écrans s'exécutent exactement
 * comme en production.
 *
 * Contrat : `specs/018-finance-budget-pilotage/data-model.md` §5, et le type
 * gelé `types/finance-lot3-types.ts`.
 */

import apiClient from '../utils/api-client';
import type {
  BudgetAmendment,
  CreateBudgetAmendmentInput,
  CreatePurchaseOrderInput,
  CreateSiteBudgetInput,
  PurchaseOrder,
  PurchaseOrderFilters,
  RecordSiteProgressInput,
  SiteBudget,
  SiteBudgetAlert,
  SiteEngagement,
  SiteProgressEntry,
  SitesDashboard,
  SitesDashboardFilters
} from '../types/finance-lot3-types';

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/finance`;
}

/** Même sérialisation qu'aux lots 1 et 2 : une valeur absente est omise, jamais vide. */
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
// Budget de chantier
// ---------------------------------------------------------------------------

/** Historique des budgets d'un chantier. Un seul peut être validé à la fois. */
export async function listSiteBudgets(tenantId: string, siteId: string): Promise<SiteBudget[]> {
  const response = await apiClient.get<ApiResponse<SiteBudget[]>>(`${base(tenantId)}/sites/${siteId}/budgets`);
  return response.data.data;
}

/**
 * Crée un budget, brouillon. Ses lignes ne se modifient plus ensuite : le
 * contrat gelé n'expose aucune route de mise à jour des lignes d'un budget
 * existant, brouillon ou non — seule une validation (`validateSiteBudget`) ou
 * un avenant (`createBudgetAmendment`) suivent la création. L'écran doit donc
 * composer les lignes entièrement avant d'envoyer cette création.
 */
export async function createSiteBudget(tenantId: string, params: CreateSiteBudgetInput): Promise<SiteBudget> {
  //
  // Le corps ne repete PAS l'identifiant que le chemin porte deja.
  //
  // Les schemas Zod du serveur sont en mode strict : un champ inattendu fait
  // echouer la requete en 400. Envoyer l'objet d'entree en bloc, identifiant
  // compris, cassait donc cette creation a tous les coups — et rien ne le
  // disait, parce que les tests d'ecran remplacent ce service par une
  // doublure et que les parcours de bout en bout appellent les fonctions de
  // domaine sans passer par HTTP. Trouve le 19 septembre 2026 en transcrivant
  // le contrat du lot 4.
  const { siteId, ...corps } = params;
  const response = await apiClient.post<ApiResponse<SiteBudget>>(`${base(tenantId)}/sites/${siteId}/budgets`, corps);
  return response.data.data;
}

/**
 * Le budget courant d'un chantier — **brouillon ou validé**.
 *
 * **Lit la liste (`/budgets`), jamais le singulier (`/budget`).** Les deux
 * routes existent et ne disent pas la même chose : le singulier sert le
 * budget **validé** et rend 404 sinon (`getValidatedSiteBudgetHandler`,
 * « Ce chantier n'a pas encore de budget validé »). C'est son rôle, et il le
 * garde — le calcul de l'écart n'a que faire d'un brouillon.
 *
 * Cette fonction l'appelait pourtant, en lisant son 404 comme « aucun budget
 * sur ce chantier ». Résultat, corrigé le 20 septembre 2026 : un budget qui
 * venait d'être créé — donc en brouillon — restait invisible à l'écran même
 * qui venait de le créer. Blocage en boucle fermée, car on ne pouvait plus
 * atteindre le bouton « Valider le budget » qui l'aurait rendu visible, et le
 * seul bouton offert, « Créer le budget », en aurait fabriqué un second.
 *
 * Le budget retenu est **le validé s'il existe** — il n'y en a jamais plus
 * d'un, l'index unique partiel de la base y veille — **sinon le plus récent**.
 * La liste arrive déjà du plus récent au plus ancien (contrat du lot 3), et
 * plusieurs brouillons sont permis par conception : il faut donc choisir, et
 * le dernier saisi est celui qu'on vient d'écrire.
 *
 * Renvoie `null` quand la liste est vide, ce que l'écran traduit par sa carte
 * « Aucun budget n'est encore posé pour ce chantier ».
 */
export async function getSiteBudget(tenantId: string, siteId: string): Promise<SiteBudget | null> {
  const response = await apiClient.get<ApiResponse<SiteBudget[] | null>>(`${base(tenantId)}/sites/${siteId}/budgets`);
  const budgets = Array.isArray(response.data.data) ? response.data.data : [];
  if (budgets.length === 0) return null;

  return budgets.find(budget => budget.status === 'VALIDATED') ?? budgets[0];
}

/**
 * Valide un budget : irréversible, un budget validé ne peut plus recevoir de
 * ligne — seul un avenant peut désormais le faire évoluer. L'écran doit le
 * dire avant, dans une confirmation, pas après.
 */
export async function validateSiteBudget(tenantId: string, budgetId: string): Promise<SiteBudget> {
  const response = await apiClient.post<ApiResponse<SiteBudget>>(
    `${base(tenantId)}/site-budgets/${budgetId}/validate`,
    {}
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Avenants
// ---------------------------------------------------------------------------

export async function listBudgetAmendments(tenantId: string, budgetId: string): Promise<BudgetAmendment[]> {
  const response = await apiClient.get<ApiResponse<BudgetAmendment[]>>(
    `${base(tenantId)}/site-budgets/${budgetId}/amendments`
  );
  return response.data.data;
}

/** Saisit un avenant, brouillon. Le motif est exigé par le contrat gelé. */
export async function createBudgetAmendment(
  tenantId: string,
  params: CreateBudgetAmendmentInput
): Promise<BudgetAmendment> {
  //
  // Le corps ne repete PAS l'identifiant que le chemin porte deja.
  //
  // Les schemas Zod du serveur sont en mode strict : un champ inattendu fait
  // echouer la requete en 400. Envoyer l'objet d'entree en bloc, identifiant
  // compris, cassait donc cette creation a tous les coups — et rien ne le
  // disait, parce que les tests d'ecran remplacent ce service par une
  // doublure et que les parcours de bout en bout appellent les fonctions de
  // domaine sans passer par HTTP. Trouve le 19 septembre 2026 en transcrivant
  // le contrat du lot 4.
  const { budgetId, ...corps } = params;
  const response = await apiClient.post<ApiResponse<BudgetAmendment>>(
    `${base(tenantId)}/site-budgets/${budgetId}/amendments`,
    corps
  );
  return response.data.data;
}

/** Valide un avenant : irréversible, au même titre que le budget lui-même. */
export async function validateBudgetAmendment(tenantId: string, amendmentId: string): Promise<BudgetAmendment> {
  const response = await apiClient.post<ApiResponse<BudgetAmendment>>(
    `${base(tenantId)}/budget-amendments/${amendmentId}/validate`,
    {}
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Bons de commande
// ---------------------------------------------------------------------------

export async function listPurchaseOrders(tenantId: string, filters?: PurchaseOrderFilters): Promise<PurchaseOrder[]> {
  const response = await apiClient.get<ApiResponse<PurchaseOrder[]>>(
    `${base(tenantId)}/purchase-orders${toQuery(filters as Record<string, string | undefined>)}`
  );
  return response.data.data;
}

/** Saisit un bon, brouillon. Un bon en brouillon n'engage rien (§3 du modèle). */
export async function createPurchaseOrder(tenantId: string, params: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  const response = await apiClient.post<ApiResponse<PurchaseOrder>>(`${base(tenantId)}/purchase-orders`, params);
  return response.data.data;
}

export async function getPurchaseOrder(tenantId: string, orderId: string): Promise<PurchaseOrder> {
  const response = await apiClient.get<ApiResponse<PurchaseOrder>>(`${base(tenantId)}/purchase-orders/${orderId}`);
  return response.data.data;
}

/**
 * Émet un bon : irréversible pour ce qui est de repasser en brouillon, et
 * c'est à cet instant qu'il commence à engager le chantier (§3, §6 du
 * modèle — c'est l'un des trois seuls moments où une alerte de dépassement
 * peut se déclencher). L'écran doit le dire avant, dans une confirmation.
 */
export async function issuePurchaseOrder(tenantId: string, orderId: string): Promise<PurchaseOrder> {
  const response = await apiClient.post<ApiResponse<PurchaseOrder>>(
    `${base(tenantId)}/purchase-orders/${orderId}/issue`,
    {}
  );
  return response.data.data;
}

/**
 * Annule un bon : irréversible, et l'écran doit le dire avant.
 *
 * **Le motif est obligatoire**, comme pour les annulations du lot 2
 * (`voidSupplierInvoice`, `voidCashVoucher`). L'écart signalé ici jusqu'au
 * 20 septembre 2026 était réel mais tranché dans l'autre sens que ce commentaire
 * ne le supposait : le serveur exige `reason` depuis toujours
 * (`cancelPurchaseOrderSchema`, « Le motif d'annulation est obligatoire »).
 * Cette fonction n'en envoyait aucun, et l'annulation était donc **impossible
 * depuis l'interface** — chaque tentative repartait en 400. Un bon qu'on
 * croyait annulé continuait d'engager son chantier.
 *
 * Une annulation irréversible qui n'est pas tracée est un trou d'audit :
 * l'obligation est du bon côté, c'est l'écran qui devait rattraper son retard.
 */
export async function cancelPurchaseOrder(tenantId: string, orderId: string, reason: string): Promise<PurchaseOrder> {
  const response = await apiClient.post<ApiResponse<PurchaseOrder>>(
    `${base(tenantId)}/purchase-orders/${orderId}/cancel`,
    { reason }
  );
  return response.data.data;
}

/**
 * Rapproche (ou dérapproche, avec `purchaseOrderId: null`) une facture
 * fournisseur d'un bon de commande.
 *
 * Exposée ici parce que la route appartient au contrat réseau du lot 3, mais
 * **non câblée dans aucun écran de cet agent** : le geste de rapprochement
 * relève de l'écran de facture fournisseur (`pages/finance/FactureFournisseur.tsx`),
 * qui appartient au lot 2 et est hors du territoire assigné ici.
 */
export async function setPurchaseOrderForSupplierInvoice(
  tenantId: string,
  invoiceId: string,
  purchaseOrderId: string | null
): Promise<PurchaseOrder | null> {
  const response = await apiClient.post<ApiResponse<PurchaseOrder | null>>(
    `${base(tenantId)}/supplier-invoices/${invoiceId}/purchase-order`,
    { purchaseOrderId }
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Engagé
// ---------------------------------------------------------------------------

/**
 * Ce qu'un chantier a engagé. Calculé par le serveur — réalisé plus reste à
 * facturer des bons émis — jamais recomposé ici (§3 du modèle).
 */
export async function getSiteEngagement(tenantId: string, siteId: string): Promise<SiteEngagement> {
  const response = await apiClient.get<ApiResponse<SiteEngagement>>(`${base(tenantId)}/sites/${siteId}/engagement`);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Avancement physique
// ---------------------------------------------------------------------------

export async function listSiteProgress(tenantId: string, siteId: string): Promise<SiteProgressEntry[]> {
  const response = await apiClient.get<ApiResponse<SiteProgressEntry[]>>(`${base(tenantId)}/sites/${siteId}/progress`);
  return response.data.data;
}

export async function recordSiteProgress(
  tenantId: string,
  params: RecordSiteProgressInput
): Promise<SiteProgressEntry> {
  //
  // Le corps ne repete PAS l'identifiant que le chemin porte deja.
  //
  // Les schemas Zod du serveur sont en mode strict : un champ inattendu fait
  // echouer la requete en 400. Envoyer l'objet d'entree en bloc, identifiant
  // compris, cassait donc cette creation a tous les coups — et rien ne le
  // disait, parce que les tests d'ecran remplacent ce service par une
  // doublure et que les parcours de bout en bout appellent les fonctions de
  // domaine sans passer par HTTP. Trouve le 19 septembre 2026 en transcrivant
  // le contrat du lot 4.
  const { siteId, ...corps } = params;
  const response = await apiClient.post<ApiResponse<SiteProgressEntry>>(
    `${base(tenantId)}/sites/${siteId}/progress`,
    corps
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Alertes de dépassement
// ---------------------------------------------------------------------------

/** Alertes toutes agences confondues. Le tableau de bord porte déjà l'alerte ouverte de chaque ligne (`SiteDashboardRow.openAlert`) ; cette liste sert un usage plus large, hors du périmètre des écrans de cet agent. */
export async function listBudgetAlerts(tenantId: string): Promise<SiteBudgetAlert[]> {
  const response = await apiClient.get<ApiResponse<SiteBudgetAlert[]>>(`${base(tenantId)}/budget-alerts`);
  return response.data.data;
}

/**
 * Acquitte une alerte. Une alerte informe, elle n'interdit rien (§6 du
 * modèle) : ce geste n'a donc pas la même gravité qu'une validation ou une
 * annulation, et l'écran n'a pas à le confirmer avec la même solennité.
 */
export async function acknowledgeBudgetAlert(tenantId: string, alertId: string): Promise<SiteBudgetAlert> {
  const response = await apiClient.post<ApiResponse<SiteBudgetAlert>>(
    `${base(tenantId)}/budget-alerts/${alertId}/acknowledge`,
    {}
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

/**
 * Le tableau de bord de tous les chantiers, en un seul appel agrégé côté
 * serveur (§4, critère de sortie 4 du modèle). Rien de ce qu'il rend — budget
 * révisé, engagé, écart — n'est recalculé ici.
 */
export async function getSitesDashboard(tenantId: string, filters?: SitesDashboardFilters): Promise<SitesDashboard> {
  const response = await apiClient.get<ApiResponse<SitesDashboard>>(
    `${base(tenantId)}/sites/dashboard${toQuery({
      status: filters?.status,
      // Un booléen ne traverse pas `toQuery` tel quel (elle attend `string | number`) :
      // il est explicitement mis en texte, et seulement lorsqu'il vaut vrai —
      // `onlyOverBudget=false` et l'absence du paramètre doivent produire la
      // même requête, sans quoi effacer ce filtre ne reviendrait pas au cache
      // déjà chargé (voir `lib/query-keys.ts`).
      onlyOverBudget: filters?.onlyOverBudget ? 'true' : undefined
    })}`
  );
  return response.data.data;
}
