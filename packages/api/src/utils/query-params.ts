/**
 * Lecture validée des paramètres de requête (query string).
 *
 * Un paramètre invalide lève une `BadRequestError` (400 typé) au lieu de
 * traverser le contrôleur jusqu'à Prisma (`PrismaClientValidationError` ou
 * `P2023`, donc un 500). Pas de `as Enum` ni de `parseInt` nu dans un
 * contrôleur : passer par ces fonctions.
 *
 * Un paramètre absent ou vide (`''`) vaut `undefined` : il n'y a rien à
 * filtrer. Un tableau (`?status=A&status=B`) est refusé : le filtre est
 * scalaire. La pagination (`page`, `limit`) reste dans `pagination-helper.ts`.
 */
import { BadRequestError } from '../middleware/error-middleware';
import { t } from '../i18n';

function isAbsent(raw: unknown): boolean {
  return raw === undefined || raw === null || raw === '';
}

function invalid(name: string, detail: string): BadRequestError {
  return new BadRequestError(t('Paramètre invalide : {{name}}.', { name }), [{ field: name, message: detail }]);
}

/** Valeur scalaire d'un paramètre, sinon 400 (tableau, objet imbriqué). */
function scalar(raw: unknown, name: string): string {
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  throw invalid(name, t('Une seule valeur est attendue.'));
}

/**
 * Valeur d'une énumération (objet `enum` Prisma ou liste de chaînes).
 * Absent : `undefined`. Hors liste : 400.
 */
export function parseEnumParam<T extends string>(
  raw: unknown,
  allowed: Readonly<Record<string, T>> | readonly T[],
  name: string
): T | undefined {
  if (isAbsent(raw)) return undefined;
  const value = scalar(raw, name);
  if (value === '') return undefined;
  const values: readonly string[] = Array.isArray(allowed) ? allowed : Object.values(allowed as Record<string, T>);
  if (!values.includes(value)) {
    throw invalid(name, t('Valeur non reconnue.'));
  }
  return value as T;
}

export interface ParseIntParamOptions {
  /** Borne basse incluse. */
  min?: number;
  /** Borne haute incluse. */
  max?: number;
}

function assertInRange(value: number, name: string, { min, max }: ParseIntParamOptions): void {
  if (min !== undefined && value < min) {
    throw invalid(name, t('Doit être supérieur ou égal à {{min}}.', { min }));
  }
  if (max !== undefined && value > max) {
    throw invalid(name, t('Doit être inférieur ou égal à {{max}}.', { max }));
  }
}

/**
 * Entier décimal d'un paramètre (`'12'`, `'-3'`). Pas de `'12abc'`, de `'1.5'`
 * ni de `'1e3'`. Hors bornes : 400. Absent : `undefined`.
 */
export function parseIntParam(raw: unknown, name: string, options: ParseIntParamOptions = {}): number | undefined {
  if (isAbsent(raw)) return undefined;
  const text = scalar(raw, name);
  if (text === '') return undefined;
  if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw invalid(name, t('Doit être un entier.'));
  }
  const value = Number(text);
  assertInRange(value, name, options);
  return value;
}

/** Nombre décimal d'un paramètre (`'12.5'`). Pas de `NaN` ni d'infini. */
export function parseNumberParam(raw: unknown, name: string, options: ParseIntParamOptions = {}): number | undefined {
  if (isAbsent(raw)) return undefined;
  const text = scalar(raw, name);
  if (text === '') return undefined;
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw invalid(name, t('Doit être un nombre.'));
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw invalid(name, t('Doit être un nombre.'));
  }
  assertInRange(value, name, options);
  return value;
}

/** Booléen `'true'`/`'false'` (`'1'`/`'0'` acceptés). Autre valeur : 400. */
export function parseBooleanParam(raw: unknown, name: string): boolean | undefined {
  if (isAbsent(raw)) return undefined;
  const text = scalar(raw, name).toLowerCase();
  if (text === '') return undefined;
  if (text === 'true' || text === '1') return true;
  if (text === 'false' || text === '0') return false;
  throw invalid(name, t('Doit valoir true ou false.'));
}
