/**
 * Contrat de l'aide interne d'ImmoTopia.
 *
 * Le contenu d'aide vit dans `help/content/<module>/` (un lot de redaction par
 * module). Ce fichier est le contrat entre le socle et ces lots : ne pas le
 * modifier sans prevenir le superviseur. Guide de redaction :
 * `docs/aide/GUIDE_REDACTION.md`.
 */

/** Module documente. Premier segment de tout identifiant d'entree. */
export type HelpModule =
  'locatif' | 'syndic' | 'finance' | 'patrimoine' | 'commercial' | 'communication' | 'portails' | 'administration';

/** Langues du contenu d'aide (memes codes que l'interface). */
export type HelpLanguage = 'fr' | 'en' | 'ar';

/**
 * Une fiche d'aide.
 *
 * Identifiant : `<module>.<ecran>[.<bloc>]`, minuscules, chiffres, points et
 * tirets uniquement (`HELP_ID_PATTERN`), par exemple `locatif.baux.liste` pour
 * l'ecran et `locatif.baux.liste.tableau` pour son tableau.
 *
 * Tous les textes sont du TEXTE BRUT : jamais de HTML ni de Markdown. Les
 * paragraphes d'un meme champ se separent par une ligne vide (`\n\n`).
 */
export interface HelpEntry {
  id: string;
  /** `page` = vue d'ensemble d'un ecran ; `section` = carte, onglet, assistant ; `table` = tableau. */
  kind: 'page' | 'section' | 'table';
  title: string;
  /** Une a deux phrases. */
  summary: string;
  /** A quoi ca sert, contexte metier. */
  purpose?: string;
  /** Comment lire les colonnes, les statuts et les indicateurs. */
  howToRead?: {
    columns?: { key: string; label: string; description: string }[];
    statuses?: { value: string; label: string; description: string }[];
    notes?: string[];
  };
  /** Procedure pas a pas. */
  steps?: { title: string; detail?: string }[];
  /** Ce qui se passe apres : irreversible, documents generes, qui est prevenu. */
  consequences?: string[];
  faq?: { q: string; a: string }[];
  permissions?: {
    /** Libelles de roles, en clair (« Gestionnaire », « Comptable »...). */
    roles?: string[];
    /** Cle de fonctionnalite d'abonnement (`NavFeature` : CRM, SALES, RENTAL, PATRIMOINE, SYNDIC, CONSTRUCTION). */
    feature?: string;
    note?: string;
  };
  /** Voir aussi : `helpId` ouvre une autre fiche, `to` est un lien interne. */
  related?: { label: string; helpId?: string; to?: string }[];
  /** Mots supplementaires pour la recherche (synonymes, termes du quotidien). */
  keywords?: string[];
  /** Visite guidee ; `target` est la valeur d'un attribut `data-help-anchor`. */
  tour?: {
    autoStart?: boolean;
    steps: { target: string; title: string; description: string }[];
  };
}

/** Association motif de route -> fiche de page. */
export interface HelpRoute {
  /** Motif react-router, par exemple `/tenant/:tenantId/rental/leases`. */
  pattern: string;
  helpId: string;
}

/** Forme obligatoire d'un identifiant d'entree. */
export const HELP_ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
