/**
 * Contrat commun de la recherche multicritères des listes (lot 0 du chantier
 * « recherche des tableaux »). Guide : `docs/architecture/recherche-listes.md`.
 *
 * Trois couches partagent ces types, sans dépendre les unes des autres à
 * l'exécution :
 *
 * - `hooks/useListSearch.ts` — déclare les critères, lit et écrit leur état
 *   dans l'URL (au-dessus de `useListParams`), produit les paramètres d'API ;
 * - `utils/list-search/` — filtrage et pagination LOCAUX d'une liste reçue en
 *   entier, et `useLocalListSearch` qui assemble le tout ;
 * - `components/primitives/ListSearch.tsx` — la barre affichée au-dessus du
 *   tableau, alimentée par `ListSearchBinding`.
 *
 * Ce fichier ne contient que des types : l'importer ne coûte rien au bundle.
 *
 * **Les libellés sont déjà traduits.** Les critères se déclarent dans le corps
 * du composant de l'écran (pas au niveau du module), avec `t('…')` : ils sont
 * ainsi recalculés au changement de langue. Le hook ne dépend que des CLÉS des
 * critères, pas de l'identité du tableau — le redéclarer à chaque rendu est
 * gratuit.
 */

/** Une option de `select` / `multiSelect`. `label` est déjà traduit. */
export interface SearchOption {
  value: string;
  label: string;
}

/** Valeur d'un intervalle de dates, au format `aaaa-mm-jj` (jour inclus aux deux bornes). */
export interface DateRangeValue {
  from?: string;
  to?: string;
}

/** Valeur d'un intervalle de nombres (bornes incluses). */
export interface NumberRangeValue {
  min?: number;
  max?: number;
}

/**
 * Valeur d'un critère, selon son type :
 * - `text`, `select` → `string | undefined` ;
 * - `multiSelect` → `string[]` (tableau vide = critère inactif) ;
 * - `dateRange` → `DateRangeValue` (objet vide = inactif) ;
 * - `numberRange` → `NumberRangeValue` (objet vide = inactif) ;
 * - `boolean` → `boolean | undefined`.
 */
export type SearchValue = string | string[] | DateRangeValue | NumberRangeValue | boolean | undefined;

/** Valeurs de tous les critères, indexées par `key`. Tous les critères y figurent. */
export type SearchValues = Record<string, SearchValue>;

/** Paramètres tels qu'ils partent à l'API (axios `params`). */
export type ApiParams = Record<string, string | number>;

/**
 * Correspondance d'un critère vers l'API.
 *
 * - absente : nom par défaut (voir chaque type) ;
 * - `string` : renomme la clé (`text` : `q` → `'search'`, défaut) ;
 * - `[string, string]` : pour `dateRange` (`['from', 'to']`) et `numberRange`
 *   (`['minAmount', 'maxAmount']`) ;
 * - `false` : le critère n'est pas envoyé (filtrage local, ou critère
 *   d'affichage seulement) ;
 * - fonction : traduction libre ; reçoit la valeur ACTIVE (jamais vide) et rend
 *   les paramètres à fusionner. Exemple : `boolean` « En retard » →
 *   `v => (v ? { overdue: 'true' } : {})`.
 */
export type CriterionApi =
  string | readonly [string, string] | false | ((value: Exclude<SearchValue, undefined>) => ApiParams);

interface CriterionBase {
  /**
   * Identifiant du critère, unique dans la liste ; base de ses clés d'URL.
   * Pour `text` le défaut conseillé est `'q'`.
   */
  key: string;
  /** Libellé visible, déjà traduit : `t('Statut')`. Sert aussi aux puces. */
  label: string;
  /**
   * `true` : affiché en ligne au-dessus de 992 px (2 à 4 critères au plus,
   * dans l'ordre de déclaration). Sinon : sous « Plus de critères ».
   * Ignoré pour `text`, toujours en tête. Sous 992 px tout va dans la feuille.
   */
  primary?: boolean;
  /** Correspondance vers l'API. Voir `CriterionApi`. */
  api?: CriterionApi;
  /** Texte d'aide sous le contrôle (feuille mobile et panneau dépliant). */
  help?: string;
}

/**
 * Recherche libre. Au plus un par liste ; c'est le grand champ en tête de barre.
 * URL : `key` (défaut conseillé `q`). API par défaut : `search`.
 * Saisie appliquée après ~300 ms sans frappe (et immédiatement sur Entrée).
 */
export interface TextCriterion extends CriterionBase {
  type: 'text';
  /**
   * Obligatoire : dire OÙ l'on cherche, ex. `t('Nom, e-mail, téléphone…')`.
   * Un champ qui affiche seulement « Rechercher » ne dit pas ce qu'il trouve.
   */
  placeholder: string;
}

/**
 * Choix unique. URL et API : `key`.
 *
 * Options statiques (`options`) OU chargées à la demande (`loadOptions` ou
 * `loadOptionsPage`) pour
 * les entités nombreuses (bien, lot, contact, chantier…) : le composant appelle
 * `loadOptions(saisie)` à l'ouverture puis à la frappe (debounce ~300 ms) ; il
 * doit rendre au plus ~20 options par requête. `loadOptionsPage` charge les
 * pages suivantes au défilement. `resolveLabel(value)` retrouve le libellé
 * d'une valeur venue de l'URL (puce, champ) quand elle n'est pas dans les
 * options déjà chargées.
 */
export interface SelectCriterion extends CriterionBase {
  type: 'select';
  options?: readonly SearchOption[];
  loadOptions?: (search: string) => Promise<SearchOption[]>;
  /** Variante paginée : une page courte à l'ouverture, les suivantes au défilement. */
  loadOptionsPage?: (search: string, page: number) => Promise<{ items: SearchOption[]; total: number }>;
  resolveLabel?: (value: string) => Promise<string | undefined> | string | undefined;
  placeholder?: string;
}

/** Choix multiple. URL : `key=A,B`. API par défaut : `key` = `'A,B'` (virgules). */
export interface MultiSelectCriterion extends CriterionBase {
  type: 'multiSelect';
  options: readonly SearchOption[];
  placeholder?: string;
}

/**
 * Intervalle de dates. URL : `${key}From` et `${key}To` (aaaa-mm-jj), ou
 * `urlKeys`. API par défaut : les mêmes noms que l'URL ; le plus souvent
 * `api: ['from', 'to']`.
 */
export interface DateRangeCriterion extends CriterionBase {
  type: 'dateRange';
  urlKeys?: readonly [string, string];
}

/**
 * Intervalle de nombres. URL : `${key}Min` et `${key}Max`, ou `urlKeys`.
 * API par défaut : les mêmes noms que l'URL (ex. `api: ['minAmount', 'maxAmount']`).
 */
export interface NumberRangeCriterion extends CriterionBase {
  type: 'numberRange';
  urlKeys?: readonly [string, string];
  /** Unité affichée dans les champs et la puce (ex. `'FCFA'`, `'m²'`). */
  unit?: string;
}

/**
 * Booléen. URL : `key=1` (vrai) ou `key=0` (faux) ; absent = indifférent.
 * API par défaut : `key` = `'true'` / `'false'`.
 *
 * Par défaut une case à cocher « vrai ou indifférent » (« En retard »,
 * « Actifs seulement »). `tristate: true` donne un choix Tous / Oui / Non
 * avec `trueLabel` / `falseLabel` (défauts : « Oui » / « Non »).
 */
export interface BooleanCriterion extends CriterionBase {
  type: 'boolean';
  tristate?: boolean;
  trueLabel?: string;
  falseLabel?: string;
}

export type SearchCriterion =
  TextCriterion | SelectCriterion | MultiSelectCriterion | DateRangeCriterion | NumberRangeCriterion | BooleanCriterion;

export type SearchCriterionType = SearchCriterion['type'];

/**
 * Ce que `<ListSearch>` reçoit — et ce que `search` attend sur `<DataView>` et
 * `primitives/Table`. `useListSearch(...).searchProps` et
 * `useLocalListSearch(...).searchProps` le fournissent tel quel.
 */
export interface ListSearchBinding {
  criteria: readonly SearchCriterion[];
  values: SearchValues;
  /**
   * Applique des valeurs (fusion). Remet la page à 1.
   * `{ replace: true }` remplace l'entrée d'historique au lieu d'en empiler une
   * (frappe dans le champ libre : un retour arrière ne rejoue pas chaque lettre).
   */
  onChange: (next: Partial<SearchValues>, options?: { replace?: boolean }) => void;
  /** Efface tous les critères. Remet la page à 1. */
  onClear: () => void;
  /** Nombre de critères actifs (le champ libre compte pour un). */
  activeCount: number;
  /**
   * Nombre de résultats affiché (« 12 résultats »). `<DataView>` et `Table` le
   * déduisent seuls (total serveur ou longueur de la liste filtrée) s'il manque.
   */
  resultCount?: number;
  /** Nom accessible de la zone `role="search"`. Défaut : « Rechercher ». */
  'aria-label'?: string;
}
