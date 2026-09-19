/**
 * Contrat gelé de la frontière réseau — lot 5, premier sous-lot : le
 * référentiel du stock (PRD E9, besoins S1, S4, S5).
 *
 * Dérivé de `packages/api/src/lib/finance/types-lot5-referentiel.ts`, gelé côté
 * serveur. Comme aux sous-lots précédents, **chaque champ ici porte le nom que
 * le serveur émet** — c'est la règle payée au lot 2, où le type web annonçait
 * `accountId` là où l'API émettait `thirdPartyAccountId`. Les noms de TYPE
 * perdent le suffixe `Record` du contrat serveur (`StockItemRecord` ->
 * `StockItem`), convention déjà suivie par `finance-contractors-types.ts`.
 *
 * **Les dates sont des chaînes ici.** Le contrat serveur déclare `decidedAt`
 * en `Date` ; elle traverse HTTP en ISO 8601 et arrive donc en `string`. Même
 * choix qu'aux sous-lots précédents.
 *
 * **Aucun « débit » ni « crédit » ici** (principe P-1 du PRD). On *enregistre*
 * un article, on *crée* un lieu, on *désactive*, on *arrête* une méthode de
 * valorisation.
 *
 * ---------------------------------------------------------------------------
 * L'unité est du texte libre, et c'est un choix
 * ---------------------------------------------------------------------------
 *
 * Sac, tonne, barre, m³ : le PRD donne des exemples, pas une liste fermée, et
 * les unités d'une agence ivoirienne ne sont pas celles d'une agence
 * guinéenne. Aucune énumération ici, donc, et aucune normalisation.
 *
 * ---------------------------------------------------------------------------
 * Le poste de dépense d'un article est une PROPOSITION
 * ---------------------------------------------------------------------------
 *
 * `defaultCostCategoryId` n'a **aucune autorité** : il existe pour que l'écran
 * de sortie présente un poste pré-sélectionné, et la sortie exige toujours son
 * poste. L'écran ne l'appelle donc jamais « poste de dépense » tout court mais
 * **« poste proposé à la sortie »** — un poste deviné se lirait comme un choix
 * sans en être un, et personne ne le vérifierait.
 *
 * ---------------------------------------------------------------------------
 * Ce qui ne se corrige pas
 * ---------------------------------------------------------------------------
 *
 * - **La référence d'un article** : c'est elle qu'on lit sur les bons déjà
 *   imprimés. `UpdateStockItemInput` ne la déclare pas, et le serveur la
 *   refuserait en 400 (schéma `.strict()`).
 * - **La nature et le chantier d'un lieu** : un magasin qui deviendrait le lieu
 *   d'un chantier emporterait avec lui un stock qui n'y a jamais été.
 *   `UpdateStockLocationInput` ne les déclare pas.
 *
 * **L'unité, elle, se corrige — et c'est un danger assumé.** Aucune quantité
 * déjà enregistrée n'est reconvertie. Le domaine laisse faire ; l'écran
 * prévient avant d'envoyer (voir `pages/finance/StockReferentiel.tsx`).
 *
 * ---------------------------------------------------------------------------
 * Désactiver n'est pas supprimer
 * ---------------------------------------------------------------------------
 *
 * **Aucune route ne supprime** : ni article ni lieu. Un article ou un lieu
 * désactivé garde son stock et son historique ; il cesse simplement d'être
 * proposé. La désactivation passe par `isActive` sur les deux corrections.
 */

/**
 * Les deux natures de lieu de stockage (`StockLocationKind` côté Prisma).
 * Écrites en clair plutôt que dérivées du client généré : un type de frontière
 * doit se lire sans ouvrir `node_modules`.
 */
export type StockLocationKind = 'WAREHOUSE' | 'SITE';

export const STOCK_LOCATION_KIND_LABELS: Record<StockLocationKind, string> = {
  WAREHOUSE: 'Magasin',
  SITE: 'Lieu de chantier'
};

/**
 * Une seule valeur, et c'est volontaire (contrat serveur, en-tête).
 * L'énumération existe pour que le **choix** soit enregistré et daté — besoin
 * S5, « choix figé par tenant ; changement = décision documentée » — pas pour
 * laisser croire qu'une autre méthode est disponible. En ajouter une est un
 * travail à part entière, pas une ligne de configuration.
 */
export type StockValuationMethod = 'WEIGHTED_AVERAGE';

export const STOCK_VALUATION_METHOD_LABELS: Record<StockValuationMethod, string> = {
  WEIGHTED_AVERAGE: 'Coût moyen pondéré'
};

// ---------------------------------------------------------------------------
// L'article
// ---------------------------------------------------------------------------

export interface StockItem {
  id: string;
  tenantId: string;
  /** Ce qu'on lit sur les bons déjà imprimés. **Ne se corrige pas.** */
  reference: string;
  label: string;
  /** Sac, tonne, barre, m³. Texte libre, jamais une énumération. */
  unit: string;
  /** Famille de l'article. Nulle quand elle n'a pas été renseignée. */
  category: string | null;
  /**
   * Poste **proposé** à la sortie, jamais imposé. Nul quand l'article n'en
   * propose aucun — et c'est un cas normal, pas une donnée manquante.
   */
  defaultCostCategoryId: string | null;
  /** Nom du poste proposé. L'écran montre ce nom, jamais l'identifiant. */
  defaultCostCategoryLabel: string | null;
  isActive: boolean;
}

/**
 * Corps de l'enregistrement d'un article.
 *
 * Le schéma Zod du serveur (`schemas-stock-referentiel.ts`) est `.strict()` :
 * `tenantId` ne figure jamais dans ce corps, il vient du chemin.
 *
 * `category` est facultative mais refusée en chaîne VIDE
 * (`z.string().min(1).nullable().optional()`) : le service omet la clé plutôt
 * que d'envoyer `''`. Même règle pour `defaultCostCategoryId`, que le serveur
 * contraint en UUID.
 */
export interface CreateStockItemInput {
  reference: string;
  label: string;
  unit: string;
  category?: string | null;
  /** Le poste **proposé** à la sortie. Facultatif, et sans autorité. */
  defaultCostCategoryId?: string | null;
}

/**
 * Corps de la correction d'un article.
 *
 * `reference` n'y figure pas : elle ne se corrige pas (voir l'en-tête), et le
 * serveur la refuserait en 400.
 *
 * **Une clé absente veut dire « ne touche pas », `null` veut dire
 * « efface ».** Le contrôleur serveur recopie le corps tel quel : envoyer
 * `category: null` par confort effacerait la famille à chaque correction du
 * seul libellé.
 *
 * Le serveur refuse un corps VIDE (« Aucune correction fournie. ») : l'écran
 * n'envoie que ce qui a réellement changé, et ne propose pas d'enregistrer
 * quand rien n'a bougé.
 */
export interface UpdateStockItemInput {
  label?: string;
  /**
   * **Dangereux, et le contrat l'assume.** Passer un article de « sac » à
   * « tonne » ne reconvertit aucune quantité déjà enregistrée : les mouvements
   * passés gardent leur nombre, qui voudra désormais dire autre chose.
   * L'écran avertit explicitement avant d'envoyer.
   */
  unit?: string;
  category?: string | null;
  defaultCostCategoryId?: string | null;
  /** Désactiver n'est pas supprimer : l'article garde son stock et son historique. */
  isActive?: boolean;
}

export interface ListStockItemsFilters {
  onlyActive?: boolean;
  /** Recherche libre. Le serveur refuse la chaîne vide : le service omet la clé. */
  search?: string;
}

// ---------------------------------------------------------------------------
// Le lieu de stockage
// ---------------------------------------------------------------------------

export interface StockLocation {
  id: string;
  tenantId: string;
  /** **Ne se corrige pas.** */
  kind: StockLocationKind;
  label: string;
  /** Chantier du lieu. Nul pour un magasin. **Ne se corrige pas.** */
  siteId: string | null;
  /** Nom du chantier. Nul pour un magasin. L'écran montre ce nom, jamais l'identifiant. */
  siteLabel: string | null;
  isActive: boolean;
}

/**
 * Corps de la création d'un magasin, ou du lieu de stockage d'un chantier.
 *
 * **Une union discriminée, et c'est délibéré.** `siteId` est *exigé* quand
 * `kind` vaut `SITE`, et *refusé* sinon — plutôt qu'ignoré : « accepter un
 * champ qui ne servira à rien laisserait croire qu'il a servi » (contrat
 * serveur). Le schéma Zod refuse les deux écarts en 400. Typer cette règle en
 * union rend le mauvais corps inexprimable, plutôt que seulement interdit :
 * un magasin ne peut littéralement pas porter de chantier.
 *
 * Le serveur refuse aussi **un second lieu pour le même chantier** : deux lieux
 * partageraient son stock en deux soldes dont aucun ne dirait la vérité.
 * L'écran relaie ce refus tel que le serveur le formule.
 */
export type CreateStockLocationInput =
  { kind: 'WAREHOUSE'; label: string } | { kind: 'SITE'; label: string; siteId: string };

/**
 * Corps de la correction d'un lieu : son libellé, son activité.
 *
 * Ni `kind` ni `siteId` : ils ne se corrigent pas (voir l'en-tête), et le
 * schéma `.strict()` du serveur les refuserait en 400 plutôt que de les
 * ignorer en silence.
 */
export interface UpdateStockLocationInput {
  label?: string;
  /** Désactiver n'est pas supprimer : le lieu garde son stock et son historique. */
  isActive?: boolean;
}

export interface ListStockLocationsFilters {
  onlyActive?: boolean;
  kind?: StockLocationKind;
}

// ---------------------------------------------------------------------------
// La méthode de valorisation
// ---------------------------------------------------------------------------

/**
 * La décision de l'agence, datée et motivée.
 *
 * Le serveur ne lève **jamais** pour cause de réglages absents : il les crée au
 * défaut du PRD (coût moyen pondéré). Une agence qui n'a jamais ouvert cet
 * écran a donc bien une méthode, appliquée en silence, et `decisionNote` vaut
 * alors `null` — l'écran le dit en clair plutôt que d'afficher un vide.
 */
export interface StockSettings {
  tenantId: string;
  valuationMethod: StockValuationMethod;
  /** ISO 8601. Date à laquelle la décision en vigueur a été arrêtée. */
  decidedAt: string;
  /** Motif de la décision. Nul tant qu'aucune décision n'a été prise explicitement. */
  decisionNote: string | null;
}

/**
 * Corps de la décision.
 *
 * **Le motif est exigé**, et une chaîne d'espaces n'en est pas un : le besoin
 * S5 veut une décision documentée, « sans motif ni date, ce n'en serait pas
 * une, et personne ne saurait six mois plus tard pourquoi les chiffres ont
 * changé de sens ».
 *
 * `PUT` et non `PATCH` : la décision est remplacée en entier, méthode ET motif
 * ensemble. Un motif sans méthode, ou l'inverse, ne serait pas une décision.
 */
export interface SetStockValuationMethodInput {
  valuationMethod: StockValuationMethod;
  decisionNote: string;
}
