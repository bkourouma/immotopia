import type { CatalogEntry } from './gateway/catalog-builder';
import { isSecretKey, REDACTED, redactSecrets } from './gateway/sanitize';
import { writeSensitivity, type WriteSensitivityCategory } from './gateway/path-rules';
import type { PlanScalar, WritePlanChange } from './contracts';

/**
 * Calculs PURS d'un plan d'écriture (plan V2, étape 4) : tout ce que l'humain voit
 * de l'écriture (enregistrement visé, avant/après, sensibilité) est calculé ICI, par le
 * serveur, à partir du corps réellement envoyé et de l'état réellement lu. Le titre et
 * les étapes du modèle ne sont que du texte d'accompagnement. Aucune entrée-sortie.
 */

/** Changements affichés au plus ; au-delà `changesTruncated` et mot de confirmation exigé. */
export const MAX_DISPLAYED_CHANGES = 30;
export const CONFIRMATION_WORD = 'CONFIRMER' as const;
/** Valeurs de chaîne plus longues : tronquées à l'AFFICHAGE seulement (la requête, elle, est exacte). */
export const MAX_DISPLAY_STRING_CHARS = 300;
const MAX_LEAVES = 2000;

type Leaf = { field: string; value: PlanScalar };

/** Feuilles du corps en notation pointée (`address.city`, `lines.0.amount`) ; conteneur vide = feuille `{}` / `[]`. */
export function flattenLeaves(value: unknown, prefix = '', out: Leaf[] = []): Leaf[] {
  if (out.length >= MAX_LEAVES) return out;
  if (Array.isArray(value)) {
    if (value.length === 0 && prefix) out.push({ field: prefix, value: '[]' });
    value.forEach((item, index) => flattenLeaves(item, prefix ? `${prefix}.${index}` : String(index), out));
    return out;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0 && prefix) out.push({ field: prefix, value: '{}' });
    for (const [key, child] of entries) flattenLeaves(child, prefix ? `${prefix}.${key}` : key, out);
    return out;
  }
  if (prefix) out.push({ field: prefix, value: value as PlanScalar });
  return out;
}

export function isSecretField(field: string): boolean {
  return field.split('.').some(isSecretKey);
}

function lookup(state: unknown, field: string): { found: boolean; value: unknown } {
  let current: unknown = state;
  for (const key of field.split('.')) {
    if (current === null || typeof current !== 'object') return { found: false, value: undefined };
    const record = current as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, key)) return { found: false, value: undefined };
    current = record[key];
  }
  return { found: true, value: current };
}

function sameScalar(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Décimaux sérialisés en chaîne côté API, nombres dans le corps : « 150000 » et 150000 sont la même valeur.
  if ((typeof a === 'string' && typeof b === 'number') || (typeof a === 'number' && typeof b === 'string')) {
    return String(a) === String(b);
  }
  return false;
}

interface Display {
  value: PlanScalar;
  truncated: boolean;
}

/** Valeur affichable : scalaire seulement (objet -> `[objet]`), chaîne bornée, JWT/Bearer masqués. */
function toDisplay(raw: unknown): Display {
  const masked = redactSecrets(raw);
  if (masked === null || typeof masked === 'boolean' || typeof masked === 'number') {
    return { value: masked as PlanScalar, truncated: false };
  }
  if (typeof masked === 'string') {
    return masked.length > MAX_DISPLAY_STRING_CHARS
      ? { value: `${masked.slice(0, MAX_DISPLAY_STRING_CHARS)}…`, truncated: true }
      : { value: masked, truncated: false };
  }
  return { value: Array.isArray(masked) ? '[liste]' : '[objet]', truncated: false };
}

export interface ChangeSet {
  /** Tous les changements (non plafonnés), dans l'ordre du corps. */
  changes: WritePlanChange[];
  /** Champs du corps absents de l'enregistrement actuel (mise à jour seulement). */
  absentFields: string[];
  /** Au moins une valeur longue a été tronquée à l'affichage. */
  valuesTruncated: boolean;
  /** Feuilles du corps, secrets compris (pour le plafond de confirmation). */
  leafCount: number;
}

/**
 * Changements d'un corps. `state` = enregistrement actuel lu par le serveur (mise à
 * jour) ou `undefined` (création, action : aucun « avant »). Les champs inchangés sont
 * omis ; une clé évoquant un secret est masquée avant ET après et n'est jamais comparée
 * ni omise.
 */
export function computeChanges(body: Record<string, unknown> | null, state: unknown): ChangeSet {
  const leaves = flattenLeaves(body ?? {});
  const changes: WritePlanChange[] = [];
  const absentFields: string[] = [];
  let valuesTruncated = false;

  for (const leaf of leaves) {
    if (isSecretField(leaf.field)) {
      const found = state !== undefined && lookup(state, leaf.field).found;
      changes.push({ field: leaf.field, before: found ? REDACTED : undefined, after: REDACTED });
      continue;
    }
    const after = toDisplay(leaf.value);
    if (state === undefined) {
      valuesTruncated ||= after.truncated;
      changes.push({ field: leaf.field, before: undefined, after: after.value });
      continue;
    }
    const current = lookup(state, leaf.field);
    if (!current.found) {
      absentFields.push(leaf.field);
      valuesTruncated ||= after.truncated;
      changes.push({ field: leaf.field, before: undefined, after: after.value });
      continue;
    }
    if (sameScalar(current.value, leaf.value)) continue;
    const before = toDisplay(current.value);
    valuesTruncated ||= after.truncated || before.truncated;
    changes.push({ field: leaf.field, before: before.value, after: after.value });
  }
  return { changes, absentFields, valuesTruncated, leafCount: leaves.length };
}

// --- Enregistrement lu -------------------------------------------------------

const LABEL_KEYS = [
  'name',
  'title',
  'label',
  'fullName',
  'displayName',
  'number',
  'reference',
  'internalReference',
  'lease_number',
  'leaseNumber',
  'documentNumber',
  'document_number',
  'code'
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Enregistrement contenu dans une réponse de lecture : `{ success, data: {...} }` ->
 * `data` ; un enregistrement enveloppé seul (`{ data: { contact: {...} } }`) est déballé
 * une fois. `null` si la réponse n'est pas un enregistrement (liste, texte).
 */
export function unwrapRecord(parsed: unknown): Record<string, unknown> | null {
  if (!isRecord(parsed)) return null;
  let record: Record<string, unknown> = parsed;
  if (isRecord(record.data)) record = record.data;
  const nested = Object.entries(record).filter(([, value]) => isRecord(value));
  const scalars = Object.values(record).filter(value => !isRecord(value) && !Array.isArray(value));
  if (nested.length === 1 && scalars.length === 0) return nested[0]![1] as Record<string, unknown>;
  return record;
}

/** Libellé lisible d'un enregistrement (nom, titre, numéro, référence…), ou null. */
export function readableLabel(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  for (const key of LABEL_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '' && !isSecretKey(key)) {
      const masked = redactSecrets(value) as string;
      return masked.length > 120 ? `${masked.slice(0, 120)}…` : masked;
    }
    if (typeof value === 'number') return String(value);
  }
  return null;
}

// --- Nature de l'écriture ------------------------------------------------------

export type RecordKind = 'create' | 'update' | 'action';

const segmentsOf = (path: string): string[] => path.split('/').filter(Boolean);

/**
 * - PUT/PATCH : mise à jour ;
 * - POST sur `/x/:id/<verbe>` (dernier segment littéral, précédé d'un paramètre) : action sur une ressource ;
 * - autre POST : création.
 */
export function classifyRecord(entry: Pick<CatalogEntry, 'method' | 'path'>): RecordKind {
  if (entry.method === 'PUT' || entry.method === 'PATCH') return 'update';
  const segments = segmentsOf(entry.path);
  const last = segments[segments.length - 1] ?? '';
  const before = segments[segments.length - 2] ?? '';
  return !last.startsWith(':') && before.startsWith(':') ? 'action' : 'create';
}

/** Chemin du parent d'une ressource (`/x/:id/verbe` -> `/x/:id`) si le dernier segment est littéral et le précédent un paramètre. */
export function parentResourcePath(path: string): string | null {
  const segments = segmentsOf(path);
  const last = segments[segments.length - 1] ?? '';
  const before = segments[segments.length - 2] ?? '';
  if (last.startsWith(':') || !before.startsWith(':')) return null;
  return `/${segments.slice(0, -1).join('/')}`;
}

export interface WriteAssessment {
  sensitive: boolean;
  category?: WriteSensitivityCategory;
  /** Mot du chemin qui a déclenché la sensibilité. */
  word?: string;
  /** Mot de confirmation exigé : écriture sensible, ou corps plus gros que ce que le plan peut afficher. */
  requiresTypedConfirmation: boolean;
}

/**
 * Sensibilité et exigence de confirmation, recalculées À L'IDENTIQUE à l'émission du
 * plan et à l'exécution (aucun état caché dans le jeton à falsifier). Un corps de plus de
 * `MAX_DISPLAYED_CHANGES` champs ne peut pas être affiché en entier : le mot est alors exigé.
 */
export function assessWrite(entry: Pick<CatalogEntry, 'path'>, body: Record<string, unknown> | null): WriteAssessment {
  const hit = writeSensitivity(entry.path);
  const tooLarge = flattenLeaves(body ?? {}).length > MAX_DISPLAYED_CHANGES;
  return {
    sensitive: hit !== null,
    ...(hit ? { category: hit.category, word: hit.word } : {}),
    requiresTypedConfirmation: hit !== null || tooLarge
  };
}
