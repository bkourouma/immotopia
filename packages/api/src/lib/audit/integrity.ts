import { createHash } from 'crypto';

/**
 * Primitives d'intégrité du journal d'audit (ADR-006, phase 5) : hachage
 * canonique d'une ligne, racine de Merkle d'une partition, chaînage des scellés.
 * Fonctions pures, sans base : tout ce qui décide si une ligne a été touchée est
 * ici, testable à part.
 *
 * Algorithme `sha256-merkle-v1` — NE PAS le modifier : un scellé déjà écrit se
 * revérifie avec lui. Ajouter une colonne au journal, ou changer la forme
 * canonique, demande une nouvelle version (`sha256-merkle-v2`) qui cohabite.
 */

export const SEAL_ALGORITHM = 'sha256-merkle-v1';

/** Chaîne de départ : le `prevHash` du tout premier scellé. */
export const GENESIS_HASH = '0'.repeat(64);

/** Tout ce qui est haché d'une ligne : les colonnes de `audit_logs`, dans cet ordre. */
export interface AuditRowForHash {
  id: string;
  actorUserId: string | null;
  tenantId: string | null;
  actionKey: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  userAgent: string | null;
  payload: unknown;
  createdAt: Date;
  scope: string;
  visibility: string;
  category: string;
  outcome: string;
  actorType: string;
  actorLabel: string | null;
  requestId: string | null;
  source: string | null;
  changes: unknown;
}

/**
 * JSON à clés triées récursivement, sans espace. Postgres normalise l'ordre des
 * clés d'un `jsonb` : sans tri, un objet relu ne se hacherait pas comme celui
 * qu'on a écrit.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) return 'null';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Hash d'une feuille. Préfixe `0x00` : sépare les feuilles des nœuds internes
 * (sans lui, un nœud pourrait se faire passer pour une ligne).
 */
export function rowHash(row: AuditRowForHash): string {
  const canonical = canonicalJson([
    row.id,
    row.actorUserId,
    row.tenantId,
    row.actionKey,
    row.entityType,
    row.entityId,
    row.ipAddress,
    row.userAgent,
    row.payload,
    row.createdAt,
    row.scope,
    row.visibility,
    row.category,
    row.outcome,
    row.actorType,
    row.actorLabel,
    row.requestId,
    row.source,
    row.changes
  ]);
  return createHash('sha256')
    .update(Buffer.from([0x00]))
    .update(canonical, 'utf8')
    .digest('hex');
}

function nodeHash(left: string, right: string): string {
  return createHash('sha256')
    .update(Buffer.from([0x01]))
    .update(Buffer.from(left, 'hex'))
    .update(Buffer.from(right, 'hex'))
    .digest('hex');
}

/**
 * Racine de Merkle de feuilles DÉJÀ ordonnées (par date puis identifiant). Un
 * niveau impair promeut son dernier nœud tel quel. Une partition n'est jamais
 * vide ; une liste vide donne le hash vide, pour rester total.
 */
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return createHash('sha256').update('').digest('hex');
  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? nodeHash(level[i], level[i + 1]) : level[i]);
    }
    level = next;
  }
  return level[0];
}

export interface SealFields {
  /** `AAAA-MM-JJ`. */
  sealDate: string;
  tenantKey: string;
  visibility: string;
  rowCount: number;
  rootHash: string;
  algorithm: string;
}

/** Hash de chaîne d'un scellé : dépend du précédent, donc de tous ceux d'avant. */
export function sealChainHash(prevHash: string, seal: SealFields): string {
  return createHash('sha256')
    .update(
      [prevHash, seal.sealDate, seal.tenantKey, seal.visibility, seal.rowCount, seal.rootHash, seal.algorithm].join(
        '|'
      ),
      'utf8'
    )
    .digest('hex');
}
