/**
 * Types partagés du module d'export des tableaux.
 *
 * Le tableau exporté est une structure NEUTRE (`ExportTable`) : l'extraction
 * (colonnes + rendu des cellules) la produit une fois, puis chaque écrivain
 * (Excel, CSV, PDF) la consomme sans rien savoir d'Ant Design ni de React.
 */

export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

/** Valeur qu'une colonne peut déclarer via `exportValue`. */
export type ExportRawValue = string | number | boolean | Date | null | undefined;

export interface ExportCell {
  /** Texte affiché (ou rendu) de la cellule : ce que voit l'utilisateur. */
  text: string;
  /** Valeur typée pour Excel. `null` quand la cellule est vide. */
  value: string | number | boolean | Date | null;
  kind: 'text' | 'number' | 'boolean' | 'date' | 'empty';
  /** Retrait (en niveaux) pour les lignes enfants d'un tableau arborescent. */
  indent?: number;
}

export interface ExportTableColumn {
  header: string;
  /** Numérique si au moins une cellule l'est ; `integer` si aucune n'a de décimales. */
  numeric: boolean;
  integer: boolean;
}

export interface ExportTable {
  columns: ExportTableColumn[];
  rows: ExportCell[][];
}

export interface WriterOptions {
  /** Nom de feuille (Excel) ou titre du document (PDF). */
  title: string;
  /** Langue courante : `fr`, `en` ou `ar`. */
  language: string;
  /** Locale Intl (`fr-FR`…), pour la date de génération. */
  locale: string;
}
