import { t } from '../i18n/t';
/**
 * Contrat gelé de la frontière réseau — lot 4, quatrième sous-lot : les
 * tâcherons (PRD E8, besoin P10).
 *
 * Dérivé de `packages/api/src/lib/finance/types-lot4-contractors.ts`, gelé côté
 * serveur. Comme aux sous-lots précédents, **chaque champ ici porte le nom que
 * le serveur émet** — c'est la règle payée au lot 2, où le type web annonçait
 * `accountId` là où l'API émettait `thirdPartyAccountId`. Les noms de TYPE
 * perdent le suffixe `Record` du contrat serveur (`ContractorRecord` ->
 * `Contractor`), convention déjà suivie par `finance-lot4-types.ts` et
 * `finance-partnerships-types.ts`.
 *
 * **Les dates sont des chaînes ici.** Le contrat serveur les déclare `Date` ;
 * elles traversent HTTP en ISO 8601 et arrivent donc en `string`. Même choix
 * qu'au premier sous-lot (`LandLeasePayment.paymentDate`).
 *
 * **Aucun « débit » ni « crédit » ici.** On *convient* d'un marché, on *saisit*
 * une situation, on la *valide*, on *règle* un tâcheron. C'est le principe P-1
 * du PRD.
 *
 * ---------------------------------------------------------------------------
 * Un tâcheron n'est pas un fournisseur
 * ---------------------------------------------------------------------------
 *
 * Il ne facture pas. Il convient d'un **marché** pour un ouvrage, puis présente
 * des **situations** d'avancement à mesure qu'il avance.
 *
 * ---------------------------------------------------------------------------
 * Deux soldes, et les confondre est l'erreur à ne pas faire
 * ---------------------------------------------------------------------------
 *
 * ```
 * marché restant    = montant convenu − situations validées   -> reste à EXÉCUTER
 * ce qu'on lui doit = situations validées − règlements        -> reste à PAYER
 * ```
 *
 * Le premier vit sur le MARCHÉ (`ContractorContract.remainingAmount`), le
 * second sur le TÂCHERON (`Contractor.accountBalance`). Un tâcheron peut avoir
 * terminé son marché et rester créancier, ou n'avoir rien fait et avoir déjà
 * reçu un acompte. Les écrans les nomment toujours en toutes lettres, jamais
 * « solde » tout court, et jamais l'un sans l'autre — voir
 * `pages/finance/Tacheron.tsx` et le test dédié de
 * `__tests__/finance/tacherons.test.tsx`.
 *
 * ---------------------------------------------------------------------------
 * Un dépassement de marché s'affiche, il ne s'interdit pas
 * ---------------------------------------------------------------------------
 *
 * Si le tâcheron a fait davantage, la situation dit ce qui a été fait. La
 * refuser empêcherait d'enregistrer un travail réel. `remainingAmount` devient
 * négatif, `isOverrun` vaut vrai, et l'écran le montre comme une information,
 * pas comme une erreur.
 *
 * **Aucun de ces montants n'est calculé côté écran** : `statementedAmount`,
 * `remainingAmount`, `isOverrun` et `accountBalance` arrivent tout faits.
 */

/** Cycle d'une pièce de tâcheron. Le serveur réutilise `SupplierInvoiceStatus`. */
export type ContractorDocumentStatus = 'DRAFT' | 'VALIDATED' | 'VOIDED';

export const CONTRACTOR_DOCUMENT_STATUS_LABELS: Record<ContractorDocumentStatus, string> = {
  DRAFT: 'Brouillon',
  VALIDATED: t('Validée'),
  VOIDED: t('Annulée')
};

// ---------------------------------------------------------------------------
// Le tâcheron
// ---------------------------------------------------------------------------

export interface Contractor {
  id: string;
  tenantId: string;
  fullName: string;
  /** Corps de métier : maçonnerie, peinture, plomberie… Nul quand il n'a pas été renseigné. */
  trade: string | null;
  thirdPartyAccountId: string;
  isActive: boolean;
  /**
   * **Ce qu'on lui doit** : situations validées − règlements.
   *
   * **Positif quand nous lui devons**, négatif quand il a déjà reçu une avance.
   * Ce n'est PAS le marché restant : voir l'en-tête. L'écran ne le nomme jamais
   * « solde » tout court.
   */
  accountBalance: number;
  currency: string;
}

/**
 * Corps de l'enregistrement d'un tâcheron.
 *
 * `trade` est facultatif, mais le schéma serveur le refuse en chaîne VIDE
 * (`z.string().min(1).nullable().optional()`) : le service omet donc la clé
 * plutôt que d'envoyer `''`.
 */
export interface CreateContractorInput {
  fullName: string;
  trade?: string | null;
}

export interface ListContractorsFilters {
  onlyActive?: boolean;
}

// ---------------------------------------------------------------------------
// Le marché
// ---------------------------------------------------------------------------

export interface ContractorContract {
  id: string;
  contractorId: string;
  /** Nom du tâcheron. L'écran montre ce nom, jamais l'identifiant. */
  contractorLabel: string;
  siteId: string;
  /** Nom du chantier. */
  siteLabel: string;
  costCategoryId: string;
  /** Nom du poste de dépense qui recevra les situations dans le coût du chantier. */
  costCategoryLabel: string;
  reference: string;
  agreedAmount: number;
  currency: string;
  signedDate: string;
  isActive: boolean;
  /** Somme des situations **validées**. Calculée par le serveur, jamais ici. */
  statementedAmount: number;
  /**
   * `agreedAmount − statementedAmount` : le **marché restant**, ce qui reste à
   * EXÉCUTER. **Négatif en cas de dépassement.**
   *
   * Ce n'est pas ce qu'on doit au tâcheron — voir l'en-tête.
   */
  remainingAmount: number;
  /** Vrai quand les situations dépassent le marché convenu. Une information, pas une erreur. */
  isOverrun: boolean;
}

/**
 * Corps de la convention d'un marché.
 *
 * Le tâcheron voyage dans le CHEMIN (`contractors/{contractorId}/contracts`),
 * jamais dans ce corps : le schéma Zod du serveur est `.strict()`, et un champ
 * en trop est un 400. C'est le défaut qui cassait quatre créations des lots 2
 * et 3 (`__tests__/finance/corps-des-requetes.test.ts`).
 *
 * `costCategoryId` est **exigé, jamais deviné** : c'est le poste qui recevra
 * les situations dans le coût du chantier, et seule la gestionnaire sait
 * lequel.
 */
export interface CreateContractorContractInput {
  siteId: string;
  costCategoryId: string;
  reference: string;
  agreedAmount: number;
  /** `YYYY-MM-DD`. Le serveur la contraint par `z.coerce.date()`. */
  signedDate: string;
}

export interface ListContractorContractsFilters {
  contractorId?: string;
  siteId?: string;
}

// ---------------------------------------------------------------------------
// La situation d'avancement
// ---------------------------------------------------------------------------

export interface ProgressStatement {
  id: string;
  contractId: string;
  contractReference: string;
  contractorLabel: string;
  statementDate: string;
  amount: number;
  currency: string;
  /** Obligatoire. Voir `CreateProgressStatementInput`. */
  description: string;
  status: ContractorDocumentStatus;
  /** Nom de qui a saisi. L'écran du validateur en a besoin. */
  createdByLabel: string;
  validatedAt: string | null;
}

/**
 * Corps de la saisie d'une situation, à l'état brouillon.
 *
 * Le marché voyage dans le CHEMIN
 * (`contractor-contracts/{contractId}/statements`), jamais dans ce corps.
 *
 * **La description est obligatoire.** Le serveur la refuse vide, et l'écran le
 * dit avant l'envoi : une situation sans description est un chiffre que
 * personne ne saura justifier six mois plus tard.
 *
 * **Le montant n'est pas borné par le marché.** Un dépassement est accepté ; le
 * refuser côté écran empêcherait d'enregistrer un travail réellement fait.
 */
export interface CreateProgressStatementInput {
  /** `YYYY-MM-DD`. */
  statementDate: string;
  amount: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Le règlement
// ---------------------------------------------------------------------------

export interface ContractorPayment {
  id: string;
  contractorId: string;
  contractorLabel: string;
  paymentDate: string;
  amount: number;
  currency: string;
  status: ContractorDocumentStatus;
  createdByLabel: string;
  validatedAt: string | null;
}

/**
 * Corps de la saisie d'un règlement, à l'état brouillon.
 *
 * Le tâcheron voyage dans le CHEMIN (`contractors/{contractorId}/payments`),
 * jamais dans ce corps. Aucune affectation à des situations précises : un
 * règlement versé avant toute situation est un acompte, et la première
 * situation le résorbe d'elle-même.
 *
 * **Un règlement supérieur à ce qu'on doit est accepté** : le contrat le
 * prévoit. L'écran peut avertir, jamais bloquer.
 */
export interface CreateContractorPaymentInput {
  /** `YYYY-MM-DD`. */
  paymentDate: string;
  amount: number;
}
