/**
 * Request-scoped context (IP, User-Agent, request id, actor) for audit and logging.
 * Uses AsyncLocalStorage so services can access the current request's client IP
 * without passing req through every layer.
 *
 * The store object is created before authentication and completed afterwards
 * (`setAuditActor`), so audit events written deep in a service know who acted
 * and for which agency without every caller passing it.
 */
import { AsyncLocalStorage } from 'async_hooks';

export type AuditActorKind = 'USER' | 'SUPER_ADMIN' | 'PORTAL' | 'SYSTEM' | 'AI';

export interface RequestActor {
  userId?: string;
  type?: AuditActorKind;
  tenantId?: string;
  /** Display name or e-mail at the time of the action. */
  label?: string;
}

export interface RequestContextData {
  ip: string | null;
  userAgent: string | null;
  requestId?: string;
  actor?: RequestActor;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

export function getRequestContext(): RequestContextData | undefined {
  return asyncLocalStorage.getStore();
}

export function runWithRequestContext<T>(context: RequestContextData, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Completes the actor of the current request. Merges into the existing actor
 * (authentication sets the user, tenant resolution adds the agency later).
 * No-op outside a request (jobs, scripts, tests).
 */
export function setAuditActor(actor: RequestActor): void {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    return;
  }
  store.actor = { ...store.actor, ...actor };
}

export { asyncLocalStorage };
