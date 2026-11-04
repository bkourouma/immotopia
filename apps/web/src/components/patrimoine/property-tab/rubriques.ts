/**
 * Rubriques de l'onglet Patrimoine d'un bien. La rubrique affichée vit dans
 * l'URL (`?rubrique=depenses`) : un lien partage la rubrique ouverte, le retour
 * arrière fonctionne, et les autres paramètres (`onglet`, recherches préfixées
 * `val.`, `dep.`…) ne sont jamais touchés.
 */
export const RUBRIQUE_PARAM = 'rubrique';

export const RUBRIQUES = ['synthese', 'valorisations', 'depenses', 'credits', 'travaux', 'documents'] as const;

export type Rubrique = (typeof RUBRIQUES)[number];

export const RUBRIQUE_PAR_DEFAUT: Rubrique = 'synthese';

/** Valeur absente ou inconnue : la synthèse. */
export function parseRubrique(raw: string | null | undefined): Rubrique {
  return (RUBRIQUES as readonly string[]).includes(raw ?? '') ? (raw as Rubrique) : RUBRIQUE_PAR_DEFAUT;
}
