/**
 * Frontière réseau du module financier — lot 4, sous-lot « tâcherons ».
 *
 * Contrat gelé : les écrans appellent ces fonctions et rien d'autre. Aucun
 * écran ne construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé de `finance-service.ts`, `finance-lot2-service.ts`,
 * `finance-lot3-service.ts`, `finance-lot4-service.ts` et
 * `finance-partnerships-service.ts`, tous gelés. `base()` et `toQuery()` sont
 * recopiées plutôt qu'importées d'un sous-lot précédent, pour la même raison
 * qu'aux sous-lots précédents : la frontière de ce sous-lot doit pouvoir
 * évoluer sans dépendre du détail d'implémentation d'un autre.
 *
 * ---------------------------------------------------------------------------
 * Aucun corps ne répète un identifiant que le chemin porte déjà
 * ---------------------------------------------------------------------------
 *
 * Les trois schémas Zod de création du serveur (`schemas-contractors.ts`) sont
 * `.strict()` : un champ en trop est un 400. `createContractorContract`,
 * `createProgressStatement` et `createContractorPayment` prennent donc leur
 * identifiant de rattachement en ARGUMENT SÉPARÉ, jamais dans l'objet d'entrée
 * — c'est exactement le défaut qui cassait quatre créations des lots 2 et 3,
 * épinglé par `__tests__/finance/corps-des-requetes.test.ts`, auquel ces
 * quatre créations ajoutent les leurs.
 *
 * Comme aux lots précédents, c'est aussi le point d'insertion de l'atelier :
 * la fausse API se branche sous `apiClient`, au niveau de l'adaptateur axios.
 *
 * Routes : `packages/api/src/routes/finance-contractors-routes.ts`. Contrat :
 * `packages/api/src/lib/finance/types-lot4-contractors.ts`, et son dérivé web
 * `types/finance-contractors-types.ts`.
 */

import apiClient from '../utils/api-client';
import type {
  Contractor,
  ContractorContract,
  ContractorPayment,
  CreateContractorContractInput,
  CreateContractorInput,
  CreateContractorPaymentInput,
  CreateProgressStatementInput,
  ListContractorContractsFilters,
  ListContractorsFilters,
  ProgressStatement
} from '../types/finance-contractors-types';

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/finance`;
}

function toQuery(filters?: Record<string, string | number | boolean | undefined>): string {
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
// Le tâcheron
// ---------------------------------------------------------------------------

/** Route A. `onlyActive` part en paramètre de REQUÊTE, jamais dans le chemin. */
export async function listContractors(tenantId: string, filters?: ListContractorsFilters): Promise<Contractor[]> {
  const response = await apiClient.get<ApiResponse<Contractor[]>>(
    `${base(tenantId)}/contractors${toQuery(filters as Record<string, boolean | undefined>)}`
  );
  return response.data.data;
}

/**
 * Route B. Enregistre un tâcheron, et ouvre dans le même geste son compte de
 * tiers.
 *
 * `trade` vide est RETIRÉ du corps plutôt qu'envoyé en chaîne vide : le schéma
 * serveur est `z.string().min(1).nullable().optional()`, une chaîne vide est un
 * 400. Le tâcheron sans corps de métier renseigné part donc avec le seul
 * `fullName`.
 */
export async function createContractor(tenantId: string, params: CreateContractorInput): Promise<Contractor> {
  const corps: Record<string, unknown> = { fullName: params.fullName };
  const metier = params.trade?.trim();
  if (metier) corps.trade = metier;

  const response = await apiClient.post<ApiResponse<Contractor>>(`${base(tenantId)}/contractors`, corps);
  return response.data.data;
}

/**
 * **Le contrat n'expose AUCUNE route de détail d'un tâcheron.** Les onze routes
 * du sous-lot n'offrent que la liste (route A) ; il n'y a pas de
 * `GET contractors/{contractorId}`.
 *
 * La fiche a pourtant besoin de l'identité du tâcheron et de ce qu'on lui doit.
 * Elle lit donc la liste — quelques dizaines de lignes au plus, non paginée par
 * le contrat — et y retrouve le tâcheron. Le détour est isolé ICI plutôt que
 * répété dans l'écran, pour qu'une future route de détail n'ait qu'un seul
 * point à remplacer. Voir la rubrique « Hypothèses » du rapport de cet agent.
 *
 * Rend `null` quand l'identifiant ne correspond à aucun tâcheron de l'agence :
 * l'écran distingue alors « introuvable » de « en cours de chargement ».
 */
export async function findContractor(tenantId: string, contractorId: string): Promise<Contractor | null> {
  const contractors = await listContractors(tenantId);
  return contractors.find(candidat => candidat.id === contractorId) ?? null;
}

// ---------------------------------------------------------------------------
// Le marché
// ---------------------------------------------------------------------------

/**
 * Route C. Liste TRANSVERSALE des marchés, filtrée en requête par
 * `contractorId` / `siteId` — cette route n'appartient ni au tâcheron ni au
 * chantier, les deux filtres sont donc des paramètres de requête et jamais des
 * segments de chemin.
 */
export async function listContractorContracts(
  tenantId: string,
  filters?: ListContractorContractsFilters
): Promise<ContractorContract[]> {
  const response = await apiClient.get<ApiResponse<ContractorContract[]>>(
    `${base(tenantId)}/contractor-contracts${toQuery(filters as Record<string, string | undefined>)}`
  );
  return response.data.data;
}

/**
 * Route D. Convient d'un marché avec UN tâcheron, sur un chantier et un poste.
 *
 * Le tâcheron voyage dans le CHEMIN : `contractorId` est un argument séparé, et
 * n'entre jamais dans le corps (schéma `.strict()` côté serveur).
 */
export async function createContractorContract(
  tenantId: string,
  contractorId: string,
  params: CreateContractorContractInput
): Promise<ContractorContract> {
  const response = await apiClient.post<ApiResponse<ContractorContract>>(
    `${base(tenantId)}/contractors/${contractorId}/contracts`,
    params
  );
  return response.data.data;
}

/** Route E. Détail d'un marché : `statementedAmount`, `remainingAmount` et `isOverrun` arrivent tout faits. */
export async function getContractorContract(tenantId: string, contractId: string): Promise<ContractorContract> {
  const response = await apiClient.get<ApiResponse<ContractorContract>>(
    `${base(tenantId)}/contractor-contracts/${contractId}`
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// La situation d'avancement
// ---------------------------------------------------------------------------

/** Route F. Les situations d'UN marché. */
export async function listProgressStatements(tenantId: string, contractId: string): Promise<ProgressStatement[]> {
  const response = await apiClient.get<ApiResponse<ProgressStatement[]>>(
    `${base(tenantId)}/contractor-contracts/${contractId}/statements`
  );
  return response.data.data;
}

/**
 * Route G. Saisit une situation, à l'état brouillon : aucune écriture, aucun
 * mouvement, aucune imputation tant qu'elle n'est pas validée.
 *
 * Le marché voyage dans le CHEMIN ; le corps ne porte que `statementDate`,
 * `amount` et `description`. La description est obligatoire côté serveur, et
 * l'écran le dit avant l'envoi.
 */
export async function createProgressStatement(
  tenantId: string,
  contractId: string,
  params: CreateProgressStatementInput
): Promise<ProgressStatement> {
  const response = await apiClient.post<ApiResponse<ProgressStatement>>(
    `${base(tenantId)}/contractor-contracts/${contractId}/statements`,
    params
  );
  return response.data.data;
}

/**
 * Route H. Valide une situation : c'est à cet instant que l'écriture est
 * passée, que le tâcheron devient créancier et que le coût du chantier monte.
 * **Irréversible** — l'écran le dit avant, dans une confirmation, jamais après
 * coup.
 */
export async function validateProgressStatement(tenantId: string, statementId: string): Promise<ProgressStatement> {
  const response = await apiClient.post<ApiResponse<ProgressStatement>>(
    `${base(tenantId)}/progress-statements/${statementId}/validate`,
    {}
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Le règlement
// ---------------------------------------------------------------------------

/** Route I. Les règlements d'UN tâcheron. */
export async function listContractorPayments(tenantId: string, contractorId: string): Promise<ContractorPayment[]> {
  const response = await apiClient.get<ApiResponse<ContractorPayment[]>>(
    `${base(tenantId)}/contractors/${contractorId}/payments`
  );
  return response.data.data;
}

/**
 * Route J. Saisit un règlement, à l'état brouillon, sans affectation à des
 * situations précises.
 *
 * Le tâcheron voyage dans le CHEMIN ; le corps ne porte que `paymentDate` et
 * `amount`. Un règlement supérieur à ce qu'on doit est accepté : c'est un
 * acompte, et la première situation le résorbe.
 */
export async function createContractorPayment(
  tenantId: string,
  contractorId: string,
  params: CreateContractorPaymentInput
): Promise<ContractorPayment> {
  const response = await apiClient.post<ApiResponse<ContractorPayment>>(
    `${base(tenantId)}/contractors/${contractorId}/payments`,
    params
  );
  return response.data.data;
}

/** Route K. Valide un règlement : l'argent sort de la caisse. **Irréversible**, dit avant. */
export async function validateContractorPayment(tenantId: string, paymentId: string): Promise<ContractorPayment> {
  const response = await apiClient.post<ApiResponse<ContractorPayment>>(
    `${base(tenantId)}/contractor-payments/${paymentId}/validate`,
    {}
  );
  return response.data.data;
}
