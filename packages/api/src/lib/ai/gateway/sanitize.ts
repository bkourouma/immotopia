/**
 * Rédaction et réduction des réponses de la passerelle avant leur retour au
 * modèle. Fonctions pures, sans dépendance.
 *
 * 1. `redactSecrets` : toute clé dont le nom évoque un secret est remplacée par
 *    `[masqué]` à n'importe quelle profondeur. `iban` et `rib` ne sont PAS
 *    masqués : ce sont des données métier que l'utilisateur voit déjà.
 * 2. `reduceForModel` : tableaux, chaînes, objets, profondeur et taille totale
 *    plafonnés, avec indication de troncature.
 */

export const REDACTED = '[masqué]';

/** Nom de clé normalisé (sans `_`, `-`, casse) évoquant un secret. */
const SECRET_KEY =
  /(password|passwd|secret|token|apikey|authorization|hash|credential|privatekey|cookie|activationcode)/;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key.toLowerCase().replace(/[_\-\s]/g, ''));
}

/** Un JWT ou un en-tête « Bearer … » qui se serait glissé dans une valeur quelconque. */
const SECRET_VALUE = /^(?:Bearer\s+\S+|eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*)$/;

const MAX_REDACTION_DEPTH = 40;

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return SECRET_VALUE.test(value) ? REDACTED : value;
  if (value === null || typeof value !== 'object') return value;
  if (depth > MAX_REDACTION_DEPTH) return REDACTED; // structure pathologique : on ne la laisse pas passer en clair
  if (Array.isArray(value)) return value.map(item => redactSecrets(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSecretKey(key) ? REDACTED : redactSecrets(child, depth + 1);
  }
  return out;
}

/** Clés qui portent un chemin de fichier sur le disque du serveur (jamais montré à l'humain ni au modèle). */
const DISK_PATH_KEYS = new Set(['filepath', 'path']);

/** Retire récursivement les clés `file_path`, `filePath` et `path` (chemins disque) d'une réponse. */
export function stripDiskPaths(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth > MAX_REDACTION_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map(item => stripDiskPaths(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (DISK_PATH_KEYS.has(key.toLowerCase().replace(/[_\-\s]/g, ''))) continue;
    out[key] = stripDiskPaths(child, depth + 1);
  }
  return out;
}

export interface ReduceLimits {
  maxArrayItems: number;
  maxStringChars: number;
  maxObjectKeys: number;
  maxDepth: number;
}

export const DEFAULT_REDUCE_LIMITS: ReduceLimits = {
  maxArrayItems: 50,
  maxStringChars: 500,
  maxObjectKeys: 100,
  maxDepth: 6
};

/** Total visé, en caractères du JSON renvoyé au modèle. */
export const MAX_MODEL_JSON_CHARS = 12000;

/** Paliers de plus en plus stricts, essayés jusqu'à tenir sous le budget. */
const SHRINK_STEPS: ReduceLimits[] = [
  DEFAULT_REDUCE_LIMITS,
  { maxArrayItems: 25, maxStringChars: 300, maxObjectKeys: 60, maxDepth: 6 },
  { maxArrayItems: 10, maxStringChars: 200, maxObjectKeys: 40, maxDepth: 5 },
  { maxArrayItems: 5, maxStringChars: 120, maxObjectKeys: 25, maxDepth: 4 },
  { maxArrayItems: 2, maxStringChars: 80, maxObjectKeys: 15, maxDepth: 3 }
];

interface ReduceState {
  truncated: boolean;
}

function reduceNode(value: unknown, limits: ReduceLimits, depth: number, state: ReduceState): unknown {
  if (typeof value === 'string') {
    if (value.length <= limits.maxStringChars) return value;
    state.truncated = true;
    return `${value.slice(0, limits.maxStringChars)}… [tronqué, ${value.length} caractères]`;
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= limits.maxDepth) {
    state.truncated = true;
    return Array.isArray(value)
      ? `[liste de ${value.length} éléments, profondeur max atteinte]`
      : '[objet, profondeur max atteinte]';
  }
  if (Array.isArray(value)) {
    const kept = value.slice(0, limits.maxArrayItems).map(item => reduceNode(item, limits, depth + 1, state));
    if (value.length > kept.length) {
      state.truncated = true;
      kept.push(`… ${value.length - kept.length} éléments omis (total ${value.length})`);
    }
    return kept;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  for (const [key, child] of entries.slice(0, limits.maxObjectKeys)) {
    out[key] = reduceNode(child, limits, depth + 1, state);
  }
  if (entries.length > limits.maxObjectKeys) {
    state.truncated = true;
    out._clesOmises = entries.length - limits.maxObjectKeys;
  }
  return out;
}

export interface ReducedResult {
  data: unknown;
  truncated: boolean;
}

/** Réduit `value` sous `MAX_MODEL_JSON_CHARS` ; en dernier recours, un aperçu texte tronqué. */
export function reduceForModel(value: unknown, maxChars: number = MAX_MODEL_JSON_CHARS): ReducedResult {
  for (const limits of SHRINK_STEPS) {
    const state: ReduceState = { truncated: false };
    const data = reduceNode(value, limits, 0, state);
    const size = JSON.stringify(data)?.length ?? 0;
    if (size <= maxChars) {
      // Un palier plus strict que le premier est lui-même une troncature.
      return { data, truncated: state.truncated || limits !== SHRINK_STEPS[0] };
    }
  }
  const text = JSON.stringify(value) ?? '';
  return {
    data: { aperçu: text.slice(0, Math.max(maxChars - 200, 200)), totalCaractères: text.length },
    truncated: true
  };
}
