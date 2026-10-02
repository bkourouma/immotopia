/**
 * Rubriques et types d'un accès tiers de confiance (lot B3, spec 034).
 *
 * Valeurs identiques aux enums Prisma `ExternalAccessType` et
 * `ExternalAccessSection` ; les tableaux servent à la validation zod et à
 * l'API d'options. Aucun accès base ici : module pur.
 */

export const EXTERNAL_ACCESS_TYPES = ['NOTARY', 'ACCOUNTANT', 'BANKER'] as const;
export type ExternalAccessTypeKey = (typeof EXTERNAL_ACCESS_TYPES)[number];

export const EXTERNAL_ACCESS_SECTIONS = [
  'VALUATIONS',
  'YIELD_RATIOS',
  'LOANS',
  'EXPENSES',
  'RENTS',
  'DOCUMENTS',
  'TITLES_OWNERSHIP'
] as const;
export type ExternalAccessSectionKey = (typeof EXTERNAL_ACCESS_SECTIONS)[number];

/**
 * Rubriques ouvertes par défaut selon le type de tiers (modifiables à la
 * création et ensuite). Rien d'autre n'est ouvert par défaut.
 */
export const DEFAULT_SECTIONS_BY_TYPE: Readonly<Record<ExternalAccessTypeKey, readonly ExternalAccessSectionKey[]>> = {
  BANKER: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS'],
  ACCOUNTANT: ['EXPENSES', 'RENTS', 'LOANS'],
  NOTARY: ['TITLES_OWNERSHIP', 'DOCUMENTS', 'VALUATIONS']
};

export function defaultSectionsFor(type: ExternalAccessTypeKey): ExternalAccessSectionKey[] {
  return [...DEFAULT_SECTIONS_BY_TYPE[type]];
}

/** Dédoublonne et remet les rubriques dans l'ordre canonique du catalogue. */
export function normalizeSections(sections: readonly ExternalAccessSectionKey[]): ExternalAccessSectionKey[] {
  const wanted = new Set(sections);
  return EXTERNAL_ACCESS_SECTIONS.filter(section => wanted.has(section));
}

/** Objet visé par le lien sécurisé : un lien = un objet = le grant. */
export const EXTERNAL_ACCESS_OBJECT_TYPE = 'ExternalAccessGrant';
export const EXTERNAL_ACCESS_LINK_SCOPE = 'EXTERNAL_ACCESS_GRANT' as const;

/** Un accès qui expire dans cette fenêtre est signalé « EXPIRING ». */
export const EXPIRING_WINDOW_DAYS = 7;

/**
 * Plafonds de saisie et de lecture (bornent le coût d'une consultation).
 *
 * `MAX_SCOPE_PROPERTIES` est la limite UNIQUE de biens d'un accès, entités
 * développées comprises : refus 400 à l'écriture ; à la consultation, si le
 * périmètre développé la dépasse (entités qui grossissent), la vue est tronquée
 * aux premiers biens par titre (`summary.truncated: true`). Elle borne le
 * nombre de calculs de rendement (~6 requêtes par bien) d'une route anonyme.
 */
export const MAX_SCOPE_PROPERTIES = 100;
export const MAX_PROPERTIES_PER_GRANT = MAX_SCOPE_PROPERTIES;
export const MAX_ENTITIES_PER_GRANT = 50;
export const MAX_DOCUMENTS_PER_GRANT = 200;
