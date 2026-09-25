import { t } from '../i18n/t';
/**
 * Contrat gelé de la frontière réseau — lot 5, deuxième sous-lot : réceptions,
 * sorties et valorisation (PRD E9, besoins S2, S3, S4).
 *
 * Dérivé de `packages/api/src/lib/finance/types-lot5-mouvements.ts`, gelé côté
 * serveur. Comme aux sous-lots précédents, **chaque champ ici porte le nom que
 * le serveur émet** — c'est la règle payée au lot 2, où le type web annonçait
 * `accountId` là où l'API émettait `thirdPartyAccountId`. Les noms de TYPE
 * perdent le suffixe `Record` du contrat serveur (`StockBalanceRecord` ->
 * `StockBalance`), convention déjà suivie par `finance-contractors-types.ts`.
 *
 * **Les dates sont des chaînes ici.** Le contrat serveur les déclare `Date` ;
 * elles traversent HTTP en ISO 8601 et arrivent donc en `string`.
 *
 * ---------------------------------------------------------------------------
 * Ce que l'écran a le droit de calculer : rien, à une exception près
 * ---------------------------------------------------------------------------
 *
 * `quantity`, `value`, `averageUnitCost`, `unitCost`, `totalValue`,
 * `quantityAfter` et `valueAfter` arrivent **tous faits** (principe P-4).
 * L'unique exception est l'**aperçu** d'une sortie, affiché dans le formulaire
 * et nommé « aperçu » en toutes lettres : il ne voyage pas, et le serveur
 * reste seul à valoriser la sortie. Voir `pages/finance/Stock.tsx`.
 *
 * ---------------------------------------------------------------------------
 * `quantity × unitCost` ne fait PAS `totalValue`
 * ---------------------------------------------------------------------------
 *
 * Quand une sortie vide un emplacement, elle emporte toute la valeur
 * résiduelle : le contrat force alors la valeur du solde à zéro et loge
 * l'écart d'arrondi dans le mouvement. Les deux champs peuvent donc différer
 * d'une unité monétaire, et c'est une donnée, pas un défaut. **Un écran
 * n'affiche jamais un total recalculé** — il affiche `totalValue`.
 *
 * ---------------------------------------------------------------------------
 * Une quantité n'est pas un montant
 * ---------------------------------------------------------------------------
 *
 * Les quantités portent **quatre décimales** (`Decimal(16,4)`) : on compte des
 * tonnes et des mètres cubes. Un quart de mètre cube vaut `0,25` et ne doit
 * jamais s'afficher « 0 ». Le formateur monétaire (`formatMoney`) arrondit à
 * l'unité et colle « FCFA » derrière : il ne convient à aucune quantité.
 *
 * **Aucun « débit » ni « crédit » ici** (principe P-1 du PRD). On *reçoit* de
 * la matière, on la *sort* vers un chantier ; un stock a une *quantité*, une
 * *valeur* et un *coût moyen unitaire*.
 */

// ---------------------------------------------------------------------------
// Les natures de mouvement
// ---------------------------------------------------------------------------

/** Les quatre natures du schéma serveur (`StockMovementType`). */
export type StockMovementType = 'RECEIPT' | 'ISSUE' | 'TRANSFER' | 'ADJUSTMENT';

export function STOCK_MOVEMENT_TYPE_LABELS(): Record<StockMovementType, string> {
  return {
    RECEIPT: t('Réception'),
    ISSUE: t('Sortie vers un chantier'),
    TRANSFER: t('Transfert entre lieux'),
    ADJUSTMENT: t('Ajustement d’inventaire')
  };
}

/**
 * Le ton de chaque nature.
 *
 * `ISSUE` est la seule nature qui impute un chantier : elle est mise en avant,
 * les trois autres restent neutres ou informatives. C'est le point 2 du
 * cahier des charges de cet écran — un utilisateur qui croirait qu'une
 * réception ou un transfert fait monter le coût de son chantier se tromperait
 * sur ses chiffres.
 */
export const STOCK_MOVEMENT_TYPE_TONES: Record<StockMovementType, 'neutral' | 'info' | 'success' | 'warning'> = {
  RECEIPT: 'success',
  ISSUE: 'info',
  TRANSFER: 'neutral',
  ADJUSTMENT: 'warning'
};

// ---------------------------------------------------------------------------
// Ce qu'il reste, et ce que ça vaut (besoin S4)
// ---------------------------------------------------------------------------

export interface StockBalance {
  itemId: string;
  itemReference: string;
  itemLabel: string;
  /** Sac, tonne, barre, m³. Texte libre côté référentiel. */
  itemUnit: string;
  locationId: string;
  locationLabel: string;
  quantity: number;
  value: number;
  /**
   * `value / quantity`, **calculé par le serveur et jamais stocké**. Vaut zéro
   * quand la quantité est nulle — et non `null` : la quantité dit déjà qu'il
   * n'y a rien (contrat gelé).
   *
   * Il est **par (article, LIEU)** : un même article peut avoir deux coûts
   * moyens différents dans deux magasins, et c'est normal.
   */
  averageUnitCost: number;
  currency: string;
}

export interface ListStockBalancesFilters {
  locationId?: string;
  itemId?: string;
  /** Masque les lignes à quantité nulle. */
  onlyInStock?: boolean;
}

// ---------------------------------------------------------------------------
// Le mouvement, tel qu'on le relit
// ---------------------------------------------------------------------------

export interface StockMovement {
  id: string;
  type: StockMovementType;
  itemId: string;
  itemReference: string;
  itemLabel: string;
  itemUnit: string;
  locationId: string;
  locationLabel: string;
  movementDate: string;
  /** **Toujours positive.** Le sens se lit sur `type` et `isDecrease`. */
  quantity: number;
  isDecrease: boolean;
  unitCost: number;
  /** **Jamais `quantity × unitCost`.** Voir l'en-tête de ce fichier. */
  totalValue: number;
  currency: string;
  quantityAfter: number;
  valueAfter: number;
  /** Le chantier imputé, pour une sortie. Nul pour les autres natures. */
  siteId: string | null;
  siteLabel: string | null;
  costCategoryLabel: string | null;
  requestedBy: string | null;
  /** Référence de la facture qui a valorisé la réception. */
  supplierInvoiceReference: string | null;
  /**
   * Les deux moitiés d'un transfert portent le même identifiant.
   *
   * Ajouté au contrat serveur à la relecture : sans lui, le journal montrait
   * les deux lignes d'un transfert sans rien qui les relie — une perte d'un
   * côté suivie d'une apparition de l'autre, exactement la lecture que le
   * schéma voulait rendre impossible.
   *
   * **Facultatif ici, et le journal ne regroupe pas encore.** Le champ existe
   * pour que ce soit possible sans retoucher la frontière ; le regroupement
   * reste à faire, et il est consigné comme tel.
   */
  transferGroupId?: string | null;
  createdByLabel: string;
  createdAt: string;
}

export interface ListStockMovementsFilters {
  itemId?: string;
  locationId?: string;
  siteId?: string;
  type?: StockMovementType;
  /** `YYYY-MM-DD`. Le serveur la contraint par `z.coerce.date()`. */
  from?: string;
  /** `YYYY-MM-DD`. */
  to?: string;
}

// ---------------------------------------------------------------------------
// La réception (besoin S2)
// ---------------------------------------------------------------------------

export interface StockReceiptLineInput {
  itemId: string;
  quantity: number;
  /**
   * Prix unitaire de cette entrée. **Le zéro est accepté** : un don, une
   * reprise, une chute récupérée entrent en stock à valeur nulle. Seul le
   * négatif est refusé.
   */
  unitCost: number;
}

/**
 * Corps de l'enregistrement d'une réception.
 *
 * `supplierInvoiceId` **est** dans le corps, et ce n'est pas une répétition :
 * le chemin ne porte que `tenantId`. La facture est ce qui VALORISE la
 * réception (besoin S2, principe P-2) — sans elle, une valeur apparaîtrait de
 * nulle part. Le lien est **exigé**, et la facture doit être validée.
 *
 * **Une ligne par article, au moins une** : le coût moyen se recalcule article
 * par article, et le serveur écrit un mouvement par ligne.
 *
 * **Aucune écriture comptable, aucune imputation.** La facture a déjà porté la
 * valeur ; la réception n'enregistre que des quantités et leur valeur.
 */
export interface CreateStockReceiptInput {
  locationId: string;
  supplierInvoiceId: string;
  /** `YYYY-MM-DD`. */
  receiptDate: string;
  lines: StockReceiptLineInput[];
}

// ---------------------------------------------------------------------------
// La sortie (besoin S3) — le geste du lot
// ---------------------------------------------------------------------------

/**
 * Corps de l'enregistrement d'une sortie vers un chantier.
 *
 * **Aucun prix, sous aucun nom.** Le schéma serveur est `.strict()` et ne
 * déclare ni `unitCost`, ni `totalValue`, ni `averageUnitCost` : un corps qui
 * en porterait un reçoit un 400 explicite plutôt que de laisser croire que le
 * prix saisi a été pris en compte. Le prix est dérivé du coût moyen du lieu
 * **avant** la sortie (principe P-4).
 *
 * **Le poste est exigé, jamais deviné depuis l'article.** Le
 * `defaultCostCategoryId` d'un article est une proposition d'écran, pas une
 * autorité : l'écran le pré-sélectionne, le dit, et laisse changer.
 *
 * **Le demandeur est exigé** (besoin S3) : une sortie sans demandeur est un
 * matériau qui a disparu sans que personne n'en réponde.
 *
 * Le serveur **refuse** une sortie supérieure au stock — un stock négatif n'a
 * pas de coût moyen qui veuille dire quelque chose, et le geste juste est un
 * inventaire — ainsi qu'une sortie vers un chantier clos.
 */
export interface CreateStockIssueInput {
  locationId: string;
  itemId: string;
  quantity: number;
  siteId: string;
  costCategoryId: string;
  requestedBy: string;
  /** `YYYY-MM-DD`. */
  issueDate: string;
}

// ---------------------------------------------------------------------------
// Le référentiel, vu d'ici : une copie de LECTURE, et pourquoi
// ---------------------------------------------------------------------------

/**
 * Les articles et les lieux appartiennent au **premier** sous-lot du lot 5
 * (`packages/api/src/lib/finance/types-lot5-referentiel.ts`), écrit par un
 * autre agent, en parallèle, dans des fichiers dont le nom porte
 * « referentiel ». Cet écran a besoin de les LISTER — on ne choisit pas un
 * article sans le voir — mais il ne doit toucher à aucun de ces fichiers.
 *
 * Ces deux interfaces sont donc un miroir **en lecture seule** du contrat du
 * référentiel, suffixé `Ref` pour que la duplication se voie et qu'aucun
 * import ne s'y trompe. Elles ne portent que ce que cet écran affiche.
 *
 * **Dette assumée, à résorber par le superviseur** : quand
 * `types/finance-stock-referentiel-types.ts` sera livré, ces deux types
 * doivent être remplacés par les siens. C'est le seul endroit à changer.
 */
export interface StockItemRef {
  id: string;
  reference: string;
  label: string;
  unit: string;
  category: string | null;
  /** Poste **proposé** par l'article. Aucune autorité : voir `CreateStockIssueInput`. */
  defaultCostCategoryId: string | null;
  defaultCostCategoryLabel: string | null;
  isActive: boolean;
}

export type StockLocationKind = 'WAREHOUSE' | 'SITE';

export function STOCK_LOCATION_KIND_LABELS(): Record<StockLocationKind, string> {
  return {
    WAREHOUSE: t('Magasin'),
    SITE: t('Lieu de chantier')
  };
}

export interface StockLocationRef {
  id: string;
  kind: StockLocationKind;
  label: string;
  siteId: string | null;
  siteLabel: string | null;
  isActive: boolean;
}

export interface ListStockItemsFilters {
  onlyActive?: boolean;
  search?: string;
}

export interface ListStockLocationsFilters {
  onlyActive?: boolean;
  kind?: StockLocationKind;
}
