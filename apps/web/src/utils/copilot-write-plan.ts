import type { PlanScalar, WritePlan, WritePlanChange } from '../types/copilot';

/** Bornes défensives : le serveur limite déjà, le front les réapplique. */
export const WRITE_PLAN_MAX_STEPS = 30;
export const WRITE_PLAN_MAX_CHANGES = 200;
export const WRITE_PLAN_MAX_WARNINGS = 20;

const METHODS = new Set(['POST', 'PUT', 'PATCH']);
const KINDS = new Set(['create', 'update', 'action']);

const isString = (v: unknown): v is string => typeof v === 'string';
const isScalar = (v: unknown): v is PlanScalar =>
  v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

function sanitizeChanges(raw: unknown): { changes: WritePlanChange[]; capped: boolean } {
  const list = Array.isArray(raw) ? raw : [];
  const changes: WritePlanChange[] = [];
  for (const item of list) {
    const c = (item ?? {}) as Record<string, unknown>;
    if (!isString(c.field) || !isScalar(c.after)) continue;
    // `before` absent (ou undefined) = création ; une valeur non scalaire est ignorée.
    const before = c.before === undefined || isScalar(c.before) ? (c.before as PlanScalar | undefined) : undefined;
    changes.push({ field: c.field, before, after: c.after });
  }
  return { changes: changes.slice(0, WRITE_PLAN_MAX_CHANGES), capped: changes.length > WRITE_PLAN_MAX_CHANGES };
}

/**
 * Valide un plan reçu du flux SSE. Renvoie `null` si l'objet est mal formé : il
 * est alors ignoré (jamais d'approbation d'un plan que l'on ne sait pas afficher).
 */
export function sanitizeWritePlan(raw: unknown): WritePlan | null {
  const p = (raw ?? {}) as Record<string, unknown>;
  if (!isString(p.proposalId) || !p.proposalId || !isString(p.token) || !p.token) return null;
  if (!isString(p.expiresAt) || !isString(p.title)) return null;
  if (!isString(p.method) || !METHODS.has(p.method)) return null;
  if (!isString(p.recordKind) || !KINDS.has(p.recordKind)) return null;
  const { changes, capped } = sanitizeChanges(p.changes);
  const target = p.target as { label?: unknown; resolved?: unknown } | null | undefined;
  const requiresTypedConfirmation = p.requiresTypedConfirmation === true;
  return {
    proposalId: p.proposalId,
    token: p.token,
    expiresAt: p.expiresAt,
    action: 'EXECUTE_CAPABILITY',
    capabilityId: isString(p.capabilityId) ? p.capabilityId : '',
    method: p.method as WritePlan['method'],
    module: isString(p.module) ? p.module : '',
    title: p.title,
    steps: (Array.isArray(p.steps) ? p.steps : []).filter(isString).slice(0, WRITE_PLAN_MAX_STEPS),
    recordKind: p.recordKind as WritePlan['recordKind'],
    target: target && isString(target.label) ? { label: target.label, resolved: target.resolved === true } : null,
    changes,
    changesTruncated: p.changesTruncated === true || capped,
    warnings: (Array.isArray(p.warnings) ? p.warnings : []).filter(isString).slice(0, WRITE_PLAN_MAX_WARNINGS),
    sensitive: p.sensitive === true,
    sensitiveReason: isString(p.sensitiveReason) ? p.sensitiveReason : undefined,
    requiresTypedConfirmation,
    confirmationWord: p.confirmationWord === 'CONFIRMER' ? 'CONFIRMER' : undefined
  };
}

/** Mot à saisir pour un plan renforcé ; `null` si l'accord simple suffit. */
export function requiredConfirmationWord(plan: WritePlan): string | null {
  return plan.sensitive || plan.requiresTypedConfirmation ? (plan.confirmationWord ?? 'CONFIRMER') : null;
}
