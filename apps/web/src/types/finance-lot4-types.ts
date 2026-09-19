/**
 * Contrat gelé de la frontière réseau — lot 4, premier sous-lot : les baux de
 * terrain.
 *
 * Fichier séparé de `finance-types.ts`, `finance-lot2-types.ts` et
 * `finance-lot3-types.ts`, tous gelés. On ajoute, on ne réécrit pas.
 *
 * **Chaque champ ici porte le nom que le serveur émet.** Le lot 2 a payé cette
 * règle : le type web annonçait `accountId` là où l'API émettait
 * `thirdPartyAccountId`, et TypeScript ne pouvait rien y voir puisque c'était
 * le type lui-même qui mentait.
 *
 * **Aucun « débit » ni « crédit » ici.** On *paie* un bailleur, on *constate*
 * une charge, on *impute* à un chantier. C'est le principe P-1 du PRD.
 *
 * ---------------------------------------------------------------------------
 * Ce que l'écran doit rendre lisible
 * ---------------------------------------------------------------------------
 *
 * Le mécanisme est contre-intuitif pour qui ne fait pas de comptabilité : on
 * paie une fois par an, et la charge se répand sur douze mois. L'écran doit
 * montrer les trois chiffres qui rendent cela évident — ce qui a été payé, ce
 * qui a déjà été consommé, ce qu'il reste à consommer — et non seulement un
 * solde dont personne ne saurait dire s'il est bon signe.
 */

/** Cycle d'un paiement au bailleur : brouillon, puis validé. */
export type LandLeaseDocumentStatus = 'DRAFT' | 'VALIDATED';

export const LAND_LEASE_STATUS_LABELS: Record<LandLeaseDocumentStatus, string> = {
  DRAFT: 'Brouillon',
  VALIDATED: 'Validé'
};

// ---------------------------------------------------------------------------
// Le bail
// ---------------------------------------------------------------------------

export interface LandLeaseSiteRef {
  siteId: string;
  /** Nom du chantier. L'écran ne montre jamais l'identifiant. */
  siteLabel: string;
  status: string;
}

export interface LandLease {
  id: string;
  landlordName: string;
  /** Ce qu'on loue, en clair : « Terrain de Nongo, 800 m² ». */
  landLabel: string;
  annualAmount: number;
  costCategoryId: string;
  /** Nom du poste auquel le loyer s'impute. L'écran montre ce nom. */
  costCategoryLabel: string;
  /**
   * Le douzième mensuel, calculé par le serveur.
   *
   * L'écran l'affiche, il ne le divise pas : le reliquat d'arrondi des douze
   * mois est porté par la dernière constatation, et une division faite à
   * l'écran donnerait un chiffre qui ne correspond à aucune écriture.
   */
  monthlyAmount: number;
  currency: string;
  startDate: string;
  /** Nulle en tacite reconduction, ce qui est le cas courant. */
  endDate: string | null;
  isActive: boolean;
  sites: LandLeaseSiteRef[];
  /**
   * Solde du compte du bailleur. **Négatif quand nous avons payé d'avance.**
   *
   * Même convention de signe qu'au lot 2 pour l'acompte versé à un
   * fournisseur. L'écran ne montre pas ce nombre brut : il dit « il reste
   * X à consommer », ce qui se lit.
   */
  accountBalance: number;
}

export interface CreateLandLeaseInput {
  landlordName: string;
  landLabel: string;
  annualAmount: number;
  /**
   * Poste de dépense auquel le loyer s'imputera. Obligatoire.
   *
   * L'écran le demande : c'est la gestionnaire qui sait si le loyer d'un
   * terrain relève des « Divers » ou d'un poste créé pour cela.
   */
  costCategoryId: string;
  startDate: string;
  endDate?: string | null;
}

// ---------------------------------------------------------------------------
// Le paiement annuel
// ---------------------------------------------------------------------------

export interface LandLeasePayment {
  id: string;
  landLeaseId: string;
  landlordName: string;
  paymentDate: string;
  amount: number;
  currency: string;
  coverageStartDate: string;
  coverageEndDate: string;
  status: LandLeaseDocumentStatus;
  /** Nom de qui a saisi. L'écran du validateur en a besoin. */
  createdByLabel: string;
  validatedAt: string | null;
}

export interface CreateLandLeasePaymentInput {
  landLeaseId: string;
  paymentDate: string;
  amount: number;
  coverageStartDate: string;
  coverageEndDate: string;
}

// ---------------------------------------------------------------------------
// La constatation mensuelle
// ---------------------------------------------------------------------------

export interface LandLeaseAccrual {
  id: string;
  landLeaseId: string;
  landlordName: string;
  periodYear: number;
  periodMonth: number;
  amount: number;
  currency: string;
  /**
   * Les imputations produites, par chantier.
   *
   * Vide quand le bail n'a aucun chantier actif : la charge a bien eu lieu,
   * elle n'est simplement imputable à rien. L'écran doit le dire, et non
   * laisser croire à une ligne manquante.
   */
  allocations: Array<{ siteId: string; siteLabel: string; amount: number }>;
  createdAt: string;
}

/**
 * Corps de la constatation manuelle d'un mois.
 *
 * Manquait au gel : chaque autre route de création avait son type d'entrée,
 * celle-ci non, et l'agent des écrans a dû la supposer. Déclarée ici pour que
 * personne n'ait plus à deviner.
 *
 * L'identifiant du bail voyage dans le CHEMIN, pas dans ce corps — les
 * schémas du serveur sont en mode strict, et répéter l'identifiant ferait
 * échouer la requête en 400. C'est le défaut qui cassait quatre créations des
 * lots 2 et 3.
 */
export interface RecordLandLeaseAccrualInput {
  periodYear: number;
  periodMonth: number;
}
