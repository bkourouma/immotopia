/**
 * Request-scoped context (IP, User-Agent) for audit and logging.
 * Uses AsyncLocalStorage so services can access the current request's client IP
 * without passing req through every layer.
 */
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  ip: string | null;
  userAgent: string | null;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContextData>();

export function getRequestContext(): RequestContextData | undefined {
  return asyncLocalStorage.getStore();
}

export function runWithRequestContext<T>(context: RequestContextData, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

export { asyncLocalStorage };
