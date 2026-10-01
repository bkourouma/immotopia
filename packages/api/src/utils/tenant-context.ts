import { AsyncLocalStorage } from 'async_hooks';
import { setAuditActor } from './request-context';

/**
 * Ambient tenant of the request currently being handled.
 *
 * Carried through async calls with AsyncLocalStorage so that code far from the
 * route — a Prisma extension, a logger — can tell which tenant a query belongs
 * to without threading the id through every signature.
 *
 * This is a safety net, not a replacement for explicit `where: { tenantId }`
 * filters: services must keep scoping their queries themselves.
 */

export interface TenantContext {
  tenantId: string;
  userId?: string;
  isSuperAdmin?: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Run `fn` with the given tenant as the ambient context. */
export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  // The agency of the request is also the agency of its audit events.
  setAuditActor({ tenantId: context.tenantId });
  return storage.run(context, fn);
}

/** Ambient tenant, or undefined outside a tenant-scoped request (jobs, seeds). */
export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

/** Ambient tenant id, or undefined. */
export function getCurrentTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}
