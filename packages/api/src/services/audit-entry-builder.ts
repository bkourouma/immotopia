import { Prisma } from '@prisma/client';
import { AuditLogEntry } from '../types/audit-types';
import { getAuditCatalogEntry } from '../types/audit-catalog';
import { getRequestContext, RequestContextData } from '../utils/request-context';
import { logger } from '../utils/logger';

/**
 * Construit la ligne `audit_logs` à partir de ce que l'appelant fournit, du
 * contexte de requête et du catalogue (ADR-006).
 *
 * Fonction pure hors lecture du contexte ambiant : l'enrichissement a lieu au
 * moment de l'appel (dans la requête, donc avec acteur et agence), jamais au
 * moment de la vidange de la file, qui tourne hors de toute requête.
 *
 * Règle d'or : **une valeur fournie par l'appelant l'emporte toujours**.
 * `undefined` = non fourni (on complète) ; `null` = fourni, vide (on respecte).
 */

/** Ligne prête à être écrite par `createMany` / `create`. */
export type AuditRow = Prisma.AuditLogUncheckedCreateInput;

export const REDACTED = '[masqué]';

/**
 * Mots qui rendent une clé sensible. La clé est découpée en mots
 * (`passwordHash` → password, hash ; `new_token` → new, token) pour ne pas
 * masquer `footprint` à cause de « otp ». Plutôt trop prudent que l'inverse :
 * `tokenCount` est masqué aussi.
 */
const SENSITIVE_WORDS = new Set(['password', 'passwd', 'secret', 'token', 'authorization', 'cookie', 'otp', 'iban', 'cvv']);
const SENSITIVE_JOINED = /(password|secret|apikey|privatekey|cardnumber)/;

function isSensitiveKey(key: string): boolean {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some(word => SENSITIVE_WORDS.has(word)) || SENSITIVE_JOINED.test(words.join(''));
}

const MAX_DEPTH = 6;

/**
 * Copie `value` en masquant toute clé sensible (liste commune + `extraKeys` du
 * catalogue). Profondeur bornée : une structure cyclique ou démesurée ne bloque
 * jamais l'écriture d'un événement.
 */
export function redactAuditData(value: unknown, extraKeys: string[] = [], depth = 0): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return REDACTED;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => redactAuditData(item, extraKeys, depth + 1));
  }
  const extra = new Set(extraKeys);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) || extra.has(key) ? REDACTED : redactAuditData(child, extraKeys, depth + 1);
  }
  return out;
}

const unknownKeysWarned = new Set<string>();

/** Une clé hors catalogue est fermée par défaut ; on le dit une fois par clé. */
function warnUnknownKey(actionKey: string): void {
  if (unknownKeysWarned.has(actionKey)) {
    return;
  }
  unknownKeysWarned.add(actionKey);
  logger.warn('Audit: action absente du catalogue, visibilité PLATFORM_ONLY par défaut', { actionKey });
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return (value ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull;
}

export function buildAuditRow(entry: AuditLogEntry, ctx: RequestContextData | undefined = getRequestContext()): AuditRow {
  const actor = ctx?.actor;
  const catalog = getAuditCatalogEntry(entry.actionKey);
  if (!catalog) {
    warnUnknownKey(entry.actionKey);
  }

  const actorUserId = entry.actorUserId !== undefined ? entry.actorUserId : (actor?.userId ?? null);
  const tenantId = entry.tenantId !== undefined ? entry.tenantId : (actor?.tenantId ?? null);

  // Une ligne sans agence n'est lisible par aucune agence : on ne lui laisse
  // pas une visibilité TENANT qui ne voudrait rien dire.
  const visibility = tenantId ? (entry.visibility ?? catalog?.visibility ?? 'PLATFORM_ONLY') : 'PLATFORM_ONLY';
  const redact = catalog?.redact ?? [];

  return {
    actorUserId: actorUserId || null,
    tenantId: tenantId || null,
    actionKey: entry.actionKey,
    entityType: entry.entityType,
    entityId: entry.entityId,
    ipAddress: entry.ipAddress !== undefined ? entry.ipAddress : (ctx?.ip ?? null),
    userAgent: entry.userAgent !== undefined ? entry.userAgent : (ctx?.userAgent ?? null),
    payload: toJson(entry.payload == null ? null : redactAuditData(entry.payload, redact)),
    changes: toJson(entry.changes == null ? null : redactAuditData(entry.changes, redact)),
    createdAt: entry.createdAt ?? new Date(),
    scope: entry.scope ?? (tenantId ? 'TENANT' : 'PLATFORM'),
    visibility,
    category: entry.category ?? catalog?.category ?? 'DATA',
    outcome: entry.outcome ?? 'SUCCESS',
    actorType: entry.actorType ?? actor?.type ?? (actorUserId ? 'USER' : 'SYSTEM'),
    actorLabel: entry.actorLabel !== undefined ? entry.actorLabel : (actor?.label ?? null),
    requestId: entry.requestId !== undefined ? entry.requestId : (ctx?.requestId ?? null),
    source: entry.source !== undefined ? entry.source : ctx ? 'http' : null
  };
}
