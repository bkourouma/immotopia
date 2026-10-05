import { t } from '../i18n/t';
import { activeLocale } from '../i18n/format';
import type {
  CreateCountRequest,
  SetCountLineRequest,
  StockBalanceView,
  StockCountLineView,
  StockCountsFilters,
  StockCountView,
  StockMovementView,
  StockTransferResult,
  TransferRequest
} from './finance-stock-controle-types';
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
 * 5. **Un inventaire applique l'ÉCART au stock courant** (lot 040, A3). Si de
 *    la matière a bougé entre le comptage et la validation, ce mouvement est
 *    conservé : l'ajustement vaut « compté − attendu figé », il ne ramène plus
 *    le solde à la quantité comptée.
 *
 * Lot 040 : les formes de ce fichier sont alignées sur le contrat 2.0.0
 * (`finance-stock-controle-types.ts`) — comptage à l'aveugle (attendu et écart
 * `null` en DRAFT), lignes non comptées, justification calculée par le
 * serveur.
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
  SITE: t('Lieu de chantier')
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
export type StockBalanceRef = StockBalanceView;

// ---------------------------------------------------------------------------
// Le transfert
// ---------------------------------------------------------------------------

/**
 * Les natures de mouvement, alignées sur le contrat (`MovementType`). Un
 * transfert en produit deux, de nature `TRANSFER` toutes les deux — le sens se
 * lit sur `isDecrease` ; l'ancienne déclaration `TRANSFER_OUT | TRANSFER_IN`
 * ne correspondait à rien de ce que l'API émet.
 */
export type { StockMovementType } from './finance-stock-mouvements-types';

/** Une moitié de transfert, telle que le serveur la rend (contrat `MovementView`). */
export type StockTransferMovement = StockMovementView;

/**
 * Un transfert, tel qu'on le relit : **deux** mouvements liés par un même
 * `transferGroupId`, la sortie d'abord, l'entrée ensuite. `value` est la
 * valeur DÉPLACÉE, `null` sans STOCK_VALUES_VIEW. **Ce n'est pas une dépense.**
 */
export type StockTransfer = StockTransferResult;

/**
 * Le corps de `POST /stock/transfers` (contrat `TransferRequest`) : deux
 * lieux, l'article, la quantité, la date, le demandeur (`takerId` ou
 * `requestedBy`), le motif et l'identifiant de requête. **Aucun prix**, aucun
 * chantier.
 */
export type CreateStockTransferInput = TransferRequest;

// ---------------------------------------------------------------------------
// L'inventaire
// ---------------------------------------------------------------------------

export type StockCountStatus = 'DRAFT' | 'COUNTED' | 'VALIDATED' | 'CANCELLED';

/**
 * Libellés des quatre états (ecrans §3.6), pour le texte courant. Sur une
 * étiquette, toujours les passer en `label` à `<StatusTag>` : son libellé par
 * défaut de `DRAFT` est « Brouillon ».
 */
export const STOCK_COUNT_STATUS_LABELS: Record<StockCountStatus, string> = {
  DRAFT: t('Comptage en cours'),
  COUNTED: t('Comptage clos'),
  VALIDATED: t('Validé'),
  CANCELLED: t('Abandonné')
};

/**
 * Une ligne de comptage (contrat `CountLineView`). En DRAFT, `expectedQuantity`
 * et `variance` valent `null` pour tous : le comptage est à l'aveugle. Une
 * ligne non comptée (`notCounted`) a `countedQuantity = null`. Le motif
 * (`reasonCode`, précision dans `reason`) se saisit après la clôture du
 * comptage ; `justified` dit, selon la règle du serveur, si l'écart est
 * justifié.
 */
export type StockCountLine = StockCountLineView;

/** Un inventaire (contrat `CountView`). */
export type StockCount = StockCountView;

/** Le corps de `POST /stock/counts` (contrat `CreateCountRequest`). */
export type CreateStockCountInput = CreateCountRequest;

/**
 * Le corps de `PUT /stock/counts/:countId/lines` (contrat `SetCountLineRequest`).
 * **Ni `countId`, ni `expectedQuantity`, ni motif** : le motif se saisit après
 * la clôture du comptage (A2-R5).
 */
export type SetStockCountLineInput = SetCountLineRequest;

export type ListStockCountsFilters = StockCountsFilters;

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
  const texte = value.toLocaleString(activeLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  return unit ? `${texte} ${unit}` : texte;
}

/**
 * Rend un écart avec son signe explicite : « +0,5 » ou « −3 ».
 *
 * Le signe est porté par le texte plutôt que par la seule couleur : un écart
 * positif et un écart négatif ne veulent pas dire la même chose, et « 3 » sans
 * signe ne dit pas lequel des deux on lit.
 */
export function formatVariance(value: number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return formatQuantity(0, unit);
  const signe = value > 0 ? '+' : '−';
  return `${signe}${formatQuantity(Math.abs(value), unit)}`;
}

/**
 * Une ligne est en écart quand le serveur y a calculé une variance non nulle
 * (jamais en DRAFT, où elle vaut `null`), qu'elle n'est pas écartée et qu'elle
 * a été comptée.
 */
export function estEnEcart(ligne: StockCountLine): boolean {
  return typeof ligne.variance === 'number' && ligne.variance !== 0 && ligne.setAside === null && !ligne.notCounted;
}

/**
 * Les lignes qui empêchent de valider : en écart et non justifiées. « Non
 * justifiée » se lit dans `justified`, calculé par le serveur (règle unique
 * A4-R2) : l'écran n'a pas sa propre règle. Calculée pour prévenir avant
 * l'envoi, jamais pour remplacer le refus du serveur.
 */
export function lignesSansMotif(count: StockCount | null | undefined): StockCountLine[] {
  if (!count) return [];
  return count.lines.filter(ligne => estEnEcart(ligne) && !ligne.justified);
}

/** Les lignes non comptées (A2-R8) pas encore écartées : à écarter avant de valider. */
export function lignesNonComptees(count: StockCount | null | undefined): StockCountLine[] {
  if (!count) return [];
  return count.lines.filter(ligne => ligne.notCounted && ligne.setAside === null);
}
