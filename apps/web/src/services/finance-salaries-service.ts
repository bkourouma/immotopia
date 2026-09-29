/**
 * Frontière réseau du module financier — lot 4, sous-lot « salaires ».
 *
 * Contrat gelé : les écrans appellent ces fonctions et rien d'autre. Aucun
 * écran ne construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé de `finance-service.ts`, `finance-lot2-service.ts`,
 * `finance-lot3-service.ts`, `finance-lot4-service.ts` et
 * `finance-partnerships-service.ts`, tous gelés. `base()` et `toQuery()` sont
 * recopiées plutôt qu'importées d'un lot précédent, pour la même raison qu'aux
 * sous-lots précédents : la frontière de ce sous-lot doit pouvoir évoluer sans
 * dépendre du détail d'implémentation d'un autre.
 *
 * **Aucun corps de requête ne répète un identifiant que le chemin porte
 * déjà.** C'est le défaut relevé dans `corps-des-requetes.test.ts`, qui a cassé
 * quatre créations des lots 2 et 3 contre les schémas Zod stricts du serveur.
 * Ici, trois créations sont concernées — le salarié, la note, le règlement — et
 * les trois y font attention. Les adresses et les corps sont épinglés dans
 * `__tests__/finance/corps-des-requetes.test.ts`.
 *
 * Les schémas serveur sont `.strict()` : **un champ en trop est un 400**, pas
 * un champ ignoré. C'est pourquoi `createSalaryNote` ci-dessous construit son
 * corps champ par champ au lieu de relayer son objet d'entrée en bloc.
 *
 * Comme aux lots précédents, c'est aussi le point d'insertion de l'atelier : la
 * fausse API se branche sous `apiClient`, au niveau de l'adaptateur axios.
 *
 * Contrat : `packages/api/src/lib/finance/types-lot4-salaries.ts` (gelé côté
 * serveur), ses routes `routes/finance-salaries-routes.ts`, ses schémas
 * `lib/finance/schemas-salaries.ts`, et son dérivé web
 * `types/finance-salaries-types.ts`.
 */

import apiClient from '../utils/api-client';
import type { OutflowPayerChoice } from '../types/finance-outflow-types';
import type {
  CreateEmployeeInput,
  CreateSalaryNoteInput,
  CreateSalaryPaymentInput,
  Employee,
  ListEmployeesFilters,
  ListSalaryNotesFilters,
  SalaryNote,
  SalaryPayment
} from '../types/finance-salaries-types';

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
// L'employé
// ---------------------------------------------------------------------------

/**
 * Les salariés de l'agence, avec ce qu'on leur doit (`accountBalance`).
 *
 * `onlyActive` part en REQUÊTE, jamais dans le chemin. Le serveur l'accepte en
 * chaîne littérale `'true'`/`'false'` autant qu'en booléen
 * (`schemas-salaries.ts`, `booleanQueryParam`) : `toQuery` en fait une chaîne,
 * ce qui tombe dans le cas prévu.
 */
export async function listEmployees(tenantId: string, filters?: ListEmployeesFilters): Promise<Employee[]> {
  const response = await apiClient.get<ApiResponse<Employee[]>>(
    `${base(tenantId)}/employees${toQuery(filters as Record<string, boolean | undefined>)}`
  );
  return response.data.data;
}

/**
 * Enregistre un salarié et ouvre son compte de tiers.
 *
 * Le corps ne porte que `fullName` et, s'il a été renseigné, `role` : le tenant
 * est déjà dans le chemin. `role` est omis plutôt qu'envoyé vide — le schéma
 * refuse la chaîne vide (`z.string().min(1)`), qui provoquerait un 400 pour un
 * champ que l'utilisateur a simplement laissé de côté.
 */
export async function createEmployee(tenantId: string, params: CreateEmployeeInput): Promise<Employee> {
  const corps: Record<string, unknown> = { fullName: params.fullName };
  if (params.role !== undefined && params.role !== null && params.role !== '') {
    corps.role = params.role;
  }
  const response = await apiClient.post<ApiResponse<Employee>>(`${base(tenantId)}/employees`, corps);
  return response.data.data;
}

export async function getEmployee(tenantId: string, employeeId: string): Promise<Employee> {
  const response = await apiClient.get<ApiResponse<Employee>>(`${base(tenantId)}/employees/${employeeId}`);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// La note de salaire
// ---------------------------------------------------------------------------

/**
 * Les notes de salaire, **liste transversale** : la route ne porte aucun
 * employé dans son chemin (`GET finance/salary-notes`), et tous les filtres —
 * `employeeId` compris — partent en requête. C'est le contrat, pas une
 * commodité : la fiche d'un salarié s'en sert avec `employeeId`, un écran de
 * chantier s'en servirait avec `siteId`.
 */
export async function listSalaryNotes(tenantId: string, filters?: ListSalaryNotesFilters): Promise<SalaryNote[]> {
  const response = await apiClient.get<ApiResponse<SalaryNote[]>>(
    `${base(tenantId)}/salary-notes${toQuery(filters as Record<string, string | number | undefined>)}`
  );
  return response.data.data;
}

/**
 * Saisit la note de salaire d'un mois, à l'état brouillon.
 *
 * Aucune écriture, aucun mouvement, aucune imputation : tout naît à la
 * validation.
 *
 * L'employé voyage dans le CHEMIN (`employees/{employeeId}/salary-notes`) et
 * **jamais dans le corps** : le schéma serveur est `.strict()` et le rejetterait
 * en 400.
 *
 * `siteId` et `costCategoryId` vont par paire et le serveur refuse l'un sans
 * l'autre dans les deux sens. Le corps est donc construit champ par champ :
 * sans chantier, aucun des deux n'est envoyé. Rien n'est jeté en silence — ce
 * que l'appelant donne part, ce qu'il ne donne pas n'est pas inventé.
 *
 * **Une note par employé et par mois** : une seconde saisie du même mois est
 * refusée par un 409 métier dont l'appelant relaie le message, sans le deviner.
 */
export async function createSalaryNote(
  tenantId: string,
  employeeId: string,
  params: CreateSalaryNoteInput
): Promise<SalaryNote> {
  const corps: Record<string, unknown> = {
    periodYear: params.periodYear,
    periodMonth: params.periodMonth,
    amount: params.amount
  };
  if (params.siteId !== undefined) corps.siteId = params.siteId;
  if (params.costCategoryId !== undefined) corps.costCategoryId = params.costCategoryId;

  const response = await apiClient.post<ApiResponse<SalaryNote>>(
    `${base(tenantId)}/employees/${employeeId}/salary-notes`,
    corps
  );
  return response.data.data;
}

/**
 * Valide la note : la charge naît, le compte du salarié devient créditeur, et
 * la charge s'impute au chantier si la note en porte un.
 *
 * La note est identifiée par le seul `salaryNoteId` du chemin : le corps est
 * vide, comme pour la validation d'un paiement de bail au sous-lot 1.
 */
export async function validateSalaryNote(tenantId: string, salaryNoteId: string): Promise<SalaryNote> {
  const response = await apiClient.post<ApiResponse<SalaryNote>>(
    `${base(tenantId)}/salary-notes/${salaryNoteId}/validate`,
    {}
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Le règlement
// ---------------------------------------------------------------------------

/** Les règlements d'UN salarié : l'employé est dans le chemin, sans filtre. */
export async function listSalaryPayments(tenantId: string, employeeId: string): Promise<SalaryPayment[]> {
  const response = await apiClient.get<ApiResponse<SalaryPayment[]>>(
    `${base(tenantId)}/employees/${employeeId}/salary-payments`
  );
  return response.data.data;
}

/**
 * Saisit un règlement de salaire, à l'état brouillon.
 *
 * Sans affectation à des notes précises : on paie un salarié, pas une facture.
 * Le corps ne porte donc que la date et le montant — ni `employeeId` (dans le
 * chemin), ni `allocations` (qui n'existent pas ici).
 */
export async function createSalaryPayment(
  tenantId: string,
  employeeId: string,
  params: CreateSalaryPaymentInput
): Promise<SalaryPayment> {
  const response = await apiClient.post<ApiResponse<SalaryPayment>>(
    `${base(tenantId)}/employees/${employeeId}/salary-payments`,
    { paymentDate: params.paymentDate, amount: params.amount }
  );
  return response.data.data;
}

/**
 * Valide le règlement : ce qu'on doit au salarié diminue d'autant.
 *
 * **Ne refuse pas un règlement supérieur au solde** (contrat gelé) : le compte
 * devient alors débiteur d'une avance sur salaire, et c'est voulu. L'écran ne
 * pose aucun garde-fou que le serveur n'a pas.
 */
export async function validateSalaryPayment(
  tenantId: string,
  salaryPaymentId: string,
  payer?: OutflowPayerChoice
): Promise<SalaryPayment> {
  const response = await apiClient.post<ApiResponse<SalaryPayment>>(
    `${base(tenantId)}/salary-payments/${salaryPaymentId}/validate`,
    payer ?? {}
  );
  return response.data.data;
}
