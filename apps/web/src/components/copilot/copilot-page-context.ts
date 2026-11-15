import { matchPath } from 'react-router-dom';
import type { CopilotPageContext } from '../../types/copilot';

const PROPERTY_PATH = '/tenant/:tenantId/properties/:id/*';
const LEASE_PATH = '/tenant/:tenantId/rental/leases/:leaseId/*';
const LIST_FILTERS = new Map<string, readonly string[]>([
  ['properties', ['propertyType', 'transactionMode', 'status', 'minPrice', 'maxPrice', 'minBedrooms', 'maxBedrooms']],
  ['rental/installments', ['status', 'overdue', 'dueFrom', 'dueTo']],
  ['rental/payments', ['status', 'periodeFrom', 'periodeTo', 'method', 'montantMin', 'montantMax']],
  ['rental/leases', ['status']],
  ['sales/mandates', ['status']]
]);

function pathWithListFilters(pathname: string, search: string): string {
  const list = /^\/tenant\/[^/]+\/(.+?)\/?$/.exec(pathname)?.[1];
  const keys = list ? LIST_FILTERS.get(list) : undefined;
  if (!keys) return pathname;
  const source = new URLSearchParams(search);
  const filters = new URLSearchParams();
  for (const key of keys) {
    const value = source.get(key);
    if (value && /^[A-Z0-9_.-]{1,24}$/.test(value)) filters.set(key, value);
  }
  return filters.size ? pathname + '?' + filters.toString() : pathname;
}

/**
 * Contexte de page transmis au copilote : entité active si la route est une
 * fiche de bien ou de bail. Seules les clés structurées d’une liste reconnue
 * peuvent compléter `currentPath`.
 */
export function getCopilotPageContext(pathname: string, search = ''): CopilotPageContext {
  const context: CopilotPageContext = { currentPath: pathWithListFilters(pathname, search) };

  const property = matchPath(PROPERTY_PATH, pathname);
  if (property?.params.id && property.params.id !== 'new') {
    return { ...context, activeEntityType: 'PROPERTY', activeEntityId: property.params.id };
  }

  const lease = matchPath(LEASE_PATH, pathname);
  if (lease?.params.leaseId && lease.params.leaseId !== 'new') {
    return { ...context, activeEntityType: 'LEASE', activeEntityId: lease.params.leaseId };
  }

  return context;
}
