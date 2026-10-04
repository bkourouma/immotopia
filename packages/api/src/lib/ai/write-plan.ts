import type { CatalogEntry } from './gateway/catalog-builder';
import { isSecretKey, REDACTED, redactSecrets } from './gateway/sanitize';
import { bodySensitivity, writeSensitivity, type WriteSensitivityCategory } from './gateway/path-rules';
import type { PlanScalar, WritePlanChange, WritePlanQueryParam } from './contracts';

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
  /** Listes du corps plus courtes que celles de l'état : des éléments sont retirés par le remplacement. */
  replacedLists: Array<{ field: string; before: number; after: number; removed: number }>;
}

/** Listes du corps (chemin pointé) : les tableaux, à toute profondeur, y compris vides. */
function collectArrays(value: unknown, prefix = '', out: Array<{ field: string; items: unknown[] }> = []) {
  if (out.length >= 200) return out;
  if (Array.isArray(value)) {
    if (prefix) out.push({ field: prefix, items: value });
    value.forEach((item, index) => collectArrays(item, prefix ? `${prefix}.${index}` : String(index), out));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectArrays(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

const itemsLabel = (count: number): string => `[${count} éléments]`;

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

  // Remplacement d'une liste : le corps remplace TOUT le tableau. Comparés par indice, les éléments
  // retirés (état plus long que le corps) n'apparaîtraient nulle part : un changement de niveau liste
  // les rend visibles, et `replacedLists` permet l'avertissement et la confirmation renforcée.
  const replacedLists: ChangeSet['replacedLists'] = [];
  if (state !== undefined) {
    for (const { field, items } of collectArrays(body ?? {})) {
      if (isSecretField(field)) continue;
      const current = lookup(state, field);
      if (!current.found || !Array.isArray(current.value) || current.value.length <= items.length) continue;
      const removed = current.value.length - items.length;
      replacedLists.push({ field, before: current.value.length, after: items.length, removed });
      changes.push({ field, before: itemsLabel(current.value.length), after: itemsLabel(items.length) });
    }
  }
  return { changes, absentFields, valuesTruncated, leafCount: leaves.length, replacedLists };
}

// --- Enregistrement lu -------------------------------------------------------

/** Clés de libellé d'un enregistrement, par ordre de préférence (le nom de la personne est composé à part). */
const LABEL_KEYS_BEFORE_PERSON = ['name', 'title', 'label', 'displayName', 'fullName'] as const;
const LABEL_KEYS_AFTER_PERSON = [
  'legalName',
  'companyName',
  'number',
  'reference',
  'leaseNumber',
  'lease_number',
  'internalReference',
  'documentNumber',
  'document_number',
  'code',
  'email'
] as const;
/** Sous-objets où une réponse enveloppée peut porter l'enregistrement. */
const LABEL_WRAPPER_KEYS = ['data', 'contact', 'item', 'record', 'result', 'property', 'lease'] as const;
const MAX_LABEL_CHARS = 120;

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

function textOf(record: Record<string, unknown>, key: string): string | null {
  if (isSecretKey(key)) return null;
  const value = record[key];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function clampLabel(text: string): string {
  const masked = redactSecrets(text) as string;
  return masked.length > MAX_LABEL_CHARS ? `${masked.slice(0, MAX_LABEL_CHARS)}…` : masked;
}

/** Libellé d'UN niveau d'enregistrement, sans descendre. */
function labelOfLevel(record: Record<string, unknown>): string | null {
  // Contact personne morale : la raison sociale prime sur le prénom/nom (représentant).
  const company = record.contactType === 'COMPANY' ? textOf(record, 'legalName') : null;
  if (company) return clampLabel(company);
  for (const key of LABEL_KEYS_BEFORE_PERSON) {
    const text = textOf(record, key);
    if (text) return clampLabel(text);
  }
  const person = [textOf(record, 'firstName'), textOf(record, 'lastName')].filter(Boolean).join(' ');
  if (person) return clampLabel(person);
  for (const key of LABEL_KEYS_AFTER_PERSON) {
    const text = textOf(record, key);
    if (text) return clampLabel(text);
  }
  return null;
}

/**
 * Libellé lisible d'un enregistrement (nom, titre, numéro, référence, e-mail…), ou null. Si le niveau
 * courant n'en porte aucun, cherche une fois dans un sous-objet d'enveloppe (`data`, `contact`, `item`…).
 */
export function readableLabel(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  const own = labelOfLevel(record);
  if (own) return own;
  for (const key of LABEL_WRAPPER_KEYS) {
    const child = record[key];
    if (isRecord(child)) {
      const found = labelOfLevel(child);
      if (found) return found;
    }
  }
  return null;
}

/** Id abrégé (8 premiers caractères) : dernier recours quand l'enregistrement ne porte aucun libellé lisible. */
export function shortRecordId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
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

/**
 * Chemin de la ressource qui porte le DERNIER paramètre de chemin propre à la route (`tenantId` exclu) :
 * `/api/tenants/:tenantId/syndics/:syndicId/charges` -> `.../syndics/:syndicId`. Sert à nommer le parent
 * visé par une création imbriquée. `null` si le chemin n'a aucun paramètre autre que `tenantId`, ou si
 * le dernier segment est lui-même un paramètre (la route vise alors sa propre ressource).
 */
export function lastParamAncestorPath(path: string): string | null {
  const segments = segmentsOf(path);
  let index = -1;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (segments[i]!.startsWith(':') && segments[i] !== ':tenantId') {
      index = i;
      break;
    }
  }
  if (index < 0 || index === segments.length - 1) return null;
  return `/${segments.slice(0, index + 1).join('/')}`;
}

export interface WriteAssessment {
  sensitive: boolean;
  category?: WriteSensitivityCategory;
  /** Mot du chemin qui a déclenché la sensibilité. */
  word?: string;
  /**
   * Mot de confirmation exigé : écriture sensible (chemin ou corps), requête portant des paramètres de
   * requête (non reproduits dans les changements), ou corps plus gros que ce que le plan peut afficher.
   */
  requiresTypedConfirmation: boolean;
}

const MAX_QUERY_VALUE_DISPLAY = 120;

/**
 * Paramètres de requête signés, tels qu'AFFICHÉS : valeur masquée si la clé évoque un secret, JWT/Bearer
 * masqués, valeurs longues tronquées à l'affichage. Calculé par le serveur depuis la requête signée.
 */
export function displayQuery(query: Record<string, string | number | boolean> | undefined): WritePlanQueryParam[] {
  return Object.entries(query ?? {}).map(([key, raw]) => {
    if (isSecretKey(key)) return { key, value: REDACTED };
    const masked = String(redactSecrets(raw));
    return {
      key,
      value: masked.length > MAX_QUERY_VALUE_DISPLAY ? `${masked.slice(0, MAX_QUERY_VALUE_DISPLAY)}…` : masked
    };
  });
}

/**
 * Sensibilité et exigence de confirmation, recalculées À L'IDENTIQUE à l'émission du
 * plan et à l'exécution (aucun état caché dans le jeton à falsifier). Un corps de plus de
 * `MAX_DISPLAYED_CHANGES` champs ne peut pas être affiché en entier : le mot est alors exigé.
 */
export function assessWrite(
  entry: Pick<CatalogEntry, 'path'>,
  body: Record<string, unknown> | null,
  query: Record<string, unknown> = {}
): WriteAssessment {
  const hit = writeSensitivity(entry.path) ?? bodySensitivity(entry.path, body);
  const tooLarge = flattenLeaves(body ?? {}).length > MAX_DISPLAYED_CHANGES;
  const hasQuery = Object.keys(query).length > 0;
  return {
    sensitive: hit !== null,
    ...(hit ? { category: hit.category, word: hit.word } : {}),
    requiresTypedConfirmation: hit !== null || tooLarge || hasQuery
  };
}
