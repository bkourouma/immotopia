import { matchPath } from 'react-router-dom';
import type { CopilotPageContext } from '../../types/copilot';

const PROPERTY_PATH = '/tenant/:tenantId/properties/:id/*';
const LEASE_PATH = '/tenant/:tenantId/rental/leases/:leaseId/*';

/**
 * Contexte de page transmis au copilote : entité active si la route est une
 * fiche de bien ou de bail. `currentPath` est toujours renvoyé.
 */
export function getCopilotPageContext(pathname: string): CopilotPageContext {
  const context: CopilotPageContext = { currentPath: pathname };

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
