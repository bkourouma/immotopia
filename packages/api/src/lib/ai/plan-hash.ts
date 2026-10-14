import { createHash } from 'node:crypto';
import type { ExecuteCapabilityArgs } from './contracts';

/**
 * Empreinte d'un plan d'écriture.
 *
 * `planHash` = SHA-256 (hex) de la forme CANONIQUE (clés triées, sans espace) de la
 * requête approuvée : `{ v, capabilityId, pathParams, query, body[, requireConfirmation] }`. Les `changes`
 * affichés à l'humain sont une fonction déterministe de ce corps et de l'état lu au
 * moment du plan : c'est donc bien la requête que l'accord autorise, et elle seule.
 * Recalculable à partir des seuls arguments signés : à l'exécution, toute
 * incohérence entre arguments et empreinte (jeton forgé ou arguments altérés)
 * est refusée avant la moindre écriture, et l'empreinte figure dans l'audit.
 */

const HASH_VERSION = 1;

/** JSON canonique : objets aux clés triées (ordre du code), valeurs `undefined` ignorées. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function computePlanHash(args: Omit<ExecuteCapabilityArgs, 'planHash'>): string {
  return sha256Hex(
    canonicalJson({
      v: HASH_VERSION,
      capabilityId: args.capabilityId,
      pathParams: args.pathParams,
      query: args.query,
      body: args.body,
      // Seulement quand vrai : l'empreinte d'un plan ordinaire est inchangée.
      ...(args.requireConfirmation ? { requireConfirmation: true } : {})
    })
  );
}
