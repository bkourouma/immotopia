/**
 * Formulaires paramétrables : vocabulaire partagé (contrat
 * docs/architecture/FORMULAIRES_PARAMETRABLES_CONTRAT.md, §1 et §2).
 */

/** Mode d'un champ : obligatoire, facultatif ou masqué. */
export type FieldMode = 'REQUIRED' | 'OPTIONAL' | 'HIDDEN';

/**
 * `GATED` : « facultatif sous condition », réglable par l'agence seulement après
 * déverrouillage par le super-admin. `OPEN` : « paramétrable », réglé par l'agence.
 * Les champs « jamais facultatifs » n'apparaissent dans aucun registre.
 */
export type FieldClass = 'GATED' | 'OPEN';

export const FIELD_MODES: readonly FieldMode[] = ['REQUIRED', 'OPTIONAL', 'HIDDEN'];

export function isFieldMode(value: unknown): value is FieldMode {
  return typeof value === 'string' && (FIELD_MODES as readonly string[]).includes(value);
}

export interface FormFieldDefinition {
  /** Chemin de la clé dans le corps JSON envoyé à l'API (`champ` ou `tableau[].champ`). */
  key: string;
  /** Libellé français affiché (clé i18n). */
  label: string;
  fieldClass: FieldClass;
  /** Comportement actuel de l'application. */
  defaultMode: FieldMode;
  /** Contient toujours `defaultMode` ; sans `HIDDEN` si le champ n'est pas masquable. */
  allowedModes: FieldMode[];
  /** « Ce qui casse » quand le champ est facultatif ou masqué, en français. */
  consequence: string;
}

export interface FormDefinition {
  /** `<module>.<formulaire>` en kebab-case, stable. */
  formKey: string;
  module: string;
  /** Titre français du formulaire. */
  label: string;
  audience: 'agency' | 'coowner-portal' | 'tenant-portal' | 'owner-portal';
  fields: FormFieldDefinition[];
}

export type FormRegistry = Record<string, FormDefinition>;

export interface EffectiveField {
  key: string;
  mode: FieldMode;
}

export interface EffectiveForm {
  formKey: string;
  fields: Record<string, FieldMode>;
  /**
   * Libellés français des champs (clé i18n), pour les messages d'erreur. Propriété
   * non énumérable : absente de `JSON.stringify` et des comparaisons `toEqual`.
   */
  readonly labels?: Record<string, string>;
}
