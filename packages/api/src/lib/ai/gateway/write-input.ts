import { z } from 'zod';

/**
 * Corps d'une écriture proposée par le modèle (`plan_write`) : JSON plat ou imbriqué,
 * borné. Fonctions pures, partagées avec la vérification des arguments signés du jeton
 * (`proposal-token.ts`) : un corps déjà accepté à l'émission l'est encore à l'exécution,
 * et un jeton forgé avec un corps hors limites est refusé de la même façon.
 */

export const PLAN_BODY_MAX_BYTES = 8 * 1024;
/** Niveaux d'objets ou de listes imbriqués au plus (le corps lui-même compte pour 1). */
export const PLAN_BODY_MAX_DEPTH = 4;
const PLAN_BODY_MAX_KEY_CHARS = 100;
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export type PlanBody = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function checkNode(value: unknown, depth: number): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : 'nombre fini attendu';
  if (depth > PLAN_BODY_MAX_DEPTH) return `profondeur de ${PLAN_BODY_MAX_DEPTH} niveaux au plus`;
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = checkNode(item, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  if (!isPlainObject(value)) return 'valeur JSON simple attendue';
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return `clé interdite : ${key}`;
    if (key.length === 0 || key.length > PLAN_BODY_MAX_KEY_CHARS) return 'nom de clé de 1 à 100 caractères attendu';
    const problem = checkNode(value[key], depth + 1);
    if (problem) return problem;
  }
  return null;
}

/** Message d'erreur si le corps n'est pas acceptable, sinon null. */
export function validatePlanBody(value: unknown): string | null {
  if (!isPlainObject(value)) return 'objet JSON attendu';
  const problem = checkNode(value, 1);
  if (problem) return problem;
  const size = Buffer.byteLength(JSON.stringify(value), 'utf8');
  return size > PLAN_BODY_MAX_BYTES ? `corps de ${PLAN_BODY_MAX_BYTES} octets au plus (${size} reçus)` : null;
}

/**
 * Schéma Zod du corps. Ne passe PAS par `z.record` : Zod écarterait en silence une clé
 * `__proto__` avant que la validation ne la voie ; la valeur d'origine est validée telle quelle.
 */
export const planBodySchema = z
  .any()
  .superRefine((value, ctx) => {
    const problem = validatePlanBody(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  })
  .transform(value => value as PlanBody);
