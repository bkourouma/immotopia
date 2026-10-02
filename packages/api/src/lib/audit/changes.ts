/**
 * Différences avant/après d'un enregistrement, pour la colonne `changes` du
 * journal d'audit (ADR-006, phase 3 : « capture avant/après ciblée »).
 *
 * Un service qui modifie un enregistrement a déjà lu l'ancienne ligne et connaît
 * les nouvelles valeurs : il n'a qu'à appeler `diffForAudit(avant, modifications)`
 * et passer le résultat à `logAuditEvent({ …, changes })`. Pas d'extension
 * Prisma, pas de lecture en plus, pas de doublon avec les événements métier
 * existants.
 *
 * Seules les clés de `patch` sont comparées : une clé absente du patch (ou
 * `undefined`, au sens de Prisma « ne pas toucher ») n'a pas changé. Les secrets
 * sont masqués ensuite par `audit-entry-builder` (`passwordHash`, jetons…).
 */

export interface FieldChange {
  before: unknown;
  after: unknown;
}

export interface DiffOptions {
  /** Ne comparer que ces champs (liste blanche). */
  fields?: string[];
  /** Champs jamais journalisés, en plus de la liste par défaut. */
  exclude?: string[];
}

/** Champs techniques : leur variation n'est pas une action de l'utilisateur. */
const DEFAULT_EXCLUDED = new Set(['id', 'tenantId', 'tenant_id', 'createdAt', 'created_at', 'updatedAt', 'updated_at']);

const MAX_VALUE_LENGTH = 500;
const MAX_FIELDS = 50;

function truncate(text: string): string {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
}

function isDecimal(value: object): boolean {
  return typeof (value as { toFixed?: unknown }).toFixed === 'function' && 'd' in value;
}

/** Forme comparable et sérialisable d'une valeur (dates en ISO, décimaux en texte, objets en JSON borné). */
export function normalizeAuditValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') {
    if (isDecimal(value as object)) {
      // Un décimal et le nombre qui le met à jour doivent se comparer égaux :
      // nombre quand la conversion est sans perte, texte sinon (grands montants).
      const text = String(value);
      const asNumber = Number(text);
      return Number.isFinite(asNumber) && String(asNumber) === text ? asNumber : text;
    }
    try {
      return truncate(JSON.stringify(value));
    } catch {
      return '[illisible]';
    }
  }
  return truncate(String(value));
}

/**
 * Champs réellement modifiés, `{ champ: { before, after } }`, ou `undefined`
 * quand rien n'a changé (le service n'écrit alors pas de `changes`).
 */
export function diffForAudit(
  before: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
  options: DiffOptions = {}
): Record<string, FieldChange> | undefined {
  if (!before || !patch) return undefined;

  const exclude = new Set([...DEFAULT_EXCLUDED, ...(options.exclude ?? [])]);
  const keys = options.fields ?? Object.keys(patch);
  const changes: Record<string, FieldChange> = {};

  for (const key of keys) {
    if (exclude.has(key) || patch[key] === undefined) continue;
    const previous = normalizeAuditValue(before[key]);
    const next = normalizeAuditValue(patch[key]);
    if (previous === next) continue;
    changes[key] = { before: previous, after: next };
    if (Object.keys(changes).length >= MAX_FIELDS) break;
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}
