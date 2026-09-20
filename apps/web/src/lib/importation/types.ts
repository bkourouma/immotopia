import type { ConstructionSite, CostCategory, Supplier, SupplierInvoice } from '../../types/finance-lot2-types';
import type { Employee } from '../../types/finance-salaries-types';
import type { Contractor, ContractorContract } from '../../types/finance-contractors-types';
import type { StockItemRef, StockLocationRef } from '../../types/finance-stock-mouvements-types';
import type { LandLease } from '../../types/finance-lot4-types';

/**
 * Le contrat d'un DESCRIPTEUR DE NATURE — le cœur de l'importation.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi un descripteur, et pas une page qui connaît les sept natures
 * ---------------------------------------------------------------------------
 *
 * L'écran `pages/finance/Importation.tsx` ne nomme aucune nature. Il sait
 * seulement qu'une nature déclare des champs, qu'un champ se reconnaît dans
 * un en-tête de colonne, qu'une ligne se valide, et qu'une pièce s'enregistre
 * par un service. Ajouter la huitième nature, c'est écrire un descripteur
 * dans `natures.ts` — l'écran ne bouge pas.
 *
 * Ce fichier ne déclare QUE des types et des constantes de données. Rien de
 * visible n'y est traduit : les libellés voyagent en français — qui EST la
 * clé de traduction du dépôt — et c'est l'écran qui les passe par `t()` au
 * moment du rendu. Un `t()` évalué au chargement du module ne se rejouerait
 * pas au changement de langue.
 *
 * ---------------------------------------------------------------------------
 * Le principe que rien ne doit trahir : l'import produit des BROUILLONS
 * ---------------------------------------------------------------------------
 *
 * Aucun descripteur n'appelle une fonction `validate*`. Les pièces créées
 * rejoignent « Pièces à valider » là où leur nature y passe, et s'y valident
 * sous un regard humain. Un import raté se jette sans séquelle comptable.
 */

// ---------------------------------------------------------------------------
// Les listes de référence
// ---------------------------------------------------------------------------

/**
 * Les référentiels qu'un descripteur peut demander.
 *
 * Un fichier tenu à la main porte « Gros œuvre » ou « Matériaux du Sud
 * SARL », jamais un UUID. Chaque champ de type `reference` nomme ici la liste
 * dans laquelle son libellé se rapproche.
 */
export type CleReferentiel =
  | 'postes'
  | 'fournisseurs'
  | 'chantiers'
  | 'salaries'
  | 'tacherons'
  | 'contrats'
  | 'articles'
  | 'lieux'
  | 'baux'
  | 'facturesFournisseur';

export interface Referentiel {
  postes: CostCategory[];
  fournisseurs: Supplier[];
  chantiers: ConstructionSite[];
  salaries: Employee[];
  tacherons: Contractor[];
  contrats: ContractorContract[];
  articles: StockItemRef[];
  lieux: StockLocationRef[];
  baux: LandLease[];
  /**
   * Les factures fournisseur **validées**, toutes fournisseurs confondus.
   *
   * Le contrat n'offre aucune liste globale : elle se compose fournisseur par
   * fournisseur (voir `referentiel.ts`). Coûteuse, donc chargée uniquement
   * par les natures qui la déclarent.
   */
  facturesFournisseur: SupplierInvoice[];
}

export const REFERENTIEL_VIDE: Referentiel = {
  postes: [],
  fournisseurs: [],
  chantiers: [],
  salaries: [],
  tacherons: [],
  contrats: [],
  articles: [],
  lieux: [],
  baux: [],
  facturesFournisseur: []
};

/** Une entrée rapprochable : un identifiant, un libellé, et ses synonymes. */
export interface EntreeReferentiel {
  id: string;
  libelle: string;
  /** Autres écritures acceptées : une référence d'article, un n° de marché… */
  alias?: string[];
}

// ---------------------------------------------------------------------------
// Les champs d'un document
// ---------------------------------------------------------------------------

/**
 * Ce qu'on attend dans une cellule.
 *
 * `montant` et `quantite` partagent le même nettoyage — un tableur rend
 * souvent « 1 250,50 » en texte — mais pas la même intention : seul un
 * montant est nul-acceptable dans certains cas, et l'écran les aligne
 * différemment.
 */
export type TypeChamp = 'texte' | 'montant' | 'quantite' | 'entier' | 'date' | 'periode' | 'reference';

export interface ChampDocument {
  /** Clé technique, celle que `construire()` relira. */
  cle: string;
  /** Libellé français. Passé par `t()` à l'affichage, jamais ici. */
  libelle: string;
  obligatoire: boolean;
  type: TypeChamp;
  /** Requis — et seulement utile — quand `type === 'reference'`. */
  referentiel?: CleReferentiel;
  /**
   * Ce à quoi ressemble l'en-tête de colonne dans un fichier réel.
   *
   * Comparés sans casse ni accents, en égalité puis en inclusion. Le libellé
   * du champ est toujours essayé en premier : ces entrées sont les autres
   * façons de le dire.
   */
  entetes: string[];
  /**
   * Valeur de repli quand la colonne n'est pas rapprochée.
   *
   * Un champ obligatoire qui en porte une **ne bloque pas** l'aperçu : c'est
   * ainsi que la date par défaut de l'étape 1 sert « aux lignes dont le
   * fichier ne porte pas de date ».
   */
  valeurParDefaut?: (contexte: ContexteImportation) => string | null;
  /** Précision affichée sous la liste déroulante du rapprochement. */
  aide?: string;
}

// ---------------------------------------------------------------------------
// Le contexte d'un import
// ---------------------------------------------------------------------------

export interface ContexteImportation {
  tenantId: string;
  /** Choisi à l'étape 1. Nul quand la nature ne réclame aucun chantier. */
  siteId: string | null;
  /** `YYYY-MM-DD`. Sert aux lignes dont le fichier ne porte pas de date. */
  dateParDefaut: string;
  referentiel: Referentiel;
}

// ---------------------------------------------------------------------------
// Une ligne, telle qu'elle traverse l'écran
// ---------------------------------------------------------------------------

/**
 * Une cellule après lecture.
 *
 * `texte` est ce que la personne voit et corrige ; `valeur` est ce qu'on en a
 * tiré. Tout part du texte : corriger une cellule, c'est réévaluer la ligne
 * entière, jamais rapiécer une valeur déjà convertie.
 */
export interface CelluleEvaluee {
  texte: string;
  valeur: string | number | null;
  /** Le libellé retenu quand la cellule désigne une entrée de référentiel. */
  libelleResolu?: string;
  /** Motif en clair. Présent ⇒ la ligne ne part pas. */
  erreur?: string;
}

export interface LigneEvaluee {
  /** Numéro de la ligne DANS LE FICHIER, en-tête comprise. Ce qu'on annonce. */
  numero: number;
  selectionnee: boolean;
  cellules: Record<string, CelluleEvaluee>;
  /** Motifs de niveau ligne : cellules fautives et règles du descripteur. */
  erreurs: string[];
  /** Motif du doublon probable, ou `null`. Signalé, jamais bloquant. */
  doublon: string | null;
}

/** Ce que `construire()` reçoit : les valeurs déjà converties et résolues. */
export type ValeursLigne = Record<string, string | number | null>;

// ---------------------------------------------------------------------------
// Le descripteur
// ---------------------------------------------------------------------------

/** La nature réclame-t-elle le chantier choisi à l'étape 1 ? */
export type BesoinChantier = 'exige' | 'facultatif' | 'sans';

export interface DescripteurNature {
  /** Clé technique stable : elle voyage dans l'URL et dans les tests. */
  cle: string;
  /** Libellé français de la nature. Passé par `t()` à l'affichage. */
  libelle: string;
  /** Une phrase qui dit ce que l'import va créer, et sous quelle forme. */
  description: string;
  chantier: BesoinChantier;
  champs: ChampDocument[];
  /** Les listes à charger avant l'aperçu. */
  referentiels: CleReferentiel[];

  /**
   * Règles qui dépassent un champ isolé : un couple obligatoire, un montant
   * cohérent avec sa quantité… Rend les motifs, en français, ou un tableau
   * vide. Ne revalide pas ce que le typage a déjà refusé.
   */
  valider?: (valeurs: ValeursLigne, contexte: ContexteImportation) => string[];

  /**
   * Enregistre UNE pièce, à l'état brouillon, par un service existant.
   *
   * Aucun descripteur n'a le droit d'appeler un point d'entrée inventé : la
   * liste des sept natures couvertes tient parce que chaque fonction appelée
   * ici existait avant cet écran.
   */
  enregistrer: (valeurs: ValeursLigne, contexte: ContexteImportation) => Promise<void>;

  /**
   * L'empreinte d'une ligne candidate — « même chantier, même montant, même
   * date » — ou `null` quand la ligne n'en porte pas assez pour en avoir une.
   *
   * Absente ⇒ aucune détection de doublon pour cette nature. C'est le cas
   * quand l'application n'offre AUCUNE liste des pièces déjà saisies : mieux
   * vaut le dire à l'écran que promettre une vérification qui n'a pas lieu.
   */
  empreinte?: (valeurs: ValeursLigne, contexte: ContexteImportation) => string | null;

  /** Les empreintes déjà en base. Va par paire avec `empreinte`. */
  chargerEmpreintes?: (contexte: ContexteImportation) => Promise<string[]>;

  /**
   * Pourquoi la détection de doublon est impossible, en français.
   *
   * Renseignée **exactement** quand `empreinte` manque : l'écran l'affiche
   * telle quelle au-dessus de l'aperçu.
   */
  doublonImpossible?: string;
}
