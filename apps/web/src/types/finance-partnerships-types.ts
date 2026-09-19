/**
 * Contrat gelé de la frontière réseau — lot 4, deuxième sous-lot : les
 * associations.
 *
 * Dérivé de `packages/api/src/lib/finance/types-lot4-partnerships.ts`, gelé
 * côté serveur. Comme au sous-lot 1 (`finance-lot4-types.ts`), **chaque champ
 * ici porte le nom que le serveur émet** — c'est la règle payée au lot 2, où
 * le type web annonçait `accountId` là où l'API émettait
 * `thirdPartyAccountId`. Les noms de TYPE, en revanche, perdent le suffixe
 * `Record` du contrat serveur : convention déjà suivie par
 * `finance-lot4-types.ts` (`LandLeaseRecord` -> `LandLease`).
 *
 * **Aucun « débit » ni « crédit » ici.** On *répartit* un loyer, on *reverse*
 * une part, on *retire* un associé. C'est le principe P-1 du PRD.
 *
 * ---------------------------------------------------------------------------
 * Ce que l'écran doit rendre lisible
 * ---------------------------------------------------------------------------
 *
 * `companySharePercent` est ce qui reste à l'entreprise une fois les parts des
 * associés constatées — jamais un associé, jamais un compte de tiers. Un total
 * de parts à cent pour cent ne laisse rien à l'agence : l'écran le montre
 * explicitement, il ne le tait pas en cachant une carte à zéro.
 *
 * `totalSharePercent` et `companySharePercent` sont **calculés côté serveur**,
 * jamais recalculés ici à partir de `shares` : voir le commentaire du contrat
 * gelé, et le point de vigilance du rapport de cet agent.
 */

// ---------------------------------------------------------------------------
// L'association et ses parts
// ---------------------------------------------------------------------------

export interface PartnershipShare {
  id: string;
  partnerAccountId: string;
  partnerName: string;
  /** En pourcentage, deux décimales. */
  sharePercent: number;
}

export interface PartnershipPropertyRef {
  propertyId: string;
  /** Référence interne du bien. L'écran ne montre jamais l'identifiant. */
  propertyLabel: string;
}

export interface Partnership {
  id: string;
  tenantId: string;
  label: string;
  isActive: boolean;
  shares: PartnershipShare[];
  /**
   * Somme des quotes-parts des associés. **Calculée côté serveur, jamais
   * recalculée ici.** Ne peut pas dépasser cent.
   */
  totalSharePercent: number;
  /**
   * `100 − totalSharePercent`, calculé côté serveur. La part de l'entreprise,
   * par différence — elle n'est pas un associé, elle ne porte pas de compte de
   * tiers. Voir l'en-tête : l'écran la montre toujours, même à zéro.
   */
  companySharePercent: number;
  /** Les biens détenus par cette association, nommés. */
  properties: PartnershipPropertyRef[];
}

/**
 * Corps de la création d'une association. Sans associé : les parts s'ajoutent
 * ensuite, une par une (`AddPartnershipShareInput`) — voir le commentaire du
 * contrat gelé sur `CreatePartnershipTx`.
 */
export interface CreatePartnershipInput {
  label: string;
}

/**
 * Corps de l'ajout d'un associé.
 *
 * L'identifiant de l'association voyage dans le CHEMIN
 * (`partnerships/{id}/shares`), jamais dans ce corps — c'est le défaut qui
 * cassait quatre créations des lots 2 et 3 (schémas serveur en mode strict,
 * champ inattendu = 400). Voir `__tests__/finance/corps-des-requetes.test.ts`.
 */
export interface AddPartnershipShareInput {
  partnerName: string;
  sharePercent: number;
}

export interface ListPartnershipsFilters {
  onlyActive?: boolean;
}

// ---------------------------------------------------------------------------
// L'état de quote-part — lecture seule
// ---------------------------------------------------------------------------

export interface PartnerStatementLine {
  propertyLabel: string;
  periodYear: number;
  periodMonth: number;
  /** Le loyer facturé au locataire, en entier. */
  rentBilled: number;
  /** Ce qui en a été encaissé, à l'instant de la lecture. */
  rentCollected: number;
  /** La part de cet associé sur ce loyer. */
  partnerShare: number;
}

export interface PartnerStatement {
  partnershipShareId: string;
  partnerName: string;
  sharePercent: number;
  lines: PartnerStatementLine[];
  /** Somme des parts de la période. Calculé côté serveur. */
  totalShare: number;
  /**
   * Ce qui a déjà été reversé à l'associé, sur la période. Calculé côté
   * serveur : somme des règlements portés à son compte de tiers.
   */
  totalPaidOut: number;
  /**
   * Ce qui lui reste dû, à l'instant de la lecture : le solde de son compte.
   *
   * **Positif quand nous lui devons.** Ne se déduit pas des deux montants
   * ci-dessus : ceux-là portent sur la période du relevé, celui-ci sur toute
   * l'histoire du compte.
   */
  accountBalance: number;
  currency: string;
}

/**
 * Bornes optionnelles du relevé, envoyées en `from` / `to` (`YYYY-MM-DD`).
 * Même forme que `StatementFilters` du lot 1 (`types/finance-types.ts`),
 * recopiée plutôt qu'importée pour la même raison qu'au lot 4 : la frontière
 * de ce sous-lot ne doit pas dépendre d'un détail d'un autre lot.
 */
export interface PartnerStatementFilters {
  from?: string;
  to?: string;
}
