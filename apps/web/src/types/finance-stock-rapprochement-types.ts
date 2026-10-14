/**
 * Contrat gelé de la frontière réseau — lot 5, quatrième sous-lot : la bascule
 * d'un chantier au stock, et le rapprochement acheté / consommé / restant
 * (PRD E9, besoin S7, principe P-7).
 *
 * Dérivé de `packages/api/src/lib/finance/types-lot5-rapprochement.ts`, gelé
 * côté serveur. Comme aux sous-lots précédents, **chaque champ ici porte le nom
 * que le serveur émet** — la règle payée au lot 2, où le type web annonçait
 * `accountId` là où l'API émettait `thirdPartyAccountId`. Les noms de TYPE
 * perdent le suffixe `Record` du contrat serveur (`SiteStockStatusRecord` ->
 * `SiteStockStatus`), convention déjà suivie par
 * `finance-stock-referentiel-types.ts`.
 *
 * **Les dates sont des chaînes ici.** Le contrat serveur déclare
 * `stockEnabledAt` en `Date` ; elle traverse HTTP en ISO 8601 et arrive donc en
 * `string`. Même choix qu'aux sous-lots précédents.
 *
 * **Aucun « débit » ni « crédit » ici** (principe P-1 du PRD). Un chantier
 * *passe au stock*, une marchandise *entre*, *vient d'un autre lieu*, est
 * *consommée* ou *reste*.
 *
 * ---------------------------------------------------------------------------
 * La bascule est IRRÉVERSIBLE, et ce fichier n'offre aucun retour
 * ---------------------------------------------------------------------------
 *
 * Il n'y a ici ni entrée « annuler la bascule », ni corps de retour en arrière,
 * parce qu'AUCUNE route ne revient en arrière — pas même pour un
 * administrateur. Revenir en arrière obligerait à rejouer l'imputation de
 * toutes les factures postérieures à la bascule et à défaire celle de toutes
 * les sorties : le coût du chantier changerait sous les pieds de celui qui le
 * regarde, et rien ne dirait pourquoi.
 *
 * Une agence qui bascule un chantier par erreur n'a qu'un recours : ne plus
 * s'en servir. L'écran le dit avant de confirmer, pas après.
 *
 * ---------------------------------------------------------------------------
 * La bascule n'a AUCUN corps, et surtout pas de date
 * ---------------------------------------------------------------------------
 *
 * Aucun type d'entrée n'est déclaré pour la bascule, et c'est délibéré : le
 * schéma Zod du serveur est `z.object({}).strict()`. Un corps qui porterait
 * `enabledAt` recevrait un 400 — accepter une date choisie par l'appelant
 * laisserait antidater la bascule, c'est-à-dire reclasser après coup des
 * factures déjà imputées. La date est celle de l'instant de la décision, posée
 * par le serveur.
 *
 * ---------------------------------------------------------------------------
 * Les deux entrées ne se mélangent pas, et c'est le cœur du sous-lot
 * ---------------------------------------------------------------------------
 *
 * `receivedQuantity` / `receivedValue` : ce qui est entré depuis une FACTURE
 * fournisseur. `transferredInQuantity` / `transferredInValue` : ce qui est venu
 * d'un AUTRE LIEU de l'agence.
 *
 * **Seule la première grandeur se confronte au facturé.** Une livraison
 * interne n'est pas un achat : elle a été payée ailleurs, ou ne l'a jamais
 * été. Les confondre — ce que faisait le premier jet du contrat serveur —
 * rendait l'écart négatif sur un chantier approvisionné depuis un magasin
 * central, c'est-à-dire dans le cas le plus courant. Un indicateur qui se
 * trompe dans le cas courant est pire qu'un indicateur absent.
 */

// ---------------------------------------------------------------------------
// L'état du chantier
// ---------------------------------------------------------------------------

/**
 * Où en est un chantier : passé au stock ou non, depuis quand, et où
 * atterrissent ses réceptions.
 *
 * `stockLocationId` peut être renseigné sur un chantier qui n'a PAS basculé :
 * le référentiel du stock permet de créer un lieu de chantier à la main. Le
 * taire laisserait un écran affirmer qu'il n'y a nulle part où recevoir alors
 * qu'il y a un lieu.
 */
export interface SiteStockStatus {
  siteId: string;
  siteLabel: string;
  /** ISO 8601. **Nulle tant que le chantier n'est pas passé au stock.** */
  stockEnabledAt: string | null;
  /** Le lieu de stockage du chantier. Nul tant qu'aucun n'existe. */
  stockLocationId: string | null;
  /** Libellé du lieu. L'écran montre ce nom, jamais l'identifiant. */
  stockLocationLabel: string | null;
  /**
   * Lot 040 (A7-R1) : vrai si le chantier est basculé depuis moins de 30
   * jours et que son lieu n'a aucun inventaire d'ouverture non abandonné.
   */
  openingCountSuggested: boolean;
}

// ---------------------------------------------------------------------------
// Le rapprochement
// ---------------------------------------------------------------------------

/**
 * Un article, sur ce chantier.
 *
 * **Les quatre quantités ne se soustraient pas entre elles**, et le contrat
 * serveur ne leur demande pas de le faire : le consommé compte les sorties
 * imputées à ce chantier DEPUIS N'IMPORTE QUEL LIEU — on sort couramment d'un
 * magasin central vers un chantier —, tandis que le reçu, le transféré et le
 * restant portent sur le seul LIEU du chantier. C'est une asymétrie voulue,
 * pas un défaut à corriger à l'écran.
 *
 * **Les quantités sont des `Decimal(16,4)` côté serveur.** Un quart de mètre
 * cube vaut 0,25 : l'écran ne les passe jamais au formateur monétaire, qui
 * arrondit à l'unité et afficherait « 0 ».
 */
export interface SiteStockReconciliationLine {
  itemId: string;
  itemReference: string;
  itemLabel: string;
  /** Sac, tonne, barre, m³ — texte libre du référentiel. */
  itemUnit: string;
  /** Entré au lieu du chantier depuis une FACTURE. */
  receivedQuantity: number;
  /** Entré depuis un AUTRE LIEU de l'agence. Jamais mêlé au reçu. */
  transferredInQuantity: number;
  /** Sorti vers ce chantier, depuis n'importe quel lieu. C'est le consommé. */
  issuedQuantity: number;
  /**
   * Ce qui reste au lieu du chantier, à l'instant de la lecture. `null`
   * pendant un comptage du lieu (aveugle, lot 040) : l'écran affiche
   * « Comptage en cours » et ne recalcule rien.
   */
  remainingQuantity: number | null;
  /** Valeur entrée depuis une facture. */
  receivedValue: number;
  /** Valeur venue d'un autre lieu. Comptée à part. */
  transferredInValue: number;
  /** Valeur de ce qui a été consommé. C'est ce qui est entré dans le coût. */
  issuedValue: number;
  /** Valeur de ce qui reste. `null` pendant un comptage du lieu (aveugle). */
  remainingValue: number | null;
  /** Lot 040 : retourné au fournisseur depuis le lieu du chantier. Descriptif. */
  returnedToSupplierQuantity: number;
  returnedToSupplierValue: number;
  /** Lot 040 : mis au rebut sur le lieu du chantier. Descriptif. */
  scrappedQuantity: number;
  scrappedValue: number;
  currency: string;
}

/**
 * Le rapprochement d'un chantier : les totaux, puis le détail par article.
 *
 * **Tout y est calculé par le serveur** (principe P-4). Aucun de ces chiffres
 * n'est une colonne en base, et aucun n'est recomposé à l'écran.
 *
 * ### Un chantier qui n'a PAS basculé ne montre pas que des zéros
 *
 * Rien n'empêche de sortir du stock d'un magasin central vers un chantier qui
 * n'est pas passé au stock, et ces sorties ont bel et bien imputé son coût.
 * Les afficher à zéro ferait mentir l'écran sur un chiffre qui existe.
 *
 * **Deux chiffres seulement dépendent de la bascule**, et eux seuls valent zéro
 * sans elle : `invoicedAmount` — sans période de bascule il n'y a aucune
 * facture à confronter — et `unreconciledAmount`, qui en découle. Le consommé,
 * le reçu et le restant disent la vérité dans tous les cas.
 */
export interface SiteStockReconciliation {
  siteId: string;
  siteLabel: string;
  /** ISO 8601, nulle si le chantier n'est pas passé au stock. */
  stockEnabledAt: string | null;
  /**
   * Ce que les fournisseurs ont facturé au chantier **depuis la bascule**.
   *
   * Vaut zéro sans bascule : il n'y a alors pas de période à confronter.
   */
  invoicedAmount: number;
  /** Ce qui est réellement entré en stock **depuis une facture**, en valeur. */
  receivedValue: number;
  /**
   * Ce qui est venu d'un autre lieu de l'agence, en valeur.
   *
   * Ne se confronte à rien : cette matière a été payée ailleurs, ou jamais.
   * Exposée parce qu'elle explique une bonne part du restant.
   */
  transferredInValue: number;
  /**
   * `invoicedAmount − receivedValue`, calculé par le serveur.
   *
   * **Montré, jamais jugé.** Un écart peut venir de frais que la facture
   * portait sans qu'ils entrent en stock — transport, manutention — comme d'une
   * quantité facturée qui n'est jamais arrivée : une soustraction ne distingue
   * pas les deux, et l'écran ne prétend pas le faire.
   *
   * **Vaut zéro quand le chantier n'a pas basculé**, et n'est alors pas déduit.
   * Les transferts reçus n'entrent PAS dans ce calcul.
   */
  unreconciledAmount: number;
  /** Total consommé, en valeur : la part du coût du chantier qui vient du stock. */
  issuedValue: number;
  /** Total restant sur le chantier, en valeur. `null` pendant un comptage du lieu (aveugle). */
  remainingValue: number | null;
  currency: string;
  lines: SiteStockReconciliationLine[];
}
