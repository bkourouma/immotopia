/**
 * Contrat gelé de la frontière réseau — lot 5, troisième sous-lot : les
 * transferts entre lieux et l'inventaire physique (PRD E9, besoins S4 et S6).
 *
 * Dérivé de `packages/api/src/lib/finance/types-lot5-inventaire.ts`, gelé côté
 * serveur. Comme aux sous-lots précédents, **chaque champ porte ici le nom que
 * le serveur émet** — c'est la règle payée au lot 2, où le type web annonçait
 * `accountId` là où l'API émettait `thirdPartyAccountId`. Les noms de TYPE, en
 * revanche, perdent le suffixe `Record` du contrat serveur : convention déjà
 * suivie par `finance-lot4-types.ts` et `finance-retentions-types.ts`.
 *
 * **Les dates sont des chaînes ici.** Le contrat serveur les déclare `Date` ;
 * elles traversent JSON en ISO 8601 et n'ont jamais été des `Date` au moment
 * où l'écran les lit.
 *
 * **Aucun « débit » ni « crédit » ici** (principe P-1 du PRD). On *transfère*
 * de la matière d'un lieu à un autre, on *compte* un lieu, on *justifie* un
 * écart, on *valide* un inventaire.
 *
 * ---------------------------------------------------------------------------
 * Les cinq choses que l'écran ne doit pas laisser croire
 * ---------------------------------------------------------------------------
 *
 * 1. **Un transfert n'impute rien.** Déplacer du ciment d'un magasin vers le
 *    lieu d'un chantier ne le consomme pas : la matière reste à l'actif de
 *    l'agence, simplement ailleurs, et le coût du chantier ne bouge pas. Seule
 *    la SORTIE impute (principe P-7, sous-lot 2). C'est le piège du sous-lot :
 *    livrer sur un chantier *ressemble* à une dépense, et quelqu'un qui le
 *    croirait se tromperait sur ses chiffres. Aucun champ de ce fichier n'est
 *    un coût de chantier, et `StockTransfer.value` est la valeur DÉPLACÉE, au
 *    coût moyen du lieu d'origine — pas une charge.
 *
 * 2. **`expectedQuantity` n'est jamais saisie.** Le serveur la lit dans le
 *    stock au moment de la saisie et la fige (principe P-4). Elle n'existe
 *    donc qu'en LECTURE : `SetStockCountLineInput` ne la porte pas, et le
 *    schéma Zod du serveur est `.strict()` — un corps qui la porterait
 *    recevrait un 400 plutôt que de laisser croire que la valeur envoyée a été
 *    prise en compte. C'est exactement le geste que le besoin S6 empêche :
 *    fabriquer un écart nul.
 *
 * 3. **`variance` et `varianceValue` sont calculées par le serveur.** L'écran
 *    les affiche telles quelles. Sur un inventaire validé, le serveur fait
 *    autorité sur ce qui s'est réellement passé ; un écran qui recalculerait
 *    `countedQuantity − expectedQuantity` dirait la même chose par accident, et
 *    autre chose le jour où le serveur changera d'avis.
 *
 * 4. **Un inventaire validé ne s'annule pas.** Aucune route ne le défait : ses
 *    ajustements sont des mouvements comme les autres, et les rejouer à
 *    l'envers demanderait de rejouer tout ce qui a suivi. Un comptage erroné se
 *    corrige par un SECOND comptage. Aucun type de ce fichier ne décrit une
 *    annulation, et l'écran n'en offre aucun bouton.
 *
 * 5. **Un inventaire ramène le stock à ce qui a été COMPTÉ.** Si de la matière
 *    a bougé entre le comptage et la validation, l'ajustement écrase ce
 *    mouvement : le comptage physique fait foi. C'est voulu, mais il faut le
 *    savoir, et l'écran le dit au moment de valider.
 *
 * ---------------------------------------------------------------------------
 * Une quantité n'est pas un montant
 * ---------------------------------------------------------------------------
 *
 * Les quantités sont stockées en `Decimal(16,4)` : on compte des tonnes et des
 * mètres cubes. Un quart de mètre cube vaut 0,25 et ne doit pas s'afficher
 * « 0 ». `formatQuantity` est là pour ça, et **`formatMoney` ne doit jamais
 * servir à une quantité** — il arrondit à l'entier, parce que le franc CFA n'a
 * pas de subdivision.
 */

// ---------------------------------------------------------------------------
// Ce que ce sous-lot lit chez les voisins
// ---------------------------------------------------------------------------

/**
 * Article, lieu et solde sont **redéclarés ici**, et ce n'est pas un oubli.
 *
 * Ils appartiennent aux sous-lots 1 (référentiel) et 2 (mouvements), livrés en
 * parallèle par d'autres agents. Cet écran en a besoin pour remplir ses listes
 * de choix et pour dire ce qu'il reste au lieu d'origine ; il appelle donc
 * directement `GET /stock/items`, `GET /stock/locations` et
 * `GET /stock/balances`, et porte ici la part du contrat serveur qu'il lit —
 * **rien de plus**. Dépendre du fichier d'un sous-lot voisin ferait échouer la
 * compilation de celui-ci le jour où l'autre bouge, pour un bénéfice nul : les
 * deux dérivent du même contrat gelé.
 *
 * Le jour où ces trois types seront stabilisés chez leurs propriétaires, un
 * superviseur pourra les réimporter d'un seul endroit. C'est consigné comme
 * dette dans le rapport de ce sous-lot.
 */

/** Sous-ensemble LU de `StockItemRecord` (sous-lot 1). */
export interface StockItemRef {
  id: string;
  reference: string;
  label: string;
  /** Sac, tonne, barre, m³. Texte libre côté serveur. */
  unit: string;
  isActive: boolean;
}

export type StockLocationKind = 'WAREHOUSE' | 'SITE';

export const STOCK_LOCATION_KIND_LABELS: Record<StockLocationKind, string> = {
  WAREHOUSE: 'Magasin',
  SITE: 'Lieu de chantier'
};

/** Sous-ensemble LU de `StockLocationRecord` (sous-lot 1). */
export interface StockLocationRef {
  id: string;
  kind: StockLocationKind;
  label: string;
  siteId: string | null;
  /** Nom du chantier. Nul pour un magasin. */
  siteLabel: string | null;
  isActive: boolean;
}

/**
 * Sous-ensemble LU de `StockBalanceRecord` (sous-lot 2).
 *
 * Sert à une seule chose ici : dire ce qu'il RESTE au lieu d'origine avant de
 * transférer, pour ne pas envoyer une quantité que le serveur refusera. Ce
 * n'est pas une autorité — c'est le serveur qui refuse, l'écran prévient.
 */
export interface StockBalanceRef {
  itemId: string;
  itemReference: string;
  itemLabel: string;
  itemUnit: string;
  locationId: string;
  locationLabel: string;
  quantity: number;
  value: number;
  /** `value / quantity`, calculé par le serveur. Zéro quand il n'y a rien. */
  averageUnitCost: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Le transfert
// ---------------------------------------------------------------------------

/**
 * Les natures de mouvement que ce sous-lot peut recevoir en réponse.
 *
 * Un transfert en produit deux — `TRANSFER_OUT` puis `TRANSFER_IN` — et la
 * validation d'un inventaire un `ADJUSTMENT` par ligne en écart. Les autres
 * natures appartiennent au sous-lot 2 et ne transitent pas par cet écran.
 */
export type StockMovementType = 'RECEIPT' | 'ISSUE' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'ADJUSTMENT';

/**
 * Une moitié de transfert, telle que le serveur la rend.
 *
 * Sous-ensemble LU de `StockMovementRecord` (sous-lot 2) : seuls les champs que
 * cet écran affiche après un transfert sont déclarés.
 */
export interface StockTransferMovement {
  id: string;
  type: StockMovementType;
  itemId: string;
  itemReference: string;
  itemLabel: string;
  itemUnit: string;
  locationId: string;
  locationLabel: string;
  movementDate: string;
  /** Toujours positive. C'est `isDecrease` qui dit le sens. */
  quantity: number;
  isDecrease: boolean;
  unitCost: number;
  totalValue: number;
  currency: string;
  quantityAfter: number;
  valueAfter: number;
}

/**
 * Un transfert, tel qu'on le relit : **deux** mouvements liés par un même
 * `transferGroupId`, la sortie d'abord, l'entrée ensuite.
 *
 * `value` est la valeur DÉPLACÉE, au coût moyen du lieu d'origine. Transférer
 * ne crée ni ne détruit de valeur : la somme des deux lieux ne bouge pas.
 * **Ce n'est pas une dépense**, et l'écran ne doit surtout pas la présenter
 * comme telle.
 */
export interface StockTransfer {
  transferGroupId: string;
  movements: StockTransferMovement[];
  fromLocationLabel: string;
  toLocationLabel: string;
  quantity: number;
  value: number;
  currency: string;
}

/**
 * Le corps de `POST /stock/transfers`, champ pour champ.
 *
 * Les deux lieux sont dans le CORPS, et ce n'est pas une répétition : le chemin
 * ne porte que `tenantId`. **Aucun prix** n'y figure — la valeur part au coût
 * moyen du lieu d'origine (principe P-4) — et aucun chantier non plus : un
 * transfert n'impute rien.
 */
export interface CreateStockTransferInput {
  fromLocationId: string;
  toLocationId: string;
  itemId: string;
  quantity: number;
  /** `YYYY-MM-DD`. Le serveur la coerce en date. */
  transferDate: string;
}

// ---------------------------------------------------------------------------
// L'inventaire
// ---------------------------------------------------------------------------

export type StockCountStatus = 'DRAFT' | 'VALIDATED';

/**
 * Libellés des deux états.
 *
 * `DRAFT` et `VALIDATED` figurent tous deux dans la table de `<StatusTag>`
 * (« Brouillon », « Validé ») ; ces libellés sont repris ici pour les endroits
 * qui affichent l'état en texte courant — un filtre, une phrase — sans poser
 * d'étiquette.
 */
export const STOCK_COUNT_STATUS_LABELS: Record<StockCountStatus, string> = {
  DRAFT: 'Brouillon',
  VALIDATED: 'Validé'
};

/**
 * Une ligne de comptage.
 *
 * `expectedQuantity` est **figée à la saisie** : c'est ce que le système disait
 * au moment où l'on a compté, pas ce qu'il dit aujourd'hui. Relire à la
 * validation comparerait le comptage d'hier au stock d'aujourd'hui, et une
 * sortie enregistrée entre-temps se lirait comme une perte.
 *
 * `variance` vaut `countedQuantity − expectedQuantity`, **calculée par le
 * serveur**, négative quand il manque. L'écran l'affiche, il ne la refait pas.
 */
export interface StockCountLine {
  id: string;
  itemId: string;
  itemReference: string;
  itemLabel: string;
  itemUnit: string;
  expectedQuantity: number;
  countedQuantity: number;
  variance: number;
  /** Casse, perte, vol. Exigé à la validation dès qu'il y a un écart (S6). */
  reason: string | null;
}

export interface StockCount {
  id: string;
  tenantId: string;
  locationId: string;
  locationLabel: string;
  countedAt: string;
  status: StockCountStatus;
  lines: StockCountLine[];
  /** Nombre de lignes en écart. Calculé par le serveur. */
  varianceCount: number;
  /**
   * La valeur de l'écart total, au coût moyen courant de chaque article.
   * **Négative quand il manque.** Estimée tant que l'inventaire est en
   * brouillon : le coût moyen peut bouger d'ici la validation.
   */
  varianceValue: number;
  currency: string;
  createdByLabel: string;
  validatedAt: string | null;
}

/** Le corps de `POST /stock/counts`. Le lieu y est, le tenant est dans le chemin. */
export interface CreateStockCountInput {
  locationId: string;
  /** `YYYY-MM-DD`. */
  countedAt: string;
}

/**
 * Le corps de `PUT /stock/counts/:countId/lines`.
 *
 * **Ni `countId` — il est dans le chemin — ni `expectedQuantity`** : le serveur
 * la lit et la fige (voir l'en-tête, point 2). `variance` et `varianceValue`
 * sont refusées pour la même raison et n'apparaissent pas non plus.
 *
 * La quantité comptée accepte le ZÉRO : « on a compté, il n'y a rien » est un
 * résultat de comptage, et le plus fréquent des écarts. Seul le négatif est
 * refusé.
 */
export interface SetStockCountLineInput {
  itemId: string;
  countedQuantity: number;
  /** Facultatif à la saisie, exigé à la validation quand il y a un écart. */
  reason?: string | null;
}

export interface ListStockCountsFilters {
  locationId?: string;
  status?: StockCountStatus;
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

/**
 * Rend une quantité, avec **quatre décimales au plus** et aucune en trop.
 *
 * `12` s'écrit « 12 », `0.25` s'écrit « 0,25 », `1234.5` s'écrit « 1 234,5 ».
 *
 * **Ne jamais utiliser `formatMoney` pour une quantité** : il arrondit à
 * l'entier (le franc CFA n'a pas de subdivision) et afficherait « 0 » pour un
 * quart de mètre cube. C'est le genre de zéro qu'on ne remarque pas.
 */
export function formatQuantity(value: number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const texte = value.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  return unit ? `${texte} ${unit}` : texte;
}

/**
 * Rend un écart avec son signe explicite : « +0,5 » ou « −3 ».
 *
 * Le signe est porté par le texte plutôt que par la seule couleur : un écart
 * positif et un écart négatif ne veulent pas dire la même chose, et « 3 » sans
 * signe ne dit pas lequel des deux on lit.
 */
export function formatVariance(value: number, unit?: string | null): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return formatQuantity(0, unit);
  const signe = value > 0 ? '+' : '−';
  return `${signe}${formatQuantity(Math.abs(value), unit)}`;
}

/** Une ligne est en écart dès que le serveur y a calculé une variance non nulle. */
export function estEnEcart(ligne: StockCountLine): boolean {
  return ligne.variance !== 0;
}

/**
 * Les lignes qui empêchent de valider : en écart, et sans motif (besoin S6).
 *
 * Calculée à l'écran pour **prévenir avant l'envoi**, jamais pour remplacer le
 * refus du serveur — qui reste la seule autorité et dont le message est relayé
 * tel quel s'il tombe quand même.
 */
export function lignesSansMotif(count: StockCount | null | undefined): StockCountLine[] {
  if (!count) return [];
  return count.lines.filter(ligne => estEnEcart(ligne) && !(ligne.reason ?? '').trim());
}
